import type { FastifyPluginAsync } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SESSION_COOKIE_NAME } from "../management/infrastructure/http/session-guard.ts";
import { verify } from "../management/infrastructure/http/session-token.ts";

const steps = ["business", "crm", "whatsapp", "rules", "review"] as const;
const statuses = ["pending", "completed", "skipped"] as const;
const setupSchema = z.object({ step: z.enum(steps), status: z.enum(statuses) }).strict();
const tourSchema = z.object({
  status: z.enum(["not_started", "in_progress", "skipped", "completed"]),
  index: z.number().int().min(0).max(6),
}).strict();
const phoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/);
const operationSchema = z.object({ leadPhone: phoneSchema, opportunityId: z.string().uuid() }).strict();
const progressSchema = z.object({
  leadPhone: phoneSchema.nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  opportunityId: z.string().uuid().nullable().optional(),
}).strict();

type Step = (typeof steps)[number];
type StepStatus = (typeof statuses)[number];
type SetupState = Record<Step, StepStatus>;
type Actor = { id: string; admin: boolean; role: "admin" | "manager" | "agent" };

export const registerOnboardingRoutes: FastifyPluginAsync<{
  db: DatabaseSync;
  sessionSecret: string;
  clock?: () => Date;
}> = async (app, { db, sessionSecret, clock = () => new Date() }) => {
  function actorFromCookie(cookie: string): Actor | null {
    const session = verify(cookie, clock(), sessionSecret);
    if (session.status !== "ok") return null;
    const payload = session.payload;
    return { id: payload.userId ?? "administrator", admin: !payload.userId, role: payload.role ?? "admin" };
  }
  function actorOf(request: {cookies?:Record<string,string|undefined>}): Actor | null {
    return actorFromCookie(request.cookies?.[SESSION_COOKIE_NAME] ?? "");
  }
  function setup(): SetupState {
    const result = Object.fromEntries(steps.map(step => [step, "pending"])) as SetupState;
    for (const row of db.prepare("SELECT step,status FROM onboarding_setup_steps").all() as Array<{step:Step;status:StepStatus}>) {
      if (steps.includes(row.step)) result[row.step] = row.status;
    }
    return result;
  }
  function profileConfigured(): boolean {
    const row = db.prepare("SELECT data_json FROM business_profile WHERE id=1").get() as {data_json:string}|undefined;
    if (!row) return false;
    try { const parsed = JSON.parse(row.data_json) as {name?:unknown;segment?:unknown};
      return typeof parsed.name === "string" && parsed.name.trim().length > 0 &&
        typeof parsed.segment === "string" && parsed.segment.trim().length > 0;
    } catch { return false; }
  }
  function tour(actorId: string) {
    const row = db.prepare("SELECT status, step_index AS idx FROM onboarding_tours WHERE actor_id=?").get(actorId) as
      {status:"not_started"|"in_progress"|"skipped"|"completed";idx:number}|undefined;
    return { status: row?.status ?? "not_started", index: row?.idx ?? 0 };
  }
  function firstOperation() {
    const row = db.prepare("SELECT lead_phone AS leadPhone,opportunity_id AS opportunityId,completed_at AS completedAt FROM onboarding_first_operations WHERE id=1").get() as
      {leadPhone:string;opportunityId:string;completedAt:string}|undefined;
    return row ?? null;
  }
  function draft(actorId: string) {
    const row = db.prepare("SELECT lead_phone AS leadPhone,company_id AS companyId,opportunity_id AS opportunityId FROM onboarding_operation_drafts WHERE actor_id=?").get(actorId) as
      {leadPhone:string|null;companyId:string|null;opportunityId:string|null}|undefined;
    return row ?? {leadPhone:null,companyId:null,opportunityId:null};
  }
  function ready(): boolean { return setup().review === "completed"; }
  function recordValidationError(actorId:string,scope:"setup"|"tour"|"first_operation") {
    db.prepare("INSERT INTO onboarding_validation_errors(actor_id,scope,created_at) VALUES(?,?,?)")
      .run(actorId,scope,clock().toISOString());
  }

  app.get("/api/onboarding/state", async (req, reply) => {
    const actor = actorOf(req);
    if (!actor) return reply.code(401).send({error:"unauthorized"});
    return {
      setup: setup(), ready: ready(), profileConfigured: profileConfigured(),
      tour: tour(actor.id), firstOperation: firstOperation(), draft: draft(actor.id), role: actor.role,
    };
  });
  app.put("/api/onboarding/setup", async (req, reply) => {
    const actor = actorOf(req);
    if (!actor) return reply.code(401).send({error:"unauthorized"});
    if (!actor.admin) return reply.code(403).send({error:"Somente o administrador pode configurar a empresa."});
    const input = setupSchema.safeParse(req.body);
    if (!input.success) {recordValidationError(actor.id,"setup");return reply.code(422).send({error:"Etapa inválida"});}
    const {step,status} = input.data;
    if (step === "business" && status === "completed" && !profileConfigured()) {
      recordValidationError(actor.id,"setup");
      return reply.code(409).send({error:"Cadastre o nome e o segmento da empresa antes de concluir."});
    }
    if (step === "rules" && status === "completed" &&
      !db.prepare("SELECT 1 FROM automation_rules WHERE enabled=1 LIMIT 1").get()) {
      recordValidationError(actor.id,"setup");
      return reply.code(409).send({error:"Publique ao menos uma regra validada antes de ativar respostas automáticas."});
    }
    if (step === "review" && status === "completed" &&
      (!profileConfigured() || setup().crm !== "completed")) {
      recordValidationError(actor.id,"setup");
      return reply.code(409).send({error:"Finalize o cadastro da empresa e confirme o funil antes de concluir."});
    }
    db.prepare("INSERT INTO onboarding_setup_steps(step,status,updated_at) VALUES(?,?,?) ON CONFLICT(step) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at")
      .run(step,status,clock().toISOString());
    return {setup:setup(),ready:ready()};
  });
  app.put("/api/onboarding/tour", async (req, reply) => {
    const actor = actorOf(req);
    if (!actor) return reply.code(401).send({error:"unauthorized"});
    const input = tourSchema.safeParse(req.body);
    if (!input.success) {recordValidationError(actor.id,"tour");return reply.code(422).send({error:"Progresso do tour inválido"});}
    db.prepare("INSERT INTO onboarding_tours(actor_id,status,step_index,updated_at) VALUES(?,?,?,?) ON CONFLICT(actor_id) DO UPDATE SET status=excluded.status,step_index=excluded.step_index,updated_at=excluded.updated_at")
      .run(actor.id,input.data.status,input.data.index,clock().toISOString());
    return tour(actor.id);
  });
  app.put("/api/onboarding/first-operation/progress", async (req, reply) => {
    const actor = actorOf(req);
    if (!actor) return reply.code(401).send({error:"unauthorized"});
    const input = progressSchema.safeParse(req.body);
    if (!input.success) {recordValidationError(actor.id,"first_operation");return reply.code(422).send({error:"Dados inválidos"});}
    const previous = draft(actor.id);
    const next = { ...previous, ...input.data };
    if (next.leadPhone && !db.prepare("SELECT 1 FROM leads WHERE phone=?").get(next.leadPhone)) {
      recordValidationError(actor.id,"first_operation");
      return reply.code(422).send({error:"Lead não cadastrado"});
    }
    if (next.companyId && !db.prepare("SELECT 1 FROM crm_companies WHERE id=?").get(next.companyId)) {
      recordValidationError(actor.id,"first_operation");
      return reply.code(422).send({error:"Empresa não cadastrada"});
    }
    if (next.opportunityId && !db.prepare("SELECT 1 FROM crm_opportunities WHERE id=? AND lead_phone=? AND company_id=?").get(next.opportunityId,next.leadPhone,next.companyId)) {
      recordValidationError(actor.id,"first_operation");
      return reply.code(422).send({error:"Oportunidade não corresponde ao lead e à empresa"});
    }
    db.prepare("INSERT INTO onboarding_operation_drafts(actor_id,lead_phone,company_id,opportunity_id,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(actor_id) DO UPDATE SET lead_phone=excluded.lead_phone,company_id=excluded.company_id,opportunity_id=excluded.opportunity_id,updated_at=excluded.updated_at")
      .run(actor.id,next.leadPhone,next.companyId,next.opportunityId,clock().toISOString());
    return draft(actor.id);
  });
  app.post("/api/onboarding/first-operation", async (req, reply) => {
    const actor = actorOf(req);
    if (!actor) return reply.code(401).send({error:"unauthorized"});
    const input = operationSchema.safeParse(req.body);
    if (!input.success) return reply.code(422).send({error:"Dados inválidos"});
    const {leadPhone,opportunityId} = input.data;
    if (!db.prepare("SELECT 1 FROM crm_opportunities o JOIN leads l ON l.phone=o.lead_phone WHERE o.id=? AND o.lead_phone=?").get(opportunityId,leadPhone)) {
      recordValidationError(actor.id,"first_operation");
      return reply.code(422).send({error:"Oportunidade não vinculada ao lead canônico"});
    }
    const existing = firstOperation();
    if (existing && (existing.leadPhone !== leadPhone || existing.opportunityId !== opportunityId))
      return reply.code(409).send({error:"A primeira operação desta instalação já foi concluída"});
    if (!existing) db.prepare("INSERT INTO onboarding_first_operations(id,lead_phone,opportunity_id,completed_at) VALUES(1,?,?,?)").run(leadPhone,opportunityId,clock().toISOString());
    return firstOperation();
  });
  app.get("/api/onboarding/analytics", async (req, reply) => {
    const actor = actorOf(req);
    if (!actor) return reply.code(401).send({error:"unauthorized"});
    if (!actor.admin) return reply.code(403).send({error:"forbidden"});
    const tours = db.prepare("SELECT status,COUNT(*) AS total FROM onboarding_tours GROUP BY status").all() as Array<{status:string;total:number}>;
    const firstOperations = db.prepare("SELECT COUNT(*) AS total FROM onboarding_first_operations").get() as {total:number};
    const validationErrors = db.prepare("SELECT COUNT(*) AS total FROM onboarding_validation_errors").get() as {total:number};
    const skippedSteps = Object.values(setup()).filter(status=>status==="skipped").length;
    return { setup: setup(), ready: ready(), firstOperations: firstOperations.total,
      validationErrors: validationErrors.total, skippedSteps,
      tours: Object.fromEntries(tours.map(item => [item.status,item.total])),
      profileConfigured: profileConfigured() };
  });
};

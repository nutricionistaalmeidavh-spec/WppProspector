export const OPPORTUNITY_STAGES = [
  "new",
  "contacted",
  "replied",
  "qualified",
  "meeting",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_STAGE_LABEL: Record<OpportunityStage, string> = {
  new: "Novo",
  contacted: "Contatado",
  replied: "Respondeu",
  qualified: "Qualificado",
  meeting: "Reunião / demo",
  proposal: "Proposta",
  negotiation: "Negociação",
  won: "Ganho",
  lost: "Perdido",
};

export interface Opportunity {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  leadName: string;
  leadPhone: string;
  stage: OpportunityStage;
  estimatedValue: number;
  owner: string;
  nextAction: string;
  nextActionAt: string;
  campaignId?: string;
  campaignName?: string;
  awaitingHuman?: boolean;
  qualification?: string;
  source?: string;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  city: string;
  segment: string;
  leadCount: number;
  opportunityCount: number;
  pipelineValue: number;
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: "draft" | "running" | "paused" | "completed";
  audience: number;
  sent: number;
  replied: number;
  qualified: number;
  opportunities: number;
  won: number;
  failed: number;
  startedAt?: string;
}

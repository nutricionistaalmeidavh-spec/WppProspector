import { ArrowRight, GitBranchPlus, MessageSquare, Workflow } from "lucide-react";

type EventType="message.received"|"crm.opportunity_updated"|"commerce.inventory_updated";
type Action="reply"|"menu"|"handoff"|"crm_set_stage";
export interface RuleFlowModel {
 eventType:EventType;action:Action;trigger:string;conditionCount:number;combine:"all"|"any"|null;
}
export function RuleFlowDesigner({value,onEventChange,onActionChange}:{value:RuleFlowModel;
 onEventChange:(value:EventType)=>void;onActionChange:(value:Action)=>void}) {
 return <section className="rounded-xl border bg-muted/20 p-3" aria-label="Fluxo visual da regra">
   <p className="mb-3 text-xs font-semibold">Construtor visual: evento → condição → ação</p>
   <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
     <div className="min-w-0 flex-1 space-y-1 rounded-lg border bg-card p-2">
       <p className="flex items-center gap-1 text-xs font-semibold"><Workflow className="h-4 w-4"/>Evento</p>
       <select aria-label="Evento do fluxo visual" className="h-9 w-full rounded border bg-background px-2 text-xs"
         value={value.eventType} onChange={e=>onEventChange(e.target.value as EventType)}>
         <option value="message.received">Mensagem recebida</option>
         <option value="crm.opportunity_updated">Atualização de oportunidade</option>
         <option value="commerce.inventory_updated">Atualização de estoque</option>
       </select>
     </div>
     <ArrowRight className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true"/>
     <div className="min-w-0 flex-1 space-y-1 rounded-lg border bg-card p-2">
       <p className="flex items-center gap-1 text-xs font-semibold"><GitBranchPlus className="h-4 w-4"/>Condição</p>
       <p className="min-h-9 truncate rounded border bg-background px-2 py-2 text-xs" title={value.trigger||"Sem disparador"}>
         {value.conditionCount>0?value.conditionCount+" critérios "+(value.combine==="any"?"(OU)":"(E)"):(value.trigger||"Sem disparador")}
       </p>
     </div>
     <ArrowRight className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true"/>
     <div className="min-w-0 flex-1 space-y-1 rounded-lg border bg-card p-2">
       <p className="flex items-center gap-1 text-xs font-semibold"><MessageSquare className="h-4 w-4"/>Ação</p>
       <select aria-label="Ação do fluxo visual" className="h-9 w-full rounded border bg-background px-2 text-xs"
         value={value.action} onChange={e=>onActionChange(e.target.value as Action)}>
         <option value="reply">Responder</option>
         <option value="menu" disabled={value.eventType!=="message.received"}>Menu</option>
         <option value="handoff">Transferir ao humano</option>
         <option value="crm_set_stage" disabled={value.eventType!=="crm.opportunity_updated"}>Mover etapa</option>
       </select>
     </div>
   </div>
   <p className="mt-2 text-xs text-muted-foreground">Ajuste os detalhes nos campos abaixo. O diagrama usa o mesmo rascunho da regra; não executa nem publica mensagens.</p>
 </section>;
}

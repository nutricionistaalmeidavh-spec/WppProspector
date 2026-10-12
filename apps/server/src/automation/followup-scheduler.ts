import type { SqliteConsentStore } from "../whatsapp-connectivity/infrastructure/persistence/sqlite-consent-store.ts";
import type { AutomationStore } from "./automation-store.ts";

/** Trabalho agendado somente para contatos que continuam com consentimento vigente. */
export class FollowupScheduler {
  private running=false;
  constructor(
    private readonly store:AutomationStore,
    private readonly consent:SqliteConsentStore,
    private readonly send:(input:{to:string;body:string})=>Promise<unknown>,
  ){}
  async runDue():Promise<void>{
    if(this.running)return;
    this.running=true;
    try{
      for(const task of this.store.due()){
        if(!this.store.claim(task.id))continue;
        if(!this.consent.canProspect(task.phone)){
          this.store.cancelFollowup(task.id);
          continue;
        }
        try{
          await this.send({to:task.phone,body:task.message});
          this.store.markSent(task.id);
        }catch(err){
          this.store.markFailure(task.id,err);
        }
      }
    }finally{this.running=false;}
  }
}

import {describe,expect,it,vi} from "vitest";
import {openDatabase} from "../../../shared/persistence/sqlite/open-database.ts";
import {OutboundTextMessage} from "../../domain/outbound-text-message.ts";
import {SqliteConsentStore} from "../persistence/sqlite-consent-store.ts";
import {SqliteOutbox} from "../persistence/sqlite-outbox.ts";
import {DurableWhatsappGateway} from "./durable-whatsapp.gateway.ts";

describe("P0 outbox de follow-up idempotente",()=>{
  it("reutiliza operationId persistido, não reenvia job concluído e bloqueia colisões",async()=>{
    const db=openDatabase(":memory:");
    try{
      const outbox=new SqliteOutbox(db),consent=new SqliteConsentStore(db);
      const provider={sendTextMessage:vi.fn(async()=>({wamid:"wamid-qa"})),
        sendTemplateMessage:vi.fn(async()=>({wamid:"template-qa"}))};
      const gateway=new DurableWhatsappGateway(provider,outbox,consent);
      const message=OutboundTextMessage.create({to:"+5516999999999",body:"Mensagem de teste"});
      const first=await gateway.sendTextWithOperationId(message,"followup-qa-0001");
      const again=await gateway.sendTextWithOperationId(message,"followup-qa-0001");
      expect(first).toEqual(again);
      expect(provider.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(outbox.get("followup-qa-0001")?.state).toBe("sent");
      await expect(gateway.sendTextWithOperationId(
        OutboundTextMessage.create({to:"+5516999999999",body:"Texto diferente"}),
        "followup-qa-0001")).rejects.toThrow(/outra operação/);
    }finally{db.close();}
  });
});

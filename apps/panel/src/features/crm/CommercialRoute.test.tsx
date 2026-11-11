import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installFetchMock, renderWithProviders, restoreFetch } from "@/test/harness";
import { CommercialRoute } from "./CommercialRoute";

afterEach(restoreFetch);

describe("CRM comercial", () => {
  it("usa somente APIs reais para converter o lead e criar orçamento", async () => {
    const { calls } = installFetchMock({
      "GET /capabilities": { body: { conversationActions:true, prospecting:true,
        crm:{opportunities:true,companies:true,campaigns:true} } },
      "GET /crm/opportunities": { body: { items: [{
        id:"opp-1",title:"Sistema",companyId:"co-1",companyName:"ArtiSys",
        leadName:"Lead",leadPhone:"+5516999999999",stage:"qualified",
        estimatedValue:500,owner:"Comercial",nextAction:"",nextActionAt:"",createdAt:"2026-11-11",
      }] } },
      "GET /crm/customers": { body: { items:[] } },
      "GET /crm/quotes": { body: { items:[] } },
      "GET /crm/activities": { body: { items:[] } },
      "GET /crm/analytics/commercial": { body: { total:1,won:0,openValue:500,
        weightedValue:0,overdueActivities:0,byOwner:[],bySource:[] } },
      "POST /crm/customers/convert": { body: {id:"customer-1",name:"Lead",leadPhone:"+5516999999999"} },
      "POST /crm/quotes": {body:{id:"quote-1",totalCents:10000,items:[]}},
    });

    renderWithProviders(<CommercialRoute />);
    expect(await screen.findByText("CRM comercial")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button",{name:"Converter lead selecionado"}));
    await waitFor(()=>expect(calls.some(call=>call.method==="POST" &&
      new URL(call.url).pathname.endsWith("/crm/customers/convert"))).toBe(true));
    await userEvent.type(screen.getByLabelText("Descrição do item 1"),"Instalação");
    await userEvent.clear(screen.getByLabelText("Valor unitário do item 1"));
    await userEvent.type(screen.getByLabelText("Valor unitário do item 1"),"100");
    await userEvent.click(screen.getByRole("button",{name:"Criar orçamento"}));
    await waitFor(()=>expect(calls.some(call=>call.method==="POST" &&
      new URL(call.url).pathname.endsWith("/crm/quotes"))).toBe(true));
  });
});

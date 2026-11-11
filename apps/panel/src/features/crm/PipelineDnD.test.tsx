import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { installFetchMock, renderWithProviders, restoreFetch } from "@/test/harness";
import { PipelineRoute } from "./CrmRoutes";

afterEach(restoreFetch);

describe("Pipeline comercial", () => {
  it("persiste movimentação por drop e preserva navegação mobile pelo seletor", async () => {
    const { calls }=installFetchMock({
      "GET /capabilities":{body:{conversationActions:true,prospecting:true,
        crm:{opportunities:true,companies:true,campaigns:true}}},
      "GET /crm/opportunities":{body:{items:[{
        id:"00000000-0000-4000-8000-000000000001",title:"Projeto",companyId:"company-1",
        companyName:"ArtiSys Teste",leadName:"Contato",leadPhone:"+5516999999999",
        stage:"new",estimatedValue:300,owner:"Comercial",nextAction:"",nextActionAt:"",createdAt:"2026-11-11",
      }]}},
      "GET /crm/companies":{body:{items:[]}},
      "GET /crm/campaigns":{body:{items:[]}},
      "PATCH /crm/opportunities/00000000-0000-4000-8000-000000000001":{body:{id:"00000000-0000-4000-8000-000000000001",stage:"proposal"}},
    });
    renderWithProviders(<MemoryRouter><PipelineRoute/></MemoryRouter>);
    expect(await screen.findByText("ArtiSys Teste")).toBeInTheDocument();
    const destination=screen.getByRole("region",{name:"Mover para Proposta"});
    const dataTransfer={getData:()=> "00000000-0000-4000-8000-000000000001",setData:()=>{}};
    fireEvent.dragOver(destination,{dataTransfer});
    fireEvent.drop(destination,{dataTransfer});
    await waitFor(()=>expect(calls.some(call=>call.method==="PATCH"&&
      new URL(call.url).pathname.endsWith("/crm/opportunities/00000000-0000-4000-8000-000000000001"))).toBe(true));
    expect(screen.getByLabelText("Mover etapa de Projeto")).toBeInTheDocument();
  });
});

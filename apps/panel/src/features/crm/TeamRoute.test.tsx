import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installFetchMock, renderWithProviders, restoreFetch } from "@/test/harness";
import { TeamRoute } from "./TeamRoute";
afterEach(restoreFetch);

describe("Gestão de operadores",()=>{
  it("exibe operadores reais e cadastra nova conta com perfil",async()=>{
    const {calls}=installFetchMock({
      "GET /team/users":{body:{items:[{id:"u1",username:"comercial",role:"agent",active:true,version:1}]}},
      "POST /team/users":{body:{id:"u2",username:"gestor",role:"manager",active:true,version:1}},
    });
    renderWithProviders(<TeamRoute/>);
    expect(await screen.findByText("comercial")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Usuário da equipe"),"gestor");
    await userEvent.type(screen.getByLabelText("Senha da equipe"),"SenhaForte!2026");
    await userEvent.selectOptions(screen.getByLabelText("Perfil da equipe"),"manager");
    await userEvent.click(screen.getByRole("button",{name:"Adicionar operador"}));
    await waitFor(()=>expect(calls.some(c=>c.method==="POST"&&new URL(c.url).pathname.endsWith("/team/users"))).toBe(true));
  });
});

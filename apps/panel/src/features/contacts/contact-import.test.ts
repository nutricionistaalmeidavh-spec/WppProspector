import { describe, expect, it } from "vitest";
import { parseContactFile } from "./contact-import.ts";

describe("importação local de contatos", () => {
  it("lê CSV brasileiro delimitado por ponto e vírgula, remove duplicações e não inventa DDI", () => {
    const result = parseContactFile('Nome;Telefone\n"Cliente; Teste";+55 (16) 99999-9999\nIncompleto;16999999999\n"Cliente; Teste";+5516999999999');
    expect(result.contacts).toEqual([{ phone: "+5516999999999", displayName: "Cliente; Teste" }]);
    expect(result.rejected).toBe(1);
  });
  it("lê vCard com waid e FN mantendo identidade E.164", () => {
    const result = parseContactFile("BEGIN:VCARD\nVERSION:3.0\nFN:Joana Teste\nTEL;TYPE=CELL;waid=5516888888888:+55 16 88888-8888\nEND:VCARD");
    expect(result.contacts).toEqual([{phone:"+5516888888888",displayName:"Joana Teste"}]);
  });
});

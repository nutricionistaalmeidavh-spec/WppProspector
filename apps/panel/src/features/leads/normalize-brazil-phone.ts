/**
 * Cópia TS pura (sem dependência de runtime Node) da regra de normalização de
 * telefone BR → E.164 do servidor (`whatsapp-connectivity/domain/brazil-phone.ts`,
 * design D2). Usada só para o preview da importação — o servidor revalida cada
 * telefone como fonte da verdade.
 */
export type BrazilPhoneRejection = "vazio" | "curto" | "longo" | "fixo" | "invalido";

export type NormalizeBrazilPhoneResult =
  | { phone: string }
  | { rejected: BrazilPhoneRejection };

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export function normalizeBrazilPhone(raw: string | null | undefined): NormalizeBrazilPhoneResult {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 0) {
    return { rejected: "vazio" };
  }

  const national = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;

  if (national.length < 10) return { rejected: "curto" };
  if (national.length > 11) return { rejected: "longo" };
  if (national.length === 10) return { rejected: "fixo" };

  const e164 = `+55${national}`;
  if (!E164_REGEX.test(e164)) return { rejected: "invalido" };
  return { phone: e164 };
}

/** Rótulo curto e legível para cada motivo de rejeição. */
export const REJECTION_LABEL: Record<BrazilPhoneRejection, string> = {
  vazio: "sem telefone",
  curto: "telefone incompleto",
  longo: "dígitos a mais",
  fixo: "telefone fixo (não celular)",
  invalido: "telefone inválido",
};

import { z } from "zod";

/**
 * Resultado de `GET /admin/api/capabilities` — quais famílias de ação da
 * superfície `/admin/api/` estão montadas neste deploy. A UI usa isto para
 * exibir ou ocultar afordâncias sem tentar as rotas e tratar `404`.
 */
export const capabilitiesSchema = z.object({
  conversationActions: z.boolean(),
  prospecting: z.boolean(),
  crm: z.object({ opportunities: z.boolean(), companies: z.boolean(), campaigns: z.boolean() }).optional(),
});

export type Capabilities = z.infer<typeof capabilitiesSchema>;

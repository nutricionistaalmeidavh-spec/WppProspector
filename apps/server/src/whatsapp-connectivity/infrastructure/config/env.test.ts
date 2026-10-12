import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.ts";

const meta = {
  WHATSAPP_PROVIDER: "meta",
  META_ACCESS_TOKEN: "tok", META_APP_SECRET: "sec", META_PHONE_NUMBER_ID: "pn",
  META_WABA_ID: "waba", META_WEBHOOK_VERIFY_TOKEN: "verify",
};

describe("loadEnv", () => {
  it("não requer Meta no núcleo Baileys", () => {
    const env = loadEnv({});
    expect(env.WHATSAPP_PROVIDER).toBe("baileys");
    expect(env.HOST).toBe("127.0.0.1");
  });
  it("requer os cinco segredos quando Meta é escolhida", () => {
    expect(() => loadEnv({ WHATSAPP_PROVIDER: "meta" })).toThrow(/META_ACCESS_TOKEN/);
    expect(loadEnv(meta).META_ACCESS_TOKEN).toBe("tok");
  });
  it("mantém configurações de métricas", () => {
    expect(loadEnv(meta).WHATSAPP_COST_TRACKING_ENABLED).toBe(true);
    expect(loadEnv({ ...meta, WHATSAPP_COST_TRACKING_ENABLED: "false" }).WHATSAPP_COST_TRACKING_ENABLED).toBe(false);
    expect(loadEnv({ ...meta, WHATSAPP_BILLING_COUNTRY: "us" }).WHATSAPP_BILLING_COUNTRY).toBe("US");
    expect(() => loadEnv({ ...meta, WHATSAPP_BILLING_COUNTRY: "BRA" })).toThrow();
  });
});

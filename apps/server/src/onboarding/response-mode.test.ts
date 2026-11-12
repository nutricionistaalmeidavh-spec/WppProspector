import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { automaticRepliesEnabled } from "./response-mode.ts";

describe("WhatsApp manual e opt-in do motor de respostas", () => {
  it("instalação nova recebe mensagens sem resposta automática; regras só ligam após aprovação", () => {
    const db=new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE onboarding_setup_steps(step TEXT PRIMARY KEY,status TEXT NOT NULL);");
      db.exec("CREATE TABLE automation_rules(enabled INTEGER NOT NULL);");
      db.exec("CREATE TABLE business_profile(id INTEGER PRIMARY KEY);");
      db.exec("CREATE TABLE leads(phone TEXT PRIMARY KEY);");
      expect(automaticRepliesEnabled(db)).toBe(false);
      db.exec("INSERT INTO onboarding_setup_steps VALUES ('business','completed')");
      expect(automaticRepliesEnabled(db)).toBe(false);
      db.exec("INSERT INTO onboarding_setup_steps VALUES ('rules','skipped')");
      expect(automaticRepliesEnabled(db)).toBe(false);
      db.exec("UPDATE onboarding_setup_steps SET status='completed' WHERE step='rules'");
      expect(automaticRepliesEnabled(db)).toBe(false);
      db.exec("INSERT INTO automation_rules VALUES (1)");
      expect(automaticRepliesEnabled(db)).toBe(true);
      db.exec("UPDATE onboarding_setup_steps SET status='skipped' WHERE step='rules'");
      expect(automaticRepliesEnabled(db)).toBe(false);
    } finally { db.close(); }
  });
  it("instalações anteriores com informações persistidas não perdem automação no upgrade", () => {
    const db=new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE onboarding_setup_steps(step TEXT PRIMARY KEY,status TEXT NOT NULL);");
      db.exec("CREATE TABLE automation_rules(enabled INTEGER NOT NULL);");
      db.exec("CREATE TABLE business_profile(id INTEGER PRIMARY KEY);");
      db.exec("CREATE TABLE leads(phone TEXT PRIMARY KEY);");
      db.exec("INSERT INTO business_profile(id) VALUES(1)");
      expect(automaticRepliesEnabled(db)).toBe(true);
    } finally {db.close();}
  });
});

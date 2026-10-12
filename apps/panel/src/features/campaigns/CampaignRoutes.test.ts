import { describe,expect,it } from "vitest";
import { campaignPercent } from "./CampaignRoutes";

describe("campaignPercent",()=>{
  it("não mostra NaN ou infinito para campanhas sem público",()=>{
    expect(campaignPercent(0,0)).toBe(0);
    expect(campaignPercent(1,4)).toBe(25);
  });
});

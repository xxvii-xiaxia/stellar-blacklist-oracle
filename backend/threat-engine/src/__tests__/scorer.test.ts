import { scoreAsset } from "../scorer";

describe("scoreAsset", () => {
  it("flags known phishing domain", () => {
    const r = scoreAsset({
      asset_code: "USDC",
      asset_issuer: "GBAD123",
      home_domain: "phishing.example.com",
    });
    expect(r.blacklisted).toBe(true);
    expect(r.flags).toContain("known_phishing_domain");
    expect(r.risk_score).toBeGreaterThanOrEqual(70);
  });

  it("flags spoofed high-value asset from unknown issuer", () => {
    const r = scoreAsset({
      asset_code: "USDC",
      asset_issuer: "GUNKNOWN123",
      home_domain: "legit-looking.com",
    });
    expect(r.flags).toContain("spoofed_high_value_asset");
    expect(r.risk_score).toBeGreaterThanOrEqual(50);
  });

  it("low score for unknown asset with domain", () => {
    const r = scoreAsset({
      asset_code: "MYTOKEN",
      asset_issuer: "GSOME123",
      home_domain: "myproject.io",
    });
    expect(r.blacklisted).toBe(false);
    expect(r.risk_score).toBeLessThan(70);
  });

  it("adds no_home_domain flag when domain is null", () => {
    const r = scoreAsset({
      asset_code: "MYTOKEN",
      asset_issuer: "GSOME123",
      home_domain: null,
    });
    expect(r.flags).toContain("no_home_domain");
  });
});

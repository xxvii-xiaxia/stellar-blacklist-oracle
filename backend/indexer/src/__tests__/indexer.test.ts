import { AssetEvent } from "../index";

describe("AssetEvent shape", () => {
  it("has required fields", () => {
    const e: AssetEvent = {
      asset_code: "USDC",
      asset_issuer: "GABC123",
      home_domain: "centre.io",
      ledger: 1000,
      created_at: new Date().toISOString(),
    };
    expect(e.asset_code).toBe("USDC");
    expect(e.asset_issuer).toBe("GABC123");
  });
});

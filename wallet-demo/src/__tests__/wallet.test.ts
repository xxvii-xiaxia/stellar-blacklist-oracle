import { guardTrustline, guardPayment } from "../index";
import { OracleClient } from "@stellar-oracle/sdk";

function makeMockOracle(result: Partial<ReturnType<OracleClient["checkIssuer"]> extends Promise<infer T> ? T : never>) {
  return {
    checkIssuer: jest.fn().mockResolvedValue(result),
    subscribeUpdates: jest.fn(),
  } as unknown as OracleClient;
}

describe("wallet guards", () => {
  it("blocks high-risk issuer", async () => {
    const oracle = makeMockOracle({
      issuer: "GBAD",
      blacklisted: true,
      risk_score: 92,
      flags: ["spoofed_high_value_asset"],
    });
    const r = await guardTrustline({ code: "USDC", issuer: "GBAD" }, 70, oracle);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("risk_score=92");
  });

  it("allows low-risk issuer", async () => {
    const oracle = makeMockOracle({
      issuer: "GGOOD",
      blacklisted: false,
      risk_score: 5,
      flags: [],
    });
    const r = await guardPayment({ code: "MYTOKEN", issuer: "GGOOD" }, 70, oracle);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeUndefined();
  });
});

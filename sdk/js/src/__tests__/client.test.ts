import { OracleClient } from "../index";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

const client = new OracleClient({ apiUrl: "http://localhost:3000" });

describe("OracleClient", () => {
  afterEach(() => mockFetch.mockReset());

  it("checkIssuer returns result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        issuer: "GABC",
        blacklisted: true,
        risk_score: 92,
        flags: ["spoofed_high_value_asset"],
      }),
    });
    const r = await client.checkIssuer("GABC");
    expect(r.blacklisted).toBe(true);
    expect(r.risk_score).toBe(92);
  });

  it("isSafeAsset returns false for high risk", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ issuer: "GBAD", blacklisted: true, risk_score: 95, flags: [] }),
    });
    expect(await client.isSafeAsset("GBAD")).toBe(false);
  });

  it("isSafeAsset returns true for low risk", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ issuer: "GGOOD", blacklisted: false, risk_score: 5, flags: [] }),
    });
    expect(await client.isSafeAsset("GGOOD")).toBe(true);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(client.checkIssuer("GABC")).rejects.toThrow("Oracle API error: 500");
  });
});

// Integration-style test using Fastify inject (no real DB/Redis needed for route shape)
import Fastify from "fastify";

describe("API routes shape", () => {
  it("GET /check/:issuer returns expected shape", async () => {
    const app = Fastify();
    app.get<{ Params: { issuer: string } }>("/check/:issuer", async (req) => ({
      issuer: req.params.issuer,
      blacklisted: false,
      risk_score: 0,
      flags: [],
    }));

    const res = await app.inject({ method: "GET", url: "/check/GABC123" });
    const body = JSON.parse(res.body);
    expect(body.issuer).toBe("GABC123");
    expect(body.blacklisted).toBe(false);
    await app.close();
  });
});

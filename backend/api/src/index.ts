import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { Pool } from "pg";
import { createClient } from "redis";
import "dotenv/config";

const app = Fastify({ logger: true });
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redisSub = createClient({ url: process.env.REDIS_URL });

app.register(websocket);

// GET /check/:issuer
app.get<{ Params: { issuer: string } }>("/check/:issuer", async (req, reply) => {
  const { issuer } = req.params;
  const { rows } = await db.query(
    "SELECT * FROM threat_results WHERE issuer=$1",
    [issuer]
  );
  if (!rows.length) {
    return reply.send({ issuer, blacklisted: false, risk_score: 0, flags: [] });
  }
  const r = rows[0];
  return reply.send({
    issuer: r.issuer,
    blacklisted: r.blacklisted,
    risk_score: r.risk_score,
    flags: r.flags,
    last_updated: r.updated_at,
  });
});

// GET /check-domain/:domain
app.get<{ Params: { domain: string } }>("/check-domain/:domain", async (req, reply) => {
  const { domain } = req.params;
  const { rows } = await db.query(
    `SELECT * FROM asset_events WHERE home_domain=$1
     ORDER BY created_at DESC LIMIT 1`,
    [domain]
  );
  if (!rows.length) {
    return reply.send({ domain, known: false });
  }
  const issuerRow = await db.query(
    "SELECT * FROM threat_results WHERE issuer=$1",
    [rows[0].asset_issuer]
  );
  return reply.send({
    domain,
    known: true,
    issuer: rows[0].asset_issuer,
    ...(issuerRow.rows[0] ?? { blacklisted: false, risk_score: 0 }),
  });
});

// WebSocket: SUBSCRIBE blacklist_updates
app.register(async (fastify) => {
  fastify.get("/ws", { websocket: true }, (connection) => {
    const ws = connection.socket;
    const handler = (msg: string) => {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    };
    redisSub.subscribe("blacklist_updates", handler).catch(console.error);
    ws.on("close", () => {
      redisSub.unsubscribe("blacklist_updates", handler).catch(console.error);
    });
  });
});

export async function startApi() {
  await redisSub.connect();
  const port = parseInt(process.env.PORT ?? "3000");
  await app.listen({ port, host: "0.0.0.0" });
}

export { app };

startApi().catch(console.error);

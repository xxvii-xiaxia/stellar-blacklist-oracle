import { createClient } from "redis";
import { Pool } from "pg";
import { scoreAsset, ThreatInput } from "./scorer";
import "dotenv/config";

const redis = createClient({ url: process.env.REDIS_URL });
const redisPub = createClient({ url: process.env.REDIS_URL });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS threat_results (
      issuer TEXT PRIMARY KEY,
      risk_score INTEGER NOT NULL,
      flags TEXT[] NOT NULL,
      blacklisted BOOLEAN NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function handleEvent(raw: string) {
  const input: ThreatInput = JSON.parse(raw);
  const result = scoreAsset(input);

  await db.query(
    `INSERT INTO threat_results(issuer, risk_score, flags, blacklisted, updated_at)
     VALUES($1,$2,$3,$4,NOW())
     ON CONFLICT(issuer) DO UPDATE
       SET risk_score=$2, flags=$3, blacklisted=$4, updated_at=NOW()`,
    [result.issuer, result.risk_score, result.flags, result.blacklisted]
  );

  if (result.blacklisted) {
    await redisPub.publish("blacklist_updates", JSON.stringify(result));
    console.log(`[threat-engine] blacklisted ${result.issuer} score=${result.risk_score}`);
  }
}

export async function startThreatEngine() {
  await redis.connect();
  await redisPub.connect();
  await migrate();

  await redis.subscribe("asset_events", (msg) => {
    handleEvent(msg).catch(console.error);
  });

  console.log("[threat-engine] listening for asset_events");
}

startThreatEngine().catch(console.error);

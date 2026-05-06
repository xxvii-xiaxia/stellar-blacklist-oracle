import { createClient } from "redis";
import { signPayload, hasConsensus, BlacklistPayload } from "./signer";
import "dotenv/config";

const redis = createClient({ url: process.env.REDIS_URL });

const VALIDATOR_SECRET = process.env.ORACLE_PRIVATE_KEY!;
const VALIDATOR_THRESHOLD = parseInt(process.env.VALIDATOR_THRESHOLD ?? "1");

async function handleBlacklistUpdate(raw: string) {
  const result = JSON.parse(raw);
  const payload: BlacklistPayload = {
    issuer: result.issuer,
    domain: result.domain ?? "",
    risk_score: result.risk_score,
    timestamp: Math.floor(Date.now() / 1000),
  };

  const signature = signPayload(payload, VALIDATOR_SECRET);
  console.log(`[oracle-signer] signed payload for ${payload.issuer}: ${signature.slice(0, 20)}...`);

  // In production: collect signatures from other validators via P2P,
  // then submit to Soroban contract once threshold is met.
  // For now, emit signed payload to Redis for aggregation.
  await redis.publish(
    "signed_payloads",
    JSON.stringify({ payload, signature, publicKey: "" /* derived from secret */ })
  );
}

export async function startOracleSigner() {
  if (!VALIDATOR_SECRET) {
    console.warn("[oracle-signer] ORACLE_PRIVATE_KEY not set, skipping");
    return;
  }
  await redis.connect();
  await redis.subscribe("blacklist_updates", (msg) => {
    handleBlacklistUpdate(msg).catch(console.error);
  });
  console.log("[oracle-signer] listening for blacklist_updates");
}

startOracleSigner().catch(console.error);

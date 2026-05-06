import { Keypair, hash } from "@stellar/stellar-sdk";
import { createClient } from "redis";
import "dotenv/config";

const redis = createClient({ url: process.env.REDIS_URL });
const redisPub = createClient({ url: process.env.REDIS_URL });

const SECRET = process.env.ORACLE_PRIVATE_KEY!;
const THRESHOLD = parseInt(process.env.VALIDATOR_THRESHOLD ?? "1");

// In production: load from config/registry
const KNOWN_VALIDATORS: string[] = (process.env.VALIDATOR_PUBKEYS ?? "").split(",").filter(Boolean);

interface SignedPayload {
  payload: {
    issuer: string;
    domain: string;
    risk_score: number;
    timestamp: number;
  };
  signature: string;
  publicKey: string;
}

// Aggregate signatures per issuer
const sigMap = new Map<string, SignedPayload[]>();

function signPayload(payload: SignedPayload["payload"]): string {
  const kp = Keypair.fromSecret(SECRET);
  const data = Buffer.from(JSON.stringify(payload));
  const h = Buffer.from(hash(data));
  return kp.sign(h).toString("base64");
}

function verifySignature(payload: SignedPayload["payload"], sig: string, pubKey: string): boolean {
  try {
    const kp = Keypair.fromPublicKey(pubKey);
    const data = Buffer.from(JSON.stringify(payload));
    const h = Buffer.from(hash(data));
    return kp.verify(h, Buffer.from(sig, "base64"));
  } catch {
    return false;
  }
}

async function handleSignedPayload(raw: string) {
  const sp: SignedPayload = JSON.parse(raw);
  const { issuer } = sp.payload;

  // Validate signature
  if (!verifySignature(sp.payload, sp.signature, sp.publicKey)) {
    console.warn(`[validator] invalid signature from ${sp.publicKey}`);
    return;
  }

  const sigs = sigMap.get(issuer) ?? [];
  // Deduplicate by publicKey
  if (!sigs.find((s) => s.publicKey === sp.publicKey)) {
    sigs.push(sp);
    sigMap.set(issuer, sigs);
  }

  const validCount = sigs.filter((s) =>
    KNOWN_VALIDATORS.length === 0 || KNOWN_VALIDATORS.includes(s.publicKey)
  ).length;

  if (validCount >= THRESHOLD) {
    console.log(`[validator] consensus reached for ${issuer} (${validCount}/${THRESHOLD})`);
    // Emit for oracle-signer to submit on-chain
    await redisPub.publish("consensus_reached", JSON.stringify(sp.payload));
    sigMap.delete(issuer);
  }
}

export async function startValidator() {
  if (!SECRET) {
    console.warn("[validator] ORACLE_PRIVATE_KEY not set");
    return;
  }
  await redis.connect();
  await redisPub.connect();

  // Sign our own payloads when blacklist_updates arrive
  await redis.subscribe("blacklist_updates", async (msg) => {
    const result = JSON.parse(msg);
    const payload = {
      issuer: result.issuer,
      domain: result.domain ?? "",
      risk_score: result.risk_score,
      timestamp: Math.floor(Date.now() / 1000),
    };
    const kp = Keypair.fromSecret(SECRET);
    const signature = signPayload(payload);
    await redisPub.publish(
      "signed_payloads",
      JSON.stringify({ payload, signature, publicKey: kp.publicKey() })
    );
  });

  // Aggregate incoming signed payloads
  await redis.subscribe("signed_payloads", (msg) => {
    handleSignedPayload(msg).catch(console.error);
  });

  console.log("[validator] running");
}

startValidator().catch(console.error);

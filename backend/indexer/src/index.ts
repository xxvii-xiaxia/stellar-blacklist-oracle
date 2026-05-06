import { Horizon } from "@stellar/stellar-sdk";
import { Pool } from "pg";
import { createClient } from "redis";
import "dotenv/config";

const horizon = new Horizon.Server(
  process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org"
);

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = createClient({ url: process.env.REDIS_URL });

export interface AssetEvent {
  asset_code: string;
  asset_issuer: string;
  home_domain: string | null;
  ledger: number;
  created_at: string;
}

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS asset_events (
      id SERIAL PRIMARY KEY,
      asset_code TEXT NOT NULL,
      asset_issuer TEXT NOT NULL,
      home_domain TEXT,
      ledger INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS indexer_cursor (
      id INT PRIMARY KEY DEFAULT 1,
      paging_token TEXT NOT NULL DEFAULT 'now'
    );
    INSERT INTO indexer_cursor(id, paging_token) VALUES(1, 'now')
      ON CONFLICT DO NOTHING;
  `);
}

async function getCursor(): Promise<string> {
  const { rows } = await db.query(
    "SELECT paging_token FROM indexer_cursor WHERE id=1"
  );
  return rows[0]?.paging_token ?? "now";
}

async function saveCursor(token: string) {
  await db.query("UPDATE indexer_cursor SET paging_token=$1 WHERE id=1", [token]);
}

async function processOperation(op: Horizon.ServerApi.OperationRecord) {
  if (
    op.type !== "change_trust" &&
    op.type !== "payment" &&
    op.type !== "manage_sell_offer"
  )
    return;

  const assetIssuer = (op as any).asset_issuer as string | undefined;
  const assetCode = (op as any).asset_code as string | undefined;
  if (!assetIssuer || !assetCode) return;

  let homeDomain: string | null = null;
  try {
    const account = await horizon.loadAccount(assetIssuer);
    homeDomain = account.home_domain ?? null;
  } catch {
    // unreachable or non-existent account
  }

  const event: AssetEvent = {
    asset_code: assetCode,
    asset_issuer: assetIssuer,
    home_domain: homeDomain,
    ledger: (op as any).transaction_hash ? 0 : 0, // ledger not directly on op
    created_at: op.created_at,
  };

  await db.query(
    `INSERT INTO asset_events(asset_code, asset_issuer, home_domain, ledger, created_at)
     VALUES($1,$2,$3,$4,$5)`,
    [event.asset_code, event.asset_issuer, event.home_domain, event.ledger, event.created_at]
  );

  await redis.publish("asset_events", JSON.stringify(event));
}

export async function startIndexer() {
  await redis.connect();
  await migrate();
  const cursor = await getCursor();
  console.log(`[indexer] starting from cursor: ${cursor}`);

  // Use EventSource-style streaming
  const builder = horizon.operations().cursor(cursor).limit(200);
  const close = builder.stream({
    onmessage: async (op: unknown) => {
      await processOperation(op as Horizon.ServerApi.OperationRecord);
      await saveCursor((op as any).paging_token);
    },
    onerror: (err) => console.error("[indexer] stream error", err),
  });

  process.on("SIGTERM", () => {
    if (typeof close === "function") close();
    redis.quit();
    db.end();
  });
}

startIndexer().catch(console.error);

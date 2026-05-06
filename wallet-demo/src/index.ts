import { OracleClient, CheckResult } from "@stellar-oracle/sdk";
import "dotenv/config";

export interface Asset {
  code: string;
  issuer: string;
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  check: CheckResult;
}

export function createOracle(apiUrl?: string, wsUrl?: string): OracleClient {
  return new OracleClient({
    apiUrl: apiUrl ?? process.env.ORACLE_API_URL ?? "http://localhost:3000",
    wsUrl: wsUrl ?? process.env.ORACLE_WS_URL ?? "ws://localhost:3000/ws",
  });
}

/**
 * Call before adding a trustline.
 * Blocks if risk_score >= threshold (default 70).
 */
export async function guardTrustline(
  asset: Asset,
  riskThreshold = 70,
  oracle: OracleClient = createOracle()
): Promise<GuardResult> {
  const check = await oracle.checkIssuer(asset.issuer);
  const allowed = check.risk_score < riskThreshold;
  return {
    allowed,
    reason: allowed
      ? undefined
      : `Issuer blocked: risk_score=${check.risk_score} flags=${check.flags.join(",")}`,
    check,
  };
}

/** Call before sending a payment. */
export async function guardPayment(
  asset: Asset,
  riskThreshold = 70,
  oracle: OracleClient = createOracle()
): Promise<GuardResult> {
  return guardTrustline(asset, riskThreshold, oracle);
}

async function demo() {
  const oracle = createOracle();
  const asset: Asset = {
    code: "USDC",
    issuer: process.env.TEST_ISSUER ?? "GABC123",
  };

  console.log(`[wallet-demo] checking trustline for ${asset.code}:${asset.issuer}`);
  const result = await guardTrustline(asset, 70, oracle);

  if (!result.allowed) {
    console.error(`[wallet-demo] BLOCKED: ${result.reason}`);
  } else {
    console.log(`[wallet-demo] ALLOWED: risk_score=${result.check.risk_score}`);
  }

  const unsub = oracle.subscribeUpdates((update) => {
    console.log(`[wallet-demo] real-time update: ${update.issuer} score=${update.risk_score}`);
  });

  setTimeout(() => { unsub(); process.exit(0); }, 5000);
}

demo().catch(console.error);

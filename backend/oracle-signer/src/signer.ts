import { Keypair, hash } from "@stellar/stellar-sdk";

export interface BlacklistPayload {
  issuer: string;
  domain: string;
  risk_score: number;
  timestamp: number;
}

/** Deterministic hash of a blacklist payload */
export function hashPayload(payload: BlacklistPayload): Buffer {
  const data = JSON.stringify({
    issuer: payload.issuer,
    domain: payload.domain,
    risk_score: payload.risk_score,
    timestamp: payload.timestamp,
  });
  return Buffer.from(hash(Buffer.from(data)));
}

/** Sign a payload with a validator keypair */
export function signPayload(payload: BlacklistPayload, secret: string): string {
  const kp = Keypair.fromSecret(secret);
  const h = hashPayload(payload);
  return kp.sign(h).toString("base64");
}

/** Verify a signature against a payload and public key */
export function verifySignature(
  payload: BlacklistPayload,
  signature: string,
  publicKey: string
): boolean {
  try {
    const kp = Keypair.fromPublicKey(publicKey);
    const h = hashPayload(payload);
    return kp.verify(h, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

/** Collect signatures and check threshold */
export function hasConsensus(
  payload: BlacklistPayload,
  signatures: Array<{ publicKey: string; signature: string }>,
  validators: string[],
  threshold: number
): boolean {
  const validatorSet = new Set(validators);
  let valid = 0;
  for (const { publicKey, signature } of signatures) {
    if (validatorSet.has(publicKey) && verifySignature(payload, signature, publicKey)) {
      valid++;
    }
  }
  return valid >= threshold;
}

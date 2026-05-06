import { Keypair, hash } from "@stellar/stellar-sdk";

function signPayload(payload: object, secret: string): string {
  const kp = Keypair.fromSecret(secret);
  const data = Buffer.from(JSON.stringify(payload));
  const h = Buffer.from(hash(data));
  return kp.sign(h).toString("base64");
}

function verifySignature(payload: object, sig: string, pubKey: string): boolean {
  try {
    const kp = Keypair.fromPublicKey(pubKey);
    const data = Buffer.from(JSON.stringify(payload));
    const h = Buffer.from(hash(data));
    return kp.verify(h, Buffer.from(sig, "base64"));
  } catch {
    return false;
  }
}

describe("validator signing", () => {
  const kp = Keypair.random();
  const payload = { issuer: "GABC", domain: "bad.io", risk_score: 90, timestamp: 1710000000 };

  it("signs and verifies", () => {
    const sig = signPayload(payload, kp.secret());
    expect(verifySignature(payload, sig, kp.publicKey())).toBe(true);
  });

  it("rejects tampered payload", () => {
    const sig = signPayload(payload, kp.secret());
    const tampered = { ...payload, risk_score: 10 };
    expect(verifySignature(tampered, sig, kp.publicKey())).toBe(false);
  });
});

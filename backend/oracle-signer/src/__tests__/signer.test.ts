import { Keypair } from "@stellar/stellar-sdk";
import {
  signPayload,
  verifySignature,
  hasConsensus,
  hashPayload,
  BlacklistPayload,
} from "../signer";

const kp = Keypair.random();
const payload: BlacklistPayload = {
  issuer: "GABC123",
  domain: "phishing.example.com",
  risk_score: 92,
  timestamp: 1710000000,
};

describe("signer", () => {
  it("hashPayload is deterministic", () => {
    expect(hashPayload(payload).toString("hex")).toBe(
      hashPayload({ ...payload }).toString("hex")
    );
  });

  it("sign and verify round-trip", () => {
    const sig = signPayload(payload, kp.secret());
    expect(verifySignature(payload, sig, kp.publicKey())).toBe(true);
  });

  it("rejects wrong public key", () => {
    const sig = signPayload(payload, kp.secret());
    const other = Keypair.random().publicKey();
    expect(verifySignature(payload, sig, other)).toBe(false);
  });

  it("hasConsensus with threshold=2", () => {
    const kp2 = Keypair.random();
    const sig1 = signPayload(payload, kp.secret());
    const sig2 = signPayload(payload, kp2.secret());
    const validators = [kp.publicKey(), kp2.publicKey()];
    expect(
      hasConsensus(
        payload,
        [
          { publicKey: kp.publicKey(), signature: sig1 },
          { publicKey: kp2.publicKey(), signature: sig2 },
        ],
        validators,
        2
      )
    ).toBe(true);
  });

  it("fails consensus when below threshold", () => {
    const sig1 = signPayload(payload, kp.secret());
    const validators = [kp.publicKey(), Keypair.random().publicKey()];
    expect(
      hasConsensus(payload, [{ publicKey: kp.publicKey(), signature: sig1 }], validators, 2)
    ).toBe(false);
  });
});

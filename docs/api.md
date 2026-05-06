# API Reference

Base URL: `http://localhost:3000`

## REST

### GET /check/:issuer

Check if a Stellar issuer is blacklisted.

**Response**
```json
{
  "issuer": "GABC...",
  "blacklisted": true,
  "risk_score": 92,
  "flags": ["spoofed_high_value_asset"],
  "last_updated": "2026-05-06T15:00:00Z"
}
```

`risk_score` is 0–100. Wallets should block at ≥ 70 by default.

---

### GET /check-domain/:domain

Check if a domain is associated with a blacklisted issuer.

**Response**
```json
{
  "domain": "phishing.example.com",
  "known": true,
  "issuer": "GABC...",
  "blacklisted": true,
  "risk_score": 92
}
```

---

## WebSocket

### WS /ws

Subscribe to real-time blacklist updates.

**Message format** (same as `/check/:issuer` response):
```json
{
  "issuer": "GABC...",
  "blacklisted": true,
  "risk_score": 92,
  "flags": ["known_phishing_domain"]
}
```

---

## SDK Usage

### JavaScript / TypeScript

```ts
import { OracleClient } from "@stellar-oracle/sdk";

const oracle = new OracleClient({ apiUrl: "https://oracle.example.com" });

// Check before adding trustline
const safe = await oracle.isSafeAsset("GABC...");
if (!safe) throw new Error("Unsafe asset");

// Real-time updates
const unsub = oracle.subscribeUpdates((update) => {
  console.log(update.issuer, update.risk_score);
});
```

### Rust

```rust
use stellar_oracle_sdk::OracleClient;

let client = OracleClient::new("https://oracle.example.com");
let result = client.check_issuer("GABC...").await?;
let safe = client.is_safe_asset("GABC...", 70).await?;
```

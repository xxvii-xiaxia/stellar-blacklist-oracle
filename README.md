# Stellar Blacklist Oracle

Real-time trust firewall for Stellar assets and anchors. Flags malicious issuers, phishing domains, and spoofed assets — delivering risk scores on-chain via Soroban and off-chain via REST/WebSocket.

> Think Google Safe Browsing, but for Stellar.

---

## The Problem

Stellar has no unified, real-time protection against:
- Fake anchors issuing scam assets (e.g. counterfeit USDC)
- Compromised anchor domains (DNS hijack)
- Phishing wallets tricking users into trustlines
- Malicious issuers rebranding after being flagged

Existing protections (SEP-1 domain verification, static wallet blacklists) are slow and manual.

---

## Architecture

```
[Horizon Events]
      ↓
[Indexer]  ──redis──▶  [Threat Engine]  ──redis──▶  [Validator Network]
                                                             ↓
                                                   [Soroban Contract]
                                                             ↓
                                             [API: REST + WebSocket]
                                                             ↓
                                                   [Wallet SDK]
```

| Layer | Tech |
|---|---|
| Smart contract | Soroban (Rust) |
| Backend pipeline | Node.js / TypeScript |
| Message bus | Redis pub/sub |
| Database | PostgreSQL |
| SDK | TypeScript + Rust |

---

## Monorepo Structure

```
stellar-blacklist-oracle/
├── contracts/blacklist-oracle/   # Soroban smart contract
├── backend/
│   ├── indexer/                  # Streams Horizon operations
│   ├── threat-engine/            # Risk scoring (0–100)
│   ├── oracle-signer/            # Multi-sig payload signing
│   └── api/                      # REST + WebSocket server
├── sdk/
│   ├── js/                       # TypeScript client SDK
│   └── rust/                     # Rust client SDK
├── wallet-demo/                  # Wallet integration example
├── validator-node/               # Independent validator runner
└── docs/                         # Architecture + API reference
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Rust + `wasm32-unknown-unknown` target
- Docker (for Postgres + Redis)

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Clone and install
git clone https://github.com/your-org/stellar-blacklist-oracle
cd stellar-blacklist-oracle
cp .env.example .env
npm install
```

### Run locally

```bash
# Start Postgres + Redis
docker-compose up -d

# Build everything
npm run build

# Start services (separate terminals)
npm run dev -w @stellar-oracle/indexer
npm run dev -w @stellar-oracle/threat-engine
npm run dev -w @stellar-oracle/oracle-signer
npm run dev -w @stellar-oracle/api
```

API available at `http://localhost:3000`.

---

## Smart Contract

The Soroban contract is the on-chain source of truth for blacklisted issuers.

### Functions

| Function | Description |
|---|---|
| `initialize(admin, validators, threshold)` | One-time setup |
| `add_entry(caller, issuer, domain, risk_score, reason_hash)` | Blacklist an issuer |
| `remove_entry(caller, issuer)` | Remove an entry |
| `is_blacklisted(issuer) → bool` | Check if blacklisted |
| `get_risk_score(issuer) → u32` | Get risk score (0–100) |

### Build & test

```bash
cd contracts/blacklist-oracle
cargo build --target wasm32-unknown-unknown --release
cargo test
```

---

## API

### REST

```bash
# Check an issuer
GET /check/:issuer

# Check a domain
GET /check-domain/:domain
```

**Example response:**
```json
{
  "issuer": "GABC...",
  "blacklisted": true,
  "risk_score": 92,
  "flags": ["spoofed_high_value_asset", "known_phishing_domain"],
  "last_updated": "2026-05-06T15:00:00Z"
}
```

`risk_score` is 0–100. Wallets should block at ≥ 70 by default.

### WebSocket

```
WS /ws  →  real-time blacklist update stream
```

---

## SDK Usage

### TypeScript

```ts
import { OracleClient } from "@stellar-oracle/sdk";

const oracle = new OracleClient({ apiUrl: "https://oracle.example.com" });

// Before adding a trustline or sending a payment
const safe = await oracle.isSafeAsset("GABC...");
if (!safe) throw new Error("Blocked: unsafe asset");

// Real-time updates
const unsub = oracle.subscribeUpdates((update) => {
  console.log(update.issuer, update.risk_score);
});
```

### Rust

```rust
use stellar_oracle_sdk::OracleClient;

let client = OracleClient::new("https://oracle.example.com");
let safe = client.is_safe_asset("GABC...", 70).await?;
```

### Wallet integration

```ts
import { guardTrustline, guardPayment } from "@stellar-oracle/wallet-demo";

// Block before trustline
const result = await guardTrustline({ code: "USDC", issuer: "GABC..." });
if (!result.allowed) {
  showWarning(result.reason); // "Issuer blocked: risk_score=92 flags=spoofed_high_value_asset"
}
```

---

## Risk Scoring

The threat engine scores each asset 0–100 based on:

| Signal | Score |
|---|---|
| Known phishing domain | +80 |
| Spoofed high-value asset (USDC/BTC/ETH) from untrusted issuer | +50 |
| No `home_domain` set | +15 |
| Invalid domain format | +20 |

Score ≥ 70 → blacklisted. Wallets can adjust the threshold.

---

## Multi-Sig Oracle Model

Blacklist updates require consensus from multiple validators before being written on-chain:

1. Threat engine detects a threat → publishes to Redis
2. Each validator signs the payload with their Stellar keypair
3. Signatures are aggregated — once `threshold` is reached, the entry is submitted to the Soroban contract
4. Wallets receive the update via WebSocket instantly; chain confirmation follows asynchronously

Configure validators via `.env`:
```
VALIDATOR_THRESHOLD=3
VALIDATOR_PUBKEYS=GAAA...,GBBB...,GCCC...
```

---

## Tests

```bash
# All TypeScript tests (19 tests)
npm test

# Soroban contract tests (3 tests)
cd contracts/blacklist-oracle && cargo test

# Rust SDK tests (2 tests)
cargo test -p stellar-oracle-sdk
```

**Total: 24 tests, 0 failures.**

---

## Deployment Phases

| Phase | Scope |
|---|---|
| 1 | Off-chain API + threat engine + basic blacklist |
| 2 | Soroban contract + multi-sig oracle |
| 3 | Wallet SDK + integrations |
| 4 | Decentralized validator network |

---

## Docs

- [Architecture](docs/architecture.md)
- [API Reference](docs/api.md)

---

## License

MIT

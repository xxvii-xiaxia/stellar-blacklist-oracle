# Architecture

## Overview

Stellar Blacklist Oracle is a real-time trust firewall for Stellar assets and anchors. It combines an on-chain Soroban contract with an off-chain threat intelligence pipeline.

```
[Horizon Events]
      ↓
[Indexer]  ──redis──▶  [Threat Engine]  ──redis──▶  [Oracle Signer / Validator Network]
                                                              ↓
                                                    [Soroban Contract]
                                                              ↓
                                              [API (REST + WebSocket)]
                                                              ↓
                                                    [Wallet SDK / Integrations]
```

## Components

### contracts/blacklist-oracle
Soroban smart contract. Stores blacklisted issuers, domains, and risk scores. Admin-controlled with multi-sig enforced off-chain.

Key functions:
- `initialize(admin, validators, threshold)`
- `add_entry(caller, issuer, domain, risk_score, reason_hash)`
- `remove_entry(caller, issuer)`
- `is_blacklisted(issuer) → bool`
- `get_risk_score(issuer) → u32`

### backend/indexer
Streams Stellar Horizon operations (change_trust, payment, manage_sell_offer). Extracts asset issuer + home_domain. Publishes `asset_events` to Redis.

### backend/threat-engine
Subscribes to `asset_events`. Scores each asset 0–100 using:
- Known phishing domain match (+80)
- Spoofed high-value asset code from untrusted issuer (+50)
- No home_domain (+15)
- Invalid domain format (+20)

Persists results to `threat_results` table. Publishes `blacklist_updates` for score ≥ 70.

### backend/oracle-signer
Subscribes to `blacklist_updates`. Signs payloads with validator keypair. Publishes `signed_payloads` for aggregation.

### backend/api
Fastify REST + WebSocket server.
- `GET /check/:issuer` — returns risk score and flags
- `GET /check-domain/:domain` — domain lookup
- `WS /ws` — real-time blacklist update stream

### sdk/js
TypeScript client: `OracleClient.checkIssuer()`, `isSafeAsset()`, `subscribeUpdates()`.

### sdk/rust
Rust async client: `OracleClient::check_issuer()`, `is_safe_asset()`.

### wallet-demo
Demonstrates `guardTrustline()` and `guardPayment()` — blocks transactions to high-risk issuers.

### validator-node
Runs as an independent validator. Signs blacklist payloads, aggregates signatures, emits `consensus_reached` when threshold is met.

## Data Flow

1. Horizon emits operation → Indexer captures it
2. Indexer publishes `asset_events` to Redis
3. Threat Engine scores the asset
4. If score ≥ 70 → publishes `blacklist_updates`
5. Validator Node signs + aggregates → `consensus_reached`
6. Oracle Signer submits `add_entry` to Soroban contract
7. API serves updated data; WebSocket pushes to wallets
8. Wallet SDK blocks transaction if `risk_score ≥ threshold`

## Security Model

| Threat | Mitigation |
|---|---|
| Oracle manipulation | Multi-sig threshold (e.g. 3/5 validators) |
| False positives | Risk score 0–100, wallet sets threshold |
| Replay attacks | Timestamp in signed payload |
| Sybil validators | Known validator registry + optional staking |

export interface ThreatInput {
  asset_code: string;
  asset_issuer: string;
  home_domain: string | null;
}

export interface ThreatResult {
  issuer: string;
  risk_score: number; // 0-100
  flags: string[];
  blacklisted: boolean;
}

// Known legitimate issuers (seed list)
const TRUSTED_ISSUERS = new Set([
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", // USDC (Circle)
]);

// Known phishing domains (seed list)
const PHISHING_DOMAINS = new Set(["phishing.example.com", "fake-stellar.io"]);

// Suspicious asset codes that are commonly spoofed
const HIGH_VALUE_CODES = new Set(["USDC", "USDT", "BTC", "ETH", "XLM"]);

export function scoreAsset(input: ThreatInput): ThreatResult {
  const flags: string[] = [];
  let score = 0;

  // 1. Known phishing domain
  if (input.home_domain && PHISHING_DOMAINS.has(input.home_domain)) {
    flags.push("known_phishing_domain");
    score += 80;
  }

  // 2. High-value asset code from untrusted issuer
  if (
    HIGH_VALUE_CODES.has(input.asset_code.toUpperCase()) &&
    !TRUSTED_ISSUERS.has(input.asset_issuer)
  ) {
    flags.push("spoofed_high_value_asset");
    score += 50;
  }

  // 3. No home_domain set (suspicious for any asset)
  if (!input.home_domain) {
    flags.push("no_home_domain");
    score += 15;
  }

  // 4. Domain doesn't look like a real anchor (no TLD dot)
  if (input.home_domain && !input.home_domain.includes(".")) {
    flags.push("invalid_domain_format");
    score += 20;
  }

  const risk_score = Math.min(score, 100);
  return {
    issuer: input.asset_issuer,
    risk_score,
    flags,
    blacklisted: risk_score >= 70,
  };
}

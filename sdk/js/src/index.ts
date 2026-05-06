export interface CheckResult {
  issuer: string;
  blacklisted: boolean;
  risk_score: number;
  flags: string[];
  reason?: string;
  last_updated?: string;
}

export interface OracleClientOptions {
  apiUrl: string;
  /** Optional: WebSocket URL for real-time updates */
  wsUrl?: string;
}

export class OracleClient {
  private apiUrl: string;
  private wsUrl: string | undefined;

  constructor(options: OracleClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, "");
    this.wsUrl = options.wsUrl;
  }

  /** Check if an issuer is blacklisted */
  async checkIssuer(issuer: string): Promise<CheckResult> {
    const res = await fetch(`${this.apiUrl}/check/${encodeURIComponent(issuer)}`);
    if (!res.ok) throw new Error(`Oracle API error: ${res.status}`);
    return res.json() as Promise<CheckResult>;
  }

  /** Check if a domain is associated with a blacklisted issuer */
  async checkDomain(domain: string): Promise<CheckResult & { domain: string }> {
    const res = await fetch(`${this.apiUrl}/check-domain/${encodeURIComponent(domain)}`);
    if (!res.ok) throw new Error(`Oracle API error: ${res.status}`);
    return res.json() as Promise<CheckResult & { domain: string }>;
  }

  /**
   * Returns true if the asset is safe to use.
   * Throws if the oracle is unreachable.
   */
  async isSafeAsset(issuer: string, riskThreshold = 70): Promise<boolean> {
    const result = await this.checkIssuer(issuer);
    return result.risk_score < riskThreshold;
  }

  /**
   * Subscribe to real-time blacklist updates via WebSocket.
   * @param onUpdate called with each new blacklist entry
   * @returns cleanup function
   */
  subscribeUpdates(onUpdate: (result: CheckResult) => void): () => void {
    if (!this.wsUrl) throw new Error("wsUrl not configured");
    const ws = new WebSocket(this.wsUrl);
    ws.onmessage = (e) => {
      try {
        onUpdate(JSON.parse(e.data));
      } catch {
        // ignore malformed messages
      }
    };
    return () => ws.close();
  }
}

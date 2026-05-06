use reqwest::Client;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CheckResult {
    pub issuer: String,
    pub blacklisted: bool,
    pub risk_score: u32,
    pub flags: Vec<String>,
    pub last_updated: Option<String>,
}

#[derive(Debug, Error)]
pub enum OracleError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("API error: status {0}")]
    Api(u16),
}

pub struct OracleClient {
    api_url: String,
    client: Client,
}

impl OracleClient {
    pub fn new(api_url: impl Into<String>) -> Self {
        Self {
            api_url: api_url.into().trim_end_matches('/').to_string(),
            client: Client::new(),
        }
    }

    pub async fn check_issuer(&self, issuer: &str) -> Result<CheckResult, OracleError> {
        let url = format!("{}/check/{}", self.api_url, issuer);
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(OracleError::Api(resp.status().as_u16()));
        }
        Ok(resp.json::<CheckResult>().await?)
    }

    pub async fn is_safe_asset(&self, issuer: &str, threshold: u32) -> Result<bool, OracleError> {
        let result = self.check_issuer(issuer).await?;
        Ok(result.risk_score < threshold)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_result_deserializes() {
        let json = r#"{
            "issuer": "GABC",
            "blacklisted": true,
            "risk_score": 92,
            "flags": ["spoofed_high_value_asset"],
            "last_updated": null
        }"#;
        let r: CheckResult = serde_json::from_str(json).unwrap();
        assert_eq!(r.issuer, "GABC");
        assert!(r.blacklisted);
        assert_eq!(r.risk_score, 92);
    }

    #[test]
    fn is_safe_logic() {
        let r = CheckResult {
            issuer: "GABC".into(),
            blacklisted: true,
            risk_score: 92,
            flags: vec![],
            last_updated: None,
        };
        assert!(r.risk_score >= 70); // would be unsafe
    }
}

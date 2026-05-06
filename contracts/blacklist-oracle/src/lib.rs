#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, Env, String, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct BlacklistEntry {
    pub issuer: Address,
    pub domain: String,
    pub risk_score: u32,
    pub timestamp: u64,
    pub reason_hash: Bytes,
}

#[contracttype]
pub enum DataKey {
    Entry(Address),
    Validators,
    Threshold,
    Admin,
}

#[contract]
pub struct BlacklistOracle;

#[contractimpl]
impl BlacklistOracle {
    /// Initialize with admin, validators, and signature threshold.
    pub fn initialize(env: Env, admin: Address, validators: Vec<Address>, threshold: u32) {
        assert!(
            !env.storage().instance().has(&DataKey::Admin),
            "already initialized"
        );
        assert!(threshold as usize <= validators.len() as usize, "threshold > validators");
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Validators, &validators);
        env.storage().instance().set(&DataKey::Threshold, &threshold);
    }

    /// Add or update a blacklist entry. Caller must be admin (off-chain multi-sig enforced).
    pub fn add_entry(
        env: Env,
        caller: Address,
        issuer: Address,
        domain: String,
        risk_score: u32,
        reason_hash: Bytes,
    ) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(caller == admin, "unauthorized");

        let entry = BlacklistEntry {
            issuer: issuer.clone(),
            domain,
            risk_score,
            timestamp: env.ledger().timestamp(),
            reason_hash,
        };
        env.storage().persistent().set(&DataKey::Entry(issuer.clone()), &entry);
        env.events().publish((symbol_short!("blacklist"), symbol_short!("add")), issuer);
    }

    /// Remove an entry. Admin only.
    pub fn remove_entry(env: Env, caller: Address, issuer: Address) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(caller == admin, "unauthorized");
        env.storage().persistent().remove(&DataKey::Entry(issuer.clone()));
        env.events().publish((symbol_short!("blacklist"), symbol_short!("rm")), issuer);
    }

    /// Returns true if issuer is blacklisted.
    pub fn is_blacklisted(env: Env, issuer: Address) -> bool {
        env.storage().persistent().has(&DataKey::Entry(issuer))
    }

    /// Returns risk score (0 if not found).
    pub fn get_risk_score(env: Env, issuer: Address) -> u32 {
        env.storage()
            .persistent()
            .get::<DataKey, BlacklistEntry>(&DataKey::Entry(issuer))
            .map(|e| e.risk_score)
            .unwrap_or(0)
    }

    /// Returns full entry or panics if not found.
    pub fn get_entry(env: Env, issuer: Address) -> BlacklistEntry {
        env.storage()
            .persistent()
            .get(&DataKey::Entry(issuer))
            .expect("not found")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Bytes, Env, String, Vec};

    fn setup() -> (Env, BlacklistOracleClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BlacklistOracle);
        let client = BlacklistOracleClient::new(&env, &contract_id);
        (env, client)
    }

    #[test]
    fn test_add_and_check() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let validator = Address::generate(&env);
        let mut validators = Vec::new(&env);
        validators.push_back(validator);
        client.initialize(&admin, &validators, &1);

        let issuer = Address::generate(&env);
        let domain = String::from_str(&env, "phishing.example.com");
        let reason = Bytes::from_slice(&env, &[0u8; 32]);

        client.add_entry(&admin, &issuer, &domain, &92, &reason);

        assert!(client.is_blacklisted(&issuer));
        assert_eq!(client.get_risk_score(&issuer), 92);
    }

    #[test]
    fn test_remove_entry() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let mut validators = Vec::new(&env);
        validators.push_back(Address::generate(&env));
        client.initialize(&admin, &validators, &1);

        let issuer = Address::generate(&env);
        let domain = String::from_str(&env, "bad.example.com");
        let reason = Bytes::from_slice(&env, &[1u8; 32]);

        client.add_entry(&admin, &issuer, &domain, &80, &reason);
        assert!(client.is_blacklisted(&issuer));

        client.remove_entry(&admin, &issuer);
        assert!(!client.is_blacklisted(&issuer));
    }

    #[test]
    fn test_unknown_issuer_score_zero() {
        let (env, client) = setup();
        let admin = Address::generate(&env);
        let mut validators = Vec::new(&env);
        validators.push_back(Address::generate(&env));
        client.initialize(&admin, &validators, &1);

        let unknown = Address::generate(&env);
        assert_eq!(client.get_risk_score(&unknown), 0);
        assert!(!client.is_blacklisted(&unknown));
    }
}

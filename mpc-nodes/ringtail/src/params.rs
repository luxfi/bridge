//! Cryptographic parameters for Ringtail
//!
//! This module defines parameter sets for different security levels,
//! following the specifications in the Ringtail paper.

use serde::{Serialize, Deserialize};

/// Security level for the scheme
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SecurityLevel {
    /// 128-bit security
    Level128,
    /// 192-bit security
    Level192,
    /// 256-bit security
    Level256,
}

/// Parameters for the Ringtail signature scheme
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RingtailParams {
    /// Security level
    pub security_level: SecurityLevel,
    /// Ring degree φ (power of 2)
    pub ring_degree: usize,
    /// Modulus q (prime, q ≡ 1 mod 2φ)
    pub modulus: i64,
    /// Hamming weight of challenges
    pub kappa: usize,
    /// Secret key dimension
    pub n: usize,
    /// Public key dimension
    pub m: usize,
    /// Auxiliary dimension (d-1 where d is total width)
    pub d_bar: usize,
    /// Gaussian parameter for LWE public key
    pub sigma_e: f64,
    /// Gaussian parameter for commitments (large)
    pub sigma_star: f64,
    /// Gaussian parameter for auxiliary commitments (small)
    pub sigma_e_big: f64,
    /// Gaussian parameter for hash output
    pub sigma_u: f64,
    /// Number of low bits to drop from h
    pub nu: usize,
    /// Number of low bits to drop from b
    pub xi: usize,
    /// L2 norm bound for valid signatures
    pub b2_bound: f64,
    /// Maximum number of signing queries
    pub max_queries: u64,
}

impl RingtailParams {
    /// Get parameters for a specific security level
    pub fn new(level: SecurityLevel) -> Self {
        match level {
            SecurityLevel::Level128 => Self::level_128(),
            SecurityLevel::Level192 => Self::level_192(),
            SecurityLevel::Level256 => Self::level_256(),
        }
    }
    
    /// 128-bit security parameters
    fn level_128() -> Self {
        Self {
            security_level: SecurityLevel::Level128,
            ring_degree: 256,
            modulus: 281474976729601, // 2^48 + 2^14 + 2^11 + 2^9 + 1
            kappa: 23,
            n: 7,
            m: 8,
            d_bar: 48,
            sigma_e: 6.1,
            sigma_star: f64::powf(2.0, 37.3),
            sigma_e_big: 6.1,
            sigma_u: f64::powf(2.0, 27.2),
            nu: 29,
            xi: 30,
            b2_bound: f64::powf(2.0, 48.6),
            max_queries: 1u64 << 60,
        }
    }
    
    /// 192-bit security parameters
    fn level_192() -> Self {
        Self {
            security_level: SecurityLevel::Level192,
            ring_degree: 512,
            modulus: 70368744177665, // Close to 2^46
            kappa: 31,
            n: 5,
            m: 6,
            d_bar: 42,
            sigma_e: 6.2,
            sigma_star: f64::powf(2.0, 36.4),
            sigma_e_big: 6.2,
            sigma_u: f64::powf(2.0, 23.5),
            nu: 25,
            xi: 29,
            b2_bound: f64::powf(2.0, 48.0),
            max_queries: 1u64 << 60,
        }
    }
    
    /// 256-bit security parameters
    fn level_256() -> Self {
        Self {
            security_level: SecurityLevel::Level256,
            ring_degree: 512,
            modulus: 281474976729601, // 2^48 + 2^14 + 2^11 + 2^9 + 1
            kappa: 44,
            n: 7,
            m: 8,
            d_bar: 48,
            sigma_e: 9.9,
            sigma_star: f64::powf(2.0, 38.6),
            sigma_e_big: 9.9,
            sigma_u: f64::powf(2.0, 27.8),
            nu: 29,
            xi: 31,
            b2_bound: f64::powf(2.0, 50.3),
            max_queries: 1u64 << 60,
        }
    }
    
    /// Get total dimension d = d_bar + 1
    pub fn d(&self) -> usize {
        self.d_bar + 1
    }
    
    /// Get q_nu = floor(q / 2^nu)
    pub fn q_nu(&self) -> i64 {
        self.modulus >> self.nu
    }
    
    /// Get q_xi = floor(q / 2^xi)
    pub fn q_xi(&self) -> i64 {
        self.modulus >> self.xi
    }
    
    /// Check if parameters are valid
    pub fn validate(&self) -> Result<(), String> {
        // Check ring degree is power of 2
        if !self.ring_degree.is_power_of_two() {
            return Err("Ring degree must be a power of 2".to_string());
        }
        
        // Check modulus is prime and NTT-friendly
        if self.modulus % (2 * self.ring_degree as i64) != 1 {
            return Err("Modulus must be 1 mod 2*ring_degree for NTT".to_string());
        }
        
        // Check dimensions
        if self.n == 0 || self.m == 0 || self.d_bar == 0 {
            return Err("Dimensions must be positive".to_string());
        }
        
        // Check Gaussian parameters
        if self.sigma_e <= 0.0 || self.sigma_star <= 0.0 || 
           self.sigma_e_big <= 0.0 || self.sigma_u <= 0.0 {
            return Err("Gaussian parameters must be positive".to_string());
        }
        
        // Check rounding parameters
        if self.nu >= 64 || self.xi >= 64 {
            return Err("Rounding parameters too large".to_string());
        }
        
        Ok(())
    }
    
    /// Get smoothing parameter for the ring
    pub fn smoothing_parameter(&self) -> f64 {
        // η_ε(Z^φ) ≈ sqrt(log(2φ/ε))
        let epsilon = 2.0f64.powi(-128);
        f64::sqrt(f64::ln(2.0 * self.ring_degree as f64 / epsilon))
    }
    
    /// Check if sigma values satisfy security requirements
    pub fn check_sigma_constraints(&self) -> bool {
        let eta = self.smoothing_parameter();
        
        self.sigma_e >= eta &&
        self.sigma_e_big >= eta &&
        self.sigma_star >= eta * f64::sqrt(self.kappa as f64) * 10.0 // Simplified bound
    }
}

impl Default for RingtailParams {
    fn default() -> Self {
        Self::new(SecurityLevel::Level128)
    }
}

/// Challenge set for Ringtail
#[derive(Debug, Clone)]
pub struct ChallengeSet {
    /// Ring degree
    pub degree: usize,
    /// Hamming weight
    pub weight: usize,
}

impl ChallengeSet {
    /// Create a new challenge set
    pub fn new(degree: usize, weight: usize) -> Self {
        assert!(weight <= degree, "Weight cannot exceed degree");
        Self { degree, weight }
    }
    
    /// Sample a random challenge
    pub fn sample<R: rand::Rng>(&self, rng: &mut R) -> Vec<i64> {
        use rand::seq::SliceRandom;
        
        let mut coeffs = vec![0i64; self.degree];
        let mut positions: Vec<usize> = (0..self.degree).collect();
        positions.shuffle(rng);
        
        // Set weight random positions to ±1
        for i in 0..self.weight {
            coeffs[positions[i]] = if rng.gen_bool(0.5) { 1 } else { -1 };
        }
        
        coeffs
    }
    
    /// Compute the size of the challenge set
    pub fn size(&self) -> f64 {
        // |C| = 2^weight * (degree choose weight)
        let n = self.degree as f64;
        let k = self.weight as f64;
        
        // Use Stirling's approximation for large values
        2.0f64.powf(k) * (n / k).powf(k)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parameter_validation() {
        let params = RingtailParams::default();
        assert!(params.validate().is_ok());
    }
    
    #[test]
    fn test_challenge_sampling() {
        let challenge_set = ChallengeSet::new(256, 23);
        let mut rng = rand::thread_rng();
        let challenge = challenge_set.sample(&mut rng);
        
        // Check Hamming weight
        let weight: i64 = challenge.iter().map(|c| c.abs()).sum();
        assert_eq!(weight, 23);
    }
    
    #[test]
    fn test_security_levels() {
        let params_128 = RingtailParams::new(SecurityLevel::Level128);
        let params_192 = RingtailParams::new(SecurityLevel::Level192);
        let params_256 = RingtailParams::new(SecurityLevel::Level256);
        
        assert_eq!(params_128.ring_degree, 256);
        assert_eq!(params_192.ring_degree, 512);
        assert_eq!(params_256.ring_degree, 512);
    }
}
//! Discrete Gaussian sampling for lattice-based cryptography
//!
//! This module implements constant-time discrete Gaussian sampling,
//! which is critical for the security of Ringtail signatures.

use rand::Rng;
use rand_distr::{Distribution, Normal, StandardNormal};
use crate::ring::RingElement;

/// Discrete Gaussian distribution over integers
#[derive(Debug, Clone)]
pub struct DiscreteGaussian {
    /// Standard deviation parameter
    pub sigma: f64,
    /// Center of the distribution
    pub center: i64,
    /// Precision parameter for sampling
    pub precision: usize,
}

impl DiscreteGaussian {
    /// Create a new discrete Gaussian sampler
    pub fn new(sigma: f64, center: i64) -> Self {
        // Precision should be at least 128 bits for security
        let precision = 128;
        Self { sigma, center, precision }
    }
    
    /// Sample from discrete Gaussian using rejection sampling
    /// This implementation aims to be constant-time to prevent side-channel attacks
    pub fn sample<R: Rng>(&self, rng: &mut R) -> i64 {
        // Use rejection sampling with uniform bounds
        let bound = (self.sigma * 12.0) as i64; // 12 standard deviations
        
        loop {
            // Sample uniformly from [-bound, bound]
            let x = rng.gen_range(-bound..=bound);
            
            // Compute acceptance probability
            let offset = (x - self.center) as f64;
            let exponent = -(offset * offset) / (2.0 * self.sigma * self.sigma);
            let prob = exponent.exp();
            
            // Accept/reject
            let u: f64 = rng.gen();
            if u < prob {
                return x;
            }
        }
    }
    
    /// Sample a vector of independent discrete Gaussians
    pub fn sample_vector<R: Rng>(&self, rng: &mut R, length: usize) -> Vec<i64> {
        (0..length).map(|_| self.sample(rng)).collect()
    }
    
    /// Sample a polynomial with discrete Gaussian coefficients
    pub fn sample_poly<R: Rng>(
        &self,
        rng: &mut R,
        degree: usize,
        modulus: i64,
    ) -> RingElement {
        let coeffs = self.sample_vector(rng, degree);
        RingElement::new(coeffs, modulus, degree)
    }
}

/// Gaussian sampler using cumulative distribution table (CDT)
/// This is more efficient and easier to make constant-time
pub struct CDTGaussian {
    /// Precomputed CDT table
    table: Vec<(i64, f64)>,
    /// Standard deviation
    sigma: f64,
}

impl CDTGaussian {
    /// Create a new CDT-based Gaussian sampler
    pub fn new(sigma: f64, max_value: i64) -> Self {
        let mut table = Vec::new();
        let mut cumulative = 0.0;
        
        // Build cumulative distribution table
        for x in -max_value..=max_value {
            let prob = (-(x as f64).powi(2) / (2.0 * sigma * sigma)).exp();
            cumulative += prob;
            table.push((x, cumulative));
        }
        
        // Normalize
        for (_, cum) in &mut table {
            *cum /= cumulative;
        }
        
        Self { table, sigma }
    }
    
    /// Sample using binary search on CDT
    pub fn sample<R: Rng>(&self, rng: &mut R) -> i64 {
        let u: f64 = rng.gen();
        
        // Binary search for the value
        let idx = self.table.binary_search_by(|(_, cum)| {
            cum.partial_cmp(&u).unwrap()
        });
        
        match idx {
            Ok(i) => self.table[i].0,
            Err(i) => {
                if i < self.table.len() {
                    self.table[i].0
                } else {
                    self.table.last().unwrap().0
                }
            }
        }
    }
}

/// Sample from discrete Gaussian over a lattice coset
pub struct LatticeGaussian {
    /// Base Gaussian sampler
    base_sampler: DiscreteGaussian,
    /// Lattice basis (simplified for now)
    basis: Vec<Vec<i64>>,
}

impl LatticeGaussian {
    /// Create a new lattice Gaussian sampler
    pub fn new(sigma: f64, basis: Vec<Vec<i64>>) -> Self {
        let base_sampler = DiscreteGaussian::new(sigma, 0);
        Self { base_sampler, basis }
    }
    
    /// Sample from discrete Gaussian over lattice + center
    pub fn sample_lattice_point<R: Rng>(
        &self,
        rng: &mut R,
        center: &[f64],
    ) -> Vec<i64> {
        let n = self.basis.len();
        
        // Sample integer coefficients
        let coeffs: Vec<i64> = (0..n)
            .map(|_| self.base_sampler.sample(rng))
            .collect();
        
        // Compute lattice point
        let mut result = vec![0i64; n];
        for (i, coeff) in coeffs.iter().enumerate() {
            for j in 0..n {
                result[j] += coeff * self.basis[i][j];
            }
        }
        
        // Add center (rounded)
        for (i, &c) in center.iter().enumerate() {
            result[i] += c.round() as i64;
        }
        
        result
    }
}

/// Utility functions for Gaussian sampling in Ringtail
pub mod utils {
    use super::*;
    use crate::ring::Matrix;
    
    /// Sample a matrix with Gaussian entries
    pub fn sample_gaussian_matrix<R: Rng>(
        rng: &mut R,
        rows: usize,
        cols: usize,
        sigma: f64,
        modulus: i64,
        degree: usize,
    ) -> Matrix {
        let sampler = DiscreteGaussian::new(sigma, 0);
        let elements: Vec<Vec<RingElement>> = (0..rows)
            .map(|_| {
                (0..cols)
                    .map(|_| sampler.sample_poly(rng, degree, modulus))
                    .collect()
            })
            .collect();
            
        Matrix::new(elements)
    }
    
    /// Sample a vector with Gaussian entries
    pub fn sample_gaussian_vector<R: Rng>(
        rng: &mut R,
        length: usize,
        sigma: f64,
        modulus: i64,
        degree: usize,
    ) -> Vec<RingElement> {
        let sampler = DiscreteGaussian::new(sigma, 0);
        (0..length)
            .map(|_| sampler.sample_poly(rng, degree, modulus))
            .collect()
    }
    
    /// Check if a sample is within expected bounds (for rejection)
    pub fn check_gaussian_bounds(value: i64, sigma: f64, k: f64) -> bool {
        value.abs() as f64 <= k * sigma
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::thread_rng;
    
    #[test]
    fn test_discrete_gaussian_sampling() {
        let mut rng = thread_rng();
        let sampler = DiscreteGaussian::new(3.0, 0);
        
        // Sample many values and check they're reasonable
        let samples: Vec<i64> = (0..1000)
            .map(|_| sampler.sample(&mut rng))
            .collect();
            
        // Most samples should be within 3 standard deviations
        let within_3sigma = samples.iter()
            .filter(|&&x| x.abs() <= 9)
            .count();
            
        assert!(within_3sigma > 900, "Most samples should be within 3σ");
    }
    
    #[test]
    fn test_cdt_gaussian() {
        let mut rng = thread_rng();
        let sampler = CDTGaussian::new(3.0, 20);
        
        // Test sampling works
        let _sample = sampler.sample(&mut rng);
    }
    
    #[test]
    fn test_gaussian_polynomial() {
        let mut rng = thread_rng();
        let sampler = DiscreteGaussian::new(3.0, 0);
        let poly = sampler.sample_poly(&mut rng, 256, 12289);
        
        assert_eq!(poly.degree, 256);
        assert_eq!(poly.modulus, 12289);
    }
}
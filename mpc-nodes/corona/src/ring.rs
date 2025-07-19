//! Ring arithmetic for R = Z[X]/(X^n + 1) where n is a power of 2
//! 
//! This module implements polynomial arithmetic in the cyclotomic ring,
//! which is the foundation of lattice-based cryptography.

use num_bigint::BigInt;
use num_traits::{Zero, One};
use std::ops::{Add, Sub, Mul, Neg};
use serde::{Serialize, Deserialize};

/// A polynomial in the ring R = Z[X]/(X^n + 1)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RingElement {
    /// Coefficients of the polynomial
    pub coeffs: Vec<i64>,
    /// Modulus q
    pub modulus: i64,
    /// Degree n (must be power of 2)
    pub degree: usize,
}

/// A matrix of ring elements
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Matrix {
    /// Matrix elements stored row-major
    pub elements: Vec<Vec<RingElement>>,
    /// Number of rows
    pub rows: usize,
    /// Number of columns
    pub cols: usize,
}

impl RingElement {
    /// Create a new ring element
    pub fn new(coeffs: Vec<i64>, modulus: i64, degree: usize) -> Self {
        assert!(degree.is_power_of_two(), "Degree must be a power of 2");
        assert_eq!(coeffs.len(), degree, "Coefficient vector must have length equal to degree");
        
        let mut result = Self { coeffs, modulus, degree };
        result.reduce();
        result
    }
    
    /// Create a zero element
    pub fn zero(modulus: i64, degree: usize) -> Self {
        Self::new(vec![0; degree], modulus, degree)
    }
    
    /// Create a one element
    pub fn one(modulus: i64, degree: usize) -> Self {
        let mut coeffs = vec![0; degree];
        coeffs[0] = 1;
        Self::new(coeffs, modulus, degree)
    }
    
    /// Create a random element
    pub fn random<R: rand::Rng>(rng: &mut R, modulus: i64, degree: usize) -> Self {
        let coeffs: Vec<i64> = (0..degree)
            .map(|_| rng.gen_range(0..modulus))
            .collect();
        Self::new(coeffs, modulus, degree)
    }
    
    /// Reduce coefficients modulo q
    fn reduce(&mut self) {
        for coeff in &mut self.coeffs {
            *coeff = (*coeff % self.modulus + self.modulus) % self.modulus;
        }
    }
    
    /// Convert to NTT representation for fast multiplication
    pub fn ntt(&self) -> NTTElement {
        NTTElement::from_standard(self)
    }
    
    /// Compute infinity norm
    pub fn infinity_norm(&self) -> i64 {
        self.coeffs.iter()
            .map(|&c| {
                let c_centered = if c > self.modulus / 2 {
                    c - self.modulus
                } else {
                    c
                };
                c_centered.abs()
            })
            .max()
            .unwrap_or(0)
    }
    
    /// Compute L2 norm squared
    pub fn l2_norm_squared(&self) -> i64 {
        self.coeffs.iter()
            .map(|&c| {
                let c_centered = if c > self.modulus / 2 {
                    c - self.modulus
                } else {
                    c
                };
                c_centered * c_centered
            })
            .sum()
    }
}

/// NTT representation for fast polynomial multiplication
#[derive(Debug, Clone)]
pub struct NTTElement {
    /// NTT coefficients
    pub ntt_coeffs: Vec<i64>,
    /// Modulus
    pub modulus: i64,
    /// Degree
    pub degree: usize,
}

impl NTTElement {
    /// Convert from standard representation
    pub fn from_standard(elem: &RingElement) -> Self {
        // Simplified NTT - in production, use optimized implementation
        // with precomputed twiddle factors
        let ntt_coeffs = ntt_forward(&elem.coeffs, elem.modulus);
        Self {
            ntt_coeffs,
            modulus: elem.modulus,
            degree: elem.degree,
        }
    }
    
    /// Convert back to standard representation
    pub fn to_standard(&self) -> RingElement {
        let coeffs = ntt_inverse(&self.ntt_coeffs, self.modulus);
        RingElement::new(coeffs, self.modulus, self.degree)
    }
    
    /// Multiply two NTT elements (pointwise)
    pub fn mul(&self, other: &NTTElement) -> NTTElement {
        assert_eq!(self.degree, other.degree);
        assert_eq!(self.modulus, other.modulus);
        
        let ntt_coeffs: Vec<i64> = self.ntt_coeffs.iter()
            .zip(&other.ntt_coeffs)
            .map(|(&a, &b)| (a as i128 * b as i128 % self.modulus as i128) as i64)
            .collect();
            
        NTTElement {
            ntt_coeffs,
            modulus: self.modulus,
            degree: self.degree,
        }
    }
}

// Simplified NTT implementation - replace with optimized version
fn ntt_forward(coeffs: &[i64], modulus: i64) -> Vec<i64> {
    // Placeholder - implement proper NTT with bit-reversal and twiddle factors
    coeffs.to_vec()
}

fn ntt_inverse(ntt_coeffs: &[i64], modulus: i64) -> Vec<i64> {
    // Placeholder - implement proper inverse NTT
    ntt_coeffs.to_vec()
}

impl Add for RingElement {
    type Output = Self;
    
    fn add(self, other: Self) -> Self {
        assert_eq!(self.degree, other.degree);
        assert_eq!(self.modulus, other.modulus);
        
        let coeffs: Vec<i64> = self.coeffs.iter()
            .zip(&other.coeffs)
            .map(|(&a, &b)| (a + b) % self.modulus)
            .collect();
            
        RingElement::new(coeffs, self.modulus, self.degree)
    }
}

impl Sub for RingElement {
    type Output = Self;
    
    fn sub(self, other: Self) -> Self {
        assert_eq!(self.degree, other.degree);
        assert_eq!(self.modulus, other.modulus);
        
        let coeffs: Vec<i64> = self.coeffs.iter()
            .zip(&other.coeffs)
            .map(|(&a, &b)| (a - b + self.modulus) % self.modulus)
            .collect();
            
        RingElement::new(coeffs, self.modulus, self.degree)
    }
}

impl Mul for RingElement {
    type Output = Self;
    
    fn mul(self, other: Self) -> Self {
        // Use NTT for efficient multiplication
        let ntt_self = self.ntt();
        let ntt_other = other.ntt();
        let ntt_result = ntt_self.mul(&ntt_other);
        ntt_result.to_standard()
    }
}

impl Matrix {
    /// Create a new matrix
    pub fn new(elements: Vec<Vec<RingElement>>) -> Self {
        let rows = elements.len();
        let cols = if rows > 0 { elements[0].len() } else { 0 };
        
        // Verify rectangular shape
        for row in &elements {
            assert_eq!(row.len(), cols, "All rows must have the same length");
        }
        
        Self { elements, rows, cols }
    }
    
    /// Create a random matrix
    pub fn random<R: rand::Rng>(
        rng: &mut R,
        rows: usize,
        cols: usize,
        modulus: i64,
        degree: usize,
    ) -> Self {
        let elements: Vec<Vec<RingElement>> = (0..rows)
            .map(|_| {
                (0..cols)
                    .map(|_| RingElement::random(rng, modulus, degree))
                    .collect()
            })
            .collect();
            
        Self::new(elements)
    }
    
    /// Matrix-vector multiplication
    pub fn mul_vec(&self, vec: &[RingElement]) -> Vec<RingElement> {
        assert_eq!(self.cols, vec.len(), "Dimension mismatch");
        
        (0..self.rows)
            .map(|i| {
                self.elements[i].iter()
                    .zip(vec)
                    .map(|(a, b)| a.clone() * b.clone())
                    .fold(
                        RingElement::zero(
                            self.elements[0][0].modulus,
                            self.elements[0][0].degree
                        ),
                        |acc, x| acc + x
                    )
            })
            .collect()
    }
    
    /// Add two matrices
    pub fn add(&self, other: &Matrix) -> Matrix {
        assert_eq!(self.rows, other.rows);
        assert_eq!(self.cols, other.cols);
        
        let elements: Vec<Vec<RingElement>> = self.elements.iter()
            .zip(&other.elements)
            .map(|(row1, row2)| {
                row1.iter()
                    .zip(row2)
                    .map(|(a, b)| a.clone() + b.clone())
                    .collect()
            })
            .collect();
            
        Matrix::new(elements)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::thread_rng;
    
    #[test]
    fn test_ring_addition() {
        let a = RingElement::new(vec![1, 2, 3, 4], 17, 4);
        let b = RingElement::new(vec![5, 6, 7, 8], 17, 4);
        let c = a + b;
        assert_eq!(c.coeffs, vec![6, 8, 10, 12]);
    }
    
    #[test]
    fn test_ring_subtraction() {
        let a = RingElement::new(vec![5, 6, 7, 8], 17, 4);
        let b = RingElement::new(vec![1, 2, 3, 4], 17, 4);
        let c = a - b;
        assert_eq!(c.coeffs, vec![4, 4, 4, 4]);
    }
    
    #[test]
    fn test_matrix_vector_multiplication() {
        let mut rng = thread_rng();
        let matrix = Matrix::random(&mut rng, 3, 2, 17, 4);
        let vec = vec![
            RingElement::random(&mut rng, 17, 4),
            RingElement::random(&mut rng, 17, 4),
        ];
        let result = matrix.mul_vec(&vec);
        assert_eq!(result.len(), 3);
    }
}
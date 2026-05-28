package mchain

import (
	"testing"
	"time"
)

func TestNewPool_SingleCluster(t *testing.T) {
	c := New("http://mpc:9800", 30*time.Second)
	p := NewPool(c)
	if p == nil {
		t.Fatal("NewPool returned nil for non-nil client")
	}
	if p.Public != c {
		t.Errorf("Public = %p, want %p", p.Public, c)
	}
	if p.Private != c {
		t.Errorf("Private = %p, want %p (single-cluster fallback)", p.Private, c)
	}
	if p.IsSplit() {
		t.Error("IsSplit() = true, want false for single-cluster pool")
	}
}

func TestNewPool_NilClient(t *testing.T) {
	if p := NewPool(nil); p != nil {
		t.Errorf("NewPool(nil) = %+v, want nil — MPC-disabled path", p)
	}
}

func TestNewSplitPool_TwoClusters(t *testing.T) {
	pub := New("http://public-mpc:9800", 30*time.Second)
	priv := New("http://private-mpc:9800", 30*time.Second)
	p := NewSplitPool(pub, priv)
	if p == nil {
		t.Fatal("NewSplitPool returned nil for two non-nil clients")
	}
	if p.Public != pub {
		t.Errorf("Public = %p, want %p", p.Public, pub)
	}
	if p.Private != priv {
		t.Errorf("Private = %p, want %p", p.Private, priv)
	}
	if !p.IsSplit() {
		t.Error("IsSplit() = false, want true for two-cluster pool")
	}
}

func TestNewSplitPool_NilPrivateFallsBackToPublic(t *testing.T) {
	pub := New("http://public-mpc:9800", 30*time.Second)
	p := NewSplitPool(pub, nil)
	if p == nil {
		t.Fatal("NewSplitPool(pub, nil) returned nil — should fall back to single-cluster")
	}
	if p.Public != pub {
		t.Errorf("Public = %p, want %p", p.Public, pub)
	}
	if p.Private != pub {
		t.Errorf("Private = %p, want %p (nil-private fallback)", p.Private, pub)
	}
	if p.IsSplit() {
		t.Error("IsSplit() = true, want false when private fell back to public")
	}
}

func TestNewSplitPool_NilPublicReturnsNil(t *testing.T) {
	priv := New("http://private-mpc:9800", 30*time.Second)
	if p := NewSplitPool(nil, priv); p != nil {
		t.Errorf("NewSplitPool(nil, priv) = %+v, want nil — public is mandatory", p)
	}
}

func TestPool_NilSafeIsSplit(t *testing.T) {
	var p *Pool
	if p.IsSplit() {
		t.Error("(*Pool)(nil).IsSplit() = true, want false")
	}
}

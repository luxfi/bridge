# Custody sign-off — single-signer ed25519 (SOL / TON / XRP)

**Purpose:** authorize the launch-phase custody model for the non-EVM corridors and
set the loss ceiling. This is hard gate #2 in `docs/GO-LIVE.md` — the ed25519
release wallets cannot be funded until this is signed and the cap is filled in.

Owner fills the **bold blanks** and signs at the bottom. One page; ~5 minutes.

---

## 1. What is being authorized

Operate the **Solana, TON, and XRP** release (payout) wallets under **single-signer
ed25519 custody** — `mpcd-single`, each wallet's key derived via HKDF from one
KMS-rooted 32-byte master seed — as the **launch-phase** custody model.

**Unchanged:** EVM (LUX/ETH/EVM majors) and BTC payouts continue on the real
3-of-5 threshold MPC cluster. They carry **no new custody risk** and are not part
of this sign-off.

## 2. Why this model (and not threshold / Fireblocks now)

In-house threshold ed25519 (FROST) is a multi-week build; Fireblocks is a
commercial integration. Both were judged too slow for the launch timeline
(owner directive, 2026-06-10). Single-signer is the fast path for the three
ed25519 chains only.

Note: the existing Fireblocks code is an **approval gate after** the MPC signs —
it does **not** stop direct on-chain theft of a self-custodied key, so it is
complementary, not a substitute for threshold custody.

## 3. The risk, in plain terms

A **single** signing key (derived from one master seed) authorizes **every**
SOL/TON/XRP payout. There is no second on-chain approver. If that key or its
master seed is compromised, an attacker can drain **up to the full balance held
in those three release wallets**. The seed itself, if lost, makes every
SOL/TON/XRP wallet **permanently unrecoverable**.

## 4. The mitigation — a hard cap (you set this)

Release-wallet balances on these chains are **hard-capped** so the maximum loss
is bounded to a hot-wallet float. The operator funds from treasury only up to the
cap and never tops a wallet above it.

> **Per-wallet cap (USD-equivalent), SOL / TON / XRP:**
>
> - SOL release wallet:  **$ __________**
> - TON release wallet:  **$ __________**
> - XRP release wallet:  **$ __________**
>
> _(Or a single uniform cap across all three: **$ __________**.)_
>
> **Aggregate ceiling across all three (optional):** **$ __________**

**Reconcile with the per-swap limit.** The bridge currently allows up to
**$100,000 per single swap** (`limits.maxUSD` in the deploy ConfigMap), with no
per-asset override for SOL/TON/XRP. A release wallet capped *below* the largest
single swap it must pay will stall that swap ("insufficient funds in release
address"). So either set each cap **≥ the largest single SOL/TON/XRP swap you
want to allow**, or lower the per-asset max to match the cap:

> **Max single swap for SOL/TON/XRP (USD):** **$ __________**  _(must be ≤ the cap above; default today is $100,000)_

## 5. This is reversible

Single-signer is an **interim** model. Upgrading to FROST threshold or Fireblocks
later is an `--eddsa-url` flag-flip via the `mpc-router` — no redeploy and no swap
downtime. Suggested upgrade trigger (owner may set): when aggregate ed25519 volume
or balance exceeds **$ __________**, or by **__________ (date)**.

---

## Sign-off

> I accept the single-signer ed25519 custody risk for the Solana, TON, and XRP
> release wallets, bounded by the per-wallet caps in §4 above. I authorize launch
> under this model and acknowledge the master-seed-loss and key-compromise risks
> in §3.

- **Name / role:** ______________________________
- **Signature:** ______________________________
- **Date:** ______________________________

---

_Filed for `docs/GO-LIVE.md` hard gate #2. Once returned, the operator funds the
SOL/TON/XRP release wallets to the caps above and the ed25519 corridors go live
(`docs/operator-deploy-ed25519.md`)._

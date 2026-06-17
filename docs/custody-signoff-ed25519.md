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

## 4. The mitigation — a capped hot wallet + treasury reserve (you set the cap)

The goal is high liquidity (swaps never stall) **without** parking a large
at-risk balance on the single-signer key. We get both with the standard
hot/warm split:

- **Hot release wallet (on the single-signer key): capped LOW.** This is the
  only balance an attacker could drain, so it *is* the worst-case loss. Cap it
  to a hot-wallet float you'd accept losing.
- **Treasury reserve (off the signer): holds the bulk.** Not reachable by the
  ed25519 key — so it doesn't count toward the loss ceiling.
- **Top-up:** the operator refills the hot wallet from treasury as it drains
  (alert at a low-water mark) and **never tops above the cap.** Swaps don't
  stall (treasury keeps refilling) and the at-risk amount stays bounded.

> **Hot release-wallet cap (USD-equivalent) — the worst-case loss per chain:**
>
> - SOL hot wallet:  **$ __________**
> - TON hot wallet:  **$ __________**
> - XRP hot wallet:  **$ __________**
>
> _(Or one uniform hot cap across all three: **$ __________**.)_
>
> **Low-water alert / top-up threshold:** **$ __________**
> **Treasury reserve earmarked for ed25519 top-ups (off the signer):** **$ __________**

**Reconcile with the per-swap limit.** The bridge allows up to **$100,000 per
single swap** (`limits.maxUSD`), with no per-asset override for SOL/TON/XRP. A
single swap larger than the *current* hot balance stalls until the next top-up,
so set the hot cap **≥ the largest single swap you want to clear without a manual
refill**, or lower the per-asset max:

> **Max single swap for SOL/TON/XRP (USD):** **$ __________**  _(≤ the hot cap; default today is $100,000)_

> **Today's limitation:** the bridge does not auto-refill or auto-sweep yet —
> top-ups are manual against a balance alert. So pick a hot cap comfortably above
> normal per-swap size (to keep refills infrequent) but low enough that the
> worst-case loss is acceptable. Auto-sweep is the path to a permanently-tiny hot
> balance at any throughput; it's deferred post-launch.

## 5. This is reversible

Single-signer is an **interim** model. Upgrading to FROST threshold or Fireblocks
later is an `--eddsa-url` flag-flip via the `mpc-router` — no redeploy and no swap
downtime. Suggested upgrade trigger (owner may set): when aggregate ed25519 volume
or balance exceeds **$ __________**, or by **__________ (date)**.

---

## Sign-off

> I accept the single-signer ed25519 custody risk for the Solana, TON, and XRP
> release wallets, bounded by the **hot-wallet caps in §4** (hot/warm split — the
> bulk of liquidity stays in treasury, off the signer). I authorize launch under
> this model and acknowledge the master-seed-loss and key-compromise risks in §3.

- **Name / role:** ______________________________
- **Signature:** ______________________________
- **Date:** ______________________________

---

_Filed for `docs/GO-LIVE.md` hard gate #2. Once returned, the operator funds the
SOL/TON/XRP release wallets to the caps above and the ed25519 corridors go live
(`docs/operator-deploy-ed25519.md`)._

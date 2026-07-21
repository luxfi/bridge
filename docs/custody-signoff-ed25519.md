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
> - SOL hot wallet:  **$10,000** _(draft — see Rationale below)_
> - TON hot wallet:  **$10,000** _(draft)_
> - XRP hot wallet:  **$10,000** _(draft)_
>
> _(Or one uniform hot cap across all three: **$10,000**. Proposing uniform at
> launch for operational simplicity — split per-chain later once real volume
> shows a chain-specific pattern.)_
>
> **Low-water alert / top-up threshold:** **$3,000 per chain** _(draft)_
> **Treasury reserve earmarked for ed25519 top-ups (off the signer):** **$50,000** _(draft)_

**Reconcile with the per-swap limit.** The bridge allows up to **$100,000 per
single swap** (`limits.maxUSD`), with no per-asset override for SOL/TON/XRP. A
single swap larger than the *current* hot balance stalls until the next top-up,
so set the hot cap **≥ the largest single swap you want to clear without a manual
refill**, or lower the per-asset max:

> **Max single swap for SOL/TON/XRP (USD):** **$2,500** _(draft — well under the
> hot cap and far under the $100,000 global default; see Rationale below)_

> **Today's limitation:** the bridge does not auto-refill or auto-sweep yet —
> top-ups are manual against a balance alert. So pick a hot cap comfortably above
> normal per-swap size (to keep refills infrequent) but low enough that the
> worst-case loss is acceptable. Auto-sweep is the path to a permanently-tiny hot
> balance at any throughput; it's deferred post-launch.

## 5. This is reversible

Single-signer is an **interim** model. Upgrading to FROST threshold or Fireblocks
later is an `--eddsa-url` flag-flip via the `mpc-router` — no redeploy and no swap
downtime. Suggested upgrade trigger (owner may set): when aggregate ed25519 volume
or balance exceeds **$250,000** _(draft)_, or by **60 days after Phase 2 launch**
_(draft — a date wasn't fixed since the launch date itself is still pending this
sign-off; convert to a calendar date once that's known)_.

## Rationale for the draft numbers above (delete this section before signing)

These are a proposal, not a decision — Claude can't accept custody risk on
anyone's behalf, only draft a defensible starting point for the owner to
adjust. Reasoning:

- **Deliberately conservative at launch.** This bridge has zero live track
  record on single-signer ed25519 custody. The numbers below are sized to
  make the worst case small and boring, not to match the throughput the
  corridors could eventually support. Raise them once operational history
  (uptime, top-up cadence, no incidents) earns the confidence.
- **$10,000 uniform hot cap → $30,000 total worst-case loss** across SOL +
  TON + XRP combined if the master seed is ever compromised. That's the
  actual number being accepted in §3 — small enough to be a real, absorbable
  loss rather than an existential one, without needing three separate
  judgment calls before launch.
- **$2,500 max swap** keeps the hot cap ($10,000) at 4x the largest single
  swap, so a handful of swaps clear back-to-back before a top-up is needed —
  the reconciliation rule in §4 (hot cap ≥ largest swap) holds with real
  headroom, not just barely. $2,500 also comfortably covers realistic retail
  swap sizes without inheriting the $100,000 ceiling that was set for the
  already-proven threshold-custodied EVM/BTC corridors, not this one.
- **$3,000 low-water alert (30% of hot cap)** leaves roughly one more swap's
  worth of runway after the alert fires before the wallet could actually hit
  zero and stall a swap — enough buffer for a manual top-up (no auto-refill
  yet, per §4) to happen without users noticing.
- **$50,000 treasury reserve** ≈ 5 top-up cycles at $10,000 before the
  operator needs to source more funds. This number is pure liquidity
  planning, not risk (it's off-signer, doesn't add to the loss ceiling in
  §3) — size it to whatever you're actually comfortable earmarking; it
  doesn't need to be conservative the way the hot cap does.
- **$250k / 60-day upgrade trigger** forces a revisit on whichever comes
  first — enough volume to prove the model, or enough elapsed time that
  "we'll upgrade later" needs to become a real decision instead of an
  indefinite deferral.

If your actual risk tolerance or treasury allocation differs, the only
numbers that need to change are in §4 and §5 above — nothing else in this
document depends on the specific values.

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

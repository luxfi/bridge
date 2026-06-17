#!/usr/bin/env bash
# =============================================================================
# Phase 2 go-live — ed25519 corridors (Solana / TON / XRP) on the live lux-bridge
# =============================================================================
# Adds mpcd-single (single-signer ed25519) + mpc-router in front of the signer,
# repoints the bridge through the router, enables the corridors (they ship
# DISABLED), and RUNS THE G8 NO-DEPOSIT GATE as a hard stop before you fund.
#
# Builds on Phase 1 (scripts/deploy-phase1.sh). EVM+BTC keep talking to the real
# ECDSA cluster; this only adds the ed25519 leg. Rollback is at the bottom and is
# independent of EVM/BTC.
#
# ── HARD GATES (docs/operator-deploy-ed25519.md, docs/custody-signoff-ed25519.md)
#   1. The running bridge image carries the G8 source baseline gate. Verified
#      here by image tag (a335a9f6 was strings-verified to contain the gate at
#      build) — the pods are distroless, so we can't run `strings` inside them.
#   2. Single-signer custody accepted IN WRITING + release balances CAPPED. You
#      enforce the cap at funding time (final step) per the signed-off ceiling.
#
# ── PREREQUISITES (this script does NOT do these)
#   • Phase 1 live: deploy/lux-bridge exists (run scripts/deploy-phase1.sh first).
#   • Master-seed Secret created + BACKED UP. One-time, owner-controlled:
#
#       SEED_HEX=$(openssl rand -hex 32)
#       echo "$SEED_HEX"   # <-- copy to break-glass / password manager NOW;
#                          #     losing it strands every SOL/TON/XRP wallet.
#       kubectl -n lux-bridge create secret generic mpcd-single-secret \
#         --from-literal=master.seed="$SEED_HEX"
#
#   • Images pushed: ghcr.io/luxfi/{mpcd-single,mpc-router}:de3a912a
#
# Requires `kubectl`, `curl`, `python3`, `openssl` on the operator box.
# =============================================================================
set -euo pipefail

K="kubectl --request-timeout=30s"
NS=lux-bridge
G8_OK_TAGS="a335a9f6"   # space-separated allowlist of strings-verified G8 bridge tags

# pf <svc> <localport> <remoteport> : open a port-forward, echo its PID
pf() { $K -n "$NS" port-forward "svc/$1" "$2:$3" >/dev/null 2>&1 & echo $!; }

echo "==> 0. Preflight (gates + prerequisites)"
$K -n "$NS" get deploy lux-bridge        >/dev/null 2>&1 || { echo "!! Phase 1 not deployed (no deploy/lux-bridge). Run scripts/deploy-phase1.sh first."; exit 1; }
$K -n "$NS" get secret mpcd-single-secret >/dev/null 2>&1 || { echo "!! master-seed Secret 'mpcd-single-secret' missing — create + BACK UP first (see header). Aborting."; exit 1; }
$K -n "$NS" get secret bridge-mpc-token   >/dev/null 2>&1 || { echo "!! bridge-mpc-token missing (router ECDSA auth). Aborting."; exit 1; }
# Gate 1: running bridge image must be a known-G8 tag.
IMG=$($K -n "$NS" get deploy lux-bridge -o jsonpath='{.spec.template.spec.containers[?(@.name=="bridge")].image}')
TAG=${IMG##*:}; OK=no; for t in $G8_OK_TAGS; do [ "$TAG" = "$t" ] && OK=yes; done
[ "$OK" = yes ] && echo "    Gate 1 (G8): running image $IMG is a verified-G8 tag" \
  || { echo "!! Gate 1 FAILED: running bridge image $IMG is not in the G8 allowlist ($G8_OK_TAGS). Do NOT enable ed25519. Aborting."; exit 1; }
for img in mpcd-single mpc-router; do
  docker manifest inspect "ghcr.io/luxfi/$img:de3a912a" >/dev/null 2>&1 \
    && echo "    image $img:de3a912a pushed" \
    || echo "    !! WARNING ghcr.io/luxfi/$img:de3a912a not in registry — push it or rollout ImagePullBackOffs"
done
echo "    Gate 2 (custody): confirm the cap in docs/custody-signoff-ed25519.md is SIGNED before funding (enforced at the funding step)."

echo "==> 1. Deploy mpcd-single + mpc-router"
$K apply -f k8s/mpcd-single-deployment.yaml
$K apply -f k8s/mpc-router-deployment.yaml
$K -n "$NS" rollout status deploy/mpcd-single --timeout=120s
$K -n "$NS" rollout status deploy/mpc-router  --timeout=120s

echo "==> 2. Health checks (distroless pods → port-forward + curl from here)"
P=$(pf mpc-router 19700 9700); sleep 3
curl -fsS http://127.0.0.1:19700/healthz && echo "  <- mpc-router /healthz"
kill "$P" 2>/dev/null || true
P=$(pf mpcd-single 19900 9900); sleep 3
curl -fsS http://127.0.0.1:19900/healthz && echo "  <- mpcd-single /healthz"
kill "$P" 2>/dev/null || true

echo "==> 3. Repoint the bridge through the router (+ explicit ed25519 dest RPCs; defaults exist, swap to PAID endpoints for prod throughput)"
$K -n "$NS" set env deploy/lux-bridge \
  BRIDGE_MPC_URL=http://mpc-router.lux-bridge.svc:9700 \
  BRIDGE_SOLANA_RPC_URL=https://solana-rpc.publicnode.com \
  BRIDGE_TON_RPC_MAINNET_URL=https://toncenter.com/api/v2 \
  BRIDGE_XRP_RPC_MAINNET_URL=https://xrplcluster.com
$K -n "$NS" rollout status deploy/lux-bridge --timeout=180s

echo "==> 4. Enable SOL/TON/XRP in the ConfigMap (they ship disabled) + roll"
python3 - <<'PY' | $K apply -f -
import yaml, sys
docs = list(yaml.safe_load_all(open("k8s/bridge-deployment.yaml")))
cm = next(d for d in docs if d and d.get("kind") == "ConfigMap")
net = yaml.safe_load(cm["data"]["networks.yaml"])
for t in net.get("tokens", []):
    if t.get("asset") in ("SOL", "TON", "XRP"):
        t["isDepositEnabled"] = True
        t["isWithdrawalEnabled"] = True
cm["data"]["networks.yaml"] = yaml.safe_dump(net, sort_keys=False)
yaml.safe_dump(cm, sys.stdout, sort_keys=False)
PY
$K -n "$NS" rollout restart deploy/lux-bridge
$K -n "$NS" rollout status  deploy/lux-bridge --timeout=180s

echo "==> 5. G8 NO-DEPOSIT GATE — unfunded SOL->LUX swap MUST stay user_deposit_pending"
BODY='{"amount":1,"source_network":"SOLANA_MAINNET","source_asset":"SOL","destination_network":"LUX_MAINNET","destination_asset":"LUX","destination_address":"0x000000000000000000000000000000000000dEaD","sender":"So11111111111111111111111111111111111111112","refuel":false}'
P=$(pf lux-bridge 18080 80); trap 'kill $P 2>/dev/null || true' EXIT; sleep 4
ID=$(curl -fsS -X POST -H 'Content-Type: application/json' -d "$BODY" http://127.0.0.1:18080/v1/bridge/swaps \
     | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("data",d).get("id",""))')
[ -n "$ID" ] || { echo "!! swap-create failed — check API/body. NOT funding. Aborting."; exit 1; }
echo "    created UNFUNDED swap id=$ID — waiting 120s; the deposit watcher must NOT confirm it"
sleep 120
ST=$(curl -fsS "http://127.0.0.1:18080/v1/bridge/swaps/$ID" \
     | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("data",d).get("status",""))')
kill "$P" 2>/dev/null || true; trap - EXIT
echo "    status after 120s: $ST"
if [ "$ST" = "user_deposit_pending" ]; then
  echo "    ✅ G8 GATE HOLDS — unfunded swap did not auto-confirm."
else
  echo "    ❌ G8 GATE FAILED (status=$ST) — DISABLE ed25519 NOW (see ROLLBACK) and DO NOT FUND."
  exit 1
fi

cat <<EOF

==> Phase 2 plumbing is live and the G8 gate passed.
    Next (manual, gated on the SIGNED custody cap):
      1. Run one real low-value swap each direction per corridor and confirm
         settlement (router log shows family=eddsa -> mpcd-single for SOL/TON/XRP).
      2. Discover each release address (distroless-safe — the swap row carries
         it as release_address). Port-forward the bridge and read it from a swap
         whose DESTINATION is that network:
           kubectl -n $NS port-forward svc/lux-bridge 18080:80 &
           curl -fsS http://127.0.0.1:18080/v1/bridge/swaps/<id> \\
             | python3 -c 'import sys,json;print(json.load(sys.stdin).get("data",{}).get("release_address"))'
      3. Fund each SOL/TON/XRP release address from treasury, CAPPED to the
         docs/custody-signoff-ed25519.md ceiling. Never top above the cap.
EOF

# =============================================================================
# ROLLBACK (ed25519 only — EVM/BTC unaffected):
#   # 1. point the bridge back at the real cluster directly:
#   kubectl -n lux-bridge set env deploy/lux-bridge \
#     BRIDGE_MPC_URL=http://mpc-api-svc.lux-bridge.svc:8081
#   kubectl -n lux-bridge rollout status deploy/lux-bridge
#   # 2. disable the corridors again (re-apply ConfigMap with the flags false):
#   #    re-run scripts/deploy-phase1.sh's apply, or kubectl edit configmap lux-bridge-config
#   #    set SOL/TON/XRP is{Deposit,Withdrawal}Enabled=false, then rollout restart.
#   # 3. (optional) scale the ed25519 services down:
#   kubectl -n lux-bridge scale deploy/mpc-router deploy/mpcd-single --replicas=0
# =============================================================================

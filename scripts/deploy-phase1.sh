#!/usr/bin/env bash
# =============================================================================
# Phase 1 go-live — unified Go bridge (EVM + BTC) onto the EXISTING lux-bridge ns
# =============================================================================
# Tailored to the live cluster topology (verified 2026-06-17), which is NOT the
# greenfield layout docs/operator-deploy-phase-1-4.md assumes:
#
#   * bridge.lux.network + bridge-api.lux.network already resolve to the SHARED
#     multi-host ingress `bridge-ingress` (LB 24.199.69.68). So cutover is an
#     in-place INGRESS BACKEND SWAP, not a DNS change. TLS (`bridge-lux-tls`)
#     covers both hosts in the ingress tls: block and is untouched by a backend
#     swap -> HTTPS stays valid, no cert reissue.
#   * The MPC API token is in Secret `bridge-mpc-token` (key MPC_API_TOKEN),
#     already present (legacy bridge-server uses it). Phase 1 needs NO new secret.
#     (The manifest's BRIDGE_MPC_TOKEN secretKeyRef is pinned to it.)
#   * The bundled `lux-bridge` Ingress in the manifest WOULD COLLIDE with
#     bridge-ingress on the same hosts, so we apply everything EXCEPT it.
#   * SOL/TON/XRP ship DISABLED in the ConfigMap (Phase 2 enables them); this
#     deploy is EVM + BTC only, on the real ECDSA cluster (mpc-api-svc:8081).
#
# Legacy bridge-ui/bridge-server are LEFT RUNNING for soak. Rollback = re-point
# the ingress backends (see ROLLBACK at the bottom). Safe to re-run (idempotent
# apply); the cutover step asks for confirmation.
#
# PREREQUISITE: `docker push ghcr.io/luxfi/bridge:a335a9f6` must have run first.
# =============================================================================
set -euo pipefail

K="kubectl --request-timeout=30s"
NS=lux-bridge
IMG=ghcr.io/luxfi/bridge:a335a9f6
MF="$(cd "$(dirname "$0")/.." && pwd)/k8s/bridge-deployment.yaml"

echo "==> 0. Preflight"
$K -n "$NS" get secret bridge-mpc-token   >/dev/null && echo "    bridge-mpc-token: present"
$K -n "$NS" get svc    mpc-api-svc        >/dev/null && echo "    mpc-api-svc (ECDSA backend): present"
$K -n "$NS" get ingress bridge-ingress    >/dev/null && echo "    bridge-ingress: present"
docker manifest inspect "$IMG" >/dev/null 2>&1 \
  && echo "    image $IMG: pushed" \
  || echo "    !! WARNING: $IMG not found in registry (run 'docker push $IMG' first; deploy will ImagePullBackOff)"

echo "==> 1. Apply compute (ConfigMap + PVC + Deployment + Service) — NOT the bundled Ingress"
python3 - "$MF" <<'PY' | $K apply -f -
import sys, yaml
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d and d.get("kind") != "Ingress"]
yaml.safe_dump_all(docs, sys.stdout, sort_keys=False)
PY

echo "==> 2. Wait for rollout"
if ! $K -n "$NS" rollout status deploy/lux-bridge --timeout=180s; then
  echo "!! rollout failed:"; $K -n "$NS" get pods -l app=lux-bridge
  echo "   If ImagePullBackOff, create a ghcr pull secret + attach it, then re-run:"
  echo "     $K -n $NS create secret docker-registry ghcr-pull \\"
  echo "        --docker-server=ghcr.io --docker-username=<gh-user> --docker-password=<gh-PAT>"
  echo "     $K -n $NS patch deploy lux-bridge -p \\"
  echo "        '{\"spec\":{\"template\":{\"spec\":{\"imagePullSecrets\":[{\"name\":\"ghcr-pull\"}]}}}}'"
  exit 1
fi

echo "==> 3. Internal smoke test (before any live traffic)"
$K -n "$NS" port-forward svc/lux-bridge 18080:80 >/dev/null 2>&1 &
PF=$!; trap 'kill $PF 2>/dev/null || true' EXIT; sleep 4
curl -fsS http://127.0.0.1:18080/health >/dev/null && echo "    /health: OK"
N=$(curl -fsS http://127.0.0.1:18080/v1/bridge/networks | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')
echo "    networks served: $N"
Q=$(curl -fsS 'http://127.0.0.1:18080/v1/bridge/quote?source_network=ETHEREUM_MAINNET&source_token=ETH&destination_network=LUX_MAINNET&destination_token=LUX&amount=1&refuel=0' \
     | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["quote"]["receive_amount"])')
echo "    ETH->LUX quote receive_amount: $Q  (positive = price feed live)"
kill $PF 2>/dev/null || true; trap - EXIT

echo "==> 4. CUTOVER — swap bridge-ingress backends to lux-bridge"
echo "    current backends:"
$K -n "$NS" get ingress bridge-ingress -o jsonpath='{range .spec.rules[*]}      {.host}{" -> "}{.http.paths[0].backend.service.name}{":"}{.http.paths[0].backend.service.port.number}{"\n"}{end}'
# Safety: confirm rule order before patching by index.
H0=$($K -n "$NS" get ingress bridge-ingress -o jsonpath='{.spec.rules[0].host}')
H1=$($K -n "$NS" get ingress bridge-ingress -o jsonpath='{.spec.rules[1].host}')
if [ "$H0" != "bridge.lux.network" ] || [ "$H1" != "bridge-api.lux.network" ]; then
  echo "!! rule order changed (rule0=$H0 rule1=$H1) — patch indices unsafe. Edit ingress manually."; exit 1
fi
read -r -p "    Proceed with live cutover of bridge.lux.network + bridge-api.lux.network? [y/N] " ok
[ "$ok" = "y" ] || { echo "    cutover skipped — new stack is deployed + smoke-passed, traffic still on legacy."; exit 0; }
$K -n "$NS" patch ingress bridge-ingress --type=json -p '[
 {"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/name","value":"lux-bridge"},
 {"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/port/number","value":80},
 {"op":"replace","path":"/spec/rules/1/http/paths/0/backend/service/name","value":"lux-bridge"},
 {"op":"replace","path":"/spec/rules/1/http/paths/0/backend/service/port/number","value":80}
]'

echo "==> 5. Verify over public HTTPS"
sleep 6
curl -fsS https://bridge-api.lux.network/health >/dev/null && echo "    https://bridge-api.lux.network/health: OK"
echo "DONE — EVM + BTC live on the unified Go bridge. Legacy left running for soak."
echo "Next: fund the EVM/BTC release wallets after first swaps (operator-deploy-phase-1-4.md Step 6)."

# =============================================================================
# ROLLBACK — point the hosts back at the legacy stack (instant, TLS unaffected):
#
#   kubectl -n lux-bridge patch ingress bridge-ingress --type=json -p '[
#    {"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/name","value":"bridge-ui"},
#    {"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/port/number","value":80},
#    {"op":"replace","path":"/spec/rules/1/http/paths/0/backend/service/name","value":"bridge-server"},
#    {"op":"replace","path":"/spec/rules/1/http/paths/0/backend/service/port/number","value":3000}
#   ]'
# =============================================================================

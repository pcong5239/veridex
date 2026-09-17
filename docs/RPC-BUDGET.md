# Frontend RPC Budget

Required only for a GenLayer-connected frontend. Studio deployment/testing does not use this artifact.

## Applicability

RPC_BUDGET_REVISION: SPEC_LOCK-2026-09-16
OFFICIAL_DOCS_CHECKED: 2026-09-16 — GenLayer networks, deployment/network configuration, and genlayer-js references
FRONTEND_SCOPE: APPLICABLE — public reads plus user-authorized writes on Studio Next

Use APPLICABLE or NOT_APPLICABLE: <checked dependency-boundary reason>.

## FRONTEND RPC BUDGET MATRIX

FRONTEND_MATRIX_STATUS: READY
MULTI_CLIENT_JUSTIFICATION: NOT_REQUIRED

Required before implementing or repairing any GenLayer-connected frontend, including read-only frontends.

| Screen/workflow | Request source | RPC method | Trigger | Cache key / TTL | In-flight dedupe | Invalidation | Poll interval / attempts | Retry/backoff/cancel | Planned maximum | Transaction count | Terminal/readback condition |
|---|---|---|---|---|---|---|---|---|---:|---:|---|
| Layer 1 network status | coordinator | chain/network identity read | initial visible load | network / 8s | yes | network change | none | bounded transport retry; abort on unmount | 2 | 0 | canonical chain identity or visible unavailable state |
| Workspace overview | coordinator | contract view batch | workspace open/manual refresh | address+method+args / 8s | yes | verified write/network change | none | `429`/`5xx` bounded; `Retry-After`; abort | 6 | 0 | parsed authoritative view or visible error |
| Revision timeline | coordinator | paginated contract view | selected chain load | chain+address+method+args / 8s | yes | relevant verified write/network change | none | same bounded policy; abort on selection change | 1 | 0 | bounded first revision page accepted |
| Channel audit history | coordinator | `get_audit_events_json` pages of 50 | selected channel load/manual refresh | chain+address+method+offset+limit / 8s | yes per page | relevant verified write/network change | none | `429`/`5xx` bounded; `Retry-After`; abort on selection change | 6 | 0 | pages 0–250 loaded until short page; at most 256 retained events |
| Wallet connect/switch | selected EIP-6963 provider | EIP-1193 account/chain methods | explicit user action | none | single active request | provider/account change | none | cancel/settle once; no fallback provider | 4 | 0 | selected provider reports account + 61997 |
| Contract write | selected provider + coordinator | simulate/send then receipt/readback | explicit confirmed action | journal by intent/hash | single-flight | relevant read keys after success | 3s, backoff max 10s; max 36 polls | hidden pause; provider abort; never auto-resubmit | 42 | 1 | terminal finality + semantic success + method-specific readback |
| Reconciliation | coordinator | receipt + method-specific view | reload/manual resume with stored hash | hash/journal | one monitor | after authoritative resolution | 3s, backoff max 10s; max 36 polls | no replacement transaction | 40 | 0 | safe terminal failure or authoritative state proof |

For a read-only frontend, record transaction count `0`; do not invent write requirements. If no GenLayer frontend exists, record `NOT APPLICABLE` and the checked dependency boundary.

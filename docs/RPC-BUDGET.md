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

## FRONTEND RPC BUDGET EVIDENCE

FRONTEND_EVIDENCE_STATUS: COMPLETE

Measured release: `dpl_7UEPb2cXSD5b4NBEYqgSg8FCjXpC` at `https://veridex-khaki.vercel.app`.

Measure the exact deployed critical journeys before the applicable checkpoint and release.

| Screen/workflow | Request source/method | Actual requests | Cache hit/miss | In-flight dedupe | Poll attempts | Retry/delay | Invalidations | Readback calls | Actual transactions | Variance/result |
|---|---|---:|---|---|---:|---|---|---:|---:|---|
| Disconnected public workspace | coordinator: channels, config, upgrade status, chains, audit page, operative alert, revisions | 7 | 0/7 on clean load | no duplicates observed | 0 | 0 | 0 | 0 | 0 | Within budget; public data and audit history rendered without a wallet |
| Connect OKX Wallet | selected EIP-6963 provider plus subscription and acknowledgement views | 2 wallet identity/network calls; 2 contract views | public reads reused within 8-second cache | one selected provider | 0 | 0 | account-scoped views loaded | 2 | 0 | Exact account `0x8114...eBfB`, chain 61997 |
| Subscribe channel 1 | simulate, fee derivation, selected-provider send, GenLayer transaction polling | 4 finality polls | consequential reads uncached after invalidation | one active monitor | 4 | 2.5s bounded exponential backoff | all read cache cleared after finality | 1 subscription read plus reload reconciliation | 1 | Hash retained; no replacement transaction; final readback `SUBSCRIBED` |
| Acknowledge epoch 2 | simulate, fee derivation, selected-provider send, GenLayer transaction polling | 3 finality polls | consequential reads uncached after invalidation | one active monitor | 3 | 2.5s bounded exponential backoff | all read cache cleared after finality | 1 acknowledgement read plus reload reconciliation | 1 | Hash retained; no replacement transaction; final readback epoch 2/2 |
| Invalid refresher input | local bounded URN validation | 0 | not applicable | not applicable | 0 | 0 | 0 | 0 | 0 | Invalid and 257-character inputs stayed disabled; no RPC or wallet request |
| Final-release reconciliation | coordinator `getTransaction` plus account-scoped views | 1 transaction lookup; 2 contract views | clean release load | one retained hash | 1 | no retry required | resolved journal entry | 2 | 0 | Raw numeric `7/1` and named finality both resolved; warning cleared |

## Closure

- No unexplained multiple read clients.
- No render/Strict-Mode request amplification.
- Polling is bounded and tears down on hidden, unmounted, disconnected, settled and aborted states.
- `429`/transport retry is bounded, honors `Retry-After` when supplied and supports cancellation.
- A returned transaction hash is reconciled; no automatic or duplicate resubmission occurs.
- Mandatory finality, semantic execution and authoritative readback remain intact.
- Measurements must be captured against the exact deployed frontend release.

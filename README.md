# Veridex

Veridex turns live National Weather Service alert revisions into a consensus-backed operational record on GenLayer.

## Verified links

- Live app: added after the production Vercel deployment
- Public repository: https://github.com/pcong5239/veridex
- Studio development preview explorer: https://explorer-studio-dev.genlayer.com
- Intelligent Contract: `0xb655FCc6338D77E117Ee8192bcF2D85759226a40`
- Deployment transaction: `0x533b6f6dd96207b4890828ee0b9dcd21741b092945b3fda7e20180bf1be79d14`
- [Deployment and verification evidence](docs/VERIFICATION.md)

## The trust problem

Emergency alerts evolve. A later update can change instructions, severity, affected zones, or cancellation state, while a reader may still be acting on an earlier revision. A submitter cannot be trusted to supply the alert body, lineage, or verdict they want recorded, and one validator must not decide the outcome alone.

## Why GenLayer is essential

The Intelligent Contract derives the official `api.weather.gov` URL from a strict NWS alert URN. The leader and validators independently fetch the candidate and its bounded reference lineage, normalize the evidence, verify event identity, and compare every consequential field through GenLayer consensus. Only an agreed valid update or cancellation can replace the operative revision on-chain. Missing, malformed, unrelated, cyclic, conflicting, or unavailable evidence fails closed without inventing instructions.

This is not an oracle-fed EVM workflow: nondeterministic web access, validator equivalence, consensus, and atomic state consequences are the core product mechanism.

## How it works

1. A channel admin creates a channel, freezes one to five NWS UGC zones, and activates it.
2. Any wallet submits an exact NWS alert URN. The contract derives and fetches the official source; callers cannot submit arbitrary URLs or alert JSON.
3. Validators agree on identity, lineage, timestamps, zones, CAP fields, instruction change, and outcome.
4. A valid revision advances the canonical chain and epoch atomically. Existing acknowledgements become stale when the operative epoch changes.
5. Subscribers acknowledge one exact `(channel, root URN, epoch)`. Readers can inspect the timeline and audit history without connecting a wallet.

## Architecture

- `contracts/veridex.py` — the Intelligent Contract, validator logic, bounded storage, state machines, authorization, views, and upgrade entrypoint.
- `frontend/` — a static React/Vite product site and operational workspace. It has no backend, no cron, and no browser-side NWS polling.
- `tests/` — Direct Mode contract coverage plus frontend parser, wallet, RPC, write-lifecycle, component, and accessibility tests.
- On-chain source of truth — channel state, canonical revisions, epochs, acknowledgements, subscriptions, and audit events.
- Off-chain evidence — exact official NWS responses fetched independently during consensus; only bounded normalized evidence is stored.

The frontend has two layers: a public explanation and documentation surface at `/`, then the contract-backed workspace at `/app`.

## Intelligent Contract

Actors are channel admins, subscribers, permissionless refreshers, public readers, validators, and the locked Root Slot upgrader. Core state machines are:

- Channel: `DRAFT -> ACTIVE -> CLOSED`
- Alert chain: `ABSENT -> ACTIVE -> UPDATED* -> CANCELLED | EXPIRED`
- Acknowledgement: `UNACKNOWLEDGED -> ACKNOWLEDGED -> STALE`

The ten write methods are `create_channel`, `activate_channel`, `close_channel`, `subscribe`, `unsubscribe`, `ingest_alert`, `refresh_chain`, `derive_expiry`, `acknowledge`, and `upgrade`. Sixteen view methods expose bounded primitive or JSON results. The complete protocol and limits are in [the specification](docs/SPECIFICATION.md).

## Transaction lifecycle

The user selects a detected MetaMask, OKX Wallet, or Rabby provider and explicitly confirms each write. Veridex records intent before signature, simulates and estimates the call, stores the returned hash, and monitors one transaction at a time. Success requires terminal finality, semantic execution success, and method-specific authoritative readback. Polling is bounded, pauses while hidden, backs off on transient failures, and never automatically resubmits a write. A retained hash is reconciled before retry becomes available.

## Run locally

Prerequisites: Python 3.12+, Node.js 22+, and npm.

```powershell
git clone https://github.com/pcong5239/veridex.git
cd veridex
npm ci --prefix frontend
Copy-Item frontend/.env.example frontend/.env.local
```

Set this public deployment value in `frontend/.env.local`:

```dotenv
VITE_CONTRACT_ADDRESS=0xb655FCc6338D77E117Ee8192bcF2D85759226a40
```

Then start the frontend:

```powershell
npm run dev --prefix frontend
```

The locked network is Studio development preview: chain `61997`, RPC `https://studio-dev.genlayer.com/api`, explorer `https://explorer-studio-dev.genlayer.com`.

## Tests and verification

```powershell
python -m pytest -q
npm test --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend
```

Current exact-release results: 20 contract tests passed, 70 frontend tests passed, TypeScript typecheck passed, and the production build passed. The deployed contract source readback is byte-identical to `contracts/veridex.py`; see [verification evidence](docs/VERIFICATION.md).

## Deployment and recovery

Veridex is deployed on the GenLayer Studio development preview, chain `61997`, using GenVM `v0.6.0-rc5`. The deployment finalized with accepted consensus and majority agreement. The deployer is the sole initial Root Slot upgrader; losing that key removes the ability to upgrade unless authority is transferred first. If transaction observation is interrupted, preserve the hash and reconcile lifecycle plus authoritative state before considering another submission.

## Security and trust boundaries

- The contract accepts only strict NWS alert URNs and derives the official URL itself.
- Every bounded direct reference must match the same event identity before a state-changing lineage outcome.
- Transport failure, `429`, `5xx`, malformed or oversized data, missing predecessors, cycles, unrelated references, and validator disagreement fail closed.
- UI role labels never grant authority; contract authorization is decisive.
- Wallet providers are selected explicitly and never expose secrets to Veridex.
- An acknowledgement proves an on-chain coordination record, not that a person received or acted on an emergency instruction.

## Known limitations

- The Studio development preview can reset and is not a durable production network.
- Veridex does not originate alerts, replace official NWS/local-authority instructions, deliver push notifications, forecast weather, control evacuation, or prove physical action.
- Limits are 32 channels, 16 chains per channel, 8 revisions per chain, 64 subscribers per channel, and 1–5 frozen UGC zones per channel.
- Full alert bodies and instructions are not stored on-chain; readers follow the official NWS source for complete current guidance.

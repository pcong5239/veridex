# Veridex — Locked Specification

Status: `SPEC_LOCKED` for implementation.  
Category: `PROJECT`.  
Economics: `NON-ECONOMIC`.  
Network: Studio development preview / Studio Next only (`studio-dev`, chain `61997`).

## Product boundary

Veridex maintains a consensus-backed canonical revision chain for NWS `Actual` / `Public` emergency alerts. A valid update atomically replaces the operative revision and increments its epoch, making acknowledgements for the prior epoch stale. A valid cancellation closes the chain. Unavailable, malformed, cyclic, unrelated, or conflicting evidence fails closed without fabricating alert instructions.

Veridex is an auditable application-local consensus mirror. It does not originate alerts, push notifications, automate monitoring, forecast weather, control evacuation, prove physical action, or provide legal or life-safety assurance. The UI must direct users to official NWS and local-authority channels.

MVP limits remain: 32 channels; 16 chains per channel; 8 revisions per chain; 64 subscribers per channel; 1–5 frozen UGC zones per channel.

## Actors and authority

- Channel admin creates, activates, and closes a channel. Zones freeze on activation. The admin cannot provide alert content or a verdict.
- Subscriber subscribes, unsubscribes, and acknowledges one exact `(channel, root URN, epoch)`.
- Refresher is any wallet submitting an exact NWS alert URN for ingest/refresh or triggering deterministic expiry. The caller cannot provide URL, response body, lineage result, or normalized outcome.
- Validators independently fetch and classify exact NWS records. No validator acts unilaterally.
- Reader uses the public timeline without a wallet.
- Upgrader is the deployment-authorized Root Slot upgrader and may replace only storage-compatible code; it has no alert-record override method.

Contract authorization is authoritative. UI role labels are presentation only.

## Evidence boundary

Only strict NWS alert URNs are accepted. The contract derives `https://api.weather.gov/alerts/<percent-encoded-urn>` and uses the current supported GenLayer nondeterministic HTTP API. It never accepts arbitrary URLs or caller-supplied alert JSON.

Leader and validators independently fetch the exact candidate and referenced predecessors to depth 4 with bounded response size and reference count. Every bounded direct reference is fetched and checked for the same event identity before any state-changing lineage outcome. They validate exact returned IDs, `status=Actual`, `scope=Public`, message type, timestamps, references, VTEC/eventCode, UGC zones, strict CAP enum values for severity/urgency/certainty/response, and instruction presence/change. Event names longer than 128 characters are rejected rather than truncated, preventing identity collisions. Channel overlap derives from the frozen zone set.

Transport failure, `429`, any `5xx`, oversize, malformed schema, missing predecessor, cycle, unrelated reference, or validator disagreement cannot become a valid update/cancel. `404/410` is unavailable evidence, never cancellation. Deterministic transaction time may expire an already stored record.

Stored evidence remains bounded: canonical IDs and lineage, normalized enums and timestamps, sorted zones, source `updated`, transaction-observed time, evidence fingerprint, and bounded headline excerpt. Full alert bodies/instructions are not stored; official NWS links remain available.

## Exact consensus protocol

The nondeterministic result uses this exact schema: `root_urn`, `candidate_urn`, `parent_urn`, `outcome`, `message_type`, `operative_status`, normalized time fields, sorted `zones`, `zone_overlap`, severity/urgency/certainty/response, `instruction_change`, bounded `headline_excerpt`, and event/instruction/evidence fingerprints.

Validators refetch and rederive substance. Consensus compares every consequential field. Free-form reasoning is non-authoritative and local debug/transport metadata cannot authorize a consequence.

## State machines and invariants

- Channel: `DRAFT -> ACTIVE -> CLOSED`.
- Chain: `ABSENT -> ACTIVE -> UPDATED* -> CANCELLED | EXPIRED`; unresolved evidence may expose `HOLD_UNRESOLVED` without replacing the last accepted revision.
- Acknowledgement: `UNACKNOWLEDGED -> ACKNOWLEDGED -> STALE` when epoch increments.

The binding invariants are: exact source identity and lineage before mutation; accepted update/cancel references the accepted chain; one epoch increment per accepted revision; immutable historical acknowledgements; fail-closed conflict/unavailability; deterministic expiry; immutable activated zones; closed-channel write restrictions; and cap rejection before mutation.

## Public contract API

The ten writes are: `create_channel`, `activate_channel`, `close_channel`, `subscribe`, `unsubscribe`, `ingest_alert`, `refresh_chain`, `derive_expiry`, `acknowledge`, and `upgrade`.

The sixteen views use stable public names, supported primitive/JSON return shapes, caps, pagination, and source-URL derivation. Contract tests and frontend parsers share the same schemas.

## Frontend architecture

Static Vite/React TypeScript application; no backend and no cron.

- Layer 1: public Veridex presentation/docs surface containing Overview, How it works, Trust & safety, Docs, explicit Studio Next identity, status cues, official-source limitations, and `Open workspace`. Visual direction is the user-approved airy editorial mockup with a low-opacity abstract GenLayer-inspired network watermark.
- Layer 2: complete operational workspace covering admin, refresher, subscriber, timeline, comparison, audit, wallet, transaction, and recovery journeys.

Public reads work disconnected. Connect opens an accessible selector limited to detected MetaMask, OKX Wallet, and Rabby providers and binds all account/network/write operations to the exact announced provider object. No auto-connect; reload begins disconnected. Studio's internal wallet is not used by the web app.

One app-wide coordinator owns Studio Next reads. It keeps in-flight dedupe, 8-second safe-read cache, verified-write invalidation, one active transaction monitor, 3-second polling backed off to at most 10 seconds, hidden-tab pause, bounded `429`/`5xx` retry honoring `Retry-After`, cancellation, and zero browser-side NWS polling. Intent is stored before signature and hash immediately after return; retries stay locked until terminal failure or authoritative readback proves safety.

## Network/runtime lock

- RPC: `https://studio-dev.genlayer.com/api`
- Chain: `61997` (`0xf22d`)
- Explorer: `https://explorer-studio-dev.genlayer.com`
- SDK chain export: `studioDevnet`
- CLI preset: `studio-dev`
- Current RC family: CLI `0.40.0-rc.3`, `genlayer-js 2.0.0-rc.1`, transaction kit `0.1.0-rc.2`, Python SDK `0.19.0rc2`, test `0.30.0rc2`, linter `0.11.1rc2`, GenVM `v0.6.0-rc5`.
- Contract runner: `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`.

## Acceptance

Unit/integration coverage includes contract/frontend behavior, Studio Next constants, SDK chain identity, fee/receipt/finality parsing, explorer links, and Layer 1→Layer 2 navigation without wallet side effects.

Release requires exact-source validation and deployment, terminal finality plus semantic success, deployed-source/readback parity, browser-wallet E2E, and complete public evidence on one exact final revision.

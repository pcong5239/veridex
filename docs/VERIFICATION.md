# Veridex Verification

## Exact release

- Deployed frontend source commit: `b23c90aa3bf33bad0843950d5d89cfdf66edbd14`
- Contract source: `contracts/veridex.py`
- Contract SHA-256: `124E671ED173FB72E31ABB30B2F461324E4D0F39CC84808CBF26C2F852E61B9C`
- GenVM: `v0.6.0-rc5`
- Runner: `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`
- Schema: zero constructor parameters; 26 public methods (16 view, 10 write)

## Studio deployment

- Network: Studio development preview (`studio-dev`)
- Chain ID: `61997` (`0xf22d`)
- RPC: `https://studio-dev.genlayer.com/api`
- Explorer: https://explorer-studio-dev.genlayer.com
- Contract: `0xb655FCc6338D77E117Ee8192bcF2D85759226a40`
- Deployer and initial Root Slot upgrader: `0x8581c4a532dd3f9b163b12809b1bd089f367147f`
- Deployment transaction: `0x533b6f6dd96207b4890828ee0b9dcd21741b092945b3fda7e20180bf1be79d14`
- Result: `FINALIZED`, accepted consensus, `MAJORITY_AGREE`
- Source readback: byte-identical, 79,582 UTF-8 characters, matching SHA-256
- Configuration readback: all caps match source; the deployer is the sole initial upgrader

## Live contract proof matrix

The NWS root and update were fetched immediately before execution. Both were `Actual` / `Public`, shared event `Flash Flood Warning`, event code `FFW`, VTEC identity `KABQ.FF.W.0138`, and UGC zone `NMC027`. The update directly referenced the root.

| Journey | Transaction | Finalized result and authoritative readback |
|---|---|---|
| Create channel | `0x85f1eb3879482d8b3e864367fc9137d7211ad9dd12e4a685bf28271b3b4bc0f5` | Success; channel 1 is `DRAFT`, exact admin, name, nonce, and `NMC027` |
| Activate channel | `0x8bf8779be130bc5ace4e884b5087eab9a346c91b0dcc534e7bfec180f6d3653a` | Success; channel 1 is `ACTIVE`; zones unchanged |
| Subscribe | `0x0c597c23803d00495f5f8249f62a2c676f11faa6979260eed546f364c7b0fbde` | Success; deployer subscription is active |
| Ingest root | `0x40afeccd71384535163160f11e99af169a1ca0f934c7925cd4025152f6d34543` | Success; root accepted at epoch 1, revision 1, `ACTIVE`, exact source URL and zone overlap |
| Acknowledge | `0x398c94406e377d30511b88dd3fe191c3aeb83e7c8b1dad7129dd0790ca67197f` | Success; acknowledgement binds epoch 1 |
| Refresh update | `0xc4d75de3ba6c211a843ff13e909a66b62be702858a824dfcc984ee2e09b14f75` | Success; update becomes revision 2/epoch 2; root is `UPDATED`; epoch-1 acknowledgement is `STALE` |
| Missing evidence | `0x805cbd36bf7a9f170b0868d776ee88a217d9c7e311f5c013c587b90f9f4cb16c` | Fail-closed `UNRESOLVED`; operative revision and epoch remain unchanged |

Root URN: `urn:oid:2.49.0.1.840.0.95c967c86beea7899120ad7c25caa0ec064efce2.001.1`

Update URN: `urn:oid:2.49.0.1.840.0.0484c0622508110f9213c5056acea853a4dfcf4b.001.1`

Final readbacks show channel 1 `ACTIVE`, chain epoch 2, exactly two revisions, the update as operative alert, the epoch-1 acknowledgement `STALE`, and audit sequence `NEW_CHAIN`, `VALID_UPDATE`, `UNRESOLVED`. No duplicate write occurred.

## Automated verification

| Check | Command | Result |
|---|---|---|
| Contract tests | `python -m pytest -q` | 20 passed |
| Frontend tests | `npm test --prefix frontend` | 76 passed |
| TypeScript | `npm run typecheck --prefix frontend` | PASS |
| Production build | `npm run build --prefix frontend` | PASS |

## Web release

- Production URL: https://veridex-khaki.vercel.app
- Verified release URL: https://veridex-khaki.vercel.app/app?release=dpl_7UEPb2cXSD5b4NBEYqgSg8FCjXpC&attempt=1
- Vercel deployment: `dpl_7UEPb2cXSD5b4NBEYqgSg8FCjXpC` (`READY`)
- Built workspace asset: `Workspace-Di3lz1mD.js`
- Generated bundle contains the exact contract address, chain `61997`, Studio development RPC, and raw-enum finality compatibility path.
- `/` and `/app` return HTTP 200 through the production SPA deployment.

## Browser-wallet proof

Google Chrome and the explicitly selected OKX Wallet were used against the production release. The user confirmed wallet popups; the application performed all other actions, preserved returned hashes, and never resubmitted an unresolved intent.

| Journey | Transaction | GenLayer result | Authoritative browser readback |
|---|---|---|---|
| Subscribe to channel 1 | `0x35940c022f3c14577a238b17353c7b007ddb8d16651fb9434f6cc688796c04da` | `FINALIZED`, `FINISHED_WITH_RETURN`, accepted | `SUBSCRIBED` |
| Acknowledge epoch 2 | `0x554a1debdfa71ffae646a5d4e1df95e5321a254557289e637a9afad5e71bc83b` | `FINALIZED`, `FINISHED_WITH_RETURN`, accepted | `ACKNOWLEDGED (Epoch 2/2)` |

The disconnected public reader displayed the operative bulletin, two-revision lineage, official NWS link, contract limits, upgrade status, and audit history. Invalid and overlength NWS URNs remained disabled and produced inline errors without opening the wallet. The selected wallet opened directly for writes without a browser confirmation or intermediary fee modal.

## Known limitations

- Studio development preview state and availability are not guaranteed across platform deployments.
- This system is an audit and coordination tool, not an alert originator or substitute for official emergency instructions.
- Full NWS alert bodies are intentionally not stored on-chain.

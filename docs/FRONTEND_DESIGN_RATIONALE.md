# Frontend Design Rationale

## Approved direction

Veridex uses two layers. Layer 1 explains the product before asking for wallet context; Layer 2 is the operational workspace. The approved visual reference is preserved at `docs/design/approved-layer-1-concept.png` (SHA-256 `CEEEEC57B80F32262B36828BBBCB3C8B68C871B4F3CF2BC946C0B39735EAF431`). It establishes an airy editorial landing page with strong typography, restrained blue/ivory fields, black action controls, and a faint GenLayer background mark.

The operational layer owns one wallet state machine (`DISCOVERING`, `CHOOSER_OPEN`, `CONNECTING`, `CONNECTED`, `WRONG_CHAIN`, `ERROR`, `DISCONNECTED`). A wrong-chain transition preserves the selected provider and account while disabling writes. Public copy deliberately omits provider-protocol identifiers and internal RPC cache/retry diagnostics. Every write is simulated and fee-estimated before the exact fee object is shown for confirmation and passed unchanged to the wallet submission.

Layer 1 states the official-source and life-safety boundary before workspace entry. Audit history is fetched in contract-valid pages of 50, and internal read invalidation prevents stale in-flight requests from repopulating the cache.

## Layer 1 content hierarchy

1. Veridex identity and navigation: Overview, How it works, Trust & safety, Docs.
2. Hero: public warnings made verifiable; concise boundary statement; `Open workspace` primary action and `Read the docs` secondary action.
3. Network strip: Studio Next, chain 61997, public reads available without wallet.
4. Three-step explanation: Source → Consensus → Record.
5. Trust/safety and limitations: official channels remain authoritative; unresolved evidence fails closed; an on-chain acknowledgement is a coordination record, not proof that an emergency instruction was received or acted upon.
6. Technical/docs summary and transition into the workspace.

## Interaction rules

- Entering Layer 1 or opening the workspace never auto-connects a wallet and never causes a contract write.
- Section navigation is keyboard-operable, has visible focus, respects reduced motion, and remains usable on narrow screens.
- Layer 2 retains all existing workspace journeys and safety controls; presentation components cannot supply authority to transaction logic.
- The background mark is decorative, low contrast, non-interactive, and hidden from assistive technology.

## Non-goals

No dashboard metric is fabricated for decoration. No live NWS browser polling, push-notification claim, safety guarantee, or production-network implication is introduced.

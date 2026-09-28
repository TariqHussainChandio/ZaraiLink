# common/messaging (app)

Conversations and chat.

- **Owner lane:** `zl-comms` (docs/plan.md §3)
- **SRDS:** §30–§31
- **API side:** [`backend/app/common/messaging`](../../../backend/app/common/messaging/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `ChatInput`, `useOpenConversation`, `fetchMessageById`, `redactMessage`, `Message`.

## Inside

`components/` · `hooks/` · `screens/` (2) · `services/` · `types/`. Tests sit beside the code they test.

# common/messaging (app)

Conversations and chat.

- **Owner lane:** `zl-comms` (docs/plan.md §3)
- **SRDS:** §30–§31
- **API side:** [`backend/app/common/messaging`](../../../backend/app/common/messaging/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `ChatInput`, `useOpenConversation`, `fetchMessageById`, `redactMessage`, `Message`.

`ChatInput`'s `onSend` may return a promise: the composer clears only when it resolves, and if it rejects the words and photos stay and the person is told (FA-03).

## Inside

`components/` · `hooks/` · `screens/` (2) · `services/` · `types/`. Tests sit beside the code they test.

## How sending works (FA-03)

`useChatOutbox` draws a message as "Sending…" at once, uploads the photos, then posts it. A failure leaves it on screen as "Not sent · Tap to retry"; a retry skips photos already uploaded and first reads the conversation, so a message whose reply was lost is recognised (`isDelivered` in `hooks/chatRows.ts`) rather than posted twice. The messages API has no idempotency key yet, so that check is the only guard.

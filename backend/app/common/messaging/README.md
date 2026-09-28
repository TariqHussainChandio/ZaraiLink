# common/messaging (API)

Conversations, messages, read state and message redaction.

- **Owner lane:** `zl-comms` (docs/plan.md §3)
- **SRDS:** §30–§31
- **Routes:** `/api/v1/messaging` (see `backend/openapi.json`)
- **App side:** [`frontend/common/messaging`](../../../../frontend/common/messaging/README.md)
- **Uses:** tables `conversations`, `messages`
- **Tests:** `backend/tests/common/messaging/`

## Public API

Other modules call only `service.py` and use only the models in `schemas.py`; the reality gate's `module-boundary` rule fails any other import. Service functions today: `fetch_conversations`, `fetch_messages`, `send_message`, `find_or_create_conversation`, `fetch_message_by_id`, `redact_message`, `mark_conversation_read`.

## Layers

`router.py` (HTTP and auth dependencies) → `service.py` (business rules) → `repository.py` (Supabase queries); `schemas.py` holds the request and response models that appear in the OpenAPI document.

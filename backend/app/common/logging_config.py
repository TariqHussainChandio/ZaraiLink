"""P5 (item 4): structured (JSON) logs carrying the current request id, using stdlib `logging`
only — the codebase has zero structured-logging today (`ai_engine.py`/`config.py` use plain
`logging`, nothing else), and a formatter is all this need (JSON lines, one field for correlation)
actually requires. `structlog` would be a new dependency for capability not yet needed; adopt it
later only if a future phase needs contextual binding beyond a single request id."""

import json
import logging

from .request_context import request_id_var


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            # Read directly from the contextvar rather than a logging.Filter — a ContextVar is
            # already correct per-asyncio-task, so no extra plumbing is needed to get the right
            # value into a record emitted from deep inside a request's call stack.
            "request_id": request_id_var.get(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


# Libraries that log their own request/response line at INFO — every Supabase call (postgrest,
# gotrue, storage3) goes through httpx internally, so at the app's own INFO level this produced a
# second, redundant log line for every single internal HTTP call the backend makes, not just the
# ones this app's own code logs. Quieting these to WARNING keeps volume proportional to what this
# app actually logs. This was found the hard way: at INFO, the amplified volume was enough to fill
# the real-stack smoke matrix's captured subprocess pipe (never actively drained mid-run) and block
# the single-worker event loop on a full-pipe write — a real hang, reproduced and root-caused
# against the local stack, not a flaky test.
_NOISY_LOGGERS = ("httpx", "httpcore", "hpack")


def configure_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)

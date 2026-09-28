"""A single shared `ContextVar`, split into its own module so `middleware.py` (sets it) and
`problem_details.py` (reads it for error logs) don't import from each other."""

import contextvars

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

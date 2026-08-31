from slowapi import Limiter
from slowapi.util import get_remote_address

# Defined in its own module (not inline in main.py) so endpoint modules can import `limiter` for
# a per-route `@limiter.limit(...)` override without importing from `main` -- `main` imports the
# API router, which imports the endpoint modules, so an endpoint importing back from `main` would
# be a circular import.
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

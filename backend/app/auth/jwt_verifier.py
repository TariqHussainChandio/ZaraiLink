"""P4 (4A.2): local JWT verification against Supabase's JWKS endpoint, replacing the per-request
`GET /auth/v1/user` call in `auth/dependencies.py`. `PyJWKClient` caches keys and refreshes automatically
on an unknown `kid` (e.g. after a key rotation) — see its own `PyJWKClientCache`. A JWKS-fetch
failure (Supabase unreachable) raises `JWKSUnavailableError`, which `auth/dependencies.py` maps to a 503,
not a 401 — an outage is not the same failure mode as a bad token.

Only meaningful once the local stack runs asymmetric signing keys (`supabase/config.toml`'s
`signing_keys_path` — see that file's comment). Against the legacy shared-secret (HS256) mode,
Supabase's JWKS endpoint returns an empty key set and every verification would fail; this module
assumes the migrated (signing-keys) mode, matching this project's current local config.
"""

from dataclasses import dataclass

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError

from app.config.settings import settings

# One client per process, matching the "cached, refresh on unknown kid" requirement — PyJWKClient
# keeps its own in-memory key cache and re-fetches automatically when asked for a `kid` it hasn't
# seen (`get_signing_key_from_jwt` -> `get_signing_key`), so no manual TTL bookkeeping is needed
# here. Constructed lazily (not at import time) so a missing/blank `supabase_url` in a test
# environment doesn't crash import of this module.
_jwk_client: PyJWKClient | None = None


class JWKSUnavailableError(RuntimeError):
    """The JWKS endpoint could not be reached or returned no usable key — a Supabase-side outage
    or misconfiguration, not a bad token. Callers map this to 503, distinct from a verification
    failure (401)."""


class TokenVerificationError(RuntimeError):
    """The token itself is invalid: bad signature, expired, wrong audience/issuer, or an
    unexpected algorithm (including `alg: none`, which PyJWT already refuses unless explicitly
    allowed — never added here)."""


@dataclass(frozen=True)
class VerifiedClaims:
    sub: str
    email: str | None
    # "aal1" (password/OTP only) or "aal2" (a second factor, e.g. TOTP, has also been verified
    # this session) — P4 (4A.4), used to gate admin writes. Supabase always sets this claim once
    # MFA is available on the project, defaulting to "aal1" for a session with no second factor.
    aal: str | None = None


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        # cache_keys=True + lifespan: PyJWKClient's own cache, separate from re-fetch-on-unknown-kid
        # above — avoids a network round-trip on every single request for keys already seen.
        _jwk_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
    return _jwk_client


def verify_access_token(token: str) -> VerifiedClaims:
    """Verifies a Supabase-issued access token locally: signature (against the JWKS-published
    key for this token's `kid`), expiry, and audience. `algorithms` is deliberately the single
    algorithm PyJWKClient resolved the key for — never a caller-supplied or token-supplied value,
    which is exactly the `alg: none` / algorithm-confusion class of attack this guards against."""
    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
    except PyJWKClientConnectionError as exc:
        # The JWKS endpoint itself is unreachable (network/timeout) — a server/config-side
        # condition, not the caller's fault. Checked before the broader jwt.PyJWTError below,
        # which this is also an instance of (PyJWKClientConnectionError -> PyJWKClientError ->
        # PyJWTError).
        raise JWKSUnavailableError(str(exc)) from exc
    except jwt.PyJWTError as exc:
        # Every other failure this call can raise is a bad-token condition, not an outage:
        # PyJWKClientError ("no key matches this kid" — a forged `kid`, or `alg: none` with no
        # real key at all) and, since get_signing_key_from_jwt decodes the header itself before
        # any network call, a plain DecodeError for a token that isn't even JWT-shaped.
        raise TokenVerificationError(str(exc)) from exc

    try:
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=[signing_key.algorithm_name],
            audience="authenticated",
            options={"require": ["exp", "sub", "aud"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenVerificationError(str(exc)) from exc

    sub = claims.get("sub")
    if not sub:
        raise TokenVerificationError("Token has no subject claim")

    return VerifiedClaims(sub=sub, email=claims.get("email"), aal=claims.get("aal"))

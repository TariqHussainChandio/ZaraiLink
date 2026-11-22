"""verify_access_token against real signed tokens. Only the JWKS key lookup is replaced (the network edge); the
decoding, audience, expiry and clock-skew checks are PyJWT's own."""

import time
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest

from app.auth import jwt_verifier
from app.auth.jwt_verifier import CLOCK_SKEW_LEEWAY_SECONDS, TokenVerificationError, verify_access_token

SECRET = "s" * 32


def _token(iat_offset: int = 0, exp_offset: int = 3600) -> str:
    now = int(time.time())
    claims = {"sub": "user-1", "aud": "authenticated", "iat": now + iat_offset, "exp": now + exp_offset}
    return jwt.encode(claims, SECRET, algorithm="HS256")


@pytest.fixture(autouse=True)
def _fixed_key():
    client = SimpleNamespace(
        get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=SECRET, algorithm_name="HS256")
    )
    with patch.object(jwt_verifier, "_get_jwk_client", return_value=client):
        yield


def test_accepts_a_token_issued_a_few_seconds_ahead_of_this_clock():
    # Seen on 2026-11-20: this machine ran 2-3 s behind Supabase Auth, every request right after a farmer signed in
    # got a 401 ("not yet valid (iat)") and the app signed them out.
    assert verify_access_token(_token(iat_offset=3)).sub == "user-1"


def test_still_rejects_a_token_issued_well_beyond_the_allowed_skew():
    with pytest.raises(TokenVerificationError):
        verify_access_token(_token(iat_offset=CLOCK_SKEW_LEEWAY_SECONDS + 60))


def test_still_rejects_an_expired_token():
    with pytest.raises(TokenVerificationError):
        verify_access_token(_token(iat_offset=-7200, exp_offset=-(CLOCK_SKEW_LEEWAY_SECONDS + 60)))

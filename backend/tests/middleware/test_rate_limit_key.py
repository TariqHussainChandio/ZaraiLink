from starlette.requests import Request

from app.core.rate_limit import rate_limit_key


def _request(authorization: str | None = None, client: str = "203.0.113.7") -> Request:
    headers = [(b"authorization", authorization.encode())] if authorization else []
    return Request({"type": "http", "headers": headers, "client": (client, 5000)})


def test_one_token_keeps_one_bucket_whatever_the_address():
    assert rate_limit_key(_request("Bearer abc.def.ghi", "203.0.113.7")) == rate_limit_key(
        _request("Bearer abc.def.ghi", "198.51.100.9")
    )


def test_different_tokens_get_different_buckets_behind_one_address():
    assert rate_limit_key(_request("Bearer token-one")) != rate_limit_key(_request("Bearer token-two"))


def test_the_raw_token_never_becomes_the_key():
    key = rate_limit_key(_request("Bearer secret.token.value"))
    assert key.startswith("token:")
    assert "secret.token.value" not in key


def test_no_bearer_token_falls_back_to_the_address():
    assert rate_limit_key(_request()) == "ip:203.0.113.7"
    assert rate_limit_key(_request("Basic dXNlcjpwYXNz")) == "ip:203.0.113.7"

"""P5 (item 5): limit/offset on every list endpoint, with the next page announced in an RFC 8288
`Link: <...>; rel="next"` header.

The response body stays a bare JSON array on purpose: every mobile service function is typed
`Promise<T[]>`, so a `{items, next}` envelope would break ~25 contracts at once and P5 has no frontend
budget. Headers are additive; P7's generated client is where a UI starts reading them. `X-Total-Count`
was in the original plan and is deliberately left out: it needs a counted query per list, which changes every
repository's return shape for a value nothing consumes yet.

How it reaches the queries: the `pagination()` dependency stores the requested page in a ContextVar for
the duration of the request, and repositories call `page_range()` on their list queries. A repository
reached from a request with no pagination dependency (analytics aggregates, internal reads) gets the
old effective behaviour — PostgREST's own 1000-row cap — instead of a page.
"""

from contextvars import ContextVar
from dataclasses import dataclass
from urllib.parse import urlencode

from fastapi import Query, Request, Response

MAX_LIMIT = 100
# PostgREST's own max-rows default, i.e. what an unpaginated list already returned.
_UNPAGED_END = 999


@dataclass
class Page:
    limit: int
    offset: int
    request: Request
    response: Response

    def finish(self, rows: list) -> list:
        """Sets `Link: rel="next"` when the page came back full (another page may exist)."""
        if len(rows) >= self.limit:
            params = dict(self.request.query_params)
            params.update(limit=str(self.limit), offset=str(self.offset + self.limit))
            self.response.headers["Link"] = f'<{self.request.url.path}?{urlencode(params)}>; rel="next"'
        return rows


_current: ContextVar[Page | None] = ContextVar("current_page", default=None)


def page_range() -> tuple[int, int]:
    page = _current.get()
    if page is None:
        return 0, _UNPAGED_END
    return page.offset, page.offset + page.limit - 1


def pagination(default_limit: int = MAX_LIMIT):
    """Dependency factory. `default_limit` is 100 (the cap) for lists that were unbounded before, so
    existing callers that never send `limit` are not silently truncated; the marketplace feed keeps its
    historical 20."""

    async def dependency(
        request: Request,
        response: Response,
        limit: int = Query(default_limit, ge=1, le=MAX_LIMIT),
        offset: int = Query(0, ge=0),
    ) -> Page:
        page = Page(limit=limit, offset=offset, request=request, response=response)
        _current.set(page)
        return page

    return dependency


# Built once so endpoint signatures can say `Depends(paginate)` (a call inside a default argument is
# what ruff's B008 flags).
paginate = pagination()
paginate_feed = pagination(20)

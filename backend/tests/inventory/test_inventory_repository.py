"""repository.py at the PostgREST edge: what leaves Python is two-decimal, a refused purchase leaves nothing behind,
and a refused line edit puts the old lines back. The Supabase client is the faked edge here; the same paths run
against the real database in test_smoke_inventory_isolation.py."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from postgrest.exceptions import APIError

from app.inventory import repository as repo

REFUSED = APIError(
    {"code": "42501", "message": "A purchase line must use your own draft purchase, product and location"}
)


class _Query:
    """A fluent stand-in for a postgrest query: records which table and operation ran, answers from a queue."""

    def __init__(self, client: "_Client", table: str) -> None:
        self.client, self.table, self.op = client, table, "select"

    def __getattr__(self, name: str):
        def step(*args, **_kwargs):
            if name in ("select", "insert", "update", "delete", "upsert"):
                self.op = name
                self.client.log.append((self.table, name, args[0] if args else None))
            else:
                self.client.steps.append((self.table, name, args))
            return self

        return step

    async def execute(self):
        queued = self.client.outcomes.get((self.table, self.op), [])
        outcome = queued.pop(0) if queued else []
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(data=outcome, count=None)


class _Client:
    def __init__(self, outcomes: dict) -> None:
        self.outcomes, self.log, self.steps = outcomes, [], []

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    def rpc(self, name: str, params: dict) -> _Query:
        self.log.append(("rpc", name, params))
        return _Query(self, f"rpc:{name}")


def _patched(client: _Client):
    return patch("app.inventory.repository.get_user_scoped_client", AsyncMock(return_value=client))


@pytest.mark.parametrize(("value", "sent"), [(3.2000000000000006, 3.2), (1.25, 1.25), (10, 10), (0.1 + 0.2, 0.3)])
def test_computed_float_noise_is_cleared_before_postgres(value, sent):
    assert repo._two_decimals(value) == sent


@pytest.mark.asyncio
async def test_a_movement_quantity_leaves_python_with_two_decimals():
    client = _Client({("rpc:record_movement", "select"): ["m1"]})
    with _patched(client):
        await repo.record_movement("tok", "p", "l", "in", "RESTOCK", 9.1 - 5.9, None)
    assert client.log[0][2]["p_quantity"] == 3.2


@pytest.mark.asyncio
async def test_a_purchase_is_created_by_one_function_call_with_two_decimal_lines():
    """F1/F2: the header and its lines are one create_purchase call, one transaction; nothing is inserted directly, so
    a refused line leaves nothing to clean up."""
    client = _Client({("rpc:create_purchase", "select"): ["po1"]})
    with _patched(client):
        purchase_id = await repo.create_purchase(
            "tok",
            {"supplier_id": "s", "purchased_on": "2026-10-01", "reference": "R", "notes": None},
            [{"product_id": "p", "location_id": "l", "quantity": 9.1 - 5.9, "unit_cost": None}],
        )
    assert purchase_id == "po1"
    assert client.log == [
        (
            "rpc",
            "create_purchase",
            {
                "p_supplier_id": "s",
                "p_purchased_on": "2026-10-01",
                "p_reference": "R",
                "p_notes": None,
                "p_items": [{"product_id": "p", "location_id": "l", "quantity": 3.2, "unit_cost": None}],
            },
        )
    ]


@pytest.mark.asyncio
async def test_a_refused_purchase_create_raises_and_writes_nothing_else():
    client = _Client({("rpc:create_purchase", "select"): [REFUSED]})
    with _patched(client), pytest.raises(APIError):
        await repo.create_purchase("tok", {}, [{"product_id": "theirs", "location_id": "l", "quantity": 1}])
    assert [entry[:2] for entry in client.log] == [("rpc", "create_purchase")]


@pytest.mark.asyncio
async def test_a_line_edit_is_one_function_call_with_its_header_changes():
    """F1/F2: replace_purchase_items locks the draft and swaps its lines in one transaction; the header changes travel
    in the same call, so an edit is never half applied."""
    client = _Client({("rpc:replace_purchase_items", "select"): [None]})
    with _patched(client):
        await repo.replace_purchase_items(
            "tok",
            "po1",
            [{"product_id": "p", "location_id": "l", "quantity": 4, "unit_cost": 10.555 - 0.005}],
            {"notes": "Second truck"},
        )
    assert client.log == [
        (
            "rpc",
            "replace_purchase_items",
            {
                "p_purchase_id": "po1",
                "p_items": [{"product_id": "p", "location_id": "l", "quantity": 4, "unit_cost": 10.55}],
                "p_header": {"notes": "Second truck"},
            },
        )
    ]


@pytest.mark.asyncio
async def test_an_empty_line_list_empties_the_draft_and_no_header_is_sent_as_null():
    client = _Client({("rpc:replace_purchase_items", "select"): [None]})
    with _patched(client):
        await repo.replace_purchase_items("tok", "po1", [], None)
    assert client.log[0][2] == {"p_purchase_id": "po1", "p_items": [], "p_header": None}


@pytest.mark.asyncio
async def test_the_default_location_moves_in_one_function_call():
    client = _Client({("rpc:set_default_location", "select"): [None]})
    with _patched(client):
        await repo.set_default_location("tok", "godown")
    assert client.log == [("rpc", "set_default_location", {"p_location_id": "godown"})]
    assert not hasattr(repo, "clear_default_location")


@pytest.mark.asyncio
async def test_only_the_dealer_edited_tables_are_written_directly():
    for table in ("inventory_stock", "inventory_movements", "inventory_sync_log"):
        with pytest.raises(ValueError, match="is not edited directly"):
            await repo.create_row("tok", table, "dealer-1", {})
        with pytest.raises(ValueError, match="is not edited directly"):
            await repo.update_row("tok", table, "x", {})


# --- reads that must see every row (F3: PostgREST returns at most max_rows = 1000 per request) ------------------------


def _rows(n: int, start: int = 0) -> list[dict]:
    return [{"id": f"r{i}"} for i in range(start, start + n)]


@pytest.mark.asyncio
async def test_an_unpaged_product_read_walks_every_page_past_the_row_cap():
    client = _Client({("inventory_products", "select"): [_rows(1000), _rows(1000, 1000), _rows(3, 2000)]})
    with _patched(client):
        rows = await repo.fetch_products("tok", include_inactive=False, paged=False)
    assert len(rows) == 2003
    assert [args for table, name, args in client.steps if name == "range"] == [(0, 999), (1000, 1999), (2000, 2999)]
    # the order is total, so no row falls between two pages
    assert [args for _, name, args in client.steps if name == "order"][-2:] == [("name",), ("id",)]


@pytest.mark.asyncio
async def test_a_paged_product_read_stays_one_page():
    client = _Client({("inventory_products", "select"): [_rows(5)]})
    with _patched(client):
        assert len(await repo.fetch_products("tok")) == 5
    assert [args for _, name, args in client.steps if name == "range"] == [(0, 999)]


@pytest.mark.asyncio
async def test_every_marketplace_sale_is_read_past_the_row_cap():
    client = _Client({("inventory_movements", "select"): [_rows(1000), _rows(1)]})
    with _patched(client):
        rows = await repo.fetch_all_movements("tok", sources=["ZARAILINK_ORDER"], columns="created_at,quantity")
    assert len(rows) == 1001
    assert ("inventory_movements", "in_", ("source", ["ZARAILINK_ORDER"])) in client.steps
    # with no window, no time bound is sent
    assert not [s for s in client.steps if s[1] in ("gte", "lt")]


@pytest.mark.asyncio
async def test_an_unpaged_store_or_supplier_list_reads_every_row():
    """The dealer analytics count stores and suppliers from the legacy lists with no page on the request; a single read
    would stop at PostgREST's 1000 rows."""
    client = _Client({("inventory_locations", "select"): [_rows(1000), _rows(2, 1000)]})
    with _patched(client):
        rows = await repo.list_rows("tok", "inventory_locations")
    assert len(rows) == 1002
    assert [args for _, name, args in client.steps if name == "range"] == [(0, 999), (1000, 1999)]
    assert [args for _, name, args in client.steps if name == "order"][-2:] == [("created_at",), ("id",)]


@pytest.mark.asyncio
async def test_a_paged_store_list_stays_the_requested_page():
    from unittest.mock import MagicMock

    from app.common import pagination

    token = pagination._current.set(pagination.Page(limit=5, offset=10, request=MagicMock(), response=MagicMock()))
    try:
        client = _Client({("inventory_locations", "select"): [_rows(5)]})
        with _patched(client):
            assert len(await repo.list_rows("tok", "inventory_locations")) == 5
    finally:
        pagination._current.reset(token)
    assert [args for _, name, args in client.steps if name == "range"] == [(10, 14)]

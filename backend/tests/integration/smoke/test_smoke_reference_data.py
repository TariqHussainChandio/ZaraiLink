"""P5a smoke matrix — reference-data domain (currencies, units; admin-only writes on the
generic {table}/rows endpoints)."""

from __future__ import annotations


def test_public_reads_need_no_auth(world, api_client):
    currencies = api_client("GET", "/api/v1/reference-data/currencies")
    assert currencies.status_code == 200, currencies.text

    units = api_client("GET", "/api/v1/reference-data/units")
    assert units.status_code == 200, units.text


def test_generic_rows_read(world, api_client):
    response = api_client("GET", "/api/v1/reference-data/units/rows", world.buyer.token)
    assert response.status_code == 200, response.text


def test_admin_can_create_update_delete_a_unit_row(world, api_client):
    created = api_client(
        "POST",
        "/api/v1/reference-data/units/rows",
        world.admin.token,
        json={"code": "smoke-unit", "label": "Smoke Unit"},
    )
    assert created.status_code == 201, created.text
    row_id = created.json()["id"]

    updated = api_client(
        "PATCH", f"/api/v1/reference-data/units/rows/{row_id}", world.admin.token, json={"label": "Smoke Unit Renamed"}
    )
    assert updated.status_code == 204, updated.text

    deleted = api_client("DELETE", f"/api/v1/reference-data/units/rows/{row_id}", world.admin.token)
    assert deleted.status_code == 204, deleted.text


def test_non_admin_cannot_write_reference_data(world, api_client):
    response = api_client(
        "POST", "/api/v1/reference-data/units/rows", world.buyer.token, json={"code": "nope", "label": "Nope"}
    )
    assert response.status_code == 403

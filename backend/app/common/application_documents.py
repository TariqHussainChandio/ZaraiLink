"""The documents of a dealer or expert application (A3b; SRDS §7, §10, §12, §45).

Dealers and experts keep separate tables and buckets (maintainer decision, 2026-10-04): `dealer_documents` in
`dealer-documents`, `expert_documents` in `expert-documents`. What happens to a document is the same for both, so it is
written once here and each module passes its own `Kind`.

Every call runs with the caller's token. The database decides who may do what (20261012080000_applications.sql): the
owner adds and removes while the application is editable, an admin reads; the row's file must be in the owner's
folder and already uploaded, and its size and type come from Storage. This code only maps the database's answers to
the API's error codes and removes a file from Storage after its row.
"""

import logging
from dataclasses import dataclass

import httpx
from postgrest.exceptions import APIError
from storage3.exceptions import StorageApiError

from app.common.errors import AppHTTPException
from app.common.rows import as_rows, first_row
from app.database.supabase_client import get_user_scoped_client

logger = logging.getLogger(__name__)

DOCUMENT_COLUMNS = (
    "id,required_document_id,file_name,mime_type,size_bytes,created_at,"
    "required_document:required_documents(id,code,label)"
)
# An admin opens a document from a signed link; ten minutes is enough to read it and short enough not to linger.
SIGNED_URL_SECONDS = 600


@dataclass(frozen=True)
class Kind:
    table: str
    owner_column: str
    bucket: str


DEALER = Kind(table="dealer_documents", owner_column="dealer_id", bucket="dealer-documents")
EXPERT = Kind(table="expert_documents", owner_column="expert_id", bucket="expert-documents")

LOCKED = "This application cannot be changed now: it is under review, or already approved"


async def list_documents(access_token: str, kind: Kind, owner_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table(kind.table)
        .select(DOCUMENT_COLUMNS)
        .eq(kind.owner_column, owner_id)
        .order("created_at")
        .execute()
    )
    return as_rows(response)


async def register(
    access_token: str, kind: Kind, owner_id: str, storage_path: str, file_name: str, required_document_id: str | None
) -> dict:
    if not storage_path.startswith(f"{owner_id}/"):
        # The database refuses this too; saying so here gives a clearer message for a client bug.
        raise AppHTTPException(422, "A document must be in your own folder", "validation_failed")
    client = await get_user_scoped_client(access_token)
    try:
        response = (
            await client.table(kind.table)
            .insert(
                {
                    kind.owner_column: owner_id,
                    "storage_path": storage_path,
                    "file_name": file_name.strip(),
                    "required_document_id": required_document_id,
                }
            )
            .execute()
        )
    except APIError as exc:
        if exc.code == "42501":
            raise AppHTTPException(403, LOCKED, "application_locked") from exc
        if exc.code == "22023":
            raise AppHTTPException(422, exc.message or "No such uploaded file", "validation_failed") from exc
        if exc.code in ("23503", "22P02"):
            raise AppHTTPException(422, "No such required document", "validation_failed") from exc
        if exc.code == "23505":
            raise AppHTTPException(409, "This file is already attached", "conflict") from exc
        raise
    row = first_row(response)
    rows = as_rows(await client.table(kind.table).select(DOCUMENT_COLUMNS).eq("id", row["id"]).limit(1).execute())
    return rows[0] if rows else row


async def remove(access_token: str, kind: Kind, owner_id: str, document_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    found = as_rows(
        await client.table(kind.table)
        .select("id,storage_path")
        .eq("id", document_id)
        .eq(kind.owner_column, owner_id)
        .limit(1)
        .execute()
    )
    if not found:
        raise AppHTTPException(404, "No such document", "not_found")
    try:
        deleted = as_rows(await client.table(kind.table).delete().eq("id", document_id).execute())
    except APIError as exc:
        # The delete trigger re-checks on the locked profile row: a submission that just froze the application wins.
        if exc.code == "42501":
            raise AppHTTPException(403, LOCKED, "application_locked") from exc
        raise
    if not deleted:
        # The owner can read it but the delete policy hid it: the application is locked.
        raise AppHTTPException(403, LOCKED, "application_locked")
    try:
        await client.storage.from_(kind.bucket).remove([found[0]["storage_path"]])
    except (StorageApiError, httpx.HTTPError) as exc:
        # The row is gone, so the application no longer lists the file; one left behind in the owner's folder is
        # swept when the account is deleted (common/profile/repository.py).
        logger.warning("document file not removed: %s", type(exc).__name__)


async def signed_url(access_token: str, kind: Kind, owner_id: str, document_id: str) -> str:
    """A short-lived link to one document of one applicant, for an admin. The path is looked up here from the
    document's own row, never taken from the client, so only a document that belongs to `owner_id` can be opened."""
    client = await get_user_scoped_client(access_token)
    rows = as_rows(
        await client.table(kind.table)
        .select("storage_path")
        .eq("id", document_id)
        .eq(kind.owner_column, owner_id)
        .limit(1)
        .execute()
    )
    if not rows:
        raise AppHTTPException(404, "No such document", "not_found")
    try:
        response = await client.storage.from_(kind.bucket).create_signed_url(
            rows[0]["storage_path"], SIGNED_URL_SECONDS
        )
    except StorageApiError as exc:
        # Storage answers an error, not an empty link, for a file that is not there (A3b verification, M1). The database
        # keeps a registered file from being deleted, so this is a legacy row or an operator's removal.
        raise AppHTTPException(404, "The file of this document is missing", "not_found") from exc
    url = response.get("signedUrl") or response.get("signedURL")
    if not url:
        raise AppHTTPException(404, "The file of this document is missing", "not_found")
    return url

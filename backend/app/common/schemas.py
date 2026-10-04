from typing import Literal

from pydantic import BaseModel, Field


class Location(BaseModel):
    """The structured place stored as jsonb on farms, stores, listings and experts."""

    city: str | None = None
    province: str | None = None
    country: str | None = None


class AccountDecision(BaseModel):
    """The outcome of an admin's decision on a dealer or expert application (common/account_status.py), returned by
    both routes that decide one. `email_delivered` says whether the applicant's decision email reached the mail server
    (SRDS §9); False when email is off in this environment or the send failed, so the admin can follow up."""

    role: Literal["admin", "expert", "dealer", "farmer", "buyer"]
    previous_status: Literal["pending", "approved", "rejected"]
    new_status: Literal["pending", "approved", "rejected"]
    email_delivered: bool = False


# ---- Applications (A3b): shared by the dealer and expert modules and the admin review ------------------------------

ApplicationRole = Literal["dealer", "expert"]


class RequiredDocument(BaseModel):
    """One document an applicant of a role is asked for (SRDS §7: the list is configurable, by an admin)."""

    id: str
    role: ApplicationRole
    code: str
    label: str
    description: str | None = None
    is_required: bool
    active: bool
    sort_order: int


class RequiredDocumentRef(BaseModel):
    id: str
    code: str
    label: str


class RegisterDocumentRequest(BaseModel):
    """A file the applicant has uploaded to their own folder of their role's bucket, to attach to the application.
    The size and type are read from Storage by the database (fill_application_document), never taken from here."""

    storage_path: str = Field(min_length=3, max_length=300)
    file_name: str = Field(min_length=1, max_length=200)
    required_document_id: str | None = None


class ApplicationDocument(BaseModel):
    id: str
    required_document_id: str | None = None
    file_name: str
    mime_type: str | None = None
    size_bytes: int | None = None
    created_at: str
    required_document: RequiredDocumentRef | None = None


class SignedUrl(BaseModel):
    url: str

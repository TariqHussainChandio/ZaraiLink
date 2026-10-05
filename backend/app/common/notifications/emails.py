"""The application decision emails (A3b; SRDS §8, §9, §11).

SRDS §9 lists what the approval email must carry: the approval confirmation, the account information, the login
instruction, the ZaraiLink login destination and the relevant next steps. The rejection email carries the admin's
reason and how to send the application again, which is what the applicant's Application Status screen shows too.

`string.Template` with `safe_substitute` is enough for two fixed messages; every value from the database is escaped
for the HTML part, since a name or a reason is free text.
"""

from dataclasses import dataclass
from html import escape
from string import Template

_ROLE_NAMES = {"dealer": "dealer", "expert": "agricultural expert"}

# What an approved account does first, by role (SRDS §8, §11): the dealer dashboard, the expert workspace.
_NEXT_STEPS = {
    "dealer": "Open your dealer dashboard to set up your store, list your products and start receiving orders.",
    "expert": "Open your expert workspace to complete your public profile and start answering consultation requests.",
}

_APPROVAL_TEXT = Template(
    """Dear $name,

Your ZaraiLink $role application has been approved.

Account
  Name: $name
  Email: $email
  Account type: $role_title

To start, sign in again: open the ZaraiLink app on your phone, sign out if you are still signed in, then sign in with
$email and your password. Signing in again turns on everything an approved $role can do.

Next steps: $next_steps

The ZaraiLink team
"""
)

_APPROVAL_HTML = Template(
    """<h2>Your application has been approved</h2>
<p>Dear $name,</p>
<p>Your ZaraiLink $role application has been approved.</p>
<table>
<tr><td>Name</td><td>$name</td></tr>
<tr><td>Email</td><td>$email</td></tr>
<tr><td>Account type</td><td>$role_title</td></tr>
</table>
<p><strong>To start, sign in again:</strong> open the ZaraiLink app on your phone, sign out if you are still signed
in, then sign in with $email and your password. Signing in again turns on everything an approved $role can do.</p>
<p><strong>Next steps:</strong> $next_steps</p>
<p>The ZaraiLink team</p>
"""
)

_REJECTION_TEXT = Template(
    """Dear $name,

Your ZaraiLink $role application was not approved this time.

Reason given by the reviewer:
$reason

You can correct your application and send it again: open the ZaraiLink app, sign in with $email, choose
"Update and resubmit" on the Application Status screen, make the changes and submit.

The ZaraiLink team
"""
)

_REJECTION_HTML = Template(
    """<h2>Your application was not approved</h2>
<p>Dear $name,</p>
<p>Your ZaraiLink $role application was not approved this time.</p>
<p><strong>Reason given by the reviewer:</strong></p>
<blockquote>$reason</blockquote>
<p>You can correct your application and send it again: open the ZaraiLink app, sign in with $email, choose
<em>Update and resubmit</em> on the Application Status screen, make the changes and submit.</p>
<p>The ZaraiLink team</p>
"""
)


@dataclass(frozen=True)
class Email:
    subject: str
    text: str
    html: str


def application_decision(role: str, decision: str, full_name: str, email: str, reason: str | None) -> Email:
    """The email for one decision: `decision` is `approved` or `rejected`, `role` is `dealer` or `expert`."""
    role_name = _ROLE_NAMES.get(role, role)
    plain = {
        "name": full_name or "applicant",
        "email": email,
        "role": role_name,
        "role_title": role_name.capitalize(),
        "next_steps": _NEXT_STEPS.get(role, ""),
        "reason": reason or "",
    }
    safe = {key: escape(value) for key, value in plain.items()}
    if decision == "approved":
        return Email(
            subject=f"Your ZaraiLink {role_name} account is approved",
            text=_APPROVAL_TEXT.safe_substitute(plain),
            html=_APPROVAL_HTML.safe_substitute(safe),
        )
    return Email(
        subject=f"Your ZaraiLink {role_name} application needs changes",
        text=_REJECTION_TEXT.safe_substitute(plain),
        html=_REJECTION_HTML.safe_substitute(safe),
    )

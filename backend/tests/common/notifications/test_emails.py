"""The application decision emails (app/common/notifications/emails.py): what SRDS §9 asks the approval email to carry,
and the reason in the rejection."""

from app.common.notifications.emails import application_decision


def test_the_approval_email_carries_every_item_srds_9_lists():
    message = application_decision("dealer", "approved", "Ali Khan", "ali@example.test", None)
    assert "approved" in message.subject
    # Approval confirmation, account information, login instruction, login destination, next steps.
    assert "has been approved" in message.text
    assert "Name: Ali Khan" in message.text
    assert "Email: ali@example.test" in message.text
    assert "Account type: Dealer" in message.text
    assert "sign in again" in message.text
    assert "open the ZaraiLink app" in message.text
    assert "Next steps:" in message.text
    assert "dealer dashboard" in message.text


def test_an_expert_is_pointed_at_the_expert_workspace():
    message = application_decision("expert", "approved", "Dr Sana", "sana@example.test", None)
    assert "agricultural expert" in message.subject
    assert "expert workspace" in message.text


def test_the_rejection_email_carries_the_reason_and_how_to_resubmit():
    message = application_decision("dealer", "rejected", "Ali Khan", "ali@example.test", "The licence has expired.")
    assert "needs changes" in message.subject
    assert "The licence has expired." in message.text
    assert "Update and resubmit" in message.text


def test_free_text_is_escaped_in_the_html_part():
    message = application_decision("dealer", "rejected", "<b>Ali</b>", "ali@example.test", "Bad <script>x</script>")
    assert "<script>" not in message.html
    assert "&lt;script&gt;" in message.html
    assert "<b>Ali</b>" in message.text  # plain text is shown as text, not markup

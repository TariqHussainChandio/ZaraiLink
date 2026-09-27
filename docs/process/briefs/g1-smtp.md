# Integration Brief: Custom SMTP for auth email (gate G1)

Status: **decided 2026-09-27: Gmail SMTP** (the maintainer's choice for the FYP; no domain needed). The sending
account is `tariqhussainchandio1357@gmail.com` with 2-step verification and an app password. The settings are in
`supabase/config.toml` under `[remotes.production.auth.email.smtp]` (smtp.gmail.com:587, sender name ZaraiLink), so
only the hosted project sends real mail; the local stack keeps Mailpit. The app password is never stored in git or a
file: it is set as `SUPABASE_AUTH_SMTP_PASS` only in the terminal session that runs `npx supabase config push`.
Limits to know: Gmail allows about 500 messages a day and may throttle bursts; mail comes from a personal Gmail
address. Before a public release, move to a provider with your own domain (Resend or Brevo below) by changing only
that block. The analysis below is kept as it was written.

```
Service and purpose:           Transactional email for the hosted Supabase project's Auth service
                               (signup confirmation codes, password-reset codes, the future
                               notification-email templates). Supabase's own shared sender works
                               for local dev (Mailpit) but on the hosted project it (a) reaches
                               only accounts already listed as project members, and (b) rejects
                               any template customization outright — confirmed live:
                               `supabase config push` returns 400 "Email template modification is
                               not available for free tier projects using the default email
                               provider." Both problems are solved by pointing
                               [auth.email.smtp] at a real provider.

Options considered:
  1. Brevo (formerly Sendinblue)  Free tier: 300 emails/day, no card required, no rolling monthly
                                  cap. SMTP relay credentials are a username + API key, no code
                                  changes beyond config.toml. Available to sign up from Pakistan.
                                  Domain verification via standard DNS TXT/CNAME records.
  2. Resend                       Free tier: 3,000 emails/month (100/day). Modern, developer-
                                  focused dashboard; same DNS-based domain verification. Slightly
                                  lower daily cap than Brevo, more than enough for auth email at
                                  this project's scale (a handful of signups/resets a day, not a
                                  marketing list).
  3. Amazon SES                  Cheapest per email ($0.10/1,000) once out of sandbox, but starts
                                  in a sandbox that can only send to pre-verified addresses until
                                  AWS approves a production-access request — an extra approval
                                  step with unpredictable turnaround, not worth it at this volume.
  4. Do nothing (stay on the
     default shared sender)      Signup/reset for anyone outside the project's own team stays
                                  broken on the hosted project indefinitely (finding A2/C3).

Recommendation and why:        Option 1 (Brevo). The highest free daily cap of the three real
                               options, no credit card, and this project's actual send volume
                               (auth codes only, no marketing/bulk mail) is a small fraction of
                               300/day even at a full class of test users. Resend is the fallback
                               if Brevo's verification process stalls — functionally equivalent for
                               this use case, just a lower daily ceiling.

What YOU (the maintainer) must do:
                               1. Create a Brevo account (or Resend, if you prefer) with an email
                                  you control.
                               2. Add and verify a domain you control (or a free subdomain the
                                  provider offers, if you don't have your own) — this means adding
                                  the DNS records the provider's dashboard gives you (SPF, DKIM,
                                  and a tracking/return-path CNAME). This step is entirely on the
                                  provider's dashboard; I don't need access to do it.
                               3. Generate SMTP credentials (Brevo: SMTP & API -> SMTP tab; Resend:
                                  API Keys, used as the SMTP password with `resend` as the
                                  username) and store them where step 4 below says.
                               4. Tell me the account and domain are ready. I then fill in
                                  [auth.email.smtp] in config.toml (host/port/user, `pass =
                                  "env(...)"` — never the literal secret) and run
                                  `supabase config push` against the linked hosted project, or
                                  give you the exact command if you'd rather run it yourself.

Secret and variable names:     SUPABASE_AUTH_SMTP_PASS (the provider's SMTP password/API key) —
                               stored as a Supabase project secret (`supabase secrets set`, not
                               in git, not in chat) referenced from config.toml as
                               `env(SUPABASE_AUTH_SMTP_PASS)`, matching the existing
                               `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` pattern already in
                               config.toml for the (still separately gated, G2) SMS provider.

Where it is used in code:      supabase/config.toml's [auth.email.smtp] block (currently
                               commented out — see its own comment for why); no application code
                               reads this directly, it only affects what Supabase Auth does when
                               it sends mail.

How I prove it without the real service:
                               Already proven, this session: local Mailpit inbox, real signup and
                               real password-reset requests, both produce a 6-digit code (not a
                               link) that verifies successfully —
                               backend/tests/integration/smoke/ and this session's own manual
                               script confirm it end to end.

How I prove it live:           Once SMTP is configured and pushed, a real signup against the
                               *hosted* project's API, checking a real inbox for the code (not
                               Mailpit) and completing verification — the same flow as AT11 in the
                               plan's P4 acceptance tests. Output attached to the phase record.

If the service is down:        Supabase Auth's signup/reset calls fail with a 5xx/500-ish error
                               from GoTrue (an SMTP send failure surfaces as an error on the
                               request itself, not a silent drop) — the app's existing error
                               handling on those screens (ForgotPasswordScreen,
                               RegisterScreen) already shows that as a submit error, not a false
                               "sent" message.

Privacy and cost:              Only the recipient's email address and the transactional message
                               body (a 6-digit code, no personal data beyond what the user just
                               typed into the form) pass through the provider. Both Brevo and
                               Resend's free tiers are $0 at this volume; no card is charged
                               without an explicit upgrade.
```

## After this is done

- Flip the feature register's "Email sign-up with code verification" and "Password reset" rows
  from `Blocked` to `Works` once the live smoke test (AT11) passes.
- `docs/process/standardization-plan.md` §1.5's C3 row updates from "P4 (4A-4C)" partial to done.

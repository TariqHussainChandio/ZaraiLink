# Integration Brief

Use this whenever a task needs a service outside this repository and the local Supabase stack. Write it, then
stop and ask the maintainer. Do not write code that calls a service that has not been provisioned.

```
Service and purpose:           <what it does, and the requirement or business rule it serves>
Options considered:            <two or three, with cost, free-tier limits, and availability in Pakistan>
Recommendation and why:

What YOU (the maintainer) must do:
                               <create the account, verify the domain, which keys to copy, where to store them>
Secret and variable names:     <exact names and which environment: local, staging, production>
Where it is used in code:      <files and modules>

How I prove it without the real service:
                               <local substitute, fake, or recorded sandbox fixtures>
How I prove it live:           <the smoke-test script and the output that means success>

If the service is down:        <what the app does; it must fail visibly, never silently>
Privacy and cost:              <personal data sent, retention, per-message or per-request cost>
```

## Rules

- Secrets never go in the brief, in chat, or in git. Say where they will be stored, not what they are.
- "Proven without the real service" is not "works". The feature stays `Blocked` in the feature register, and
  hidden in the app, until the live smoke test passes and its output is attached.
- If the maintainer has not answered, everything that does not depend on the answer still gets finished.

## Services that need a brief

Custom email server, SMS provider, staging Supabase project, API hosting, error tracking, push messaging,
payment gateway, model-file storage, Play Console, static hosting for the privacy pages, Expo account, and bot
protection. Anything else that leaves this repository is added to this list.

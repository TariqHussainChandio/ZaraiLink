# Task card

One per task. Fill it in before writing code, keep it in the pull request or the phase notes, and complete
the last two lines when you finish. If you cannot fill in the acceptance tests, you do not yet understand the task.

```
Task / phase:               <id and one-sentence objective>
Requirement or finding ids: <SRDS section, BR-xx, or audit finding such as C1>
Skill(s):                   <implementer>, verified by <a different agent or person>

Files in scope:
Files explicitly out of scope:

Acceptance tests (written first; for a bug, seen failing before the fix):
  1.
  2.

Needs an outside service?   no | yes -> Integration Brief: <link>
Evidence I will attach:     <commands and output, screenshots or adb logcat, two-user proof if security-related>
Rollback:                   <how to undo it>

--- at the end ---
Result:                     works on the real stack | partially | blocked
Not done / blocked:         <every part left undone, and why; write "nothing" only if it is true>
Feature register updated:   yes | not needed
```

A worked example, the auth sign-up fix:

```
Task / phase:               P4. Email sign-up verifies a real user with a code.
Requirement or finding ids: C3 (sign-up cannot complete), SRDS 6.1
Acceptance tests:           1. Register, read the 6-digit code from the local mail inbox, verify, land on the
                               correct role dashboard. 2. A forged admin role at sign-up stays non-admin.
Needs an outside service?   yes for staging (email server): Integration Brief linked. Locally: none.
Evidence I will attach:     the test output plus a live smoke test to a real inbox on staging.
```

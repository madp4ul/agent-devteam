# Computer Use and project allowances

## Decisions so far

- [01 — Computer Use app approval](issues/01-computer-use-app-approval-recovery.md):
  installed TypeScript SDK 0.160.0/exec exposes no native app approval response
  interface; Continue and reviewer text cannot grant app access. Historical
  evidence verifies prompt delivery and separates app refusals from Auto-review.
  Missing prompt root cause and grant inheritance remain unverified.
  [Evidence](evidence/01-incident-findings.md).
  Follow-through verified saved native approval: after the user chose Always
  allow for Paint, two fresh SDK threads activated it successfully, including
  one without parent-chat routing identifiers. No runtime migration was needed.
  [Setup](../../docs/computer-use-setup.md). No additional follow-through tickets.

## Ticket01 follow-through frontier

- 01: resolved; verified SDK saved-grant recovery and documented setup.

Ticket02 is independently owned; this map records only ticket01's decision and
follow-through and does not summarize or alter that investigation's status.

## Ticket02 implementation

- [02 — Launch-time project allowances](issues/02-launch-time-project-allowances.md) is resolved: launch-only guidance is implemented for every agent with per-attempt source and native delivery evidence. Full tests/typecheck and standards/spec review passed. Follow-through tickets 05–07 were removed at the user's request.



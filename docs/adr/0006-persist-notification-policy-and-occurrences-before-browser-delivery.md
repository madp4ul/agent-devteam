# Persist notification policy and occurrences before browser delivery

Status: accepted

Notification policy and eligible notification occurrences belong to the
coordination core's durable per-process state, while consent, operating-system
permission, and Appearance remain browser-local. Eligibility is evaluated when
the authoritative event is recorded and open browsers poll forward from their
current cursor, rather than deriving notifications from board projections or
claiming delivery centrally. This preserves actor provenance and prospective
silencing across restarts while keeping desktop delivery best-effort and able
to occur independently in separate browsers.

## Consequences

- Disabled or missed occurrences are never replayed after enablement, reload,
  restart, or reopening all browser tabs.
- Each browser advances past observed occurrences even when local delivery is
  unavailable or fails, and uses the occurrence ID as the operating-system tag.
- Column subscriptions retain stable board/column identity and initialize only
  when that identity is first encountered.
- Browser-local consent and permission cannot change authoritative task,
  attention, or notification-policy state.

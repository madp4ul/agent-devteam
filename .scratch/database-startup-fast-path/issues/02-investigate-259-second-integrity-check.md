# 02 — Investigate the reported 259-second startup integrity check

**Type:** research

**Status:** resolved

**Resolution:** Not reproducible; no implementation change justified.

## Reported problem

On 8 November 2026, after the startup-copy optimization, the user observed the
integrity check on the older, data-heavy database taking **259 seconds**. The
check completed and the framework is now running. The user does not recall it
ever taking this long and reports that simply copying the database was much
faster. Treat this as a suspected startup regression, not a proven consequence
of the optimization; do not conflate phase duration with whole-startup duration.

## Existing evidence

- [Ticket 01](01-safe-clean-startup.md) removed the disposable inspection copy
  for eligible current-schema databases but retained full health verification.
- `src/application/internal/coordination-database.ts` runs full
  `PRAGMA integrity_check`, then `foreign_key_check`, even with no migrations.
- Read-only comparison with the parent of implementation commit `b05c33a`
  confirmed these checks already existed. The cause of any increased duration
  remains unmeasured; do not claim the optimization introduced integrity checks.
- The existing `../benchmark.mjs` fixture contains 1,024 approximately 1 MB
  response rows. It exercises byte volume but does not represent a mature
  database's row counts, indexes and relational distribution. Its roughly
  0.7-second direct startup result does not establish real-world startup speed.
- SQLite documents that full integrity checking also verifies index/table
  consistency and uniqueness, unlike quick_check:
  https://www.sqlite.org/pragma.html#pragma_quick_check

## Investigation and decision criteria

- [ ] Establish a representative, repeatable before/after timing comparison
      without modifying retained data or disrupting the running framework.
      Separate copy, schema, integrity, foreign-key and other startup phases.
- [ ] Record database/version/row/index characteristics and relevant cache,
      storage and contention conditions. Test explanations instead of assuming
      either the new lock handoff or database growth caused the regression.
- [ ] Assess which checks ordinary startup actually needs, versus migration,
      recovery and explicit maintenance. Document safety tradeoffs before
      proposing a lighter check or moving full verification off startup.
- [ ] Replace or supplement the byte-heavy benchmark with representative
      record/index-heavy coverage and a meaningful startup performance signal.
- [ ] Record findings and publish bounded follow-up implementation tickets
      where justified; do not silently disable checks to obtain faster timings.

## Comments

8 November 2026, final user follow-up: The user also could not reproduce the
259-second startup and considers it possibly a one-time event. Close this
investigation without claiming a diagnosed cause or a performance fix. Earlier
instructions below to keep it open are superseded by this disposition.

8 November 2026 investigation: [Measured findings](../investigation-259-seconds.md).
The isolated old-database snapshot opens in 1.64–1.68 s on the direct path versus
2.06–2.44 s on the copied path; integrity itself takes 1.38–1.49 s. A read-only
original-file check took 1.175 s. These cache-warm results do not reproduce the
reported delay. The console elapsed counter measures total startup, not phase
duration. User confirmed the original Idle Games project and non-V2 batch
launcher, with the console ticking to 259 seconds during the wait. Launcher and
Git-local binding inspection confirm the measured database and same framework
checkout. Keep this issue open pending a reproducible slow run or phase-specific
logs; no verification behavior changed.

8 November 2026, follow-up: User authorized waiting for the two active runs to
finish and then starting framework work. The API now reports paused, with zero
runs/preparations. Investigation proceeds on isolated snapshots, without live
database mutation or restarting/resuming the application.

8 November 2026: The user requested documentation and later investigation,
explicitly deferring implementation while the framework is running. No live
database benchmark, restart, configuration change or implementation is authorized
by this ticket alone. Coordinate a suitable investigation window before any
disruptive or materially resource-intensive work.

## Answer

Neither the user's retry nor the recorded measurements reproduced the delay.
Retain the original observation and investigation findings for comparison if
it recurs. No startup or integrity-check behavior was changed, and no further
implementation is warranted by the current evidence. The uncompleted broader
investigation criteria above are deferred rather than claimed as satisfied.
Reopen if a repeatable slow run or new phase-specific evidence becomes available.

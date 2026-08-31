# Released-schema fixtures

Each production migration ID gets one immutable populated fixture containing
representative retained data valid for that released schema. Upgrade tests
start from the fixture's recorded released history and run the current
application across every missing production migration.

The first fixture is data-only because the immutable
`0001_initial_released_schema` migration remains the sole executable definition
of that schema. Tests may append test-only migrations through the application
startup dependency seam to prove skipped-release ordering, atomic rollback, and
verification behavior before a real second release exists. Those IDs must use
the `test_` prefix and must never enter the production registry or schema
snapshot.

When a real later schema ships, add a new fixture rather than modifying an
older one. Keep all released migrations and fixtures indefinitely.

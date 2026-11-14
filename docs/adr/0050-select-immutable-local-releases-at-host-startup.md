# Select immutable local releases once at host startup

Status: accepted

Publication refinement: [ADR 0051](0051-distribute-tagged-releases-through-github.md)
supersedes the local-only and dirty-source release model below. Its installation
isolation, host-lifetime selection and project-state guarantees remain accepted.

The user develops the coordination framework while sibling idle-game projects
execute it. Launching those projects from the development checkout makes source,
dependency and browser-build changes observable during an existing host session,
including when it later launches workers or MCP adapters.

Publish complete local installations into distinct directories outside the
checkout. Explicit release publication verifies a candidate before atomically
selecting it as latest. Project launchers resolve that selection once, and the
host and all later children use that concrete installation for the host's entire
lifetime. Publishing never replaces an installation's contents, interrupts agents
or restarts a host. Retain older installations rather than guessing whether
another process still uses them.

This chooses restart-time adoption over both automatic live updates and manual
per-project version selection. It adds a release operation on the framework side
while preserving the user's existing project batch-file startup routine. A host
starting concurrently with publication may select either complete release, never
mixed files. A missing or broken selection fails visibly without source fallback.

For this local increment, installed supported Node.js is acceptable. Readable
TypeScript snapshots are also acceptable; isolation does not require compilation
or removal of diagnostics. Preserve release provenance, matching source and
existing retained evidence so outside Codex agents can investigate the exact code
that ran. Application dependencies and native SDK assets belong to each
installation, without links back into the development dependency tree.

The existing project-state binding and guarded startup remain authoritative.
Restarting into a newer release runs the normal compatibility, migration,
independently verified recovery-backup and failure-reporting flow. Never silently
fall back to an older executable or automatically restore state after a failed
startup. Application-version selection is not database downgrade support.

This is an interim local delivery of the host-native application described by
[ADR 0002](0002-self-contained-host-native-distribution.md); it does not replace
the longer-term bundled-runtime distribution decision. Process definitions, role
instructions and the user's Node.js/Git/Codex environment remain external inputs.

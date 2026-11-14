# Distribute tagged application releases through GitHub

Status: accepted; supersedes ADR 0050's local-only publication and dirty-source
release model, retaining its fixed-per-host installation and state guarantees.

The user clarified that a release is a shared versioned artifact associated with
the source repository. A local snapshot containing uncommitted work provides
runtime isolation but does not establish that shared distribution contract.
Build the complete application from an existing committed version tag, attach
its native-platform ZIP to a draft GitHub Release, and publish only after all
assets and verification complete. Keep generated copies out of Git history.

Consumers use a self-contained bootstrap that checks latest once at project
startup, verifies the downloaded digest and committed provenance, and atomically
installs into a local cache. The existing sibling installation directory is a
compatibility cache, not the shared release store. Return one concrete version
for validation, host startup, browser assets and all later worker/MCP processes.
Maintain the existing V2 batch-file location and ordinary restart adoption.

This separates development snapshots, hosted release publication and local
installation. Installed Node.js remains acceptable. Retain readable source and
diagnostic evidence. Repository immutability is recommended, but the agent does
not change settings or claim server-side enforcement that has not been checked.

Unavailable discovery may warn and use the last validated local installation;
first install without a cache fails. Corrupt metadata/artifacts and selected-host
startup/migration failures fail closed without older-version retry. The existing
project-state guard and migration ledger remain authoritative even if the remote
maintainer later changes which version is designated latest.

The user owns committing, pushing and tagging the implementation. CI verifies an
existing remote tag and receives contents-write permission only in publication.
Uncommitted tooling and failed tests must not be presented as a published release.

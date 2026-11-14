# Investigate hosted release-creation token permissions

Type: task
Status: open
Blocked by: none
Release blocking: no; authorized maintainer publication is documented.

Packaging-only run:
https://github.com/madp4ul/agent-devteam/actions/runs/43631277303

The build, installed verification, artifact transfer and checksum verification
passed. GitHub CLI release creation then received HTTP 403 `Resource not
accessible by integration` from `/repos/madp4ul/agent-devteam/releases`, despite
the job showing `Contents: write`. The tag was v0.1.2 at b12ced7 while workflow
orchestration ran from newer main. The precise authorization cause is not yet
established; do not claim it is fixed or weaken repository settings speculatively.

The release was published successfully using existing maintainer authentication
and the verified local exact-tag artifact. Public launcher installation and real
V2 process validation passed. Future agents may use that documented fallback
immediately; restoring hosted publication permissions is a separate improvement.

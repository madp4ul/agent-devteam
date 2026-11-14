# Investigate hosted release-creation token permissions

Type: task
Status: resolved
Blocked by: none
Release blocking: yes for declaring the regular pipeline complete; v0.1.2 remains usable.

Packaging-only run:
https://github.com/madp4ul/agent-devteam/actions/runs/43631277303

The build, installed verification, artifact transfer and checksum verification
passed. GitHub CLI release creation then received HTTP 403 `Resource not
accessible by integration` from `/repos/madp4ul/agent-devteam/releases`, despite
the job showing `Contents: write`. The tag was v0.1.2 at b12ced7 while workflow
orchestration ran from newer main. The precise authorization cause is not yet
established in the initial investigation; the primary-source diagnosis below
now identifies the extra authorization check.

The release was published successfully using existing maintainer authentication
and the verified local exact-tag artifact. Public launcher installation and real
V2 process validation passed. That one-off publication does not complete this
ticket: the user explicitly requires a working, proven regular pipeline.

## Diagnosis and correction

The [official create-release API](https://docs.github.com/en/rest/releases/releases#create-a-release)
documents the extra workflow-write permission check for an explicitly supplied
older target whose workflow files differ from the default branch. It explicitly
states that GITHUB_TOKEN cannot receive that permission. The CLI sends
`target_commitish` only when `--target` is supplied; that target is redundant for
an existing tag. See [primary-source findings](../publication-token-research.md).

Remove `--target` while preserving the complete remote tag-SHA verification and
`--verify-tag`. Keep publication-only `contents: write`; do not add a personal
token or broaden repository settings. Typechecking/behavioral tests remain local
under ADR 0053. Use v0.1.3 to prove the ordinary tag-push workflow.

## Acceptance

- Normal v0.1.3 tag push triggers the committed packaging-only workflow.
- Build, installed verification, asset transfer, publication, retention and
  temporary-artifact cleanup all succeed with the workflow token.
- Published ZIP and checksum match the server digest and exact tagged commit.
- The installed bootstrap can consume the normal-flow release without changing
  an existing running host or its process definition.
- Guide and tracker record actual workflow evidence; no manual upload substitutes
  for the end-to-end proof.

## Answer and regular-flow proof

The ordinary annotated-tag push for v0.1.3 at
`2364e0a1b7ff3ca27ee73c5c2945c8ce1af0c80e` triggered
https://github.com/madp4ul/agent-devteam/actions/runs/43632212204 (`event: push`).
All three jobs completed successfully: build, publish and cleanup-transfer.
Hosted retention's own step succeeded, and the run's artifact API reported
`total_count: 0` after cleanup. No maintainer credential was used to create,
upload or publish this release; publication used the workflow's token.

https://github.com/madp4ul/agent-devteam/releases/tag/v0.1.3 is the designated
latest stable release. Its 219,498,903-byte ZIP has SHA-256
`a39920766f916c5ce39b2929353761d69a61c114d6072e04ad0989f32ffc2aa6`,
matching GitHub's asset digest and the published checksum sidecar.

The existing self-contained local bootstrap downloaded and selected v0.1.3.
Its installed metadata matches the exact tagged commit, and its CLI validated
the real Autonomous V2 process definition. The existing game batch file still
uses this same bootstrap through its process launcher. No live host was started
or restarted. This proves the regular publication and consumer flow rather than
only the one-off maintainer publication of v0.1.2.

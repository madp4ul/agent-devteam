# 01 — Build and publish a committed application release

Status: resolved — implementation verified and reviewed; awaiting user code review.

Type: task

Blocked by: none.

Parent: [Specification](../spec.md).

What to build: a versioned, verified application ZIP built exclusively from an
existing committed tag, published through a reviewable native Windows workflow
as a repository-attached GitHub Release.

- [x] Dirty source never enters the tagged artifact; full commit provenance is retained.
- [x] Complete installation includes browser, workers, MCP, native SDK dependencies and readable source.
- [x] ZIP packing includes hidden files and safe extraction rejects escaping/link/colliding entries.
- [x] Existing installed-host verification succeeds before artifact publication.
- [x] Read-only CI build typechecks/tests and transfers only verified output to a separately privileged publication job.
- [x] Existing remote tags are verified; all assets are attached before the draft is published as latest.
- [x] No actual repository commit, tag, push, remote setting change or uncommitted publication is performed by the agent.

## Comments

- 2026-11-14: User accepted committed shared release artifacts and authorized implementation; this refines the already approved release workflow.

## Implementation evidence

- Added a public tagged-artifact builder. It exports the existing tag commit with
  Git, checks committed package version against the tag, packages only that tree,
  and records exact commit/tag provenance before installation readiness.
- Output is a complete Windows x64 ZIP plus SHA-256 sidecar. Existing tag outputs
  are never overwritten; same-directory hard-link publication exposes complete
  artifact bytes atomically.
- The shared archive helper uses Windows PowerShell/.NET ZIP APIs, preserving
  hidden files and long paths. It checks all paths, link types, duplicate/colliding
  names and metadata limits before extraction, and bounds actual streamed bytes.
- CI pins actions by full commit, checks types and the complete non-model suite,
  builds under read permissions and transfers verified output to a separate
  write-permission publisher. Publication verifies the existing remote tag still
  matches the build, attaches assets to a draft and then publishes latest.
- Red: artifact test failed on missing builder. Green: both committed-source and
  archive-boundary tests passed (117.1 seconds plus 1.4 seconds). Dirty source was excluded;
  duplicate/invalid/missing/mismatched tags rejected. Actual Windows PowerShell 5.1
  preserved a >260-character path and Hidden file, and rejected traversal before
  creating an extraction destination. Typecheck passed; workflow YAML parsed.
- The existing conversation-history suite failure remains a release CI blocker:
  the full-suite publication gate was not weakened or skipped. GitHub execution
  and remote publication were not performed; they require the user’s committed,
  pushed tag after source review.


### Final provenance and Windows line-ending verification

- The builder now compares its executing builder, packager and ZIP-helper text
  against those files in the selected commit (normalizing CRLF), both before
  capture and immediately before exposing the completed ZIP. Missing or changed
  tooling fails with instructions to build from the tag or CI.
- Git export disables global autocrlf conversion for this command, so local
  Windows configuration cannot change exported source bytes. The regression
  explicitly enables autocrlf in its disposable repository and compares installed
  source against the committed Git blob.
- Final targeted run passed both tests: committed artifact 103.96 seconds and
  archive boundary 1.75 seconds. Separate changed executing copies of all three
  build tools were rejected before output creation; dirty application source
  remained excluded.
- An in-flight run also rejected a real concurrent builder edit at its final
  tooling check, before artifact exposure. That transient run was superseded by
  the stable green run above.
- The publication job verifies the transferred ZIP against its SHA-256 sidecar
  before uploading it to GitHub.

## Integrated completion

Implementation, local bootstrap setup and two-axis review are complete. See [verification and deployment](../verification/results.md). This does not claim a hosted release: user-owned commit/push/tag and the existing full-suite blocker remain explicit publication gates.

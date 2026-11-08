# Review nested worktrees before individual archival

Status: accepted

## Decision

Extend ADR 0032's conservative nested-worktree rejection with an explicit,
browser-only review flow. Ordinary archive calls, including bulk archival, still
refuse nested registrations. The application exposes a read-only preview and
accepts its evidence token only on an individual user archive command. The
existing durable archival claim rechecks task eligibility and excludes framework
mutations during cleanup; no new database state or migration is required.

The preview includes the task checkout and each registered descendant, with Git
changes, ignored-file counts, named-ref reachability and local upstream divergence.
Unpushed commits are never equated with commits since task start. Missing upstream
or inspection data remains explicit. Parent HEAD must retain a named ref, as in
ordinary archival. Consent can discard a nested detached HEAD without a durable
ref only after that risk is shown. No branches are deleted and no fetch occurs.

The evidence token hashes canonical paths, HEAD/branch, index, containing refs,
upstream identity/divergence and streamed file contents, including ignored and
untracked evidence. Git administrative entries are excluded; each nested checkout
owns a separate fingerprint. Symlinks are hashed as links, never traversed; path
canonicalization and opened-file identity checks reject ambiguous inspection.
Unregistered embedded Git metadata is ambiguous and blocks deletion rather than
being omitted from the evidence. Previewing can be expensive for large workspaces, so the UI reports inspection in
progress and hashing streams bytes instead of buffering the whole tree.

After consent, revalidate the complete registration set and every remaining
fingerprint before each deepest-first Git removal. Never pass arbitrary browser
paths to Git or desktop openers. The Open flow resolves only a currently reviewed
entry and reports host errors. Opening uses canonical registration/path validation
independently of content consent, so unavailable Git status does not prevent
external inspection; only deletion remains blocked. All trust remains
command-scoped to verified paths.

## Failure and concurrency boundary

Changed scope/evidence or unavailable inspection stops deletion. Earlier removals
cannot be undone and are reported explicitly. A retry obtains a new preview of
the remaining scope. A failing nested Git removal reports the target path and
separate present/absent/unknown registration and filesystem outcomes, including
removal that completed before Git returned an error. Parent removal retains ADR 0032's durable-claim/remainder
recovery if Git unregisters before filesystem cleanup completes. Nested removal
failure leaves the parent intact; remaining evidence is included in the next
preview, including files whose nested registration Git already removed.

The application claim excludes cooperating framework mutations, not arbitrary
external editors or Git processes. Revalidation narrows the race window but does
not freeze the filesystem or make recursive deletion transactional. The dialog
asks the user to stop external writers and states that deletion is irreversible.

Bulk archival never carries consent tokens. Its response includes current task
titles with every rejection, and the browser links each failure to the individual
task flow. Older retained bulk receipts may lack titles; their IDs remain usable.

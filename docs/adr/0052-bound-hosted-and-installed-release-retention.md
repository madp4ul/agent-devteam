# Bound hosted release retention and preserve live local installations

Status: accepted

The user accepts full approximately 220 MB application downloads but wants bounded
storage without manual package management. Keep five published stable framework
releases after successful publication, preserving just-published/latest, drafts,
prereleases, unrelated releases and source Git tags. Delete whole old release
objects rather than individual assets so the policy also works with immutable
GitHub Releases. Serialize publication and pruning and revalidate targets before
deletion. Report cleanup failures separately from successful publication.
Delete the successful run's temporary Actions transfer artifact with a separate
Actions-write-only job; failed/canceled-run artifacts expire after one day.

Locally, one selected installation is the normal steady state, but an older host
may still need its browser files, worker code or native SDK binary after another
project adopts a new release. Record process-lifetime usage before returning the
selected path and serialize install/select/pin/prune through a small cache-local
SQLite database. Project coordination databases and recovery remain independent.
Delete only managed versions proved unused; preserve active leases, native
process references, unknown directories and uncertain pre-tracking ownership.

Keep locked dependencies in the verified bundle. Registry installation on the
consumer would add package-manager, network and lifecycle-script dependencies;
the accepted download size does not justify that operational burden. Production-
only bundling remains a possible later optimization, independent of retention.

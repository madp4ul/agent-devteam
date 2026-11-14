# Check behavior locally and publish packages in CI

Status: accepted; refines ADR 0051's release validation policy.

The user's goal is an independently installed, remotely published framework
that can run the idle-game project while the development checkout changes.
On 14 November 2026 the user explicitly rejected repeating the locally checked
test suite in GitHub Actions after hosted-runner timing and process-inspection
differences repeatedly delayed that goal.

Keep typechecking and behavioral tests in the local development workflow, with
appropriate results recorded by the releasing agent. Release CI installs locked
dependencies, builds from the exact committed tag, verifies the installed
application against disposable state, and publishes the verified ZIP/checksum.
Do not add the full test suite or typechecking back to publication as a gate
without a new user decision. A successful packaging workflow is not evidence
that hosted behavioral tests passed.

Keep immutable installation selection, startup migration checks, artifact
integrity, draft assembly and bounded retention unchanged. Packaging/provenance
or installed-application verification failures still prevent publication.

An unpublished tag may be retried using the current-main workflow after an
orchestration-only correction. The tag and packaged source never move. Actual
application changes still require a new committed version and tag. This avoids
creating new application versions merely to revise CI orchestration.

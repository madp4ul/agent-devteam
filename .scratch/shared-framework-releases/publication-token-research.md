# Hosted publication token failure

Investigated: 14 November 2026. Primary sources only.

## Confirmed API behavior

GitHub applies an additional workflow authorization check to release creation
when the resolved `target_commitish` differs in workflow files from the default
branch. Its REST documentation explicitly identifies HTTP 403 `Resource not
accessible by integration` as one possible response. Contents-write is not
sufficient in that case: workflow authorization is also required, and the
Actions `GITHUB_TOKEN` cannot receive it. Omitting the target resolves this
check against the default branch's latest commit. The update endpoint similarly
checks the new target, or the existing target when it is unchanged.
The tag's existing Git target is unaffected: the parameter is used to create a
missing tag, not to relocate an existing one.
Source: [GitHub release REST API](https://docs.github.com/en/rest/releases/releases#create-a-release),
including its [update-release section](https://docs.github.com/en/rest/releases/releases#update-a-release).

The CLI documents `--target` as the target for automatic tag creation, whereas
`--verify-tag` rejects missing remote tags. Thus an existing-tag release can
omit `--target` without enabling implicit tag creation, provided `--verify-tag`
is retained.
Source: [GitHub CLI release-create manual](https://cli.github.com/manual/gh_release_create).

The current CLI implementation adds the `target_commitish` request property
only when its Target option is nonempty. Omitting the option therefore omits
the API property, rather than silently substituting the old tagged commit.
Source: [CLI release-create source](https://github.com/cli/cli/blob/trunk/pkg/cmd/release/create/create.go#L415-L428).

## Incident assessment

Run [43631277303](https://github.com/madp4ul/agent-devteam/actions/runs/43631277303)
successfully built and verified v0.1.2 at
`b12ced79d4d2ee1545959f786f9b1281281e5deb`, then requested release creation with
`--target` set to that older commit. The executing/default main branch had
changed `.github/workflows/release.yml` since that tag. Local read-only
`git diff v0.1.2..a2db88b --name-only -- .github/workflows` confirms that difference.
The job logged Contents-write permission and the precise 403 documented above.

**Inference:** the redundant old-commit target triggered the documented workflow
authorization check. This closely matches all observed evidence, but the server
did not return a more granular authorization explanation. A successful pipeline
run after the correction is necessary to confirm the practical diagnosis.

## Smallest safe correction and proof

Remove only `--target $env:RELEASE_COMMIT` from `gh release create`. Keep
`--verify-tag`, the explicit remote-tag full-SHA comparison with the verified
build, draft assembly, asset hashes and publication/retention boundaries. Do not
broaden token permissions, persist a maintainer token, or change repository
security settings for this correction.

Prove the ordinary flow with a new committed version/tag: read-only build and
installed verification, GITHUB_TOKEN draft creation/upload/publication, hosted
retention, temporary-artifact cleanup, and normal launcher discovery of the
published release. Merely publishing with maintainer credentials does not prove
that workflow. Keep the already published v0.1.2 release unchanged.

## Live regular-flow result

The correction was exercised by the ordinary v0.1.3 tag push, not a manually
published substitute. [Run 43632212204](https://github.com/madp4ul/agent-devteam/actions/runs/43632212204)
completed build, publish (including retention) and transfer cleanup successfully
using the workflow token. GitHub's artifact API then returned zero artifacts for
the run. The existing bootstrap consumed the public release and its installed
provenance matched the tag. This establishes a working normal release flow with
the documented permission boundary; it does not claim the earlier server error
provided a more granular explanation than its recorded 403.

# Project growth snapshot

Committed history through `023c071621914eafdf16228e9dd2a9d6ca18d15e` (2026-10-02). This report samples all
201 commits on the first-parent history of that commit. Working-tree and
staged changes are excluded. Charts are local SVGs embedded in Markdown; no
server, external libraries, or network connection is needed.

## Code size against resolved implementation tickets

![Production and test source lines against cumulative resolved implementation tickets](project-growth/size.svg)

Each point represents one commit, in history order. X is the number of distinct
implementation tickets observed resolved by that commit. Commits without a new
resolution retain the same X coordinate, so vertical movement is meaningful.
Hover a point when viewing the SVG directly to inspect its commit and totals.

| Metric at endpoint | Count |
| --- | ---: |
| Resolved implementation tickets, cumulative | 144 |
| All resolved tickets, cumulative (including decisions/research) | 167 |
| Tickets currently marked resolved at endpoint | 167 |
| Production source lines | 24,913 |
| Test and test-support source lines | 31,444 |
| Production source files | 141 |
| Test and test-support source files | 89 |
| Prototype source lines (excluded from main charts) | 2,289 |
| Generated schema snapshot lines (excluded) | 359 |

At this endpoint, the project retains 173.0
production lines and 218.4 test lines per
resolved implementation ticket. Tests contain 1.26 times
as many source lines as production; this ratio measures size, not test quality.
The broad intervals below make it possible to compare early build-out with
later development without assuming equal feature size.

## Retained code per ticket

![Average retained production and test lines per resolved ticket](project-growth/average.svg)

This divides the current code size by cumulative resolved implementation tickets.
A falling line means less retained code per resolved ticket. It does not imply
that a particular ticket removed code, nor measure engineering effort.

## Net growth per additional ticket

![Net growth in production and test lines per additional resolved ticket](project-growth/increment.svg)

For this chart, take the **last commit at each cumulative ticket count** and
compare adjacent counts: change in lines divided by change in resolved tickets.
This includes fixes and refactoring between resolutions and after a resolution
until the next count increase. A commit resolving several tickets contributes
one interval averaged across those tickets. It measures net retained growth,
not gross added lines or total churn. The last plateau ends at the snapshot
endpoint; later updates can change that last interval.

Broader intervals reduce the noise of individual tickets:

| Resolved-ticket interval | New tickets | Net production lines / ticket | Net test lines / ticket |
| --- | ---: | ---: | ---: |
| 0–20 | 20 | 454.1 | 426.4 |
| 20–40 | 20 | 229.4 | 302.6 |
| 40–60 | 20 | 120.1 | 143.4 |
| 60–80 | 20 | 115.2 | 137.4 |
| 80–100 | 20 | 105.2 | 156.5 |
| 100–120 | 20 | 77.8 | 166.8 |
| 120–141 | 21 | 129.5 | 209.1 |
| 141–144 | 3 | 51.3 | 130.0 |

Linear code-size growth would look roughly straight in the first chart and
roughly flat in net growth per ticket. Sustained exponential growth would need
progressively increasing marginal growth over a substantial range. These are
descriptive charts, not a fitted growth model; tickets vary in size and include
maintenance, bugs, and implementation spikes as well as product features.

## Counting rules and limitations

- **Lines:** nonblank physical lines, including comments, imports, and multiline
  literals. This deliberately avoids language-dependent parsing; it is a source
  size measure rather than a count of executable statements. Blank lines are
  excluded. Extensions: `.cs, .css, .html, .js, .jsx, .py, .sql, .ts, .tsx`.
- **Production:** tracked source under `src/` and `web/`, including runtime
  migrations, CSS, and the browser entry point. The generated
  `src/application/internal/migrations/current-schema.sql` is counted separately
  to avoid double-counting the schema.
- **Tests:** tracked source under `test/` or `tests/`, including fixtures and
  shared test support. Prototype code and its tests under `spikes/` are counted
  together as a separate prototype metric. Tooling, config, documentation,
  agent skills, examples, dependency files, binaries, and build output are excluded.
- **Tickets:** only `.scratch/<effort>/issues/*.md` with an explicit
  `Status: resolved` (bold labels supported). Commit messages are not evidence
  of resolution. Resolution timing is therefore tracker timing; bookkeeping
  catch-up can produce jumps long after code was implemented.
- **Implementation:** explicit types `task`, `implementation`, `feature`, `bug`,
  or `bugfix`; untyped tickets with a `What to build:`, `What to fix:`, or
  `What to change:` field also qualify. `What to evaluate:` identifies a decision.
  Research, grilling, and other planning tickets count only in the all-ticket
  metric. This is a resolved-work proxy, not a curated count of shipped features.
- **Identity/history:** tickets are counted once when first observed resolved;
  reopening or deletion does not decrease cumulative counts. Git-detected
  renames preserve identity, including historical ticket renumbering. Conversion
  to an implementation ticket is counted when that resolved classification is
  first observed. First-parent history gives one sequence of mainline snapshots;
  merged work is observed at its merge commit.
- **Comparability:** no adjustment for ticket size, feature complexity, test
  coverage, generated code inside source literals, or changes in ticket practice.
  0 currently resolved tickets lack a recognized type or work/decision
  field; they remain in the all-ticket count only.

## Data and future updates

[Every commit and its measurements](project-growth/history.csv),
[first resolution evidence](project-growth/resolutions.json), and
[net-growth intervals](project-growth/increments.json) are retained locally.

To extend the report manually from the repository root:

```powershell
python docs/project-growth/generate.py --ref HEAD
```

Use `--ref <commit>` for a fixed endpoint. The script reads Git objects without
checking out historical trees or modifying the index. It rebuilds this Markdown,
the CSV/JSON evidence, and the three SVGs deterministically. No per-commit hook
or ongoing maintenance requirement is introduced. Existing historical
measurements remain the same when extending the same first-parent history.

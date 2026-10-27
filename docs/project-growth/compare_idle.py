"""Read the idle game without modifying its checkout; write comparison locally.

python docs/project-growth/compare_idle.py --repo ../idle-games
Requires only Python's standard library. No fetch or index changes.
"""
import argparse
import csv
import json
import re
from pathlib import Path
import subprocess

import generate
import churn

OUTPUT = Path(__file__).resolve().parent / 'idle-game'


def category(path):
    p = Path(path)
    if p.suffix not in generate.EXTENSIONS or not path.startswith('src/'):
        return None
    if 'PhysicsSpike' in p.name:
        return 'prototype'
    if any(part == 'Tests' or part.endswith('Checks') for part in p.parts) or any(
        word in p.stem for word in ('Evidence', 'Verification')):
        return 'test'
    return 'production'


def broad_windows(values, target=20):
    windows, pending = [], []
    for index, value in enumerate(values):
        pending.append(value)
        n = sum(v['delta'] for v in pending)
        if n >= target or index == len(values) - 1:
            result = dict(value, delta=n, start_commit=pending[0]['start_commit'])
            for kind in ('production', 'test'):
                result[f'{kind}_per_ticket'] = sum(v[f'{kind}_churn'] for v in pending) / n
                # Ratio at each interval's baseline, weighted by completions.
                valid = [v for v in pending if v[f'{kind}_turnover_pct'] is not None]
                result[f'{kind}_turnover_pct'] = (sum(v[f'{kind}_turnover_pct'] * v['delta'] for v in valid)
                                                  / sum(v['delta'] for v in valid)) if valid else None
            windows.append(result)
            pending = []
    return windows


def comparison(framework, idle, snapshot):
    """Generate shared-scale figures and a self-contained comparison report."""
    directory = OUTPUT.parent
    framework_rows = list(csv.DictReader((directory / 'history.csv').open(encoding='utf-8')))
    xlabel = 'Completed-work proxy: framework resolved tickets; idle game delivery merges'
    descriptions = [('Framework production', '#60a5fa', 'production', framework),
                    ('Framework tests', '#fbbf24', 'test', framework),
                    ('Idle production', '#c084fc', 'production', idle),
                    ('Idle tests', '#34d399', 'test', idle)]
    for metric, title, ylabel in [
        ('per_ticket', 'Code churn: framework and idle game', 'Added + removed nonblank lines / work unit'),
        ('turnover_pct', 'Existing-code turnover: framework and idle game', 'Removed lines / interval baseline / work unit (%)')]:
        series = [(label, color, [(v['tickets'], v[f'{kind}_{metric}'],
                    f"{label} | ending at {v['tickets']} | {v['delta']} work units | {v[f'{kind}_{metric}']:.2f}")
                    for v in broad_windows(data) if v[f'{kind}_{metric}'] is not None])
                  for label, color, kind, data in descriptions]
        generate.svg_chart('comparison-' + metric + '.svg', title,
                           'Nonoverlapping windows of at least 20 work units; final window may be shorter',
                           series, ylabel, xlabel=xlabel)
    end = framework_rows[-1]
    windows_table = []
    for project, data in [('Framework', framework), ('Idle game', idle)]:
        start = 0
        for w in broad_windows(data):
            turnover = w['production_turnover_pct']
            windows_table.append(f"| {project} | {start}–{w['tickets']} | {w['delta']} | {w['production_per_ticket']:,.1f} | {w['test_per_ticket']:,.1f} | {turnover:.3f}% |")
            start = w['tickets']
    report = f'''# Framework and idle game: code growth and change stability

Local committed snapshots, generated on 2026-10-27. No network fetch was performed.
Working-tree and staged changes are excluded. These are delivered mainline changes,
not a measure of all editing effort or a rating of architectural quality.

| Endpoint metric | Agent Coordination Framework | Idle game |
| --- | ---: | ---: |
| Commit | `{end['commit'][:8]}` | `{snapshot['commit'][:8]}` |
| Date | {end['date']} | {snapshot['date']} |
| First-parent snapshots | {len(framework_rows)} | {snapshot['commit_index']} |
| Completed-work proxy | {end['resolved_implementation']} resolved implementation tickets | {snapshot['resolved_implementation']} delivery merges |
| Production nonblank lines | {int(end['production_lines']):,} | {snapshot['production_lines']:,} |
| Test/support nonblank lines | {int(end['test_lines']):,} | {snapshot['test_lines']:,} |

## Change volume over the course of each project

![Framework and idle game churn](project-growth/comparison-per_ticket.svg)

**Churn is added + removed nonblank lines.** Replacing 100 lines and adding
30 new lines gives 230 churn, versus 30 net growth. Blue/yellow show framework
production/tests; purple/green show idle production/tests. Each point summarizes
at least 20 completions, except the final partial window. Counts differ because
units are indivisible: a framework commit can resolve several tickets together.
See the raw per-interval charts below for spikes hidden by the broad averages.

![Framework and idle game existing-code turnover](project-growth/comparison-turnover_pct.svg)

**Turnover is removed nonblank lines / code size before the interval / work units.**
It isolates changes to established code from pure growth. A one-time full replacement
is about 100%; repeated edits can exceed 100%. The broad-window turnover is the
completion-weighted mean of interval turnover, omitting zero-baseline intervals.
This is a volume measure, not a count of unique original lines or proof of quality.

| Project | Completion range | Units | Production churn / unit | Test churn / unit | Production turnover / unit |
| --- | ---: | ---: | ---: | ---: | ---: |
{chr(10).join(windows_table)}

## Total retained code

### Framework

![Framework retained size](project-growth/size.svg)

### Idle game

![Idle game retained size](project-growth/idle-game/size.svg)

## Individual completion intervals

### Framework

![Framework churn by resolution interval](project-growth/per_ticket.svg)
![Framework turnover by resolution interval](project-growth/turnover_pct.svg)

### Idle game

![Idle churn by delivery interval](project-growth/idle-game/per_ticket.svg)
![Idle turnover by delivery interval](project-growth/idle-game/turnover_pct.svg)

## Interpretation and comparison limits

Both projects' broad-window production turnover falls substantially after early
build-out. Recent delivered changes are more local relative to codebase size.
There is no sustained rise in the churn windows at the end of either history.
This evidence does not support calling the idle game structurally worse on this
metric alone; large individual changes still deserve inspection in the interval data.

- The framework keeps its [existing tracker-based counting rules](project-growth.md).
  A single resolution commit can cover several tickets, and bookkeeping delays
  mean intervals cannot be assigned precisely to individual tickets.
- The idle game uses `integration/T-0002-idle-game`, fixed at
  `{snapshot['commit']}`. Its checked-out `main` stops on October 12 and
  local `origin/main` on October 17; neither represents the recent integration work.
  Only commits reachable from the chosen snapshot are included.
- Idle completion proxies are first-parent merges, excluding explicit merges into
  feature/task/docs branches (synchronization) and publication feedback merges.
  The [included merges](project-growth/idle-game/merges.json) and
  [excluded merges](project-growth/idle-game/excluded-merges.json) are auditable.
  These are **merge events, not a verified count of distinct completed tickets**;
  bundled work, follow-ups, documentation and art-only deliveries can distort them.
- Both projects sum diffs between adjacent first-parent snapshots, with rename
  detection. Idle branch-internal edits that cancel before integration are invisible.
  Framework work committed directly to main exposes more intermediate edits.
  Therefore compare trends within each project more strongly than absolute levels
  between projects. Neither chart measures total agent effort or retries.
- Intervals run between the last snapshots at adjacent completion counts, matching
  the original framework analysis. Intervening fixes are included. Initial work
  before the last zero-count snapshot is excluded from per-completion charts,
  but retained in history.csv. Trailing work belongs to the last interval.
- Lines are nonblank physical source lines including comments, using the same
  extension set as the original report. Documentation, binaries, dependency files,
  configuration and data such as progression JSON are excluded. Asset changes
  therefore contribute no source churn even when they materially change the game.
- Idle tests include `src/Tests`, projects whose directory ends in `Checks`, and
  source filenames containing `Evidence` or `Verification`, including embedded
  native verification harnesses. `PhysicsSpike` files are prototype code.
  Remaining source under `src/` is production. This explicit heuristic is recorded
  [per file](project-growth/idle-game/classification.json); compilation into an app
  does not make evidence harnesses player-facing production code.
- Formatting, extraction, deletion and intentional redesign all create churn.
  Ticket size, complexity, defect rate and test quality are not controlled for.
  Pair outliers with review/defect evidence before making design judgments.

## Evidence and reproduction

- [Framework per-commit history](project-growth/history.csv) and
  [completion intervals](project-growth/churn-intervals.json).
- [Idle per-commit history](project-growth/idle-game/history.csv),
  [completion intervals](project-growth/idle-game/churn-intervals.json), and
  [snapshot metadata](project-growth/idle-game/snapshot.json).
- [Framework window data](project-growth/window-churn-intervals.json) and
  [idle window data](project-growth/idle-game/window-churn-intervals.json).

From the framework repository, without staging or checking out historical trees:

```powershell
python docs/project-growth/generate.py --ref {end['commit']}
python docs/project-growth/compare_idle.py --repo ../idle-games --ref {snapshot['commit']}
```

Use `--ref HEAD` on the framework and `--ref integration/T-0002-idle-game` on
the idle game for a later local snapshot. Rerun both in that order. The scripts
check that additions minus removals equals the measured size change for both
source categories at every snapshot. All 201 original framework size/ticket
snapshots were also checked against the prior report and preserved exactly.
'''
    (directory.parent / 'project-growth-comparison.md').write_text(report, encoding='utf-8')


def run(repo, ref, reuse=False):
    OUTPUT.mkdir(exist_ok=True)
    generate.ROOT = repo.resolve()
    generate.category = category
    endpoint = generate.git('rev-parse', '--verify', f'{ref}^{{commit}}').decode().strip()
    if reuse:
        with (OUTPUT / 'history.csv').open(encoding='utf-8') as stream:
            rows = list(csv.DictReader(stream))
        assert rows[-1]['commit'] == endpoint, 'Cached endpoint differs from requested ref'
        for row in rows:
            for key in row:
                if key not in ('commit', 'date', 'subject', 'integration_merge'):
                    row[key] = int(row[key])
    else:
        endpoint, rows, _, _ = generate.collect(ref)
    merge_shas = set(generate.git('rev-list', '--first-parent', '--merges', endpoint).decode().splitlines())
    count = 0
    excluded = []
    for row in rows:
        merged = row['commit'] in merge_shas
        synchronization = bool(re.search(r' into (?:feature|docs|task)/', row['subject']))
        publication = 'publication/' in row['subject']
        delivery = merged and not synchronization and not publication
        if merged and not delivery:
            excluded.append(dict(commit=row['commit'], subject=row['subject'], reason='branch synchronization' if synchronization else 'publication feedback'))
        count += delivery
        row['resolved_implementation'] = count
        row['integration_merge'] = delivery
    if not reuse:
        churn.measure(rows, generate.git, category)
    with (OUTPUT / 'history.csv').open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    (OUTPUT / 'merges.json').write_text(json.dumps([r for r in rows if r['integration_merge']], indent=2) + '\n', encoding='utf-8')
    (OUTPUT / 'excluded-merges.json').write_text(json.dumps(excluded, indent=2) + '\n', encoding='utf-8')
    values = churn.intervals(rows)
    generate.HERE = OUTPUT

    def chart(*args):
        generate.svg_chart(*args, xlabel='Cumulative delivery merges (synchronization and publication excluded)')

    churn.charts(values, OUTPUT, chart, unit='merge')
    churn.charts(broad_windows(values), OUTPUT, chart, prefix='window-', unit='merge')
    series = [(label, color, [(r['resolved_implementation'], r[key],
                              f"{r['commit'][:8]} | {r['subject']} | {r[key]:,} lines") for r in rows])
              for label, color, key in zip(('Production', 'Tests and evidence harnesses'),
                                          ('#60a5fa', '#fbbf24'), ('production_lines', 'test_lines'))]
    chart('size.svg', 'Idle game: code size across integration history',
          f"{len(rows)} first-parent snapshots; {count} merges; through {endpoint[:8]}", series, 'Nonblank source lines')
    # Audit the exact endpoint file classification, including embedded harnesses.
    files = generate.git('ls-tree', '-r', '--name-only', endpoint).decode().splitlines()
    (OUTPUT / 'classification.json').write_text(json.dumps({p: category(p) for p in files if category(p)}, indent=2) + '\n', encoding='utf-8')
    generate.HERE = OUTPUT.parent
    framework = json.loads((OUTPUT.parent / 'churn-intervals.json').read_text(encoding='utf-8'))
    churn.charts(broad_windows(framework), OUTPUT.parent, generate.svg_chart, prefix='window-')
    (OUTPUT / 'snapshot.json').write_text(json.dumps(dict(ref=ref, endpoint=endpoint, commits=len(rows), merges=count, final=rows[-1]), indent=2) + '\n', encoding='utf-8')
    comparison(framework, values, rows[-1])
    print(json.dumps(dict(endpoint=endpoint, commits=len(rows), merges=count, final=rows[-1]), indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--ref', default='integration/T-0002-idle-game')
    parser.add_argument('--reuse-snapshot', action='store_true', help='Reuse measured history at exactly the same endpoint')
    args = parser.parse_args()
    run(args.repo, args.ref, args.reuse_snapshot)

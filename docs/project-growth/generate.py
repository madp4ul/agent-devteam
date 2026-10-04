"""Rebuild the committed-history report. Python 3 standard library only.

Run from any directory: python docs/project-growth/generate.py [--ref HEAD]
Reads Git objects without checking out, staging, or changing repository state.
"""

import argparse
import csv
import html
import json
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.sql', '.py', '.cs'}


def git(*args):
    return subprocess.check_output(
        ['git', '-c', f'safe.directory={ROOT.as_posix()}', *args], cwd=ROOT
    )


def category(path):
    if Path(path).suffix not in EXTENSIONS:
        return None
    if path == 'src/application/internal/migrations/current-schema.sql':
        return 'generated'
    if path.startswith(('src/', 'web/')):
        return 'production'
    if path.startswith(('test/', 'tests/')):
        return 'test'
    if path.startswith('spikes/'):
        return 'prototype'
    return None


def field(content, name):
    # Both "Status: resolved" and "**Status:** resolved" occur in the tracker.
    plain = content.replace('**', '')
    match = re.search(rf'^\s*{name}:\s*([^\r\n]+)', plain, re.M | re.I)
    return match.group(1).strip().lower() if match else ''


def implementation(content):
    kind = field(content, 'Type')
    if kind:
        return kind in {'task', 'implementation', 'feature', 'bug', 'bugfix'}
    return bool(re.search(r'^What to (?:build|fix|change):', content.replace('**', ''), re.M | re.I))


def collect(ref):
    endpoint = git('rev-parse', '--verify', f'{ref}^{{commit}}').decode().strip()
    history = git('log', '--first-parent', '--reverse', '--format=%H%x09%cs%x09%s', endpoint).decode().splitlines()
    rows, resolutions, anomalies = [], [], []
    seen, seen_implementation, identities = set(), set(), {}
    blob_cache = {}
    previous = None
    reader = subprocess.Popen(
        ['git', '-c', f'safe.directory={ROOT.as_posix()}', 'cat-file', '--batch'],
        cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    )

    def blob(oid):
        if oid not in blob_cache:
            reader.stdin.write(oid.encode() + b'\n')
            reader.stdin.flush()
            header = reader.stdout.readline().split()
            if len(header) != 3 or header[1] != b'blob':
                raise RuntimeError(f'Unexpected Git object: {header!r}')
            value = reader.stdout.read(int(header[2])).decode('utf-8', errors='replace')
            assert reader.stdout.read(1) == b'\n'
            blob_cache[oid] = value
        return blob_cache[oid]

    try:
        for index, entry in enumerate(history):
            sha, date, subject = entry.split('\t', 2)
            if previous:
                changes = git('diff-tree', '-r', '-M', '--no-commit-id', '--name-status', previous, sha, '--', '.scratch').decode().splitlines()
                # Apply mappings together: renumbering can reuse an old path.
                renames = [line.split('\t') for line in changes if line.startswith('R')]
                updates = {new: identities.get(old, old) for _, old, new in renames}
                for _, old, _ in renames:
                    identities.pop(old, None)
                identities.update(updates)
            totals = {key: 0 for key in ('production', 'test', 'prototype', 'generated')}
            files = {key: 0 for key in totals}
            resolved_now = 0
            unknown = []
            for item in git('ls-tree', '-r', '-z', sha).split(b'\0'):
                if not item:
                    continue
                metadata, raw_path = item.split(b'\t', 1)
                mode, object_type, oid = metadata.decode().split()
                path = raw_path.decode('utf-8')
                if object_type != 'blob' or mode == '120000':
                    continue
                group = category(path)
                ticket = path.startswith('.scratch/') and '/issues/' in path and path.endswith('.md')
                if not group and not ticket:
                    continue
                content = blob(oid)
                if group:
                    totals[group] += sum(bool(line.strip()) for line in content.splitlines())
                    files[group] += 1
                if ticket and field(content, 'Status') == 'resolved':
                    resolved_now += 1
                    identity = identities.setdefault(path, path)
                    is_implementation = implementation(content)
                    if not field(content, 'Type') and not is_implementation and not re.search(
                        r'^What to evaluate:', content.replace('**', ''), re.M | re.I
                    ):
                        unknown.append(path)
                    if identity not in seen:
                        seen.add(identity)
                        resolutions.append(dict(commit=sha, date=date, path=path,
                                                identity=identity, implementation=is_implementation,
                                                type=field(content, 'Type') or ('implementation-field' if is_implementation else 'decision-or-unspecified')))
                    if is_implementation:
                        seen_implementation.add(identity)
            rows.append(dict(commit=sha, date=date, subject=subject, commit_index=index + 1,
                             resolved_implementation=len(seen_implementation),
                             resolved_all=len(seen), resolved_current=resolved_now,
                             **{f'{key}_lines': value for key, value in totals.items()},
                             **{f'{key}_files': value for key, value in files.items()}))
            anomalies = unknown
            previous = sha
            if (index + 1) % 40 == 0:
                print(f'Read {index + 1}/{len(history)} commits', flush=True)
    finally:
        reader.stdin.close()
        reader.wait()
    return endpoint, rows, resolutions, anomalies


def maintenance_events(rows, resolutions):
    rules = json.loads((HERE / 'maintenance-classification.json').read_text(encoding='utf-8'))
    selected = {}
    for ticket in resolutions:
        if not ticket['implementation']:
            continue
        path = ticket['path']
        label = rules['tickets'].get(path)
        if not label:
            label = next((label for prefix, label in rules['efforts'].items() if path.startswith(prefix)), None)
        if label:
            event = selected.setdefault(ticket['commit'], dict(tickets=[], labels=[]))
            event['tickets'].append(path)
            if label not in event['labels']:
                event['labels'].append(label)
    for commit, label in rules['additional_commits'].items():
        selected.setdefault(commit, dict(tickets=[], labels=[]))['labels'].append(label)
    events = []
    previous = dict(production_lines=0, test_lines=0)
    for row in rows:
        if row['commit'] in selected:
            events.append(dict(id=f'M{len(events)+1}', commit=row['commit'], date=row['date'],
                               subject=row['subject'], chart_tickets=row['resolved_implementation'],
                               production_lines=row['production_lines'], test_lines=row['test_lines'],
                               production_delta=row['production_lines']-previous['production_lines'],
                               test_delta=row['test_lines']-previous['test_lines'],
                               **selected[row['commit']]))
        previous = row
    return events


def svg_chart(filename, title, subtitle, series, ylabel, maintenance=None):
    """Dependency-free vector plot with explicit axes and inspectable tooltips."""
    width, height = 1100, 520
    left, right, top, bottom = 100, 35, 95, 85
    plot_w, plot_h = width - left - right, height - top - bottom
    all_points = [point for _, _, points in series for point in points]
    xmax = max(1, max(x for x, _, _ in all_points))
    ymin = min(0, min(y for _, y, _ in all_points))
    ymax = max(1, max(y for _, y, _ in all_points))
    span = ymax - ymin
    ymax += span * .06
    if ymin < 0:
        ymin -= span * .06
    def px(x):
        return left + x / xmax * plot_w
    def py(y):
        return top + (ymax - y) / (ymax - ymin) * plot_h
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
           f'<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(subtitle)}</desc>',
           '<style>text{font-family:Arial,sans-serif;fill:#cbd5e1;font-size:14px}.grid{stroke:#334155;stroke-width:1}.line{fill:none;stroke-width:2.5;stroke-linejoin:round}</style>',
           f'<rect width="{width}" height="{height}" rx="12" fill="#101827"/>',
           f'<text x="30" y="32" style="font-size:22px;fill:#f1f5f9">{html.escape(title)}</text>',
           f'<text x="30" y="56">{html.escape(subtitle)}</text>']
    for i in range(6):
        y = ymin + (ymax - ymin) * i / 5
        out += [f'<path class="grid" d="M{left},{py(y):.2f}h{plot_w}"/>',
                f'<text x="{left-12}" y="{py(y)+5:.2f}" text-anchor="end">{y:,.0f}</text>']
    for i in range(7):
        x = xmax * i / 6
        out += [f'<path class="grid" d="M{px(x):.2f},{top}v{plot_h}"/>',
                f'<text x="{px(x):.2f}" y="{height-bottom+25}" text-anchor="middle">{x:.0f}</text>']
    if ymin < 0:
        out.append(f'<path stroke="#94a3b8" d="M{left},{py(0):.2f}h{plot_w}"/>')
    for number, (label, color, points) in enumerate(series):
        coords = ' '.join(f'{px(x):.2f},{py(y):.2f}' for x, y, _ in points)
        out.append(f'<polyline class="line" stroke="{color}" points="{coords}"/>')
        for x, y, tip in points:
            out.append(f'<circle cx="{px(x):.2f}" cy="{py(y):.2f}" r="2.5" fill="{color}"><title>{html.escape(tip)}</title></circle>')
        legend_x = left + number * 260
        out += [f'<path stroke="{color}" stroke-width="3" d="M{legend_x},78h25"/>',
                f'<text x="{legend_x+33}" y="83">{html.escape(label)}</text>']
    if maintenance:
        # Overlay after all series so both lines keep their identity and red
        # diamonds remain distinct from ordinary circular commit points.
        for event in maintenance:
            x = px(event['chart_tickets'])
            tooltip = (f"{event['id']} | {event['commit'][:7]} | {event['date']} | {event['subject']} | "
                       f"{'; '.join(event['labels'])} | Production {event['production_delta']:+,}; tests {event['test_delta']:+,}")
            out.append(f'<g data-maintenance-id="{event["id"]}">')
            for key in ['production_lines', 'test_lines']:
                y = py(event[key])
                out.append(f'<path d="M{x:.2f},{y-5:.2f}l5,5 -5,5 -5,-5z" fill="#fb7185" stroke="#101827" stroke-width="1"><title>{html.escape(tooltip)}</title></path>')
            out.append('</g>')
        out += ['<path d="M620,73l5,5 -5,5 -5,-5z" fill="#fb7185"/>',
                '<text x="636" y="83">Maintenance commit (both curves)</text>']
    out += [f'<text x="{left+plot_w/2}" y="{height-24}" text-anchor="middle">Cumulative resolved implementation tickets</text>',
            f'<text transform="translate(24,{top+plot_h/2}) rotate(-90)" text-anchor="middle">{html.escape(ylabel)}</text>', '</svg>']
    (HERE / filename).write_text('\n'.join(out) + '\n', encoding='utf-8')


def write_report(endpoint, rows, resolutions, anomalies):
    maintenance = maintenance_events(rows, resolutions)
    (HERE / 'maintenance-events.json').write_text(json.dumps(maintenance, indent=2) + '\n', encoding='utf-8')
    with (HERE / 'history.csv').open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    (HERE / 'resolutions.json').write_text(json.dumps(resolutions, indent=2) + '\n', encoding='utf-8')
    def points(key, divide=False):
        return [(r['resolved_implementation'], r[key] / r['resolved_implementation'] if divide else r[key],
                 f"{r['commit'][:7]} | {r['date']} | {r['subject']} | {r[key]:,} lines | {r['resolved_implementation']} tickets")
                for r in rows if not divide or r['resolved_implementation']]
    colors = ['#60a5fa', '#fbbf24']
    svg_chart('size.svg', 'Code size across committed history',
              f"{len(rows)} first-parent commits through {endpoint[:7]}; every commit is a point", 
              [(label, color, points(key)) for label, color, key in
               zip(['Production', 'Tests and test support'], colors, ['production_lines', 'test_lines'])], 'Nonblank source lines', maintenance)
    svg_chart('average.svg', 'Code retained per resolved ticket',
              'Total source lines / cumulative implementation tickets; this is a stock average, not marginal growth',
              [(label, color, points(key, True)) for label, color, key in
               zip(['Production / ticket', 'Tests / ticket'], colors, ['production_lines', 'test_lines'])], 'Nonblank source lines / ticket')
    groups = {}
    for row in rows:
        groups[row['resolved_implementation']] = row
    # End of each equal-count plateau includes intervening fixes/refactors.
    plateaus = list(groups.values())
    marginal = []
    for start, end in zip(plateaus, plateaus[1:]):
        delta = end['resolved_implementation'] - start['resolved_implementation']
        marginal.append(dict(tickets=end['resolved_implementation'], delta=delta,
                             production=(end['production_lines'] - start['production_lines']) / delta,
                             test=(end['test_lines'] - start['test_lines']) / delta,
                             start_commit=start['commit'], end_commit=end['commit']))
    (HERE / 'increments.json').write_text(json.dumps(marginal, indent=2) + '\n', encoding='utf-8')
    if marginal:
        svg_chart('increment.svg', 'Net code growth per newly resolved ticket',
                  'Between ends of resolution plateaus; includes intervening work; negative values mean net removal',
                  [(label, color, [(m['tickets'], m[key], f"{m['start_commit'][:7]} to {m['end_commit'][:7]} | {m['delta']} tickets | {m[key]:,.1f} lines / ticket") for m in marginal])
                   for label, color, key in zip(['Production growth / ticket', 'Test growth / ticket'], colors, ['production', 'test'])], 'Net nonblank lines / new ticket')
    end = rows[-1]
    maintenance_table = []
    for event in maintenance:
        ticket_links = ', '.join(f'[{Path(path).stem}](../{path})' for path in event['tickets'])
        evidence = ticket_links or html.escape('; '.join(event['labels']))
        maintenance_table.append(f"| {event['id']} | `{event['commit'][:7]}` | {event['chart_tickets']} | {event['production_delta']:+,} | {event['test_delta']:+,} | {evidence} |")
    # Nonoverlapping windows of 20 resolutions make broad changes easier to read.
    windows, anchor = [], plateaus[0]
    for row in plateaus[1:]:
        if row['resolved_implementation'] - anchor['resolved_implementation'] >= 20 or row is plateaus[-1]:
            count = row['resolved_implementation'] - anchor['resolved_implementation']
            windows.append(f"| {anchor['resolved_implementation']}–{row['resolved_implementation']} | {count} | {(row['production_lines']-anchor['production_lines'])/count:,.1f} | {(row['test_lines']-anchor['test_lines'])/count:,.1f} |")
            anchor = row
    report = f'''# Project growth snapshot

Committed history through `{endpoint}` ({end['date']}). This report samples all
{len(rows)} commits on the first-parent history of that commit. Working-tree and
staged changes are excluded. Charts are local SVGs embedded in Markdown; no
server, external libraries, or network connection is needed.

## Code size against resolved implementation tickets

![Production and test source lines against cumulative resolved implementation tickets](project-growth/size.svg)

Each point represents one commit, in history order. X is the number of distinct
implementation tickets observed resolved by that commit. Commits without a new
resolution retain the same X coordinate, so vertical movement is meaningful.
Hover a point when viewing the SVG directly to inspect its commit and totals.

**Red diamonds mark {len(maintenance)} maintenance commits on both curves.** The
blue and yellow lines still identify production and tests. Open
[the SVG directly](project-growth/size.svg) and hover a red diamond for its commit,
maintenance scope, and immediate net line changes. The evidence table below
lists every marked commit.

| Metric at endpoint | Count |
| --- | ---: |
| Resolved implementation tickets, cumulative | {end['resolved_implementation']:,} |
| All resolved tickets, cumulative (including decisions/research) | {end['resolved_all']:,} |
| Tickets currently marked resolved at endpoint | {end['resolved_current']:,} |
| Production source lines | {end['production_lines']:,} |
| Test and test-support source lines | {end['test_lines']:,} |
| Production source files | {end['production_files']:,} |
| Test and test-support source files | {end['test_files']:,} |
| Prototype source lines (excluded from main charts) | {end['prototype_lines']:,} |
| Generated schema snapshot lines (excluded) | {end['generated_lines']:,} |

At this endpoint, the project retains {end['production_lines']/max(1, end['resolved_implementation']):,.1f}
production lines and {end['test_lines']/max(1, end['resolved_implementation']):,.1f} test lines per
resolved implementation ticket. Tests contain {end['test_lines']/max(1, end['production_lines']):.2f} times
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
{chr(10).join(windows)}

Linear code-size growth would look roughly straight in the first chart and
roughly flat in net growth per ticket. Sustained exponential growth would need
progressively increasing marginal growth over a substantial range. These are
descriptive charts, not a fitted growth model; tickets vary in size and include
maintenance, bugs, and implementation spikes as well as product features.

## Maintenance commits highlighted in red

The reviewed [classification](project-growth/maintenance-classification.json)
includes the five dedicated maintainability/verification efforts, nine individual
organizational refactoring tickets, and two early extraction commits identified
from their diffs. For tickets, the marker is the commit where resolution was first
recorded, consistent with the chart's ticket counting. Research-only decisions,
ordinary bug fixes, and feature delivery are excluded from this classification.
The dedicated efforts include verification work as well as structural refactoring.

The two additional early commits cover maintenance before completion bookkeeping.
Other preparatory or follow-up commits without a newly resolved classified ticket
are not automatically marked. Thus the markers locate the reviewed maintenance
deliveries, not every historical edit that could be called maintenance. Future
efforts can be added to the classification when updating the report.

The deltas below compare each marked commit with its immediate preceding
first-parent commit, including any other work in that commit. They are not
causal estimates or totals attributable exclusively to the listed tickets.
The X values are cumulative implementation-ticket counts, not tracker ticket IDs.

| Marker | Commit | Chart X | Net production lines | Net test lines | Maintenance evidence |
| --- | --- | ---: | ---: | ---: | --- |
{chr(10).join(maintenance_table)}

A maintenance marker followed by slower production growth is an observation,
not proof that maintenance caused the change. The goal of these efforts was to
make behavior easier to locate, change, and verify; line count alone cannot
establish success or no impact. Evaluating that needs evidence about subsequent
change locality, reuse, regressions, and verification effort.

## Counting rules and limitations

- **Lines:** nonblank physical lines, including comments, imports, and multiline
  literals. This deliberately avoids language-dependent parsing; it is a source
  size measure rather than a count of executable statements. Blank lines are
  excluded. Extensions: `{', '.join(sorted(EXTENSIONS))}`.
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
  {len(anomalies)} currently resolved tickets lack a recognized type or work/decision
  field; they remain in the all-ticket count only.

## Data and future updates

[Every commit and its measurements](project-growth/history.csv),
[first resolution evidence](project-growth/resolutions.json), and
[net-growth intervals](project-growth/increments.json) are retained locally.
[Maintenance marker evidence](project-growth/maintenance-events.json) records the
selected commits, linked tickets, and immediate production/test deltas.

To extend the report manually from the repository root:

```powershell
python docs/project-growth/generate.py --ref HEAD
```

Use `--ref <commit>` for a fixed endpoint. The script reads Git objects without
checking out historical trees or modifying the index. It rebuilds this Markdown,
the CSV/JSON evidence, and the three SVGs deterministically. No per-commit hook
or ongoing maintenance requirement is introduced. Existing historical
measurements remain the same when extending the same first-parent history.
'''
    (HERE.parent / 'project-growth.md').write_text(report, encoding='utf-8')
    print(json.dumps({'endpoint': endpoint, 'commits': len(rows), 'final': end,
                      'unclassified_resolved': anomalies}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ref', default='HEAD')
    options = parser.parse_args()
    write_report(*collect(options.ref))

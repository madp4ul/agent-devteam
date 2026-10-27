"""Nonblank, rename-aware source churn and resolution-interval evidence."""

import json


def changes(git, classify, before, after):
    result = {f'{kind}_{metric}': 0 for kind in ('production', 'test')
              for metric in ('added', 'removed', 'churn', 'files_changed')}
    args = ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--unified=0',
            '--find-renames', before, after] if before else [
                'show', '--format=', '--root', '--no-ext-diff', '--no-textconv',
                '--no-color', '--unified=0', after]
    patch = git('-c', 'core.quotepath=false', *args).decode('utf-8', errors='replace')
    for section in patch.split('diff --git ')[1:]:
        old = new = None
        plus = minus = 0
        in_hunk = False
        for line in section.splitlines():
            if not in_hunk and line.startswith('--- '):
                old = line[6:].split('\t')[0] if line.startswith('--- a/') else None
            elif not in_hunk and line.startswith('+++ '):
                new = line[6:].split('\t')[0] if line.startswith('+++ b/') else None
            elif line.startswith('@@ '):
                in_hunk = True
            elif in_hunk and line.startswith('+') and line[1:].strip():
                plus += 1
            elif in_hunk and line.startswith('-') and line[1:].strip():
                minus += 1
        old_group, new_group = classify(old or ''), classify(new or '')
        # A move across classification boundaries transfers the entire file.
        if old and new and old_group != new_group:
            minus = sum(bool(x.strip()) for x in git('show', f'{before}:{old}').decode('utf-8', errors='replace').splitlines())
            plus = sum(bool(x.strip()) for x in git('show', f'{after}:{new}').decode('utf-8', errors='replace').splitlines())
        for kind in ('production', 'test'):
            added = plus if new_group == kind else 0
            removed = minus if old_group == kind else 0
            result[f'{kind}_added'] += added
            result[f'{kind}_removed'] += removed
            result[f'{kind}_churn'] += added + removed
            result[f'{kind}_files_changed'] += int(bool(added or removed))
    return result


def intervals(rows, count='resolved_implementation'):
    groups = {}
    for row in rows:
        groups[row[count]] = row
    plateaus = list(groups.values())
    values = []
    for start, end in zip(plateaus, plateaus[1:]):
        n = end[count] - start[count]
        value = dict(tickets=end[count], delta=n, start_commit=start['commit'],
                     end_commit=end['commit'], date=end['date'], subject=end['subject'])
        for kind in ('production', 'test'):
            for metric in ('added', 'removed', 'churn'):
                key = f'{kind}_{metric}'
                value[key] = end[f'cumulative_{key}'] - start[f'cumulative_{key}']
            value[f'{kind}_per_ticket'] = value[f'{kind}_churn'] / n
            size = start[f'{kind}_lines']
            value[f'{kind}_turnover_pct'] = 100 * value[f'{kind}_removed'] / size / n if size else None
        values.append(value)
    return values


def measure(rows, git, classify):
    previous = None
    totals = {f'{kind}_{metric}': 0 for kind in ('production', 'test')
              for metric in ('added', 'removed', 'churn')}
    for row in rows:
        row.update(changes(git, classify, previous['commit'] if previous else None, row['commit']))
        for key in totals:
            totals[key] += row[key]
            row[f'cumulative_{key}'] = totals[key]
        for kind in ('production', 'test'):
            baseline = previous[f'{kind}_lines'] if previous else 0
            assert row[f'{kind}_added'] - row[f'{kind}_removed'] == row[f'{kind}_lines'] - baseline, (row['commit'], kind)
        previous = row


def charts(values, directory, chart, prefix='', unit='ticket'):
    colors = ['#60a5fa', '#fbbf24']
    for metric, title, ylabel in [
        ('per_ticket', 'Code churn per completed work unit', f'Added + removed nonblank lines / {unit}'),
        ('turnover_pct', 'Existing-code turnover per completed work unit', f'Removed lines / starting code size / {unit} (%)')]:
        series = []
        for kind, label, color in zip(('production', 'test'), ('Production', 'Tests and test support'), colors):
            points = [(v['tickets'], v[f'{kind}_{metric}'],
                       f"{v['start_commit'][:7]} to {v['end_commit'][:7]} | {v['delta']} {unit}(s) | {v['subject']} | {v[f'{kind}_{metric}']:,.2f}")
                      for v in values if v[f'{kind}_{metric}'] is not None]
            if points:
                series.append((label, color, points))
        if series:
            chart(prefix + metric + '.svg', title, 'Resolution intervals; repeated edits count repeatedly; inspect points for commit evidence', series, ylabel)
    (directory / (prefix + 'churn-intervals.json')).write_text(json.dumps(values, indent=2) + '\n', encoding='utf-8')


def extend_report(rows, git, classify, directory, chart):
    measure(rows, git, classify)
    values = intervals(rows)
    charts(values, directory, chart)
    return '''## Change volume and existing-code turnover

![Production and test churn per resolved ticket](project-growth/per_ticket.svg)

**Churn = added + removed nonblank lines.** Replacing 100 lines and adding
30 more counts as 230 lines of churn, even though net growth is only 30.
Renames within a category are detected; unchanged moved files do not create churn.
Changes are summed across commits, including repeated edits, rather than reduced
to a single endpoint diff. Per-commit additions and removals remain in history.csv
for auditability, but the chart combines them.

![Existing-code turnover per resolved ticket](project-growth/turnover_pct.svg)

**Turnover = removed nonblank lines / code size at the interval start / new tickets.**
It measures edits to existing code more directly than growth does: pure additions
have zero turnover; replacing an entire codebase once is about 100% before dividing
by ticket count. Repeated edits can exceed 100%; this is not a unique-line fraction.
Deletion, replacement, formatting and reorganization all contribute. A zero-size
baseline is omitted rather than treated as zero turnover.

Both charts use the same end-of-resolution-plateau intervals as the net-growth
chart below, including intervening commits. Several tickets completed together
receive an interval average, **not individually attributable measurements**.
Initial work before the last zero-ticket snapshot is excluded from these intervals
and retained in the per-commit CSV. Tracker delays can shift apparent spikes.
Lower churn or turnover can suggest more local changes, but ticket scope and
deliberate refactoring matter; these metrics alone cannot establish design quality.
The [interval evidence](project-growth/churn-intervals.json) preserves the boundaries.

## Retained code per ticket
'''

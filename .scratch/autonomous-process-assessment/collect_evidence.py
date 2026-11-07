"""Bounded query-only evidence reads. Never starts application code or writes source DB."""
import datetime, json, pathlib, sqlite3, time, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'local-evidence' / 'autonomous-process-assessment'
ROOT = ROOT / ('capture-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
URI = 'file:D:/Daten/Projekte/Software/Codex/idle-games-agent-coordination-state/coordination.sqlite3?mode=ro'
if '--historical' in sys.argv:
    URI = URI.replace('coordination.sqlite3?', 'coordination.sqlite3.pre-cache-cleanup-2026-11-01T15-00-37Z.sqlite3?')
    ROOT = ROOT / 'historical'

def read(sql, params=()):
    started = time.monotonic()
    db = sqlite3.connect(URI, uri=True, timeout=0)
    try:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA query_only=ON')
        db.set_progress_handler(lambda: int(time.monotonic() - started > (10 if '--historical' in sys.argv else .15)), 1000)
        rows = [dict(r) for r in db.execute(sql, params)]
    finally:
        db.close()
    return rows

def save(name, rows):
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / (name + '.json')).write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding='utf-8')

if __name__ == '__main__':
    save('capture', {'started_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source': URI, 'method': 'separate bounded query-only reads; not an atomic snapshot'})
    for name, sql in {
        'tasks': 'select * from tasks order by sequence',
        'runtime': 'select * from runtime',
        'columns': 'select * from columns',
        'agents': 'select * from agents',
        'relationships': 'select * from task_relationships',
        'notification-policy': 'select * from notification_policy',
        'notification-columns': 'select * from notification_column_subscriptions',
    }.items():
        rows = read(sql)
        save(name, rows)
        print(name, len(rows))
    tasks = json.loads((ROOT / 'tasks.json').read_text(encoding='utf-8'))
    # Per-task indexed reads keep locks brief and avoid bulk transcript scans.
    captured = 0
    for task in tasks:
        tid = task['id']
        if '--recent-only' in sys.argv and task['sequence'] < 265:
            continue
        captured += 1
        for name, table, order in [('comments','task_comments','sequence'), ('activity','activity_ledger','sequence'), ('activations','activations','sequence')]:
            rows, cursor = [], 0
            while True:
                page = read(f'select * from {table} where task_id=? and {order}>? order by {order} limit 50', (tid, cursor))
                rows.extend(page)
                if len(page) < 50: break
                cursor = page[-1][order]
            save(tid + '-' + name, rows)
        if task['archived_at'] is None:
            save(tid + '-messages', read('select * from agent_conversation_messages where task_id=? order by occurred_at', (tid,)))
    print('captured', captured, 'task timelines; no transcript blobs or command-response cache read')

import datetime, json, pathlib
from collect_evidence import read

root = pathlib.Path(__file__).resolve().parent.parent / 'local-evidence' / 'autonomous-process-assessment' / ('waits-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
root.mkdir(parents=True, exist_ok=True)
print('EVIDENCE', root)
def capture(name, query, args=()):
    rows = read(query, args)
    (root / (name + '.json')).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    return rows

capture('runtime', 'select * from runtime')
tasks = capture('tasks', 'select * from tasks order by sequence')
cols = capture('columns', 'select * from columns')
rels = capture('relationships', 'select * from task_relationships')
byid = {t['id']:t for t in tasks}
watch = {(c['board_id'],c['id']):c['watching_agent_id'] for c in cols}
reached = {'T-0001'}
while True:
    more = {r['target_task_id'] for r in rels if r['source_task_id'] in reached and byid[r['target_task_id']]['column_id'] != 'completion'}
    if more <= reached: break
    reached |= more
for t in tasks:
    if t['archived_at'] or t['column_id']=='completion': continue
    tid=t['id']
    acts=capture(tid+'-pending', 'select id,target_agent_id,status,reason_type,created_at,stale,failure_summary from activations where task_id=? and status<>? order by sequence',(tid,'completed'))
    attention=capture(tid+'-attention','select * from attention_reasons where task_id=? and resolved_at is null',(tid,))
    capture(tid+'-comments','select * from task_comments where task_id=? order by sequence desc limit 12',(tid,))
    capture(tid+'-activity','select * from activity_ledger where task_id=? order by sequence desc limit 20',(tid,))
    targets=[r['target_task_id'] for r in rels if r['source_task_id']==tid and byid[r['target_task_id']]['column_id']!='completion']
    print(json.dumps({'id':tid,'title':t['title'],'column':t['column_id'],'watcher':watch.get((t['board_id'],t['column_id'])),'inProductChain':tid in reached,'pending':acts,'attention':len(attention),'suspended':t['automation_suspended'],'waits':targets},ensure_ascii=False))
(root/'captured-at.txt').write_text(datetime.datetime.now(datetime.timezone.utc).isoformat(),encoding='utf-8')

import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {createInterface} from 'node:readline';
const req=createRequire(import.meta.resolve('@openai/codex-sdk'));
const base=req.resolve('@openai/codex/package.json');
const native=createRequire(base).resolve('@openai/codex-win32-x64/package.json');
const exe=join(dirname(native),'vendor','x86_64-pc-windows-msvc','bin','codex.exe');
const cwd='D:/Daten/Projekte/Software/Codex/idle-games-autonomous-v2-agent-coordination-state/task-worktrees/T-0052';
async function probe(label,overrides){
 const child=spawn(exe,[...overrides.flatMap(x=>['-c',x]),'app-server'],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});child.stderr.resume();
 const lines=createInterface({input:child.stdout});let id=0;const pending=new Map();
 lines.on('line',line=>{try{const r=JSON.parse(line);if(pending.has(r.id)){const q=pending.get(r.id);pending.delete(r.id);r.error?q.reject(r.error):q.resolve(r.result);}}catch{}});
 const timer=setTimeout(()=>{for(const q of pending.values())q.reject(new Error('timeout'));child.kill()},15000);
 const rpc=(method,params)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});child.stdin.write(JSON.stringify({id:n,method,params})+'\n')});
 try{await rpc('initialize',{clientInfo:{name:'task52_permission_diagnostic',version:'1.0.0'}});child.stdin.write(JSON.stringify({method:'initialized'})+'\n');const r=await rpc('thread/resume',{threadId:'01a1d0b4-2a4d-7141-9e15-98d6fe3b6fe1',cwd,...(label==='repair-existing-task52' ? {sandbox:'workspace-write'} : {})});console.log(JSON.stringify({label,sandbox:r.sandbox,approvalPolicy:r.approvalPolicy,cwd:r.cwd,keys:Object.keys(r)}));}
 catch(e){console.log(JSON.stringify({label,error:e.message||e}));}finally{clearTimeout(timer);lines.close();child.stdin.destroy();child.kill();}
}
if (process.argv.includes('--repair')) await probe('repair-existing-task52',[]);
await probe('verify-persisted-task52',[]);
process.exit(0);





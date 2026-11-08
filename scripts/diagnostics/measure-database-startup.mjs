// Run only against disposable snapshots beneath the ignored local-evidence root.
import { resolve, relative, isAbsolute } from 'node:path';
import { realpathSync } from 'node:fs';
import { CoordinationDatabase } from '../../src/application/internal/coordination-database.ts';
const root=realpathSync(resolve('.scratch/local-evidence/startup-259'));
const path=realpathSync(resolve(process.argv[2]??''));
const inside=relative(root,path);
if(!inside||inside.startsWith('..')||isAbsolute(inside))throw Error('Disposable snapshot required');
const start=performance.now();let previous=start;let phase='initial';const phases=[];
const database=await CoordinationDatabase.open(path,update=>{
 if(update.phase===phase)return;
 const now=performance.now();phases.push({phase,elapsedMs:Math.round(now-previous)});
 console.log(JSON.stringify({finished:phase,elapsedMs:Math.round(now-previous),starting:update.phase}));
 phase=update.phase;previous=now;
});
database.close();phases.push({phase,elapsedMs:Math.round(performance.now()-previous)});
console.log(JSON.stringify({totalMs:Math.round(performance.now()-start),phases}));

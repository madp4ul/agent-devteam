import {open,unlink} from 'node:fs/promises';
const marker='D:/Daten/Projekte/Software/Codex/idle-games-autonomous-v2/.git/worktrees/T-0052/codex-escalation-probe-20261114.tmp';
let created=false;
try {const f=await open(marker,'wx');created=true;await f.close();console.log('GIT_METADATA_WRITE_PASS');}
finally {if(created)await unlink(marker);}

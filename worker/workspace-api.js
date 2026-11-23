import {demand,mergeConcurrent,auditChanges} from '../dist/operations.js';
import {readinessIssues,localDateKey} from '../dist/manufacturing.js';
import {validWorkspace,normalizeAssignments} from '../dist/model.js';
import {normalizeProjects} from '../dist/projects.js';
function preservedBatchSplits(previous,next){
 const preserved=new Set();
 const unchangedFields=['projectId','status','owner','assignedTo','blocked','blockReason','blockOwner','blockNext','blockDate','blockExpected','notes','process','subsystem','due','priority','history','shortCloseReason','dependency','revision','instructions','location','localOverride'];
 for(const source of previous.parts){
  if(source.quantity<=1||source.onshape?.instance!==undefined)continue;
  const units=next.parts.filter(p=>p.onshape?.splitFrom===source.id);
  const original=units.find(p=>p.id===source.id&&p.onshape.instance===1);
  if(!original||!original.onshape.key||source.onshape?.key&&source.onshape.key!==original.onshape.key||units.length!==source.quantity)continue;
  if(new Set(units.map(p=>p.onshape.instance)).size!==units.length||units.some(p=>p.quantity!==1||p.onshape.key!==original.onshape.key||!Number.isInteger(p.onshape.instance)||p.onshape.instance<1||p.onshape.instance>source.quantity||unchangedFields.some(k=>JSON.stringify(p[k])!==JSON.stringify(source[k]))))continue;
  if(['completedQty','spareTarget','reworkQty','scrapQty'].some(k=>units.reduce((n,p)=>n+(p[k]||0),0)!==(source[k]||0)))continue;
  for(const p of units)preserved.add(p.id);
 }
 return preserved;
}
export function sessionIdentity(request,env){const email=(request.headers.get('oai-authenticated-user-email')||'').trim().toLowerCase(),id=request.headers.get('oai-authenticated-user-id')||'';const admins=String(env.ADMIN_EMAILS||'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);const isAdmin=!!(id&&email&&admins.includes(email)),listed=key=>String(env[key]||'').toLowerCase().split(',').map(s=>s.trim()).includes(email),role=isAdmin?'admin':listed('VIEWER_EMAILS')?'viewer':listed('LEAD_EMAILS')?'lead':'member';return {authenticated:!!(id&&email),email,id,isAdmin,role};}
const MEMBER_FIELDS=new Set(['completedQty','readiness','blocked','blockReason','notes','history','updatedAt','reworkQty','scrapQty','blockOwner','blockNext','blockDate','blockExpected','dependency']);
export function memberCanSave(before,next){
 for(const key of new Set([...Object.keys(before),...Object.keys(next)]))if(!['parts','cots','materials','projects','students'].includes(key)&&JSON.stringify(before[key])!==JSON.stringify(next[key]))return false;
 if(JSON.stringify(before.students)!==JSON.stringify(next.students))return false;
 if(JSON.stringify(before.projects)!==JSON.stringify(next.projects)||before.onshapeProjectId!==next.onshapeProjectId)return false;
 for(const kind of ['parts','materials','cots']){const old=new Map(before[kind].map(p=>[p.id,p]));if(next[kind].length!==old.size)return false;for(const item of next[kind]){const p=old.get(item.id);if(!p)return false;const allowed=kind==='parts'?MEMBER_FIELDS:kind==='cots'?new Set(['ordered','received','eta','reference','notes','stock','allocated','location','location2']):new Set();for(const key of new Set([...Object.keys(item),...Object.keys(p)])){if(['approval','acceptedQty'].includes(key))continue;if(!allowed.has(key)&&JSON.stringify(item[key])!==JSON.stringify(p[key]))return false;}if(kind==='parts'&&item.owner!==p.owner&&!before.students.some(s=>s.active&&s.name===item.owner))return false;if(kind==='parts'&&item.status!==p.status&&['Cutting','Finishing','Done'].includes(item.status)){if(item.blocked||!before.students.some(s=>s.active&&s.name===item.owner)||!item.owner?.trim()||!item.number?.trim()||!item.material?.trim()||!item.process?.trim()||!['drawingReviewed','materialReady','setupReady'].every(k=>item.readiness?.[k]))return false;}if(kind==='parts'&&item.status==='Done'&&(item.status!==p.status||item.completedQty!==p.completedQty)&&item.completedQty!==demand(item))return false;}}
 return true;
}
export async function workspaceApi(request,env){
 const who=sessionIdentity(request,env),url=new URL(request.url),headers={'Cache-Control':'no-store','Content-Type':'application/json'};const reply=(value,status=200)=>Response.json(value,{status,headers});
 if(!who.authenticated)return reply({error:'Sign in to use the workspace.'},401);
 if(url.pathname==='/api/session')return reply({isAdmin:who.isAdmin,role:who.role,email:who.email});
 if(!env.DB)return reply({error:'Shared workspace storage is not configured.'},503);
 const row=await env.DB.prepare('SELECT state_json, revision FROM workspace_state WHERE id = ?').bind('team').first();
 const previous=row?normalizeAssignments(JSON.parse(row.state_json)):normalizeProjects({version:1,demo:false,parts:[],cots:[],materials:[]});
 if(request.method==='GET'&&url.pathname==='/api/workspace')return reply({workspace:previous,revision:row?.revision||0,initialized:!!row,isAdmin:who.isAdmin,role:who.role,identity:{email:who.email,id:who.id}});
 if(!['PUT','POST'].includes(request.method))return reply({error:'Method not allowed'},405);
 const text=await request.text();if(text.length>8_000_000)return reply({error:'Workspace is too large.'},413);let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
 if(who.role==='viewer')return reply({error:'Viewer access is read-only.'},403);
 if(body.baseRevision!==(row?.revision||0)){if(body.action==='restore')return reply({error:'Team data changed since the restore preview. Review the latest counts before replacing.',workspace:previous,revision:row?.revision||0},409);if(url.pathname==='/api/workspace'&&validWorkspace(body.baseWorkspace)&&validWorkspace(body.workspace)){const merged=mergeConcurrent(normalizeAssignments(body.baseWorkspace),normalizeAssignments(body.workspace),previous);if(merged.conflicts.length)return reply({error:'Conflicting edits need resolution.',conflicts:merged.conflicts,workspace:previous,revision:row.revision},409);body.workspace=merged.workspace;}else return reply({error:'Another team member changed the workspace. Refresh and try again.',workspace:previous,revision:row?.revision||0},409);}
 if(!who.isAdmin&&body.workspace){const incoming=normalizeAssignments(body.workspace);if(incoming.parts.some(p=>previous.parts.find(x=>x.id===p.id)?.status!==p.status))return reply({error:'Only admins can change manufacturing stages.'},403);}
 const restoring=body.action==='restore';if(restoring&&!who.isAdmin)return reply({error:'Only admins can restore a backup.'},403);
 let next;
 if(url.pathname==='/api/reviews')return reply({error:'Reviews have been retired. Only admins may move parts between stages.'},410);
 if(url.pathname==='/api/workspace'&&request.method==='PUT'){
  if(!validWorkspace(body.workspace))return reply({error:'Invalid workspace data.'},400);
  next=normalizeAssignments(body.workspace);
  if(!who.isAdmin&&(!row||!memberCanSave(previous,next)))return reply({error:'Only admins can change projects, assignments, or part details.'},403);
  if(next.parts.some(p=>p.status!=='Done'&&p.assignedTo&&!next.students.some(s=>s.active&&s.name===p.assignedTo)))return reply({error:'Advance assignments must use an active student.'},400);
  if(!who.isAdmin&&(JSON.stringify(next.projects)!==JSON.stringify(previous.projects)||JSON.stringify(next.students)!==JSON.stringify(previous.students)||next.onshapeProjectId!==previous.onshapeProjectId))return reply({error:'Only admins manage projects, students and the BOM destination.'},403);
  if(!who.isAdmin&&next.parts.some(p=>previous.parts.find(x=>x.id===p.id)?.status!==p.status))return reply({error:'Only admins can change manufacturing stages.'},403);
  // Splitting an existing batch preserves its prior stage and recorded work.
  // It is not a new stage transition; only admins can perform the conversion.
  const preservedSplits=who.isAdmin?preservedBatchSplits(previous,next):new Set();
 for(const p of next.parts){const old=previous.parts.find(x=>x.id===p.id),changed=!old||JSON.stringify(p)!==JSON.stringify(old);if(!changed||restoring||preservedSplits.has(p.id))continue;if(old?.status==='Done'&&p.status==='Done'&&p.completedQty<demand(p)&&!p.shortCloseReason&&(demand(p)>demand(old)||p.completedQty<old.completedQty)){p.status='Finishing';if(demand(p)>demand(old))p.readiness={...p.readiness,materialReady:false,setupReady:false};}
   if(p.blocked&&(!old?.blocked||p.blockReason!==old.blockReason)&&(!p.blockReason?.trim()||!p.blockOwner?.trim()||!p.blockNext?.trim()))return reply({error:'Blocked work needs a reason, resolution owner and next action.'},400);
   if(p.blocked&&!old?.blocked)p.blockDate=localDateKey();
   if(old&&(p.completedQty||0)>(old.completedQty||0)&&readinessIssues(p).length)return reply({error:'Resolve readiness and blockers before adding good pieces.'},400);
   const quantityReopen=old?.status==='Done'&&p.status==='Finishing'&&demand(p)>demand(old)&&p.completedQty===old.completedQty&&p.onshape?.key===old.onshape?.key;
   if(!quantityReopen&&p.status!==old?.status&&['Cutting','Finishing','Done'].includes(p.status)){const issues=readinessIssues(p);if(issues.length)return reply({error:issues.join(' ')},400);if(!next.students.some(s=>s.active&&s.name===p.owner))return reply({error:'Choose an active student before advancing.'},400);}
   if(p.status==='Done'&&p.completedQty<demand(p)&&p.status!==old?.status&&(!who.isAdmin||!p.shortCloseReason?.trim()))return reply({error:'An incomplete batch requires an admin short-close reason.'},400);
   if(p.shortCloseReason!==old?.shortCloseReason&&!who.isAdmin)return reply({error:'Only an admin may short-close work.'},403);
  }
  // Stage changes are the administrator's sign-off; there is no separate review state.
 }else return reply({error:'Not found'},404);
 if(!who.isAdmin&&next.parts.some(p=>previous.parts.find(x=>x.id===p.id)?.status!==p.status))return reply({error:'Only admins can change manufacturing stages.'},403);
 for(const p of next.parts){const old=previous.parts.find(x=>x.id===p.id);const changes=auditChanges({parts:old?[old]:[]},{parts:[p]},who.email);if(changes.length)p.history=[...new Map([...(old?.history||[]),...(who.isAdmin?(p.history||[]):[])].map(h=>[JSON.stringify(h),h])).values(),{at:new Date().toISOString(),worker:who.email,label:Object.keys(changes[0].changes).join(', ')+' updated'}].slice(-50);}
 next={...next,auditLog:[...(previous.auditLog||[]),...(restoring?(next.auditLog||[]).filter(a=>!(previous.auditLog||[]).some(b=>JSON.stringify(a)===JSON.stringify(b))).map(a=>({...a,restoredBy:who.email})):[]),...auditChanges(previous,next,who.email),...(restoring?[{kind:'workspace',id:'team',name:'Backup restored',actor:who.email,at:new Date().toISOString(),changes:{parts:{before:previous.parts.length,after:next.parts.length},cots:{before:previous.cots.length,after:next.cots.length}}}]:[])],recordTombstones:[...(previous.recordTombstones||[]),...['parts','cots'].flatMap(kind=>previous[kind].filter(p=>!next[kind].some(x=>x.id===p.id)).map(record=>({kind,record,removedBy:who.email,at:new Date().toISOString()})))]};
 const revision=(row?.revision||0)+1;const statement=row?env.DB.prepare('UPDATE workspace_state SET state_json = ?, revision = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(next),revision,'team',row.revision):env.DB.prepare('INSERT OR IGNORE INTO workspace_state (id,state_json,revision) VALUES (?,?,?)').bind('team',JSON.stringify(next),revision);
 const result=await statement.run();if(result.meta?.changes!==1)return reply({error:'Workspace changed. Reload and try again.'},409);
 return reply({workspace:next,revision,isAdmin:who.isAdmin,role:who.role,initialized:true});
}

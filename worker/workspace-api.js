import {validWorkspace,normalizeAssignments} from '../dist/model.js';
import {normalizeProjects,preserveApprovals,reviewFingerprint} from '../dist/projects.js';
export function sessionIdentity(request,env){const email=(request.headers.get('oai-authenticated-user-email')||'').trim().toLowerCase(),id=request.headers.get('oai-authenticated-user-id')||'';const admins=String(env.ADMIN_EMAILS||'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);return {authenticated:!!(id&&email),email,id,isAdmin:!!(id&&email&&admins.includes(email))};}
const MEMBER_FIELDS=new Set(['owner','status','completedQty','readiness','blocked','blockReason','notes','history','updatedAt']);
export function memberCanSave(before,next){
 if(JSON.stringify(before.students)!==JSON.stringify(next.students))return false;
 if(JSON.stringify(before.projects)!==JSON.stringify(next.projects)||before.onshapeProjectId!==next.onshapeProjectId)return false;
 for(const kind of ['parts','materials','cots']){const old=new Map(before[kind].map(p=>[p.id,p]));if(next[kind].length!==old.size)return false;for(const item of next[kind]){const p=old.get(item.id);if(!p)return false;const allowed=kind==='parts'?MEMBER_FIELDS:kind==='cots'?new Set(['ordered','received','eta','reference','notes']):new Set();for(const key of new Set([...Object.keys(item),...Object.keys(p)])){if(key==='approval')continue;if(!allowed.has(key)&&JSON.stringify(item[key])!==JSON.stringify(p[key]))return false;}if(kind==='parts'&&item.owner!==p.owner&&!before.students.some(s=>s.active&&s.name===item.owner))return false;if(kind==='parts'&&item.status!==p.status&&['Cutting','Finishing','Finished'].includes(item.status)){if(item.blocked||!before.students.some(s=>s.active&&s.name===item.owner)||!item.owner?.trim()||!item.number?.trim()||!item.material?.trim()||!item.process?.trim()||!['drawingReviewed','materialReady','setupReady'].every(k=>item.readiness?.[k]))return false;}if(kind==='parts'&&item.status==='Finished'&&item.completedQty!==item.quantity)return false;}}
 return true;
}
export async function workspaceApi(request,env){
 const who=sessionIdentity(request,env),url=new URL(request.url),headers={'Cache-Control':'no-store','Content-Type':'application/json'};const reply=(value,status=200)=>Response.json(value,{status,headers});
 if(!who.authenticated)return reply({error:'Sign in to use the workspace.'},401);
 if(url.pathname==='/api/session')return reply({isAdmin:who.isAdmin,email:who.email});
 if(!env.DB)return reply({error:'Shared workspace storage is not configured.'},503);
 const row=await env.DB.prepare('SELECT state_json, revision FROM workspace_state WHERE id = ?').bind('team').first();
 const previous=row?normalizeAssignments(JSON.parse(row.state_json)):normalizeProjects({version:1,demo:false,parts:[],cots:[],materials:[]});
 if(request.method==='GET'&&url.pathname==='/api/workspace')return reply({workspace:previous,revision:row?.revision||0,initialized:!!row,isAdmin:who.isAdmin});
 if(!['PUT','POST'].includes(request.method))return reply({error:'Method not allowed'},405);
 const text=await request.text();if(text.length>2_000_000)return reply({error:'Workspace is too large.'},413);let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
 if(body.baseRevision!==(row?.revision||0))return reply({error:'Another team member changed the workspace. Reload and try again.'},409);
 let next;
 if(url.pathname==='/api/reviews'&&request.method==='POST'){
  if(!who.isAdmin)return reply({error:'Only admins can review parts.'},403);
  if(!['approved','changes_requested'].includes(body.decision)||!Array.isArray(body.ids)||!body.ids.length||body.ids.length>500||body.decision==='changes_requested'&&!String(body.reason||'').trim())return reply({error:'Choose parts and add a reason when returning work.'},400);
  const ids=new Set(body.ids);if(body.ids.some(id=>!previous.parts.some(p=>p.id===id&&p.status==='Finished'&&p.approval?.status!=='approved')))return reply({error:'A selected batch changed or was already reviewed. Refresh the queue.'},409);
  const at=new Date().toISOString();next={...previous,reviewLog:[...(previous.reviewLog||[]),{ids:body.ids,decision:body.decision,reviewedBy:who.email,at,reason:String(body.reason||'').trim().slice(0,2000)}],parts:previous.parts.map(p=>ids.has(p.id)?{...p,approval:{status:body.decision,reviewedBy:who.email,reviewedAt:at,reason:String(body.reason||'').trim().slice(0,2000),fingerprint:reviewFingerprint(p)},...(body.decision==='changes_requested'?{status:'Finishing',blocked:true,blockReason:'Review: '+String(body.reason).trim().slice(0,1900)}:{})}:p)};
 }else if(url.pathname==='/api/workspace'&&request.method==='PUT'){
  if(!validWorkspace(body.workspace))return reply({error:'Invalid workspace data.'},400);
  next=normalizeAssignments(body.workspace);
  if(!who.isAdmin&&(!row||!memberCanSave(previous,next)))return reply({error:'Only admins can change projects, assignments, or part details.'},403);
  if(next.parts.some(p=>p.status!=='Finished'&&p.assignedTo&&!next.students.some(s=>s.active&&s.name===p.assignedTo)))return reply({error:'Advance assignments must use an active student.'},400);
  next=preserveApprovals(previous,next);
 }else return reply({error:'Not found'},404);
 const revision=(row?.revision||0)+1;const statement=row?env.DB.prepare('UPDATE workspace_state SET state_json = ?, revision = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(next),revision,'team',row.revision):env.DB.prepare('INSERT OR IGNORE INTO workspace_state (id,state_json,revision) VALUES (?,?,?)').bind('team',JSON.stringify(next),revision);
 const result=await statement.run();if(result.meta?.changes!==1)return reply({error:'Workspace changed. Reload and try again.'},409);
 return reply({workspace:next,revision,isAdmin:who.isAdmin,initialized:true});
}

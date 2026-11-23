export const partVersion=p=>p.revisionNumber||1;
export function createPartRevision(workspace,id,idFactory=()=>crypto.randomUUID(),at=new Date().toISOString()){
 const source=workspace.parts.find(p=>p.id===id);
 if(!source)throw Error('This part no longer exists. Refresh the board.');
 if(source.revisionArchived||source.supersededBy)throw Error('Open the latest version before creating another revision.');
 if(source.onshape&&source.quantity>1&&source.onshape.instance===undefined)throw Error('Import this BOM batch once to create individual cards before making a revision.');
 const revisionNumber=partVersion(source)+1,revisionFamilyId=source.revisionFamilyId||source.id,newId=idFactory();
 if(workspace.parts.some(p=>p.id===newId))throw Error('The new part ID is already in use.');
 const copy={...structuredClone(source),id:newId,revisionFamilyId,revisionNumber,revisionOf:source.id,revisionArchived:false,
  status:'Not Started',completedQty:0,reworkQty:0,scrapQty:0,spareTarget:0,owner:'',assignedTo:'',
  blocked:false,blockReason:'',blockOwner:'',blockNext:'',blockDate:'',blockExpected:'',dependency:'',notes:'',
  readiness:{drawingReviewed:false,materialReady:false,setupReady:false},sourceMissing:false,
  createdAt:at,updatedAt:at,history:[{at,worker:'',label:'V'+revisionNumber+' created from V'+partVersion(source)}]};
 delete copy.supersededBy;delete copy.shortCloseReason;delete copy.approval;delete copy.acceptedQty;
 return {workspace:{...workspace,parts:workspace.parts.map(p=>p.id===id?{...p,revisionFamilyId,revisionNumber:partVersion(p),revisionArchived:true,supersededBy:newId}:p).concat(copy)},part:copy};
}
export function validPartRevisions(parts){
 const rows=new Map(parts.map(p=>[p?.id,p])),versions=new Set();
 return parts.every(p=>{
  if(!p)return false;
  const fields=['revisionFamilyId','revisionNumber','revisionOf','revisionArchived','supersededBy'];
  if(!fields.some(k=>p[k]!==undefined))return true;
  if(typeof p.revisionFamilyId!=='string'||!Number.isSafeInteger(p.revisionNumber)||p.revisionNumber<1||p.revisionNumber>9999||typeof p.revisionArchived!=='boolean')return false;
  const root=rows.get(p.revisionFamilyId),key=p.revisionFamilyId+':'+p.revisionNumber;
  if(!root||root.projectId!==p.projectId||versions.has(key))return false;versions.add(key);
  if(p.revisionNumber===1){if(p.id!==p.revisionFamilyId||p.revisionOf!==undefined)return false;}
  else{const parent=rows.get(p.revisionOf);if(!parent||parent.projectId!==p.projectId||parent.revisionFamilyId!==p.revisionFamilyId||parent.revisionNumber!==p.revisionNumber-1||parent.supersededBy!==p.id)return false;}
  if(p.revisionArchived){const next=rows.get(p.supersededBy);if(!next||next.revisionOf!==p.id)return false;}
  else if(p.supersededBy!==undefined)return false;
  return true;
 });
}
const revisionEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function revisionControls(p,isAdmin=false){
 const version=partVersion(p);
 return '<div class="revision-controls"><span class="revision-label">V'+version+(p.revisionArchived?' · Previous version':'')+'</span>'+
  (p.revisionOf?'<button type="button" class="revision-link" data-revision-link="'+revisionEsc(p.revisionOf)+'">View V'+(version-1)+'</button>':'')+
  (p.supersededBy?'<button type="button" class="revision-link" data-revision-link="'+revisionEsc(p.supersededBy)+'">Open V'+(version+1)+'</button>':isAdmin?'<button type="button" class="revision-create" data-new-revision="'+revisionEsc(p.id)+'">Create V'+(version+1)+'</button>':'')+'</div>';
}

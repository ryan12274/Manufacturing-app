// Additive operational schema. version remains the backup envelope version.
export const operationalKey=v=>String(v??'').trim().replace(/\s+/g,' ');
export const demand=p=>p.quantity+(p.spareTarget||0);
export const accepted=p=>Math.min(p.completedQty||0,p.acceptedQty??(p.approval?.status==='approved'?p.completedQty||0:0));
export const shortfall=p=>Math.max(0,p.quantity-accepted(p));
export function migrateOperations(w){
 return {...w,schemaVersion:2,parts:(w.parts||[]).map(p=>({...p,spareTarget:p.spareTarget??0,reworkQty:p.reworkQty??0,scrapQty:p.scrapQty??0,revision:p.revision??'',instructions:p.instructions??'',location:p.location??'',blockOwner:p.blockOwner??'',blockNext:p.blockNext??'',blockDate:p.blockDate??'',blockExpected:p.blockExpected??'',dependency:p.dependency??'',sourceMissing:p.sourceMissing??false})),cots:(w.cots||[]).map(i=>({...i,stock:i.stock??0,allocated:i.allocated??0,packSize:i.packSize??1,location:i.location??'',subsystem:i.subsystem??''}))};
}
export function validOperations(w){
 const whole=n=>Number.isSafeInteger(n)&&n>=0, text=(p,ks)=>ks.every(k=>p[k]===undefined||typeof p[k]==='string'&&p[k].length<=10000);
 if(w.auditLog!==undefined&&(!Array.isArray(w.auditLog)||!w.auditLog.every(a=>a&&typeof a.actor==='string'&&typeof a.at==='string'&&a.changes&&typeof a.changes==='object')))return false;if(w.recordTombstones!==undefined&&(!Array.isArray(w.recordTombstones)||!w.recordTombstones.every(t=>t&&['parts','cots'].includes(t.kind)&&t.record&&typeof t.record.id==='string')))return false;
 return (w.schemaVersion===undefined||w.schemaVersion===2)&&w.parts.every(p=>p&&Number.isSafeInteger(demand(p))&&(p.localOverride===undefined||typeof p.localOverride==='boolean')&&['spareTarget','reworkQty','scrapQty','acceptedQty'].every(k=>p[k]===undefined||whole(p[k]))&&(p.acceptedQty??0)<=(p.completedQty??p.quantity)&&(p.completedQty??0)+(p.reworkQty??0)<=demand(p)&&text(p,['revision','instructions','location','blockOwner','blockNext','blockDate','blockExpected','dependency','blockReason','shortCloseReason'])&&(!p.shortCloseReason||p.shortCloseReason.trim().length>=5))&&Array.isArray(w.cots||[])&&(w.cots||[]).every(i=>i&&['stock','allocated','packSize'].every(k=>i[k]===undefined||whole(i[k]))&&(i.packSize??1)>0&&(i.allocated??0)<=(i.stock??0)&&text(i,['location','subsystem']));
}
export function purchasing(i){const stock=Math.max(0,(i.stock||0)-(i.allocated||0)),inbound=Math.max(0,i.ordered-i.received),available=stock+i.received,missing=Math.max(0,i.needed-available),order=Math.max(0,missing-inbound),packs=Math.ceil(order/(i.packSize||1));return {stock,inbound,available,missing,order,packs};}
const sameValue=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Three-way merge by record and field. Conflicting values are never overwritten.
export function mergeConcurrent(base,local,remote){
 const result=structuredClone(remote),conflicts=[];
 for(const kind of ['parts','cots','materials','projects','students']){
  const b=new Map((base[kind]||[]).map(p=>[p.id,p])),l=new Map((local[kind]||[]).map(p=>[p.id,p])),r=new Map((remote[kind]||[]).map(p=>[p.id,p]));
  const rows=[];
  for(const id of new Set([...b.keys(),...l.keys(),...r.keys()])){const old=b.get(id),mine=l.get(id),theirs=r.get(id);if(sameValue(old,mine)){if(theirs)rows.push(theirs);continue;}if(sameValue(old,theirs)||sameValue(mine,theirs)){if(mine)rows.push(mine);continue;}if(!old||!mine||!theirs){conflicts.push({kind,id,name:mine?.name||theirs?.name||id,field:'record',before:old,local:mine,remote:theirs});if(theirs)rows.push(theirs);continue;}const row={...theirs};for(const key of new Set([...Object.keys(old),...Object.keys(mine),...Object.keys(theirs)])){if(['history','updatedAt','approval','acceptedQty'].includes(key))continue;if(sameValue(old[key],mine[key]))continue;if(!sameValue(old[key],theirs[key])&&!sameValue(mine[key],theirs[key]))conflicts.push({kind,id,name:mine.name||id,field:key,before:old[key],local:mine[key],remote:theirs[key]});else row[key]=mine[key];}rows.push(row);}
  result[kind]=rows;
 }
 for(const key of ['onshapeProjectId','demo','importState']){if(sameValue(base[key],local[key]))continue;if(!sameValue(base[key],remote[key])&&!sameValue(local[key],remote[key]))conflicts.push({kind:'workspace',id:'team',field:key,local:local[key],remote:remote[key]});else result[key]=local[key];}
 return {workspace:result,conflicts};
}
export function auditChanges(before,next,actor,at=new Date().toISOString()){
 const entries=[];for(const kind of ['parts','cots','projects','students','materials']){const a=new Map((before[kind]||[]).map(p=>[p.id,p])),b=new Map((next[kind]||[]).map(p=>[p.id,p]));for(const id of new Set([...a.keys(),...b.keys()])){const old=a.get(id),row=b.get(id),changes={};for(const key of new Set([...Object.keys(old||{}),...Object.keys(row||{})]))if(!['history','updatedAt'].includes(key)&&!sameValue(old?.[key],row?.[key]))changes[key]={before:old?.[key]??null,after:row?.[key]??null};if(Object.keys(changes).length)entries.push({kind,id,name:row?.name||old?.name||id,actor,at,changes});}}
 return entries;
}
export function recordProblems(p){const warnings=[];if(/demo|test|sadf|asdf/i.test(p.name+' '+p.subsystem)||/^demo-/.test(p.id))warnings.push('Possible test record');if(!p.number||!p.material||!p.process)warnings.push('Incomplete manufacturing details');if(p.sourceMissing)warnings.push('Missing from latest BOM');if(p.status==='Finished'&&(p.completedQty||0)<demand(p)&&!p.shortCloseReason)warnings.push('Quantity shortfall after completion');return warnings;}

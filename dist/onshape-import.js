import {applyImportSubsystems} from './subsystem-rules.js';
// Shared by the browser importer and the server API. No credentials belong here.
import {partColorHex,generalizePartColor,isPartColor} from './part-colors.js';
export function bomSourceIdentity(key){try{const value=JSON.parse(key);return Array.isArray(value)&&['bom','bom-cots'].includes(value[0])&&value.length>=7?JSON.stringify(value.slice(1,7)):'';}catch{return '';}}
export function selectedBom(data,selectedKeys=null){
 if(selectedKeys===null)return {...data,partial:false};
 const selected=new Set(selectedKeys);return {...data,parts:data.parts.filter(p=>selected.has(p.key)),cots:(data.cots||[]).filter(p=>selected.has(p.key)),partial:true};
}
export const PART_PREFIX='7028';
const clean=value=>typeof value==='string'?value.trim().slice(0,500):'';
const usableBomValue=value=>!!value&&!/^(n\/?a|null|none|undefined|-)$/i.test(value);
export function mapOnshapeBom(bom,source){
 if(!bom||bom.type!=='flattened'||!Array.isArray(bom.rows)||!Array.isArray(bom.headers))throw new Error('Onshape returned an unexpected BOM response. A flattened BOM is required.');
 if(bom.rows.length>10000)throw new Error('Onshape BOM contains too many rows.');
 const columns=new Map(bom.headers.map(h=>[h.propertyName,h.id]));
 if(!columns.has('partNumber')||!columns.has('quantity'))throw new Error('Onshape BOM is missing the part number or quantity column.');
 const colorColumns=bom.headers.filter(h=>[h.propertyName,h.name,h.displayName].some(v=>/^(color|colour|appearance|hexcolor|colorhex)$/i.test(String(v||'').replace(/[ _-]/g,'')))).map(h=>h.id);
 let ignored=0;const parts=[],purchased=new Map();
 for(const row of bom.rows){
  const cells=row.headerIdToValue||{},item=row.itemSource;
  const number=clean(cells[columns.get('partNumber')]);
  if(!item?.partId||row.excluded===true||cells[columns.get('excludeFromBom')]===true){ignored++;continue;}
  const vendor=bomVendor(clean(cells[columns.get('vendor')]),number);
  if(!usableBomValue(number)&&!vendor&&!item.isStandardContent){ignored++;continue;}
  const quantity=Number(cells[columns.get('quantity')]);
  if(!Number.isSafeInteger(quantity)||quantity<1)throw new Error('Onshape BOM has an invalid whole-part quantity for '+number+'.');
  if(number.startsWith(PART_PREFIX)&&(!item.documentId||!item.elementId))throw new Error('A matching BOM part is missing its source identity.');
  const key=JSON.stringify(['bom',source.origin,source.documentId,source.reference,source.referenceId,source.elementId,source.configuration||'',item.documentId,item.elementId,item.partId,item.fullConfiguration||item.configuration||'']);
  const cad=clean(item.viewHref)||`${source.origin}/documents/${source.documentId}/${source.reference}/${source.referenceId}/e/${source.elementId}`;
  const material=cells[columns.get('material')];
  const name=clean(cells[columns.get('name')])||number||'Standard hardware';
  if(number.startsWith(PART_PREFIX)){
   const hex=[row.appearance,item.appearance,...colorColumns.map(id=>cells[id])].map(v=>partColorHex(v)).find(Boolean)||'';
   parts.push({key,number,name,material:clean(typeof material==='string'?material:material?.displayName),cad,quantity,
    ...(hex?{colorHex:hex,color:generalizePartColor(hex)}:{}),
    appearanceSource:{documentId:item.documentId,elementId:item.elementId,partId:item.partId,reference:item.wvmType,referenceId:item.wvmId,configuration:item.fullConfiguration||item.configuration||'',elementMicroversionId:item.sourceElementMicroversionId,viewHref:item.viewHref}});
  }
  else{
   // A vendor SKU may occur in several CAD rows. Order its combined BOM quantity.
   const cotsKey=usableBomValue(number)?JSON.stringify(['bom-cots',source.origin,source.documentId,source.reference,source.referenceId,source.elementId,source.configuration||'',vendor||'Unassigned',number]):key;
   const previous=purchased.get(cotsKey);
   if(previous){previous.quantity+=quantity;if(!Number.isSafeInteger(previous.quantity))throw new Error('COTS quantity is too large.');}
   else purchased.set(cotsKey,{key:cotsKey,number,name,vendor:vendor||'Unassigned',quantity});
  }
 }
 return {parts,cots:[...purchased.values()],ignored};
}

function bomVendor(value,number){
 if(!usableBomValue(value))value='';
 if(/^rev(?: robotics)?$/i.test(value))return 'REV';
 if(/^(wcp|west\s?coast products)$/i.test(value))return 'WCP';
 if(value)return value;
 if(/^REV-/i.test(number))return 'REV';
 if(/^WCP-/i.test(number))return 'WCP';
 if(/^am-\d/i.test(number))return 'AndyMark';
 return '';
}

export function mergeOnshapeCots(workspace,incoming,idFactory=()=>crypto.randomUUID()){
 if(!Array.isArray(incoming))throw new Error('Invalid COTS BOM response.');
 const keys=new Map();
 for(const p of incoming){
  if(!p||!['key','number','name','vendor'].every(k=>typeof p[k]==='string'&&p[k].length<=3000)||!p.key||!p.name||!p.vendor||p.number.startsWith(PART_PREFIX)||!Number.isSafeInteger(p.quantity)||p.quantity<1)throw new Error('Invalid purchased part in BOM response.');
  if(keys.has(p.key)&&JSON.stringify(keys.get(p.key))!==JSON.stringify(p))throw new Error('Conflicting COTS BOM identities.');
  keys.set(p.key,p);
 }
 const cots=(workspace.cots||[]).map(i=>({...i}));let added=0,updated=0,unchanged=0;const conflicts=[],conflictDetails=[];
 for(const p of keys.values()){
  let matches=cots.filter(i=>i.onshape?.key===p.key);
  // Retain order progress from the first release's placeholder-SKU identities.
  if(!matches.length&&!usableBomValue(p.number))matches=cots.filter(i=>{
   if(i.name!==p.name||i.number!==p.number||i.vendor!==p.vendor)return false;
   try{const old=JSON.parse(i.onshape?.key);const key=JSON.parse(p.key);return old[0]==='bom-cots'&&key[0]==='bom'&&old.slice(1,7).every((v,n)=>v===key[n+1]);}catch{return false;}
  });
  const collisions=usableBomValue(p.number)?cots.filter(i=>i.number.trim()===p.number&&bomVendor(i.vendor,i.number)===p.vendor&&!i.onshape):[];
  if(matches.length>1||(!matches.length&&collisions.length)){conflicts.push(p.number||p.name);conflictDetails.push({kind:'cots',part:p,existingIds:(matches.length?matches:collisions).map(i=>i.id)});continue;}
  const existing=matches[0];
  if(existing){
   // Supplier corrections and purchasing progress belong to the shop.
   const changed=existing.name!==p.name||existing.number!==p.number||existing.needed!==p.quantity||existing.onshape.key!==p.key||existing.sourceMissing;
   if(changed){Object.assign(existing,{name:p.name,number:p.number,needed:p.quantity,sourceMissing:false,onshape:{...existing.onshape,key:p.key}});updated++;}else unchanged++;
  }else{cots.push({id:idFactory(),name:p.name,number:p.number,vendor:p.vendor,needed:p.quantity,ordered:0,received:0,url:'',eta:'',reference:'',notes:'',onshape:{key:p.key,mode:'bom'}});added++;}
 }
 return {workspace:{...workspace,cots},added,updated,unchanged,conflicts:[...new Set(conflicts)],conflictDetails};
}

export function mergeOnshapeBom(workspace,data,idFactory){
 const manufactured=mergeOnshapeParts(workspace,data.parts,idFactory);
 const purchased=mergeOnshapeCots(manufactured.workspace,data.cots||[],idFactory);
 const mapped=applyImportSubsystems(purchased.workspace,(data.parts||[]).map(p=>p.key),data.projectId,data.subsystemRules);
 for(const part of mapped.parts){const before=workspace.parts.find(p=>p.id===part.id),source=purchased.workspace.parts.find(p=>p.id===part.id);if(before&&source&&before.subsystem!==part.subsystem&&JSON.stringify(before)===JSON.stringify(source)){manufactured.updated++;manufactured.unchanged--;}}
 purchased.workspace=mapped;
 if(data.projectId&&data.subsystemRules)purchased.workspace.subsystemRules={...workspace.subsystemRules,[data.projectId]:data.subsystemRules};
 const incoming=new Set([...(data.parts||[]),...(data.cots||[])].map(p=>p.key));const preview=[];for(const kind of ['parts','cots'])for(const item of purchased.workspace[kind]){if(!item.revisionArchived&&item.onshape?.key&&!data.partial&&(!data.sourceKeys||data.sourceKeys.includes(bomSourceIdentity(item.onshape.key)))&&(!incoming.has(item.onshape.key)||kind==='parts'&&item.sourceMissing)){item.sourceMissing=true;preview.push({id:item.id,name:item.name,change:'No longer in BOM; retained for review'});}const old=(workspace[kind]||[]).find(p=>p.id===item.id);if(!old)preview.push({id:item.id,name:item.name,change:'New record'});else{const fields=(kind==='parts'?['name','number','material','color','quantity','subsystem']:['name','number','needed']).filter(k=>old[k]!==item[k]);if(fields.length)preview.push({id:item.id,name:item.name,change:fields.map(k=>k+': '+old[k]+' → '+item[k]).join(', ')});}if(kind==='parts'&&(!item.material||!item.process))preview.push({id:item.id,name:item.name,change:'Missing material or process; requires shop setup'});}
 return {preview,colorWarnings:data.colorWarnings||[],workspace:purchased.workspace,manufactured,purchased,added:manufactured.added+purchased.added,updated:manufactured.updated+purchased.updated,unchanged:manufactured.unchanged+purchased.unchanged,conflicts:[...manufactured.conflicts,...purchased.conflicts],conflictDetails:[...manufactured.conflictDetails,...purchased.conflictDetails],sharedNumbers:manufactured.sharedNumbers};
}

// Stable unit ordinals belong to a CAD identity, never to a part number.
// Spreadsheet-style lettering continues with AA, AB, ... after Z.
export function instanceSuffix(ordinal){
 if(!Number.isSafeInteger(ordinal)||ordinal<1)throw Error('Invalid manufactured instance ordinal.');
 let label='';for(let n=ordinal;n>0;n=Math.floor((n-1)/26))label=String.fromCharCode(65+(n-1)%26)+label;
 return '('+label+')';
}
const MAX_MANUFACTURED_INSTANCES=10000;
function splitManufacturedBatch(batch,idFactory){
 if(batch.quantity>MAX_MANUFACTURED_INSTANCES)throw Error('Existing batch exceeds the 10,000 manufactured-instance import limit.');
 const completed=batch.completedQty??(batch.status==='Done'?batch.quantity:0),spares=batch.spareTarget||0;
 let good=completed,rework=batch.reworkQty||0;
 const rows=Array.from({length:batch.quantity},(_,n)=>{
  const made=Math.min(1,good);good-=made;
  const repairing=Math.min(1-made,rework);rework-=repairing;
  const {approval,acceptedQty,...original}=batch;
  return {...original,id:n===0?batch.id:idFactory(),quantity:1,completedQty:made,
   spareTarget:n===0?spares:0,reworkQty:repairing,scrapQty:n===0?(batch.scrapQty||0):0,
   onshape:{...batch.onshape,instance:n+1,splitFrom:batch.id,sourceName:batch.name,sourceQuantity:batch.quantity}};
 });
 // Spare pieces and their rework stay on the original record, without duplication.
 rows[0].completedQty+=good;rows[0].reworkQty+=rework;
 return rows;
}
function importedInstance(part,ordinal,multiple,idFactory){
 return {id:idFactory(),name:part.name+(multiple?' '+instanceSuffix(ordinal):''),number:part.number,material:part.material,cad:part.cad,color:part.color||'',
  onshape:{key:part.key,mode:'bom',instance:ordinal,sourceName:part.name,sourceQuantity:part.quantity,...(part.colorHex?{colorHex:part.colorHex}:{})},
  subsystem:'',process:'',quantity:1,completedQty:0,readiness:{drawingReviewed:false,materialReady:false,setupReady:false},
  owner:'',assignedTo:'',due:'',priority:'Normal',status:'Not Started',blocked:false,notes:''};
}
export function mergeOnshapeParts(workspace,incoming,idFactory=()=>crypto.randomUUID()){
 if(!Array.isArray(incoming))throw new Error('Invalid Onshape import response.');
 const sourceKeys=new Map(),numbers=new Map();
 for(const p of incoming){
  if(!p||!['key','number','name','material','cad'].every(k=>typeof p[k]==='string'&&p[k].length<=3000)||!p.number.startsWith(PART_PREFIX)||!p.key||!p.name||!Number.isSafeInteger(p.quantity)||p.quantity<1)throw new Error('Invalid matching part in Onshape response.');
  if(p.color!==undefined&&!isPartColor(p.color)||p.colorHex!==undefined&&!/^#[0-9a-f]{6}$/i.test(p.colorHex))throw Error('Invalid manufactured part color.');
  const link=new URL(p.cad);if(link.protocol!=='https:'||!link.hostname.endsWith('.onshape.com'))throw new Error('Invalid Onshape CAD link.');
  if(sourceKeys.has(p.key)&&JSON.stringify(sourceKeys.get(p.key))!==JSON.stringify(p))throw new Error('Conflicting data for the same Onshape part.');
  sourceKeys.set(p.key,p);
  if(!numbers.has(p.number))numbers.set(p.number,new Set());numbers.get(p.number).add(p.key);
 }
 if([...sourceKeys.values()].reduce((n,p)=>n+p.quantity,0)>MAX_MANUFACTURED_INSTANCES)throw Error('BOM exceeds the 10,000 manufactured-instance import limit.');
 const originalParts=new Map(workspace.parts.map(p=>[p.id,p]));
 let parts=workspace.parts.map(p=>({...p})),added=0,updated=0,unchanged=0;
 const conflicts=[],conflictDetails=[];
 for(const p of sourceKeys.values()){
  let group=parts.filter(r=>!r.revisionArchived&&r.onshape?.key===p.key);
  const legacy=group.filter(r=>r.onshape.instance===undefined);
  const manual=parts.filter(r=>!r.revisionArchived&&r.number.trim()===p.number&&!r.onshape);
  const ordinals=group.map(r=>r.onshape.instance??1);
  if(legacy.length>1||legacy.length&&group.length>1||new Set(ordinals).size!==ordinals.length||ordinals.some(n=>!Number.isSafeInteger(n)||n<1)||!group.length&&manual.length){
   conflicts.push(p.number);conflictDetails.push({kind:'parts',part:p,existingIds:(group.length?group:manual).map(i=>i.id)});continue;
  }
  if(!legacy.length&&group.some(r=>(r.completedQty||0)+(r.reworkQty||0)>1+(r.spareTarget||0))){
   conflicts.push(p.number);conflictDetails.push({kind:'parts',part:p,existingIds:group.map(i=>i.id),reason:'An individual instance has batch-level production counts. Correct its counts or spare target before importing.'});continue;
  }
  if(legacy.length){
   const batch=legacy[0],copies=splitManufacturedBatch(batch,idFactory);
   parts=parts.flatMap(r=>r.id===batch.id?copies:[r]);group=copies;added+=copies.length-1;
  }
  // Keep lettering stable if the BOM later drops back to one required unit.
  const multiple=p.quantity>1||group.some(r=>r.onshape.instance>1);
  const byOrdinal=new Map(group.map(r=>[r.onshape.instance,r]));
  for(let ordinal=1;ordinal<=p.quantity;ordinal++){
   const existing=byOrdinal.get(ordinal);
   if(!existing){parts.push(importedInstance(p,ordinal,multiple,idFactory));added++;continue;}
   const suffix=' '+instanceSuffix(ordinal);
   const localName=existing.name.endsWith(suffix)?existing.name.slice(0,-suffix.length):existing.name;
   const name=(existing.localOverride?localName:p.name)+(multiple?suffix:'');
   const fields=existing.localOverride?{name,quantity:1}:{name,number:p.number,material:p.material,cad:p.cad,quantity:1,...(p.color?{color:p.color}:{})};
   const onshape={...existing.onshape,sourceName:p.name,sourceQuantity:p.quantity,...(p.colorHex?{colorHex:p.colorHex}:{})};
   const before=originalParts.get(existing.id);
   const changed=!before||Object.entries(fields).some(([k,v])=>existing[k]!==v)||existing.sourceMissing||JSON.stringify(before.onshape)!==JSON.stringify(onshape)||before.quantity!==1;
   if(changed){
    const readiness={drawingReviewed:false,materialReady:false,setupReady:false,...existing.readiness};
    if(!existing.localOverride){
     if((existing.onshape.sourceName??existing.name)!==p.name||existing.number!==p.number||existing.cad!==p.cad)readiness.drawingReviewed=false;
     if(existing.material!==p.material){readiness.materialReady=false;readiness.setupReady=false;}
    }
    Object.assign(existing,fields,{onshape,sourceMissing:false,readiness});
    if(before)updated++;
   }else unchanged++;
  }
  // Quantity reductions never delete assigned work or completed pieces.
  // Excess units can be reviewed/removed by the manager and reused if demand returns.
  for(const extra of group.filter(r=>r.onshape.instance>p.quantity)){
   const before=originalParts.get(extra.id);
   const name=(extra.localOverride?extra.name:p.name+' '+instanceSuffix(extra.onshape.instance));
   const color=!extra.localOverride&&p.color?p.color:extra.color;
   const onshape={...extra.onshape,sourceQuantity:p.quantity,...(p.colorHex?{colorHex:p.colorHex}:{})};
   if(!extra.sourceMissing||extra.name!==name||extra.color!==color||JSON.stringify(extra.onshape)!==JSON.stringify(onshape)){
    Object.assign(extra,{name,color,sourceMissing:true,onshape});if(before)updated++;
   }else if(before)unchanged++;
  }
 }
 return {workspace:{...workspace,parts},added,updated,unchanged,conflicts:[...new Set(conflicts)],conflictDetails,sharedNumbers:[...numbers].filter(([,keys])=>keys.size>1).map(([number])=>number)};
}

export function resolveBomConflict(workspace,detail,existingId='',idFactory=()=>crypto.randomUUID()){
 const kind=detail.kind,part=detail.part;if(!['parts','cots'].includes(kind))throw Error('Invalid import conflict.');
 let next=workspace;
 if(existingId){
  const current=(workspace[kind]||[]).find(i=>i.id===existingId);
  if(!current||!detail.existingIds.includes(existingId))throw Error('This tracked record changed. Scan the BOM again.');
  if(current.onshape?.key&&current.onshape.key!==part.key)throw Error('This record is already linked to another BOM item. Keep them separate.');
  next={...workspace,[kind]:workspace[kind].map(i=>{if(i.id===existingId)return {...i,onshape:{...i.onshape,key:part.key,mode:'bom'}};if(i.onshape?.key===part.key&&(kind==='cots'||i.onshape.instance===current.onshape?.instance)){const copy={...i};delete copy.onshape;return copy;}return i;})};
 }
 // A separate record is explicitly linked first, so manual number collisions cannot
 // cause the same unresolved conflict on subsequent syncs.
 if(!existingId){
  const base=kind==='parts'?{id:idFactory(),...part,quantity:part.quantity,completedQty:0,subsystem:'',process:'',owner:'',assignedTo:'',due:'',priority:'Normal',status:'Not Started',blocked:false,notes:'',readiness:{drawingReviewed:false,materialReady:false,setupReady:false}}:{id:idFactory(),name:part.name,number:part.number,vendor:part.vendor,needed:part.quantity,ordered:0,received:0,url:'',eta:'',reference:'',notes:''};
  delete base.key;next={...workspace,[kind]:[...(workspace[kind]||[]),{...base,onshape:{key:part.key,mode:'bom'}}]};
 }
 const result=kind==='parts'?mergeOnshapeParts(next,[part],idFactory):mergeOnshapeCots(next,[part],idFactory);
 if(result.conflicts.length)throw Error(detail.reason||'This conflict needs a correction in the tracked record first.');
 return result.workspace;
}

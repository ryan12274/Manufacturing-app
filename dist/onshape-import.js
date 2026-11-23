// Shared by the browser importer and the server API. No credentials belong here.
export const PART_PREFIX='7028';
const clean=value=>typeof value==='string'?value.trim().slice(0,500):'';
const usableBomValue=value=>!!value&&!/^(n\/?a|null|none|undefined|-)$/i.test(value);
export function mapOnshapeBom(bom,source){
 if(!bom||bom.type!=='flattened'||!Array.isArray(bom.rows)||!Array.isArray(bom.headers))throw new Error('Onshape returned an unexpected BOM response. A flattened BOM is required.');
 if(bom.rows.length>10000)throw new Error('Onshape BOM contains too many rows.');
 const columns=new Map(bom.headers.map(h=>[h.propertyName,h.id]));
 if(!columns.has('partNumber')||!columns.has('quantity'))throw new Error('Onshape BOM is missing the part number or quantity column.');
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
  if(number.startsWith(PART_PREFIX))parts.push({key,number,name,material:clean(typeof material==='string'?material:material?.displayName),cad,quantity});
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
 const incoming=new Set([...(data.parts||[]),...(data.cots||[])].map(p=>p.key));const preview=[];for(const kind of ['parts','cots'])for(const item of purchased.workspace[kind]){if(item.onshape?.key&&!incoming.has(item.onshape.key)){item.sourceMissing=true;preview.push({id:item.id,name:item.name,change:'No longer in BOM; retained for review'});}const old=(workspace[kind]||[]).find(p=>p.id===item.id);if(!old)preview.push({id:item.id,name:item.name,change:'New record'});else{const fields=(kind==='parts'?['name','number','material','quantity']:['name','number','needed']).filter(k=>old[k]!==item[k]);if(fields.length)preview.push({id:item.id,name:item.name,change:fields.map(k=>k+': '+old[k]+' → '+item[k]).join(', ')});}if(kind==='parts'&&(!item.material||!item.process))preview.push({id:item.id,name:item.name,change:'Missing material or process; requires shop setup'});}
 return {preview,workspace:purchased.workspace,manufactured,purchased,added:manufactured.added+purchased.added,updated:manufactured.updated+purchased.updated,unchanged:manufactured.unchanged+purchased.unchanged,conflicts:[...manufactured.conflicts,...purchased.conflicts],conflictDetails:[...manufactured.conflictDetails,...purchased.conflictDetails],sharedNumbers:manufactured.sharedNumbers};
}

export function mergeOnshapeParts(workspace,incoming,idFactory=()=>crypto.randomUUID()){
 if(!Array.isArray(incoming))throw new Error('Invalid Onshape import response.');
 const sourceKeys=new Map(),numbers=new Map();
 for(const p of incoming){
  if(!p||!['key','number','name','material','cad'].every(k=>typeof p[k]==='string'&&p[k].length<=3000)||!p.number.startsWith(PART_PREFIX)||!p.key||!p.name||!Number.isSafeInteger(p.quantity)||p.quantity<1)throw new Error('Invalid matching part in Onshape response.');
  const link=new URL(p.cad);if(link.protocol!=='https:'||!link.hostname.endsWith('.onshape.com'))throw new Error('Invalid Onshape CAD link.');
  if(sourceKeys.has(p.key)&&JSON.stringify(sourceKeys.get(p.key))!==JSON.stringify(p))throw new Error('Conflicting data for the same Onshape part.');
  sourceKeys.set(p.key,p);
  if(!numbers.has(p.number))numbers.set(p.number,new Set());numbers.get(p.number).add(p.key);
 }
 const parts=workspace.parts.map(p=>({...p}));let added=0,updated=0,unchanged=0;const conflicts=[],conflictDetails=[];
 for(const p of sourceKeys.values()){
  const identityMatches=parts.filter(r=>r.onshape?.key===p.key);
  const sameNumber=parts.filter(r=>r.number.trim()===p.number);
  const manual=sameNumber.filter(r=>!r.onshape);if(identityMatches.length>1||(!identityMatches.length&&manual.length)){conflicts.push(p.number);conflictDetails.push({kind:'parts',part:p,existingIds:(identityMatches.length?identityMatches:manual).map(i=>i.id)});continue;}
  const existing=identityMatches[0];
  if(existing){
   const completed=existing.completedQty??(existing.status==='Done'?existing.quantity:0);
   if(p.quantity<completed){conflicts.push(p.number);conflictDetails.push({kind:'parts',part:p,existingIds:[existing.id],reason:'BOM quantity is below the recorded finished quantity. Correct the finished count first.'});continue;}
   const sourceFields=existing.localOverride?['quantity']:['name','number','material','cad','quantity'];const changed=sourceFields.some(k=>existing[k]!==p[k])||existing.sourceMissing;
   if(changed){const readiness={drawingReviewed:false,materialReady:false,setupReady:false,...existing.readiness};if(['name','number','cad'].some(k=>existing[k]!==p[k]))readiness.drawingReviewed=false;if(['material','quantity'].some(k=>existing[k]!==p[k])){readiness.materialReady=false;readiness.setupReady=false;}const status=existing.status==='Done'&&p.quantity>completed?'Finishing':existing.status;Object.assign(existing,{...Object.fromEntries(sourceFields.map(k=>[k,p[k]])),sourceMissing:false,completedQty:completed,readiness,status});updated++;}else unchanged++;
  }else{parts.push({id:idFactory(),name:p.name,number:p.number,material:p.material,cad:p.cad,onshape:{key:p.key,mode:'bom'},subsystem:'',process:'',quantity:p.quantity,completedQty:0,readiness:{drawingReviewed:false,materialReady:false,setupReady:false},owner:'',assignedTo:'',due:'',priority:'Normal',status:'Not Started',blocked:false,notes:''});added++;}
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
  next={...workspace,[kind]:workspace[kind].map(i=>{if(i.id===existingId)return {...i,onshape:{key:part.key,mode:'bom'}};if(i.onshape?.key===part.key){const copy={...i};delete copy.onshape;return copy;}return i;})};
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

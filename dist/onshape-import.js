// Shared by the browser importer and the server API. No credentials belong here.
export const PART_PREFIX='7028';
const clean=value=>typeof value==='string'?value.trim().slice(0,500):'';
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
  if(!number&&!vendor&&!item.isStandardContent){ignored++;continue;}
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
   const cotsKey=number?JSON.stringify(['bom-cots',source.origin,source.documentId,source.reference,source.referenceId,source.elementId,source.configuration||'',vendor||'Unassigned',number]):key;
   const previous=purchased.get(cotsKey);
   if(previous){previous.quantity+=quantity;if(!Number.isSafeInteger(previous.quantity))throw new Error('COTS quantity is too large.');}
   else purchased.set(cotsKey,{key:cotsKey,number,name,vendor:vendor||'Unassigned',quantity});
  }
 }
 return {parts,cots:[...purchased.values()],ignored};
}

function bomVendor(value,number){
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
 const cots=(workspace.cots||[]).map(i=>({...i}));let added=0,updated=0,unchanged=0;const conflicts=[];
 for(const p of keys.values()){
  const matches=cots.filter(i=>i.onshape?.key===p.key);
  const collisions=p.number?cots.filter(i=>i.number.trim()===p.number&&bomVendor(i.vendor,i.number)===p.vendor&&!i.onshape):[];
  if(matches.length>1||collisions.length){conflicts.push(p.number||p.name);continue;}
  const existing=matches[0];
  if(existing){
   // Supplier corrections and purchasing progress belong to the shop.
   const changed=existing.name!==p.name||existing.number!==p.number||existing.needed!==p.quantity;
   if(changed){Object.assign(existing,{name:p.name,number:p.number,needed:p.quantity});updated++;}else unchanged++;
  }else{cots.push({id:idFactory(),name:p.name,number:p.number,vendor:p.vendor,needed:p.quantity,ordered:0,received:0,url:'',eta:'',reference:'',notes:'',onshape:{key:p.key,mode:'bom'}});added++;}
 }
 return {workspace:{...workspace,cots},added,updated,unchanged,conflicts:[...new Set(conflicts)]};
}

export function mergeOnshapeBom(workspace,data,idFactory){
 const manufactured=mergeOnshapeParts(workspace,data.parts,idFactory);
 const purchased=mergeOnshapeCots(manufactured.workspace,data.cots||[],idFactory);
 return {workspace:purchased.workspace,manufactured,purchased,added:manufactured.added+purchased.added,updated:manufactured.updated+purchased.updated,unchanged:manufactured.unchanged+purchased.unchanged,conflicts:[...manufactured.conflicts,...purchased.conflicts]};
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
 const parts=workspace.parts.map(p=>({...p}));let added=0,updated=0,unchanged=0;const conflicts=[];
 for(const p of sourceKeys.values()){
  if(numbers.get(p.number).size>1){conflicts.push(p.number);continue;}
  const identityMatches=parts.filter(r=>r.onshape?.key===p.key);
  const sameNumber=parts.filter(r=>r.number.trim()===p.number);
  if(identityMatches.length>1||sameNumber.some(r=>r!==identityMatches[0])){conflicts.push(p.number);continue;}
  const existing=identityMatches[0];
  if(existing){const changed=['name','number','material','cad','quantity'].some(k=>existing[k]!==p[k]);if(changed){Object.assign(existing,{name:p.name,number:p.number,material:p.material,cad:p.cad,quantity:p.quantity});updated++;}else unchanged++;}
  else{parts.push({id:idFactory(),name:p.name,number:p.number,material:p.material,cad:p.cad,onshape:{key:p.key,mode:'bom'},subsystem:'',process:'',quantity:p.quantity,owner:'',assignedTo:'',due:'',priority:'Normal',status:'Not started',blocked:false,notes:''});added++;}
 }
 return {workspace:{...workspace,parts},added,updated,unchanged,conflicts:[...new Set(conflicts)]};
}

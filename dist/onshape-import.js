// Shared by the browser importer and the server API. No credentials belong here.
export const PART_PREFIX='7028';
const clean=value=>typeof value==='string'?value.trim().slice(0,500):'';
export function mapOnshapeBom(bom,source){
 if(!bom||bom.type!=='flattened'||!Array.isArray(bom.rows)||!Array.isArray(bom.headers))throw new Error('Onshape returned an unexpected BOM response. A flattened BOM is required.');
 if(bom.rows.length>10000)throw new Error('Onshape BOM contains too many rows.');
 const columns=new Map(bom.headers.map(h=>[h.propertyName,h.id]));
 if(!columns.has('partNumber')||!columns.has('quantity'))throw new Error('Onshape BOM is missing the part number or quantity column.');
 let ignored=0;const parts=[];
 for(const row of bom.rows){
  const cells=row.headerIdToValue||{},item=row.itemSource;
  const number=clean(cells[columns.get('partNumber')]);
  if(!number.startsWith(PART_PREFIX)||!item?.partId||row.excluded===true||cells[columns.get('excludeFromBom')]===true){ignored++;continue;}
  const quantity=Number(cells[columns.get('quantity')]);
  if(!Number.isSafeInteger(quantity)||quantity<1)throw new Error('Onshape BOM has an invalid whole-part quantity for '+number+'.');
  if(!item.documentId||!item.elementId)throw new Error('A matching BOM part is missing its source identity.');
  const key=JSON.stringify(['bom',source.origin,source.documentId,source.reference,source.referenceId,source.elementId,source.configuration||'',item.documentId,item.elementId,item.partId,item.fullConfiguration||item.configuration||'']);
  const cad=clean(item.viewHref)||`${source.origin}/documents/${source.documentId}/${source.reference}/${source.referenceId}/e/${source.elementId}`;
  const material=cells[columns.get('material')];
  parts.push({key,number,name:clean(cells[columns.get('name')])||number,material:clean(typeof material==='string'?material:material?.displayName),cad,quantity});
 }
 return {parts,ignored};
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

// Shared by the browser importer and the server API. No credentials belong here.
export const PART_PREFIX='7028';
const clean=value=>typeof value==='string'?value.trim().slice(0,500):'';
export function mapOnshapeParts(rows,source){
 if(!Array.isArray(rows))throw new Error('Onshape returned an unexpected parts response.');
 if(rows.length>10000)throw new Error('The source contains too many parts. Use a smaller source.');
 let ignored=0;
 const parts=[];
 for(const row of rows){
  const number=clean(row?.partNumber);
  if(!number.startsWith(PART_PREFIX)){ignored++;continue;}
  const partId=clean(row.partId),elementId=clean(row.elementId||source.elementId);
  if(!partId||!elementId)throw new Error('A matching Onshape part is missing its source identity.');
  const configuration=clean(source.configuration||row.configurationId);
  const key=JSON.stringify([source.origin,source.documentId,source.reference,source.referenceId,elementId,partId,configuration]);
  const cad=`${source.origin}/documents/${source.documentId}/${source.reference}/${source.referenceId}/e/${elementId}`+(source.configuration?'?configuration='+encodeURIComponent(source.configuration):'');
  parts.push({key,number,name:clean(row.name)||number,material:clean(row.material?.displayName||row.material?.name),cad});
 }
 return {parts,ignored};
}
export function mergeOnshapeParts(workspace,incoming,idFactory=()=>crypto.randomUUID()){
 if(!Array.isArray(incoming))throw new Error('Invalid Onshape import response.');
 const sourceKeys=new Map(),numbers=new Map();
 for(const p of incoming){
  if(!p||!['key','number','name','material','cad'].every(k=>typeof p[k]==='string'&&p[k].length<=3000)||!p.number.startsWith(PART_PREFIX)||!p.key||!p.name)throw new Error('Invalid matching part in Onshape response.');
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
  if(existing){const changed=['name','number','material','cad'].some(k=>existing[k]!==p[k]);if(changed){Object.assign(existing,{name:p.name,number:p.number,material:p.material,cad:p.cad});updated++;}else unchanged++;}
  else{parts.push({id:idFactory(),name:p.name,number:p.number,material:p.material,cad:p.cad,onshape:{key:p.key},subsystem:'',process:'',quantity:1,owner:'',assignedTo:'',due:'',priority:'Normal',status:'Not started',notes:''});added++;}
 }
 return {workspace:{...workspace,parts},added,updated,unchanged,conflicts:[...new Set(conflicts)]};
}

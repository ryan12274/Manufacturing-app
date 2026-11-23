import test from 'node:test';
import assert from 'node:assert/strict';
import {instanceSuffix,mergeOnshapeParts,mergeOnshapeBom,resolveBomConflict} from '../dist/onshape-import.js';
import {makeDemo,normalizeAssignments,validWorkspace} from '../dist/model.js';
import {workspaceApi} from '../worker/workspace-api.js';
import {localDatabase} from '../scripts/local-database.mjs';

const source=(quantity=3)=>({key:'cad-instance-test',number:'7028-26-2-1001',name:'Rear Rail',material:'6061 aluminum',cad:'https://cad.onshape.com/documents/part',quantity});
const empty=()=>normalizeAssignments({version:1,parts:[],cots:[],materials:[],students:[]});
const ids=()=>{let n=0;return ()=>`instance-${++n}`;};
const legacy=(changes={})=>normalizeAssignments({...empty(),parts:[{...makeDemo().parts[0],id:'old-batch',name:'Rear Rail',number:source().number,cad:source().cad,quantity:3,completedQty:1,status:'Finishing',owner:'Former Student',assignedTo:'',onshape:{key:source().key,mode:'bom'},...changes}]}).parts[0];

test('manufactured quantity creates distinct single-unit records with suffixes on names only',()=>{
 const before=empty(),r=mergeOnshapeParts(before,[source()],ids());
 assert.equal(r.added,3);assert.deepEqual(r.workspace.parts.map(p=>p.name),['Rear Rail (A)','Rear Rail (B)','Rear Rail (C)']);
 assert.ok(r.workspace.parts.every(p=>p.quantity===1&&p.number===source().number&&p.completedQty===0));
 assert.deepEqual(r.workspace.parts.map(p=>p.onshape.instance),[1,2,3]);assert.equal(new Set(r.workspace.parts.map(p=>p.id)).size,3);
 assert.ok(validWorkspace(r.workspace));assert.equal(before.parts.length,0);assert.deepEqual(r.sharedNumbers,[]);
});
test('suffixes continue beyond Z and a lone part acquires A only when demand increases',()=>{
 assert.deepEqual([1,26,27,28,52,53,702,703].map(instanceSuffix),['(A)','(Z)','(AA)','(AB)','(AZ)','(BA)','(ZZ)','(AAA)']);
 assert.throws(()=>instanceSuffix(0));assert.throws(()=>instanceSuffix(1.5));
 const single=mergeOnshapeParts(empty(),[source(1)],ids());assert.equal(single.workspace.parts[0].name,'Rear Rail');
 const multiple=mergeOnshapeParts(single.workspace,[source(28)]);assert.equal(multiple.workspace.parts[0].id,single.workspace.parts[0].id);assert.equal(multiple.workspace.parts[0].name,'Rear Rail (A)');assert.equal(multiple.workspace.parts[26].name,'Rear Rail (AA)');assert.equal(multiple.workspace.parts[27].name,'Rear Rail (AB)');
 const reduced=mergeOnshapeParts(multiple.workspace,[source(1)]);assert.equal(reduced.workspace.parts[0].name,'Rear Rail (A)');assert.ok(validWorkspace(reduced.workspace));
});
test('repeat, decrease and increase reuse instance IDs, stages and independent assignments',()=>{
 const first=mergeOnshapeParts(empty(),[source()],ids()).workspace;
 Object.assign(first.parts[1],{owner:'Alex',assignedTo:'Alex',notes:'Keep B',status:'Done',completedQty:1});
 const unchanged=mergeOnshapeParts(first,[source()]);assert.equal(unchanged.added,0);assert.equal(unchanged.unchanged,3);
 const decreased=mergeOnshapeBom(first,{parts:[source(1)],cots:[]});assert.equal(decreased.workspace.parts.length,3);assert.equal(decreased.workspace.parts[1].sourceMissing,true);assert.equal(decreased.workspace.parts[1].completedQty,1);assert.ok(decreased.preview.some(p=>p.id===first.parts[1].id&&/No longer/.test(p.change)));
 const restored=mergeOnshapeParts(decreased.workspace,[source(4)]);assert.equal(restored.added,1);assert.equal(restored.workspace.parts[1].id,first.parts[1].id);assert.equal(restored.workspace.parts[1].sourceMissing,false);for(const k of ['owner','assignedTo','notes','status','completedQty'])assert.equal(restored.workspace.parts[1][k],first.parts[1][k]);assert.equal(restored.workspace.parts[3].name,'Rear Rail (D)');
 assert.equal(first.parts[1].sourceMissing,undefined);assert.ok(validWorkspace(restored.workspace));
});
test('legacy batch splits preserve its ID, completed totals, spare/rework/scrap totals and workflow',()=>{
 const batch=legacy({quantity:4,completedQty:3,spareTarget:2,reworkQty:2,scrapQty:7,notes:'Batch instructions',history:[{at:'2026-11-23T15:00:00Z',worker:'Manager',label:'Machined 3 pieces'}]});
 const before={...empty(),parts:[batch]},snapshot=structuredClone(before);
 const r=mergeOnshapeParts(before,[source(4)],ids());assert.equal(r.added,3);assert.equal(r.updated,1);assert.equal(r.workspace.parts[0].id,batch.id);
 for(const key of ['completedQty','spareTarget','reworkQty','scrapQty'])assert.equal(r.workspace.parts.reduce((n,p)=>n+(p[key]||0),0),batch[key]);
 for(const p of r.workspace.parts){assert.equal(p.quantity,1);assert.equal(p.status,batch.status);assert.equal(p.owner,batch.owner);assert.equal(p.notes,batch.notes);assert.deepEqual(p.history,batch.history);assert.equal(p.onshape.splitFrom,batch.id);}
 assert.ok(validWorkspace(r.workspace));assert.deepEqual(before,snapshot);const repeat=mergeOnshapeParts(r.workspace,[source(4)]);assert.equal(repeat.added,0);assert.equal(repeat.unchanged,4);
 const allSpare=legacy({quantity:3,spareTarget:2,completedQty:5,reworkQty:0});const extra=mergeOnshapeParts({...empty(),parts:[allSpare]},[source(3)],ids());assert.equal(extra.workspace.parts.reduce((n,p)=>n+p.completedQty,0),5);assert.ok(validWorkspace(extra.workspace));
});
test('source changes invalidate actual readiness but quantity growth and suffix changes do not',()=>{
 const batch=legacy({quantity:1,completedQty:1,status:'Done',readiness:{drawingReviewed:true,materialReady:true,setupReady:true}});
 const grown=mergeOnshapeParts({...empty(),parts:[batch]},[source(2)],ids());assert.equal(grown.workspace.parts[0].status,'Done');assert.deepEqual(grown.workspace.parts[0].readiness,batch.readiness);assert.deepEqual(grown.workspace.parts[1].readiness,{drawingReviewed:false,materialReady:false,setupReady:false});
 const renamed=mergeOnshapeParts(grown.workspace,[{...source(2),name:'Updated rail',material:'Steel'}]);assert.ok(renamed.workspace.parts.every(p=>!p.readiness.drawingReviewed&&!p.readiness.materialReady&&!p.readiness.setupReady));assert.equal(renamed.workspace.parts[0].name,'Updated rail (A)');
 const overridden=structuredClone(grown.workspace);Object.assign(overridden.parts[0],{localOverride:true,name:'Custom rail (A)',material:'Delrin'});const local=mergeOnshapeParts(overridden,[{...source(2),name:'Source renamed',material:'Steel'}]);assert.equal(local.workspace.parts[0].name,'Custom rail (A)');assert.equal(local.workspace.parts[0].material,'Delrin');assert.deepEqual(local.workspace.parts[0].readiness,batch.readiness);
});
test('COTS stays aggregated and missing manufactured sources flag every instance',()=>{
 const data={parts:[source()],cots:[{key:'cots-key',number:'WCP-1',name:'Bearing',vendor:'WCP',quantity:8}]};
 const r=mergeOnshapeBom(empty(),data,ids());assert.equal(r.workspace.parts.length,3);assert.equal(r.workspace.cots.length,1);assert.equal(r.workspace.cots[0].needed,8);assert.equal(r.workspace.cots[0].name,'Bearing');assert.equal(r.workspace.cots[0].number,'WCP-1');
 const gone=mergeOnshapeBom(r.workspace,{parts:[],cots:data.cots});assert.ok(gone.workspace.parts.every(p=>p.sourceMissing));assert.equal(gone.preview.filter(p=>/No longer/.test(p.change)).length,3);
});
test('duplicate instance resolution preserves the other instances of that CAD source',()=>{
 const w=mergeOnshapeParts(empty(),[source()],ids()).workspace;w.parts.push({...w.parts[1],id:'duplicate-b'});
 const conflict=mergeOnshapeParts(w,[source()]).conflictDetails[0];assert.ok(conflict);
 const fixed=resolveBomConflict(w,conflict,w.parts[1].id);
 assert.equal(fixed.parts.filter(p=>p.onshape?.key===source().key).length,3);assert.equal(fixed.parts.find(p=>p.id==='instance-1').onshape.instance,1);assert.equal(fixed.parts.find(p=>p.id==='instance-3').onshape.instance,3);assert.equal(fixed.parts.find(p=>p.id==='duplicate-b').onshape,undefined);assert.equal(mergeOnshapeParts(fixed,[source()]).added,0);
});
test('an excessive expanded quantity fails before mutating the workspace',()=>{
 const w=empty(),before=structuredClone(w);let allocated=0;
 assert.throws(()=>mergeOnshapeParts(w,[source(10001)],()=>String(++allocated)),/10,000/);assert.equal(allocated,0);assert.deepEqual(w,before);
 assert.throws(()=>mergeOnshapeParts(w,[source(6000),{...source(5000),key:'other'}]),/10,000/);
});

function request(body,admin=true){return new Request('https://test.local/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json','oai-authenticated-user-id':admin?'admin':'member','oai-authenticated-user-email':admin?'admin@test':'member@test'},body:JSON.stringify(body)});}
test('server saves an admin batch split with prior completed work and inactive students, without new approvals',async()=>{
 const env={DB:localDatabase(),ADMIN_EMAILS:'admin@test'},initial={...empty(),parts:[legacy({completedQty:3,status:'Done',readiness:{drawingReviewed:false,materialReady:false,setupReady:false}})]};
 let response=await workspaceApi(request({workspace:initial,baseRevision:0,action:'restore'}),env);assert.equal(response.status,200);const saved=await response.json();
 const next=mergeOnshapeParts(saved.workspace,[source()],ids()).workspace;
 response=await workspaceApi(request({workspace:next,baseRevision:1},false),env);assert.equal(response.status,403);
 response=await workspaceApi(request({workspace:next,baseRevision:1}),env);assert.equal(response.status,200);const d=await response.json();assert.equal(d.workspace.parts.length,3);assert.ok(d.workspace.parts.every(p=>p.status==='Done'&&p.completedQty===1&&!p.approval));assert.equal(d.workspace.parts.reduce((n,p)=>n+p.completedQty,0),3);
});
test('the migration exemption cannot fabricate completion or advance a stage',async()=>{
 for(const change of [p=>p.completedQty=1,p=>p.status='Done']){
  const env={DB:localDatabase(),ADMIN_EMAILS:'admin@test'},initial={...empty(),parts:[legacy({completedQty:0,status:'Cutting',readiness:{drawingReviewed:false,materialReady:false,setupReady:false}})]};
  const response=await workspaceApi(request({workspace:initial,baseRevision:0,action:'restore'}),env),saved=await response.json();
  const next=mergeOnshapeParts(saved.workspace,[source()],ids()).workspace;change(next.parts[1]);const rejected=await workspaceApi(request({workspace:next,baseRevision:1}),env);assert.equal(rejected.status,400);
 }
});

test('server preserves an in-progress batch’s readiness exception when splitting its units',async()=>{
 const env={DB:localDatabase(),ADMIN_EMAILS:'admin@test'},initial={...empty(),parts:[legacy({completedQty:1,status:'Cutting',blocked:true,blockReason:'Legacy material issue',readiness:{drawingReviewed:false,materialReady:false,setupReady:false}})]};
 const boot=await workspaceApi(request({workspace:initial,baseRevision:0,action:'restore'}),env);assert.equal(boot.status,200);const saved=await boot.json();
 const split=mergeOnshapeParts(saved.workspace,[source()],ids()).workspace;
 const response=await workspaceApi(request({workspace:split,baseRevision:1}),env);assert.equal(response.status,200);const d=await response.json();assert.ok(d.workspace.parts.every(p=>p.status==='Cutting'&&p.blocked&&!p.readiness.drawingReviewed));assert.equal(d.workspace.parts.reduce((n,p)=>n+p.completedQty,0),1);
});

test('an individual instance with incompatible batch counts is held for correction',()=>{
 const w=mergeOnshapeParts(empty(),[source(2)],ids()).workspace;Object.assign(w.parts[0],{quantity:4,completedQty:3});
 const before=structuredClone(w),r=mergeOnshapeParts(w,[source(2)]);assert.deepEqual(r.conflicts,[source().number]);assert.match(r.conflictDetails[0].reason,/batch-level production counts/);assert.deepEqual(r.workspace.parts,w.parts);assert.deepEqual(w,before);
});

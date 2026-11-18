import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanWorkspace,emptyWorkspace} from '../dist/workspace-cleanup.js';
import {makeDemo,validWorkspace} from '../dist/model.js';
import {overdueDays,readinessException,productionSummary} from '../dist/manufacturing.js';
import {cotsEmptyState} from '../dist/cots.js';
import {COTS_STATUSES,cotsStatus} from '../dist/cots-model.js';
import {shopBoard} from '../dist/shop.js';
import {partsRegister} from '../dist/register.js';
test('overdue dates use whole calendar days and exclude finished and due-today work',()=>{
 const p={due:'2026-11-14',status:'Preparing'};assert.equal(overdueDays(p,'2026-11-18'),4);assert.equal(overdueDays({...p,due:'2026-11-17'},'2026-11-18'),1);
 for(const delta of [{due:''},{due:'2026-11-18'},{due:'2026-11-19'},{status:'Finished'}])assert.equal(overdueDays({...p,...delta},'2026-11-18'),0);
 assert.equal(overdueDays({...p,due:'2026-03-07'},'2026-03-09'),2);
});
test('legacy active readiness exceptions are separate from the queue ready to start cutting',()=>{
 const p=makeDemo().parts[0];assert.ok(readinessException({...p,status:'Cutting'}));assert.ok(readinessException({...p,status:'Finishing'}));
 assert.equal(readinessException({...p,status:'Preparing'}),false);
 const checked={...p,readiness:{drawingReviewed:true,materialReady:true,setupReady:true}};
 assert.equal(readinessException({...checked,status:'Cutting',blocked:true}),false);
 const summary=productionSummary([{...p,status:'Cutting'},{...checked,status:'Preparing'}]);assert.equal(summary.exceptions,1);assert.equal(summary.ready,1);
 const board=shopBoard([{...p,status:'Cutting',due:'2000-01-01'}],d=>d);assert.match(board,/Readiness exception/);assert.match(board,/Overdue by/);assert.match(board,/Work is in progress/);
 assert.match(partsRegister([{...p,status:'Cutting',due:'2000-01-01'}]),/due-overdue/);
});
test('cleanup removes only seeded examples and exact test signatures, preserving real work and order counts',()=>{
 const w=makeDemo();const real={...w.parts[0],id:'real',name:'Shooter Plate Left',subsystem:'sadf',owner:'Riley',completedQty:1};
 w.parts.push(real,{...real,id:'27741b1a-4d38-40f0-8b7b-f582070a21c2',name:'qwdaf',number:'sdf',subsystem:'sadf'},{...real,id:'bad22d44-8802-48e1-a634-342b763cff31',name:'nnn',number:''});
 const purchased={id:'order',name:'Motor',number:'WCP-0940',vendor:'WCP',url:'',needed:4,ordered:3,received:1,eta:'',reference:'PO-1',notes:''};w.cots=[purchased];const before=structuredClone(w),r=cleanWorkspace(w);
 assert.equal(r.removedParts,10);assert.equal(r.removedMaterials,4);assert.equal(r.workspace.parts.length,1);assert.equal(r.workspace.parts[0].owner,'Riley');assert.equal(r.workspace.parts[0].completedQty,1);assert.equal(r.workspace.parts[0].subsystem,'');assert.deepEqual(r.workspace.cots,[purchased]);assert.equal(r.workspace.demo,false);assert.ok(validWorkspace(r.workspace));assert.deepEqual(w,before);assert.equal(cleanWorkspace(r.workspace).changed,false);
});
test('edited test IDs and imported CAD records are never removed just for a matching name',()=>{
 const w=emptyWorkspace(),p=makeDemo().parts[0];w.parts=[{...p,id:'bad22d44-8802-48e1-a634-342b763cff31',name:'Real mount'},{...p,id:'demo-part-3',onshape:{key:'actual-cad'}}];assert.equal(cleanWorkspace(w).workspace.parts.length,2);assert.ok(validWorkspace(emptyWorkspace()));assert.deepEqual(emptyWorkspace().parts,[]);
});
test('COTS statuses are distinct and filtered-empty text never claims saved records are absent',()=>{
 const item={needed:4,ordered:0,received:0};const states=[cotsStatus(item),cotsStatus({...item,ordered:2}),cotsStatus({...item,ordered:4}),cotsStatus({...item,ordered:4,received:2}),cotsStatus({...item,ordered:4,received:4})];assert.deepEqual(states,COTS_STATUSES);assert.equal(new Set(states).size,5);
 assert.match(cotsEmptyState(96),/No matching COTS parts/);assert.match(cotsEmptyState(96),/data-clear-filters/);assert.match(cotsEmptyState(0),/No purchased parts yet/);assert.doesNotMatch(cotsEmptyState(0),/data-clear-filters/);
});

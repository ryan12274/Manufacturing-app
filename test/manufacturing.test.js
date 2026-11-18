import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDemo,normalizeAssignments,validWorkspace} from '../dist/model.js';
import {readinessIssues,transitionPart,recordCompletion,productionSummary,logPartChange} from '../dist/manufacturing.js';
const ready=()=>({...makeDemo().parts[0],status:'Preparing',completedQty:0,readiness:{drawingReviewed:true,materialReady:true,setupReady:true}});
test('readiness gates cutting even with an assigned worker; preparing stays available',()=>{
 const p={...ready(),owner:'',assignedTo:'Jordan',readiness:{drawingReviewed:false,materialReady:false,setupReady:false}};
 assert.equal(readinessIssues(p).length,3);assert.throws(()=>transitionPart(p,'Cutting'),/Not ready/);
 assert.equal(transitionPart({...p,status:'Not started'},'Preparing').status,'Preparing');
 assert.equal(transitionPart(ready(),'Cutting').status,'Cutting');
 for(const delta of [{material:''},{process:''},{number:''},{blocked:true}])assert.throws(()=>transitionPart({...ready(),...delta},'Cutting'),/Not ready/);
});
test('partial batch completion is counted by pieces and finishing the remainder is explicit',()=>{
 let p=transitionPart(ready(),'Finishing');p=recordCompletion(p,1);assert.equal(p.completedQty,1);assert.equal(p.status,'Finishing');
 const before=structuredClone(p),summary=productionSummary([p,{...ready(),id:'second',quantity:8}]);assert.equal(summary.total,10);assert.equal(summary.finished,1);assert.equal(summary.percent,10);
 p=transitionPart(p,'Finished');assert.equal(p.completedQty,p.quantity);assert.equal(p.status,'Finished');assert.equal(before.status,'Finishing');
 assert.equal(transitionPart(p,'Preparing').completedQty,0);
});
test('invalid completion counts and blocked completion are rejected without changing the record',()=>{
 const p={...ready(),status:'Finishing'};for(const n of [-1,3,1.5,NaN])assert.throws(()=>recordCompletion(p,n));
 assert.throws(()=>recordCompletion({...p,blocked:true},1));assert.throws(()=>recordCompletion({...p,status:'Not started'},1));assert.equal(p.completedQty,0);
});
test('legacy finished batches migrate, readiness and progress validate, activity stays bounded',()=>{
 const w=makeDemo();delete w.parts[0].completedQty;w.parts[0].status='Finished';const migrated=normalizeAssignments(w);assert.equal(migrated.parts[0].completedQty,migrated.parts[0].quantity);
 for(const delta of [{completedQty:99},{completedQty:-1},{readiness:{drawingReviewed:'yes'}},{history:[{at:'bad',label:'Cutting',worker:'Alex'}]}])assert.equal(validWorkspace({...w,parts:[{...ready(),...delta}]}),false);
 let p=ready();for(let n=0;n<60;n++)p=logPartChange(p,{},'Update '+n);assert.equal(p.history.length,50);assert.equal(p.history[0].label,'Update 10');assert.ok(validWorkspace({...w,parts:[p]}));
});

export const READINESS_CHECKS=[['drawingReviewed','Drawing / dimensions reviewed'],['materialReady','Material available'],['setupReady','Tools and setup ready']];
export const completedQuantity=p=>p.completedQty??(p.status==='Finished'?p.quantity:0);
export function readinessIssues(p){
 const issues=[];
 if(p.blocked)issues.push('Remove the blocked tag after resolving the issue.');
 if(!p.number?.trim())issues.push('Add a part number.');
 if(!p.material?.trim())issues.push('Set the material.');
 if(!p.process?.trim())issues.push('Set the manufacturing process.');
 for(const [key,label] of READINESS_CHECKS)if(p.readiness?.[key]!==true)issues.push(label+'.');
 return issues;
}
export function logPartChange(part,patch,label,now=new Date().toISOString()){
 return {...part,...patch,updatedAt:now,history:[...(part.history||[]),{at:now,label,worker:patch.owner??part.owner??''}].slice(-50)};
}
export function transitionPart(part,status,now){
 if(!['Not started','Preparing','Cutting','Finishing','Finished'].includes(status))throw Error('Choose a valid stage.');
 if(status===part.status)return part;
 if(['Cutting','Finishing','Finished'].includes(status)){
  const issues=readinessIssues(part);if(issues.length)throw Error('Not ready: '+issues.join(' '));
  if(!(part.owner||part.assignedTo)?.trim())throw Error('Choose who is working on this part.');
 }
 const patch={status};
 if(status==='Finished')patch.completedQty=part.quantity;
 // Reopening a finished batch explicitly starts a new run of that job.
 if(part.status==='Finished'&&status!=='Finished')patch.completedQty=0;
 return logPartChange(part,patch,status==='Finished'?'Batch finished':status,now);
}
export function recordCompletion(part,quantity,now){
 if(part.status!=='Finishing')throw Error('Move this batch to Finishing before recording finished pieces.');
 if(part.blocked)throw Error('Resolve the blocked tag before recording finished pieces.');
 if(readinessIssues(part).length)throw Error('Complete readiness checks before recording finished pieces.');
 if(!Number.isSafeInteger(quantity)||quantity<0||quantity>part.quantity)throw Error('Finished quantity must be between 0 and the batch quantity.');
 return logPartChange(part,{completedQty:quantity},quantity+' of '+part.quantity+' pieces finished',now);
}
export function productionSummary(parts){
 const total=parts.reduce((n,p)=>n+p.quantity,0),finished=parts.reduce((n,p)=>n+completedQuantity(p),0);
 return {total,finished,percent:total?Math.round(finished/total*100):0,active:parts.filter(p=>['Preparing','Cutting','Finishing'].includes(p.status)).length,blocked:parts.filter(p=>p.blocked&&p.status!=='Finished').length,ready:parts.filter(p=>['Not started','Preparing'].includes(p.status)&&!readinessIssues(p).length).length,jobsFinished:parts.filter(p=>p.status==='Finished').length};
}

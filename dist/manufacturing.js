import {demand} from './operations.js';
export const READINESS_CHECKS=[['drawingReviewed','Drawing / dimensions reviewed'],['materialReady','Material available'],['setupReady','Tools and setup ready']];
export const completedQuantity=p=>p.completedQty??(p.status==='Done'?p.quantity:0);
export function localDateKey(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function overdueDays(part,today=localDateKey()){
 if(part.status==='Done'||!part.due||part.due>=today)return 0;
 return Math.max(0,Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(part.due+'T00:00:00Z'))/86400000))||0;
}
export const readinessException=p=>['Cutting','Finishing'].includes(p.status)&&readinessIssues({...p,blocked:false}).length>0;
export const readyToStartCutting=p=>['Not Started'].includes(p.status)&&readinessIssues(p).length===0;
export function readinessIssues(p){
 const issues=[];
 if(p.blocked)issues.push('Remove the blocked tag after resolving the issue.');
 if(!p.number?.trim())issues.push('Add a part number.');
 if(!p.material?.trim())issues.push('Set the material.');
 if(!p.process?.trim())issues.push('Set the manufacturing process.');
 for(const [key,label] of READINESS_CHECKS)if(p.readiness?.[key]!==true)issues.push((key==='materialReady'?'Material availability not confirmed':key==='drawingReviewed'?'Drawing / dimensions not reviewed':/print/i.test(p.process)?'Print orientation, slicing and printer setup not ready':/lathe/i.test(p.process)?'Workholding, tooling and lathe setup not ready':/cnc|router|mill/i.test(p.process)?'Workholding, tooling and toolpath setup not ready':'Tools and setup not ready')+'.');
 return issues;
}
export function logPartChange(part,patch,label,now=new Date().toISOString()){
 return {...part,...patch,updatedAt:now,history:[...(part.history||[]),{at:now,label,worker:patch.owner??part.owner??''}].slice(-50)};
}
export function transitionPart(part,status,now){
 if(!['Not Started','Cutting','Finishing','Done'].includes(status))throw Error('Choose a valid stage.');
 if(status===part.status)return part;
 if(['Cutting','Finishing','Done'].includes(status)){
  const issues=readinessIssues(part);if(issues.length)throw Error('Not ready: '+issues.join(' '));
  if(!(part.owner||part.assignedTo)?.trim())throw Error('Choose who is working on this part.');
 }
 const patch={status};
 if(status==='Done'&&completedQuantity(part)<demand(part)&&!part.shortCloseReason)throw Error('Record all good pieces before finishing, or ask an admin to short-close with a reason.');
 // Reopening a finished batch explicitly starts a new run of that job.
 // Reopening preserves previously completed pieces.
 return logPartChange(part,patch,status==='Done'?'Batch finished':status,now);
}
export function recordCompletion(part,quantity,now){
 if(part.status!=='Finishing')throw Error('Move this batch to Finishing before recording finished pieces.');
 if(part.blocked)throw Error('Resolve the blocked tag before recording finished pieces.');
 if(readinessIssues(part).length)throw Error('Complete readiness checks before recording finished pieces.');
 if(!Number.isSafeInteger(quantity)||quantity<0||quantity>demand(part))throw Error('Done quantity must be between 0 and required quantity plus the explicit spare target.');
 return logPartChange(part,{completedQty:quantity},quantity+' of '+part.quantity+' pieces finished',now);
}
export function productionSummary(parts){
 const required=parts.reduce((n,p)=>n+p.quantity,0),spares=parts.reduce((n,p)=>n+(p.spareTarget||0),0),total=required+spares,finished=parts.reduce((n,p)=>n+completedQuantity(p),0);
 return {total,required,spares,finished,percent:total?Math.round(finished/total*100):0,active:parts.filter(p=>['Cutting','Finishing'].includes(p.status)).length,blocked:parts.filter(p=>p.blocked&&p.status!=='Done').length,ready:parts.filter(readyToStartCutting).length,exceptions:parts.filter(readinessException).length,overdue:parts.filter(p=>overdueDays(p)>0).length,jobsDone:parts.filter(p=>p.status==='Done').length};
}

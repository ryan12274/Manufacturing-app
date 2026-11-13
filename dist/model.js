import {validCots} from './cots-model.js';
export const STATUSES = ['Not started', 'Preparing', 'Cutting', 'Finishing', 'Finished'];
const LEGACY_STATUSES=['Ready','In progress','Blocked','Complete'];
export const STORAGE_KEY = 'frc7028-workshop-v1';
export function normalizeAssignments(workspace) {
  const stages={Ready:'Preparing','In progress':'Cutting',Blocked:'Preparing',Complete:'Finished'};
  return {...workspace,cots:workspace.cots??[],parts:workspace.parts.map(p=>({...p,status:stages[p.status]||p.status,blocked:p.status==='Blocked'||p.blocked===true,assignedTo:p.assignedTo??p.owner}))};
}
export function needsWorkerSelection(part,target){
  return ['Preparing','Cutting','Finishing'].includes(target)&&(part.status==='Not started'||part.status==='Finished'||!part.owner.trim());
}
export function startPart(part, worker='',target='Preparing') {
  if(!['Preparing','Cutting','Finishing'].includes(target))throw new Error('Choose a manufacturing stage to start.');
  const owner=part.assignedTo?.trim()||worker.trim();
  if(!owner) throw new Error('Choose who is starting this part.');
  return {...part,owner,status:target};
}
export function validWorkspace(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.parts) || !Array.isArray(data.materials)) return false;
  if(data.cots!==undefined&&!validCots(data.cots))return false;
  const textFields = (row, fields) => fields.every(field => typeof row[field] === 'string' && row[field].length <= 10000);
  const unique = rows => rows.every(row => row && typeof row === 'object' && (row.blocked===undefined||typeof row.blocked==='boolean') && (row.assignedTo===undefined||typeof row.assignedTo==='string'&&row.assignedTo.length<=500)) && new Set(rows.map(row => row.id)).size === rows.length;
  return unique(data.parts) && unique(data.materials) && data.parts.every(p => p && textFields(p, ['id','name','number','subsystem','owner','material','process','due','priority','status','notes','cad']) && p.id && p.name.trim() && Number.isInteger(p.quantity) && p.quantity > 0 && [...STATUSES,...LEGACY_STATUSES].includes(p.status) && ['Low','Normal','High'].includes(p.priority) && (!p.due || /^\d{4}-\d{2}-\d{2}$/.test(p.due) && !Number.isNaN(Date.parse(p.due)))) && data.materials.every(m => m && textFields(m,['id','name','spec','unit','location']) && m.id && m.name.trim() && Number.isFinite(m.stock) && m.stock >= 0 && Number.isFinite(m.minimum) && m.minimum >= 0);
}
export function csv(rows) {
  return rows.map(row => row.map(value => {
    let s = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
export function makeDemo() {
  const date = offset => { const d = new Date(); d.setDate(d.getDate()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const parts = [
    ['Drive rail, left','7028-DR-001','Drivetrain','Alex','6061 aluminum','CNC router',2,4,'In progress','High'],
    ['Intake side plate','7028-IN-014','Intake','Morgan','Polycarbonate','CNC router',4,5,'Ready','Normal'],
    ['Elevator bearing block','7028-EL-006','Elevator','Sam','6061 aluminum','Mill',8,2,'Blocked','High'],
    ['Roller end cap','7028-IN-018','Intake','Jordan','PETG','3D print',6,6,'In progress','Normal'],
    ['Bumper mount bracket','7028-DR-023','Drivetrain','Alex','6061 aluminum','Bandsaw + drill',4,7,'Not started','Normal'],
    ['Electronics tray','7028-EL-011','Electrical','Riley','Polycarbonate','CNC router',1,-1,'Complete','Normal'],
    ['Shaft spacer','7028-EL-009','Elevator','Sam','Delrin','Lathe',12,3,'Ready','Low'],
    ['Sensor mount','7028-IN-021','Intake','Jordan','PETG','3D print',2,8,'Not started','Low']
  ].map(([name,number,subsystem,owner,material,process,quantity,due,status,priority],i)=>({id:`demo-part-${i}`,name,number,subsystem,owner:['Ready','Not started'].includes(status)&&i!==4?'':owner,assignedTo:i===4?owner:'',material,process,quantity,due:date(due),status,priority,notes:status==='Blocked'?'Waiting for material. Confirm stock before machining.':'',cad:''}));
  const workspace=normalizeAssignments({version:1,demo:true,parts,materials:[{id:'demo-stock-1',name:'6061 aluminum plate',spec:'0.125 in × 24 in × 24 in',unit:'sheets',stock:3,minimum:2,location:'Stock rack A'},{id:'demo-stock-2',name:'Polycarbonate sheet',spec:'0.125 in × 24 in × 48 in',unit:'sheets',stock:1,minimum:2,location:'Stock rack B'},{id:'demo-stock-3',name:'PETG filament',spec:'1.75 mm',unit:'spools',stock:5,minimum:2,location:'Printer cabinet'},{id:'demo-stock-4',name:'Delrin round stock',spec:'1 in diameter',unit:'inches',stock:18,minimum:12,location:'Stock rack C'}]});
  workspace.parts[3].status='Finishing';
  return workspace;
}

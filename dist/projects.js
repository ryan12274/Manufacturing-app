export const DEFAULT_PROJECT='robot-1';
export function normalizeProjects(w){
 const projectYear=new Date().getFullYear();
 const projects=(w.projects?.length?w.projects:[{id:DEFAULT_PROJECT,name:'Robot 1',archived:false},{id:'robot-2',name:'Robot 2',archived:false},{id:'robot-cart',name:'Robot Cart',archived:false}]).map(p=>({...p,year:p.year??projectYear}));
 const fallback=projects.find(p=>!p.archived)?.id||projects[0].id;
 const students=w.students??[...new Set((w.parts||[]).filter(p=>!/^demo-part-/.test(p.id)&&p.number?.startsWith('7028')).flatMap(p=>[p.owner,p.assignedTo]).filter(n=>typeof n==='string'&&n.trim()).map(n=>n.trim()))].sort().map((name,n)=>({id:'student-'+n,name,active:true}));
 return {...w,students,projects,onshapeProjectId:w.onshapeProjectId===undefined?fallback:w.onshapeProjectId,...Object.fromEntries(['parts','cots','materials'].map(k=>[k,(w[k]||[]).map(r=>({...r,projectId:r.projectId||fallback}))]))};
}
export function validProjects(w){
 const unique=(rows,key)=>new Set(rows.map(key)).size===rows.length;
 if(w.students!==undefined){
  if(!Array.isArray(w.students)||w.students.length>500||!w.students.every(s=>s&&typeof s.id==='string'&&s.id&&typeof s.name==='string'&&s.name.trim()&&s.name.length<=100&&typeof s.active==='boolean'&&(s.email===undefined||typeof s.email==='string'&&s.email.length<=254&&(!s.email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)))))return false;
  if(!unique(w.students,s=>s.id)||!unique(w.students,s=>s.name.trim().toLowerCase())||!unique(w.students.filter(s=>s.email),s=>s.email.toLowerCase()))return false;
 }
 if(w.projects===undefined)return true;
 if(!Array.isArray(w.projects)||!w.projects.length||w.projects.length>100||!w.projects.every(p=>p&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=100&&typeof p.name==='string'&&p.name.trim()&&p.name.length<=100&&typeof p.archived==='boolean'&&(p.year===undefined||Number.isInteger(p.year)&&p.year>=2000&&p.year<=2100)))return false;
 return unique(w.projects,p=>p.id)&&unique(w.projects,p=>p.name.trim().toLowerCase())&&w.projects.some(p=>!p.archived)&&['parts','materials','cots'].every(k=>(w[k]||[]).every(r=>r&&(r.projectId===undefined||typeof r.projectId==='string'&&w.projects.some(p=>p.id===r.projectId))))&&(!w.onshapeProjectId||w.projects.some(p=>p.id===w.onshapeProjectId&&!p.archived));
}

export const projectScope=(w,id)=>({...w,...Object.fromEntries(['parts','materials','cots'].map(k=>[k,(w[k]||[]).filter(r=>r.projectId===id)]))});
export function mergeProject(w,scope,id){if(!w.projects.some(p=>p.id===id&&!p.archived))throw Error('Choose an active project.');return {...w,importState:scope.importState||w.importState,...(scope.subsystemRules?{subsystemRules:{...w.subsystemRules,[id]:scope.subsystemRules[id]||{}}}:{}),...Object.fromEntries(['parts','materials','cots'].map(k=>[k,[...(w[k]||[]).filter(r=>r.projectId!==id),...(scope[k]||[]).map(r=>({...r,projectId:id}))]]))};}

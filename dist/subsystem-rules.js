export function parseTeamPartNumber(number){
 const match=String(number||'').trim().match(/^7028-(\d{2})-(\d+)-(\d)(\d{3})$/);
 return match?{team:'7028',year:Number('20'+match[1]),robot:match[2],subsystemCode:match[3],part:match[4]}:null;
}
export function validSubsystemRules(workspace){
 const rules=workspace.subsystemRules;
 if(rules===undefined)return true;
 if(!rules||typeof rules!=='object'||Array.isArray(rules)||Object.keys(rules).length>100)return false;
 return Object.entries(rules).every(([projectId,map])=>workspace.projects?.some(p=>p.id===projectId)&&map&&typeof map==='object'&&!Array.isArray(map)&&Object.keys(map).length<=10&&Object.entries(map).every(([code,name])=>/^\d$/.test(code)&&typeof name==='string'&&!!name.trim()&&name.length<=100));
}
export function applyImportSubsystems(workspace,keys,projectId,rules){
 if(!projectId||!rules||!Object.keys(rules).length)return workspace;
 const selected=new Set(keys);
 return {...workspace,parts:workspace.parts.map(p=>{
  if(p.revisionArchived||!selected.has(p.onshape?.key))return p;
  const parsed=parseTeamPartNumber(p.number),subsystem=parsed&&rules[parsed.subsystemCode];
  return subsystem?{...p,subsystem}:p;
 })};
}

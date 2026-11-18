// Exact test signatures keep this migration from deleting real work by name.
const testRecords=new Map([
 ['27741b1a-4d38-40f0-8b7b-f582070a21c2',{name:'qwdaf',number:'sdf',subsystem:'sadf'}],
 ['bad22d44-8802-48e1-a634-342b763cff31',{name:'nnn',number:''}]
]);
export function cleanWorkspace(workspace){
 let removedParts=0,removedMaterials=0,clearedSubsystems=0;
 const parts=workspace.parts.filter(p=>{
  const signature=testRecords.get(p.id);
  const remove=!p.onshape&&(/^demo-part-\d+$/.test(p.id)||signature&&Object.entries(signature).every(([key,value])=>p[key]===value));
  if(remove)removedParts++;return !remove;
 }).map(p=>{if(p.subsystem.trim().toLowerCase()==='sadf'){clearedSubsystems++;return {...p,subsystem:''};}return p;});
 const materials=workspace.materials.filter(m=>{const remove=/^demo-stock-\d+$/.test(m.id);if(remove)removedMaterials++;return !remove;});
 const changed=removedParts>0||removedMaterials>0||clearedSubsystems>0||workspace.demo===true;
 return {workspace:changed?{...workspace,demo:false,parts,materials}:workspace,changed,removedParts,removedMaterials,clearedSubsystems};
}
export const emptyWorkspace=()=>({version:1,demo:false,parts:[],materials:[],cots:[]});

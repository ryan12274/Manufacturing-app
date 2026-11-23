import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartRevision,validPartRevisions} from '../dist/part-revisions.js';
import {parseTeamPartNumber,validSubsystemRules} from '../dist/subsystem-rules.js';
import {mergeOnshapeBom,selectedBom} from '../dist/onshape-import.js';
import {normalizeAssignments,validWorkspace,makeDemo} from '../dist/model.js';
import {projectScope,mergeProject} from '../dist/projects.js';
import {readOnshapeParts} from '../worker/onshape-api.js';
import {workspaceApi} from '../worker/workspace-api.js';
import {createNetlifyApi} from '../server/netlify-api.js';
import {localDatabase} from '../scripts/local-database.mjs';

const url=doc=>'https://cad.onshape.com/documents/'+doc.repeat(24)+'/w/'+ 'b'.repeat(24)+'/e/'+'c'.repeat(24);
const sourceKey=doc=>JSON.stringify(['https://cad.onshape.com',doc.repeat(24),'w','b'.repeat(24),'c'.repeat(24),'']);
const key=(doc,part)=>JSON.stringify(['bom','https://cad.onshape.com',doc.repeat(24),'w','b'.repeat(24),'c'.repeat(24),'','d'.repeat(24),'e'.repeat(24),part,'']);
const incoming=(number='7028-26-2-1004',doc='a',id='rail')=>({key:key(doc,id),name:id,number,material:'Aluminum',cad:url(doc),quantity:1,color:'#001489'});
const empty=()=>normalizeAssignments({version:1,demo:false,parts:[],cots:[],materials:[],students:[{id:'student',name:'QA Student',active:true}]});
const initial=()=>normalizeAssignments(mergeOnshapeBom(empty(),{parts:[incoming()],cots:[]},()=> 'rail').workspace);

test('7028 numbering maps the first digit of the last block, with project-specific subsystem names',()=>{
 assert.deepEqual(parseTeamPartNumber('7028-26-2-1004'),{team:'7028',year:2026,robot:'2',subsystemCode:'1',part:'004'});
 assert.equal(parseTeamPartNumber('7028-26-2-9004').subsystemCode,'9');
 for(const value of ['7028-DR-004','7029-26-2-1004','7028-26-2-10040','7028-26-2-104'])assert.equal(parseTeamPartNumber(value),null);
 const w=initial();w.subsystemRules={'robot-2':{'1':'Different subsystem'}};
 const r=mergeOnshapeBom(projectScope(w,'robot-1'),{parts:[incoming()],cots:[],projectId:'robot-1',subsystemRules:{'1':'Drivetrain'}}).workspace;
 assert.equal(r.parts[0].subsystem,'Drivetrain');const combined=mergeProject(w,r,'robot-1');
 assert.equal(combined.subsystemRules['robot-2']['1'],'Different subsystem');assert.ok(validWorkspace(combined));
 assert.equal(validSubsystemRules({...combined,subsystemRules:{'robot-1':{'10':'Invalid'}}}),false);
});

test('partial selection and source-scoped imports retain other BOM rows without false missing flags',()=>{
 const data={parts:[incoming(),incoming('7028-26-2-2008','a','plate'),incoming('7028-26-2-3001','f','other')],cots:[]};
 let n=0;const before=mergeOnshapeBom(empty(),data,()=> 'part-'+(++n)).workspace;
 const partial=selectedBom({...data,sourceKeys:[sourceKey('a')]},[data.parts[0].key]);
 const r=mergeOnshapeBom(before,{...partial,parts:[{...partial.parts[0],name:'New rail'}]});
 assert.equal(r.workspace.parts[0].name,'New rail');assert.ok(r.workspace.parts.every(p=>!p.sourceMissing));
 const scoped=mergeOnshapeBom(before,{parts:[incoming()],cots:[],sourceKeys:[sourceKey('a')]});
 assert.equal(scoped.workspace.parts[1].sourceMissing,true);assert.equal(scoped.workspace.parts[2].sourceMissing,undefined);
 assert.equal(selectedBom(data,[]).parts.length,0);assert.equal(selectedBom(data,null).parts.length,3);
});

test('V2 starts fresh, links V1, retains old work, and repeated BOM imports update only the current version',()=>{
 const before=initial();Object.assign(before.parts[0],{status:'Done',completedQty:1,owner:'QA Student',notes:'Original notes',readiness:{drawingReviewed:true,materialReady:true,setupReady:true},history:[{at:'2026-11-23T12:00:00Z',worker:'QA Student',label:'Finished original'}]});
 const snapshot=structuredClone(before);const r=createPartRevision(before,'rail',()=> 'rail-v2');
 assert.deepEqual(before,snapshot);assert.equal(r.workspace.parts[0].completedQty,1);assert.deepEqual(r.workspace.parts[0].history,snapshot.parts[0].history);
 assert.equal(r.part.revisionNumber,2);assert.equal(r.part.revisionOf,'rail');assert.equal(r.part.status,'Not Started');assert.equal(r.part.completedQty,0);assert.equal(r.part.owner,'');assert.ok(validWorkspace(r.workspace));
 const old=structuredClone(r.workspace.parts[0]);const synced=mergeOnshapeBom(r.workspace,{parts:[{...incoming(),name:'Revised rail',material:'Steel'}],cots:[]});
 assert.equal(synced.added,0);assert.deepEqual(synced.workspace.parts[0],old);assert.equal(synced.workspace.parts[1].name,'Revised rail');assert.equal(synced.workspace.parts[1].material,'Steel');
 assert.equal(mergeOnshapeBom(synced.workspace,{parts:[{...incoming(),name:'Revised rail',material:'Steel'}],cots:[]}).added,0);
 const v3=createPartRevision(synced.workspace,'rail-v2',()=> 'rail-v3');assert.equal(v3.part.revisionNumber,3);assert.ok(validWorkspace(v3.workspace));
 assert.throws(()=>createPartRevision(r.workspace,'rail'));assert.equal(validPartRevisions([r.part]),false);
 const malformed=structuredClone(r.workspace);malformed.parts[1].revisionNumber=4;assert.equal(validWorkspace(malformed),false);
});

const req=(method,path,body,email='admin@test')=>new Request('https://app.test'+path,{method,headers:{'Content-Type':'application/json','oai-authenticated-user-id':'verified','oai-authenticated-user-email':email},...(body?{body:JSON.stringify(body)}:{})});
test('revision creation is atomic, admin-only and idempotent; historical work cannot be overwritten',async()=>{
 const env={DB:localDatabase(),ADMIN_EMAILS:'admin@test'};
 const seed=initial();seed.parts[0].history=Array.from({length:50},(_,n)=>({at:'2026-11-23T12:00:00Z',worker:'QA Student',label:'Original log '+n}));
 let response=await workspaceApi(req('PUT','/api/workspace',{workspace:seed,baseRevision:0}),env);assert.equal(response.status,200);const saved=await response.json();
 assert.equal((await workspaceApi(req('POST','/api/revisions',{id:'rail',baseRevision:1},'member@test'),env)).status,403);
 response=await workspaceApi(req('POST','/api/revisions',{id:'rail',baseRevision:1}),env);assert.equal(response.status,200);let d=await response.json();
 assert.equal(d.workspace.parts.length,2);assert.equal(d.createdPartId,d.workspace.parts[1].id);assert.equal(d.workspace.parts[0].supersededBy,d.createdPartId);
 assert.deepEqual(d.workspace.parts[0].history,saved.workspace.parts[0].history);
 assert.equal((await workspaceApi(req('POST','/api/revisions',{id:'rail',baseRevision:1}),env)).status,409);
 const retry=await workspaceApi(req('POST','/api/revisions',{id:'rail',baseRevision:d.revision}),env);assert.equal(retry.status,200);assert.equal((await retry.json()).workspace.parts.length,2);
 const old=structuredClone(d.workspace);old.parts[0].notes='Overwrite original';response=await workspaceApi(req('PUT','/api/workspace',{workspace:old,baseRevision:d.revision}),env);assert.equal(response.status,400);
 const retained=await(await workspaceApi(req('GET','/api/workspace'),env)).json();assert.equal(retained.revision,d.revision);assert.equal(retained.workspace.parts[0].notes,'');
 const forged=structuredClone(d.workspace);forged.parts[0].history=[];assert.equal((await workspaceApi(req('PUT','/api/workspace',{workspace:forged,baseRevision:d.revision}),env)).status,400);
 const newer=structuredClone(d.workspace);newer.parts[1].notes='Current version';assert.equal((await workspaceApi(req('PUT','/api/workspace',{workspace:newer,baseRevision:d.revision}),env)).status,200);
});

test('the BOM Appearance column provides the card color without a metadata fallback request',async()=>{
 let requests=0;
 const env={ONSHAPE_ACCESS_KEY:'test-key',ONSHAPE_SECRET_KEY:'test-secret',ONSHAPE_SOURCE_URLS:JSON.stringify([url('a')])};
 const result=await readOnshapeParts(env,async(target)=>{
  requests++;assert.ok(target.pathname.endsWith('/bom'));
  return Response.json({type:'flattened',headers:[{id:'p',propertyName:'partNumber'},{id:'q',propertyName:'quantity'},{id:'appearance',propertyName:'custom-property-id',displayName:'Appearance'}],rows:[{itemSource:{documentId:'a'.repeat(24),elementId:'c'.repeat(24),partId:'rail'},headerIdToValue:{p:'7028-26-2-1004',q:1,appearance:{color:{red:0,green:20,blue:137}}}}]});
 });
 assert.equal(requests,1);assert.equal(result.parts[0].colorHex,'#001489');assert.equal(result.parts[0].color,'#001489');assert.deepEqual(result.colorWarnings,[]);
});

test('an explicit BOM source reads only that assembly with GET, without changing the configured sources',async()=>{
 const env={ONSHAPE_ACCESS_KEY:'test-key',ONSHAPE_SECRET_KEY:'test-secret',ONSHAPE_SOURCE_URLS:JSON.stringify([url('a')])};
 const original=structuredClone(env),calls=[];
 const result=await readOnshapeParts(env,async(target,options)=>{calls.push(target.href);assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');return Response.json({type:'flattened',headers:[{id:'p',propertyName:'partNumber'},{id:'q',propertyName:'quantity'},{id:'c',propertyName:'color'}],rows:[{itemSource:{documentId:'f'.repeat(24),elementId:'c'.repeat(24),partId:'rail'},headerIdToValue:{p:'7028-26-2-1004',q:1,c:'#001489'}}]});},{sourceUrl:url('f')});
 assert.equal(calls.length,1);assert.match(calls[0],new RegExp('/d/'+'f'.repeat(24)+'/'));assert.ok(calls[0].includes('generateIfAbsent=false'));assert.deepEqual(result.sourceKeys,[sourceKey('f')]);assert.deepEqual(env,original);
 for(const sourceUrl of ['https://evil.example/documents/'+ 'a'.repeat(24),url('a').replace('https:','http:'),url('a').replace('cad.onshape.com','cad.onshape.com:444'),url('a').replace('/e/','/parts/')])await assert.rejects(()=>readOnshapeParts(env,()=>{throw Error('Must not fetch');},{sourceUrl}));
});

test('Netlify source picker is admin-only, rejects arbitrary hosts and forwards only the validated source',async()=>{
 const env={ADMIN_EMAILS:'admin@test',ONSHAPE_ACCESS_KEY:'key',ONSHAPE_SECRET_KEY:'secret',ONSHAPE_SOURCE_URLS:JSON.stringify([url('a')])};let calls=0;
 const create=email=>createNetlifyApi({getEnv:()=>env,getDatabase:()=>{throw Error('No database required');},getUser:async()=>({id:'verified',email,roles:['member']}),readBom:async(e,f,options)=>{calls++;assert.equal(options.sourceUrl,url('f'));return {parts:[],cots:[]};}});
 const request=source=>new Request('https://preview.test/api/onshape/parts?'+new URLSearchParams({source}));
 assert.equal((await create('member@test')(request(url('f')))).status,403);
 assert.equal((await create('admin@test')(request('https://evil.example/'))).status,400);assert.equal(calls,0);
 assert.equal((await create('admin@test')(request(url('f')))).status,200);assert.equal(calls,1);
});

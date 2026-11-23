import test from 'node:test';
import assert from 'node:assert/strict';
import {PART_COLOR_PALETTE,partColorHex,generalizePartColor,onshapeAppearanceHex,partColorDot} from '../dist/part-colors.js';
import {mapOnshapeBom,mergeOnshapeParts,mergeOnshapeBom} from '../dist/onshape-import.js';
import {readOnshapeParts} from '../worker/onshape-api.js';
import {normalizeAssignments,validWorkspace,makeDemo} from '../dist/model.js';
import {partsRegister,sortParts} from '../dist/register.js';
import {todoTable} from '../dist/dashboards.js';
import {shopBoard} from '../dist/shop.js';
import {publicBoard} from '../server/netlify-api.js';
import {workspaceApi} from '../worker/workspace-api.js';
import {localDatabase} from '../scripts/local-database.mjs';

const did='a'.repeat(24),wid='b'.repeat(24),assembly='c'.repeat(24),element='d'.repeat(24);
const source={origin:'https://cad.onshape.com',documentId:did,reference:'w',referenceId:wid,elementId:assembly};
const env={ONSHAPE_ACCESS_KEY:'color-test-key',ONSHAPE_SECRET_KEY:'color-test-secret',ONSHAPE_SOURCE_URLS:JSON.stringify([source.origin+'/documents/'+did+'/w/'+wid+'/e/'+assembly])};
const headers=[{id:'n',propertyName:'name'},{id:'p',propertyName:'partNumber'},{id:'q',propertyName:'quantity'},{id:'m',propertyName:'material'}];
const row=(partId='JHD',extra={})=>({itemSource:{documentId:did,elementId:element,partId,wvmType:'w',wvmId:wid,configuration:'default'},headerIdToValue:{n:'Rear Rail',p:'7028-26-2-1001',q:3,m:'Aluminum'},...extra});
const bom=(rows=[row()],columns=headers)=>({type:'flattened',headers:columns,rows});
const empty=()=>normalizeAssignments({version:1,parts:[],cots:[],materials:[],students:[]});
const appearance=(red,green,blue)=>({properties:[{name:'Appearance',value:{color:{red,green,blue},opacity:255}}]});

test('all shades in each requested family map to the exact four team colors',()=>{
 const examples={
  '#000000':['#000','#141414','#303134','#4d4d4d'],
  '#ffffff':['#fff','#f9f7f2','#eeeeee','#cccccc'],
  '#001489':['#000080','#001489','#2196f3','#87ceeb','#add8e6'],
  '#ffd400':['#ff0','#ffd400','#ffc107','#daa520','#6b5b00','#fffacd']
 };
 for(const [expected,shades]of Object.entries(examples))for(const shade of shades)assert.equal(generalizePartColor(shade),expected,shade);
 assert.equal(PART_COLOR_PALETTE.length,4);assert.equal(generalizePartColor(null),'');assert.equal(generalizePartColor('not a color'),'');
});
test('Onshape RGB and appearance metadata parse into hex without treating missing channels as black',()=>{
 assert.equal(partColorHex({red:255,green:224,blue:130}),'#ffe082');assert.equal(partColorHex({r:0,g:20,b:137}),'#001489');
 assert.equal(onshapeAppearanceHex(appearance(255,224,130)),'#ffe082');assert.equal(onshapeAppearanceHex({appearance:{color:{red:10,green:10,blue:10}}}),'#0a0a0a');
 assert.equal(onshapeAppearanceHex({properties:[{propertyId:'appearance-id',value:{color:{red:255,green:255,blue:255}}}]}),'#ffffff');
 for(const value of [{red:0,green:0},{red:null,green:0,blue:0},{red:0.5,green:0,blue:0},{red:-1,green:0,blue:0},{red:999,green:0,blue:0},'red;background:url(https://bad.test)'])assert.equal(partColorHex(value),'');
});
test('a BOM color column supplies the appearance directly, without extra metadata calls',async()=>{
 const colored=row('JHD',{headerIdToValue:{...row().headerIdToValue,paint:'#fffacd'}});let calls=0;
 const data=await readOnshapeParts(env,async url=>{calls++;assert.ok(url.pathname.endsWith('/bom'));return Response.json(bom([colored],[...headers,{id:'paint',displayName:'Color'}]));});
 assert.equal(calls,1);assert.equal(data.parts[0].color,'#ffd400');assert.equal(data.parts[0].colorHex,'#fffacd');assert.deepEqual(data.colorWarnings,[]);assert.equal(data.parts[0].appearanceSource,undefined);
});
test('appearance reads target only manufactured BOM leaves, deduplicate requests and preserve configurations',async()=>{
 const linkedDoc='e'.repeat(24),version='f'.repeat(24),microversion='1'.repeat(24),calls=[];
 const manufactured=row('JHD',{itemSource:{documentId:linkedDoc,elementId:element,partId:'JHD',wvmType:'v',wvmId:version,fullConfiguration:'Length=25 mm;Finish=yellow',sourceElementMicroversionId:microversion,viewHref:source.origin+'/documents/'+linkedDoc+'/v/'+version+'/e/'+element}});
 const purchased=row('motor',{headerIdToValue:{...row().headerIdToValue,p:'WCP-1234',q:8}}),excluded={...row('excluded'),excluded:true};
 const data=await readOnshapeParts(env,async(url,options)=>{
  calls.push(url.href);assert.equal(url.origin,source.origin);assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.match(options.headers.Authorization,/^On color-test-key:HmacSHA256:/);
  if(url.pathname.endsWith('/bom'))return Response.json(bom([manufactured,manufactured,purchased,excluded]));
  assert.equal(url.pathname,'/api/v16/metadata/d/'+linkedDoc+'/v/'+version+'/e/'+element+'/p/JHD');assert.equal(url.searchParams.get('linkDocumentId'),did);assert.equal(url.searchParams.get('configuration'),'Length=25 mm;Finish=yellow');assert.equal(url.searchParams.get('elementMicroversionId'),microversion);return Response.json(appearance(255,224,130));
 });
 assert.equal(calls.length,2);assert.ok(data.parts.every(p=>p.color==='#ffd400'));assert.equal(data.cots.length,1);assert.equal(data.cots[0].quantity,8);
 const imported=mergeOnshapeBom(empty(),data);assert.equal(imported.workspace.parts.length,3);assert.ok(imported.workspace.parts.every(p=>p.color==='#ffd400'&&p.quantity===1));
});
test('appearance requests use the BOM reference rather than inventing a linked document context',async()=>{
 let calls=0;const linked=row('JHD',{itemSource:{documentId:'e'.repeat(24),elementId:element,partId:'JHD',viewHref:'https://evil.test/documents/'+'e'.repeat(24)+'/w/'+wid+'/e/'+element}});
 const data=await readOnshapeParts(env,async url=>{calls++;assert.ok(url.pathname.endsWith('/bom'));return Response.json(bom([linked]));});assert.equal(calls,1);assert.equal(data.parts[0].color,undefined);assert.equal(data.colorWarnings.length,1);
});
test('a missing metadata context can be resolved by the exact validated BOM part view URL',async()=>{
 const linkedDoc='e'.repeat(24),version='f'.repeat(24);const linked=row('JHD',{itemSource:{documentId:linkedDoc,elementId:element,partId:'JHD',viewHref:source.origin+'/documents/'+linkedDoc+'/v/'+version+'/e/'+element}});
 let calls=0;const data=await readOnshapeParts(env,async url=>{calls++;if(url.pathname.endsWith('/bom'))return Response.json(bom([linked]));assert.equal(url.pathname,'/api/v16/metadata/d/'+linkedDoc+'/v/'+version+'/e/'+element+'/p/JHD');return Response.json(appearance(0,20,137));});assert.equal(calls,2);assert.equal(data.parts[0].color,'#001489');
});
test('metadata failures keep the BOM import usable and preserve the last known part color',async()=>{
 let calls=0;const data=await readOnshapeParts(env,async url=>{calls++;return url.pathname.endsWith('/bom')?Response.json(bom()):new Response('private upstream color-test-secret',{status:403});});
 assert.equal(calls,2);assert.equal(data.parts[0].color,undefined);assert.match(data.colorWarnings[0],/Color unavailable/);assert.doesNotMatch(JSON.stringify(data),/color-test-secret|private upstream/);
 const known=mergeOnshapeParts(empty(),[{...data.parts[0],color:'#ffd400',colorHex:'#ffe082'}]).workspace;
 const repeated=mergeOnshapeBom(known,data);assert.ok(repeated.workspace.parts.every(p=>p.color==='#ffd400'));assert.equal(repeated.colorWarnings.length,1);
});
test('an appearance outage does not trigger an unbounded series of failed requests',async()=>{
 const rows=Array.from({length:20},(_,n)=>row('P'+n));let metadataCalls=0;
 const data=await readOnshapeParts(env,async url=>{if(url.pathname.endsWith('/bom'))return Response.json(bom(rows));metadataCalls++;return new Response('rate limited',{status:429});});assert.ok(metadataCalls<=4);assert.match(data.colorWarnings[0],/20 manufactured/);
});
test('color reads honor import cancellation and bounded metadata response sizes',async()=>{
 await assert.rejects(()=>readOnshapeParts(env,async url=>{if(url.pathname.endsWith('/bom'))return Response.json(bom());throw new DOMException('aborted','AbortError');}),/timed out/);
 const data=await readOnshapeParts(env,async url=>url.pathname.endsWith('/bom')?Response.json(bom()):new Response('too much',{headers:{'Content-Length':'512001'}}));assert.equal(data.parts[0].color,undefined);assert.equal(data.colorWarnings.length,1);
});
test('color updates every instance without changing progress, numbers, or readiness',()=>{
 const raw=mapOnshapeBom(bom(),source).parts[0],yellow={...raw,color:'#ffd400',colorHex:'#ffe082'};
 const first=mergeOnshapeParts(empty(),[yellow]).workspace;Object.assign(first.parts[1],{owner:'Alex',completedQty:1,status:'Done',readiness:{drawingReviewed:true,materialReady:true,setupReady:true}});
 const reduced=mergeOnshapeParts(first,[{...yellow,quantity:1}]).workspace;
 const blue=mergeOnshapeParts(reduced,[{...yellow,quantity:1,color:'#001489',colorHex:'#000080'}]).workspace;
 assert.ok(blue.parts.every(p=>p.color==='#001489'));assert.equal(blue.parts[1].sourceMissing,true);assert.equal(blue.parts[1].completedQty,1);assert.equal(blue.parts[1].status,'Done');assert.deepEqual(blue.parts[1].readiness,first.parts[1].readiness);assert.ok(blue.parts.every(p=>p.number===yellow.number));assert.ok(validWorkspace(blue));
 const restored=mergeOnshapeParts(blue,[{...yellow,color:'#001489',colorHex:'#000080'}]).workspace;assert.deepEqual(restored.parts[1].readiness,first.parts[1].readiness);
 const override=structuredClone(first);override.parts[0].localOverride=true;override.parts[0].color='#ffffff';assert.equal(mergeOnshapeParts(override,[{...yellow,color:'#001489',colorHex:'#000080'}]).workspace.parts[0].color,'#ffffff');
});
test('backups accept only four canonical colors and remain compatible with old records',()=>{
 for(const color of PART_COLOR_PALETTE.map(c=>c.value)){const w=makeDemo();w.parts[0].color=color;assert.ok(validWorkspace(w));assert.equal(normalizeAssignments(JSON.parse(JSON.stringify(w))).parts[0].color,color);}
 for(const color of ['#ff0000','black','invalid',null,{},'red;background:url(https://bad.test)']){const w=makeDemo();w.parts[0].color=color;assert.equal(validWorkspace(w),false);}
 const legacy=makeDemo();delete legacy.parts[0].color;assert.ok(validWorkspace(legacy));assert.equal(normalizeAssignments(legacy).parts[0].color,'');
});
test('Parts and Todo have a Color column, with accessible white dots and named sorting',()=>{
 const w=makeDemo();w.students=[{id:'student',name:'Alex',email:'alex@example.test',active:true}];w.parts=w.parts.slice(0,2).map((p,n)=>({...p,assignedTo:'Alex',color:n?'#ffffff':'#001489',status:'Cutting'}));
 assert.match(partsRegister(w.parts),/>Color</);assert.match(partsRegister(w.parts),/aria-label="Color: White"/);assert.match(partsRegister(w.parts),/--part-color:#ffffff/);assert.match(todoTable(w,{email:'alex@example.test'}),/<th>Color<\/th>/);
 const colors=PART_COLOR_PALETTE.map((c,n)=>({id:n,color:c.value}));assert.deepEqual(sortParts(colors,'color').map(p=>p.color),['#000000','#001489','#ffffff','#ffd400']);
 assert.match(shopBoard(w.parts,d=>d),/compact-card-identity.*Color: Blue/);assert.doesNotMatch(partColorDot('red;position:fixed'),/style=/);assert.match(partColorDot(''),/Color not available/);
});
test('public board shares the canonical color while omitting source appearance metadata',()=>{
 const w=makeDemo();w.parts[0].color='#ffd400';w.parts[0].onshape={key:'private-cad-key',colorHex:'#ffe082'};const visible=publicBoard(w);assert.equal(visible.parts[0].color,'#ffd400');assert.equal(visible.parts[0].onshape,undefined);assert.doesNotMatch(JSON.stringify(visible),/ffe082|private-cad-key/);
});
test('color is admin-managed metadata, not a member progress field',async()=>{
 const db=localDatabase(),settings={DB:db,ADMIN_EMAILS:'admin@test'},w=makeDemo();w.parts=[{...w.parts[0],status:'Not Started',assignedTo:'',owner:'',color:'#000000'}];
 const request=(workspace,baseRevision,admin)=>new Request('https://team.test/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json','oai-authenticated-user-id':admin?'admin':'member','oai-authenticated-user-email':admin?'admin@test':'member@test'},body:JSON.stringify({workspace,baseRevision})});
 let r=await workspaceApi(request(w,0,true),settings);assert.equal(r.status,200);const saved=(await r.json()).workspace;saved.parts[0].color='#ffd400';assert.equal((await workspaceApi(request(saved,1,false),settings)).status,403);r=await workspaceApi(request(saved,1,true),settings);assert.equal(r.status,200);assert.equal((await r.json()).workspace.parts[0].color,'#ffd400');
});

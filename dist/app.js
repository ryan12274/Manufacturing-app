import {STATUSES, STORAGE_KEY, validWorkspace, csv, makeDemo, normalizeAssignments, startPart, needsWorkerSelection} from './model.js';
import {shopBoard} from './shop.js';
import {partsRegister} from './register.js';
import {initOnshape} from './onshape-ui.js';
const $ = s => document.querySelector(s);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state, view='parts', editing=null, toastTimer;
let shopMode=false, wakeLock=null, keepAwake=false, previousView='parts';
let pendingStart=null;
try { const saved=localStorage.getItem(STORAGE_KEY); state=saved ? JSON.parse(saved):makeDemo(); if(!validWorkspace(state)) throw new Error('Invalid workspace'); state=normalizeAssignments(state); }
catch { state={version:1,parts:[],materials:[],demo:false}; $('#save-status').textContent='Saved data could not be read. Restore a backup to recover your records.'; }
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4000);}
function save(next){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));state=next;$('#save-status').textContent='Saved at '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});return true;}catch{toast('Could not save. Browser storage may be full or unavailable. Export a backup.');return false;}}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
const overdue = p => p.due && p.due < today() && p.status !== 'Finished';
const dateLabel=d=>d?new Date(d+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}):'No deadline';
function filtered(){const term=$('#search').value.trim().toLowerCase();return (view==='inventory'?state.materials:state.parts).filter(r=>Object.values(r).join(' ').toLowerCase().includes(term) && (view==='inventory'||(!$('#status-filter').value||r.status===$('#status-filter').value)&&(!$('#tag-filter').value||Boolean(r.blocked)===($('#tag-filter').value==='blocked'))&&(!$('#subsystem-filter').value||r.subsystem===$('#subsystem-filter').value)));}
function render(){
 $('#sample-label').hidden=!state.demo;$('#clear-workspace').hidden=!state.demo;
 const active=state.parts.filter(p=>['Preparing','Cutting','Finishing'].includes(p.status)).length;
 $('#board-summary').hidden=view!=='board';
 $('#board-summary').innerHTML='<span><strong>'+active+'</strong> active</span><span class="blocked-count"><strong>'+state.parts.filter(p=>p.blocked).length+'</strong> blocked</span><span><strong>'+state.parts.filter(p=>p.status==='Finished').length+'</strong> finished</span>';
 $('#record-count').textContent=view==='inventory'?state.materials.length:state.parts.length;
 const rows=filtered(); $('#result-count').textContent=`Showing ${rows.length} of ${view==='inventory'?state.materials.length:state.parts.length} ${view==='inventory'?'materials':'parts'}`;
 if(view==='board'){$('#records').innerHTML=shopBoard(rows,dateLabel);return;}
 if(!rows.length){$('#records').innerHTML='<div class="empty"><h3>No records here yet</h3>Add a record or adjust your search and filters.</div>';return;}
 if(view==='inventory'){$('#records').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Material / specification</th><th>On hand</th><th>Minimum</th><th>Location</th><th>Stock status</th></tr></thead><tbody>${rows.map(m=>`<tr><td><button class="part-name" data-edit="${escape(m.id)}">${escape(m.name)}</button><div class="part-number">${escape(m.spec)}</div></td><td>${m.stock} ${escape(m.unit)}</td><td>${m.minimum} ${escape(m.unit)}</td><td>${escape(m.location||'Unassigned')}</td><td><span class="status ${m.stock<=m.minimum?'blocked':'complete'}">${m.stock<=m.minimum?'Reorder soon':'In stock'}</span></td></tr>`).join('')}</tbody></table></div>`;return;}
 $('#records').innerHTML=partsRegister(rows);
}
function refreshFilters(){const old=$('#subsystem-filter').value;$('#status-filter').innerHTML='<option value="">All stages</option>'+STATUSES.map(s=>`<option>${s}</option>`).join('');$('#subsystem-filter').innerHTML='<option value="">All subsystems</option>'+[...new Set(state.parts.map(p=>p.subsystem).filter(Boolean))].sort().map(s=>`<option>${escape(s)}</option>`).join('');$('#subsystem-filter').value=old;}
function switchView(next){
 view=next;document.body.classList.toggle('production-view',view==='board');document.body.classList.toggle('register-view',view==='parts');
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const inv=view==='inventory',board=view==='board';
 $('#page-title').textContent=inv?'Materials':board?'Production':'Parts';
 $('#add-record').textContent=inv?'Add material':'Add part';$('#delete-record').textContent=inv?'Delete material':'Delete part';
 $('#search').placeholder=inv?'Search materials':board?'Search parts or workers':'Search parts';
 $('#search').value='';$('#status-filter').hidden=!board;$('#tag-filter').hidden=inv;$('#subsystem-filter').hidden=inv;$('#tag-filter').value='';refreshFilters();render();
}
const input=(name,label,type='text',value='',extra='')=>`<label ${name==='notes'||name==='name'?'class="full"':''}>${label}<input name="${name}" type="${type}" value="${escape(value)}" ${extra} maxlength="500"></label>`;
const select=(name,label,options,value)=>`<label>${label}<select name="${name}">${options.map(s=>`<option ${s===value?'selected':''}>${escape(s)}</option>`).join('')}</select></label>`;
function edit(id){editing=id||null;const inv=view==='inventory';const record=(inv?state.materials:state.parts).find(r=>r.id===id)||{};$('#dialog-title').textContent=`${id?'Edit':'Add'} ${inv?'material':'part'}`;$('#delete-record').hidden=!id;$('#form-fields').innerHTML=inv?input('name','Material name','text',record.name,'required')+input('spec','Specification','text',record.spec)+input('location','Storage location','text',record.location)+input('stock','Quantity on hand','number',record.stock??0,'min="0" step="any" required')+input('minimum','Reorder threshold','number',record.minimum??0,'min="0" step="any" required')+input('unit','Unit (sheets, inches, spools…)','text',record.unit,'required'):input('name','Part name','text',record.name,'required')+input('number','Part number','text',record.number)+input('subsystem','Subsystem','text',record.subsystem)+input('quantity','Quantity','number',record.quantity??1,'min="1" step="1" required')+input('assignedTo','Preassigned worker (optional)','text',record.assignedTo)+select('status','Manufacturing stage',STATUSES,record.status||'Not started')+select('priority','Priority',['Low','Normal','High'],record.priority||'Normal')+`<label class="full blocked-field"><input name="blocked" type="checkbox" ${record.blocked?'checked':''}> <span>⚑ Blocked tag<small>Keeps the part in its current manufacturing stage. Add the reason in shop notes.</small></span></label>`+input('material','Material','text',record.material)+input('process','Manufacturing process','text',record.process)+input('due','Due date','date',record.due)+input('cad','CAD link','url',record.cad)+`<label class="full">Notes<textarea name="notes" rows="3" maxlength="10000">${escape(record.notes||'')}</textarea></label>`;$('#record-dialog').showModal();}
$('#record-form').addEventListener('submit',e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));Object.keys(values).forEach(k=>values[k]=values[k].trim());values.id=editing||crypto.randomUUID();const existingPart=state.parts.find(p=>p.id===editing);if(view!=='inventory'&&existingPart?.onshape)values.onshape=existingPart.onshape;if(view==='inventory'){values.stock=Number(values.stock);values.minimum=Number(values.minimum);}else {values.quantity=Number(values.quantity);values.blocked=e.target.elements.blocked.checked;const previous=state.parts.find(p=>p.id===editing);values.owner=values.assignedTo||(previous?.assignedTo?'':previous?.owner||'');if(needsWorkerSelection(previous||{status:'Not started',owner:''},values.status)){if(!validWorkspace({...state,parts:[values]})){toast('Check required fields, dates, and quantities.');return;}$('#record-dialog').close();beginWork(values,values.status);return;}}const key=view==='inventory'?'materials':'parts';const next={...state,[key]:editing?state[key].map(r=>r.id===editing?values:r):[...state[key],values]};if(!validWorkspace(next)){toast('Check required fields, dates, and quantities.');return;}if(save(next)){$('#record-dialog').close();refreshFilters();render();toast('Record saved');}});
function commitStartedPart(part,worker='',target='Preparing'){
 const current=state.parts.find(p=>p.id===part.id);
 // Avoid replacing a newer record if another tab changes it while the picker is open.
 if(pendingStart&&JSON.stringify(current)!==pendingStart.original){toast('This part changed in another tab. Open it again before starting.');$('#start-dialog').close();return;}
 try{const started=startPart(part,worker,target);const next={...state,parts:current?state.parts.map(p=>p.id===part.id?started:p):[...state.parts,started]};if(save(next)){pendingStart=null;$('#start-dialog').close();refreshFilters();render();toast(`Work started by ${started.owner}`);}}catch(err){toast(err.message);}
}
function beginWork(part,target){
 if(part.assignedTo?.trim()){commitStartedPart(part,'',target);return;}
 pendingStart={part,target,original:JSON.stringify(state.parts.find(p=>p.id===part.id))};
 $('#start-part-name').textContent=part.name;
 const names=[...new Set(state.parts.flatMap(p=>[p.owner,p.assignedTo]).filter(n=>n?.trim()).map(n=>n.trim()))].sort();
 $('#worker-choices').innerHTML=names.map(name=>`<button type="button" class="secondary" data-worker="${escape(name)}">${escape(name)}</button>`).join('');
 $('#worker-name').value='';$('#start-dialog').showModal();render();
}
function changeStatus(id,status){const part=state.parts.find(p=>p.id===id);if(!part||!STATUSES.includes(status))return;if(needsWorkerSelection(part,status)){beginWork(part,status);return;}if(save({...state,parts:state.parts.map(p=>p.id===id?{...p,status}:p)}))toast('Status updated');render();}
$('#worker-choices').onclick=e=>{const button=e.target.closest('[data-worker]');if(button){$('#worker-name').value=button.dataset.worker;document.querySelectorAll('[data-worker]').forEach(b=>b.classList.toggle('selected',b===button));}};
$('#worker-name').oninput=()=>{document.querySelectorAll('[data-worker]').forEach(b=>b.classList.toggle('selected',b.dataset.worker===$('#worker-name').value));};
$('#start-form').onsubmit=e=>{e.preventDefault();if(pendingStart)commitStartedPart(pendingStart.part,$('#worker-name').value,pendingStart.target);};
['#cancel-start','#close-start'].forEach(s=>$(s).onclick=()=>$('#start-dialog').close());
$('#start-dialog').addEventListener('close',()=>{pendingStart=null;render();});
$('#delete-record').onclick=()=>{if(!confirm('Delete this record? This cannot be undone.'))return;const key=view==='inventory'?'materials':'parts';if(save({...state,[key]:state[key].filter(r=>r.id!==editing)})){$('#record-dialog').close();refreshFilters();render();toast('Record deleted');}};
$('#records').onclick=e=>{const block=e.target.closest('[data-block]');if(block){const part=state.parts.find(p=>p.id===block.dataset.block);if(part&&save({...state,parts:state.parts.map(p=>p.id===part.id?{...p,blocked:!p.blocked}:p)})){toast(part.blocked?'Blocked tag removed':'Blocked tag added');render();}return;}const advance=e.target.closest('[data-advance]');if(advance){changeStatus(advance.dataset.advance,advance.dataset.next);return;}const button=e.target.closest('[data-edit]');if(button)edit(button.dataset.edit);};
$('#records').onchange=e=>{if(e.target.dataset.status){changeStatus(e.target.dataset.status,e.target.value);}};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$('#add-record').onclick=()=>edit();['#close-dialog','#cancel-dialog'].forEach(s=>$(s).onclick=()=>$('#record-dialog').close());['#search','#status-filter','#tag-filter','#subsystem-filter'].forEach(s=>$(s).addEventListener('input',render));
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#export').onclick=()=>{const keys=view==='inventory'?['name','spec','stock','minimum','unit','location']:['number','name','subsystem','status','blocked','quantity','owner','assignedTo','due','priority','material','process','cad','notes'];download('\uFEFF'+csv([keys,...filtered().map(r=>keys.map(k=>r[k]))]),'text/csv;charset=utf-8',`7028-${view}-${today()}.csv`);toast('CSV exported');};
$('#backup').onclick=()=>download(JSON.stringify(state,null,2),'application/json',`7028-workshop-${today()}.json`);
$('#restore').onclick=()=>$('#import-file').click();
$('#import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5_000_000)throw Error('Backup must be under 5 MB.');const data=JSON.parse(await file.text());if(!validWorkspace(data))throw Error('This file is not a valid 7028 workspace backup.');if(confirm(`Replace this workspace with ${data.parts.length} parts and ${data.materials.length} materials? Back up current data first.`)&&save(normalizeAssignments(data))){refreshFilters();render();toast('Workspace restored');}}catch(err){toast(err instanceof SyntaxError?'The file is not valid JSON.':err.message);}e.target.value='';};
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){try{const next=JSON.parse(e.newValue);if(validWorkspace(next)){state=normalizeAssignments(next);refreshFilters();render();toast('Workspace updated in another tab');}}catch{}}});
switchView('parts');
initOnshape({getWorkspace:()=>state,save,onChanged:()=>{refreshFilters();render();},toast});
function updateShopTabs(){document.querySelectorAll('[data-shop-view]').forEach(b=>b.classList.toggle('selected',b.dataset.shopView===view));}
async function releaseWakeLock(){if(wakeLock){await wakeLock.release().catch(()=>{});wakeLock=null;}}
async function requestWakeLock(){if(!keepAwake||!shopMode||document.visibilityState!=='visible')return;try{if(!('wakeLock' in navigator))throw new Error('unsupported');wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;$('#shop-awake').textContent=keepAwake?'Resume keep awake':'Keep awake';});$('#shop-awake').textContent='Display staying awake';}catch{keepAwake=false;$('#shop-awake').setAttribute('aria-pressed','false');$('#shop-awake').textContent='Keep awake';toast('Keep awake is unavailable. Use the smart board display settings.');}}
function setShopMode(enabled){if(enabled&&!shopMode)previousView=view;shopMode=enabled;document.body.classList.toggle('shop-mode',enabled);$('.shop-controls').hidden=!enabled;const url=new URL(location.href);if(enabled)url.searchParams.set('shop','1');else url.searchParams.delete('shop');history.replaceState(null,'',url);switchView(enabled?'board':previousView);updateShopTabs();if(!enabled){keepAwake=false;$('#shop-awake').setAttribute('aria-pressed','false');$('#shop-awake').textContent='Keep awake';releaseWakeLock();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}window.scrollTo(0,0);}
$('#enter-shop').onclick=()=>setShopMode(true);
$('#exit-shop').onclick=()=>setShopMode(false);
document.querySelectorAll('[data-shop-view]').forEach(b=>b.onclick=()=>{switchView(b.dataset.shopView);updateShopTabs();window.scrollTo(0,0);});
$('#shop-fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else throw new Error('unsupported');}catch{toast('Fullscreen is unavailable here. Open the app in the smart board browser and use its fullscreen control.');}};
document.addEventListener('fullscreenchange',()=>$('#shop-fullscreen').textContent=document.fullscreenElement?'Leave fullscreen':'Fullscreen');
$('#shop-awake').onclick=async()=>{keepAwake=!keepAwake;$('#shop-awake').setAttribute('aria-pressed',String(keepAwake));if(keepAwake)await requestWakeLock();else{await releaseWakeLock();$('#shop-awake').textContent='Keep awake';}};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&keepAwake&&!wakeLock)requestWakeLock();});
function updateClock(){$('#shop-clock').textContent=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
updateClock();setInterval(updateClock,15000);
if(new URLSearchParams(location.search).get('shop')==='1')setShopMode(true);
$('#sample-label').hidden=!state.demo;
$('#clear-workspace').hidden=!state.demo;
$('#clear-workspace').onclick=()=>{if(confirm('Clear all parts and materials from this device? Download a backup first.')){if(save({version:1,demo:false,parts:[],materials:[]})){$('#sample-label').hidden=true;$('#clear-workspace').hidden=true;refreshFilters();render();}}};
$('.tools-menu').addEventListener('click',e=>{if(e.target.closest('button'))$('.tools-menu').removeAttribute('open');});
$('#home').onclick=e=>{e.preventDefault();switchView('parts');};

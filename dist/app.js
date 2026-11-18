import {READINESS_CHECKS,readinessIssues,completedQuantity,productionSummary,transitionPart,recordCompletion,logPartChange} from './manufacturing.js';
import {STATUSES, STORAGE_KEY, validWorkspace, csv, makeDemo, normalizeAssignments, startPart, needsWorkerSelection} from './model.js';
import {shopBoard} from './shop.js';
import {partsRegister} from './register.js';
import {initOnshape} from './onshape-ui.js';
import {COTS_STATUSES,cotsStatus,toOrder,vendorName} from './cots-model.js';
import {cotsTable,vendorOrders,initCots} from './cots.js';
const $ = s => document.querySelector(s);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state, view='parts', editing=null, toastTimer;
let shopMode=false, wakeLock=null, keepAwake=false, previousView='parts';
let pendingStart=null;
try { const saved=localStorage.getItem(STORAGE_KEY); state=saved ? JSON.parse(saved):makeDemo(); if(!validWorkspace(state)) throw new Error('Invalid workspace'); state=normalizeAssignments(state); }
catch { state={version:1,parts:[],materials:[],cots:[],demo:false}; $('#save-status').textContent='Saved data could not be read. Restore a backup to recover your records.'; }
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4000);}
function save(next){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));state=next;$('#save-status').textContent='Saved at '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});return true;}catch{toast('Could not save. Browser storage may be full or unavailable. Export a backup.');return false;}}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
const overdue = p => p.due && p.due < today() && p.status !== 'Finished';
const dateLabel=d=>d?new Date(d+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}):'No deadline';
function filtered(){const term=$('#search').value.trim().toLowerCase();if(view==='cots')return state.cots.filter(i=>Object.values(i).join(' ').toLowerCase().includes(term)&&(!$('#status-filter').value||cotsStatus(i)===$('#status-filter').value)&&(!$('#subsystem-filter').value||vendorName(i.vendor)===$('#subsystem-filter').value));return (view==='inventory'?state.materials:state.parts).filter(r=>Object.values(r).join(' ').toLowerCase().includes(term) && (view==='inventory'||(!$('#status-filter').value||r.status===$('#status-filter').value)&&(!$('#tag-filter').value||($('#tag-filter').value==='ready'?!readinessIssues(r).length:$('#tag-filter').value==='not-ready'?readinessIssues(r).length>0:Boolean(r.blocked)===($('#tag-filter').value==='blocked')))&&(!$('#subsystem-filter').value||r.subsystem===$('#subsystem-filter').value)));}
function render(){
 $('#sample-label').hidden=!state.demo||view==='cots';$('#clear-workspace').hidden=!state.demo;
 const summaryParts=view==='board'?filtered():state.parts;const stats=productionSummary(summaryParts);$('#board-summary').hidden=view!=='board';
 $('#board-summary').innerHTML='<div class="production-progress"><strong>'+stats.finished+' / '+stats.total+' pieces finished</strong><span>'+stats.percent+'%</span><progress value="'+stats.finished+'" max="'+(stats.total||1)+'" aria-label="Finished pieces"></progress></div><div class="production-counts"><span>'+stats.jobsFinished+' / '+summaryParts.length+' batches finished</span><span>'+stats.active+' active</span><span>'+stats.ready+' ready to cut</span><span class="blocked-count">'+stats.blocked+' blocked</span></div>';
 $('#vendor-orders').hidden=view!=='cots'||!state.cots.some(i=>toOrder(i)>0);$('#vendor-orders').innerHTML=view==='cots'?vendorOrders(state.cots):'';
 $('#record-count').textContent=view==='cots'?state.cots.length:view==='inventory'?state.materials.length:state.parts.length;
 const rows=filtered(); $('#result-count').textContent=`Showing ${rows.length} of ${view==='cots'?state.cots.length:view==='inventory'?state.materials.length:state.parts.length} ${view==='inventory'?'materials':view==='cots'?'COTS parts':'parts'}`;
 if(view==='board'){$('#records').innerHTML=shopBoard(rows,dateLabel);return;}
 if(view==='cots'){$('#records').innerHTML=rows.length?cotsTable(rows):'<div class="empty"><h3>No COTS parts</h3>Add purchased parts from REV, WCP, or another vendor.</div>';return;}
 if(!rows.length){$('#records').innerHTML='<div class="empty"><h3>No records here yet</h3>Add a record or adjust your search and filters.</div>';return;}
 if(view==='inventory'){$('#records').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Material / specification</th><th>On hand</th><th>Minimum</th><th>Location</th><th>Stock status</th></tr></thead><tbody>${rows.map(m=>`<tr><td><button class="part-name" data-edit="${escape(m.id)}">${escape(m.name)}</button><div class="part-number">${escape(m.spec)}</div></td><td>${m.stock} ${escape(m.unit)}</td><td>${m.minimum} ${escape(m.unit)}</td><td>${escape(m.location||'Unassigned')}</td><td><span class="status ${m.stock<=m.minimum?'blocked':'complete'}">${m.stock<=m.minimum?'Reorder soon':'In stock'}</span></td></tr>`).join('')}</tbody></table></div>`;return;}
 $('#records').innerHTML=partsRegister(rows);
}
function refreshFilters(){const old=$('#subsystem-filter').value,status=$('#status-filter').value;const cots=view==='cots';$('#status-filter').innerHTML='<option value="">'+(cots?'All statuses':'All stages')+'</option>'+(cots?COTS_STATUSES:STATUSES).map(s=>'<option>'+s+'</option>').join('');$('#status-filter').value=status;$('#subsystem-filter').setAttribute('aria-label',cots?'Filter by vendor':'Filter by subsystem');$('#status-filter').setAttribute('aria-label',cots?'Filter by order status':'Filter by stage');$('#subsystem-filter').innerHTML='<option value="">'+(cots?'All vendors':'All subsystems')+'</option>'+[...new Set(cots?state.cots.map(i=>vendorName(i.vendor)):state.parts.map(p=>p.subsystem).filter(Boolean))].sort().map(v=>'<option>'+escape(v)+'</option>').join('');$('#subsystem-filter').value=old;}
function switchView(next){
 view=['parts','board','cots'].includes(next)?next:'parts';document.body.classList.toggle('production-view',view==='board');document.body.classList.toggle('register-view',view==='parts');
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const inv=view==='inventory',board=view==='board',cots=view==='cots';
 $('#page-title').textContent=cots?'COTS':inv?'Materials':board?'Production':'Parts';
 $('#add-record').textContent=cots?'Add COTS part':inv?'Add material':'Add part';$('#delete-record').textContent=inv?'Delete material':'Delete part';
 $('#search').placeholder=cots?'Search parts, vendors, or order numbers':inv?'Search materials':board?'Search parts or workers':'Search parts';
 $('#search').value='';$('#status-filter').value='';$('#subsystem-filter').value='';$('#status-filter').hidden=!(board||cots);$('#tag-filter').hidden=inv||cots;$('#subsystem-filter').hidden=inv;$('#tag-filter').value='';refreshFilters();render();
}
const input=(name,label,type='text',value='',extra='')=>`<label ${name==='notes'||name==='name'?'class="full"':''}>${label}<input name="${name}" type="${type}" value="${escape(value)}" ${extra} maxlength="500"></label>`;
const select=(name,label,options,value)=>`<label>${label}<select name="${name}">${options.map(s=>`<option ${s===value?'selected':''}>${escape(s)}</option>`).join('')}</select></label>`;
function edit(id){if(view==='cots'){cotsController.edit(id);return;}editing=id||null;const record=state.parts.find(r=>r.id===id)||{};
 $('#dialog-title').textContent=id?'Edit part':'Add part';$('#delete-record').hidden=!id;
 $('#form-fields').innerHTML=input('name','Part name','text',record.name,'required')+input('number','Part number','text',record.number)+input('subsystem','Subsystem','text',record.subsystem)+input('quantity','Batch quantity','number',record.quantity??1,'min="1" step="1" required')+input('assignedTo','Preassigned worker (optional)','text',record.assignedTo)+select('status','Manufacturing stage',STATUSES,record.status||'Not started')+select('priority','Priority',['Low','Normal','High'],record.priority||'Normal')+input('completedQty','Finished pieces','number',completedQuantity({...record,quantity:record.quantity||1})||0,'min="0" step="1" required')+input('material','Material','text',record.material)+input('process','Manufacturing process','text',record.process)+input('due','Due date','date',record.due)+input('cad','Drawing / CAD link','url',record.cad)+
 '<fieldset class="full readiness-checklist"><legend>Ready to manufacture</legend><p id="readiness-message">Complete these checks before cutting. Preparing can start while details are being gathered.</p>'+READINESS_CHECKS.map(([key,label])=>'<label><input type="checkbox" name="'+key+'" '+(record.readiness?.[key]?'checked':'')+'> '+escape(label)+'</label>').join('')+'</fieldset>'+`<label class="full blocked-field"><input name="blocked" type="checkbox" ${record.blocked?'checked':''}> <span>Blocked<small>Add the reason in shop notes.</small></span></label><label class="full">Shop notes<textarea name="notes" rows="3" maxlength="10000">${escape(record.notes||'')}</textarea></label>`+
 (record.history?.length?'<details class="full part-history"><summary>Recent activity</summary><ol>'+record.history.slice(-8).reverse().map(h=>'<li>'+escape(h.label)+'<small>'+escape(h.worker||'Team')+' · '+escape(new Date(h.at).toLocaleString())+'</small></li>').join('')+'</ol></details>':'');$('#record-dialog').showModal();
}
$('#form-fields').oninput=e=>{const affected={name:['drawingReviewed'],number:['drawingReviewed'],cad:['drawingReviewed'],material:['materialReady','setupReady'],quantity:['materialReady','setupReady'],process:['setupReady']}[e.target.name];for(const key of affected||[])$('#record-form').elements[key].checked=false;};
$('#record-form').addEventListener('submit',e=>{
 e.preventDefault();const values=Object.fromEntries(new FormData(e.target));Object.keys(values).forEach(k=>values[k]=values[k].trim());const previous=state.parts.find(p=>p.id===editing);
 const readiness=Object.fromEntries(READINESS_CHECKS.map(([k])=>[k,e.target.elements[k].checked]));for(const [key] of READINESS_CHECKS)delete values[key];
 let part={...previous,...values,id:editing||crypto.randomUUID(),quantity:Number(values.quantity),completedQty:Number(values.completedQty),readiness,blocked:e.target.elements.blocked.checked,owner:values.assignedTo||(previous?.assignedTo?'':previous?.owner||'')};
 if(!validWorkspace({...state,parts:[part]})){toast('Check quantities, required fields and dates. Finished pieces cannot exceed the batch.');return;}
 const changing=part.status!==(previous?.status||'Not started');
 if(changing&&['Cutting','Finishing','Finished'].includes(part.status)&&readinessIssues(part).length){$('#readiness-message').textContent=readinessIssues(part).join(' ');$('#readiness-message').className='cart-error';toast('Complete the readiness checks before advancing.');return;}
 if(needsWorkerSelection(previous||{status:'Not started',owner:''},part.status)){editing=part.id;$('#record-dialog').close();beginWork(part,part.status);return;}
 try{part=changing?transitionPart({...part,status:previous?.status||'Not started'},part.status):logPartChange(part,{},previous?'Part updated':'Part created');}catch(err){toast(err.message);return;}
 const next={...state,parts:previous?state.parts.map(p=>p.id===part.id?part:p):[...state.parts,part]};if(save(next)){$('#record-dialog').close();refreshFilters();render();toast('Part saved');}
});

function commitStartedPart(part,worker='',target='Preparing'){
 const current=state.parts.find(p=>p.id===part.id);
 // Avoid replacing a newer record if another tab changes it while the picker is open.
 if(pendingStart&&JSON.stringify(current)!==pendingStart.original){toast('This part changed in another tab. Open it again before starting.');$('#start-dialog').close();return;}
 try{const assigned=startPart(part,worker,target);const started=transitionPart({...assigned,status:current?.status||'Not started'},target);const next={...state,parts:current?state.parts.map(p=>p.id===part.id?started:p):[...state.parts,started]};if(save(next)){pendingStart=null;$('#start-dialog').close();refreshFilters();render();toast(`Work started by ${started.owner}`);}}catch(err){toast(err.message);}
}
function beginWork(part,target){
 if(['Cutting','Finishing'].includes(target)&&readinessIssues(part).length){toast('Complete readiness checks before cutting.');edit(part.id);return;}
 if(part.assignedTo?.trim()){commitStartedPart(part,'',target);return;}
 pendingStart={part,target,original:JSON.stringify(state.parts.find(p=>p.id===part.id))};
 $('#start-part-name').textContent=part.name;
 const names=[...new Set(state.parts.flatMap(p=>[p.owner,p.assignedTo]).filter(n=>n?.trim()).map(n=>n.trim()))].sort();
 $('#worker-choices').innerHTML=names.map(name=>`<button type="button" class="secondary" data-worker="${escape(name)}">${escape(name)}</button>`).join('');
 $('#worker-name').value='';$('#start-dialog').showModal();render();
}
function changeStatus(id,status){const part=state.parts.find(p=>p.id===id);if(!part||!STATUSES.includes(status))return;
 if(['Cutting','Finishing','Finished'].includes(status)&&readinessIssues(part).length){edit(id);$('#readiness-message').textContent=readinessIssues(part).join(' ');$('#readiness-message').className='cart-error';toast('Complete readiness checks before advancing.');return;}
 if(needsWorkerSelection(part,status)){beginWork(part,status);return;}
 try{const updated=transitionPart(part,status);if(save({...state,parts:state.parts.map(p=>p.id===id?updated:p)}))toast('Progress updated');}catch(err){toast(err.message);}render();}
$('#worker-choices').onclick=e=>{const button=e.target.closest('[data-worker]');if(button){$('#worker-name').value=button.dataset.worker;document.querySelectorAll('[data-worker]').forEach(b=>b.classList.toggle('selected',b===button));}};
$('#worker-name').oninput=()=>{document.querySelectorAll('[data-worker]').forEach(b=>b.classList.toggle('selected',b.dataset.worker===$('#worker-name').value));};
$('#start-form').onsubmit=e=>{e.preventDefault();if(pendingStart)commitStartedPart(pendingStart.part,$('#worker-name').value,pendingStart.target);};
['#cancel-start','#close-start'].forEach(s=>$(s).onclick=()=>$('#start-dialog').close());
$('#start-dialog').addEventListener('close',()=>{pendingStart=null;render();});
$('#delete-record').onclick=()=>{if(!confirm('Delete this record? This cannot be undone.'))return;const key=view==='inventory'?'materials':'parts';if(save({...state,[key]:state[key].filter(r=>r.id!==editing)})){$('#record-dialog').close();refreshFilters();render();toast('Record deleted');}};
$('#records').onclick=e=>{const finish=e.target.closest('[data-finish-piece]');if(finish){const part=state.parts.find(p=>p.id===finish.dataset.finishPiece);try{const updated=recordCompletion(part,Math.min(part.quantity,completedQuantity(part)+1));if(save({...state,parts:state.parts.map(p=>p.id===part.id?updated:p)}))render();}catch(err){toast(err.message);}return;}const order=e.target.closest('[data-cots-order]'),received=e.target.closest('[data-cots-receive]');if(order||received){cotsController.quick((order||received).dataset[order?'cotsOrder':'cotsReceive'],Boolean(received));return;}const block=e.target.closest('[data-block]');if(block){const part=state.parts.find(p=>p.id===block.dataset.block);if(part&&save({...state,parts:state.parts.map(p=>p.id===part.id?logPartChange(p,{blocked:!p.blocked},p.blocked?'Unblocked':'Blocked'):p)})){toast(part.blocked?'Blocked tag removed':'Blocked tag added');render();}return;}const advance=e.target.closest('[data-advance]');if(advance){changeStatus(advance.dataset.advance,advance.dataset.next);return;}const button=e.target.closest('[data-edit]');if(button)edit(button.dataset.edit);};
$('#records').onchange=e=>{if(e.target.dataset.status){changeStatus(e.target.dataset.status,e.target.value);}};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$('#add-record').onclick=()=>edit();['#close-dialog','#cancel-dialog'].forEach(s=>$(s).onclick=()=>$('#record-dialog').close());['#search','#status-filter','#tag-filter','#subsystem-filter'].forEach(s=>$(s).addEventListener('input',render));
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#export').onclick=()=>{const keys=view==='cots'?['name','vendor','number','needed','ordered','received','status','eta','reference','url','notes']:view==='inventory'?['name','spec','stock','minimum','unit','location']:['number','name','subsystem','status','blocked','quantity','completedQty','owner','assignedTo','due','priority','material','process','cad','notes'];download('\uFEFF'+csv([keys,...filtered().map(r=>keys.map(k=>view==='cots'&&k==='status'?cotsStatus(r):r[k]))]),'text/csv;charset=utf-8',`7028-${view}-${today()}.csv`);toast('CSV exported');};
$('#backup').onclick=()=>download(JSON.stringify(state,null,2),'application/json',`7028-workshop-${today()}.json`);
$('#restore').onclick=()=>$('#import-file').click();
$('#import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5_000_000)throw Error('Backup must be under 5 MB.');const data=JSON.parse(await file.text());if(!validWorkspace(data))throw Error('This file is not a valid 7028 workspace backup.');if(confirm(`Replace this workspace with ${data.parts.length} parts, ${data.materials.length} materials, and ${data.cots?.length||0} COTS items? Back up current data first.`)&&save(normalizeAssignments(data))){refreshFilters();render();toast('Workspace restored');}}catch(err){toast(err instanceof SyntaxError?'The file is not valid JSON.':err.message);}e.target.value='';};
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){try{const next=JSON.parse(e.newValue);if(validWorkspace(next)){state=normalizeAssignments(next);refreshFilters();render();toast('Workspace updated in another tab');}}catch{}}});
const cotsController=initCots({getWorkspace:()=>state,save,onChanged:()=>{refreshFilters();render();},toast});
$('#vendor-orders').onclick=e=>{const b=e.target.closest('[data-vendor-cart]');if(b)cotsController.cart(b.dataset.vendorCart);};
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
$('#clear-workspace').onclick=()=>{if(confirm('Clear all parts, materials, and COTS items from this device? Download a backup first.')){if(save({version:1,demo:false,parts:[],materials:[],cots:[]})){$('#sample-label').hidden=true;$('#clear-workspace').hidden=true;refreshFilters();render();}}};
$('.tools-menu').addEventListener('click',e=>{if(e.target.closest('button'))$('.tools-menu').removeAttribute('open');});
$('#home').onclick=e=>{e.preventDefault();switchView('parts');};

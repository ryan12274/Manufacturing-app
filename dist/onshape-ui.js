import {partColorDot} from './part-colors.js';
import {mergeOnshapeBom,resolveBomConflict,selectedBom} from './onshape-import.js';
import {parseTeamPartNumber} from './subsystem-rules.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initOnshape({getWorkspace,save,onChanged,toast,enabled=()=>true}){
 const $=s=>document.querySelector(s);let configured=false,busy=false,lastData=null,preview=null,lastConflicts=[],automatic=false;
 const preferenceKey='frc7028-onshape-selection-v1';let preference=null;
 try{preference=JSON.parse(localStorage.getItem(preferenceKey));}catch{}
 $('#onshape-connection').insertAdjacentHTML('afterend','<div class="import-source-controls"><label>BOM document<select id="onshape-source"><option value="">Configured BOM</option><option value="custom">Use another BOM link</option></select></label><label id="onshape-source-link-label" hidden>Onshape assembly / BOM link<input id="onshape-source-link" type="url" maxlength="3000" placeholder="Paste an Onshape assembly tab link"></label><p class="helper">Reads the selected assembly BOM. No document edits or document-wide scans.</p></div><section id="onshape-selection" hidden></section>');
 const sourceControls=$('#onshape-source').closest('.import-source-controls');sourceControls.prepend($('#onshape-target'));sourceControls.after($('#onshape-message'));for(const el of document.querySelectorAll('#onshape-dialog>.import-help,#onshape-dialog>.import-rule'))el.hidden=true;
 const report=message=>$('#onshape-message').textContent=message;
 const sourceUrl=()=>$('#onshape-source').value==='custom'?$('#onshape-source-link').value.trim():$('#onshape-source').value;
 const rows=()=>lastData?[...lastData.parts.map(p=>({...p,kind:'Manufacturing'})),...(lastData.cots||[]).map(p=>({...p,kind:'COTS'}))]:[];
 const setBusy=value=>{busy=value;$('#onshape-scan').disabled=value||!configured;$('#onshape-import').disabled=value||!preview;for(const field of document.querySelectorAll('.import-source-controls input,.import-source-controls select,#onshape-selection input,#onshape-selection button'))field.disabled=value;};
 function stopAutomatic(){automatic=false;$('#onshape-auto').checked=false;try{localStorage.setItem('frc7028-onshape-auto','false');}catch{}}
 function resetPreview(){stopAutomatic();lastData=null;preview=null;$('#onshape-import').hidden=true;$('#onshape-selection').hidden=true;$('#onshape-results').textContent='';$('#onshape-conflicts').textContent='';}
 $('#onshape-source').onchange=()=>{$('#onshape-source-link-label').hidden=$('#onshape-source').value!=='custom';resetPreview();};
 $('#onshape-source-link').oninput=resetPreview;
 async function json(path){const response=await fetch(path,{cache:'no-store',headers:{Accept:'application/json'}});let data;try{data=await response.json();}catch{throw Error('The Onshape service is unavailable. Try again later.');}if(!response.ok)throw Error(data.error||'Onshape request failed.');return data;}
 async function checkConnection(){
  try{
   const data=await json('/api/onshape/status');configured=!!(data.configured||data.canSelectSource);
   $('#onshape-connection').textContent=configured?'API configured':'Not connected';$('#onshape-connection').className=configured?'status complete':'status blocked';$('#onshape-auto').disabled=!configured;
   const current=sourceUrl()||preference?.sourceUrl||'',sources=data.sources||[];
   $('#onshape-source').innerHTML=(sources.length>1?'<option value="">All configured BOMs</option>':'')+sources.map(s=>'<option value="'+esc(s.url)+'">'+esc(s.label)+'</option>').join('')+'<option value="custom">Use another BOM link</option>';
   if(current&&sources.some(s=>s.url===current))$('#onshape-source').value=current;
   else if(current){$('#onshape-source').value='custom';$('#onshape-source-link').value=current;}
   $('#onshape-source-link-label').hidden=$('#onshape-source').value!=='custom';
   report(configured?'Choose a BOM, find parts, then select the rows to import.':'Not connected. Configure Onshape in server settings.');
  }catch(err){report(err.message);configured=false;}
  setBusy(busy);return configured;
 }
 function showSummary(result){
  $('#onshape-results').innerHTML='<h3>Changes to save</h3><p>Only selected rows are imported. Existing progress and purchasing records are retained.</p><ul>'+result.preview.map(p=>'<li>'+esc(p.name)+' · '+esc(p.change)+'</li>').join('')+'</ul>'+(result.colorWarnings||[]).map(message=>'<p class="import-color-warning">'+esc(message)+'</p>').join('');
  lastConflicts=result.conflictDetails||[];renderConflicts(result);
  report('Parts: '+result.manufactured.added+' new, '+result.manufactured.updated+' updated · COTS: '+result.purchased.added+' new, '+result.purchased.updated+' updated · '+result.conflicts.length+' conflicts');
 }
 function renderConflicts(result){
  $('#onshape-conflicts').innerHTML=(result.sharedNumbers?.length?'<p>Shared part numbers: '+result.sharedNumbers.map(esc).join(', ')+'. Distinct CAD parts stay separate.</p>':'')+lastConflicts.map((d,n)=>{
   const records=getWorkspace()[d.kind]||[];
   return '<section class="import-resolution"><strong>'+esc(d.part.number)+' · '+esc(d.part.name)+'</strong><p>'+esc(d.reason||'Link an existing record to keep its progress, or keep both.')+'</p>'+d.existingIds.map(id=>{const p=records.find(p=>p.id===id);return p?'<button class="secondary" data-resolve="'+n+'" data-existing="'+esc(id)+'">Link '+esc(p.name)+'</button>':'';}).join('')+(!d.reason?'<button class="secondary" data-resolve="'+n+'">Keep separate</button>':'')+'</section>';
  }).join('');
 }
 function selectionData(){
  const allRows=rows(),checked=[...document.querySelectorAll('[data-import-row]:checked')].map(el=>allRows[Number(el.dataset.importRow)].key);
  if(!checked.length)return null;
  const data=selectedBom(lastData,checked.length===allRows.length?null:checked);
  data.projectId=getWorkspace().onshapeProjectId;
  data.subsystemRules=Object.fromEntries([...document.querySelectorAll('[data-subsystem-code]')].map(el=>[el.dataset.subsystemCode,el.value.trim()]).filter(([,name])=>name));
  return data;
 }
 function updatePreview(){
  preview=selectionData();$('#onshape-import').hidden=!preview;
  const total=rows().length,selected=document.querySelectorAll('[data-import-row]:checked').length;
  $('#onshape-selected-count').textContent=selected+' / '+total+' BOM rows selected';$('#onshape-import').textContent='Import selected ('+selected+')';
  if(preview){try{showSummary(mergeOnshapeBom(getWorkspace(),preview));}catch(err){preview=null;report(err.message);}}
  else{$('#onshape-results').textContent='Select at least one row to import.';$('#onshape-conflicts').textContent='';}
  setBusy(busy);
 }
 function renderSelection(data,requestSource){
  lastData=data;const allRows=rows(),workspace=getWorkspace(),savedRules=workspace.subsystemRules?.[workspace.onshapeProjectId]||{};
  const codes=[...new Set([...Object.keys(savedRules),...data.parts.map(p=>parseTeamPartNumber(p.number)?.subsystemCode).filter(Boolean)])].sort();
  const remembered=preference?.sourceUrl===requestSource?preference.selectedKeys:null;
  $('#onshape-selection').innerHTML='<h3>Select parts to import</h3><div class="import-selection-toolbar"><input id="onshape-part-search" type="search" aria-label="Search BOM rows" placeholder="Search part names or numbers"><button class="secondary" type="button" data-select-all>Select all rows</button><button class="secondary" type="button" data-select-none>Clear selection</button><span id="onshape-selected-count" role="status"></span></div><div class="import-parts-list">'+allRows.map((p,n)=>'<label class="import-part-row" data-row-search="'+esc((p.name+' '+p.number+' '+p.kind).toLowerCase())+'"><input type="checkbox" data-import-row="'+n+'" '+(!remembered||remembered.includes(p.key)?'checked':'')+'><span><strong class="import-row-heading">'+(p.kind==='Manufacturing'?partColorDot(p.color):'')+esc(p.number||p.name)+'</strong><small>'+esc(p.name)+' · '+esc(p.kind)+' · Qty '+p.quantity+'</small></span></label>').join('')+'</div><fieldset class="import-subsystem-rules"><legend>Subsystems by part number</legend><p>7028-26-2-<strong>1</strong>004 → subsystem code <strong>1</strong>. Names are saved for this project and applied to selected manufacturing parts.</p>'+(codes.length?codes.map(code=>'<label>Code '+esc(code)+'<input data-subsystem-code="'+esc(code)+'" maxlength="100" value="'+esc(savedRules[code]||'')+'" placeholder="Subsystem name"></label>').join(''):'<p>No selected BOM part numbers match 7028-YY-robot-####.</p>')+'</fieldset>';
  $('#onshape-selection').hidden=false;
  $('#onshape-part-search').oninput=e=>{const query=e.target.value.trim().toLowerCase();for(const row of document.querySelectorAll('[data-row-search]'))row.hidden=!row.dataset.rowSearch.includes(query);};
  $('#onshape-selection').onchange=e=>{if(e.target.matches('[data-import-row],[data-subsystem-code]')){stopAutomatic();updatePreview();}};
  $('#onshape-selection').onclick=e=>{if(e.target.closest('[data-select-all],[data-select-none]')){const checked=!!e.target.closest('[data-select-all]');for(const el of document.querySelectorAll('[data-import-row]'))el.checked=checked;stopAutomatic();updatePreview();}};
  updatePreview();
 }
 function apply(data){
  const result=mergeOnshapeBom(getWorkspace(),data);result.workspace.importState={lastSuccess:new Date().toISOString(),source:'Selected read-only BOM'};
  if(!save(result.workspace))return null;onChanged();return result;
 }
 async function scan(auto=false){
  if(!enabled()){report('Choose a BOM destination in Admin before importing.');return;}
  if(busy||!configured)return;
  const requestSource=auto?preference?.sourceUrl||'':sourceUrl();
  if(!auto&&$('#onshape-source').value==='custom'&&!requestSource){report('Paste an Onshape assembly BOM link first.');return;}
  if(auto&&(!preference||preference.projectId!==getWorkspace().onshapeProjectId)){stopAutomatic();report('Review and import the selection for this project before enabling auto-import.');return;}
  setBusy(true);
  try{
   const query=requestSource?'?'+new URLSearchParams({source:requestSource}):'';
   const data=await json('/api/onshape/parts'+query);
   if(auto){const chosen=selectedBom(data,preference.selectedKeys);chosen.projectId=preference.projectId;chosen.subsystemRules=getWorkspace().subsystemRules?.[chosen.projectId]||{};const result=apply(chosen);if(result){showSummary(result);$('#onshape-last-sync').textContent='Import queued. Waiting for server confirmation.';}return;}
   renderSelection(data,requestSource);
  }catch(err){preview=null;$('#onshape-import').hidden=true;report('Import failed: '+err.message);if(auto)toast('Onshape auto-import failed. Open import for details.');}
  finally{setBusy(false);}
 }
 $('#onshape-conflicts').onclick=e=>{
  const button=e.target.closest('[data-resolve]');if(!button||!preview)return;
  try{const linked=resolveBomConflict(getWorkspace(),lastConflicts[Number(button.dataset.resolve)],button.dataset.existing||''),result=mergeOnshapeBom(linked,preview);if(save(result.workspace)){onChanged();updatePreview();toast('Import conflict resolved');}}
  catch(err){report(err.message);}
 };
 $('#open-onshape').onclick=async()=>{$('#onshape-dialog').showModal();await checkConnection();};
 $('#close-onshape').onclick=()=>$('#onshape-dialog').close();$('#onshape-scan').onclick=()=>scan();
 $('#onshape-import').onclick=()=>{
  if(!preview)return;
  try{
   const result=apply(preview);if(!result)return;
   const chosen=rows().filter((p,n)=>document.querySelector('[data-import-row="'+n+'"]')?.checked).map(p=>p.key);
   preference={sourceUrl:sourceUrl(),projectId:preview.projectId,selectedKeys:preview.partial?chosen:null};
   try{localStorage.setItem(preferenceKey,JSON.stringify(preference));}catch{}
   showSummary(result);preview=null;$('#onshape-import').hidden=true;$('#onshape-last-sync').textContent='Import queued. Waiting for server confirmation.';toast('Selected BOM rows imported');
  }catch(err){report(err.message);}
 };
 $('#onshape-auto').onchange=async e=>{
  if(e.target.checked&&!preference){e.target.checked=false;report('Import your selection once before enabling auto-import.');return;}
  automatic=e.target.checked;try{localStorage.setItem('frc7028-onshape-auto',String(automatic));}catch{}
  if(automatic){$('#onshape-dialog').close();await scan(true);}
 };
 const timer=setInterval(()=>{if(automatic&&document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))scan(true);},300000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 try{automatic=!!preference&&localStorage.getItem('frc7028-onshape-auto')==='true';}catch{}
 if(automatic)checkConnection().then(ready=>{if(ready){$('#onshape-auto').checked=true;if(!document.querySelector('dialog[open]'))scan(true);}});
}

import {mergeOnshapeBom,resolveBomConflict} from './onshape-import.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initOnshape({getWorkspace,save,onChanged,toast}){
 const $=s=>document.querySelector(s);let configured=false,busy=false,preview=null,automatic=false,lastData=null,lastConflicts=[];
 const report=message=>$('#onshape-message').textContent=message;
 const setBusy=value=>{busy=value;$('#onshape-scan').disabled=value||!configured;$('#onshape-import').disabled=value||!preview;};
 async function json(path){const response=await fetch(path,{cache:'no-store',headers:{Accept:'application/json'}});let data;try{data=await response.json();}catch{throw Error('The Onshape service is unavailable. Try again later.');}if(!response.ok)throw Error(data.error||'Onshape request failed.');return data;}
 async function checkConnection(){try{const data=await json('/api/onshape/status');configured=data.configured;$('#onshape-connection').textContent=configured?'API configured':'Not connected';$('#onshape-connection').className=configured?'status complete':'status blocked';$('#onshape-auto').disabled=!configured;report(configured?'Connected. Read-only BOM import.':'Not connected. Configure Onshape in server settings.');}catch(err){report(err.message);configured=false;}setBusy(busy);return configured;}
 function showSummary(result){lastConflicts=result.conflictDetails||[];renderConflicts(result);report(`Parts: ${result.manufactured.added} new, ${result.manufactured.updated} updated · COTS: ${result.purchased.added} new, ${result.purchased.updated} updated · ${result.conflicts.length} conflicts`);}

 function renderConflicts(result){
  const host=$('#onshape-conflicts');host.innerHTML=(result.sharedNumbers?.length?'<p>Shared part numbers: '+result.sharedNumbers.map(esc).join(', ')+'. Distinct CAD parts are tracked separately by BOM identity.</p>':'')+lastConflicts.map((d,n)=>{
   const records=getWorkspace()[d.kind]||[];return '<section class="import-resolution"><strong>'+esc(d.part.number)+' · '+esc(d.part.name)+'</strong><p>BOM quantity '+d.part.quantity+'. '+esc(d.reason||'A tracked record uses this number. Link it to preserve its shop progress, or keep both records.')+'</p>'+d.existingIds.map(id=>{const i=records.find(i=>i.id===id);return i?'<button class="secondary" data-resolve="'+n+'" data-existing="'+esc(id)+'">Link '+esc(i.name)+' ('+(d.kind==='parts'?i.quantity:i.needed)+')</button>':'';}).join('')+(!d.reason?'<button class="secondary" data-resolve="'+n+'">Keep separate</button>':'')+'</section>';
  }).join('');
 }
 $('#onshape-conflicts').onclick=e=>{const b=e.target.closest('[data-resolve]');if(!b||!lastData)return;try{let workspace=resolveBomConflict(getWorkspace(),lastConflicts[Number(b.dataset.resolve)],b.dataset.existing||'');const result=mergeOnshapeBom(workspace,lastData);if(save(result.workspace)){onChanged();showSummary(result);toast('Import conflict resolved');}}catch(err){report(err.message);}};
 function apply(data){const result=mergeOnshapeBom(getWorkspace(),data);if(result.added||result.updated){if(!save(result.workspace))return null;onChanged();}return result;}
 async function scan(auto=false){if(busy||!configured)return;setBusy(true);try{const data=await json('/api/onshape/parts');lastData=data;if(auto){const result=apply(data);if(result){showSummary(result);$('#onshape-last-sync').textContent='Last sync: '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});if(result.added||result.updated)toast(`Onshape: ${result.added} new items, ${result.updated} BOM updates`);if(result.conflicts.length)toast('Onshape skipped conflicting part numbers. Review the import panel.');}return;}
   preview=data;const result=mergeOnshapeBom(getWorkspace(),data);showSummary(result);const purchased=data.cots||[];$('#onshape-results').innerHTML=`<p>${data.parts.length} manufacturing parts · ${purchased.length} COTS items · ${data.ignored} rows skipped (assemblies, excluded or missing part details).</p><div class="onshape-list">${[...data.parts.map(p=>({...p,label:p.number})),...purchased.map(p=>({...p,label:'COTS · '+p.vendor+' · '+(p.number||'No part number')}))].map(p=>`<div><strong>${esc(p.label)}</strong><span>${esc(p.name)} · Qty ${p.quantity}</span></div>`).join('')}</div>`;$('#onshape-import').hidden=!(data.parts.length+purchased.length);

  }catch(err){report(err.message);if(auto)toast('Onshape auto-import failed. Open Onshape import for details.');preview=null;}finally{setBusy(false);}}
 $('#open-onshape').onclick=async()=>{$('#onshape-dialog').showModal();await checkConnection();};
 $('#close-onshape').onclick=()=>$('#onshape-dialog').close();$('#onshape-scan').onclick=()=>scan();
 $('#onshape-import').onclick=()=>{if(!preview)return;try{const result=apply(preview);if(!result)return;showSummary(result);$('#onshape-last-sync').textContent='Last sync: '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});toast(`Imported ${result.added} new items; updated ${result.updated}`);preview=null;$('#onshape-import').hidden=true;}catch(err){report(err.message);}setBusy(false);};
 $('#onshape-auto').onchange=async e=>{automatic=e.target.checked;try{localStorage.setItem('frc7028-onshape-auto',String(automatic));}catch{toast('Could not remember the auto-import preference.');}if(automatic){$('#onshape-dialog').close();await scan(true);}};
 const timer=setInterval(()=>{if(automatic&&document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))scan(true);},300000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 // A prior opt-in is restored only after the server confirms configuration.
 try{automatic=localStorage.getItem('frc7028-onshape-auto')==='true';}catch{}
 if(automatic)checkConnection().then(ready=>{if(ready){$('#onshape-auto').checked=true;if(!document.querySelector('dialog[open]'))scan(true);}});
}

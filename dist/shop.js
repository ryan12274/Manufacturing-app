import {revisionControls} from './part-revisions.js';
import {overdueDays} from './manufacturing.js';
import {STATUSES} from './model.js';
import {partColorDot} from './part-colors.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function studentLabel(name){
 const words=name.trim().split(/\s+/);
 return words.length>1?words[0]+' '+Array.from(words.at(-1))[0]+'.':words[0];
}
function partCard(p,stage,dateLabel,isAdmin){
 isAdmin=isAdmin&&!p.revisionArchived;
 const student=p.assignedTo||p.owner||'',late=overdueDays(p)>0;
 const drag=isAdmin?'<button type="button" class="part-drag-handle" data-drag-handle aria-label="Move '+esc(p.name)+' to another stage" title="Drag to move, or click to choose a stage"><svg viewBox="0 0 12 28" width="12" height="28" aria-hidden="true" focusable="false"><g fill="currentColor">'+[3,10,17,24].map(y=>'<circle cx="3" cy="'+y+'" r="1.7"/><circle cx="9" cy="'+y+'" r="1.7"/>').join('')+'</g></svg></button>':'';
 const menu=isAdmin?'<details class="card-menu"><summary aria-label="Stage actions for '+esc(p.name)+'">Choose stage</summary><label>Move to<select data-status="'+esc(p.id)+'" aria-label="Stage for '+esc(p.name)+'">'+STATUSES.map(s=>'<option '+(s===stage?'selected':'')+'>'+s+'</option>').join('')+'</select></label></details>':'';
 const due=p.due?'Due '+dateLabel(p.due):'';
 return '<article data-part-id="'+esc(p.id)+'" class="shop-card compact-card '+(isAdmin?'is-movable':'')+' '+(p.blocked?'is-blocked':'')+' '+(late?'is-overdue':'')+'">'+drag+'<div class="compact-card-copy"><div class="compact-card-identity">'+partColorDot(p.color)+'<button class="part-name" data-edit="'+esc(p.id)+'" title="'+esc(p.name)+'">'+esc(p.name)+'</button></div><div class="compact-card-meta"><span class="part-number">'+esc(p.number||'No number')+'</span><span class="card-subsystem">('+esc(p.subsystem||'No subsystem')+')</span></div>'+((p.blocked||late)?'<div class="compact-card-flags">'+(p.blocked?'<span class="blocked-tag" title="'+esc(p.blockReason||'Blocked')+'">Blocked</span>':'')+(late?'<span class="overdue-badge" title="'+esc(due)+'">Overdue</span>':'')+'</div>':'')+'</div><span class="student-badge '+(student?'':'is-unassigned')+'" title="'+esc(student||'Unassigned')+'" aria-label="Assigned student: '+esc(student||'Unassigned')+'">'+esc(student?studentLabel(student):'Unassigned')+'</span>'+revisionControls(p,isAdmin)+menu+'</article>';
}
export function shopBoard(parts,dateLabel,{isAdmin=false}={}){
 return '<div class="shop-board">'+STATUSES.map((stage,index)=>{
  const rows=parts.filter(p=>p.status===stage).sort((a,b)=>Number(b.blocked)-Number(a.blocked)||(a.due||'9999').localeCompare(b.due||'9999'));
  return '<section class="shop-lane lane-'+index+'" data-drop-stage="'+stage+'" aria-label="'+stage+'"><h3><span>'+stage+'</span><span class="lane-count">'+rows.length+'</span></h3><div class="shop-lane-cards">'+(rows.map(p=>partCard(p,stage,dateLabel,isAdmin)).join('')||'<p class="lane-empty">No parts</p>')+'</div></section>';
 }).join('')+'</div>';
}

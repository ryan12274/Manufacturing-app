import {overdueDays} from './manufacturing.js';
import {STATUSES} from './model.js';
import {partColorDot,partColorName} from './part-colors.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const PART_COLUMNS=[['name','Part name and number'],['subsystem','Subsystem'],['status','Stage'],['material','Material'],['color','Color'],['student','Student'],['due','Due']];
export function sortParts(parts,key='name',direction='asc'){
 const value=p=>key==='color'?partColorName(p.color):key==='student'?p.assignedTo||p.owner||'':key==='name'?p.name+' '+p.number:p[key]||'';
 return [...parts].sort((a,b)=>{
  if(key==='due'&&(!a.due||!b.due))return Number(!a.due)-Number(!b.due);
  const result=key==='status'?STATUSES.indexOf(a.status)-STATUSES.indexOf(b.status):String(value(a)).localeCompare(String(value(b)),undefined,{numeric:true,sensitivity:'base'});
  return (direction==='desc'?-1:1)*result;
 });
}
export function partsRegister(parts,sort={key:'name',direction:'asc'}){
 return `<div class="table-wrap"><table class="register-table"><thead><tr>${PART_COLUMNS.map(([key,label])=>`<th scope="col" aria-sort="${sort.key===key?(sort.direction==='asc'?'ascending':'descending'):'none'}"><button class="column-sort" data-sort="${key}">${label}${sort.key===key?` <span aria-hidden="true">${sort.direction==='asc'?'▴':'▾'}</span>`:''}</button></th>`).join('')}</tr></thead><tbody>${sortParts(parts,sort.key,sort.direction).map(p=>`<tr class="${overdueDays(p)?'is-overdue':''}"><td><button class="part-name" data-edit="${esc(p.id)}">${esc(p.name)}</button><div class="part-number">${esc(p.number||'No number')}${p.blocked?' <span class="blocked-tag">Blocked</span>':''}</div></td><td>${esc(p.subsystem||'Not set')}</td><td><span class="status ${p.status==='Done'?'complete':''}">${esc(p.status)}</span></td><td>${esc(p.material||'Not set')}</td><td class="part-color-cell">${partColorDot(p.color)}</td><td>${esc(p.assignedTo||p.owner||'Unassigned')}</td><td class="${overdueDays(p)?'due-overdue':''}">${p.due?esc(new Date(p.due+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})):'Not set'}</td></tr>`).join('')}</tbody></table></div>`;
}

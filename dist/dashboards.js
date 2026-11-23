import {STATUSES} from './model.js';
import {productionSummary} from './manufacturing.js';
import {partColorDot} from './part-colors.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const DASHBOARDS=['Prototyping','Design','Manufacturing','Assembly','Programming'];
export function productionDashboard(parts){
 const s=productionSummary(parts),total=parts.length;
 return `<div class="production-progress"><strong>${s.finished}/${s.total} Parts Made</strong><span>${s.percent}%</span><progress value="${s.finished}" max="${s.total||1}" aria-label="Parts made"></progress></div><div class="production-counts">${[...STATUSES,'Blocked'].map(stage=>{const count=parts.filter(p=>stage==='Blocked'?p.blocked:p.status===stage).length;return `<div class="stage-stat" role="progressbar" aria-label="${stage}" aria-valuenow="${count}" aria-valuemin="0" aria-valuemax="${total||1}" style="--fill:${total?count/total*100:0}%"><strong>${count}</strong> ${stage}</div>`;}).join('')}</div>`;
}
export function assignedTasks(workspace,identity){
 const email=identity?.email?.trim().toLowerCase();
 if(!email)return [];
 const names=new Set(workspace.students.filter(s=>s.active&&s.email?.toLowerCase()===email).map(s=>s.name));
 return workspace.parts.filter(p=>p.status!=='Done'&&names.has(p.assignedTo||p.owner));
}
export function todoTable(workspace,identity){
 const rows=assignedTasks(workspace,identity);
 return `<section class="admin-section"><h2>Todo</h2><p class="helper">Tasks assigned to your account across all projects.</p>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Part name and number</th><th>Project</th><th>Subsystem</th><th>Stage</th><th>Color</th><th>Due</th></tr></thead><tbody>${rows.map(p=>`<tr><td><button class="part-name" data-task="${esc(p.id)}">${esc(p.name)}</button><div class="part-number">${esc(p.number)}</div></td><td>${esc(workspace.projects.find(x=>x.id===p.projectId)?.name)} · ${esc(workspace.projects.find(x=>x.id===p.projectId)?.year)}</td><td>${esc(p.subsystem||'Not set')}</td><td>${esc(p.status)}${p.blocked?' · Blocked':''}</td><td class="part-color-cell">${partColorDot(p.color)}</td><td>${esc(p.due||'Not set')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><h3>No assigned tasks</h3><p>Your project manager assigns students to parts. An admin can link a student’s account email in the student roster.</p></div>'}</section>`;
}

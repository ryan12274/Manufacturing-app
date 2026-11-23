// Pointer dragging works with a mouse and the shop board's touch screen.
// All moves are handed back to the same stage-change flow as the buttons.
export function initBoardDrag({root,canMove,getPart,onMove,onUnavailable}){
 let drag=null,frame=0,ignoreClickUntil=0;
 const openPicker=card=>{const menu=card.querySelector('.card-menu');if(menu){menu.open=true;menu.querySelector('select')?.focus();}};
 const laneAt=(x,y)=>{const lane=document.elementFromPoint(x,y)?.closest('[data-drop-stage]');return lane&&root.contains(lane)?lane:null;};
 function highlight(lane){
  for(const el of root.querySelectorAll('.is-drop-target'))if(el!==lane)el.classList.remove('is-drop-target');
  lane?.classList.add('is-drop-target');
 }
 function tick(){
  if(!drag?.started)return;
  const {x,y,ghost}=drag;ghost.style.transform=`translate(${x+14}px,${y+14}px)`;
  const lane=laneAt(x,y);highlight(lane);
  // Scroll long lanes and wide boards without letting the drag leave the screen.
  const cards=lane?.querySelector('.shop-lane-cards'),board=lane?.closest('.shop-board');
  if(cards){const r=cards.getBoundingClientRect();cards.scrollBy(0,y>r.bottom-32?10:y<r.top+32?-10:0);}
  if(board){const r=board.getBoundingClientRect();board.scrollBy(x>r.right-40?10:x<r.left+40?-10:0,0);}
  window.scrollBy(0,y>innerHeight-40?10:y<80?-10:0);
  frame=requestAnimationFrame(tick);
 }
 function clear(){
  const previous=drag;drag=null;cancelAnimationFrame(frame);highlight(null);
  previous?.card.classList.remove('is-dragging');previous?.ghost?.remove();
  document.body.classList.remove('moving-part');
  if(previous&&root.hasPointerCapture(previous.pointerId))root.releasePointerCapture(previous.pointerId);
  return previous;
 }
 root.addEventListener('pointerdown',e=>{
  const card=e.target.closest('[data-part-id]'),handle=e.target.closest('[data-drag-handle]');
  if(!card||!root.contains(card)||e.button!==0||e.isPrimary===false||drag)return;
  if(!handle&&(e.pointerType==='touch'||e.target.closest('button,a,input,select,textarea,summary,details')))return;
  if(!canMove()){if(handle)onUnavailable();return;}
  const part=getPart(card.dataset.partId);if(!part)return;
  e.preventDefault();root.setPointerCapture(e.pointerId);
  drag={id:part.id,original:JSON.stringify(part),card,handle,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,started:false};
 });
 root.addEventListener('pointermove',e=>{
  if(!drag||drag.pointerId!==e.pointerId)return;
  drag.x=e.clientX;drag.y=e.clientY;
  if(!drag.started&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>=8){
   drag.started=true;drag.card.classList.add('is-dragging');document.body.classList.add('moving-part');
   const ghost=document.createElement('div');ghost.className='part-drag-preview';ghost.textContent=getPart(drag.id)?.name||'Part';ghost.setAttribute('aria-hidden','true');document.body.append(ghost);drag.ghost=ghost;tick();
  }
 });
 root.addEventListener('pointerup',e=>{
  if(!drag||drag.pointerId!==e.pointerId)return;
  const lane=laneAt(e.clientX,e.clientY),moved=clear();
  if(!moved.started){if(moved.handle){ignoreClickUntil=performance.now()+350;e.preventDefault();openPicker(moved.card);}return;}
  ignoreClickUntil=performance.now()+350;e.preventDefault();
  if(lane)onMove(moved.id,lane.dataset.dropStage,moved.original);
 });
 root.addEventListener('pointercancel',clear);
 root.addEventListener('lostpointercapture',()=>{if(drag)clear();});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();clear();}});
 // The handle also offers the existing stage picker for keyboard users.
 root.addEventListener('click',e=>{
  const handle=e.target.closest('[data-drag-handle]');if(!handle)return;
  e.preventDefault();if(performance.now()<ignoreClickUntil)return;
  openPicker(handle.closest('[data-part-id]'));
 });
}

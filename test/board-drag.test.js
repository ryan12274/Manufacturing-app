import test from 'node:test';
import assert from 'node:assert/strict';
import {initBoardDrag} from '../dist/board-drag.js';

// Exercise the pointer lifecycle without a browser or a shared team workspace.
function board({editable=true}={}){
 const events={},moves=[],classes=()=>({values:new Set(),add(v){this.values.add(v);},remove(v){this.values.delete(v);}});
 let captured=false,overLane=true,focused=false,unavailable=0;
 const menu={open:false,querySelector:()=>({focus(){focused=true;}})};
 const card={dataset:{partId:'rail'},classList:classes(),querySelector:()=>menu};
 const handle={closest:s=>s==='[data-part-id]'?card:s==='[data-drag-handle]'?handle:null};
 const plain={closest:s=>s==='[data-part-id]'?card:null};
 const control={closest:s=>s==='[data-part-id]'?card:s.startsWith('button,')?control:null};
 const lane={dataset:{dropStage:'Preparing'},classList:classes(),closest:s=>s==='[data-drop-stage]'?lane:null,querySelector:()=>null};
 const root={addEventListener:(name,fn)=>events[name]=fn,contains:el=>el===lane||el===card,querySelectorAll:()=>[lane],setPointerCapture(){captured=true;},hasPointerCapture:()=>captured,releasePointerCapture(){captured=false;}};
 const previous={document:globalThis.document,window:globalThis.window,innerHeight:globalThis.innerHeight,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 globalThis.document={elementFromPoint:()=>overLane?lane:null,body:{classList:classes(),append(){}},createElement:()=>({style:{},setAttribute(){},remove(){}})};
 globalThis.window={scrollBy(){}};globalThis.innerHeight=900;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 const part={id:'rail',name:'Left rail',status:'Not started'};
 initBoardDrag({root,canMove:()=>editable,getPart:()=>part,onMove:(...args)=>moves.push(args),onUnavailable:()=>unavailable++});
 return {moves,card,handle,plain,control,menu,part,focused:()=>focused,unavailable:()=>unavailable,outside(){overLane=false;},event(name,extra={}){events[name]({target:handle,button:0,isPrimary:true,pointerId:1,pointerType:'mouse',clientX:100,clientY:200,preventDefault(){},...extra});},restore(){for(const [k,v]of Object.entries(previous))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}};
}

test('drag delivers one stage request with the original snapshot, and a handle tap opens the picker',()=>{
 const b=board();try{
  b.event('pointerdown');b.event('pointerup');assert.equal(b.menu.open,true);assert.equal(b.focused(),true);assert.equal(b.moves.length,0);
  b.event('pointerdown');b.event('pointermove',{clientX:350});b.part.status='Cutting';b.event('pointerup',{clientX:350});
  assert.equal(b.moves.length,1);assert.deepEqual(b.moves[0],['rail','Preparing',JSON.stringify({id:'rail',name:'Left rail',status:'Not started'})]);
  b.event('pointerup');assert.equal(b.moves.length,1);
 }finally{b.restore();}
});

test('touch handles move cards, while scrolling card content and using controls never starts a move',()=>{
 const b=board();try{
  for(const [target,pointerType]of [[b.plain,'touch'],[b.control,'mouse']]){b.event('pointerdown',{target,pointerType});b.event('pointermove',{clientX:350});b.event('pointerup');}
  assert.equal(b.moves.length,0);
  b.event('pointerdown',{pointerType:'touch'});b.event('pointermove',{pointerType:'touch',clientX:350});b.event('pointerup',{pointerType:'touch',clientX:350});assert.equal(b.moves.length,1);
 }finally{b.restore();}
});

test('read-only, outside, canceled and Escape drags never submit a stage change',()=>{
 for(const reason of ['read-only','outside','pointercancel','Escape']){
  const b=board({editable:reason!=='read-only'});try{
   b.event('pointerdown');b.event('pointermove',{clientX:350});
   if(reason==='outside')b.outside();if(reason==='pointercancel')b.event('pointercancel');if(reason==='Escape')b.event('keydown',{key:'Escape'});
   b.event('pointerup',{clientX:350});assert.equal(b.moves.length,0,reason);assert.equal(b.card.classList.values.has('is-dragging'),false);
   if(reason==='read-only')assert.equal(b.unavailable(),1);
  }finally{b.restore();}
 }
});

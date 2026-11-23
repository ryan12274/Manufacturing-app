import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedWorkspace} from '../dist/shared-workspace.js';
import {emptyWorkspace} from '../dist/workspace-cleanup.js';

test('import save waits for server confirmation, reports rejection, and retains recovery data',async()=>{
 const originals=Object.fromEntries(['fetch','localStorage','window','document','setInterval'].map(k=>[k,globalThis[k]]));
 const store=new Map();
 Object.assign(globalThis,{localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k),get length(){return store.size;},key:n=>[...store.keys()][n]},window:{addEventListener(){}},document:{hidden:false,querySelector:()=>null},setInterval:()=>0});
 let finish,loads=0;
 const workspace=emptyWorkspace();
 globalThis.fetch=async(path,options)=>options.method==='GET'?Response.json({workspace,initialized:true,revision:1,isAdmin:true,role:'admin'}):new Promise(resolve=>{finish=resolve;});
 try{
  const shared=sharedWorkspace({getLocal:()=>workspace,onLoad:()=>loads++,onRole(){},onError(){}});
  await shared.start();let confirmed=false;
  const pending=shared.saveConfirmed(workspace).then(()=>{confirmed=true;});
  await new Promise(r=>setImmediate(r));assert.equal(confirmed,false);assert.equal(loads,1);assert.equal(shared.ready,false);
  await assert.rejects(shared.saveConfirmed(workspace),/sync status/);
  finish(Response.json({workspace,revision:2,isAdmin:true,role:'admin'}));await pending;
  assert.equal(confirmed,true);assert.equal(loads,2);assert.equal(shared.ready,true);
  assert.ok(![...store.keys()].some(k=>k.startsWith('frc7028-pending-save-v2')));
  const failure=assert.rejects(shared.saveConfirmed(workspace),/BOM record changed/);
  await new Promise(r=>setImmediate(r));finish(Response.json({error:'BOM record changed'},{status:409}));await failure;
  assert.equal(loads,2);assert.equal(shared.ready,false);assert.ok([...store.keys()].some(k=>k.startsWith('frc7028-pending-save-v2')));
 }finally{Object.assign(globalThis,originals);}
});

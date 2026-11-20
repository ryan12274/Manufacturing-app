import {selectWcpVariant,toOrder} from './cots-model.js';
export async function prepareWcpOrder(items,resolve){
 const results=new Array(items.length);let next=0;
 async function worker(){while(next<items.length){const index=next++,item=items[index];try{
  const data=await resolve(item);
  const variant=selectWcpVariant(data.variants,{...item,url:item.url||data.url,number:item.url?item.number:data.number||item.number});
  if(!variant.available)throw Error('This product option is unavailable.');
  results[index]={item,variant:variant.id,quantity:Math.ceil(toOrder(item)/(item.packSize||1)),title:data.title||item.name,url:data.url||item.url};
 }catch(err){results[index]={item,message:err.message};}}}
 await Promise.all(Array.from({length:Math.min(4,items.length)},worker));
 return {ready:results.filter(r=>!r.message),review:results.filter(r=>r.message)};
}

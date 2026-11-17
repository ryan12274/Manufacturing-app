import test from 'node:test';
import assert from 'node:assert/strict';
import {wcpProductData} from '../worker/vendors.js';
import {prepareWcpOrder} from '../dist/wcp-cart.js';
import {wcpCartLink} from '../dist/cots-model.js';
const item={id:'motor',name:'Motor',number:'WCP-0940',url:'',needed:6,ordered:2,received:1};
const product=(sku='WCP-0940',available=true)=>({title:'Kraken X60',variants:[{id:123,sku,available}]});
test('BOM SKU without a link resolves to an exact WCP variant using public GET only',async()=>{
 let calls=0;const data=await wcpProductData('',async(url,options)=>{calls++;assert.equal(url,'https://wcproducts.com/products/wcp-0940.js');assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.ok(!options.headers.Authorization);return Response.json(product());},item.number);
 assert.equal(calls,1);assert.equal(data.number,item.number);assert.equal(data.variants[0].sku,item.number);assert.match(data.url,/wcp-0940$/);
});
test('search fallback verifies SKU and rejects kits that merely mention it',async()=>{
 const calls=[];const fetcher=async(url)=>{calls.push(String(url));if(String(url).includes('/wcp-0940.js'))return new Response('',{status:404});if(String(url).includes('/search/suggest.json'))return Response.json({resources:{results:{products:[{handle:'motor'},{handle:'kit'}]}}});return Response.json(product(String(url).includes('/motor.js')?'WCP-0940':'KIT-1234'));};
 const data=await wcpProductData('',fetcher,item.number);assert.match(data.url,/\/motor$/);assert.equal(calls.length,4);
 await assert.rejects(()=>wcpProductData('',async url=>String(url).includes('/search/')?Response.json({resources:{results:{products:[{handle:'kit'}]}}}):Response.json(product('KIT-1234')),item.number),/no unique purchasable match/);
});
test('invalid or multiple SKUs never trigger outbound requests',async()=>{
 for(const number of ['REV-21-2103','WCP-0940 WCP-0254','','https://evil.example'])await assert.rejects(()=>wcpProductData('',()=>{assert.fail('must not fetch');},number),/one exact WCP part number/);
});
test('cart includes only exact available matches, reports failures, and preserves order progress',async()=>{
 const items=[item,{...item,id:'missing',number:'WCP-0785'},{...item,id:'unavailable',number:'WCP-0999'}],before=structuredClone(items);
 const result=await prepareWcpOrder(items,async i=>{if(i.id==='missing')throw Error('No match');return {...product(i.number,i.id!=='unavailable'),number:i.number,url:'https://wcproducts.com/products/motor',variants:product(i.number,i.id!=='unavailable').variants.map(v=>({...v,id:String(v.id)}))};});
 assert.equal(result.ready.length,1);assert.equal(result.ready[0].quantity,4);assert.equal(result.review.length,2);assert.deepEqual(items,before);assert.match(wcpCartLink(result.ready),/123:4/);
});
test('SKU lookup cannot quietly substitute a different SKU or an empty product group',async()=>{
 for(const sku of ['WCP-1111','']){const result=await prepareWcpOrder([item],async()=>({...product(sku),url:'https://wcproducts.com/products/motor',number:item.number}));assert.equal(result.ready.length,0);assert.equal(result.review.length,1);}
});

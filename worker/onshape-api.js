import {mapOnshapeBom} from '../dist/onshape-import.js';
export function onshapeSettings(env){
 const missing=[];if(!env.ONSHAPE_ACCESS_KEY)missing.push('API access key');if(!env.ONSHAPE_SECRET_KEY)missing.push('API secret key');if(!env.ONSHAPE_SOURCE_URLS)missing.push('Assembly BOM source');
 if(missing.length)return {configured:false,missing};
 const base=new URL(env.ONSHAPE_BASE_URL||'https://cad.onshape.com');
 if(base.protocol!=='https:'||!base.hostname.endsWith('.onshape.com')||base.port||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Invalid Onshape server configuration.');
 let urls;try{urls=JSON.parse(env.ONSHAPE_SOURCE_URLS);}catch{throw new Error('Onshape source configuration must be a JSON array of document URLs.');}
 if(!Array.isArray(urls)||!urls.length||urls.length>5)throw new Error('Configure between one and five Onshape source documents.');
 const sources=urls.map(value=>{
  const url=new URL(value);const match=url.pathname.match(/^\/documents\/([a-f0-9]{24})\/([wvm])\/([a-f0-9]{24})\/e\/([a-f0-9]{24})\/?$/i);
  if(url.origin!==base.origin||url.username||url.password||!match)throw new Error('Onshape sources must be assembly BOM URLs on the configured server.');
  return {origin:base.origin,documentId:match[1],reference:match[2],referenceId:match[3],elementId:match[4]||'',configuration:url.searchParams.get('configuration')||''};
 });
 return {configured:true,missing:[],sources};
}
export async function onshapeHeaders(url,env,{date=new Date().toUTCString(),nonce=crypto.randomUUID().replaceAll('-','')}={}){
 const contentType='application/json';
 const message=['get',nonce,date,contentType,url.pathname,url.search.slice(1),''].join('\n').toLowerCase();
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.ONSHAPE_SECRET_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message)));
 const signature=btoa(String.fromCharCode(...bytes));
 return {'Accept':'application/json','Content-Type':contentType,'Date':date,'On-Nonce':nonce,'Authorization':`On ${env.ONSHAPE_ACCESS_KEY}:HmacSHA256:${signature}`};
}
export async function readOnshapeParts(env,fetcher=fetch){
 const settings=onshapeSettings(env);if(!settings.configured)throw new Error('Onshape is not connected. Configure the API keys and source documents first.');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
 const parts=[];let ignored=0;
 try{for(const source of settings.sources){
  // BOM-only read. Never scan documents, fetch part metadata, or generate a BOM.
  const url=new URL(`${source.origin}/api/v16/assemblies/d/${source.documentId}/${source.reference}/${source.referenceId}/e/${source.elementId}/bom`);
  url.searchParams.set('generateIfAbsent','false');url.searchParams.set('indented','false');url.searchParams.set('includeExcluded','false');url.searchParams.set('includeTopLevelAssemblyRow','false');url.searchParams.set('onlyVisibleColumns','false');if(source.configuration)url.searchParams.set('configuration',source.configuration);
  const response=await fetcher(url,{method:'GET',headers:await onshapeHeaders(url,env),redirect:'manual',signal:controller.signal});
  if(!response.ok){if(response.status===401||response.status===403)throw new Error('Onshape rejected the credentials or source-document permissions.');if(response.status===429)throw new Error('Onshape rate limit reached. Try again later.');throw new Error(`Onshape could not read a configured source (HTTP ${response.status}).`);}
  if(Number(response.headers.get('Content-Length'))>4_000_000)throw new Error('Onshape response is too large. Narrow the configured source.');
  const reader=response.body.getReader();const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4_000_000){await reader.cancel();throw new Error('Onshape response is too large. Narrow the configured source.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let rows;try{rows=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('Onshape returned an invalid JSON response.');}
  const mapped=mapOnshapeBom(rows,source);parts.push(...mapped.parts);ignored+=mapped.ignored;
  if(parts.length>10000)throw new Error('Too many matching parts. Narrow the configured sources.');
 }return {parts,ignored,sourceCount:settings.sources.length,fetchedAt:new Date().toISOString()};}
 catch(err){if(err.name==='AbortError')throw new Error('Onshape timed out. Try again later.');throw err;}
 finally{clearTimeout(timer);}
}

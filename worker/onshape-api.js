import {mapOnshapeBom} from '../dist/onshape-import.js';
import {partColorHex,generalizePartColor,onshapeAppearanceHex} from '../dist/part-colors.js';
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
function appearanceUrl(target,source){
 if(!target)return null;
 const id=value=>typeof value==='string'&&/^[a-f0-9]{24}$/i.test(value);
 if(!id(target.documentId)||!id(target.elementId)||typeof target.partId!=='string'||!target.partId||target.partId.length>500)return null;
 const type={workspace:'w',version:'v',microversion:'m',w:'w',v:'v',m:'m'};
 let reference=type[String(target.reference||'').toLowerCase()],referenceId=target.referenceId;
 if(!reference||!id(referenceId)){
  try{const link=new URL(target.viewHref),match=link.pathname.match(/^\/documents\/([a-f0-9]{24})\/([wvm])\/([a-f0-9]{24})\/e\/([a-f0-9]{24})\/?$/i);
   if(link.origin===source.origin&&!link.username&&!link.password&&match&&match[1]===target.documentId&&match[4]===target.elementId){reference=match[2].toLowerCase();referenceId=match[3];}
  }catch{}
 }
 if((!reference||!id(referenceId))&&target.documentId===source.documentId){reference=source.reference;referenceId=source.referenceId;}
 if(!reference||!id(referenceId))return null;
 const url=new URL(source.origin+'/api/v16/metadata/d/'+target.documentId+'/'+reference+'/'+referenceId+'/e/'+target.elementId+'/p/'+encodeURIComponent(target.partId));
 if(target.configuration)url.searchParams.set('configuration',target.configuration);
 if(id(target.elementMicroversionId))url.searchParams.set('elementMicroversionId',target.elementMicroversionId);
 if(reference==='v'&&target.documentId!==source.documentId)url.searchParams.set('linkDocumentId',source.documentId);
 url.searchParams.set('includeComputedProperties','false');url.searchParams.set('thumbnail','false');
 return url;
}
async function readOnshapeJson(url,env,fetcher,signal,limit){
 const response=await fetcher(url,{method:'GET',headers:await onshapeHeaders(url,env),redirect:'manual',signal});
 if(!response.ok){const message=response.status===401||response.status===403?'Onshape rejected the credentials or source-document permissions.':response.status===429?'Onshape rate limit reached. Try again later.':'Onshape could not read a configured source (HTTP '+response.status+').';throw Object.assign(new Error(message),{status:response.status});}
 if(Number(response.headers.get('Content-Length'))>limit)throw new Error('Onshape response is too large. Narrow the configured source.');
 const reader=response.body.getReader(),chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('Onshape response is too large. Narrow the configured source.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('Onshape returned an invalid JSON response.');}
}
export function onshapeSourceOptions(settings){return (settings.sources||[]).map((s,n)=>{const url=new URL(s.origin+'/documents/'+s.documentId+'/'+s.reference+'/'+s.referenceId+'/e/'+s.elementId);if(s.configuration)url.searchParams.set('configuration',s.configuration);return {url:url.href,label:'BOM '+(n+1)+' · '+s.documentId.slice(0,8)+'…'};});}
export async function readOnshapeParts(env,fetcher=fetch,{sourceUrl=''}={}){
 if(sourceUrl){if(typeof sourceUrl!=='string'||sourceUrl.length>3000)throw Error('Invalid Onshape BOM link.');env={...env,ONSHAPE_SOURCE_URLS:JSON.stringify([sourceUrl])};}
 const settings=onshapeSettings(env);if(!settings.configured)throw new Error('Onshape is not connected. Configure the API keys and source documents first.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 const parts=[],cots=[],colors=[];let ignored=0;
 try{
  for(const source of settings.sources){
   // The configured BOM remains the only discovery source. Appearance reads below
   // target individual manufactured leaves that this BOM explicitly identifies.
   const url=new URL(source.origin+'/api/v16/assemblies/d/'+source.documentId+'/'+source.reference+'/'+source.referenceId+'/e/'+source.elementId+'/bom');
   url.searchParams.set('generateIfAbsent','false');url.searchParams.set('indented','false');url.searchParams.set('includeExcluded','false');url.searchParams.set('includeTopLevelAssemblyRow','false');url.searchParams.set('onlyVisibleColumns','false');if(source.configuration)url.searchParams.set('configuration',source.configuration);
   const mapped=mapOnshapeBom(await readOnshapeJson(url,env,fetcher,controller.signal,4_000_000),source);
   for(const incoming of mapped.parts){const {appearanceSource,...part}=incoming;parts.push(part);if(!part.colorHex)colors.push({part,url:appearanceUrl(appearanceSource,source)});}
   cots.push(...mapped.cots);ignored+=mapped.ignored;
   if(parts.length+cots.length>10000)throw new Error('Too many matching parts. Narrow the configured sources.');
  }
  let cursor=0,unavailable=false;const cache=new Map(),missing=new Set();
  async function colorWorker(){
   while(cursor<colors.length){
    if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
    const {part,url}=colors[cursor++];let hex='';
    if(url){
     if(!cache.has(url.href)&&!unavailable)cache.set(url.href,(async()=>{
      try{return onshapeAppearanceHex(await readOnshapeJson(url,env,fetcher,controller.signal,512_000));}
      catch(err){if(err.name==='AbortError')throw err;if(!err.status||[401,403,429].includes(err.status)||err.status>=500)unavailable=true;return '';}
     })());
     if(cache.has(url.href))hex=await cache.get(url.href);
    }
    if(hex){part.colorHex=partColorHex(hex);part.color=generalizePartColor(hex);}else missing.add(part.key);
   }
  }
  await Promise.all(Array.from({length:Math.min(4,colors.length)},()=>colorWorker()));
  const colorWarnings=missing.size?['Color unavailable for '+missing.size+' manufactured BOM part'+(missing.size===1?'':'s')+'. Existing colors are retained; missing colors can be assigned in part details.']:[];
  return {parts,cots,ignored,colorWarnings,sourceKeys:settings.sources.map(s=>JSON.stringify([s.origin,s.documentId,s.reference,s.referenceId,s.elementId,s.configuration||''])),sourceCount:settings.sources.length,fetchedAt:new Date().toISOString()};
 }catch(err){if(err.name==='AbortError')throw new Error('Onshape timed out. Try again later.');throw err;}
 finally{clearTimeout(timer);}
}

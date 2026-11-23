import {workspaceApi} from '../worker/workspace-api.js';
import {onshapeSettings,readOnshapeParts} from '../worker/onshape-api.js';
import {wcpProductData} from '../worker/vendors.js';
import {postgresWorkspaceDatabase} from './netlify-database.js';

const emails=value=>String(value||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
export function publicBoard(w){
 const projects=w.projects.filter(p=>!p.archived),active=new Set(projects.map(p=>p.id));
 const partFields=['id','projectId','name','number','subsystem','material','color','process','quantity','completedQty','acceptedQty','spareTarget','reworkQty','scrapQty','owner','assignedTo','priority','due','status','readiness','blocked','blockReason','blockOwner','blockNext','blockDate','blockExpected','location','revision','sourceMissing'];
 const cotsFields=['id','projectId','name','number','vendor','needed','ordered','received','stock','allocated','packSize','location','subsystem','url','eta'];
 return {version:1,schemaVersion:2,demo:false,projects,students:[],materials:[],onshapeProjectId:'',
  parts:w.parts.filter(p=>active.has(p.projectId)).map(p=>({...Object.fromEntries(partFields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),notes:'',cad:'',instructions:'',history:[],...(p.approval?{approval:{status:p.approval.status,reviewedBy:'Admin',...(p.approval.reviewedAt?{reviewedAt:p.approval.reviewedAt}:{})}}:{})})),
  cots:w.cots.filter(p=>active.has(p.projectId)).map(p=>({...Object.fromEntries(cotsFields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),reference:'',notes:''}))};
}
export function netlifyNamespace(env){return env.CONTEXT==='production'?'netlify:production':'netlify:preview:'+String(env.BRANCH||'preview').replace(/[^\w/-]/g,'_');}
export function createNetlifyApi({getUser,getDatabase,getEnv,readBom=readOnshapeParts,readVendor=wcpProductData}){
 return async request=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const reply=(body,status=200)=>Response.json(body,{status,headers});
  try{
   const path=new URL(request.url).pathname,env=getEnv();
   const user=await getUser();
   const email=user?.email?.trim().toLowerCase()||'';
   // Roles come from verified server-managed metadata, never a browser field.
   const roles=new Set(user?.roles||[]);
   const admin=emails(env.ADMIN_EMAILS).includes(email)||roles.has('admin');
   const allowed=admin||roles.has('member')||roles.has('lead')||roles.has('viewer')||['TEAM_MEMBER_EMAILS','LEAD_EMAILS','VIEWER_EMAILS'].some(key=>emails(env[key]).includes(email));
   if(!user?.id||!email||!allowed){
    if(request.method==='GET'&&path==='/api/session')return reply({isAdmin:false,role:'viewer',email,publicView:true});
    if(request.method==='GET'&&path==='/api/workspace'){
     const h=new Headers();h.set('oai-authenticated-user-id','public-board');h.set('oai-authenticated-user-email','public-board@7028.invalid');
     const response=await workspaceApi(new Request(request.url,{headers:h}),{ADMIN_EMAILS:'',VIEWER_EMAILS:'public-board@7028.invalid',DB:postgresWorkspaceDatabase(getDatabase(),netlifyNamespace(env))});
     if(!response.ok)return reply({error:'The board could not be loaded. Retry shortly.'},503);
     const data=await response.json();return reply({...data,workspace:publicBoard(data.workspace),publicView:true});
    }
    return reply({error:email?'Your account is not approved to make changes. Ask an admin to grant access.':'Sign in to make changes.',signInRequired:!email},email?403:401);
   }
   if(!['GET','HEAD'].includes(request.method)){
    const origin=request.headers.get('Origin');
    if(origin!==new URL(request.url).origin)return reply({error:'Open the app on its own site before saving.'},403);
   }
   const serverEnv={...env,ADMIN_EMAILS:admin?email:'',LEAD_EMAILS:roles.has('lead')?email:env.LEAD_EMAILS,VIEWER_EMAILS:roles.has('viewer')?email:env.VIEWER_EMAILS};
   if(['/api/session','/api/workspace','/api/reviews'].includes(path)){
    // Strip all incoming platform-identity headers, including spoofed values.
    const h=new Headers(request.headers);for(const k of [...h.keys()])if(k.startsWith('oai-authenticated-'))h.delete(k);
    h.set('oai-authenticated-user-id',user.id);h.set('oai-authenticated-user-email',email);
    if(path!=='/api/session')serverEnv.DB=postgresWorkspaceDatabase(getDatabase(),netlifyNamespace(env));
    return await workspaceApi(new Request(request,{headers:h}),serverEnv);
   }
   if(path.startsWith('/api/onshape/')){
    if(!admin)return reply({error:'Only admins can access the Onshape import.'},403);
    if(request.method!=='GET')return reply({error:'Only read-only BOM requests are supported.'},405);
    if(path==='/api/onshape/status'){const settings=onshapeSettings(env);return reply({configured:settings.configured,missing:settings.missing,mode:'bom',readOnly:true,sourceCount:settings.sources?.length||0});}
    if(path==='/api/onshape/parts')return reply(await readBom(env));
   }
   if(path==='/api/vendors/wcp/product'){
    if(request.method!=='GET')return reply({error:'Read-only product lookup only.'},405);
    const url=new URL(request.url);return reply(await readVendor(url.searchParams.get('url')||'',fetch,url.searchParams.get('number')||''));
   }
   return reply({error:'Not found'},404);
  }catch(error){
   // Never echo connection strings, signed URLs, credentials or SDK errors.
   console.error('7028 Netlify API failed:',error?.name||'Error');
   return reply({error:'The shared service is unavailable. Your saved attempt is retained; retry shortly.'},503);
  }
 };
}

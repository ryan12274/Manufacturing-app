import {workspaceApi} from '../worker/workspace-api.js';
import {onshapeSettings,readOnshapeParts} from '../worker/onshape-api.js';
import {wcpProductData} from '../worker/vendors.js';
import {postgresWorkspaceDatabase} from './netlify-database.js';

const emails=value=>String(value||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
export function netlifyNamespace(env){return env.CONTEXT==='production'?'netlify:production':'netlify:preview:'+String(env.BRANCH||'preview').replace(/[^\w/-]/g,'_');}
export function createNetlifyApi({getUser,getDatabase,getEnv,readBom=readOnshapeParts,readVendor=wcpProductData}){
 return async request=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const reply=(body,status=200)=>Response.json(body,{status,headers});
  try{
   const path=new URL(request.url).pathname,env=getEnv();
   const user=await getUser();
   if(!user?.id||!user.email)return reply({error:'Sign in to the 7028 workspace.',signInRequired:true},401);
   const email=user.email.trim().toLowerCase();
   // Roles come from verified server-managed metadata, never a browser field.
   const roles=new Set(user.roles||[]);
   const admin=emails(env.ADMIN_EMAILS).includes(email)||roles.has('admin');
   const allowed=admin||roles.has('member')||roles.has('lead')||roles.has('viewer')||['TEAM_MEMBER_EMAILS','LEAD_EMAILS','VIEWER_EMAILS'].some(key=>emails(env[key]).includes(email));
   if(!allowed)return reply({error:'Your account is not approved for this team workspace. Ask an admin to grant access.'},403);
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

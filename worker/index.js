import {onshapeSettings,readOnshapeParts} from './onshape-api.js';
// The build embeds the existing browser files into this module as STATIC_FILES.
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/onshape/')){
   const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
   if(request.method!=='GET')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{...headers,Allow:'GET'}});
   // Sites authenticates visitors before forwarding private-site requests.
   // No client-supplied target URL or keys are accepted by these endpoints.
   try{if(url.pathname==='/api/onshape/status'){const settings=onshapeSettings(env);return new Response(JSON.stringify({configured:settings.configured,mode:'bom',readOnly:true,missing:settings.missing,sourceCount:settings.sources?.length||0}),{headers});}
    if(url.pathname==='/api/onshape/parts')return new Response(JSON.stringify(await readOnshapeParts(env)),{headers});
    return new Response(JSON.stringify({error:'Not found'}),{status:404,headers});
   }catch(err){const message=err.message;const safe=/^(Onshape |Invalid Onshape |Configure |Too many |A matching )/.test(message)?message:'The Onshape connection failed. Check the server configuration.';return new Response(JSON.stringify({error:safe}),{status:502,headers});}
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const file=STATIC_FILES[url.pathname==='/'?'/index.html':url.pathname];
  if(!file)return new Response('Not found',{status:404});
  return new Response(request.method==='HEAD'?null:file.body,{headers:{'Content-Type':file.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
 }
};

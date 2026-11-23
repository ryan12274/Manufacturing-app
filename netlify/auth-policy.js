export function canEnter(session,adminOnly=false){
 return session?.publicView!==true && (adminOnly?session?.isAdmin===true:['admin','lead','member'].includes(session?.role));
}

// Confirmation emails use the canonical site URL, which can differ from preview.
// Carry only an Identity callback to this origin; never follow a pasted URL.
export function callbackHash(value){
 const url=new URL(value);
 if(!['http:','https:'].includes(url.protocol))throw Error('Paste the complete account link from your email.');
 const hash=url.hash;
 const params=new URLSearchParams(hash.slice(1));
 const keys=['confirmation_token','invite_token','recovery_token'];
 const key=keys.find(k=>params.has(k));
 if(!key||[...params.keys()].some(k=>!keys.includes(k))||keys.filter(k=>params.has(k)).length!==1||!params.get(key))throw Error('Paste the complete account link from your email.');
 return '#'+new URLSearchParams({[key]:params.get(key)});
}

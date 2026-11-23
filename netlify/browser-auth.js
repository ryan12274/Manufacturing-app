import {getUser,getSettings,login,logout,oauthLogin,handleAuthCallback,acceptInvite,updateUser} from '@netlify/identity';
const root=document.createElement('main');root.className='auth-screen';root.innerHTML='<section class="auth-card"><span class="team-number">7028</span><h1>Manufacturing</h1><p id="auth-message" role="status">Checking your sign-in…</p><div id="auth-actions"></div></section>';
document.body.replaceChildren(root);
const message=text=>document.getElementById('auth-message').textContent=text;
const actions=document.getElementById('auth-actions');
async function openWorkspace(){const response=await fetch('/api/session',{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||'Could not open the team workspace.');location.reload();}
async function start(){
 try{
  const callback=await handleAuthCallback();
  if(callback?.type==='invite'||callback?.type==='recovery'){
   message('Set your own password to complete this account request.');
   actions.innerHTML='<form id="new-password"><label>New password<input type="password" name="password" minlength="12" autocomplete="new-password" required></label><button class="primary">Set password and sign in</button></form>';
   document.getElementById('new-password').onsubmit=async e=>{e.preventDefault();try{const password=e.target.elements.password.value;if(callback.type==='invite')await acceptInvite(callback.token,password);else await updateUser({password});await openWorkspace();}catch(err){message(err.message);}};return;
  }
  const current=await getUser();
  if(current){
   const response=await fetch('/api/session',{cache:'no-store'}),data=await response.json();if(!response.ok){message(data.error||'Your account cannot open this workspace.');actions.innerHTML='<button class="secondary" id="sign-out">Use another account</button>';document.getElementById('sign-out').onclick=async()=>{await logout();location.reload();};return;}
   document.body.innerHTML=await (await fetch('/app-shell.html',{cache:'no-store'})).text();
   // app-shell contains only body markup, with no executable scripts.
   const signout=document.createElement('button');signout.className='secondary';signout.textContent='Sign out';signout.onclick=async()=>{await logout();location.reload();};document.querySelector('.header-actions')?.append(signout);
   await import('./app.js');return;
  }
  const settings=await getSettings();
  message('Sign in with an approved team account. Preview data is separate from production.');
  actions.innerHTML=(settings.providers.google?'<button id="google-login" class="primary">Continue with Google</button>':'')+'<form id="email-login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Sign in</button></form><p class="helper">New accounts need approval from the team admin. Signing in to the Netlify dashboard does not sign you in to this app.</p>';
  document.getElementById('google-login')?.addEventListener('click',()=>oauthLogin('google'));
  document.getElementById('email-login').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await login(e.target.elements.email.value,e.target.elements.password.value);await openWorkspace();}catch(err){message(err.message);button.disabled=false;}};
 }catch(error){message('Sign-in is unavailable: '+error.message);}
}
start();

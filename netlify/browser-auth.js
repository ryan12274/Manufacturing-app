import {getUser,getSettings,login,logout,oauthLogin,handleAuthCallback,acceptInvite,updateUser,signup,requestPasswordRecovery} from '@netlify/identity';
import {canEnter,callbackHash} from './auth-policy.js';
const root=document.createElement('main');root.className='auth-screen';root.innerHTML='<section class="auth-card"><span class="team-number">7028</span><h1>Manufacturing</h1><p id="hosting-status" role="status">Loading the board…</p></section>';document.body.replaceChildren(root);
async function signIn(current,adminOnly=false){
 if(document.querySelector('dialog[data-hosting-login]'))return;
 const dialog=document.createElement('dialog');dialog.className='auth-card';dialog.innerHTML='<div class="dialog-heading"><h2>Sign in to make changes</h2><button type="button" class="icon-button" aria-label="Close sign in">×</button></div><p class="auth-message" role="status">The board is available without signing in. Editing requires an approved team account.</p><div class="auth-actions"></div>';document.body.append(dialog);dialog.querySelector('.icon-button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.showModal();const say=text=>dialog.querySelector('.auth-message').textContent=text;
 dialog.dataset.hostingLogin='true';
 if(adminOnly){dialog.querySelector('h2').textContent='Admin login';say('Sign in to manage projects, students and finished-part reviews.');}
 try{
  const settings=await getSettings(),actions=dialog.querySelector('.auth-actions');
  actions.innerHTML=(settings.providers.google?'<button class="primary" data-google>Continue with Google</button>':'')+'<form data-login><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Sign in</button></form><button class="secondary" data-recovery>Forgot password?</button>'+(current?'<button class="secondary" data-signout>Use another account</button>':'')+'<details class="account-setup"><summary>First time? Set up your account</summary><p>Account creation does not grant access. Your email must also be approved by an admin.</p>'+(!settings.disableSignup?'<form data-signup><label>Email<input name="email" type="email" autocomplete="username" required></label><label>New password<input name="password" type="password" autocomplete="new-password" required></label><button class="secondary">Create account</button></form>':'<p>Ask an admin for an account invitation.</p>')+'<p>If your email link opens the main site instead of this preview, paste the complete link here.</p><form data-callback><label>Account email link<input name="link" type="url" autocomplete="off" required></label><button class="secondary">Continue account setup</button></form></details>';
  actions.querySelector('[data-google]')?.addEventListener('click',()=>oauthLogin('google'));
  actions.querySelector('[data-signout]')?.addEventListener('click',async()=>{await logout();location.reload();});
  actions.querySelector('[data-login]').onsubmit=async e=>{
   e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
   try{
    await login(e.target.elements.email.value,e.target.elements.password.value);
    e.target.elements.password.value='';
    const r=await fetch('/api/session',{cache:'no-store'}),session=await r.json();
    if(!r.ok||!canEnter(session,adminOnly)){
     await logout();throw Error(adminOnly?'This account does not have admin access.':'This account is not approved to make changes.');
    }
    if(adminOnly)location.assign('/?admin=1');else location.reload();
   }catch(err){say(err.message);button.disabled=false;}
  };
  actions.querySelector('[data-signup]')?.addEventListener('submit',async e=>{
   e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
   try{await signup(e.target.elements.email.value,e.target.elements.password.value);e.target.elements.password.value='';say('Check your email to confirm your account, then sign in.');}
   catch(err){say(err.message);}finally{button.disabled=false;}
  });
  actions.querySelector('[data-recovery]').onclick=async e=>{
   const field=actions.querySelector('[data-login] input[name="email"]');
   if(!field.reportValidity())return;e.target.disabled=true;
   try{await requestPasswordRecovery(field.value);say('If an account exists, a password reset link has been sent.');}
   catch(err){say(err.message);}finally{e.target.disabled=false;}
  };
  actions.querySelector('[data-callback]').onsubmit=e=>{e.preventDefault();try{location.assign('/?admin='+(adminOnly?'1':'0')+callbackHash(e.target.elements.link.value));}catch(err){say(err.message);}};
 }catch(err){say('Sign-in is not configured yet. The board remains available.');}
}
async function start(){
 try{
 const callback=await handleAuthCallback();if(callback?.type==='invite'||callback?.type==='recovery'){root.querySelector('#hosting-status').textContent='Set your own password to complete this account request.';const form=document.createElement('form');form.innerHTML='<label>New password<input name="password" type="password" autocomplete="new-password" required></label><button class="primary">Set password and sign in</button>';root.querySelector('section').append(form);form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{if(callback.type==='invite')await acceptInvite(callback.token,form.elements.password.value);else await updateUser({password:form.elements.password.value});form.elements.password.value='';location.reload();}catch(err){root.querySelector('#hosting-status').textContent=err.message;button.disabled=false;}};return;}
 const current=await getUser(),response=await fetch('/api/session',{cache:'no-store'}),session=await response.json();if(!response.ok)throw Error(session.error||'The board is unavailable.');const shell=await fetch('/app-shell.html',{cache:'no-store'});if(!shell.ok)throw Error('App files could not be loaded. Retry shortly.');document.body.innerHTML=await shell.text();
 const button=document.createElement('button');button.className='secondary';button.textContent=session.publicView?'Sign in to make changes':'Sign out';button.onclick=session.publicView?()=>signIn(current):async()=>{await logout();location.reload();};document.querySelector('.header-actions')?.append(button);
 if(!session.isAdmin){const admin=document.createElement('button');admin.className='secondary';admin.textContent='Admin login';admin.onclick=()=>signIn(current,true);document.querySelector('.header-actions')?.append(admin);}
 if(session.publicView||session.role==='viewer'){
  document.body.dataset.publicView='true';const notice=document.createElement('div');notice.className='public-view-notice';notice.innerHTML='<span>View only · Sign in to make changes</span>';const action=document.createElement('button');action.className='secondary';action.textContent='Sign in';action.onclick=()=>signIn(current);notice.append(action);document.querySelector('main').prepend(notice);
  document.addEventListener('click',e=>{if(e.target.closest('[data-advance],[data-block],[data-finish-piece],[data-cots-order],[data-cots-receive],[data-vendor-cart],#bulk-update')){e.preventDefault();e.stopImmediatePropagation();void signIn(current);}},true);
  const readonly=()=>{for(const id of ['migration-backup','unsynced-backup','cleanup-backup']){const recovery=document.getElementById(id);if(recovery)recovery.hidden=true;}for(const form of document.querySelectorAll('#work-form,#cots-form')){if(!form.querySelector('.public-readonly-note')){const note=document.createElement('p');note.className='public-readonly-note helper';note.textContent='View only. Sign in to change this record. ';const signin=document.createElement('button');signin.type='button';signin.className='secondary';signin.textContent='Sign in';signin.onclick=()=>signIn(current);note.append(signin);form.prepend(note);}for(const field of form.querySelectorAll('input,textarea,select'))field.disabled=true;for(const save of form.querySelectorAll('button[type="submit"]'))save.disabled=true;}for(const stage of document.querySelectorAll('[data-status]'))stage.disabled=true;};new MutationObserver(readonly).observe(document.body,{childList:true,subtree:true});readonly();
 }
 await import('./app.js');
 if(new URLSearchParams(location.search).get('admin')==='1'){
  if(session.isAdmin){const openAdmin=()=>{const tab=document.getElementById('admin-tab');if(tab&&!tab.hidden){tab.click();observer.disconnect();}};const observer=new MutationObserver(openAdmin);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});openAdmin();}
  else await signIn(current,true);
 }
 }catch(err){document.body.replaceChildren(root);root.querySelector('#hosting-status').textContent=err.message;}
}
start();

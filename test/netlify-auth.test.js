import test from 'node:test';
import assert from 'node:assert/strict';
import {canEnter,callbackHash} from '../netlify/auth-policy.js';

test('admin login requires an explicit server admin grant',()=>{
 assert.equal(canEnter(undefined,true),false);
 assert.equal(canEnter({role:'member',isAdmin:false},true),false);
 assert.equal(canEnter({role:'admin',isAdmin:false},true),false);
 assert.equal(canEnter({role:'admin',isAdmin:true,publicView:true},true),false);
 assert.equal(canEnter({role:'admin',isAdmin:true},true),true);
 assert.equal(canEnter({role:'member',publicView:false}),true);
 assert.equal(canEnter({role:'viewer'}),false);
});

test('preview account completion carries only the Identity token, never a pasted destination',()=>{
 assert.equal(callbackHash('https://7028man.netlify.app/#confirmation_token=abc123'),'#confirmation_token=abc123');
 assert.equal(callbackHash('https://example.org/path?redirect=evil#invite_token=abc%2B123'),'#invite_token=abc%2B123');
 for(const link of ['javascript:alert(1)#invite_token=x','https://example.org/#access_token=bad','https://example.org/#invite_token=x&redirect=evil','https://example.org/#invite_token=x&recovery_token=y','https://example.org/#invite_token=','not a link'])assert.throws(()=>callbackHash(link));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';

test('Netlify builds a working root page, dashboard shell and browser modules without publishing server files',async()=>{
 const config=await readFile('netlify.toml','utf8');
 assert.match(config,/command\s*=\s*"node scripts\/build-netlify\.mjs"/);
 assert.match(config,/publish\s*=\s*"netlify-public"/);
 execFileSync(process.execPath,['scripts/build-netlify.mjs'],{stdio:'pipe'});
 const page=await readFile('netlify-public/index.html','utf8');
 assert.match(page,/src="hosting-auth\.js"/);assert.doesNotMatch(page,/src="app\.js"/);
 const shell=await readFile('netlify-public/app-shell.html','utf8');
 assert.match(shell,/id="dashboard-picker"/);assert.match(shell,/id="project-picker"/);assert.doesNotMatch(shell,/<script/);
 const files=await readdir('netlify-public');
 for(const file of ['app.js','dashboards.js','board-drag.js','cots.js','vendor-logos.js','styles.css'])assert.ok(files.includes(file),file);
 assert.ok(!files.includes('server'));assert.ok(!files.some(f=>f.startsWith('.env')));
 assert.match(await readFile('netlify/functions/api.mjs','utf8'),/createNetlifyApi/);
});

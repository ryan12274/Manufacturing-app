import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const assets={};
for(const file of await readdir('dist')){if(!/\.(html|js|css)$/.test(file))continue;assets['/'+file]={body:await readFile(path.join('dist',file),'utf8'),type:({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)])};}
const shared=(await readFile('dist/onshape-import.js','utf8')).replaceAll('export ','');
const api=(await readFile('worker/onshape-api.js','utf8')).replace(/^import .*;\r?\n/,'').replaceAll('export ','');
const worker=(await readFile('worker/index.js','utf8')).replace(/^import .*;\r?\n/,'');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',`const STATIC_FILES=${JSON.stringify(assets)};\n${shared}\n${api}\n${worker}`);
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json','utf8'));
console.log('Built Worker with embedded browser assets.');

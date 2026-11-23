import {mkdir,readdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
const output='netlify-public';await mkdir(output,{recursive:true});
await mkdir('netlify/generated',{recursive:true});
const deployment={context:process.env.CONTEXT||'dev',branch:process.env.BRANCH||'local'};
await writeFile('netlify/generated/deployment.mjs','export const deployment='+JSON.stringify(deployment)+';\n');
for(const file of await readdir('dist'))if(/\.(js|css|html)$/.test(file))await copyFile('dist/'+file,output+'/'+file);
// Only browser assets are published, never Worker bundles, manifests or secrets.
let html=await readFile(output+'/index.html','utf8');
const body=html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
await writeFile(output+'/app-shell.html',body);
html=html.replace(/<body>[\s\S]*<\/body>/,'<body><noscript>Enable JavaScript to sign in to the 7028 workspace.</noscript><script type="module" src="hosting-auth.js"></script></body>');
await writeFile(output+'/index.html',html);
await build({entryPoints:['netlify/browser-auth.js'],outfile:output+'/hosting-auth.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
console.log('Built Netlify browser assets. Shared API uses Netlify Functions and Database.');

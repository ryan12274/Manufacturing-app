import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {default:worker}=await import(pathToFileURL(path.resolve('dist/server/index.js')));
const root=path.resolve('dist');
const server=http.createServer(async(req,res)=>{try{if(req.url.startsWith('/api/')){const result=await worker.fetch(new Request('http://127.0.0.1:7028'+req.url,{method:req.method}),process.env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;}const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)||pathname.startsWith('/server/')||pathname.startsWith('/.openai/')){res.writeHead(403);res.end();return;}const body=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css'}[path.extname(file)]||'application/octet-stream'),'Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}});
server.listen(7028,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:7028'));

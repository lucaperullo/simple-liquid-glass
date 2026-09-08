import http from 'node:http';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
// Serve an explicit allowlist of compiled preview files only. No source maps or repository access.
const root='/private/tmp/liquid-glass-safari-preview';
const files=new Map(['safari','optics'].map(name=>[`/tests/browser/${name}.html`,`${root}/tests/browser/${name}.html`]));
for(const name of await readdir(root+'/assets')) if(/^[\w-]+\.js$/.test(name)) files.set('/assets/'+name,root+'/assets/'+name);
const server=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method==='POST'&&path==='/__lab/report'){
  let data='';req.on('data',chunk=>{data+=chunk;if(data.length>10000)req.destroy();});
  req.on('end',async()=>{try{const report=JSON.parse(data);await mkdir('/private/tmp/liquid-glass-safari-reports',{recursive:true});await writeFile(`/private/tmp/liquid-glass-safari-reports/${Date.now()}.json`,JSON.stringify(report,null,2));console.log('Device report:',JSON.stringify(report));res.end('ok');}catch{res.writeHead(400).end();}});return;
 }
 const file=files.get(path);if(req.method!=='GET'||!file){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/html');res.setHeader('Cache-Control','no-store');res.end(await readFile(file));
});
server.listen(4175,'0.0.0.0',()=>{
 console.log('http://localhost:4175/tests/browser/safari.html?run');
 for(const list of Object.values(networkInterfaces()))for(const item of list||[])if(item.family==='IPv4'&&!item.internal)console.log(`Phone URL: http://${item.address}:4175/tests/browser/safari.html?run`);
});

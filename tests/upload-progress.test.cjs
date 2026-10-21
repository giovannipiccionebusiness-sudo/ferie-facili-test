
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync(process.argv[2]||require('node:path').join(__dirname,'../app.js'),'utf8');
const code=src.slice(src.indexOf('let uploadProgressListener=null;'),src.indexOf('let uploadStatusPanel='));
let xhrInstance,fetchCalls=0;
class FakeXHR{
 constructor(){this.upload={};xhrInstance=this;}
 open(method,url){this.method=method;this.url=url;}
 setRequestHeader(){}
 send(body){this.body=body;}
 getAllResponseHeaders(){return 'content-type: application/json';}
 abort(){this.onabort();}
}
const setup=new Function('XMLHttpRequest','fetch',code+'return {request:fetchWithUploadProgress,watch:fn=>uploadProgressListener=fn};');
const h=setup(FakeXHR,async()=>{fetchCalls++;return new Response('{}');});
(async()=>{
 const seen=[];h.watch(n=>seen.push(n));
 const body={synthetic:true},promise=h.request('https://example.invalid/storage/v1/object/private-documents/synthetic.pdf',{method:'POST',body});
 xhrInstance.upload.onprogress({lengthComputable:true,loaded:25,total:100});
 xhrInstance.upload.onprogress({lengthComputable:true,loaded:100,total:100});
 xhrInstance.status=200;xhrInstance.statusText='OK';xhrInstance.responseText='{"Key":"synthetic.pdf"}';xhrInstance.onload();
 assert.deepEqual(seen,[25,100]);assert.equal(xhrInstance.body,body);assert.equal((await promise).status,200);
 await h.request('https://example.invalid/rest/v1/documents',{method:'POST'});assert.equal(fetchCalls,1);
 const failure=h.request('https://example.invalid/storage/v1/object/private-documents/synthetic.pdf',{method:'POST'});
 xhrInstance.ontimeout();await assert.rejects(failure,/riprendere/);
 console.log('PASS: real byte-progress events, unchanged upload body, response conversion, ordinary fetch fallback, recoverable timeout. Mocked transport only.');
})().catch(e=>{console.error(e);process.exitCode=1;});

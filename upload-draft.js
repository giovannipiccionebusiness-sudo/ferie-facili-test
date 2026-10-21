// One temporary, private upload draft per signed-in worker; no credentials stored.
const DB='ferie-facili-upload',STORE='drafts',MAX_AGE=60*60*1000;
function database(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:'worker_id'});
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
async function transaction(mode,operation){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),req=operation(tx.objectStore(STORE));let result;
  req.onsuccess=()=>{result=req.result};tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Draft transaction aborted'));
 });}finally{db.close();}
}
export async function saveUploadDraft(draft){await transaction('readwrite',s=>s.put({...draft,saved_at:Date.now()}));}
export async function deleteUploadDraft(worker){await transaction('readwrite',s=>s.delete(worker));}
export async function readUploadDraft(worker){
 const draft=await transaction('readonly',s=>s.get(worker));
 if(draft&&Date.now()-draft.saved_at>MAX_AGE){await deleteUploadDraft(worker);return null;}
 return draft||null;
}

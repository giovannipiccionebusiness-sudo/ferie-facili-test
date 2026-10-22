export function installPlatform(nav){
 const ua=nav.userAgent||'',apple=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&nav.maxTouchPoints>1);
 return {apple,android:/Android/i.test(ua),safari:apple&&/Safari/i.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)};
}
export function setupInstall({window:w=window,document:d=document,navigator:nav=navigator}={}){
 const platform=installPlatform(nav),key='lavoro-facile-test-installed',laterKey='lavoro-facile-test-install-later',buttons=[...d.querySelectorAll('[data-install-app]')],hints=[...d.querySelectorAll('[data-install-hint]')];
 const get=(s,k)=>{try{return s.getItem(k)}catch{return null}},set=(s,k,v)=>{try{s.setItem(k,v)}catch{}};
 const media=w.matchMedia('(display-mode: standalone)'),standalone=()=>media.matches||nav.standalone===true||d.referrer.startsWith('android-app://');let installed=standalone()||get(w.localStorage,key)==='1',prompt=null,dialog=null,checked=false,timer=null;
 const el=(tag,text)=>{const n=d.createElement(tag);if(text)n.textContent=text;return n;};
 function close(){if(dialog){const old=dialog;dialog=null;if(old.open)old.close();old.remove();}}
 function markInstalled(){installed=true;set(w.localStorage,key,'1');if(timer)w.clearTimeout(timer);close();update();}
 function update(){const available=checked&&!installed&&(platform.apple||platform.android||!!prompt);for(const b of buttons){b.hidden=!available;b.textContent='＋ Installa sul telefono';}for(const h of hints){h.hidden=!available||!platform.apple;h.textContent='iPhone e iPad: installa da Safari con Condividi → Aggiungi alla schermata Home.';}}
 function instructions(box){
  box.replaceChildren();const list=el('ol');
  const steps=platform.apple?[...(platform.safari?[]:['Apri questa pagina in Safari.']), 'Premi Condividi: il quadrato con la freccia verso l’alto.','Scegli “Aggiungi alla schermata Home”. Se non la trovi, scorri le azioni o premi “Modifica azioni”.','Se presente, attiva “Apri come app web”, poi premi “Aggiungi”.','Apri Lavoro Facile dalla nuova icona sulla schermata Home.']:['Apri il menu ⋮ del browser.','Scegli “Installa app” oppure “Aggiungi alla schermata Home”.','Conferma l’installazione, poi apri Lavoro Facile dalla sua icona.'];
  for(const step of steps)list.append(el('li',step));box.append(list);
 }
 async function launch(){
  if(installed)return;if(!prompt){show(true);return;}
  const event=prompt;prompt=null;close();try{await event.prompt();const choice=await event.userChoice;if(choice?.outcome==='accepted')markInstalled();else{set(w.sessionStorage,laterKey,'1');update();}}catch{show(true);}finally{update();}
 }
 function show(manual=false){
  if(installed||!checked)return;if(dialog){dialog.focus();return;}
  const previous=d.activeElement,pop=el('dialog');dialog=pop;pop.className='install-dialog';pop.setAttribute('aria-labelledby','installAppTitle');pop.setAttribute('aria-describedby','installAppDescription');
  const header=el('div');header.className='install-dialog-brand';const logo=el('img');logo.src='./icon-192.png';logo.alt='';logo.width=logo.height=64;const name=el('div');const title=el('h2','Installa Lavoro Facile');title.id='installAppTitle';name.append(title,el('small','Presenze, richieste e documenti'));header.append(logo,name);
  const description=el('p','Aggiungi l’app al telefono per aprirla direttamente dalla sua icona.');description.id='installAppDescription';const steps=el('div'),controls=el('div'),later=el('button','Più tardi'),install=el('button',platform.apple?'Ho capito':prompt&&!manual?'Installa app':'Ho capito');controls.className='install-dialog-actions';later.type=install.type='button';
  if(platform.apple||manual||!prompt)instructions(steps);
  later.onclick=()=>{set(w.sessionStorage,laterKey,'1');close();};install.onclick=platform.apple||manual||!prompt?()=>{set(w.sessionStorage,laterKey,'1');close();}:launch;
  const already=el('button','Già installata');already.type='button';already.className='install-already';already.onclick=markInstalled;controls.append(later,install);pop.append(header,description,steps,controls,already);pop.addEventListener('cancel',()=>{set(w.sessionStorage,laterKey,'1');});pop.addEventListener('close',()=>{if(dialog===pop)dialog=null;pop.remove();if(previous?.isConnected)previous.focus({preventScroll:true});});d.body.append(pop);pop.showModal();later.focus();
 }
 function schedule(){if(timer||!checked||installed||get(w.sessionStorage,laterKey)==='1'||!(platform.apple||platform.android||prompt))return;timer=w.setTimeout(()=>{timer=null;if(installed||d.visibilityState==='hidden'||d.querySelector('dialog[open]')||/INPUT|TEXTAREA/.test(d.activeElement?.tagName||''))return;show();},1800);}
 for(const b of buttons)b.onclick=()=>{if(installed)return;if(prompt&&!platform.apple)return launch();else show(true);};
 w.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;update();schedule();});w.addEventListener('appinstalled',markInstalled);w.addEventListener('storage',e=>{if(e.key===key&&e.newValue==='1')markInstalled();});
 const displayChanged=()=>{if(standalone())markInstalled();};if(media.addEventListener)media.addEventListener('change',displayChanged);else media.addListener?.(displayChanged);
 const ready=(async()=>{if(standalone())markInstalled();if(!installed&&nav.getInstalledRelatedApps){try{const apps=await nav.getInstalledRelatedApps(),manifest=new URL('./manifest.webmanifest',w.location.href).href;if(apps.some(a=>a.platform==='webapp'&&new URL(a.url,w.location.href).href===manifest))markInstalled();}catch{}}
  checked=true;update();schedule();})();
 return {ready,show,markInstalled};
}
if(typeof window!=='undefined'&&typeof document!=='undefined')setupInstall();


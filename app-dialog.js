let active=false;
export function appConfirm(message){
 if(active)return Promise.resolve(false);active=true;
 return new Promise(resolve=>{
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='app-confirm';dialog.setAttribute('aria-labelledby','appConfirmTitle');dialog.setAttribute('aria-describedby','appConfirmMessage');
  const header=document.createElement('div');header.className='app-confirm-brand';const image=document.createElement('img');image.src='./icon-192.png';image.alt='';image.width=48;image.height=48;const title=document.createElement('h2');title.id='appConfirmTitle';title.textContent='Lavoro Facile';header.append(image,title);
  const text=document.createElement('p');text.id='appConfirmMessage';text.textContent=message;const controls=document.createElement('div');controls.className='app-confirm-actions';
  const cancel=document.createElement('button'),accept=document.createElement('button');cancel.type=accept.type='button';cancel.textContent='Annulla';accept.textContent='Continua';controls.append(cancel,accept);dialog.append(header,text,controls);
  let settled=false;const finish=value=>{if(settled)return;settled=true;active=false;if(dialog.open)dialog.close();dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(value);};cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false)});dialog.addEventListener('close',()=>finish(false));
  document.body.append(dialog);dialog.showModal();cancel.focus();
 });
}



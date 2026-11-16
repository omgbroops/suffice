(async action=>{
 const shown=el=>el&&el.getClientRects().length&&!el.closest('[hidden],[inert]')&&getComputedStyle(el).visibility!=='hidden';
 const visible=selector=>[...document.querySelectorAll(selector)].find(shown);
 const wait=async(check,description)=>{
  const deadline=performance.now()+45000;
  do{const found=check();if(found)return found;await new Promise(resolve=>setTimeout(resolve,40));}while(performance.now()<deadline);
  throw Error('Timed out waiting for '+description);
 };
 const rows=()=>[...document.querySelectorAll('.thread-row[data-thread]')];
 const large=()=>rows().find(row=>row.textContent.includes('Rust host large transcript'));
 if(action==='ready'){
  await wait(()=>rows().length===30&&shown(large())&&visible('form.composer'),'30 fixture threads and composer');
  return {threadCount:rows().length,width:innerWidth,height:innerHeight,devicePixelRatio};
 }
 if(action==='select'){
  const row=await wait(()=>shown(large())&&large(),'large fixture row');
  const id=row.dataset.thread;row.click();
  const marker='Rust host fixture message 999';
  const messages=await wait(()=>{
   const transcript=visible('.thread-messages'),selected=rows().find(r=>r.dataset.thread===id);
   return selected?.getAttribute('aria-pressed')==='true'&&transcript?.textContent.includes(marker)&&transcript;
  },'selected fixture transcript');
  return {threadCount:rows().length,transcriptCharacters:messages.textContent.trim().length,marker};
 }
 if(action==='settings'){
  (await wait(()=>visible('button[aria-label="Settings"]'),'Settings button')).click();
  (await wait(()=>visible('.settings-nav-item[data-section="providers"]'),'Providers section')).click();
  const marker='Configure OpenAI';
  await wait(()=>visible('.settings-nav-item[data-section="providers"][aria-current="page"]')&&visible('button[aria-label="Configure OpenAI"]'),'visible OpenAI provider control');
  return {marker};
 }
 if(action==='pty'){
  (await wait(()=>visible('button[aria-label="Back to chats"]'),'Back to chats')).click();
  if(!visible('.panel-launcher'))(await wait(()=>visible('button[aria-label="Toggle right panel"]'),'right panel button')).click();
  const choice=await wait(()=>[...document.querySelectorAll('.panel-launcher button')].find(el=>shown(el)&&el.textContent.trim()==='Terminal'),'Terminal launcher');
  choice.click();
  const tab=await wait(()=>{
   const el=visible('[role="tab"][aria-selected="true"][data-tab-value^="terminal:"]');
   return el&&!/^Terminal(?: \d+)?$/.test(el.getAttribute('aria-label'))&&visible('.terminal-session .xterm-helper-textarea')&&el;
  },'running terminal tab');
  const selected=rows().find(el=>el.getAttribute('aria-pressed')==='true');
  if(!selected)throw Error('Terminal fixture thread is not selected');
  const threadId=selected.dataset.thread,id=tab.dataset.tabValue,api=window.sufficeDesktop;
  const marker='SUFFICE_MACOS_PTY_READY';let output='';
  const off=api.onTerminalEvent(event=>{if(event.threadId===threadId&&event.id===id&&event.type==='data')output=(output+event.data).slice(-8192);});
  try{
   await api.terminalWrite({threadId,id,data:"printf 'SUFFICE_MACOS_%s\\n' 'PTY_READY'\r"});
   await wait(()=>output.includes(marker)&&visible('.terminal-session')?.textContent.includes(marker),'PTY marker in the visible terminal');
   return {marker,terminalVisible:true};
  }finally{off();}
 }
 if(action==='finish')return {};
 throw Error('Unknown measurement action');
})

// Small, local emoji collection; a custom emoji can also be pasted into the field.
const groups = [
  ['Smileys', '😀 smile happy|😃 grin|😄 laugh|😁 beam|😆 laughing|😅 sweat|😂 joy tears|🙂 smile|🙃 upside down|😉 wink|😊 blush|🥰 love|😍 heart eyes|🤩 star eyes|😎 cool sunglasses|🤓 nerd|🧐 curious|🤔 thinking|🫡 salute|🤗 hug|🤖 robot|👻 ghost|👽 alien|💀 skull'],
  ['People', '👋 wave hello|🤚 hand|✌️ peace|🤞 fingers crossed|🫶 heart hands|👍 thumbs up|👏 clap|🙌 celebrate|💪 strong|🧠 brain|👀 eyes|🧑‍💻 developer coder|🧑‍🎨 artist|🧙 wizard|🥷 ninja|🦸 superhero'],
  ['Nature', '🐶 dog|🐱 cat|🦊 fox|🐻 bear|🐼 panda|🐸 frog|🐙 octopus|🦋 butterfly|🐝 bee|🐢 turtle|🐳 whale|🦄 unicorn|🌱 seedling plant|🌿 herb|🌵 cactus|🌸 flower|🌻 sunflower|🌲 tree|🍀 clover|🍄 mushroom|🌍 earth world|🌙 moon|☀️ sun|⭐ star|🔥 fire|🌈 rainbow|⚡ lightning|❄️ snow'],
  ['Objects', '💻 laptop computer|⌨️ keyboard|🖥️ desktop|📱 phone|🎮 game controller|🎨 art palette|🎬 movie|🎵 music|🎧 headphones|📷 camera|📚 books|📝 memo note|📁 folder|📦 package box|🔧 wrench tool|🔨 hammer|⚙️ gear settings|🔑 key|🔒 lock|💡 idea light|🔬 science microscope|🧪 experiment|🧬 dna|🛰️ satellite|🚀 rocket|✈️ airplane|🚂 train|🚗 car|🏠 home|🏗️ construction|🏆 trophy|🎯 target|🧩 puzzle|💎 gem|🍕 pizza|☕ coffee'],
  ['Symbols', '❤️ heart love|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|✨ sparkles|💫 dizzy|🔵 blue circle|🟢 green circle|🟣 purple circle|🔶 diamond|✅ check|💯 hundred|♾️ infinity|🔗 link'],
].map(([name, values]) => [name, values.split('|').map(value => {const at=value.indexOf(' ');return {emoji:value.slice(0,at),name:value.slice(at+1)};})]);

export function connectProjectIconControls(editor, callbacks) {
  const search=editor.querySelector('[aria-label="Search emoji"]');
  const results=editor.querySelector('.project-emoji-results');
  function render() {
    const query=search.value.trim().toLocaleLowerCase();results.replaceChildren();
    for(const [name,items] of groups){
      const matches=items.filter(item=>`${name} ${item.name} ${item.emoji}`.toLocaleLowerCase().includes(query));if(!matches.length)continue;
      const heading=document.createElement('p');heading.textContent=name;
      const grid=document.createElement('div');grid.className='project-emoji-grid';
      for(const item of matches){const button=document.createElement('button');button.type='button';button.textContent=item.emoji;button.title=item.name;button.setAttribute('aria-label',item.name);button.addEventListener('click',()=>callbacks.choose(item.emoji));grid.append(button);}
      results.append(heading,grid);
    }
    if(!results.children.length){const empty=document.createElement('p');empty.textContent='No matches. You can paste any emoji in the field above.';results.append(empty);}
  }
  search.addEventListener('input',render);render();
  const drop=editor.querySelector('.project-image-drop');
  drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('drag-over');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));
  drop.addEventListener('drop',async event=>{
    event.preventDefault();drop.classList.remove('drag-over');const file=event.dataTransfer.files[0];if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){callbacks.toast('Choose a PNG, JPEG or WebP image under 10 MB');return;}
    let bitmap;
    try{bitmap=await createImageBitmap(file);const side=Math.min(bitmap.width,bitmap.height),canvas=document.createElement('canvas');canvas.width=canvas.height=128;canvas.getContext('2d').drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,128,128);callbacks.image(canvas.toDataURL('image/png'));}
    catch{callbacks.toast('This image could not be opened');}
    finally{bitmap?.close();}
  });
}

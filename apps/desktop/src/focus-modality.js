// Escape and programmatic focus restoration must not opt mouse users into rings.
document.addEventListener('keydown',event=>{if(event.key==='Tab')document.documentElement.classList.add('keyboard-navigation');},true);
document.addEventListener('pointerdown',()=>document.documentElement.classList.remove('keyboard-navigation'),true);

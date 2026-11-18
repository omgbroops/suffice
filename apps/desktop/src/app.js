const path = location.pathname.replace(/\/+$/, '') || '/';
if (location.hash === '#voice-orb') {
  // The floating voice orb window loads the same bundle and mounts only the orb.
  (await import('./voice/orb-window.js')).mountOrbWindow();
} else if (location.hash === '#ask-bar' || location.hash === '#ask-bar-floater') {
  (await import('./ask-bar.js')).mountAskBar(undefined, location.hash === '#ask-bar-floater');
} else if (location.protocol === 'file:' || path === '/') {
  await import('./main.js');
} else {
  await import('./styles.css');
  document.querySelector('#app').innerHTML = '<main class="empty-state"><h1>Page not found</h1><p><a href="/">Back to Suffice</a></p></main>';
}

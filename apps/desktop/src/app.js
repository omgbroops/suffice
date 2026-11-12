const path = location.pathname.replace(/\/+$/, '') || '/';
if (location.protocol === 'file:' || path === '/') {
  await import('./main.js');
} else {
  await import('./styles.css');
  document.querySelector('#app').innerHTML = '<main class="empty-state"><h1>Page not found</h1><p><a href="/">Back to Suffice</a></p></main>';
}

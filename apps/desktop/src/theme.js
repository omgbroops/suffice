try { if(!localStorage.getItem('suffice-theme'))localStorage.setItem('suffice-theme','dark'); } catch {}

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getTheme() === 'light' ? '#f6f6f6' : '#0e0e0e');

export function setTheme(theme) {
  if (!['dark', 'light'].includes(theme)) return;
  document.documentElement.dataset.theme = theme;
  const storageKey = 'suffice-theme';
  try { localStorage.setItem(storageKey, theme); } catch { /* Storage may be unavailable in private contexts. */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f6f6' : '#0e0e0e');
  document.dispatchEvent(new CustomEvent('suffice-theme-change', { detail: theme }));
}

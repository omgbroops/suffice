import type { Prefs } from '../shared/prefs.mjs'

const FONTS: Record<string, string> = {
  Inter: "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif",
  'Geist Mono': "'Geist Mono', ui-monospace, monospace",
  System: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  'System mono': 'ui-monospace, SFMono-Regular, Consolas, Menlo, monospace',
}

const light = window.matchMedia('(prefers-color-scheme: light)')

/** Puts appearance and privacy preferences on the document. */
export function applyPrefs(p: Prefs) {
  const root = document.documentElement
  const theme = p.theme === 'System' ? (light.matches ? 'light' : 'dark') : String(p.theme ?? 'Dark').toLowerCase()
  root.dataset.theme = theme
  root.style.colorScheme = theme
  root.style.setProperty('--sans', FONTS[p['interface-font']] ?? FONTS.Inter)
  root.style.setProperty('--mono', FONTS[p['code-font']] ?? FONTS['Geist Mono'])
  // Text size scales the whole interface from its 13 px design size.
  const size = parseInt(p['text-size']) || 13
  root.style.zoom = size === 13 ? '' : String(size / 13)
  root.dataset.density = p.density === 'Compact' ? 'compact' : 'comfortable'
  root.classList.toggle('hide-pii', !!p['private-labels'])
  root.lang = p.language === 'English' ? 'en' : navigator.language || 'en'
}

export function watchSystemTheme(get: () => Prefs) {
  const on = () => get().theme === 'System' && applyPrefs(get())
  light.addEventListener('change', on)
  return () => light.removeEventListener('change', on)
}

let audio: AudioContext | null = null

/** A short synthesized sound, so no audio files ship with the app. */
function play(kind: string) {
  audio ??= new AudioContext()
  const at = audio.currentTime
  const notes = kind === 'Chime' ? [[880, 0], [1320, 0.12]] : kind === 'Click' ? [[2000, 0]] : [[660, 0]]
  for (const [freq, delay] of notes) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = kind === 'Click' ? 'square' : 'sine'
    osc.frequency.value = freq
    const len = kind === 'Click' ? 0.03 : 0.35
    gain.gain.setValueAtTime(0, at + delay)
    gain.gain.linearRampToValueAtTime(kind === 'Click' ? 0.05 : 0.12, at + delay + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + delay + len)
    osc.connect(gain).connect(audio.destination)
    osc.start(at + delay)
    osc.stop(at + delay + len + 0.02)
  }
}

/** A desktop notification for a thread event, if the preferences ask for one. */
export function notify(p: Prefs, kind: 'finished' | 'approval' | 'failed', title: string, body: string, onClick?: () => void) {
  if (!p[`notify-${kind}`]) return
  if (p['notify-unfocused'] && document.hasFocus()) return
  const n = new Notification(title, { body, silent: true })
  n.onclick = () => {
    window.focus()
    onClick?.()
  }
  if (p['notification-sound']) play(p.sound)
}

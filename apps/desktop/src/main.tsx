import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles.css'
import './banger.css'
import './web.css'
import App from './App'
import { Intro } from './components/Intro'

// uncaught renderer errors go to the local log through the host
const report = (message: unknown, stack?: unknown) => void window.suffice?.invoke('app:error', { message: String(message), stack: typeof stack === 'string' ? stack : undefined }).catch(() => {})
window.addEventListener('error', e => report(e.message, e.error?.stack))
window.addEventListener('unhandledrejection', e => report(e.reason?.message ?? e.reason, e.reason?.stack))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash === '#intro' ? <Intro /> : <App />}
  </StrictMode>,
)

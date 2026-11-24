import { useEffect, useRef } from 'react'
import { createField, FIELDS } from './blocks'
import { createScene, PRESETS } from './dither'

// Copied from suffice-agent-web/src/Scene.tsx. The ground is left clear so the surface shows through,
// and the ink is the canvas's CSS color, so the scene follows the theme.
const ink = (canvas: HTMLCanvasElement) => {
  const [r, g, b] = (getComputedStyle(canvas).color.match(/[\d.]+/g) ?? []).map(Number)
  return [0, ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0]
}

export function Scene({ preset }: { preset: keyof typeof FIELDS | keyof typeof PRESETS }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const frame = canvas.parentElement!
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    const theme = matchMedia('(prefers-color-scheme: dark)')
    let scene: ReturnType<typeof createField>
    let visible = false
    const root = document.documentElement
    const sync = () => (visible && !reduce.matches && !root.classList.contains('reduce-motion') && !document.hidden ? scene.start() : scene.stop())
    const size = () => scene.resize(frame.clientWidth, frame.clientHeight)
    const build = () => {
      scene?.stop()
      scene = preset === 'card' ? createScene(canvas, PRESETS[preset], ink(canvas)) : createField(canvas, FIELDS[preset], ink(canvas))
      size()
      sync()
    }
    build()
    const resize = new ResizeObserver(size)
    const inView = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      sync()
    })
    const setting = new MutationObserver(sync)
    setting.observe(root, { attributeFilter: ['class'] })
    resize.observe(frame)
    inView.observe(frame)
    reduce.addEventListener('change', sync)
    theme.addEventListener('change', build)
    document.addEventListener('visibilitychange', sync)
    return () => {
      scene.stop()
      resize.disconnect()
      setting.disconnect()
      inView.disconnect()
      reduce.removeEventListener('change', sync)
      theme.removeEventListener('change', build)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [preset])

  return (
    <div className="scene" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  )
}

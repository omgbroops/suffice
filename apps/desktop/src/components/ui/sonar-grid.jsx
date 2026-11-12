import * as React from 'react';
import './sonar-grid.css';

const DEFAULT_AREA = [0.15, 0.2, 0.85, 0.8];
const TAU = Math.PI * 2;

// Adapted from the user-supplied SonarGrid component. The two-pass canvas
// renderer is preserved; local CSS replaces Tailwind and paused freezes time.
export function SonarGrid({
  spacing = 26, dotRadius = 1.4, baseOpacity = .28, color,
  pingEvery = 2.4, speed = 260, ringWidth = 90, amplitude = 2.2,
  interactive = true, maxRings = 6, seedPing = true,
  pingArea = DEFAULT_AREA, paused = false, className, children, ref, ...rest
}) {
  const hostRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const ringsRef = React.useRef([]);
  const refreshRef = React.useRef(() => {});
  const opts = React.useRef(null);
  opts.current = { spacing, dotRadius, baseOpacity, pingEvery, speed, ringWidth, amplitude, interactive, maxRings, seedPing, pingArea, paused };
  const setHost = React.useCallback(node => {
    hostRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  React.useEffect(() => {
    const host = hostRef.current, canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!host || !ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, raf = 0, timer = 0;
    let visible = true, seeded = false, stroke = '';
    let clock = 0, previous = null, nextPing = opts.current.pingEvery * 1000;
    const canRun = () => visible && !document.hidden && !reduce.matches && !opts.current.paused;
    const readColor = () => { stroke = getComputedStyle(canvas).color; };
    const addRing = (x, y, born = clock) => {
      readColor();
      ringsRef.current.push({ x, y, born });
      while (ringsRef.current.length > opts.current.maxRings) ringsRef.current.shift();
    };

    function draw() {
      const o = opts.current;
      const lifetime = (Math.hypot(width, height) + o.ringWidth) / o.speed;
      ringsRef.current = ringsRef.current.filter(r => (clock - r.born) / 1000 < lifetime);
      const live = ringsRef.current.map(r => {
        const age = (clock - r.born) / 1000, radius = age * o.speed;
        return { ...r, radius, reach: radius + o.ringWidth, fade: 1 - age / lifetime };
      });
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = stroke;
      const cols = Math.ceil(width / o.spacing) + 1, rows = Math.ceil(height / o.spacing) + 1;
      const offsetX = (width - (cols - 1) * o.spacing) / 2;
      const offsetY = (height - (rows - 1) * o.spacing) / 2;
      const hot = [];
      ctx.globalAlpha = o.baseOpacity;
      ctx.beginPath();
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = offsetX + i * o.spacing, y = offsetY + j * o.spacing;
        let energy = 0;
        for (const ring of live) {
          if (Math.abs(x - ring.x) > ring.reach || Math.abs(y - ring.y) > ring.reach) continue;
          const distance = Math.abs(Math.hypot(x - ring.x, y - ring.y) - ring.radius);
          if (distance >= o.ringWidth) continue;
          const t = 1 - distance / o.ringWidth;
          energy = Math.max(energy, t * t * (3 - 2 * t) * ring.fade);
        }
        if (energy < .01) { ctx.moveTo(x + o.dotRadius, y); ctx.arc(x, y, o.dotRadius, 0, TAU); }
        else hot.push(x, y, energy);
      }
      ctx.fill();
      for (let i = 0; i < hot.length; i += 3) {
        const energy = hot[i + 2];
        ctx.globalAlpha = o.baseOpacity + (1 - o.baseOpacity) * energy;
        ctx.beginPath(); ctx.arc(hot[i], hot[i + 1], o.dotRadius * (1 + o.amplitude * energy), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function stop() {
      cancelAnimationFrame(raf); clearTimeout(timer);
      raf = 0; timer = 0; previous = null;
    }
    function tick(realTime) {
      raf = 0;
      if (!canRun()) { previous = null; return; }
      if (previous !== null) clock += Math.max(0, realTime - previous);
      previous = realTime;
      const o = opts.current;
      if (o.pingEvery > 0 && clock >= nextPing) {
        const [x0, y0, x1, y1] = o.pingArea;
        addRing(width * (x0 + Math.random() * (x1 - x0)), height * (y0 + Math.random() * (y1 - y0)));
        nextPing = clock + o.pingEvery * 1000;
      }
      draw();
      if (ringsRef.current.length) raf = requestAnimationFrame(tick);
      else if (o.pingEvery > 0) timer = setTimeout(() => { timer = 0; raf = requestAnimationFrame(tick); }, Math.max(16, nextPing - clock));
    }
    function wake() {
      if (!canRun() || raf) return;
      clearTimeout(timer); timer = 0; raf = requestAnimationFrame(tick);
    }
    function refresh() {
      readColor();
      if (!canRun()) stop();
      if (reduce.matches) ringsRef.current = [];
      nextPing = Math.min(nextPing, clock + opts.current.pingEvery * 1000);
      draw(); wake();
    }
    function resize() {
      const rect = host.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!seeded) {
        seeded = true;
        const [x0, y0, x1, y1] = opts.current.pingArea;
        if (opts.current.seedPing && !reduce.matches) addRing(width * (x0 + (x1 - x0) * .68), height * (y0 + (y1 - y0) * .34), clock - 500);
      }
      draw();
    }
    function pointerPing(event) {
      if (!opts.current.interactive || !canRun()) return;
      const rect = host.getBoundingClientRect();
      const { x, y } = event.detail || { x: event.clientX - rect.left, y: event.clientY - rect.top };
      addRing(x, y); wake();
    }
    const ro = new ResizeObserver(resize);
    const io = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; refresh(); });
    const mo = new MutationObserver(refresh);
    readColor(); resize(); ro.observe(host); io.observe(host);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    host.addEventListener('pointerdown', pointerPing);
    host.addEventListener('sonar-ping', pointerPing);
    document.addEventListener('visibilitychange', refresh);
    reduce.addEventListener('change', refresh);
    refreshRef.current = refresh; wake();
    return () => {
      stop(); ro.disconnect(); io.disconnect(); mo.disconnect(); ringsRef.current = [];
      host.removeEventListener('pointerdown', pointerPing); host.removeEventListener('sonar-ping', pointerPing);
      document.removeEventListener('visibilitychange', refresh); reduce.removeEventListener('change', refresh);
      refreshRef.current = () => {};
    };
  }, []);
  React.useEffect(() => { refreshRef.current(); }, [spacing, dotRadius, baseOpacity, color, pingEvery, speed, ringWidth, amplitude, interactive, maxRings, seedPing, pingArea, paused]);
  return <div ref={setHost} data-slot="sonar-grid" className={['sonar-grid', className].filter(Boolean).join(' ')} {...rest}>
    <canvas ref={canvasRef} aria-hidden="true" style={color ? { color } : undefined} />
    {children}
  </div>;
}
export default SonarGrid;

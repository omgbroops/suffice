// The artifact page's stylesheet: app tokens, plain-HTML defaults that look like the app, and the kit's parts.
// Categorical palette: validated (CVD, normal-vision, contrast) on #141414 dark and #fbfbfb light, fixed order.

const TOKENS = {
  dark: {
    fg: 'rgba(255,255,255,.9)', muted: 'rgba(255,255,255,.52)', faint: 'rgba(255,255,255,.32)', line: 'rgba(255,255,255,.08)', line2: 'rgba(255,255,255,.14)',
    fill: 'rgba(255,255,255,.04)', fill2: 'rgba(255,255,255,.07)', fill3: 'rgba(255,255,255,.11)', card: 'rgba(255,255,255,.025)',
    raised: '#262626', raisedEdge: 'rgba(255,255,255,.08)', btnBg: 'rgba(255,255,255,.92)', btnInk: '#0c0c0c', surface: '#141414', tip: '#1d1d1d',
    c: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
    seqLo: '#1d2735', seqHi: '#6da7ec', divNeg: '#3987e5', divMid: '#383835', divPos: '#e66767',
    good: '#0ca30c', warn: '#fab219', bad: '#d03b3b',
  },
  light: {
    fg: 'rgba(0,0,0,.86)', muted: 'rgba(0,0,0,.52)', faint: 'rgba(0,0,0,.34)', line: 'rgba(0,0,0,.08)', line2: 'rgba(0,0,0,.14)',
    fill: 'rgba(0,0,0,.035)', fill2: 'rgba(0,0,0,.06)', fill3: 'rgba(0,0,0,.1)', card: 'rgba(255,255,255,.7)',
    raised: '#ffffff', raisedEdge: 'rgba(0,0,0,.1)', btnBg: '#1a1a1a', btnInk: '#ffffff', surface: '#fbfbfb', tip: '#ffffff',
    c: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    seqLo: '#e8f0fb', seqHi: '#1c5cab', divNeg: '#2a78d6', divMid: '#f0efec', divPos: '#e34948',
    good: '#008300', warn: '#b37800', bad: '#d03b3b',
  },
}

// damped springs sampled to linear(); same curves as the app (styles.css --spring, --spring-soft)
const SPRING = 'linear(0, 0.0192, 0.0695, 0.1412, 0.2265, 0.3187, 0.4128, 0.5048, 0.592, 0.6723, 0.7445, 0.808, 0.8626, 0.9086, 0.9465, 0.9768, 1.0004, 1.0181, 1.0307, 1.039, 1.0438, 1.0458, 1.0457, 1.0439, 1.0409, 1.0372, 1.033, 1.0287, 1.0244, 1.0203, 1.0165, 1.013, 1.0099, 1.0073, 1.005, 1.0031, 1.0016, 1.0004, 0.9995, 0.9988, 0.9983, 0.9981, 0.9979, 0.9979, 0.9979, 0.9981, 0.9982, 0.9984, 1)'

export function kitCss(dark) {
  const t = TOKENS[dark ? 'dark' : 'light']
  return `:root{color-scheme:${dark ? 'dark' : 'light'};--fg:${t.fg};--muted:${t.muted};--faint:${t.faint};--line:${t.line};--line2:${t.line2};--fill:${t.fill};--fill2:${t.fill2};--fill3:${t.fill3};--card:${t.card};--raised:${t.raised};--raised-edge:${t.raisedEdge};--btn-bg:${t.btnBg};--btn-ink:${t.btnInk};--surface:${t.surface};--tip:${t.tip};${t.c.map((c, i) => `--c${i + 1}:${c};`).join('')}${t.c.map((_, i) => `--on-c${i + 1}:${i === 3 ? '#0b0b0b' : '#ffffff'};`).join('')}--seq-lo:${t.seqLo};--seq-hi:${t.seqHi};--div-neg:${t.divNeg};--div-mid:${t.divMid};--div-pos:${t.divPos};--good:${t.good};--warn:${t.warn};--bad:${t.bad};--ease:cubic-bezier(.23,1,.32,1);--spring:${SPRING};--mono:ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}html,body{margin:0}body{padding:14px 16px;font:13px/1.5 system-ui,-apple-system,'Helvetica Neue',sans-serif;color:var(--fg);background:transparent;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{margin:0 0 8px;font-weight:500;letter-spacing:-.01em;line-height:1.25}h1{font-size:20px}h2{font-size:16px}h3{font-size:14px}h4{font-size:13px;color:var(--muted)}
p{margin:0 0 10px}small,.muted{color:var(--muted)}a{color:inherit;text-decoration:underline;text-decoration-color:var(--faint);text-underline-offset:2px}
hr{border:0;height:1px;background:var(--line);margin:14px 0}code,kbd,pre{font-family:var(--mono);font-size:12px}code{padding:1px 5px;border-radius:4px;background:var(--fill2)}
pre{margin:0 0 10px;padding:10px 12px;border-radius:8px;background:var(--fill);overflow:auto;line-height:1.55}kbd{padding:1px 5px;border-radius:4px;box-shadow:inset 0 0 0 1px var(--line2);color:var(--muted)}
ul,ol{margin:0 0 10px;padding-left:20px}li{margin:2px 0}blockquote{margin:0 0 10px;padding-left:12px;box-shadow:inset 2px 0 0 var(--line2);color:var(--muted)}
img,video,canvas{max-width:100%;border-radius:8px}svg{max-width:100%}
/* controls */
button,.sx-btn{font:inherit;height:30px;padding:0 12px;border:0;border-radius:7px;background:var(--raised);color:var(--fg);box-shadow:0 0 0 1px var(--raised-edge),0 1px 2px rgba(0,0,0,.12);cursor:pointer;transition:transform 140ms var(--ease),background-color 140ms var(--ease)}
button:active:not(:disabled),.sx-btn:active{transform:scale(.97)}button:disabled{opacity:.45;cursor:default}button.primary,.sx-btn.is-primary,button[type=submit]{background:var(--btn-bg);color:var(--btn-ink);box-shadow:none}
button.ghost{background:none;box-shadow:none;color:var(--muted)}@media (hover:hover){button.ghost:hover{color:var(--fg);background:var(--fill2)}}
input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),select,textarea{font:inherit;height:30px;padding:0 10px;border:0;border-radius:7px;background:var(--fill2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line);outline:0;min-width:0}
textarea{height:auto;min-height:72px;padding:8px 10px;resize:vertical}select{padding-right:8px}input:focus,select:focus,textarea:focus{box-shadow:inset 0 0 0 1px var(--line2),0 0 0 3px var(--fill2)}
input::placeholder,textarea::placeholder{color:var(--faint)}label{display:grid;gap:5px;color:var(--muted);font-size:12.5px}label>input,label>select,label>textarea{color:var(--fg);font-size:13px}
input[type=checkbox],input[type=radio]{accent-color:var(--fg);width:15px;height:15px;margin:0}label:has(>input[type=checkbox]),label:has(>input[type=radio]){display:flex;align-items:center;gap:8px;color:var(--fg);font-size:13px}
input[type=checkbox].switch{appearance:none;width:30px;height:18px;border-radius:9px;background:var(--fill3);position:relative;cursor:pointer;transition:background-color 160ms var(--ease)}
input[type=checkbox].switch::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--fg);transition:transform 420ms var(--spring)}input[type=checkbox].switch:checked{background:var(--c1)}input[type=checkbox].switch:checked::after{transform:translateX(12px);background:#fff}
input[type=range]{appearance:none;width:100%;height:18px;background:transparent;--p:50%}input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,var(--fg) var(--p),var(--fill3) var(--p))}
input[type=range]::-webkit-slider-thumb{appearance:none;width:14px;height:14px;margin-top:-5px;border-radius:50%;background:var(--raised);box-shadow:0 0 0 1px var(--line2),0 1px 3px rgba(0,0,0,.3);transition:transform 300ms var(--spring)}input[type=range]:active::-webkit-slider-thumb{transform:scale(1.2)}
progress,meter{appearance:none;width:100%;height:6px;border:0;border-radius:3px;background:var(--fill3);overflow:hidden}progress::-webkit-progress-bar{background:var(--fill3)}progress::-webkit-progress-value{background:var(--fg);border-radius:3px}meter::-webkit-meter-bar{background:var(--fill3);border:0;border-radius:3px}meter::-webkit-meter-optimum-value{background:var(--good)}meter::-webkit-meter-suboptimum-value{background:var(--warn)}meter::-webkit-meter-even-less-good-value{background:var(--bad)}
details{border-radius:8px;box-shadow:inset 0 0 0 1px var(--line);padding:0 12px;margin:0 0 8px}summary{cursor:pointer;padding:9px 0;list-style:none;font-weight:500}summary::-webkit-details-marker{display:none}summary::before{content:'›';display:inline-block;width:14px;color:var(--muted);transition:transform 200ms var(--ease)}details[open]>summary::before{transform:rotate(90deg)}details[open]{padding-bottom:10px}
fieldset{border:0;margin:0;padding:0;display:grid;gap:10px}legend{padding:0;margin-bottom:6px;font-weight:500}
/* layout + surfaces */
.card{border-radius:10px;padding:14px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line)}.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.stack{display:grid;gap:10px}.spread{display:flex;justify-content:space-between;align-items:center;gap:10px}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.grid.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.grid.three{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.stat{display:grid;gap:2px;border-radius:10px;padding:12px 14px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line)}.stat .l{color:var(--muted);font-size:12px}.stat .v{font-size:24px;font-weight:500;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.stat .d{font-size:12px;color:var(--muted)}.stat .d.up::before{content:'▲ ';color:var(--good)}.stat .d.down::before{content:'▼ ';color:var(--bad)}
.tag{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 7px;border-radius:5px;background:var(--fill2);color:var(--muted);font-size:11.5px}.tag.good::before,.tag.warn::before,.tag.bad::before{content:'';width:6px;height:6px;border-radius:50%}.tag.good::before{background:var(--good)}.tag.warn::before{background:var(--warn)}.tag.bad::before{background:var(--bad)}
.note{padding:10px 12px;border-radius:8px;background:var(--fill);color:var(--muted)}.mono{font-family:var(--mono)}.num{font-variant-numeric:tabular-nums}
.tabs{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:var(--fill2);margin-bottom:10px}.tabs [data-tab]{height:26px;padding:0 10px;border-radius:6px;background:none;box-shadow:none;color:var(--muted)}.tabs [data-tab][aria-selected=true]{background:var(--raised);color:var(--fg);box-shadow:0 0 0 1px var(--raised-edge),0 1px 2px rgba(0,0,0,.12)}
[data-panel]{animation:sx-in 420ms var(--spring) both}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:6px 12px 6px 0;border-bottom:1px solid var(--line);white-space:nowrap}th{color:var(--muted);font-weight:500;cursor:pointer;user-select:none}th[data-d=a]::after{content:' ↑'}th[data-d=d]::after{content:' ↓'}td.n{text-align:right}tr:last-child td{border-bottom:0}.sx-table{overflow:auto;max-height:420px}
/* kit parts */
.sx-fig{margin:0}.sx-svg{display:block;width:100%;height:auto;overflow:visible;font-family:inherit}.sx-title{font-weight:500;margin-bottom:2px}.sx-sub{color:var(--muted);font-size:12px;margin-bottom:8px}
.sx-grid line{stroke:var(--line)}.sx-grid .sx-vgrid{stroke:var(--line)}.sx-tick{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}.sx-axis{stroke:var(--line2)}.sx-axis-label{fill:var(--muted);font-size:11px}
.sx-label{fill:var(--fg);font-size:11.5px}.sx-label.is-muted{fill:var(--muted)}.sx-cross{stroke:var(--line2);stroke-dasharray:2 3;pointer-events:none}
.sx-legend{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:10px;color:var(--muted);font-size:12px}.sx-legend>span{display:inline-flex;align-items:center;gap:6px}.sx-legend i{width:10px;height:10px;border-radius:3px}.sx-legend i.is-line{height:3px;border-radius:2px}
.sx-tip{position:absolute;left:0;top:0;z-index:10;min-width:120px;max-width:260px;padding:8px 10px;border-radius:8px;background:var(--tip);box-shadow:0 0 0 1px var(--line2),0 10px 28px -8px rgba(0,0,0,.45);font-size:12px;pointer-events:none;opacity:0;transition:opacity 120ms var(--ease)}.sx-tip.is-on{opacity:1}
.sx-tip b{display:block;margin-bottom:4px;font-weight:500}.sx-tip-row{display:flex;align-items:center;gap:7px;color:var(--muted)}.sx-tip-row i{width:8px;height:8px;border-radius:2px;flex:none}.sx-tip-row em{margin-left:auto;padding-left:12px;font-style:normal;color:var(--fg);font-variant-numeric:tabular-nums}
.sx-hit{cursor:default}.sx-mark{transition:opacity 160ms var(--ease)}.sx-fig:has(.sx-mark:hover) .sx-mark:not(:hover){opacity:.45}
.sx-dot{opacity:0;transition:opacity 120ms var(--ease)}.sx-dot.is-on{opacity:1}.sx-err{color:var(--muted)}
.sx-choices{display:grid;gap:6px;margin-bottom:10px}.sx-choice{height:auto;min-height:40px;display:grid;gap:1px;justify-items:start;text-align:left;padding:9px 12px;border-radius:9px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow 160ms var(--ease),transform 300ms var(--spring),background-color 160ms var(--ease)}
.sx-choice b{font-weight:500}.sx-choice span{color:var(--muted);font-size:12px}@media (hover:hover){.sx-choice:hover{box-shadow:inset 0 0 0 1px var(--line2);background:var(--fill)}}.sx-choice[aria-checked=true],.sx-choice[aria-pressed=true]{box-shadow:inset 0 0 0 1.5px var(--fg)}
.sx-drop{display:grid;place-items:center;align-content:center;gap:2px;min-height:96px;padding:16px;border-radius:10px;background:var(--fill);box-shadow:inset 0 0 0 1px var(--line);text-align:center;cursor:pointer;transition:background-color 160ms var(--ease),transform 400ms var(--spring)}.sx-drop input{display:none}.sx-drop b{color:var(--fg);font-weight:500}.sx-drop span{font-size:12px}.sx-drop.is-over{background:var(--fill3);transform:scale(1.01)}
/* entrances (springs) */
@keyframes sx-in{from{opacity:0;transform:translateY(6px)}}@keyframes sx-grow-y{from{transform:scaleY(0)}}@keyframes sx-grow-x{from{transform:scaleX(0)}}@keyframes sx-pop{from{transform:scale(0.2);opacity:0}}@keyframes sx-draw{from{stroke-dashoffset:1}}@keyframes sx-fade{from{opacity:0}}
.sx-grow-y{transform-box:fill-box;transform-origin:50% 100%;animation:sx-grow-y 780ms var(--spring) both}.sx-grow-y.is-neg{transform-origin:50% 0}.sx-grow-x{transform-box:fill-box;transform-origin:0 50%;animation:sx-grow-x 780ms var(--spring) both}
.sx-pop{transform-box:fill-box;transform-origin:center;animation:sx-pop 700ms var(--spring) both}.sx-draw{stroke-dasharray:1;animation:sx-draw 900ms var(--ease) both}.sx-fade{animation:sx-fade 600ms var(--ease) both}.sx-in{animation:sx-in 520ms var(--spring) both}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:1ms!important;animation-delay:0ms!important;transition-duration:1ms!important}}`
}

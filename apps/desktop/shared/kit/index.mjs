// Assembles the kit that every artifact page loads: stylesheet + runtime + chart kinds, as inline <style>/<script>.
import { kitCore } from './core.mjs'
import { kitCss } from './css.mjs'
import { bar, donut, line, scatter } from './charts-basic.mjs'
import { KINDS as dist } from './charts-dist.mjs'
import { KINDS as flow } from './charts-flow.mjs'
import { KINDS as misc } from './charts-misc.mjs'
import { KINDS as graph } from './charts-graph.mjs'

/** kind name -> drawing function. Several names may share one function (it reads spec.kind). */
export const KINDS = { line, area: line, bar, scatter, bubble: scatter, donut, pie: donut, ...dist, ...flow, ...misc, ...graph }

/** JSON that is safe inside an inline <script>: no "</script" or "<!--" can close or confuse it (U+2028 is legal in JS since ES2019). */
export const scriptJson = v => JSON.stringify(v).replace(/</g, '\\u003c')

export function kitHead(dark, id) {
  const kinds = Object.entries(KINDS).map(([n, f]) => `sx.kind(${JSON.stringify(n)},${f.toString()})`).join(';')
  return `<style>${kitCss(dark)}</style><script>(${kitCore.toString()})(window,${scriptJson(id)});${kinds}</script>`
}

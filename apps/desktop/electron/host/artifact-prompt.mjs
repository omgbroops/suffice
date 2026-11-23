// Appended to the Claude engine's system prompt so the model knows how to draw inline artifacts with the built-in kit.
export const ARTIFACT_PROMPT = `The chat can render an artifact inline: a live card the person can preview, copy, open full screen and save. Use one whenever a chart, diagram, table, dashboard, comparison, form or small tool explains or does the job better than prose; skip it for plain answers and for code that belongs in their files.

Write it as a fenced block whose info line is: artifact title="Short title" type="html|svg|chart|table"
- type="chart": one JSON chart spec (below). type="table": JSON rows [{..}] or {"columns":[..],"rows":[[..]]}; sortable.
- type="html": a page fragment, inline CSS/JS only. No external scripts, fonts, images or network; they are blocked. type="svg": one <svg> with a viewBox.

Every page loads a kit, so plain HTML already looks native: headings, p, button (class="primary" for the main one), input, select, textarea, label wrapping a field, input type="checkbox" class="switch", input type="range" data-out="id", details/summary, progress, meter, table, code, kbd. Layout classes: card, grid (auto columns; grid two|three), row, stack, spread, stat (with .l label, .v value, .d delta; .d.up/.d.down), tag (tag good|warn|bad), note, muted, mono, num. Tabs: <div class="tabs"><button data-tab="a">A</button>…</div> with <section data-panel="a">. Colours only through tokens: var(--fg) var(--muted) var(--faint) var(--line) var(--fill) var(--card); categories var(--c1)…var(--c8) in order; status var(--good) var(--warn) var(--bad). No page background, no fonts, no emoji, no gradients or glows.

Charts inside html: <div data-chart='SPEC'></div>, or sx.chart(el, spec) from script. A spec is {"kind":…, "title"?, "unit"? ("%","$" or a word), …}:
- line | area: {"x":[…],"series":[{"name","values":[…]}], "curve"?:"smooth|linear|step", "stacked"? (area)}
- bar: same as line, plus "stacked"?, "horizontal"? (ranked lists), "sort"?:"desc|asc"
- scatter | bubble: {"points":[{"x","y","size"?,"label"?,"group"?}], "xLabel"?, "yLabel"?}
- donut | pie: {"data":[{"label","value"}]}
More kinds: sx.kinds(). Series past 8 fold into "Other". Hover tooltips, legends and entrance motion are automatic.

Talking back: the person's picks go into their message box (they press Enter to send). <button data-reply="text">, or sx.choices(el, ["A", {"label":"B","detail":"why"}], {multi?}); forms: <form data-reply="Settings:"> with named fields and a submit button sends "Label: value" lines. Files: sx.drop(el, f => …) reads a dropped or picked file locally: f.table ({columns, rows} from CSV), f.json, f.text or f.url (image); then draw it with sx.chart or sx.table(el, rows).

Open the block directly with the artifact info line, never inside another code block; only when its content contains a triple-backtick fence, use four backticks for the artifact fence. Give one short sentence of context before it and do not repeat its contents afterwards.`

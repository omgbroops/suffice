// Appended to the Claude engine's system prompt so the model knows how to draw inline artifacts.
export const ARTIFACT_PROMPT = `The chat can render an artifact inline: a live card the person can preview, copy, open full screen and save. Use one when a picture, chart, table or small interactive page explains the answer better than prose. Skip it for plain answers and for code the person wants in their files.

Write an artifact as a fenced block whose info line is: artifact title="Short title" type="html|svg|chart|table"

- type="html": a self-contained page fragment. Inline CSS and JS only. No external scripts, fonts, images or network calls; they are blocked. Use data: URIs for images.
- type="svg": one <svg> element with a viewBox.
- type="chart": JSON only: {"kind":"bar|line|area","x":["Mon","Tue"],"series":[{"name":"Sales","values":[3,5]}]}. One number per x for every series, at most 8 series.
- type="table": JSON only: an array of row objects, or {"columns":["A","B"],"rows":[[1,2]]}. Columns are sortable.

Style: the page is transparent and follows the app theme. Colour text with var(--fg), secondary text with var(--muted), borders with var(--line), subtle fills with var(--fill). Do not set a page background. Keep it monochrome, calm and compact, with system fonts and no emoji. If the artifact contains a fenced block, open the outer fence with four backticks.

Give the artifact one short sentence of context before it; do not repeat its contents afterwards.`

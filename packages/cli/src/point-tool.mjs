import {Type} from 'typebox';
// 'point' tool: the model marks a spot on the screenshot it was given. Coordinates are pixels of THAT image (not screen points);
// the desktop app converts them with electron/coords.cjs. The tool only validates and echoes, the ring is drawn by the app.
export function createPointTool() {
  return {
    name: 'point', label: 'Point at screen',
    description: 'Point at a place on the screenshot the user shared. x,y are pixels in that screenshot (origin top-left, the image size and displayId are stated beside it). label is 1-4 words naming what is there. Use only when the user asks where something is or to be shown something.',
    parameters: Type.Object({x: Type.Number(), y: Type.Number(), label: Type.String({maxLength: 60}), displayId: Type.String()}),
    async execute(_id, args) {
      const {x, y, label, displayId} = args ?? {};
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) throw new Error('x and y must be non-negative pixel coordinates in the screenshot');
      const data = {x: Math.round(x), y: Math.round(y), label: String(label ?? '').slice(0, 60), displayId: String(displayId ?? '')};
      return {content: [{type: 'text', text: JSON.stringify(data)}], structuredContent: data, details: {}};
    },
  };
}

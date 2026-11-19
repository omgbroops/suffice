// Screenshot-space <-> screen-point mapping. The model sees a downscaled image; its coordinates are in that image's pixels.
// Mixing the two spaces is the Agent S grounding-scale bug, so every conversion goes through here.
const MAX_EDGE = 2576;

// Size of the image we send for a display: logical points (so a 2x Retina is downscaled 2x), then capped on the long edge.
function imageSizeFor(bounds) {
  const k = Math.min(1, MAX_EDGE / Math.max(bounds.width, bounds.height));
  return { width: Math.max(1, Math.round(bounds.width * k)), height: Math.max(1, Math.round(bounds.height * k)) };
}

// capture: { displayId, bounds:{x,y,width,height} (screen points), image:{width,height} (pixels actually sent) }
// Returns null when the point lies outside the image by more than 1 px; edge overshoot within 1 px is clamped.
function toScreenPoint(point, capture) {
  const { bounds, image } = capture;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !(image.width > 0) || !(image.height > 0)) return null;
  if (point.x < -1 || point.y < -1 || point.x > image.width + 1 || point.y > image.height + 1) return null;
  const x = Math.min(Math.max(point.x, 0), image.width), y = Math.min(Math.max(point.y, 0), image.height);
  return { x: Math.round(bounds.x + x * bounds.width / image.width), y: Math.round(bounds.y + y * bounds.height / image.height) };
}

module.exports = { imageSizeFor, toScreenPoint, MAX_EDGE };

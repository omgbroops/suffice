// xterm's DOM renderer assigns the same dimensions rule on each resize.
// Replacing that style's text invalidates unrelated document styles in WebKit.
export function guardTerminalDimensionsStyle(terminal) {
  if (!terminal) return;
  const owner = Array.from(terminal.classList).find(name => /^xterm-dom-renderer-owner-\d+$/.test(name));
  if (!owner) return;
  const selector = '.' + owner + ' .xterm-rows span';
  const candidates = Array.from(terminal.querySelectorAll('.xterm-screen > style')).filter(style => {
    const rules = style.sheet?.cssRules;
    return rules?.length === 1 && rules[0].selectorText === selector;
  });
  if (candidates.length !== 1) return;
  const style = candidates[0];
  if (Object.hasOwn(style, 'textContent') || !Object.isExtensible(style)) return;
  const descriptor = Object.getOwnPropertyDescriptor(style.ownerDocument.defaultView.Node.prototype, 'textContent');
  if (!descriptor?.get || !descriptor.set) return;
  const originalText = descriptor.get.call(style);
  const originalRule = style.sheet.cssRules[0].cssText;
  let textNode = style.firstChild;

  function setText(value) {
    if (this === style && value === originalText && textNode?.nodeType === 3 &&
        style.firstChild === textNode && style.lastChild === textNode && textNode.data === value) {
      // CSSOM edits can change the live rule without changing its DOM text.
      const sheet = style.sheet;
      if (sheet && !sheet.disabled && !style.media && sheet.media.length === 0 &&
          sheet.cssRules.length === 1 && sheet.cssRules[0].cssText === originalRule) return;
    }
    descriptor.set.call(this, value);
    if (this === style) textNode = style.firstChild;
  }
  Object.defineProperty(style, 'textContent', {configurable:true, get:descriptor.get, set:setText});
  return () => {
    const current = Object.getOwnPropertyDescriptor(style, 'textContent');
    if (current?.configurable && current.get === descriptor.get && current.set === setText) delete style.textContent;
  };
}

// §4.7: risk tags decide which actions reach action.approve; untagged actions never ask.
const host = (u) => { try { return new URL(u).host; } catch { return null; } };
const T = (re, s) => re.test(String(s ?? ''));

export function tagAction({ surface, action, element, obs, app } = {}) {
  const tags = [];
  const a = action?.action;
  const name = element?.name ?? '';
  if (element?.secure || (a === 'type' && T(/password|passcode|otp|2fa|ssn/i, name)) || (a === 'click' && obs?.elements?.some((e) => e.secure))) tags.push('credential');
  if (T(/card number|cvv|place order|checkout|purchase|buy now|\bpay\b/i, name)) tags.push('payment');
  if (T(/delete|remove|erase|wipe|reset|unsubscribe|deactivate/i, name)) tags.push('destructive');
  if ((a === 'click' && T(/\b(send|publish|post|reply|share|submit)\b/i, name)) || (a === 'type' && T(/^(to|cc|bcc)$/i, name))) tags.push('send');
  if (T(/download|export/i, name)) tags.push('download');
  const here = host(obs?.url);
  const there = a === 'navigate' ? host(action.url) : host(element?.href);
  if (here && there && here !== there) tags.push('navigation-external');
  if (surface === 'desktop' && T(/system settings|system preferences|terminal|iterm|keychain/i, app)) tags.push('system');
  return [...new Set(tags)];
}

// §4.1: page text is data, never instructions; flag instruction-shaped text and hidden actionable elements.
const INJ = [/ignore\s+(all\s+)?(previous|prior)/i, /you are now/i, /\bsystem\s*:/i];
export function detectInjection({ elements = [], text = '' } = {}) {
  if (INJ.some((re) => re.test(text) || elements.some((e) => re.test(e.name ?? '')))) return true;
  return elements.some((e) => e.hidden && /\b(click|delete|ignore|send|transfer|reveal|execute)\b/i.test(e.name ?? ''));
}

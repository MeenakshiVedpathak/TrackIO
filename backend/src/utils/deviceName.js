'use strict';

/**
 * A readable device label for the audit log.
 *
 * A browser cannot read the laptop's real computer name, so the label is either what the app chose to
 * send (X-Device-Name) or — when it sends none — built from the User-Agent: "Chrome 130 · Windows".
 * (Chrome and Edge report Windows 11 as "Windows NT 10.0", so the OS is just "Windows".)
 */

const MAX_LENGTH = 120;

function browserOf(ua) {
  const rules = [
    [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
    [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
    [/Version\/(\d+)[\d.]*.*Safari\//, 'Safari'],
  ];
  for (const [pattern, name] of rules) {
    const match = ua.match(pattern);
    if (match) return `${name} ${match[1]}`;
  }
  return null;
}

function osOf(ua) {
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Linux|X11/i.test(ua)) return 'Linux';
  return null;
}

/** "Chrome 130 · Windows" from a User-Agent string, or null when it is not recognisable. */
function fromUserAgent(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return null;
  const label = [browserOf(ua), osOf(ua)].filter(Boolean).join(' · ');
  return label || null;
}

/** A name the app sent: control characters removed, trimmed, capped — or null when empty. */
function sanitize(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
  return clean || null;
}

module.exports = { fromUserAgent, sanitize };

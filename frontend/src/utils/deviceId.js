const STORAGE_KEY = 'rut_device_id';
const NAME_STORAGE_KEY = 'rut_device_name';
const VALID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;
const MAX_NAME_LENGTH = 120;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

// crypto.randomUUID() isn't available on insecure origins (plain http, some older browsers) —
// fall back to a 32-char random hex string built from crypto.getRandomValues, which still
// satisfies VALID_PATTERN.
const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

// In-memory fallback for when localStorage throws (private browsing, blocked site data) — kept
// for the lifetime of the tab only, never persisted, so it's regenerated every page load.
let memoryDeviceId = null;

// Stable per-browser identifier sent on every API request as X-Device-Id. Never regenerated on
// login/logout and never cleared on logout — it identifies the device/browser, not the session.
export const getDeviceId = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_PATTERN.test(stored)) return stored;
    const created = generateId();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    if (!memoryDeviceId) memoryDeviceId = generateId();
    return memoryDeviceId;
  }
};

const sanitizeDeviceName = (name) => name.replace(CONTROL_CHARS, '').trim().slice(0, MAX_NAME_LENGTH);

// "Chromium"/"Not A Brand" entries in userAgentData.brands are noise next to the real brand name
// (every Chromium-based browser lists all three) — prefer "Google Chrome"/"Microsoft Edge" (and
// strip their "Google "/"Microsoft " prefix for a shorter label) when present, otherwise fall
// back to whatever's left.
const brandFromUserAgentData = (brands) => {
  if (!Array.isArray(brands) || brands.length === 0) return null;
  const names = brands.map((b) => b?.brand).filter(Boolean);
  const preferred = names.find((n) => n === 'Google Chrome' || n === 'Microsoft Edge');
  const picked = preferred ?? names.find((n) => n !== 'Not A Brand' && n !== 'Not;A Brand' && n !== 'Chromium') ?? null;
  return picked ? picked.replace(/^(Google|Microsoft)\s+/, '') : null;
};

// Readable device label sent as X-Device-Name on every request. A user-set name (see
// saveDeviceName) always wins; otherwise built from the Client Hints API only (e.g. "Chrome on
// Windows") — no User-Agent string parsing here, since the backend already derives an equivalent
// fallback from the raw User-Agent header itself when this is absent. Returns '' (never sent)
// when neither a saved name nor userAgentData is available.
export const getDeviceName = () => {
  try {
    const saved = localStorage.getItem(NAME_STORAGE_KEY);
    if (saved) {
      const clean = sanitizeDeviceName(saved);
      if (clean) return clean;
    }
  } catch {
    // Fall through to the derived name below.
  }

  const uaData = typeof navigator !== 'undefined' ? navigator.userAgentData : undefined;
  if (!uaData) return '';
  const platform = typeof uaData.platform === 'string' ? uaData.platform.trim() : '';
  const brand = brandFromUserAgentData(uaData.brands);
  const label = brand && platform ? `${brand} on ${platform}` : brand || platform;
  return sanitizeDeviceName(label || '');
};

// Persists a user-chosen device name (e.g. "Meenakshi's Laptop") — empty clears it back to the
// auto-derived name. Never touches rut_device_id.
export const saveDeviceName = (name) => {
  const clean = sanitizeDeviceName(String(name ?? ''));
  try {
    if (clean) localStorage.setItem(NAME_STORAGE_KEY, clean);
    else localStorage.removeItem(NAME_STORAGE_KEY);
  } catch {
    // No in-memory fallback needed — a failed save just means the next getDeviceName() call
    // falls back to the derived name again, which is a safe default.
  }
  return clean;
};

// Reads the raw saved override (not the derived fallback) — used by the "This device" editor to
// show the user's own text in the input, leaving it blank/placeholder when nothing is saved.
export const getSavedDeviceName = () => {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
};

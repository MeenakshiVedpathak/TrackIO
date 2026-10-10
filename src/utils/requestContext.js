'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const deviceName = require('./deviceName');

/**
 * Per-request context so code far from the controller (e.g. createAuditLog, called from
 * ~20 services with no `req`) can still know WHO is acting, in WHICH role, under WHICH
 * Business Unit and from WHICH IP — without threading `req` through every call site.
 *
 * The authenticated request is stored by reference, so fields resolved later in the
 * middleware chain (req.companyId from resolveCompany) are still read at call time.
 */
const storage = new AsyncLocalStorage();

/** Called once per authenticated request (auth.js), after req.employeeId etc. are set. */
const enter = (req) => storage.enterWith({ req });

/** Express middleware: makes the request available to createAuditLog even before authentication (login). */
const captureMiddleware = (req, res, next) => {
  storage.enterWith({ req });
  next();
};

// Random per-device id the app sends on every request. Anything that is not a plausible id is ignored.
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/** The sanitised X-Device-Id header of a request, or null. */
const getDeviceId = (req) => {
  const raw = req && req.headers ? req.headers['x-device-id'] : null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && DEVICE_ID_PATTERN.test(value.trim()) ? value.trim() : null;
};

/**
 * A readable name for the device: the X-Device-Name the app sent, else one built from the request's
 * User-Agent ("Chrome 130 · Windows"), else null. Never the computer's real hostname — a browser cannot
 * read it.
 */
const getDeviceName = (req) => {
  if (!req || !req.headers) return null;
  return deviceName.sanitize(req.headers['x-device-name']) || deviceName.fromUserAgent(req.headers['user-agent']);
};

/** The current request, or null outside a request (scheduler, scripts, tests). */
const getRequest = () => storage.getStore()?.req || null;

module.exports = { enter, captureMiddleware, getRequest, getDeviceId, getDeviceName };

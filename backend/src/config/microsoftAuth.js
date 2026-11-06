'use strict';

const jwksClient = require('jwks-rsa');
const logger = require('../utils/logger');

/**
 * Microsoft Entra ID (Azure AD) SSO configuration — multi-tenant
 * (organizational accounts only). One App Registration / client id serves
 * every organization's own Entra tenant; who may actually use the app is
 * decided by Employee Master (see authService.loginWithMicrosoft()), never
 * by a tenant id here.
 *
 * Signing keys come from Microsoft's tenant-independent JWKS for the
 * configured authority. The JWKS host is pinned to MICROSOFT_LOGIN_ORIGIN —
 * the URL is built from configuration once, never from anything inside a
 * token, so a token can never steer which keys are fetched.
 *
 * Deliberately does NOT fail fast at require-time the way config/jwt.js's
 * JWT_SECRET check does. Microsoft SSO is an additive, optionally-configured
 * feature layered on top of the already-working email/password login, and
 * this module is required from authService.js — the same file every
 * existing login request already goes through. Crashing server boot over a
 * missing MICROSOFT_* env var would take down email/password login for
 * every deployment that hasn't configured Entra yet. Instead,
 * getMicrosoftAuthConfig() throws only when something actually calls it
 * (i.e. only when POST /auth/microsoft is hit), so an unconfigured
 * environment keeps running everything else normally.
 */

const MICROSOFT_LOGIN_ORIGIN = 'https://login.microsoftonline.com';
const DEFAULT_MICROSOFT_AUTHORITY = `${MICROSOFT_LOGIN_ORIGIN}/organizations`;
const JWKS_FETCH_TIMEOUT_MS = 10000;

let cachedJwksClient = null;

// kid -> the JWK's own `issuer` template (e.g.
// "https://login.microsoftonline.com/{tenantid}/v2.0"), recorded from the
// raw JWKS response because jwks-rsa's signing-key objects drop every JWK
// property except kid/alg. Refreshed on every JWKS fetch, so it always
// covers every key jwks-rsa can hand back.
const signingKeyIssuers = new Map();

/**
 * @returns {Error}
 */
function notConfiguredError() {
  const err = new Error('Microsoft SSO is not configured on this server.');
  err.statusCode = 503;
  err.code = 'MICROSOFT_SSO_NOT_CONFIGURED';
  err.isOperational = true;
  return err;
}

/**
 * Resolve the tenant-independent JWKS URL for MICROSOFT_AUTHORITY, refusing
 * any authority outside Microsoft Entra's public-cloud login host.
 *
 * @param {string} authority
 * @returns {string|null} null when the authority is not an allowed Microsoft Entra endpoint
 */
function resolveJwksUri(authority) {
  let url;
  try {
    url = new URL(authority);
  } catch (err) {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (url.origin !== MICROSOFT_LOGIN_ORIGIN || segments.length !== 1 || url.search || url.hash) {
    return null;
  }
  return `${MICROSOFT_LOGIN_ORIGIN}/${encodeURIComponent(segments[0])}/discovery/v2.0/keys`;
}

/**
 * jwks-rsa `fetcher` — same request jwks-rsa would make itself, plus
 * recording each key's `issuer` template into signingKeyIssuers.
 *
 * @param {string} uri - always the jwksUri this client was built with
 * @returns {Promise<{ keys: object[] }>}
 */
async function fetchJwks(uri) {
  const res = await fetch(uri, { signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    const err = new Error(`Http Error ${res.status}`);
    err.errorMsg = err.message;
    throw err;
  }
  const body = await res.json();
  (body.keys || []).forEach((jwk) => {
    if (typeof jwk.kid === 'string') {
      signingKeyIssuers.set(jwk.kid, typeof jwk.issuer === 'string' ? jwk.issuer : null);
    }
  });
  return body;
}

/**
 * @returns {{
 *   clientId: string,
 *   loginOrigin: string,
 *   getSigningKey: (header: object, callback: (err: Error|null, key?: string) => void) => void,
 *   getSigningKeyIssuer: (kid: string) => string|null
 * }}
 * @throws {Error} statusCode 503, code MICROSOFT_SSO_NOT_CONFIGURED — when
 *   MICROSOFT_CLIENT_ID is not set, or MICROSOFT_AUTHORITY is not a
 *   Microsoft Entra login endpoint.
 */
function getMicrosoftAuthConfig() {
  const { MICROSOFT_CLIENT_ID } = process.env;
  const authority = process.env.MICROSOFT_AUTHORITY || DEFAULT_MICROSOFT_AUTHORITY;

  if (!MICROSOFT_CLIENT_ID) {
    throw notConfiguredError();
  }

  const jwksUri = resolveJwksUri(authority);
  if (!jwksUri) {
    logger.error('MICROSOFT_AUTHORITY is not an allowed Microsoft Entra login endpoint', { authority });
    throw notConfiguredError();
  }

  if (!cachedJwksClient) {
    cachedJwksClient = jwksClient({
      jwksUri,
      fetcher: fetchJwks,
      cache: true,
      cacheMaxAge: 24 * 60 * 60 * 1000, // Microsoft rotates signing keys infrequently
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  return {
    clientId: MICROSOFT_CLIENT_ID,
    loginOrigin: MICROSOFT_LOGIN_ORIGIN,
    getSigningKey: (header, callback) => {
      cachedJwksClient.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        callback(null, key.getPublicKey());
      });
    },
    getSigningKeyIssuer: (kid) => signingKeyIssuers.get(kid) || null,
  };
}

module.exports = { getMicrosoftAuthConfig, resolveJwksUri };

'use strict';

const jwt = require('jsonwebtoken');
const microsoftAuth = require('../config/microsoftAuth');
const logger = require('../utils/logger');

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The fixed tenant id Microsoft stamps on personal Microsoft accounts
// (outlook.com/hotmail.com/live.com). Organizational sign-in only.
const MICROSOFT_CONSUMER_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';

/**
 * Verify a Microsoft Entra ID ID token presented by the frontend after it
 * completes an Authorization Code + PKCE sign-in via MSAL — see
 * POST /auth/microsoft (authController.loginWithMicrosoft).
 *
 * Multi-tenant validation, in order — every claim below is read only from
 * the payload jsonwebtoken.verify() returned, never by decoding-without-
 * verifying:
 *   1. signature against Microsoft's tenant-independent JWKS (fetched/cached
 *      via config/microsoftAuth.js), RS256 only; `aud` === our client id;
 *      `exp`/`nbf` — all inside jsonwebtoken.verify() itself. `exp` must
 *      also be present (jsonwebtoken accepts a token without one).
 *   2. `tid` is a GUID, and not the personal-Microsoft-account tenant.
 *   3. `iss` === https://login.microsoftonline.com/{tid}/v2.0 — the issuer
 *      differs per tenant, so it is checked against the token's own
 *      (already signature-verified) `tid` rather than one fixed string.
 *   4. the signing key's own `issuer` template (when the JWK carries one),
 *      with {tenantid} substituted, equals `iss`.
 *   5. `oid` is a GUID and `ver` is "2.0".
 *   6. the `email` claim's domain is verified in the token's OWN tenant
 *      (see isEmailDomainVerifiedInTenant()). Any Entra tenant can sign in
 *      now, and a tenant admin can set any user's mail attribute to any
 *      address — without this, another organization could present a
 *      @gttdata.ai email and be matched to that Employee Master row.
 *
 * Which employees may use the app is NOT decided here — Employee Master is
 * the source of truth, see authService.loginWithMicrosoft().
 *
 * @param {string} idToken - raw ID token string from the frontend
 * @returns {Promise<{ email: string, oid: string, tid: string, name: string|null }>}
 *   `email` is lowercased/trimmed the same way authRepository.findEmployeeByEmail()
 *   normalises the password-login email, so lookups behave identically.
 * @throws {Error} statusCode 401 (INVALID_MICROSOFT_TOKEN or
 *   MICROSOFT_EMAIL_CLAIM_MISSING) | 403 (MICROSOFT_EMAIL_DOMAIN_NOT_VERIFIED)
 *   | 503 (MICROSOFT_SSO_NOT_CONFIGURED, bubbled up from config/microsoftAuth.js)
 */
async function verifyMicrosoftIdToken(idToken) {
  const { clientId, loginOrigin, getSigningKey, getSigningKeyIssuer } = microsoftAuth.getMicrosoftAuthConfig();

  let verified;
  try {
    verified = await new Promise((resolve, reject) => {
      jwt.verify(
        idToken,
        getSigningKey,
        { audience: clientId, algorithms: ['RS256'], complete: true },
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });
  } catch (err) {
    logger.warn('Microsoft ID token verification failed', { reason: err.name, error: err.message });
    throw invalidMicrosoftTokenError();
  }

  const { header, payload } = verified;
  const { tid, oid, iss } = payload;

  if (typeof payload.exp !== 'number') {
    return rejectToken('missing exp claim', { tid, oid });
  }

  if (typeof tid !== 'string' || !GUID_PATTERN.test(tid)) {
    return rejectToken('missing or malformed tid claim', { oid });
  }

  if (tid === MICROSOFT_CONSUMER_TENANT_ID) {
    return rejectToken('personal Microsoft account (consumer tenant)', { tid });
  }

  const expectedIssuer = `${loginOrigin}/${tid}/v2.0`;
  if (iss !== expectedIssuer) {
    return rejectToken('issuer does not match tenant', { tid, iss });
  }

  const keyIssuer = getSigningKeyIssuer(header.kid);
  if (keyIssuer && keyIssuer.replace('{tenantid}', tid) !== iss) {
    return rejectToken('signing key issuer does not match token issuer', { tid, kid: header.kid });
  }

  if (typeof oid !== 'string' || !GUID_PATTERN.test(oid)) {
    return rejectToken('missing or malformed oid claim', { tid });
  }

  if (payload.ver !== '2.0') {
    return rejectToken('unsupported token version', { tid, oid, ver: payload.ver });
  }

  if (!payload.email) {
    logger.warn('Microsoft ID token has no email claim', { tid, oid });
    const err = new Error(
      'Your Microsoft account did not return an email address. Please contact the administrator.'
    );
    err.statusCode = 401;
    err.code = 'MICROSOFT_EMAIL_CLAIM_MISSING';
    err.isOperational = true;
    throw err;
  }

  const email = payload.email.toLowerCase().trim();

  if (!isEmailDomainVerifiedInTenant(payload, email)) {
    logger.warn('Microsoft ID token email domain is not verified in its tenant', {
      tid,
      oid,
      domain: domainOf(email),
    });
    const err = new Error(
      'Your Microsoft account email domain is not verified for your organization. Please contact the administrator.'
    );
    err.statusCode = 403;
    err.code = 'MICROSOFT_EMAIL_DOMAIN_NOT_VERIFIED';
    err.isOperational = true;
    throw err;
  }

  return {
    email,
    oid,
    tid,
    name: payload.name || null,
  };
}

/**
 * @param {string} address
 * @returns {string|null} lowercase domain part, or null if not an email-shaped string
 */
function domainOf(address) {
  if (typeof address !== 'string') return null;
  const at = address.lastIndexOf('@');
  if (at < 1 || at === address.length - 1) return null;
  return address.slice(at + 1).toLowerCase().trim();
}

/**
 * Whether Entra itself vouches that the `email` claim's domain belongs to
 * the token's own tenant — the `email` claim alone is admin-editable and NOT
 * verified by Microsoft. Either signal is issued by Entra, so no domain list
 * is kept in this app:
 *   - `xms_edov` (optional ID-token claim, "email domain owner verified")
 *     is true: the email domain is a verified domain of this tenant.
 *   - the email domain equals the `preferred_username` (UPN) domain: Entra
 *     only allows a UPN suffix that is a verified (or the tenant's own
 *     *.onmicrosoft.com) domain of the same tenant.
 *
 * @param {object} payload - signature-verified token payload
 * @param {string} email - normalised email claim
 * @returns {boolean}
 */
function isEmailDomainVerifiedInTenant(payload, email) {
  const edov = payload.xms_edov;
  if (edov === true || edov === 1 || edov === 'true' || edov === '1') return true;

  const emailDomain = domainOf(email);
  return emailDomain !== null && emailDomain === domainOf(payload.preferred_username);
}

/**
 * @param {string} reason - safe to log; never the token itself
 * @param {object} context - claim values only (tid/oid/iss/kid/ver)
 * @throws {Error} always
 */
function rejectToken(reason, context) {
  logger.warn('Microsoft ID token rejected', { reason, ...context });
  throw invalidMicrosoftTokenError();
}

/**
 * @returns {Error}
 */
function invalidMicrosoftTokenError() {
  const err = new Error('Invalid or expired Microsoft sign-in. Please try again.');
  err.statusCode = 401;
  err.code = 'INVALID_MICROSOFT_TOKEN';
  err.isOperational = true;
  return err;
}

module.exports = { verifyMicrosoftIdToken };

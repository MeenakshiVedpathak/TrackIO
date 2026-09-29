'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Real RS256 tokens signed with throwaway keys, verified through the real
// jsonwebtoken.verify() path — only the JWKS source is swapped out, via the
// same module-object monkey-patch pattern as the other auth tests
// (microsoftAuthService reads microsoftAuth.getMicrosoftAuthConfig at call time).
const microsoftAuth = require('../src/config/microsoftAuth');
const microsoftAuthService = require('../src/services/microsoftAuthService');

const CLIENT_ID = '57552a5e-c724-46db-a131-4fdbeeed20b5';
const LOGIN = 'https://login.microsoftonline.com';
// Stand-ins for the GTT / CRG / Alpharithm tenants — any org tenant works.
const TENANT_GTT = '11111111-1111-4111-8111-111111111111';
const TENANT_CRG = '22222222-2222-4222-8222-222222222222';
const TENANT_ALPHA = '33333333-3333-4333-8333-333333333333';
const CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';
const OID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KID = 'test-kid-1';

const trustedKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const attackerKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const TRUSTED_PUBLIC_PEM = trustedKeys.publicKey.export({ type: 'spki', format: 'pem' });

const ORIGINAL_GET_CONFIG = microsoftAuth.getMicrosoftAuthConfig;

function stubConfig({ keyIssuer = `${LOGIN}/{tenantid}/v2.0` } = {}) {
  microsoftAuth.getMicrosoftAuthConfig = () => ({
    clientId: CLIENT_ID,
    loginOrigin: LOGIN,
    getSigningKey: (header, callback) => {
      if (header.kid !== KID) return callback(new Error('signing key not found'));
      callback(null, TRUSTED_PUBLIC_PEM);
    },
    getSigningKeyIssuer: () => keyIssuer,
  });
}

function restore() {
  microsoftAuth.getMicrosoftAuthConfig = ORIGINAL_GET_CONFIG;
}

function claimsFor(tid, overrides = {}) {
  return {
    aud: CLIENT_ID,
    iss: `${LOGIN}/${tid}/v2.0`,
    tid,
    oid: OID,
    sub: 'subject-1',
    ver: '2.0',
    email: 'User.A@CRGroup.co.in ',
    preferred_username: 'user.a@crgroup.co.in',
    name: 'User A',
    ...overrides,
  };
}

function sign(claims, { key = trustedKeys.privateKey, expiresIn = '10m', kid = KID } = {}) {
  const options = { algorithm: 'RS256', keyid: kid };
  if (expiresIn) options.expiresIn = expiresIn;
  return jwt.sign(claims, key.export({ type: 'pkcs8', format: 'pem' }), options);
}

async function assertRejects(token, statusCode, code) {
  await assert.rejects(
    () => microsoftAuthService.verifyMicrosoftIdToken(token),
    (err) => {
      assert.equal(err.statusCode, statusCode);
      assert.equal(err.code, code);
      return true;
    }
  );
}

const assertInvalidToken = (token) => assertRejects(token, 401, 'INVALID_MICROSOFT_TOKEN');
const assertDomainNotVerified = (token) => assertRejects(token, 403, 'MICROSOFT_EMAIL_DOMAIN_NOT_VERIFIED');

// ─── Valid tokens from different organizations' own tenants ───────────────────

for (const [label, tid, email] of [
  ['GTT', TENANT_GTT, 'someone@gttdata.ai'],
  ['CRG', TENANT_CRG, 'someone@crgroup.co.in'],
  ['Alpharithm', TENANT_ALPHA, 'someone@alpharithm.com'],
]) {
  test(`verifyMicrosoftIdToken() accepts a valid ${label} user signing in from their own tenant`, async () => {
    stubConfig();
    const result = await microsoftAuthService.verifyMicrosoftIdToken(
      sign(claimsFor(tid, { email, preferred_username: email }))
    );
    assert.deepEqual(result, { email, oid: OID, tid, name: 'User A' });
    restore();
  });
}

test('verifyMicrosoftIdToken() lowercases/trims the email the same way password login does', async () => {
  stubConfig();
  const result = await microsoftAuthService.verifyMicrosoftIdToken(sign(claimsFor(TENANT_CRG)));
  assert.equal(result.email, 'user.a@crgroup.co.in');
  restore();
});

test('verifyMicrosoftIdToken() accepts a key with no issuer template (validated on iss/tid alone)', async () => {
  stubConfig({ keyIssuer: null });
  const result = await microsoftAuthService.verifyMicrosoftIdToken(sign(claimsFor(TENANT_CRG)));
  assert.equal(result.tid, TENANT_CRG);
  restore();
});

// ─── Email domain must be verified in the token's own tenant ──────────────────

test('verifyMicrosoftIdToken() accepts an email whose domain differs from the UPN when xms_edov confirms it', async () => {
  stubConfig();
  for (const edov of [true, 1, 'true', '1']) {
    const result = await microsoftAuthService.verifyMicrosoftIdToken(sign(claimsFor(TENANT_CRG, {
      email: 'x@second-domain.com',
      preferred_username: 'x@crg.onmicrosoft.com',
      xms_edov: edov,
    })));
    assert.equal(result.email, 'x@second-domain.com');
  }
  restore();
});

test('verifyMicrosoftIdToken() rejects another tenant presenting a GTT email it does not own (impersonation)', async () => {
  stubConfig();
  await assertDomainNotVerified(sign(claimsFor(TENANT_CRG, { email: 'boss@gttdata.ai', preferred_username: 'attacker@crgroup.co.in' })));
  await assertDomainNotVerified(sign(claimsFor(TENANT_CRG, { email: 'boss@gttdata.ai', preferred_username: 'attacker@crgroup.co.in', xms_edov: false })));
  restore();
});

test('verifyMicrosoftIdToken() does not treat lookalike domains as the same domain', async () => {
  stubConfig();
  await assertDomainNotVerified(sign(claimsFor(TENANT_CRG, { email: 'x@evilcrgroup.co.in', preferred_username: 'x@crgroup.co.in' })));
  await assertDomainNotVerified(sign(claimsFor(TENANT_CRG, { email: 'x@crgroup.co.in.evil.com', preferred_username: 'x@crgroup.co.in' })));
  restore();
});

test('verifyMicrosoftIdToken() rejects an unverifiable email when there is no UPN and no xms_edov', async () => {
  stubConfig();
  const { preferred_username, ...claims } = claimsFor(TENANT_CRG);
  await assertDomainNotVerified(sign(claims));
  restore();
});

// ─── Token validation ─────────────────────────────────────────────────────────

test('verifyMicrosoftIdToken() rejects an expired token', async () => {
  stubConfig();
  const now = Math.floor(Date.now() / 1000);
  await assertInvalidToken(sign(claimsFor(TENANT_CRG, { iat: now - 7200, exp: now - 3600 }), { expiresIn: null }));
  restore();
});

test('verifyMicrosoftIdToken() rejects a token with no exp claim', async () => {
  stubConfig();
  await assertInvalidToken(sign(claimsFor(TENANT_CRG), { expiresIn: null }));
  restore();
});

test('verifyMicrosoftIdToken() rejects an invalid signature (signed by a key outside the JWKS)', async () => {
  stubConfig();
  await assertInvalidToken(sign(claimsFor(TENANT_CRG), { key: attackerKeys.privateKey }));
  restore();
});

test('verifyMicrosoftIdToken() rejects a token whose kid is not in the JWKS', async () => {
  stubConfig();
  await assertInvalidToken(sign(claimsFor(TENANT_CRG), { kid: 'unknown-kid' }));
  restore();
});

test('verifyMicrosoftIdToken() rejects an HS256 token forged with the public key (algorithm confusion)', async () => {
  stubConfig();
  const forged = jwt.sign(claimsFor(TENANT_CRG), TRUSTED_PUBLIC_PEM, { algorithm: 'HS256', keyid: KID, expiresIn: '10m', allowInsecureKeySizes: true });
  await assertInvalidToken(forged);
  restore();
});

test('verifyMicrosoftIdToken() rejects a token issued for another application (aud)', async () => {
  stubConfig();
  await assertInvalidToken(sign(claimsFor(TENANT_CRG, { aud: '99999999-9999-4999-8999-999999999999' })));
  restore();
});

test('verifyMicrosoftIdToken() rejects an issuer belonging to a different tenant than tid', async () => {
  stubConfig();
  await assertInvalidToken(sign(claimsFor(TENANT_CRG, { iss: `${LOGIN}/${TENANT_GTT}/v2.0` })));
  restore();
});

test('verifyMicrosoftIdToken() rejects generic, non-Microsoft and v1.0 issuers', async () => {
  stubConfig();
  for (const iss of [
    `${LOGIN}/organizations/v2.0`,
    `https://evil.example.com/${TENANT_CRG}/v2.0`,
    `https://sts.windows.net/${TENANT_CRG}/`,
  ]) {
    await assertInvalidToken(sign(claimsFor(TENANT_CRG, { iss })));
  }
  restore();
});

test('verifyMicrosoftIdToken() rejects a token signed by a key whose issuer is a different tenant', async () => {
  stubConfig({ keyIssuer: `${LOGIN}/${TENANT_GTT}/v2.0` });
  await assertInvalidToken(sign(claimsFor(TENANT_CRG)));
  restore();
});

test('verifyMicrosoftIdToken() rejects a missing or malformed tid claim', async () => {
  stubConfig();
  const { tid, ...noTid } = claimsFor(TENANT_CRG);
  await assertInvalidToken(sign(noTid));
  for (const badTid of ['not-a-guid', 'organizations', 'common', OID.toUpperCase(), `${TENANT_CRG}/x`, '']) {
    await assertInvalidToken(sign(claimsFor(TENANT_CRG, { tid: badTid, iss: `${LOGIN}/${badTid}/v2.0` })));
  }
  restore();
});

test('verifyMicrosoftIdToken() rejects a personal Microsoft account (consumer tenant)', async () => {
  stubConfig();
  await assertInvalidToken(sign(claimsFor(CONSUMER_TENANT)));
  restore();
});

test('verifyMicrosoftIdToken() rejects a missing/malformed oid and a v1.0 token', async () => {
  stubConfig();
  const { oid, ...noOid } = claimsFor(TENANT_CRG);
  await assertInvalidToken(sign(noOid));
  await assertInvalidToken(sign(claimsFor(TENANT_CRG, { oid: 'not-a-guid' })));
  await assertInvalidToken(sign(claimsFor(TENANT_CRG, { ver: '1.0' })));
  restore();
});

test('verifyMicrosoftIdToken() rejects a verified token with no email claim', async () => {
  stubConfig();
  const { email, ...claims } = claimsFor(TENANT_CRG);
  await assertRejects(sign(claims), 401, 'MICROSOFT_EMAIL_CLAIM_MISSING');
  restore();
});

test('verifyMicrosoftIdToken() rejects garbage that is not a JWT at all', async () => {
  stubConfig();
  await assertInvalidToken('not.a.jwt');
  restore();
});

// ─── Config ───────────────────────────────────────────────────────────────────

test('resolveJwksUri() only accepts a single-segment https://login.microsoftonline.com authority', () => {
  assert.equal(
    microsoftAuth.resolveJwksUri('https://login.microsoftonline.com/organizations'),
    'https://login.microsoftonline.com/organizations/discovery/v2.0/keys'
  );
  for (const bad of [
    'https://evil.example.com/organizations',
    'http://login.microsoftonline.com/organizations',
    'https://login.microsoftonline.com.evil.com/organizations',
    'https://login.microsoftonline.com/organizations/v2.0',
    'https://login.microsoftonline.com/',
    'https://login.microsoftonline.com/organizations?x=1',
    'not a url',
  ]) {
    assert.equal(microsoftAuth.resolveJwksUri(bad), null, bad);
  }
});

test('getMicrosoftAuthConfig() needs only MICROSOFT_CLIENT_ID (no tenant id), and rejects a non-Microsoft authority', () => {
  const saved = { ...process.env };
  try {
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_TENANT_ID;
    assert.throws(() => ORIGINAL_GET_CONFIG(), (err) => err.statusCode === 503 && err.code === 'MICROSOFT_SSO_NOT_CONFIGURED');

    process.env.MICROSOFT_CLIENT_ID = CLIENT_ID;
    process.env.MICROSOFT_AUTHORITY = 'https://evil.example.com/organizations';
    assert.throws(() => ORIGINAL_GET_CONFIG(), (err) => err.code === 'MICROSOFT_SSO_NOT_CONFIGURED');

    delete process.env.MICROSOFT_AUTHORITY;
    const config = ORIGINAL_GET_CONFIG();
    assert.equal(config.clientId, CLIENT_ID);
    assert.equal(config.loginOrigin, LOGIN);
  } finally {
    process.env = saved;
  }
});

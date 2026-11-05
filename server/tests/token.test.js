// Signing moved from a string secret to a key object, to stop jsonwebtoken
// throwing an exception inside every verification. Students are carrying tokens
// signed the old way, with refresh tokens good for 30 days, so the thing to
// prove is that nothing about the tokens themselves changed.

import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-for-token-compatibility';
const { accessPayload, signAccessToken, signRefreshToken, verifyToken } = await import('../utils/token.js');

const SECRET = process.env.JWT_SECRET;
const user = { _id: { toString: () => '64b000000000000000000001' }, role: 'student' };

test('a token signed the old way, with the string, still verifies', () => {
  const old = jwt.sign({ sub: 'abc', role: 'student', typ: 'access' }, SECRET, { expiresIn: '2h' });
  assert.equal(verifyToken(old).sub, 'abc');
});

test('a token signed now verifies under the plain string too, so a rollback is safe', () => {
  const now = signAccessToken(user);
  assert.equal(jwt.verify(now, SECRET).sub, '64b000000000000000000001');
});

test('the algorithm is still HS256', () => {
  assert.equal(jwt.decode(signRefreshToken(user), { complete: true }).header.alg, 'HS256');
});

test('a token signed with another secret is refused', () => {
  assert.equal(verifyToken(jwt.sign({ sub: 'abc' }, 'some-other-secret')), null);
});

test('an unsigned token is refused', () => {
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"abc"}').toString('base64url')}.`;
  assert.equal(verifyToken(none), null);
});

test('a tampered token is refused', () => {
  const [head, , sig] = signAccessToken(user).split('.');
  const forged = Buffer.from('{"sub":"64b000000000000000000002","role":"admin","typ":"access"}').toString('base64url');
  assert.equal(verifyToken(`${head}.${forged}.${sig}`), null);
});

test('an expired token is refused', () => {
  assert.equal(verifyToken(jwt.sign({ sub: 'abc' }, SECRET, { expiresIn: -10 })), null);
});

test('a refresh token does not pass for an access token', () => {
  const req = { headers: { authorization: `Bearer ${signRefreshToken(user)}` } };
  assert.equal(accessPayload(req), null);
});

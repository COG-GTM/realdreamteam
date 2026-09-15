const crypto = require('node:crypto');

const DEFAULT_CODES = ['20240312', '03122024', '12032024'];
const ACCESS_COOKIE = 'rdt_access';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function configuredCodes() {
  const configured = process.env.ACCESS_CODES;
  if (configured === undefined) return DEFAULT_CODES;
  return configured.split(',').map((code) => code.trim()).filter(Boolean);
}

function isValidCode(code, codes = configuredCodes()) {
  if (typeof code !== 'string') return false;

  const candidate = Buffer.from(code.trim());
  return codes.some((codeValue) => {
    const expected = Buffer.from(String(codeValue).trim());
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

function safeNext(next) {
  return typeof next === 'string' && /^\/(?!\/)/.test(next) ? next : '/';
}

function setAccessCookie(req, res) {
  const forwardedProto = req.get('x-forwarded-proto');
  res.cookie(ACCESS_COOKIE, 'ok', {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || forwardedProto === 'https',
    signed: true,
    maxAge: COOKIE_MAX_AGE
  });
}

function redirectWithoutCode(req, res) {
  const url = new URL(req.originalUrl, 'http://localhost');
  url.searchParams.delete('code');
  return res.redirect(`${url.pathname}${url.search}`);
}

function createAccessGate() {
  const codes = configuredCodes();

  return (req, res, next) => {
    if (req.signedCookies[ACCESS_COOKIE] === 'ok') return next();

    if (isValidCode(req.query.code, codes)) {
      setAccessCookie(req, res);
      return redirectWithoutCode(req, res);
    }

    if (req.method === 'POST' && req.path === '/login') {
      const destination = safeNext(req.body && req.body.next);
      if (isValidCode(req.body && req.body.code, codes)) {
        setAccessCookie(req, res);
        return res.redirect(destination);
      }

      return res.status(401).render('login', {
        error: "That's not it — try again.",
        next: destination
      });
    }

    return res.status(401).render('login', {
      error: null,
      next: req.originalUrl
    });
  };
}

module.exports = { createAccessGate, isValidCode };

function gateCookieOptions() {
  return {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };
}

module.exports = { gateCookieOptions };

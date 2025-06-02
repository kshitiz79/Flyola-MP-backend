
const buildCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
  path: '/',
  maxAge: 60 * 60 * 1000, // 1 hour in milliseconds
});

module.exports = { buildCookieOptions };

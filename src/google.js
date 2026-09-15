const passport = require('passport');

const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (googleEnabled) {
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: (process.env.BASE_URL || 'http://localhost:3000') + '/auth/google/callback',
    },
    (accessToken, refreshToken, profile, done) => done(null, profile)
  ));
  console.log('[auth] เปิดใช้งาน "เข้าสู่ระบบด้วย Google"');
}

module.exports = { passport, googleEnabled };

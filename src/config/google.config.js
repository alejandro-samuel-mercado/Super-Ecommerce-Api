const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const prisma = require('./prisma');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;

      if (!email) {
          return done(new Error('No email found in Google profile'), null);
      }
      
      let user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!user) {
       
        const role = await prisma.role.findUnique({
            where: { name: 'CUSTOMER' }
        });

        user = await prisma.user.create({
          data: {
            email: email.toLowerCase(),
            name: profile.displayName,
            password: 'OAUTH_USER_' + Math.random().toString(36).slice(-8), 
            roleId: role?.id
          }
        });
      }

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
));


module.exports = passport;

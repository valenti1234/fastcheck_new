import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { User } from '../models/user.model';
import { Tenant } from '../models/tenant.model';

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id).populate('tenant');
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
        authorizationURL: process.env.GOOGLE_AUTHORIZATION_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenURL: process.env.GOOGLE_TOKEN_URL || 'https://www.googleapis.com/oauth2/v4/token',
        userProfileURL: process.env.GOOGLE_USERINFO_URL || 'https://www.googleapis.com/oauth2/v3/userinfo',
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          // Check if user already exists with this Google ID
          let user = await User.findOne({
            oauthProvider: 'google',
            oauthId: profile.id,
          }).populate('tenant');

          if (user) {
            return done(null, user);
          }

          // Check if user exists with same email
          user = await User.findOne({ email: profile.emails?.[0]?.value }).populate('tenant');

          if (user) {
            // Link Google account to existing user
            user.oauthProvider = 'google';
            user.oauthId = profile.id;
            user.profilePicture = profile.photos?.[0]?.value;
            await user.save();
            return done(null, user);
          }

          // Create new user - but they need a tenant assignment
          // For now, we'll create the user but mark as inactive until admin assigns tenant
          const newUser = new User({
            name: profile.displayName || `${profile.name?.givenName} ${profile.name?.familyName}`,
            email: profile.emails?.[0]?.value,
            oauthProvider: 'google',
            oauthId: profile.id,
            profilePicture: profile.photos?.[0]?.value,
            role: 'evaluator',
            isActive: false, // Requires admin activation
            // We'll need to handle tenant assignment separately
            tenant: null as any, // This will need to be handled by admin
          });

          // For demo purposes, let's find the first available tenant
          // In production, you'd want a proper tenant assignment flow
          const defaultTenant = await Tenant.findOne({ status: 'active' });
          if (defaultTenant) {
            newUser.tenant = defaultTenant._id;
          }

          await newUser.save();
          return done(null, newUser as any);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

// Microsoft OAuth Strategy
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  passport.use(
    new MicrosoftStrategy(
      {
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/auth/microsoft/callback',
        authorizationURL: process.env.MICROSOFT_AUTHORIZATION_URL || 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenURL: process.env.MICROSOFT_TOKEN_URL || 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        scope: ['user.read'],
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          // Check if user already exists with this Microsoft ID
          let user = await User.findOne({
            oauthProvider: 'microsoft',
            oauthId: profile.id,
          }).populate('tenant');

          if (user) {
            return done(null, user);
          }

          // Check if user exists with same email
          user = await User.findOne({ email: profile.emails?.[0]?.value }).populate('tenant');

          if (user) {
            // Link Microsoft account to existing user
            user.oauthProvider = 'microsoft';
            user.oauthId = profile.id;
            user.profilePicture = profile.photos?.[0]?.value;
            await user.save();
            return done(null, user);
          }

          // Create new user - but they need a tenant assignment
          const newUser = new User({
            name: profile.displayName || `${profile.name?.givenName} ${profile.name?.familyName}`,
            email: profile.emails?.[0]?.value,
            oauthProvider: 'microsoft',
            oauthId: profile.id,
            profilePicture: profile.photos?.[0]?.value,
            role: 'evaluator',
            isActive: false, // Requires admin activation
            tenant: null as any,
          });

          // For demo purposes, let's find the first available tenant
          const defaultTenant = await Tenant.findOne({ status: 'active' });
          if (defaultTenant) {
            newUser.tenant = defaultTenant._id;
          }

          await newUser.save();
          return done(null, newUser);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

export default passport;
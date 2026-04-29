import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { isTeacher } from './teachers';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session }) {
      if (session.user) {
        (session.user as { isTeacher?: boolean }).isTeacher = isTeacher(
          session.user.email,
        );
      }
      return session;
    },
    async signIn() {
      // אפשר כניסה לכולם — ההרשאה נבדקת בדף עצמו
      return true;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
};

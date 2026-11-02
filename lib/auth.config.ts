import type { NextAuthConfig } from "next-auth";

// Keep in sync with lib/session-version.ts (that file imports Prisma, so not edge-safe).
const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

/**
 * Edge-safe Auth.js config for middleware.
 * Must not import Prisma, bcrypt, or other Node-only modules.
 */
export const authConfig = {
  providers: [],
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS, updateAge: SESSION_UPDATE_AGE_SECONDS },
  pages: { signIn: "/login" },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
        delete token.deleted;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.deleted || !token.id) {
        return { ...session, user: undefined };
      }

      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "USER";
        if (token.name) session.user.name = token.name as string;
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

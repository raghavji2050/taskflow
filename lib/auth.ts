import NextAuth, { type Account } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations";
import { getGitHubOAuthConfig, getGoogleOAuthConfig } from "@/lib/oauth";
import { authConfig } from "@/lib/auth.config";
import { isSessionRevoked } from "@/lib/session-version";
import type { NextAuthConfig } from "next-auth";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (!user?.password) return null;

      const isValid = await bcrypt.compare(parsed.data.password, user.password);
      if (!isValid) return null;

      return { id: user.id, name: user.name, email: user.email };
    },
  }),
];

const googleOAuth = getGoogleOAuthConfig();
if (googleOAuth.enabled) {
  providers.unshift(
    Google({
      clientId: googleOAuth.clientId!,
      clientSecret: googleOAuth.clientSecret!,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

const githubOAuth = getGitHubOAuthConfig();
if (githubOAuth.enabled) {
  providers.unshift(
    GitHub({
      clientId: githubOAuth.clientId!,
      clientSecret: githubOAuth.clientSecret!,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

function oauthAccountData(account: Account) {
  return {
    type: account.type,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    refresh_token: account.refresh_token ?? null,
    access_token: account.access_token ?? null,
    expires_at: account.expires_at ?? null,
    token_type: account.token_type ?? null,
    scope: account.scope ?? null,
    id_token: account.id_token ?? null,
    session_state: typeof account.session_state === "string" ? account.session_state : null,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return true;
      if (!user.email) return false;

      const existing = await prisma.user.findUnique({ where: { email: user.email } });
      if (!existing) {
        const created = await prisma.user.create({
          data: {
            name: user.name ?? user.email.split("@")[0],
            email: user.email,
            emailVerified: new Date(),
            image: user.image,
          },
        });
        user.id = created.id;
      } else {
        user.id = existing.id;
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            emailVerified: existing.emailVerified ?? new Date(),
            image: existing.image ?? user.image,
          },
        });
      }

      if (account) {
        const data = oauthAccountData(account);
        await prisma.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          update: data,
          create: {
            userId: user.id,
            ...data,
          },
        });
      }

      return true;
    },
    async jwt({ token, user }) {
      const freshSignIn = Boolean(user?.id);
      if (user?.id) {
        token.id = user.id;
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
        delete token.deleted;
      }

      // Edge middleware: never touch Prisma — role/session already live in the JWT.
      if (process.env.NEXT_RUNTIME === "edge" || !token.id) {
        return token;
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: { id: true, name: true, email: true, role: true, sessionVersion: true },
      });

      if (!dbUser) {
        return { ...token, id: undefined, sub: undefined, deleted: true };
      }

      if (freshSignIn) {
        token.sessionVersion = dbUser.sessionVersion;
      } else if (isSessionRevoked(token.sessionVersion, dbUser.sessionVersion)) {
        // Password changed/reset or "sign out everywhere": this token is no longer valid.
        return { ...token, id: undefined, sub: undefined, deleted: true };
      }

      token.id = dbUser.id;
      token.sub = dbUser.id;
      token.name = dbUser.name;
      token.email = dbUser.email;
      token.role = dbUser.role;
      delete token.deleted;

      return token;
    },
  },
});

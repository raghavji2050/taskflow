import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** Per-sign-in id, used to make sign-out stick (see lib/signout-marker.ts). */
    sid?: string;
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    name?: string | null;
    email?: string | null;
    deleted?: boolean;
    sid?: string;
  }
}

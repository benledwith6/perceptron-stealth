import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase().trim();

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) return null;

        // Block login for users who haven't verified their email
        if (!user.emailVerified) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          industry: user.industry,
          plan: user.plan,
          role: (user as any).role || "user",
          onboarded: user.onboarded,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
    newUser: "/auth/onboarding",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.industry = (user as any).industry;
        token.plan = (user as any).plan;
        token.role = (user as any).role || "user";
        token.onboarded = (user as any).onboarded;
        token.lastRefresh = Date.now();
      }

      // Refresh user data from DB every 5 minutes to pick up plan/onboarded changes
      const REFRESH_INTERVAL = 5 * 60 * 1000;
      if (
        token.id &&
        (!token.lastRefresh ||
          Date.now() - (token.lastRefresh as number) > REFRESH_INTERVAL)
      ) {
        try {
          const freshUser = await prisma.user.findUnique({
            where: { id: token.id as string },
          });
          if (freshUser) {
            token.industry = freshUser.industry;
            token.plan = freshUser.plan;
            token.role = (freshUser as any).role || "user";
            token.onboarded = freshUser.onboarded;
            token.lastRefresh = Date.now();
          }
        } catch {
          // If DB lookup fails, keep existing token data
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).industry = token.industry;
        (session.user as any).plan = token.plan;
        (session.user as any).role = token.role;
        (session.user as any).onboarded = token.onboarded;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

function getAllowedEmails(): string[] | null {
  const raw = process.env.ALLOWED_EMAILS;
  if (!raw?.trim()) return null;
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.settings.basic",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLogin = nextUrl.pathname.startsWith("/login");
      if (isLogin) return true;
      if (!isLoggedIn) return false;
      return true;
    },
    async signIn({ user }) {
      const allowed = getAllowedEmails();
      if (!allowed) return true;
      const email = user.email?.toLowerCase();
      return !!email && allowed.includes(email);
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        return token;
      }

      const expiresAt = (token.expiresAt as number) ?? 0;
      if (Date.now() < expiresAt * 1000 - 60_000) {
        return token;
      }

      if (!token.refreshToken) return token;

      try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type: "refresh_token",
            refresh_token: token.refreshToken as string,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Token refresh failed");
        token.accessToken = data.access_token;
        token.expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600);
      } catch {
        token.accessToken = undefined;
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};

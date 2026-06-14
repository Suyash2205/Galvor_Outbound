import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
});

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireSession() {
  const session = await requireAuth();
  if (!session.accessToken) {
    throw new Error("Gmail access not granted. Please sign out and sign in again.");
  }
  return session;
}

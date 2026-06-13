"use client";

import { GalvorBrand } from "@/components/GalvorBrand";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <GalvorBrand centered href={null} />
        <div className="login-title">Outbound</div>
        <p className="login-subtitle">
          Sign in with your Gmail account to access the outbound pipeline and send emails from your inbox.
        </p>
        <button
          className="login-btn"
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}

"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: "48px 40px",
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
          Galvor Outbound
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 32, lineHeight: 1.6 }}>
          Sign in with your Gmail account to access the outbound pipeline and send emails from your inbox.
        </p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          style={{
            width: "100%",
            background: "#2B4EFF",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "13px 20px",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}

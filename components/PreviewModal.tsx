"use client";

import type { EmailContent } from "@/lib/types";

export function PreviewModal({
  open,
  onClose,
  companyName,
  email,
  loading,
  error,
  progressMessage,
}: {
  open: boolean;
  onClose: () => void;
  companyName: string;
  email: EmailContent | null;
  loading: boolean;
  error: string | null;
  progressMessage?: string | null;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#12142a",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          maxWidth: 720,
          width: "100%",
          maxHeight: "85vh",
          overflow: "auto",
          padding: 28,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Preview
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginTop: 4 }}>{companyName}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 20 }}
          >
            ×
          </button>
        </div>

        {loading && (
          <div style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
            <p style={{ marginBottom: 12, fontWeight: 600, color: "#7B9FFF" }}>
              {progressMessage || "Starting…"}
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
              Email 1 scrapes Meta Ad Library (1–3 min) then calls Claude. This modal updates automatically — keep it open.
            </p>
          </div>
        )}
        {error && (
          <p style={{ color: "#FCA5A5", fontSize: 13, lineHeight: 1.6 }}>{error}</p>
        )}
        {email && !loading && (
          <>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>SUBJECT</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 20 }}>{email.subject}</div>
            <div
              style={{ background: "#fff", borderRadius: 8, padding: 20, color: "#1a1a1a" }}
              dangerouslySetInnerHTML={{ __html: email.htmlBody }}
            />
          </>
        )}
      </div>
    </div>
  );
}

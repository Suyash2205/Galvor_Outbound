"use client";

import type { EmailContent } from "@/lib/types";

export function PreviewModal({
  open,
  onClose,
  companyName,
  email,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  companyName: string;
  email: EmailContent | null;
  loading: boolean;
  error: string | null;
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

        {loading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Generating preview… (may take 1–2 min for Email 1)</p>}
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

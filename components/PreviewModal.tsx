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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <div className="modal__eyebrow">Preview</div>
            <div className="modal__title">{companyName}</div>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {loading && (
          <div style={{ lineHeight: 1.7 }}>
            <p className="modal__loading-title">{progressMessage || "Starting…"}</p>
            <p className="modal__loading-hint">
              Email 1 scrapes Meta Ad Library (1–3 min) then calls Claude. This modal updates
              automatically — keep it open.
            </p>
          </div>
        )}
        {error && <p className="modal__error">{error}</p>}
        {email && !loading && (
          <>
            <div className="modal__subject-label">Subject</div>
            <div className="modal__subject">{email.subject}</div>
            <div
              className="modal__email-preview"
              dangerouslySetInnerHTML={{ __html: email.htmlBody }}
            />
          </>
        )}
      </div>
    </div>
  );
}

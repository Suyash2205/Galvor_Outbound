"use client";

export function ImportEmail1Modal({
  open,
  companyName,
  stage,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  companyName: string;
  stage: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (email1Body: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onClose}>
      <div className="modal modal--import" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <div className="modal__eyebrow">Import Email 1</div>
            <div className="modal__title">{companyName || "Lead"}</div>
          </div>
          <button className="modal__close" onClick={onClose} disabled={loading} aria-label="Close">
            ×
          </button>
        </div>

        <p className="modal__import-hint">
          Paste the Email 1 you already sent (stage {stage}). We&apos;ll rebuild the analysis cache
          with one Claude call — no Meta Ad Library scrape — so Email 2+ can be generated from it.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const text = (form.elements.namedItem("email1Body") as HTMLTextAreaElement).value;
            onSubmit(text);
          }}
        >
          <textarea
            name="email1Body"
            className="modal__import-textarea"
            placeholder="Paste the full sent Email 1 here (plain text from Gmail Sent folder)…"
            rows={14}
            disabled={loading}
            required
          />

          {error && <p className="modal__error">{error}</p>}

          <div className="modal__import-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? "Building cache…" : "Save cache from Email 1"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

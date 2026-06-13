"use client";

interface MovedLead {
  rowIndex: number;
  companyName: string;
}

export function ReplyAlert({
  movedLeads,
  onView,
  onDismiss,
}: {
  movedLeads: MovedLead[];
  onView: () => void;
  onDismiss: () => void;
}) {
  const label =
    movedLeads.length === 1
      ? `${movedLeads[0].companyName} replied`
      : `${movedLeads.length} leads replied`;

  return (
    <div className="reply-alert" role="status">
      <button type="button" className="reply-alert__main" onClick={onView}>
        <span className="reply-alert__title">Reply detected</span>
        <span className="reply-alert__text">{label} — click to view in Responses</span>
      </button>
      <button type="button" className="reply-alert__dismiss" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

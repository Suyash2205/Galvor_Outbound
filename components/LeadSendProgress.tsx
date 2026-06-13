"use client";

export interface RowSendState {
  message: string;
  percent: number;
  status: "active" | "completed" | "error";
}

export function LeadSendProgress({ state }: { state: RowSendState }) {
  const isCompleted = state.status === "completed";
  const isError = state.status === "error";

  const labelClass = isCompleted
    ? "send-progress__label send-progress__label--completed"
    : isError
      ? "send-progress__label send-progress__label--error"
      : "send-progress__label";

  const barClass = isCompleted
    ? "send-progress__bar send-progress__bar--completed"
    : isError
      ? "send-progress__bar send-progress__bar--error"
      : "send-progress__bar send-progress__bar--active";

  return (
    <div className="send-progress">
      <div className="send-progress__header">
        <span className={labelClass}>{isCompleted ? "Completed" : state.message}</span>
        {!isCompleted && !isError && (
          <span className="send-progress__pct">{state.percent}%</span>
        )}
      </div>
      <div className="send-progress__track">
        <div className={barClass} style={{ width: `${state.percent}%` }} />
      </div>
    </div>
  );
}

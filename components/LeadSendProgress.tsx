"use client";

export interface RowSendState {
  message: string;
  percent: number;
  status: "active" | "completed" | "error";
}

export function LeadSendProgress({ state }: { state: RowSendState }) {
  const isCompleted = state.status === "completed";
  const isError = state.status === "error";
  const barColor = isCompleted ? "#10B981" : isError ? "#EF4444" : "#2B4EFF";

  return (
    <div style={{ width: 200, flexShrink: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: isCompleted ? 600 : 500,
            color: isCompleted ? "#10B981" : isError ? "#FCA5A5" : "rgba(255,255,255,0.55)",
            lineHeight: 1.3,
          }}
        >
          {isCompleted ? "Completed" : state.message}
        </span>
        {!isCompleted && !isError && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
            {state.percent}%
          </span>
        )}
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 4,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${state.percent}%`,
            borderRadius: 4,
            background: barColor,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

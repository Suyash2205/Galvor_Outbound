"use client";

import { LeadSendProgress, type RowSendState } from "@/components/LeadSendProgress";
import { PreviewModal } from "@/components/PreviewModal";
import { phaseToProgress, runLeadJobUntilReady } from "@/lib/job-client";
import type { JobPhase } from "@/lib/lead-job";
import type { EmailContent, Lead, LeadStage } from "@/lib/types";
import { STAGE_TABS } from "@/lib/types";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SPREADSHEET_ID = "1-nZCTRbeZCLgUPA91k37QlFHbL99sIKIdIUSB9tbmdc";

export function Dashboard() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeStage, setActiveStage] = useState<LeadStage>("1");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [sendingRows, setSendingRows] = useState<Set<number>>(new Set());
  const [rowProgress, setRowProgress] = useState<Record<number, RowSendState>>({});
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const completedTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewEmail, setPreviewEmail] = useState<EmailContent | null>(null);
  const [previewCompany, setPreviewCompany] = useState("");
  const [previewProgress, setPreviewProgress] = useState<string | null>(null);

  const showActionMessage = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 3000);
  };

  const setLeadProgress = (rowIndex: number, message: string, phase: JobPhase | "sending" | "completed", status: RowSendState["status"] = "active") => {
    setRowProgress((prev) => ({
      ...prev,
      [rowIndex]: {
        message,
        percent: phaseToProgress(phase),
        status,
      },
    }));
  };

  const clearLeadProgress = (rowIndex: number, delayMs = 0) => {
    if (completedTimers.current[rowIndex]) {
      clearTimeout(completedTimers.current[rowIndex]);
      delete completedTimers.current[rowIndex];
    }
    const clear = () => {
      setRowProgress((prev) => {
        const next = { ...prev };
        delete next[rowIndex];
        return next;
      });
    };
    if (delayMs > 0) {
      completedTimers.current[rowIndex] = setTimeout(clear, delayMs);
    } else {
      clear();
    }
  };

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load leads");
      setLeads(data.leads);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, 60000);
    return () => clearInterval(interval);
  }, [fetchLeads]);

  const stageLeads = useMemo(
    () => leads.filter((l) => l.stage === activeStage),
    [leads, activeStage]
  );

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of STAGE_TABS) {
      counts[tab.id] = leads.filter((l) => l.stage === tab.id).length;
    }
    return counts;
  }, [leads]);

  const toggleSelect = (rowIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = stageLeads.filter((l) => l.status !== "generating" && l.status !== "sending");
    if (selected.size === selectable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map((l) => l.rowIndex)));
    }
  };

  const initSheet = async () => {
    const res = await fetch("/api/sheets/init", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Sheet init failed");
      return;
    }
    showActionMessage(`Tab "${data.tab}" ready with headers`);
    fetchLeads();
  };

  const checkReplies = async () => {
    const res = await fetch("/api/replies/check", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Reply check failed");
      return;
    }
    showActionMessage(`Checked ${data.checked} threads — ${data.moved} moved to Responses`);
    fetchLeads();
  };

  const previewLead = async (lead: Lead) => {
    setPreviewOpen(true);
    setPreviewCompany(lead.companyName);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewEmail(null);
    setPreviewProgress("Starting…");

    try {
      const email = await runLeadJobUntilReady(lead.rowIndex, (msg) => {
        setPreviewProgress(msg);
      });
      setPreviewEmail(email);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
      setPreviewProgress(null);
    }
  };

  const sendLead = async (rowIndex: number) => {
    setSendingRows((prev) => new Set(prev).add(rowIndex));
    clearLeadProgress(rowIndex);
    setLeadProgress(rowIndex, "Starting…", "scraping");

    try {
      await runLeadJobUntilReady(rowIndex, (msg, phase) => {
        setLeadProgress(rowIndex, msg, phase);
      });

      setLeadProgress(rowIndex, "Sending email…", "sending");

      const res = await fetch(`/api/leads/${rowIndex}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");

      setLeadProgress(rowIndex, "Completed", "completed", "completed");
      clearLeadProgress(rowIndex, 4000);
      await fetchLeads();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Send failed";
      setRowProgress((prev) => ({
        ...prev,
        [rowIndex]: { message, percent: 100, status: "error" },
      }));
      clearLeadProgress(rowIndex, 6000);
      await fetchLeads();
    } finally {
      setSendingRows((prev) => {
        const next = new Set(prev);
        next.delete(rowIndex);
        return next;
      });
    }
  };

  const sendBulk = async (rowIndexes: number[]) => {
    if (!rowIndexes.length) return;
    setBulkProgress(`0 / ${rowIndexes.length}`);

    for (let i = 0; i < rowIndexes.length; i++) {
      setBulkProgress(`${i + 1} / ${rowIndexes.length}`);
      await sendLead(rowIndexes[i]);
    }

    setBulkProgress(null);
    setSelected(new Set());
  };

  const sendSelected = () => sendBulk([...selected]);
  const sendAll = () =>
    sendBulk(
      stageLeads
        .filter((l) => l.status !== "generating" && l.status !== "sending" && l.status !== "error")
        .map((l) => l.rowIndex)
    );

  const isResponseTab = activeStage === "Response Received";
  const canSend = !isResponseTab;

  return (
    <>
      <header
        style={{
          background: "rgba(7,9,26,0.96)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "0 32px",
          height: 58,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Galvor</span>
          <span
            style={{
              background: "rgba(43,78,255,0.15)",
              border: "1px solid rgba(43,78,255,0.3)",
              color: "#7B9FFF",
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 20,
            }}
          >
            Outbound Pipeline
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={fetchLeads}
            style={btnGhost}
          >
            Sync
          </button>
          <button onClick={checkReplies} style={btnGhost}>
            Check Replies
          </button>
          <button onClick={initSheet} style={btnGhost}>
            Init Sheet Tab
          </button>
          <a
            href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`}
            target="_blank"
            rel="noreferrer"
            style={{ ...btnGhost, display: "inline-flex", alignItems: "center" }}
          >
            Open Sheet
          </a>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{session?.user?.email}</span>
          <button onClick={() => signOut({ callbackUrl: "/login" })} style={btnGhost}>
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 32px 60px" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 24,
            flexWrap: "wrap",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            paddingBottom: 16,
          }}
        >
          {STAGE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveStage(tab.id);
                setSelected(new Set());
              }}
              style={{
                ...tabBtn,
                ...(activeStage === tab.id ? tabBtnActive : {}),
              }}
            >
              {tab.label}
              <span style={{ marginLeft: 6, opacity: 0.6 }}>({stageCounts[tab.id] || 0})</span>
            </button>
          ))}
        </div>

        {canSend && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
              <input type="checkbox" onChange={toggleSelectAll} checked={selected.size > 0 && selected.size === stageLeads.length} />
              Select all
            </label>
            <button
              onClick={sendSelected}
              disabled={!selected.size || !!bulkProgress}
              style={btnPrimary}
            >
              Send Selected ({selected.size})
            </button>
            <button onClick={sendAll} disabled={!stageLeads.length || !!bulkProgress} style={btnSecondary}>
              Send All Ready
            </button>
            {bulkProgress && (
              <span style={{ fontSize: 12, color: "#7B9FFF" }}>Sending {bulkProgress}…</span>
            )}
          </div>
        )}

        {loading && <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading leads…</p>}
        {actionMessage && (
          <div
            style={{
              background: "rgba(43,78,255,0.08)",
              border: "1px solid rgba(43,78,255,0.2)",
              borderRadius: 10,
              padding: 12,
              color: "#7B9FFF",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {actionMessage}
          </div>
        )}

        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 10,
              padding: 14,
              color: "#FCA5A5",
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {!loading && stageLeads.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.25)" }}>
            No leads in this section. Add rows to the <strong>Outbound Pipeline</strong> tab in Google Sheets.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stageLeads.map((lead) => {
            const isSending = sendingRows.has(lead.rowIndex);
            const isBusy = lead.status === "generating" || lead.status === "sending" || isSending;
            const progress = rowProgress[lead.rowIndex];

            return (
              <div
                key={lead.rowIndex}
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: `1px solid ${progress?.status === "completed" ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 12,
                  padding: "16px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  flexWrap: "wrap",
                }}
              >
                {canSend && (
                  <input
                    type="checkbox"
                    checked={selected.has(lead.rowIndex)}
                    onChange={() => toggleSelect(lead.rowIndex)}
                    disabled={isBusy}
                  />
                )}

                {progress && <LeadSendProgress state={progress} />}

                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{lead.companyName || "—"}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                    {lead.firstName} {lead.lastName} · {lead.email}
                  </div>
                  {lead.industry && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{lead.industry}</div>
                  )}
                </div>

                <StatusBadge status={lead.status} />

                {lead.errorMessage && (
                  <span style={{ fontSize: 11, color: "#FCA5A5", maxWidth: 200 }}>{lead.errorMessage}</span>
                )}

                {lead.respondedAt && isResponseTab && (
                  <span style={{ fontSize: 11, color: "#10B981" }}>
                    Responded {new Date(lead.respondedAt).toLocaleDateString()}
                  </span>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  {canSend && (
                    <>
                      <button onClick={() => previewLead(lead)} disabled={isBusy} style={btnSecondary}>
                        Preview
                      </button>
                      <button onClick={() => sendLead(lead.rowIndex)} disabled={isBusy} style={btnPrimary}>
                        {isBusy ? "…" : "Send"}
                      </button>
                    </>
                  )}
                  {lead.gmailThreadId && (
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${lead.gmailThreadId}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...btnGhost, display: "inline-flex", alignItems: "center" }}
                    >
                      Thread
                    </a>
                  )}
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=0&range=A${lead.rowIndex}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...btnGhost, display: "inline-flex", alignItems: "center" }}
                  >
                    Sheet
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        companyName={previewCompany}
        email={previewEmail}
        loading={previewLoading}
        error={previewError}
        progressMessage={previewProgress}
      />

    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    ready: { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" },
    generating: { bg: "rgba(43,78,255,0.12)", color: "#7B9FFF" },
    sending: { bg: "rgba(43,78,255,0.12)", color: "#7B9FFF" },
    sent: { bg: "rgba(16,185,129,0.1)", color: "#10B981" },
    error: { bg: "rgba(239,68,68,0.1)", color: "#EF4444" },
    responded: { bg: "rgba(16,185,129,0.1)", color: "#10B981" },
  };
  const c = colors[status] || colors.ready;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: "4px 10px",
        borderRadius: 20,
        background: c.bg,
        color: c.color,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "#2B4EFF",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 600,
};

const btnSecondary: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.7)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: 500,
};

const btnGhost: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.55)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
};

const tabBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.45)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 500,
};

const tabBtnActive: React.CSSProperties = {
  background: "rgba(43,78,255,0.12)",
  borderColor: "rgba(43,78,255,0.4)",
  color: "#7B9FFF",
};

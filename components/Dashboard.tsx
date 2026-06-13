"use client";

import { GalvorBrand } from "@/components/GalvorBrand";
import { LeadSendProgress, type RowSendState } from "@/components/LeadSendProgress";
import { PreviewModal } from "@/components/PreviewModal";
import { ReplyAlert } from "@/components/ReplyAlert";
import { phaseToProgress, runLeadJobUntilReady, SendCancelledError } from "@/lib/job-client";
import type { JobPhase } from "@/lib/lead-job";
import type { EmailContent, Lead, LeadStage } from "@/lib/types";
import { STAGE_TABS } from "@/lib/types";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SPREADSHEET_ID = "1-nZCTRbeZCLgUPA91k37QlFHbL99sIKIdIUSB9tbmdc";
const IDLE_BEFORE_REPLY_CHECK_MS = 2 * 60 * 1000;
const ACTIVE_REPLY_POLL_MS = 30 * 1000;

interface SendCancelToken {
  cancelled: boolean;
  abort?: AbortController;
}

interface MovedLeadInfo {
  rowIndex: number;
  companyName: string;
}

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
  const [previewRowIndex, setPreviewRowIndex] = useState<number | null>(null);
  const [previewingRows, setPreviewingRows] = useState<Set<number>>(new Set());
  const previewCancelledRef = useRef(false);
  const [replyAlert, setReplyAlert] = useState<MovedLeadInfo[] | null>(null);
  const replyCheckInFlight = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);
  const sendCancelRefs = useRef<Map<number, SendCancelToken>>(new Map());
  const leadsRef = useRef<Lead[]>([]);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  const showActionMessage = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 3000);
  };

  const setLeadProgress = (rowIndex: number, message: string, phase: JobPhase | "sending" | "cancelled" | "completed", status: RowSendState["status"] = "active") => {
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

  const fetchLeads = useCallback(async (fresh = false) => {
    try {
      const url = fresh ? "/api/leads?fresh=1" : "/api/leads";
      const res = await fetch(url);
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

  const applyReplyResults = useCallback(
    (movedRows: number[], movedLeads: MovedLeadInfo[]) => {
      if (!movedRows.length) return;

      for (const rowIndex of movedRows) {
        const token = sendCancelRefs.current.get(rowIndex);
        if (token) {
          token.cancelled = true;
          token.abort?.abort();
        }
      }

      setLeads((prev) =>
        prev.map((lead) =>
          movedRows.includes(lead.rowIndex)
            ? {
                ...lead,
                stage: "Response Received" as const,
                status: "responded" as const,
                respondedAt: lead.respondedAt || new Date().toISOString(),
                errorMessage: "",
              }
            : lead
        )
      );
      setSelected((prev) => {
        const next = new Set(prev);
        for (const rowIndex of movedRows) next.delete(rowIndex);
        return next;
      });
      setReplyAlert(movedLeads);
    },
    []
  );

  const runReplyCheck = useCallback(
    async (options?: { silent?: boolean; manual?: boolean }) => {
      if (replyCheckInFlight.current) return null;
      replyCheckInFlight.current = true;
      try {
        const res = await fetch("/api/replies/check", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Reply check failed");

        const moved = (data.moved as number) || 0;
        const movedRows = (data.movedRows as number[]) || [];
        const movedLeads = (data.movedLeads as MovedLeadInfo[]) || [];

        if (movedRows.length) {
          applyReplyResults(movedRows, movedLeads);
        }

        await fetchLeads(true);

        if (moved > 0) {
          if (options?.manual) {
            setActiveStage("Response Received");
            setReplyAlert(null);
            showActionMessage(
              `${moved} lead${moved === 1 ? "" : "s"} moved to Responses`
            );
          }
        } else if (!options?.silent) {
          showActionMessage(`Checked ${data.checked} threads — no new replies`);
        }

        return data;
      } catch (e) {
        if (!options?.silent) {
          setError(e instanceof Error ? e.message : "Reply check failed");
        }
        return null;
      } finally {
        replyCheckInFlight.current = false;
      }
    },
    [applyReplyResults, fetchLeads]
  );

  useEffect(() => {
    fetchLeads(true).then(() => {
      runReplyCheck({ silent: true });
    });
    const syncInterval = setInterval(() => fetchLeads(false), 180_000);
    return () => clearInterval(syncInterval);
  }, [fetchLeads, runReplyCheck]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      const hiddenMs = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      if (hiddenMs >= IDLE_BEFORE_REPLY_CHECK_MS) {
        runReplyCheck({ silent: true });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [runReplyCheck]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        runReplyCheck({ silent: true });
      }
    }, ACTIVE_REPLY_POLL_MS);
    return () => clearInterval(interval);
  }, [runReplyCheck]);

  const viewReplyAlert = () => {
    setActiveStage("Response Received");
    setSelected(new Set());
    setReplyAlert(null);
    fetchLeads(true);
  };

  const checkReplies = () => runReplyCheck({ manual: true });

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
    const selectable = stageLeads.filter(
      (l) => !previewingRows.has(l.rowIndex) && !sendingRows.has(l.rowIndex) && !bulkProgress
    );
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

  const cancelSend = async (rowIndex: number) => {
    const token = sendCancelRefs.current.get(rowIndex);
    if (token) {
      token.cancelled = true;
      token.abort?.abort();
    }
    await fetch(`/api/leads/${rowIndex}/unlock`, { method: "POST" });
    setSendingRows((prev) => {
      const next = new Set(prev);
      next.delete(rowIndex);
      return next;
    });
    setLeadProgress(rowIndex, "Cancelled", "cancelled", "error");
    clearLeadProgress(rowIndex, 4000);
  };

  const closePreview = () => {
    previewCancelledRef.current = true;
    if (previewRowIndex !== null) {
      setPreviewingRows((prev) => {
        const next = new Set(prev);
        next.delete(previewRowIndex);
        return next;
      });
      fetch(`/api/leads/${previewRowIndex}/unlock`, { method: "POST" });
    }
    setPreviewOpen(false);
    setPreviewLoading(false);
    setPreviewProgress(null);
    setPreviewRowIndex(null);
  };

  const previewLead = async (lead: Lead) => {
    if (previewingRows.has(lead.rowIndex) || sendingRows.has(lead.rowIndex)) return;

    previewCancelledRef.current = false;
    setPreviewRowIndex(lead.rowIndex);
    setPreviewingRows((prev) => new Set(prev).add(lead.rowIndex));
    setPreviewOpen(true);
    setPreviewCompany(lead.companyName);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewEmail(null);
    setPreviewProgress("Starting…");

    try {
      const email = await runLeadJobUntilReady(lead.rowIndex, (msg) => {
        if (!previewCancelledRef.current) setPreviewProgress(msg);
      });
      if (!previewCancelledRef.current) {
        setPreviewEmail(email);
      }
    } catch (e) {
      if (!previewCancelledRef.current) {
        setPreviewError(e instanceof Error ? e.message : "Preview failed");
      }
    } finally {
      setPreviewingRows((prev) => {
        const next = new Set(prev);
        next.delete(lead.rowIndex);
        return next;
      });
      if (!previewCancelledRef.current) {
        setPreviewLoading(false);
        setPreviewProgress(null);
      }
    }
  };

  const executeSend = async (rowIndex: number) => {
    const cancelToken: SendCancelToken = { cancelled: false, abort: new AbortController() };
    sendCancelRefs.current.set(rowIndex, cancelToken);

    setSendingRows((prev) => new Set(prev).add(rowIndex));
    clearLeadProgress(rowIndex);
    setLeadProgress(rowIndex, "Starting…", "scraping");

    const shouldCancel = () => {
      if (cancelToken.cancelled) return true;
      const lead = leadsRef.current.find((l) => l.rowIndex === rowIndex);
      return lead?.stage === "Response Received";
    };

    try {
      await runLeadJobUntilReady(
        rowIndex,
        (msg, phase) => {
          if (!shouldCancel()) setLeadProgress(rowIndex, msg, phase);
        },
        { shouldCancel }
      );

      if (shouldCancel()) throw new SendCancelledError("Send stopped — lead replied");

      const freshRes = await fetch("/api/leads?fresh=1", { signal: cancelToken.abort?.signal });
      const freshData = await freshRes.json();
      const freshLead = (freshData.leads as Lead[] | undefined)?.find((l) => l.rowIndex === rowIndex);
      if (freshLead?.stage === "Response Received") {
        throw new SendCancelledError("Send stopped — lead replied");
      }

      if (shouldCancel()) throw new SendCancelledError();

      setLeadProgress(rowIndex, "Sending email…", "sending");

      const res = await fetch(`/api/leads/${rowIndex}/send`, {
        method: "POST",
        signal: cancelToken.abort?.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");

      setLeadProgress(rowIndex, "Completed", "completed", "completed");
      clearLeadProgress(rowIndex, 4000);
      return {
        ok: true as const,
        rowIndex,
        sentUrl: data.sentUrl as string | undefined,
      };
    } catch (e) {
      if (e instanceof SendCancelledError || cancelToken.cancelled) {
        setLeadProgress(rowIndex, "Cancelled", "cancelled", "error");
        clearLeadProgress(rowIndex, 4000);
        return { ok: false as const, rowIndex, message: "Cancelled", cancelled: true as const };
      }
      const message = e instanceof Error ? e.message : "Send failed";
      setRowProgress((prev) => ({
        ...prev,
        [rowIndex]: { message, percent: 100, status: "error" },
      }));
      clearLeadProgress(rowIndex, 6000);
      return { ok: false as const, rowIndex, message };
    } finally {
      sendCancelRefs.current.delete(rowIndex);
      setSendingRows((prev) => {
        const next = new Set(prev);
        next.delete(rowIndex);
        return next;
      });
    }
  };

  const sendLead = async (rowIndex: number) => {
    const result = await executeSend(rowIndex);
    if (result.ok && result.sentUrl) {
      showActionMessage(`Sent — check your Gmail Sent folder`);
    }
    await fetchLeads(true);
  };

  const sendBulk = async (rowIndexes: number[]) => {
    const unique = [
      ...new Set(
        rowIndexes.filter((rowIndex) => {
          const lead = leadsRef.current.find((l) => l.rowIndex === rowIndex);
          return lead?.stage !== "Response Received";
        })
      ),
    ];
    if (!unique.length) return;
    setBulkProgress(`0 / ${unique.length} in progress`);

    setSendingRows((prev) => new Set([...prev, ...unique]));
    for (const rowIndex of unique) {
      clearLeadProgress(rowIndex);
      setLeadProgress(rowIndex, "Queued — starting…", "scraping");
    }

    let done = 0;
    const bumpDone = () => {
      done += 1;
      setBulkProgress(`${done} / ${unique.length} done`);
    };

    const results = await Promise.allSettled(
      unique.map(async (rowIndex) => {
        const result = await executeSend(rowIndex);
        bumpDone();
        return result;
      })
    );

    const sentCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok
    ).length;
    if (sentCount > 0) {
      showActionMessage(
        `Bulk send finished — ${sentCount} sent. Check Gmail Sent folder.`
      );
    }

    await fetchLeads(true);
    setBulkProgress(null);
    setSelected(new Set());
  };

  const sendSelected = () => sendBulk([...selected]);
  const sendAll = () =>
    sendBulk(
      stageLeads
        .filter(
          (l) =>
            !previewingRows.has(l.rowIndex) &&
            !sendingRows.has(l.rowIndex) &&
            l.status !== "error"
        )
        .map((l) => l.rowIndex)
    );

  const isResponseTab = activeStage === "Response Received";
  const canSend = !isResponseTab;

  return (
    <>
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <GalvorBrand />
          <span className="brand-badge">Outbound Pipeline</span>
        </div>
        <div className="header-actions">
          <button className="btn btn--ghost" onClick={() => fetchLeads(true)}>
            Sync
          </button>
          <button className="btn btn--ghost" onClick={checkReplies}>
            Check Replies
          </button>
          <button className="btn btn--ghost" onClick={initSheet}>
            Init Sheet Tab
          </button>
          <a
            href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`}
            target="_blank"
            rel="noreferrer"
            className="btn btn--ghost"
          >
            Open Sheet
          </a>
          <span className="header-email">{session?.user?.email}</span>
          <button className="btn btn--ghost" onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="stage-tabs">
          {STAGE_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn${activeStage === tab.id ? " tab-btn--active" : ""}`}
              onClick={() => {
                setActiveStage(tab.id);
                setSelected(new Set());
              }}
            >
              {tab.label}
              <span className="tab-count">({stageCounts[tab.id] || 0})</span>
            </button>
          ))}
        </div>

        {canSend && (
          <div className="toolbar">
            <label className="toolbar-label">
              <input
                type="checkbox"
                onChange={toggleSelectAll}
                checked={selected.size > 0 && selected.size === stageLeads.length}
              />
              Select all
            </label>
            <button
              className="btn btn--primary"
              onClick={sendSelected}
              disabled={!selected.size || !!bulkProgress}
            >
              Send Selected ({selected.size})
            </button>
            <button
              className="btn btn--secondary"
              onClick={sendAll}
              disabled={!stageLeads.length || !!bulkProgress}
            >
              Send All Ready
            </button>
            {bulkProgress && <span className="bulk-status">Bulk send: {bulkProgress}</span>}
          </div>
        )}

        {loading && <p className="loading-text">Loading leads…</p>}
        {replyAlert && replyAlert.length > 0 && (
          <ReplyAlert
            movedLeads={replyAlert}
            onView={viewReplyAlert}
            onDismiss={() => setReplyAlert(null)}
          />
        )}
        {actionMessage && <div className="alert alert--info">{actionMessage}</div>}
        {error && <div className="alert alert--error">{error}</div>}

        {!loading && stageLeads.length === 0 && (
          <div className="empty-state">
            No leads in this section. Add rows to the <strong>Outbound Pipeline</strong> tab in Google
            Sheets.
          </div>
        )}

        <div className="lead-list">
          {stageLeads.map((lead) => {
            const isSending = sendingRows.has(lead.rowIndex);
            const isPreviewing = previewingRows.has(lead.rowIndex);
            const isBusy = isSending || isPreviewing;
            const progress = rowProgress[lead.rowIndex];
            const displayStatus =
              isSending ? "sending" : isPreviewing ? "generating" : lead.status === "generating" ? "ready" : lead.status;

            return (
              <div
                key={lead.rowIndex}
                className={`lead-card${progress?.status === "completed" ? " lead-card--completed" : ""}`}
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
                  <div className="lead-name">{lead.companyName || "—"}</div>
                  <div className="lead-meta">
                    {lead.firstName} {lead.lastName} · {lead.email}
                  </div>
                  {lead.industry && <div className="lead-industry">{lead.industry}</div>}
                </div>

                <StatusBadge status={displayStatus} />

                {lead.errorMessage && <span className="lead-error">{lead.errorMessage}</span>}

                {lead.respondedAt && isResponseTab && (
                  <span className="lead-responded">
                    Responded {new Date(lead.respondedAt).toLocaleDateString()}
                  </span>
                )}

                <div className="lead-actions">
                  {canSend && (
                    <>
                      <button
                        className="btn btn--secondary"
                        onClick={() => previewLead(lead)}
                        disabled={isBusy}
                      >
                        Preview
                      </button>
                      {isSending ? (
                        <button
                          className="btn btn--cancel"
                          onClick={() => cancelSend(lead.rowIndex)}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          className="btn btn--primary"
                          onClick={() => sendLead(lead.rowIndex)}
                          disabled={isBusy}
                        >
                          Send
                        </button>
                      )}
                    </>
                  )}
                  {lead.gmailThreadId && (
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${lead.gmailThreadId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn--ghost"
                    >
                      Thread
                    </a>
                  )}
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=0&range=A${lead.rowIndex}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn--ghost"
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
        onClose={closePreview}
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
  const key = ["ready", "generating", "sending", "sent", "error", "responded"].includes(status)
    ? status
    : "ready";
  return <span className={`status-badge status-badge--${key}`}>{status}</span>;
}

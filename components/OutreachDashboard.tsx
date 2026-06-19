"use client";

import { AppHeader } from "@/components/AppHeader";
import { PageHead } from "@/components/PageHead";
import {
  BRAND_TRACKER_TAB_GID,
  OUTREACH_CATEGORIES,
  OUTREACH_TRACKER_SPREADSHEET_ID,
  type OutreachActivity,
  type OutreachBrand,
  type OutreachCategory,
} from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OutreachDashboard() {
  const [brands, setBrands] = useState<OutreachBrand[]>([]);
  const [activities, setActivities] = useState<OutreachActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [activityDate, setActivityDate] = useState(todayInputValue());
  const [brand, setBrand] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [category, setCategory] = useState<OutreachCategory>("Call");
  const [comments, setComments] = useState("");
  const [polishedComment, setPolishedComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [brandSyncing, setBrandSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftHtml, setDraftHtml] = useState("");
  const [draftPlain, setDraftPlain] = useState("");

  const showActionMessage = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [brandsRes, activitiesRes] = await Promise.all([
        fetch("/api/outreach/brands"),
        fetch("/api/outreach/activities?limit=50"),
      ]);
      const brandsData = await brandsRes.json();
      const activitiesData = await activitiesRes.json();
      if (!brandsRes.ok) throw new Error(brandsData.error || "Failed to load brands");
      if (!activitiesRes.ok) throw new Error(activitiesData.error || "Failed to load activities");
      setBrands(brandsData.brands || []);
      setActivities(activitiesData.activities || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load outreach data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    if (!q) return brands.slice(0, 20);
    return brands.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 20);
  }, [brands, brandSearch]);

  const polishComment = async () => {
    if (!brand.trim() || !comments.trim()) return;
    setPolishing(true);
    setError(null);
    try {
      const res = await fetch("/api/outreach/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, category, comments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Polish failed");
      setPolishedComment(data.polished);
      showActionMessage("Comment polished — edit before saving if needed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Polish failed");
    } finally {
      setPolishing(false);
    }
  };

  const saveActivity = async () => {
    if (!brand.trim() || !comments.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/outreach/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityDate,
          brand: brand.trim(),
          category,
          comments: comments.trim(),
          polishedComment: polishedComment.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setActivities((prev) => [data.activity, ...prev]);
      setComments("");
      setPolishedComment("");
      showActionMessage("Activity logged");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const syncPipeline = async (overwrite = false) => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch("/api/outreach/sync-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overwrite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setSyncResult(
        `Updated ${data.updated} rows (${data.matchedByEmail} by email, ${data.matchedByCompany} by company). Skipped ${data.skipped}. Unmatched brands: ${data.unmatched?.length || 0}.`
      );
      showActionMessage("Pipeline email status synced to tracker");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const syncBrandTracker = async () => {
    setBrandSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/tracker/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Brand tracker sync failed");
      showActionMessage(
        `Tracker updated: ${data.brands} brands (${data.activeLeads} active leads)`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brand tracker sync failed");
    } finally {
      setBrandSyncing(false);
    }
  };

  const generateDraft = async () => {
    setDraftLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/outreach/weekly-draft", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft generation failed");
      setDraftSubject(data.draft.subject);
      setDraftHtml(data.draft.htmlBody);
      setDraftPlain(data.draft.plainBody);
      showActionMessage(`Draft ready (${data.activityCount} activities this week)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft generation failed");
    } finally {
      setDraftLoading(false);
    }
  };

  const copyDraft = async () => {
    const html = draftHtml;
    const plain = `Subject: ${draftSubject}\n\n${draftPlain}`;
    try {
      if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      showActionMessage("Copied — paste into Gmail to keep formatting");
    } catch {
      await navigator.clipboard.writeText(plain);
      showActionMessage("Copied as plain text");
    }
  };

  return (
    <>
      <AppHeader
        active="outreach"
        actions={
          <>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => loadData()}
              disabled={loading}
            >
              Refresh
            </button>
            <a
              href={`https://docs.google.com/spreadsheets/d/${OUTREACH_TRACKER_SPREADSHEET_ID}/edit?gid=${BRAND_TRACKER_TAB_GID}#gid=${BRAND_TRACKER_TAB_GID}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn--ghost btn--sm"
            >
              Open sheet ↗
            </a>
          </>
        }
      />

      <main className="app-main outreach-main">
        <PageHead
          title="Outreach"
          subtitle="Log calls and meetings. Status and comments sync to the tracker automatically when you save."
        />
        {actionMessage && <div className="alert alert--info">{actionMessage}</div>}
        {error && <div className="alert alert--error">{error}</div>}

        <div className="outreach-grid">
          <section className="outreach-card">
            <h2 className="outreach-card__title">Log activity</h2>
            <p className="outreach-card__hint">
              Tag each entry with a category — these map 1:1 to weekly email sections.
            </p>

            <div className="outreach-form">
              <label className="outreach-field">
                <span>Date</span>
                <input
                  type="date"
                  className="lead-filters__input"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                />
              </label>

              <label className="outreach-field">
                <span>Brand</span>
                <input
                  type="search"
                  className="lead-filters__input"
                  placeholder="Search brands from tracker…"
                  value={brandSearch || brand}
                  onChange={(e) => {
                    setBrandSearch(e.target.value);
                    setBrand(e.target.value);
                  }}
                  list="outreach-brands"
                />
                <datalist id="outreach-brands">
                  {filteredBrands.map((b) => (
                    <option key={b.name} value={b.name} />
                  ))}
                </datalist>
              </label>

              <label className="outreach-field">
                <span>Category</span>
                <select
                  className="lead-filters__input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as OutreachCategory)}
                >
                  {OUTREACH_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="outreach-field outreach-field--full">
                <span>Comments</span>
                <textarea
                  className="modal__import-textarea"
                  rows={4}
                  placeholder="What happened? Include dates, contacts, next steps…"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </label>

              {polishedComment && (
                <label className="outreach-field outreach-field--full">
                  <span>Polished (for weekly email)</span>
                  <textarea
                    className="modal__import-textarea outreach-polished"
                    rows={3}
                    value={polishedComment}
                    onChange={(e) => setPolishedComment(e.target.value)}
                  />
                </label>
              )}

              <div className="outreach-form__actions">
                <button
                  className="btn btn--secondary"
                  onClick={polishComment}
                  disabled={polishing || !comments.trim() || !brand.trim()}
                >
                  {polishing ? "Polishing…" : "AI polish"}
                </button>
                <button
                  className="btn btn--primary"
                  onClick={saveActivity}
                  disabled={saving || !comments.trim() || !brand.trim()}
                >
                  {saving ? "Saving…" : "Save log"}
                </button>
              </div>
            </div>
          </section>

          <section className="outreach-card">
            <h2 className="outreach-card__title">Sheet sync</h2>
            <p className="outreach-card__hint">
              Saving a log above updates that brand automatically. Use these when you need a full
              refresh of the Google Sheet.
            </p>

            <div className="outreach-sync-group">
              <div className="outreach-sync-group__block">
                <h3 className="outreach-sync-group__label">Status &amp; comments (K / L)</h3>
                <p className="outreach-sync-group__desc">
                  Final status and comment threads for all brands.
                </p>
                <button
                  className="btn btn--secondary"
                  onClick={syncBrandTracker}
                  disabled={brandSyncing}
                >
                  {brandSyncing ? "Syncing…" : "Sync all brands"}
                </button>
              </div>

              <div className="outreach-sync-group__block">
                <h3 className="outreach-sync-group__label">Email status (M / N / O)</h3>
                <p className="outreach-sync-group__desc">
                  Pull email stage from the Outbound Pipeline sheet.
                </p>
                <div className="outreach-form__actions">
                  <button
                    className="btn btn--secondary"
                    onClick={() => syncPipeline(false)}
                    disabled={syncing}
                  >
                    {syncing ? "Syncing…" : "Fill empty rows"}
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => syncPipeline(true)}
                    disabled={syncing}
                  >
                    Overwrite all
                  </button>
                </div>
                {syncResult && <p className="outreach-sync-result">{syncResult}</p>}
              </div>
            </div>
          </section>

          <section className="outreach-card outreach-card--wide">
            <h2 className="outreach-card__title">Weekly email draft</h2>
            <p className="outreach-card__hint">
              Generates a formatted Sunil-style update from this week&apos;s logs. Copy and paste
              into Gmail — bold headings, blue titles, and bullet layout are preserved.
            </p>
            <div className="outreach-form__actions">
              <button className="btn btn--primary" onClick={generateDraft} disabled={draftLoading}>
                {draftLoading ? "Generating…" : "Generate this week's draft"}
              </button>
              {draftHtml && (
                <button className="btn btn--secondary" onClick={copyDraft}>
                  Copy for Gmail
                </button>
              )}
            </div>
            {draftSubject && (
              <p className="outreach-draft-subject">
                <strong>Subject:</strong> {draftSubject}
              </p>
            )}
            {draftHtml && (
              <div
                className="outreach-draft-preview"
                dangerouslySetInnerHTML={{ __html: draftHtml }}
              />
            )}
          </section>
        </div>

        <section className="outreach-card outreach-card--wide">
          <h2 className="outreach-card__title">Recent activity log</h2>
          {loading && <p className="loading-text">Loading…</p>}
          {!loading && activities.length === 0 && (
            <div className="empty-state">No activities logged yet.</div>
          )}
          <div className="lead-list">
            {activities.map((a) => (
              <div key={a.rowIndex} className="lead-card">
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="lead-name">{a.brand}</div>
                  <div className="lead-meta">
                    {a.category} · {a.activityDate || a.loggedAt.slice(0, 10)}
                    {a.loggedBy ? ` · ${a.loggedBy}` : ""}
                  </div>
                  <div className="outreach-activity-text">
                    {a.polishedComment || a.comments}
                  </div>
                  {a.polishedComment && a.comments !== a.polishedComment && (
                    <div className="outreach-activity-raw">Raw: {a.comments}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

"use client";

import { AppHeader } from "@/components/AppHeader";
import { PageHead } from "@/components/PageHead";
import {
  BRAND_TRACKER_TAB_GID,
  OUTREACH_TRACKER_SPREADSHEET_ID,
  type BrandTrackerComment,
  type BrandTrackerStatusCategory,
  type BrandTrackerView,
} from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type StatusFilter = "all" | BrandTrackerStatusCategory;
type SortKey = "brand" | "industry" | "status" | "lastActivity" | "activeLeads";

const STATUS_LABELS: Record<BrandTrackerStatusCategory, string> = {
  active: "Active lead",
  response_no_work: "Response, no work",
  email_only: "Email only",
  other: "Other",
  empty: "No status",
};

function formatCommentLine(c: BrandTrackerComment): string {
  return c.date ? `${c.date} - ${c.text}` : c.text;
}

export function TrackerDashboard() {
  const [brands, setBrands] = useState<BrandTrackerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [industryFilter, setIndustryFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("brand");
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);

  const showActionMessage = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 3500);
  };

  const loadBrands = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tracker/brands");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load tracker");
      setBrands(data.brands || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tracker");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  const industries = useMemo(() => {
    const set = new Set(brands.map((b) => b.industry).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [brands]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = brands.filter((b) => {
      if (statusFilter !== "all" && b.statusCategory !== statusFilter) return false;
      if (industryFilter && b.industry !== industryFilter) return false;
      if (!q) return true;
      const threadText = (b.commentThread || []).map((c) => formatCommentLine(c)).join(" ");
      const haystack = [b.brand, b.industry, b.finalStatus, threadText].join(" ").toLowerCase();
      return haystack.includes(q);
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "activeLeads") {
        const aActive = a.statusCategory === "active" ? 0 : 1;
        const bActive = b.statusCategory === "active" ? 0 : 1;
        cmp = aActive - bActive;
        if (cmp === 0) {
          cmp = a.brand.localeCompare(b.brand, undefined, { sensitivity: "base" });
        }
      } else if (sortKey === "brand") {
        cmp = a.brand.localeCompare(b.brand, undefined, { sensitivity: "base" });
      } else if (sortKey === "industry") {
        cmp = (a.industry || "").localeCompare(b.industry || "", undefined, { sensitivity: "base" });
      } else if (sortKey === "status") {
        cmp = a.finalStatus.localeCompare(b.finalStatus, undefined, { sensitivity: "base" });
      } else if (sortKey === "lastActivity") {
        const da = new Date(a.lastActivityDate || 0).getTime();
        const db = new Date(b.lastActivityDate || 0).getTime();
        cmp = da - db;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [brands, search, statusFilter, industryFilter, sortKey, sortAsc]);

  const counts = useMemo(
    () => ({
      active: brands.filter((b) => b.statusCategory === "active").length,
      emailOnly: brands.filter((b) => b.statusCategory === "email_only").length,
      responseNoWork: brands.filter((b) => b.statusCategory === "response_no_work").length,
      total: brands.length,
    }),
    [brands]
  );

  const syncAll = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/tracker/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      showActionMessage(
        `Synced ${data.brands} brands (${data.activeLeads} active, ${data.emailOnly} email-only, ${data.responseNoWork} response/no work)`
      );
      await loadBrands();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const toggleExpand = (brand: string) => {
    setExpandedBrand((prev) => (prev === brand ? null : brand));
  };

  return (
    <>
      <AppHeader
        active="tracker"
        actions={
          <>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => loadBrands()}
              disabled={loading}
            >
              Refresh
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={syncAll}
              disabled={syncing}
            >
              {syncing ? "Syncing…" : "Sync to sheet"}
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

      <main className="app-main tracker-main">
        <PageHead
          title="Tracker"
          subtitle="Brand-level view of status and comments. Use Sync to sheet to push updates to Google Sheets."
        />
        {actionMessage && <div className="alert alert--info">{actionMessage}</div>}
        {error && <div className="alert alert--error">{error}</div>}

        <div className="tracker-stats">
          <button
            type="button"
            className={`tracker-stat${statusFilter === "all" ? " tracker-stat--active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            <span className="tracker-stat__n">{counts.total}</span>
            <span className="tracker-stat__l">All brands</span>
          </button>
          <button
            type="button"
            className={`tracker-stat${statusFilter === "active" ? " tracker-stat--active" : ""}`}
            onClick={() => setStatusFilter("active")}
          >
            <span className="tracker-stat__n">{counts.active}</span>
            <span className="tracker-stat__l">Active leads</span>
          </button>
          <button
            type="button"
            className={`tracker-stat${statusFilter === "email_only" ? " tracker-stat--active" : ""}`}
            onClick={() => setStatusFilter("email_only")}
          >
            <span className="tracker-stat__n">{counts.emailOnly}</span>
            <span className="tracker-stat__l">Email only</span>
          </button>
          <button
            type="button"
            className={`tracker-stat${statusFilter === "response_no_work" ? " tracker-stat--active" : ""}`}
            onClick={() => setStatusFilter("response_no_work")}
          >
            <span className="tracker-stat__n">{counts.responseNoWork}</span>
            <span className="tracker-stat__l">Response, no work</span>
          </button>
        </div>

        <div className="lead-filters">
          <div className="lead-filters__search">
            <input
              type="search"
              className="lead-filters__input"
              placeholder="Search brand, industry, status, comments…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="lead-filters__sort">
            <span>Industry</span>
            <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}>
              <option value="">All</option>
              {industries.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </label>
          <label className="lead-filters__sort">
            <span>Sort</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="brand">Brand</option>
              <option value="industry">Industry</option>
              <option value="status">Status</option>
              <option value="lastActivity">Last activity</option>
              <option value="activeLeads">Active leads</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setSortAsc((v) => !v)}
          >
            {sortKey === "activeLeads"
              ? sortAsc
                ? "Active first"
                : "Inactive first"
              : sortAsc
                ? "A → Z"
                : "Z → A"}
          </button>
          <span className="lead-filters__count">
            {filtered.length} of {brands.length}
          </span>
        </div>

        {loading && <p className="loading-text">Loading tracker…</p>}

        {!loading && filtered.length === 0 && (
          <div className="empty-state">No brands match your filters.</div>
        )}

        <div className="tracker-list">
          {filtered.map((b) => {
            const expanded = expandedBrand === b.brand;
            const thread = b.commentThread || [];
            const latest = b.latestComment;

            return (
              <article
                key={b.brand}
                className={`tracker-card tracker-card--${b.statusCategory}${expanded ? " tracker-card--expanded" : ""}`}
              >
                <button
                  type="button"
                  className="tracker-card__toggle"
                  onClick={() => toggleExpand(b.brand)}
                  aria-expanded={expanded}
                >
                  <div className="tracker-card__head">
                    <div>
                      <h3 className="tracker-card__brand">{b.brand}</h3>
                      {b.industry && <p className="tracker-card__industry">{b.industry}</p>}
                    </div>
                    <span className={`tracker-status tracker-status--${b.statusCategory}`}>
                      {b.finalStatus || STATUS_LABELS[b.statusCategory]}
                    </span>
                  </div>

                  {!expanded && (
                    <div className="tracker-card__preview">
                      {latest ? (
                        <p className="tracker-card__comments">{formatCommentLine(latest)}</p>
                      ) : b.finalStatus && b.statusCategory === "email_only" ? (
                        <p className="tracker-card__comments tracker-card__comments--muted">
                          Email outreach only — see status above
                        </p>
                      ) : (
                        <p className="tracker-card__comments tracker-card__comments--empty">
                          No outreach comments yet
                        </p>
                      )}
                      {thread.length > 1 && (
                        <p className="tracker-card__thread-hint">
                          +{thread.length - 1} more — click to view thread
                        </p>
                      )}
                    </div>
                  )}

                  {b.lastActivityDate && !expanded && (
                    <p className="tracker-card__meta">Last activity: {b.lastActivityDate}</p>
                  )}
                </button>

                {expanded && (
                  <div className="tracker-card__thread">
                    {thread.length === 0 ? (
                      <p className="tracker-card__comments tracker-card__comments--empty">
                        No comments yet
                      </p>
                    ) : (
                      <ul className="tracker-thread">
                        {thread.map((c, i) => (
                          <li key={`${c.date}-${i}`} className="tracker-thread__item">
                            <span className="tracker-thread__line">{formatCommentLine(c)}</span>
                            {c.category && (
                              <span className="tracker-thread__category">{c.category}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {b.lastActivityDate && (
                      <p className="tracker-card__meta">Last activity: {b.lastActivityDate}</p>
                    )}
                    <button
                      type="button"
                      className="tracker-card__close btn btn--ghost"
                      onClick={() => setExpandedBrand(null)}
                    >
                      Close thread
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}

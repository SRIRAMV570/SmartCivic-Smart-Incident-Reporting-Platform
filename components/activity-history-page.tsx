
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import FeedbackModal from "@/components/feedback-modal";
import ComplaintModal from "@/components/complaint-modal";

type HistoryRecord = {
  history_id: number;
  incident_id: number;
  incident_title: string;
  old_status: string | null;
  new_status: string;
  changed_by: number;
  changed_by_name: string | null;
  remarks: string | null;
  changed_at: string;
};

type Account = {
  full_name: string;
  role: "resident" | "officer" | "admin";
};

type FeedbackState = {
  // Set of incident_ids that the resident has already submitted feedback for
  submitted: Set<number>;
  // The incident currently open in the feedback modal (null = closed)
  activeIncidentId: number | null;
  activeIncidentTitle: string;
};

type ComplaintSummary = {
  complaint_id: number | string;
  incident_id: number | string;
  next_complaint_at: string;
  can_complain_again: boolean;
};

export default function ActivityHistoryClientPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedbackState, setFeedbackState] = useState<FeedbackState>({
    submitted: new Set(),
    activeIncidentId: null,
    activeIncidentTitle: "",
  });
  const [complaintIncident, setComplaintIncident] = useState<{ id: number; title: string } | null>(null);
  const [complaintsByIncident, setComplaintsByIncident] = useState<Map<number, ComplaintSummary>>(new Map());

  useEffect(() => {
    let sessionExpired = false;

    async function loadHistory() {
      if (sessionExpired) return;

      try {
        const [response, accountResponse] = await Promise.all([
          fetch("/api/activity-history", { cache: "no-store" }),
          fetch("/api/auth/me", { cache: "no-store" }),
        ]);

        if (response.status === 401 || accountResponse.status === 401) {
          sessionExpired = true;
          if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
          const loginPath = pathname.startsWith("/admin")
            ? "/admin/login"
            : pathname.startsWith("/officer")
              ? "/officer/login"
              : pathname.startsWith("/civic")
                ? "/civic/login"
                : "/login";
          router.replace(loginPath);
          return;
        }

        const [data, accountData] = await Promise.all([
          response.json(),
          accountResponse.json(),
        ]);

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || "Unable to load activity history."
          );
        }
        if (!accountResponse.ok || !accountData.success) {
          throw new Error(accountData.message || "Unable to load your account.");
        }

        setHistory(data.history);
        const resolvedRole: string = accountData.role;
        setAccount({ ...accountData.account, role: accountData.role });

        // For residents, load which resolved incidents already have feedback and complaints
        if (resolvedRole === "resident") {
          const compRes = await fetch("/api/complaints", { cache: "no-store" });
          const compData = await compRes.json();
          if (!compRes.ok || !compData.success) {
            throw new Error(compData.message || "Unable to load your complaints.");
          }
          const complaintMap = new Map<number, ComplaintSummary>();
          for (const complaint of compData.complaints as ComplaintSummary[]) {
            const incidentId = Number(complaint.incident_id);
            if (!complaintMap.has(incidentId)) {
              complaintMap.set(incidentId, complaint);
            }
          }
          setComplaintsByIncident(complaintMap);

          const resolvedIncidentIds = Array.from(
            new Set(
              (data.history as HistoryRecord[])
                .filter((r) => r.new_status === "resolved")
                .map((r) => r.incident_id)
            )
          );
          if (resolvedIncidentIds.length > 0) {
            const feedbackChecks = await Promise.all(
              resolvedIncidentIds.map((id) =>
                fetch(`/api/feedback?incident_id=${id}`, { cache: "no-store" })
                  .then((r) => r.json())
                  .then((d) => ({ id, hasOwn: Array.isArray(d.feedback) && d.feedback.length > 0 }))
                  .catch(() => ({ id, hasOwn: false }))
              )
            );
            const submittedIds = new Set(
              feedbackChecks.filter((f) => f.hasOwn).map((f) => f.id)
            );
            setFeedbackState((prev) => ({ ...prev, submitted: submittedIds }));
          }
        }

        setError("");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load activity history."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadHistory();
    const refreshTimer = window.setInterval(() => void loadHistory(), 10000);
    return () => {
      window.clearInterval(refreshTimer);
    };
  }, [pathname, router]);

  function formatStatus(status: string | null) {
    if (!status) return "Initial report";

    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function openFeedbackModal(incidentId: number, incidentTitle: string) {
    setFeedbackState((prev) => ({
      ...prev,
      activeIncidentId: incidentId,
      activeIncidentTitle: incidentTitle,
    }));
  }

  function closeFeedbackModal() {
    setFeedbackState((prev) => ({
      ...prev,
      activeIncidentId: null,
      activeIncidentTitle: "",
    }));
  }

  function onFeedbackSubmitted() {
    const id = feedbackState.activeIncidentId;
    if (id !== null) {
      setFeedbackState((prev) => ({
        activeIncidentId: null,
        activeIncidentTitle: "",
        submitted: new Set([...prev.submitted, id]),
      }));
    }
  }

  // Collect the latest status per incident from history (history is newest-first)
  const latestStatusByIncident = new Map<number, string>();
  for (const item of history) {
    if (!latestStatusByIncident.has(item.incident_id)) {
      latestStatusByIncident.set(item.incident_id, item.new_status);
    }
  }

  return (
    <main className="dashboard">
      {/* Feedback modal — rendered outside the table so it sits above everything */}
      {feedbackState.activeIncidentId !== null && (
        <FeedbackModal
          incidentId={feedbackState.activeIncidentId}
          incidentTitle={feedbackState.activeIncidentTitle}
          onClose={closeFeedbackModal}
          onSubmitted={onFeedbackSubmitted}
        />
      )}
      {complaintIncident !== null && (
        <ComplaintModal
          incidentId={complaintIncident.id}
          incidentTitle={complaintIncident.title}
          onClose={() => setComplaintIncident(null)}
          onSubmitted={() => {
            const id = complaintIncident.id;
            setComplaintsByIncident((current) => {
              const next = new Map(current);
              next.set(id, {
                complaint_id: "pending",
                incident_id: id,
                can_complain_again: false,
                next_complaint_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              });
              return next;
            });
            setComplaintIncident(null);
          }}
        />
      )}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">S</span>
          <span>
            Smart<span className="brand-light">Civic</span>
          </span>
        </div>

        <p className="nav-label">WORKSPACE</p>

        <Link className="nav-item" href={account?.role === "admin" ? "/admin" : "/civic"}>
          <span>▦</span> Overview
        </Link>

        {account?.role === "admin" && (
          <>
            <Link className="nav-item" href="/admin/incidents">
              <span>◎</span> Incidents
            </Link>
            <Link className="nav-item" href="/admin/departments">
              <span>⌖</span> Departments
            </Link>
            <Link className="nav-item" href="/admin/feedback">
              <span>★</span> Civic Feedback
            </Link>
          </>
        )}

        <Link
          className="nav-item active"
          href={account?.role === "admin" ? "/admin/activity-history" : "/civic/activity-history"}
          aria-current="page"
        >
          <span>◷</span> {account?.role === "admin" ? "Activity history" : "My progress"}
        </Link>

        {account?.role === "resident" && (
          <Link className="nav-item" href="/civic/complaints-feedback">
            <span>⚠</span> Complaints & feedback
          </Link>
        )}

        <div className="sidebar-bottom">
          <div className="avatar">{account?.role === "admin" ? "AD" : "CV"}</div>
          <div>
            <strong>{account?.full_name || "Account"}</strong>
            <p>{account?.role === "admin" ? "Administrator" : "Civic user"}</p>
          </div>
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {account?.role === "admin" ? "ADMIN PORTAL" : "CIVIC PORTAL"}
            </p>
            <h1>{account?.role === "admin" ? "Activity History" : "My incident progress"}</h1>
          </div>

          <div className="topbar-right">
            <span className="live-dot" />
            <span>Database connected</span>
          </div>
        </header>

        <section className="welcome">
          <div>
            <p className="welcome-label">
              {account?.role === "admin" ? "ADMIN AUDIT TRAIL" : "YOUR REPORT UPDATES"}
            </p>
            <h2>
              {account?.role === "admin"
                ? "Every change, recorded."
                : "See what is happening with your reports."}
            </h2>
            <p>
              {account?.role === "admin"
                ? "Track incident reports, status transitions, and administrative activity."
                : "Only updates for incidents reported by your account are shown here."}
            </p>
          </div>
          <div className="welcome-symbol">◷</div>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-top">
              <span>Total activities</span>
              <span className="stat-icon blue">▤</span>
            </div>
            <strong>{history.length}</strong>
            <p>Recorded database events</p>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Status changes</span>
              <span className="stat-icon orange">↻</span>
            </div>
            <strong>
              {
                history.filter(
                  (item) =>
                    item.old_status !== null &&
                    item.old_status !== item.new_status
                ).length
              }
            </strong>
            <p>Previous status to new status</p>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Incidents tracked</span>
              <span className="stat-icon green">✓</span>
            </div>
            <strong>
              {new Set(history.map((item) => item.incident_id)).size}
            </strong>
            <p>Unique incidents in history</p>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Latest activity</span>
              <span className="stat-icon blue">◷</span>
            </div>
            <strong className="latest-date">
              {history.length
                ? formatDate(history[0].changed_at)
                : "—"}
            </strong>
            <p>Most recent recorded event</p>
          </article>
        </section>

        <section className="incidents-panel">
          <div className="panel-heading">
            <div>
              <h2>Audit trail</h2>
              <p>
                {account?.role === "admin"
                  ? "All incident activity · refreshes automatically"
                  : "Progress updates for your own incident reports"}
              </p>
            </div>

            <Link className="back-link" href={account?.role === "admin" ? "/admin" : "/civic"}>
              ← Back to dashboard
            </Link>
          </div>

          {loading && (
            <p className="message">Loading activity history...</p>
          )}

          {error && (
            <p className="message error">{error}</p>
          )}

          {!loading && !error && history.length === 0 && (
            <p className="message">
              No activity records have been found.
            </p>
          )}

          {!loading && !error && history.length > 0 && (
            <div className="table-scroll">
              <table className="incident-data-table">
                <thead>
                  <tr>
                    <th>ACTIVITY</th>
                    <th>INCIDENT</th>
                    <th>STATUS CHANGE</th>
                    {account?.role === "admin" && <th>CHANGED BY</th>}
                    <th>DATE & TIME</th>
                    {account?.role === "resident" && <th>FEEDBACK</th>}
                  </tr>
                </thead>

                <tbody>
                  {history.map((item) => (
                    <tr key={item.history_id}>
                      <td>
                        <strong>
                          #{item.history_id}
                        </strong>
                        <div className="incident-meta">
                          {item.remarks || "Activity recorded"}
                        </div>
                      </td>

                      <td>
                        <strong>
                          INC-
                          {String(item.incident_id).padStart(4, "0")}
                        </strong>
                        <div className="incident-meta">
                          {item.incident_title}
                        </div>
                      </td>

                      <td>
                        <div className="history-transition">
                          <span className="history-old">
                            {formatStatus(item.old_status)}
                          </span>
                          <span aria-hidden="true">→</span>
                          <span
                            className={`pill ${
                              item.new_status === "resolved"
                                ? "status-resolved"
                                : item.new_status === "assigned"
                                ? "status-assigned"
                                : item.new_status === "in_progress"
                                ? "status-progress"
                                : item.new_status === "rejected"
                                ? "status-rejected"
                                : "status-pending"
                            }`}
                          >
                            {formatStatus(item.new_status)}
                          </span>
                        </div>
                      </td>

                      {account?.role === "admin" && (
                        <td>
                          {item.changed_by_name || "Unknown user"}
                          <div className="incident-meta">
                            User ID: {item.changed_by}
                          </div>
                        </td>
                      )}

                      <td>{formatDate(item.changed_at)}</td>

                      {account?.role === "resident" && (() => {
                        const incidentLatestStatus = latestStatusByIncident.get(item.incident_id);
                        const isClosed = ["resolved", "rejected"].includes(
                          incidentLatestStatus ?? ""
                        );
                        const alreadySubmitted = feedbackState.submitted.has(item.incident_id);
                        const complaint = complaintsByIncident.get(item.incident_id);
                        const canComplainAgain = !complaint || complaint.can_complain_again;
                        return (
                          <td>
                            {incidentLatestStatus === "resolved" && !alreadySubmitted && (
                              <button
                                type="button"
                                className="feedback-rate-btn"
                                onClick={() =>
                                  openFeedbackModal(item.incident_id, item.incident_title)
                                }
                              >
                                ★ Rate it
                              </button>
                            )}
                            {incidentLatestStatus === "resolved" && alreadySubmitted && (
                              <span className="feedback-submitted-badge">
                                ✓ Rated
                              </span>
                            )}
                            {!isClosed && (
                              <button
                                type="button"
                                disabled={!canComplainAgain}
                                onClick={() =>
                                  setComplaintIncident({
                                    id: item.incident_id,
                                    title: item.incident_title,
                                  })
                                }
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  border: "1px solid #fca5a5",
                                  background: complaint ? "#fef2f2" : "#fff",
                                  color: complaint && !canComplainAgain ? "#7f1d1d" : "#b91c1c",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  cursor: canComplainAgain ? "pointer" : "not-allowed",
                                  opacity: canComplainAgain ? 1 : 0.9,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                }}
                              >
                                {canComplainAgain
                                  ? complaint
                                    ? "⚠️ Complain again"
                                    : "⚠️ Complain"
                                  : `✓ Complained · again after ${new Date(complaint.next_complaint_at).toLocaleString("en-IN", {
                                      day: "2-digit",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}`}
                              </button>
                            )}
                          </td>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer>
          SmartCivic · Incident Management System
          <span>Powered by Next.js & PostgreSQL</span>
        </footer>
      </section>
    </main>
  );
}

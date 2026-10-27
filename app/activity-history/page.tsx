
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function ActivityHistoryPage() {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadHistory() {
      try {
        const [response, accountResponse] = await Promise.all([
          fetch("/api/activity-history"),
          fetch("/api/auth/me"),
        ]);
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
        setAccount({ ...accountData.account, role: accountData.role });
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
  }, []);

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

  return (
    <main className="dashboard">
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
          </>
        )}

        <Link
          className="nav-item active"
          href={account?.role === "admin" ? "/admin/activity-history" : "/civic/activity-history"}
          aria-current="page"
        >
          <span>◷</span> {account?.role === "admin" ? "Activity history" : "My progress"}
        </Link>

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
                  ? "All incident activity"
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
              <table>
                <thead>
                  <tr>
                    <th>ACTIVITY</th>
                    <th>INCIDENT</th>
                    <th>STATUS CHANGE</th>
                    {account?.role === "admin" && <th>CHANGED BY</th>}
                    <th>DATE & TIME</th>
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

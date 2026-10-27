
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Incident = {
  incident_id: number;
  title: string;
  description: string;
  location: string;
  priority: string;
  status: string;
  created_at: string;
  category_name: string;
  department_name: string;
  reported_by: string;
};

type Category = {
  category_id: number;
  category_name: string;
  department_name: string;
};

type CivicAccount = {
  full_name: string;
};

const initialForm = {
  title: "",
  description: "",
  category_id: "1",
  location: "",
  priority: "medium",
};

export default function CivicDashboard() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [account, setAccount] = useState<CivicAccount | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Unable to sign out.");
      router.replace("/civic/login");
      router.refresh();
    } catch {
      setMessage("Unable to sign out. Please try again.");
    }
  }

  async function loadIncidents() {
    try {
      const response = await fetch("/api/incidents");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error("Unable to load incidents.");
      }

      setIncidents(data.incidents);
      setError("");
    } catch {
      setError("Could not load incidents. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [accountResponse, categoriesResponse] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/categories"),
        ]);
        const [accountData, categoryData] = await Promise.all([
          accountResponse.json(),
          categoriesResponse.json(),
        ]);

        if (!accountResponse.ok || !accountData.success) {
          throw new Error(accountData.message || "Unable to load your account.");
        }
        if (!categoriesResponse.ok || !categoryData.success) {
          throw new Error(categoryData.message || "Unable to load categories.");
        }

        setAccount(accountData.account);
        setCategories(categoryData.categories);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load dashboard.");
      }
    }

    const loadTimer = window.setTimeout(() => {
      void loadDashboardData();
      void loadIncidents();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          category_id: Number(form.category_id),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Failed to report incident."
        );
      }

      setMessage("Incident reported successfully!");
      setForm(initialForm);
      setShowForm(false);
      await loadIncidents();
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const query = search.toLowerCase();

  const filteredIncidents = incidents.filter((incident) => {
    const matchesSearch = [
      incident.title,
      incident.location,
      incident.category_name,
      incident.department_name,
      incident.reported_by,
    ].some((value) =>
      value.toLowerCase().includes(query)
    );

    return (
      matchesSearch &&
      (statusFilter === "all" ||
        incident.status === statusFilter)
    );
  });

  const openCount = incidents.filter(
    (incident) =>
      !["resolved", "rejected"].includes(incident.status)
  ).length;

  const resolvedCount = incidents.filter(
    (incident) => incident.status === "resolved"
  ).length;

  const highPriorityCount = incidents.filter(
    (incident) =>
      ["high", "critical"].includes(incident.priority)
  ).length;

  const statusClass: Record<string, string> = {
    pending: "status-pending",
    assigned: "status-assigned",
    in_progress: "status-progress",
    resolved: "status-resolved",
    rejected: "status-rejected",
  };

  const priorityClass: Record<string, string> = {
    low: "priority-low",
    medium: "priority-medium",
    high: "priority-high",
    critical: "priority-critical",
  };

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">S</span>
          <span>
            Smart<span className="brand-light">Civic</span>
          </span>
        </div>

        <p className="nav-label">CIVIC WORKSPACE</p>
        <Link href="/civic" className="nav-item active">
  <span>▦</span> Overview
</Link>
        <Link href="/civic/activity-history" className="nav-item">
  <span>◷</span> My progress
</Link>
        <div className="sidebar-bottom">
          <div className="sidebar-account">
            <div className="avatar">SC</div>
            <div>
              <strong>{account?.full_name || "Civic user"}</strong>
              <p>Civic account</p>
            </div>
          </div>
          <button className="logout-button" type="button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">CIVIC PORTAL</p>
            <h1>My incident reports</h1>
          </div>

          <div className="topbar-right">
            <span className="live-dot" />
            <span>Track the issues you report</span>
          </div>
        </header>

        <section className="welcome">
          <div>
            <p className="welcome-label">
              YOUR CIVIC REPORTS
            </p>
            <h2>
              Report an issue. Follow its progress.
            </h2>
            <p>
              Your reports are shared with city administrators, who coordinate
              departments and update you as work progresses.
            </p>
          </div>
          <div className="welcome-symbol">⌖</div>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-top">
              <span>Your reports</span>
              <span className="stat-icon blue">▤</span>
            </div>
            <strong>{incidents.length}</strong>
            <p>Incidents submitted by your account</p>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>In progress</span>
              <span className="stat-icon orange">◷</span>
            </div>
            <strong>{openCount}</strong>
            <p>Currently being handled</p>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>High priority reports</span>
              <span className="stat-icon red">!</span>
            </div>
            <strong>{highPriorityCount}</strong>
            <p>High or critical reports</p>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Resolved</span>
              <span className="stat-icon green">✓</span>
            </div>
            <strong>{resolvedCount}</strong>
            <p>Resolved by the city team</p>
          </article>
        </section>

        <section className="incidents-panel">
          <div className="panel-heading">
            <div>
              <h2>Report an issue</h2>
              <p>Submit a civic issue for an administrator to review</p>
            </div>

            <button
              className="report-button"
              onClick={() => {
                setShowForm(!showForm);
                setMessage("");
              }}
            >
              {showForm ? "Cancel" : "+ Report incident"}
            </button>
          </div>

          {message && (
            <p className="message" role="status">
              {message}
            </p>
          )}

          {showForm && (
            <form
              className="incident-form"
              onSubmit={handleSubmit}
            >
              <h3>Report a civic incident</h3>

              <label htmlFor="title">Incident title</label>
              <input
                id="title"
                required
                maxLength={200}
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value })
                }
                placeholder="e.g. Pothole near the bus stop"
              />

              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                required
                maxLength={5000}
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description: e.target.value,
                  })
                }
                placeholder="Describe the issue..."
              />

              <label htmlFor="category">Category</label>
              <select
                id="category"
                value={form.category_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category_id: e.target.value,
                  })
                }
              >
                {categories.map((category) => (
                  <option key={category.category_id} value={category.category_id}>
                    {category.category_name} — {category.department_name}
                  </option>
                ))}
              </select>

              <label htmlFor="location">Location</label>
              <input
                id="location"
                required
                maxLength={300}
                value={form.location}
                onChange={(e) =>
                  setForm({
                    ...form,
                    location: e.target.value,
                  })
                }
                placeholder="Street, area, city"
              />

              <label htmlFor="priority">Priority</label>
              <select
                id="priority"
                value={form.priority}
                onChange={(e) =>
                  setForm({
                    ...form,
                    priority: e.target.value,
                  })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>

              <button
                className="report-button"
                type="submit"
                disabled={submitting}
              >
                {submitting
                  ? "Submitting..."
                  : "Submit incident"}
              </button>
            </form>
          )}

          <div className="panel-heading">
            <div>
              <h2>Your reported incidents</h2>
              <p>Track progress updates from the city team</p>
            </div>
            <span className="record-count">
              {filteredIncidents.length} records
            </span>
          </div>

          <div className="filters">
            <input
              type="search"
              placeholder="Search title, location, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {loading ? (
            <p className="message">Loading incidents...</p>
          ) : error ? (
            <p className="message error">{error}</p>
          ) : filteredIncidents.length === 0 ? (
            <p className="message">
              No incidents match your search.
            </p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>INCIDENT</th>
                    <th>CATEGORY</th>
                    <th>PRIORITY</th>
                    <th>STATUS</th>
                    <th>DEPARTMENT</th>
                    <th>LOCATION</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredIncidents.map((incident) => (
                    <tr key={incident.incident_id}>
                      <td>
                        <div className="incident-title">
                          {incident.title}
                        </div>
                        <div className="incident-meta">
                          INC-
                          {String(incident.incident_id).padStart(
                            4,
                            "0"
                          )}
                        </div>
                      </td>

                      <td>{incident.category_name}</td>

                      <td>
                        <span
                          className={`pill ${
                            priorityClass[incident.priority] ?? ""
                          }`}
                        >
                          {incident.priority}
                        </span>
                      </td>

                      <td>
                        <span className={`pill ${statusClass[incident.status] ?? ""}`}>
                          {incident.status.replace("_", " ")}
                        </span>
                      </td>

                      <td>{incident.department_name}</td>
                      <td>{incident.location}</td>
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

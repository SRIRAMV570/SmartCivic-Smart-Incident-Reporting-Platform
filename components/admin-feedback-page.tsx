"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NotificationsPanel from "@/components/notifications-panel";

type FeedbackRecord = {
  feedback_id: number;
  incident_id: number;
  incident_title: string;
  category_name: string;
  department_name: string;
  submitted_by_name: string;
  assigned_officer_name: string | null;
  rating: number;
  comment: string | null;
  submitted_at: string;
};

type ComplaintRecord = {
  complaint_id: number;
  incident_id: number;
  incident_title: string;
  incident_status: string;
  incident_priority: string;
  category_name: string;
  department_name: string;
  submitted_by_name: string;
  assigned_officer_name: string | null;
  complaint_category: string;
  reason: string;
  complaint_status: string;
  created_at: string;
};

export default function AdminFeedbackPage() {
  const router = useRouter();
  const [feedbackList, setFeedbackList] = useState<FeedbackRecord[]>([]);
  const [complaintList, setComplaintList] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"feedback" | "complaints">("feedback");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const [feedbackRes, complaintRes] = await Promise.all([
          fetch("/api/feedback", { cache: "no-store" }),
          fetch("/api/complaints", { cache: "no-store" }),
        ]);

        if (feedbackRes.status === 401 || complaintRes.status === 401) {
          router.replace("/admin/login");
          return;
        }

        const [feedbackData, complaintData] = await Promise.all([
          feedbackRes.json(),
          complaintRes.json(),
        ]);

        if (!feedbackRes.ok || !feedbackData.success) {
          throw new Error(feedbackData.message || "Failed to load feedback.");
        }

        setFeedbackList(feedbackData.feedback || []);
        if (complaintData.success) {
          setComplaintList(complaintData.complaints || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load data.");
      } finally {
        setLoading(false);
      }
    }

    void loadData();
    const timer = setInterval(() => void loadData(), 10000);
    return () => clearInterval(timer);
  }, [router]);

  const averageRating = useMemo(() => {
    if (feedbackList.length === 0) return 0;
    const sum = feedbackList.reduce((acc, f) => acc + Number(f.rating), 0);
    return (sum / feedbackList.length).toFixed(1);
  }, [feedbackList]);

  const fiveStarCount = useMemo(() => {
    return feedbackList.filter((f) => Number(f.rating) === 5).length;
  }, [feedbackList]);

  const filteredFeedback = useMemo(() => {
    return feedbackList.filter((f) => {
      const matchesRating =
        ratingFilter === "all" || String(f.rating) === ratingFilter;
      const term = search.toLowerCase();
      const matchesSearch =
        !term ||
        f.incident_title.toLowerCase().includes(term) ||
        f.submitted_by_name.toLowerCase().includes(term) ||
        (f.comment && f.comment.toLowerCase().includes(term)) ||
        f.department_name.toLowerCase().includes(term);
      return matchesRating && matchesSearch;
    });
  }, [feedbackList, ratingFilter, search]);

  const filteredComplaints = useMemo(() => {
    const term = search.toLowerCase();
    return complaintList.filter((c) => {
      if (!term) return true;
      return (
        c.incident_title.toLowerCase().includes(term) ||
        c.submitted_by_name.toLowerCase().includes(term) ||
        c.reason.toLowerCase().includes(term) ||
        c.department_name.toLowerCase().includes(term)
      );
    });
  }, [complaintList, search]);

  return (
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900 md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Civic Feedback & Escalations</h1>
          <p className="mt-2 text-gray-600">
            Citizen reviews for resolved issues and active complaints regarding unresolved reports.
          </p>
        </div>

        {/* Real-time Notifications Panel */}
        <NotificationsPanel />

        {/* Metrics Overview Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Average Rating</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">{averageRating}</span>
              <span className="text-amber-500 text-lg">★</span>
              <span className="text-xs text-gray-500">/ 5.0</span>
            </div>
            <p className="mt-1 text-xs text-gray-400">From all completed incident reviews</p>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total Feedback</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{feedbackList.length}</p>
            <p className="mt-1 text-xs text-gray-400">Citizen submissions received</p>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">5-Star Excellence</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">{fiveStarCount}</p>
            <p className="mt-1 text-xs text-gray-400">Highest satisfaction reviews</p>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Active Complaints</p>
            <p className="mt-2 text-3xl font-bold text-red-600">{complaintList.length}</p>
            <p className="mt-1 text-xs text-gray-400">Issues flagged for slow progress</p>
          </div>
        </div>

        {/* Tabs & Controls */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b pb-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("feedback")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "feedback"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-gray-700 hover:bg-gray-50 border"
              }`}
            >
              ★ Citizen Feedback ({feedbackList.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("complaints")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === "complaints"
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-white text-gray-700 hover:bg-gray-50 border"
              }`}
            >
              ⚠️ Grievances & Complaints ({complaintList.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              placeholder="Search by title, resident, or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 w-64"
            />
            {activeTab === "feedback" && (
              <select
                value={ratingFilter}
                onChange={(e) => setRatingFilter(e.target.value)}
                className="rounded-lg border bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="all">All Ratings</option>
                <option value="5">5 Stars ★★★★★</option>
                <option value="4">4 Stars ★★★★☆</option>
                <option value="3">3 Stars ★★★☆☆</option>
                <option value="2">2 Stars ★★☆☆☆</option>
                <option value="1">1 Star ★☆☆☆☆</option>
              </select>
            )}
          </div>
        </div>

        {error && (
          <p className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
            Error: {error}
          </p>
        )}

        {loading ? (
          <p className="text-gray-500">Loading civic feedback and complaints...</p>
        ) : activeTab === "feedback" ? (
          filteredFeedback.length === 0 ? (
            <div className="rounded-xl border bg-white p-12 text-center text-gray-500">
              <p className="text-lg font-medium">No feedback matching your filters.</p>
              <p className="mt-1 text-sm text-gray-400">
                When citizens rate resolved incidents, their reviews will appear here.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredFeedback.map((item) => (
                <div
                  key={item.feedback_id}
                  className="rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                        Incident #{item.incident_id}
                      </span>
                      <h3 className="mt-2 text-base font-bold text-gray-900">
                        {item.incident_title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {item.category_name} · {item.department_name}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="flex items-center text-amber-400 text-lg">
                        {"★".repeat(item.rating)}
                        {"☆".repeat(5 - item.rating)}
                      </div>
                      <span className="text-xs font-semibold text-gray-600">
                        {item.rating}/5 stars
                      </span>
                    </div>
                  </div>

                  {item.comment ? (
                    <blockquote className="mt-3 rounded-lg bg-gray-50 p-3 text-sm italic text-gray-700 border-l-4 border-blue-500">
                      "{item.comment}"
                    </blockquote>
                  ) : (
                    <p className="mt-3 text-xs italic text-gray-400">No comment provided.</p>
                  )}

                  <div className="mt-4 pt-3 border-t flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
                    <div>
                      Submitted by: <strong className="text-gray-700">{item.submitted_by_name}</strong>
                    </div>
                    {item.assigned_officer_name && (
                      <div>
                        Officer: <span className="text-gray-700 font-medium">{item.assigned_officer_name}</span>
                      </div>
                    )}
                    <div>
                      <time dateTime={item.submitted_at}>
                        {new Date(item.submitted_at).toLocaleString()}
                      </time>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          filteredComplaints.length === 0 ? (
            <div className="rounded-xl border bg-white p-12 text-center text-gray-500">
              <p className="text-lg font-medium text-emerald-700">No active citizen complaints!</p>
              <p className="mt-1 text-sm text-gray-400">
                All reports are proceeding normally or citizens have not flagged any delays.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredComplaints.map((c) => (
                <div
                  key={c.complaint_id}
                  className="rounded-xl border border-red-200 bg-red-50/40 p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                          ⚠️ ESCALATION #{c.complaint_id}
                        </span>
                        <span className="rounded-full bg-amber-100 text-amber-800 text-xs px-2 py-0.5 capitalize font-medium">
                          Status: {c.incident_status.replace("_", " ")}
                        </span>
                      </div>
                      <h3 className="mt-2 text-base font-bold text-red-950">
                        #{c.incident_id} — {c.incident_title}
                      </h3>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {c.category_name} · {c.department_name}
                      </p>
                    </div>

                    <Link
                      href="/admin/incidents"
                      className="rounded bg-white border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 shrink-0 shadow-sm"
                    >
                      Handle Report →
                    </Link>
                  </div>

                  <div className="mt-3 rounded-lg bg-white p-3.5 border border-red-200">
                    <p className="text-xs font-bold text-red-800 uppercase tracking-wide">
                      Reason: {c.complaint_category}
                    </p>
                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                      {c.reason}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-red-100 flex flex-wrap items-center justify-between text-xs text-gray-600 gap-2">
                    <div>
                      Citizen: <strong className="text-gray-900">{c.submitted_by_name}</strong>
                    </div>
                    {c.assigned_officer_name ? (
                      <div>
                        Assigned Officer: <strong className="text-gray-900">{c.assigned_officer_name}</strong>
                      </div>
                    ) : (
                      <span className="text-red-700 font-semibold">⚠️ Unassigned!</span>
                    )}
                    <div>
                      <time dateTime={c.created_at}>
                        {new Date(c.created_at).toLocaleString()}
                      </time>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </main>
  );
}

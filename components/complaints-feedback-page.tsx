"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type PageMode = "resident" | "officer";

type Complaint = {
  complaint_id: number | string;
  incident_id: number | string;
  incident_title: string;
  incident_status: string;
  complaint_category: string;
  reason: string;
  complaint_status: string;
  created_at: string;
  submitted_by_name?: string;
};

type Feedback = {
  feedback_id: number | string;
  incident_id: number | string;
  incident_title: string;
  incident_status: string;
  category_name: string;
  department_name: string;
  submitted_by_name?: string;
  rating: number;
  comment: string | null;
  submitted_at: string;
};

export default function ComplaintsFeedbackPage({ mode }: { mode: PageMode }) {
  const router = useRouter();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [activeTab, setActiveTab] = useState<"complaints" | "feedback">("complaints");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadRecords() {
      try {
        const [complaintsResponse, feedbackResponse] = await Promise.all([
          fetch("/api/complaints", { cache: "no-store" }),
          fetch("/api/feedback", { cache: "no-store" }),
        ]);

        if (complaintsResponse.status === 401 || feedbackResponse.status === 401) {
          router.replace(mode === "resident" ? "/civic/login" : "/officer/login");
          return;
        }

        const [complaintsData, feedbackData] = await Promise.all([
          complaintsResponse.json(),
          feedbackResponse.json(),
        ]);
        if (!complaintsResponse.ok || !complaintsData.success) {
          throw new Error(complaintsData.message || "Unable to load complaints.");
        }
        if (!feedbackResponse.ok || !feedbackData.success) {
          throw new Error(feedbackData.message || "Unable to load feedback.");
        }

        if (active) {
          setComplaints(complaintsData.complaints);
          setFeedback(feedbackData.feedback);
          setError("");
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load complaints and feedback."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRecords();
    const refreshTimer = window.setInterval(() => void loadRecords(), 10000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [mode, router]);

  const title = mode === "resident" ? "My Complaints & Feedback" : "Complaints & Feedback";
  const homeHref = mode === "resident" ? "/civic" : "/officer";

  return (
    <main className="min-h-screen bg-gray-100 p-6 text-gray-900 md:p-10">
      <div className="mx-auto max-w-5xl">
        <Link className="text-sm font-medium text-blue-700 hover:underline" href={homeHref}>
          ← Back to {mode === "resident" ? "my reports" : "officer portal"}
        </Link>
        <header className="my-6">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-gray-600">
            {mode === "resident"
              ? "A history of your incident complaints and submitted resolution feedback."
              : "Complaints and resident feedback for incidents assigned to you."}
          </p>
        </header>

        <div className="mb-5 flex gap-2 border-b pb-3">
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              activeTab === "complaints"
                ? "bg-red-600 text-white"
                : "border bg-white text-gray-700"
            }`}
            onClick={() => setActiveTab("complaints")}
          >
            Complaints ({complaints.length})
          </button>
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              activeTab === "feedback"
                ? "bg-blue-600 text-white"
                : "border bg-white text-gray-700"
            }`}
            onClick={() => setActiveTab("feedback")}
          >
            Feedback ({feedback.length})
          </button>
        </div>

        {error && (
          <p className="mb-5 rounded-lg bg-red-50 p-4 text-red-700" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p className="rounded-lg bg-white p-6 text-gray-600">Loading records...</p>
        ) : activeTab === "complaints" ? (
          complaints.length === 0 ? (
            <p className="rounded-lg bg-white p-6 text-gray-600">No complaints submitted yet.</p>
          ) : (
            <ul className="space-y-4">
              {complaints.map((complaint) => (
                <li key={complaint.complaint_id} className="rounded-xl border bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-red-700">
                        Complaint #{complaint.complaint_id} · Incident #{complaint.incident_id}
                      </p>
                      <h2 className="mt-1 text-lg font-bold">{complaint.incident_title}</h2>
                      <p className="mt-1 text-sm text-gray-600">
                        {complaint.complaint_category} · Incident status:{" "}
                        <span className="capitalize">{complaint.incident_status.replaceAll("_", " ")}</span>
                      </p>
                    </div>
                    <time className="text-xs text-gray-500" dateTime={complaint.created_at}>
                      {new Date(complaint.created_at).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-sm text-gray-800">
                    {complaint.reason}
                  </p>
                  {mode === "officer" && complaint.submitted_by_name && (
                    <p className="mt-2 text-xs text-gray-500">
                      Submitted by {complaint.submitted_by_name}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : feedback.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-gray-600">No feedback submitted yet.</p>
        ) : (
          <ul className="space-y-4">
            {feedback.map((record) => (
              <li key={record.feedback_id} className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-blue-700">
                      Incident #{record.incident_id} · {record.category_name} · {record.department_name}
                    </p>
                    <h2 className="mt-1 text-lg font-bold">{record.incident_title}</h2>
                    <p className="mt-1 text-amber-600" aria-label={`${record.rating} out of 5 stars`}>
                      {"★".repeat(record.rating)}{"☆".repeat(5 - record.rating)}
                      <span className="ml-2 text-sm text-gray-600">{record.rating}/5</span>
                    </p>
                  </div>
                  <time className="text-xs text-gray-500" dateTime={record.submitted_at}>
                    {new Date(record.submitted_at).toLocaleString()}
                  </time>
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-blue-50 p-3 text-sm text-gray-800">
                  {record.comment || "No comment provided."}
                </p>
                {mode === "officer" && record.submitted_by_name && (
                  <p className="mt-2 text-xs text-gray-500">
                    Submitted by {record.submitted_by_name}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

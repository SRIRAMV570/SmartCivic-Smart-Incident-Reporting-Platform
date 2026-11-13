"use client";

import { useCallback, useEffect, useState } from "react";

type NotificationItem = {
  notification_id: number | string;
  type?: "feedback" | "complaint";
  created_at: string;
  read_at: string | null;
  incident_id: number | string;
  incident_title: string;
  rating?: number | null;
  comment?: string | null;
  complaint_reason?: string | null;
  complaint_category?: string | null;
  submitted_by_name: string;
};

export default function NotificationsPanel() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load notifications.");
      }

      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadNotifications(), 0);
    const refreshTimer = window.setInterval(() => void loadNotifications(), 10000);
    return () => {
      window.clearTimeout(loadTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadNotifications]);

  async function markAsRead(notificationId: number | string) {
    const id = String(notificationId);
    setUpdatingId(id);
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_id: notificationId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to update notification.");
      }

      setNotifications((current) =>
        current.filter(
          (notification) => String(notification.notification_id) !== id
        )
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update notification."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section
      className="mb-6 rounded-xl border bg-white p-5 shadow-sm"
      aria-labelledby="feedback-notifications-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="feedback-notifications-heading" className="text-lg font-semibold flex items-center gap-2">
          <span>🔔</span> Notifications & Alerts
        </h2>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
          {unreadCount} unread
        </span>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="mt-3 text-sm text-gray-500">Loading notifications...</p>
      ) : notifications.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No unread notifications.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {notifications.map((notification) => {
            const isUnread = notification.read_at === null;
            const isComplaint = notification.type === "complaint";

            return (
              <li
                key={notification.notification_id}
                className={`rounded-lg border p-4 ${
                  isComplaint
                    ? isUnread
                      ? "border-red-300 bg-red-50"
                      : "border-orange-200 bg-orange-50/40"
                    : isUnread
                      ? "border-blue-200 bg-blue-50"
                      : "border-gray-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {isComplaint ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-red-600 text-white text-xs px-2 py-0.5 font-semibold">
                            ⚠️ GRIEVANCE / COMPLAINT
                          </span>
                          <span className="text-xs text-red-800 font-medium">
                            {notification.complaint_category || "Work not progressing"}
                          </span>
                        </div>
                        <p className="font-medium mt-1 text-red-950">
                          Complaint on Incident #{notification.incident_id}: {notification.incident_title}
                        </p>
                        <p className="mt-1 text-sm text-red-800">
                          From: <strong>{notification.submitted_by_name}</strong>
                        </p>
                        {notification.complaint_reason && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-red-900 bg-white/70 p-2.5 rounded border border-red-200 font-mono">
                            {notification.complaint_reason}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-blue-600 text-white text-xs px-2 py-0.5 font-semibold">
                            ★ FEEDBACK
                          </span>
                        </div>
                        <p className="font-medium mt-1">
                          New feedback for incident #{notification.incident_id}:{" "}
                          {notification.incident_title}
                        </p>
                        <p className="mt-1 text-sm text-gray-700">
                          {"★".repeat(Number(notification.rating) || 5)}{" "}
                          {notification.rating}/5 stars from {notification.submitted_by_name}
                        </p>
                        {notification.comment && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 bg-white/70 p-2.5 rounded border border-gray-200">
                            {notification.comment}
                          </p>
                        )}
                      </>
                    )}
                    <time
                      className="mt-2 block text-xs text-gray-500"
                      dateTime={notification.created_at}
                    >
                      {new Date(notification.created_at).toLocaleString()}
                    </time>
                  </div>
                  {isUnread && (
                    <button
                      type="button"
                      className="shrink-0 text-sm font-medium text-blue-700 hover:underline disabled:opacity-50 bg-white px-3 py-1.5 rounded border border-blue-200 shadow-sm"
                      disabled={updatingId === String(notification.notification_id)}
                      onClick={() => void markAsRead(notification.notification_id)}
                    >
                      {updatingId === String(notification.notification_id)
                        ? "Updating..."
                        : "Mark as read"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

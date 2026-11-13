"use client";

import { useState } from "react";

type ComplaintModalProps = {
  incidentId: number;
  incidentTitle: string;
  onClose: () => void;
  onSubmitted: () => void;
};

const COMPLAINT_CATEGORIES = [
  "Work is not progressing / delayed",
  "Status has not changed",
  "Officer not responding",
  "Work done is unsatisfactory",
  "Urgent civic hazard unattended",
  "Other grievance",
];

export default function ComplaintModal({
  incidentId,
  incidentTitle,
  onClose,
  onSubmitted,
}: ComplaintModalProps) {
  const [category, setCategory] = useState(COMPLAINT_CATEGORIES[0]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 5) {
      setError("Please describe your complaint in detail (at least 5 characters).");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incident_id: incidentId,
          category,
          reason: reason.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to submit complaint.");
      }
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit complaint.");
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17, 20, 40, 0.65)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          padding: "32px",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="complaint-modal-title"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "20px",
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "1.2px",
                color: "#dc2626",
              }}
            >
              ⚠️ CIVIC GRIEVANCE & ESCALATION
            </p>
            <h2
              id="complaint-modal-title"
              style={{
                margin: 0,
                fontSize: "20px",
                letterSpacing: "-0.5px",
                color: "#1b2236",
              }}
            >
              Raise a Complaint
            </h2>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: "13px",
                color: "#6b7280",
                lineHeight: 1.4,
              }}
            >
              Incident #{incidentId}: <strong>{incidentTitle}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close complaint modal"
            style={{
              border: 0,
              background: "#f3f4f6",
              borderRadius: "8px",
              width: "32px",
              height: "32px",
              fontSize: "16px",
              cursor: "pointer",
              color: "#6b7280",
              flexShrink: 0,
              marginLeft: "12px",
            }}
          >
            ✕
          </button>
        </div>

        <p
          style={{
            fontSize: "12px",
            color: "#4b5563",
            background: "#fef2f2",
            border: "1px solid #fee2e2",
            padding: "10px 12px",
            borderRadius: "8px",
            marginBottom: "18px",
            lineHeight: 1.4,
          }}
        >
          If your reported issue has not been addressed, work is delayed, or status is stuck, submitting this alert notifies both the administration and assigned officers directly.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="complaint-category"
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 700,
                color: "#374151",
                marginBottom: "6px",
              }}
            >
              Reason Category
            </label>
            <select
              id="complaint-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                background: "white",
                color: "#1f2937",
                fontSize: "13px",
                outline: "none",
              }}
            >
              {COMPLAINT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="complaint-reason"
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 700,
                color: "#374151",
                marginBottom: "6px",
              }}
            >
              Describe what is happening / why work is stalled *
            </label>
            <textarea
              id="complaint-reason"
              rows={4}
              maxLength={1000}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. It has been 5 days and no officer has visited the site. The water leak is getting worse..."
              style={{
                width: "100%",
                padding: "11px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                background: "#fafafa",
                color: "#1f2937",
                font: "inherit",
                fontSize: "13px",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <p
              style={{
                margin: "4px 0 0",
                textAlign: "right",
                fontSize: "11px",
                color: "#9ca3af",
              }}
            >
              {reason.length} / 1000
            </p>
          </div>

          {error && (
            <p
              role="alert"
              style={{
                margin: "0 0 14px",
                padding: "10px 12px",
                borderRadius: "7px",
                background: "#fee2e2",
                color: "#991b1b",
                fontSize: "12px",
              }}
            >
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 16px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                background: "white",
                color: "#4b5563",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || reason.trim().length < 5}
              style={{
                padding: "10px 20px",
                border: 0,
                borderRadius: "8px",
                background: reason.trim().length < 5 ? "#fca5a5" : "#dc2626",
                color: "white",
                fontSize: "13px",
                fontWeight: 700,
                cursor: submitting || reason.trim().length < 5 ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Submitting Alert…" : "Submit Complaint"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

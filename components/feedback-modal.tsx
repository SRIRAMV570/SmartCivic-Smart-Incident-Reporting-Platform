
"use client";

import { useState } from "react";

type FeedbackModalProps = {
  incidentId: number;
  incidentTitle: string;
  onClose: () => void;
  onSubmitted: () => void;
};

export default function FeedbackModal({
  incidentId,
  incidentTitle,
  onClose,
  onSubmitted,
}: FeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rating < 1) {
      setError("Please select a star rating before submitting.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incident_id: incidentId,
          rating,
          comment: comment.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to submit feedback.");
      }
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback.");
      setSubmitting(false);
    }
  }

  const starLabels = ["Terrible", "Poor", "Okay", "Good", "Excellent"];

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17, 20, 40, 0.55)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
        onClick={onClose}
      >
        {/* Modal panel — stop propagation so clicks inside don't close */}
        <div
          style={{
            background: "white",
            borderRadius: "16px",
            padding: "32px",
            width: "100%",
            maxWidth: "440px",
            boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-modal-title"
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 700, letterSpacing: "1.3px", color: "#5147ce" }}>
                RATE RESOLUTION
              </p>
              <h2
                id="feedback-modal-title"
                style={{ margin: 0, fontSize: "19px", letterSpacing: "-0.5px", color: "#1b2236" }}
              >
                How was the resolution?
              </h2>
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#8a93a5", lineHeight: 1.5 }}>
                {incidentTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close feedback form"
              style={{
                border: 0,
                background: "#f3f4f9",
                borderRadius: "8px",
                width: "32px",
                height: "32px",
                fontSize: "16px",
                cursor: "pointer",
                color: "#68748a",
                flexShrink: 0,
                marginLeft: "12px",
              }}
            >
              ✕
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)}>
            {/* Star Rating */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#424b60", marginBottom: "10px" }}
              >
                Your rating
              </label>
              <div
                style={{ display: "flex", gap: "8px" }}
                role="group"
                aria-label="Star rating"
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    aria-label={`${star} star${star > 1 ? "s" : ""} — ${starLabels[star - 1]}`}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    style={{
                      border: 0,
                      background: "transparent",
                      fontSize: "34px",
                      cursor: "pointer",
                      color:
                        star <= (hovered || rating) ? "#f59e0b" : "#dde1eb",
                      padding: "2px",
                      transition: "color 120ms ease, transform 120ms ease",
                      transform:
                        star <= (hovered || rating) ? "scale(1.12)" : "scale(1)",
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
              {(hovered || rating) > 0 && (
                <p style={{ margin: "8px 0 0", fontSize: "11px", color: "#5147ce", fontWeight: 600 }}>
                  {starLabels[(hovered || rating) - 1]}
                </p>
              )}
            </div>

            {/* Comment */}
            <div style={{ marginBottom: "20px" }}>
              <label
                htmlFor="feedback-comment"
                style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#424b60", marginBottom: "6px" }}
              >
                Comment <span style={{ fontWeight: 400, color: "#8a93a5" }}>(optional)</span>
              </label>
              <textarea
                id="feedback-comment"
                rows={3}
                maxLength={1000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us about your experience..."
                style={{
                  width: "100%",
                  padding: "11px 12px",
                  border: "1px solid #dfe3ed",
                  borderRadius: "8px",
                  background: "#fafaff",
                  color: "#30394b",
                  font: "inherit",
                  fontSize: "13px",
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <p style={{ margin: "4px 0 0", textAlign: "right", fontSize: "10px", color: "#9da4bd" }}>
                {comment.length} / 1000
              </p>
            </div>

            {error && (
              <p
                role="alert"
                style={{
                  margin: "0 0 14px",
                  padding: "10px 12px",
                  borderRadius: "7px",
                  background: "#fff0f0",
                  color: "#c52d41",
                  fontSize: "12px",
                }}
              >
                {error}
              </p>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "10px 16px",
                  border: "1px solid #e4e7ef",
                  borderRadius: "8px",
                  background: "white",
                  color: "#68748a",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || rating < 1}
                style={{
                  padding: "10px 18px",
                  border: 0,
                  borderRadius: "8px",
                  background: rating < 1 ? "#c4c1f0" : "#4f46e5",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: submitting || rating < 1 ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Submitting…" : "Submit feedback"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AlertPage() {
  const searchParams = useSearchParams();

  const item = useMemo(
    () => (searchParams.get("item") || "").trim(),
    [searchParams]
  );
  const location = useMemo(
    () => (searchParams.get("location") || "").trim(),
    [searchParams]
  );

  // "qty" here is really the status level staff selects (low/out)
  // Your sheet column is named qty, so we keep sending qty for compatibility.
  const [qty, setQty] = useState<"low" | "out">("low");
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [alertId, setAlertId] = useState<string | null>(null);

  const UNDO_SECONDS = 30;
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Countdown timer for undo
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  // Reset state if user changes query params (new scan)
  useEffect(() => {
    setSubmitted(false);
    setAlertId(null);
    setSecondsLeft(0);
    setMessage(null);
    setError(null);
    setNote("");
    setQty("low");
  }, [item, location]);

  async function handleSubmit() {
    // Lightweight guard against accidental double taps / laggy devices
    if (submitted) return;

    setError(null);
    setMessage(null);

    if (!item || !location) {
      setError("Missing item or location in the URL.");
      return;
    }

    if (submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item,
          location,
          qty, // "low" | "out"
          note: note.trim() ? note.trim() : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Submit failed.");
      }

      setSubmitted(true);
      setAlertId(data.alertId);
      setSecondsLeft(UNDO_SECONDS);

      setMessage("Alert submitted ✅ (you can undo for a moment)");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Something went wrong submitting the alert.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    setError(null);
    setMessage(null);

    if (!alertId) return;

    try {
      const res = await fetch("/api/alert/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Cancel failed.");
      }

      // Reset UI so they can re-submit correctly
      setSubmitted(false);
      setAlertId(null);
      setSecondsLeft(0);
      setMessage("Canceled ✅");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Something went wrong canceling the alert.");
    }
  }

  // Bypass waiting for the remaining undo window
  function finalizeNow() {
    setSecondsLeft(0);
    setMessage("Submitted ✓");
  }

  // Button label logic
  const showCancel = submitted && secondsLeft > 0 && !!alertId;
  const showSubmittedLocked = submitted && secondsLeft <= 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>
        Inventory Alert
      </h1>

      {/* Item / Location card */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700 }}>
          {item || "(no item)"}
        </div>
        <div style={{ fontSize: 16, color: "#374151" }}>
          {location || "(no location)"}
        </div>
      </div>

      {/* Qty selector */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setQty("out")}
          disabled={submitted || submitting}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "1px solid #111827",
            background: qty === "out" ? "#111827" : "#fff",
            color: qty === "out" ? "#fff" : "#111827",
            fontWeight: 700,
            cursor: submitted ? "not-allowed" : "pointer",
          }}
        >
          Empty
        </button>

        <button
          type="button"
          onClick={() => setQty("low")}
          disabled={submitted || submitting}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "1px solid #111827",
            background: qty === "low" ? "#111827" : "#fff",
            color: qty === "low" ? "#fff" : "#111827",
            fontWeight: 700,
            cursor: submitted ? "not-allowed" : "pointer",
          }}
        >
          Low
        </button>
      </div>

      {/* Optional note */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Optional note</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={submitted || submitting}
          placeholder="Example: only 1 gallon left, need delivery"
          style={{
            width: "100%",
            minHeight: 110,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            padding: 12,
            fontSize: 14,
          }}
        />
      </div>

      {/* Submit / Cancel / Submitted */}
      {!submitted && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: "100%",
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid #111827",
            background: "#111827",
            color: "#fff",
            fontWeight: 800,
            fontSize: 16,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      )}

      {showCancel && (
        <div style={{ display: "grid", gap: 10 }}>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              width: "100%",
              padding: "16px 18px",
              borderRadius: 12,
              border: "1px solid #b91c1c",
              background: "#b91c1c",
              color: "#fff",
              fontWeight: 800,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Cancel ({secondsLeft}s)
          </button>

          <button
            type="button"
            onClick={finalizeNow}
            style={{
              width: "100%",
              padding: "16px 18px",
              borderRadius: 12,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              fontWeight: 800,
              fontSize: 16,
              cursor: "pointer",
              opacity: 0.9,
            }}
          >
            Submit Now
          </button>

          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Undo available for {secondsLeft}s.
          </div>
        </div>
      )}

      {showSubmittedLocked && (
        <div>
          <button
            type="button"
            disabled
            style={{
              width: "100%",
              padding: "16px 18px",
              borderRadius: 12,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              fontWeight: 800,
              fontSize: 16,
              opacity: 0.75,
              cursor: "not-allowed",
            }}
          >
            Submitted ✓
          </button>

          <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
            Undo window expired.
          </div>
        </div>
      )}

      {/* Status messages */}
      {message && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 10,
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/**
 * Memo Mode (Phase 1)
 * - Voice -> text (Web Speech API) when available
 * - Editable transcript
 * - Low / Empty toggle
 * - Location (Front / Kitchen)
 * - Submit -> /api/alert (same pipeline as QR)
 *
 * Data strategy:
 * - source: "memo"
 * - item: short title (basic heuristic from transcript)
 * - note: full transcript (raw)
 */

type QtyLevel = "low" | "empty";
type Location = "Front" | "Kitchen";

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Simple Phase 1 heuristic:
 * - Use first ~6 words as the item title, cleaned up.
 * - We are NOT doing advanced NLP parsing in Phase 1.
 */
function makeItemTitleFromTranscript(transcript: string) {
  const cleaned = transcript
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "");
  if (!cleaned) return "";
  const words = cleaned.split(" ").slice(0, 6).join(" ");
  // If someone says "we are out of milk", we don't overthink; just store the short title.
  return words;
}

export default function MemoPage() {
  const SpeechRecognitionCtor = useMemo(() => getSpeechRecognitionCtor(), []);
  const supportsSpeech = !!SpeechRecognitionCtor;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [qty, setQty] = useState<QtyLevel>("low");
  const [location, setLocation] = useState<Location>("Front");

  const [title, setTitle] = useState(""); // derived but editable
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const recognitionRef = useRef<any>(null);

  // Keep title in sync with transcript unless the user has already edited it.
  const userEditedTitleRef = useRef(false);
  useEffect(() => {
    if (!userEditedTitleRef.current) {
      setTitle(makeItemTitleFromTranscript(transcript));
    }
  }, [transcript]);

  useEffect(() => {
    // Cleanup recognition on unmount.
    return () => {
      try {
        recognitionRef.current?.stop?.();
      } catch {}
    };
  }, []);

  function startListening() {
    setErrorMsg("");
    setStatus("idle");

    if (!SpeechRecognitionCtor) {
      setErrorMsg(
        "Voice input isn’t supported in this browser. Type your memo instead.",
      );
      return;
    }

    // Prevent double-start issues.
    if (isListening) return;

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;

    recognition.continuous = false; // single utterance is simplest for Phase 1
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);

      // Common iOS/permission issues: "not-allowed", "service-not-allowed"
      const msg =
        event?.error === "not-allowed"
          ? "Microphone permission denied. Enable mic access in browser settings, or type instead."
          : `Speech error: ${event?.error || "unknown"}`;
      setErrorMsg(msg);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      // Combine all results into one string
      let combined = "";
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0]?.transcript || "";
      }
      setTranscript((prev) => {
        // If user already typed something, append.
        const base = prev.trim();
        const next = combined.trim();
        if (!base) return next;
        if (!next) return base;
        return `${base} ${next}`.replace(/\s+/g, " ");
      });
    };

    try {
      recognition.start();
    } catch (e: any) {
      setIsListening(false);
      setErrorMsg("Could not start voice input. Try again, or type your memo.");
    }
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop?.();
    } catch {}
    setIsListening(false);
  }

  async function submitMemo() {
    setErrorMsg("");
    setStatus("submitting");

    if (status === "submitting") return;

    const finalTranscript = transcript.trim();
    const finalTitle = title.trim();

    if (!finalTranscript && !finalTitle) {
      setStatus("error");
      setErrorMsg("Add a memo (voice or text) before submitting.");
      return;
    }

    // Phase 1: "item" should be something short and searchable.
    // If title is empty, derive from transcript.
    const item =
      finalTitle || makeItemTitleFromTranscript(finalTranscript) || "Memo";

    // Phase 1: store full raw text in note
    const note = finalTranscript || "";

    try {
      const res = await fetch("/api/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item,
          location,
          qty, // "low" | "empty"
          note,
          source: "memo",
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Request failed with ${res.status}`);
      }

      setStatus("success");
      // Reset for quick repeated use.
      window.setTimeout(() => setStatus("idle"), 1500);

      setTranscript("");
      setTitle("");
      userEditedTitleRef.current = false;
      setQty("low");
      setLocation("Front");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.message || "Failed to submit memo.");
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      {/* Back to Tasks (Phase 1 rule: no dead ends) */}
      <div style={{ marginBottom: 12 }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          ← Back to Tasks
        </Link>
      </div>

      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Memo Mode</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Tap & speak (or type). Submit creates the same alert as QR.
      </p>

      {/* Primary action: Tap & Speak */}
      <div
        style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0" }}
      >
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={status === "submitting"}
          style={{
            padding: "12px 14px",
            fontSize: 16,
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            width: 220,
            opacity: status === "submitting" ? 0.6 : 1,
          }}
        >
          {isListening ? "⏹ Stop" : "🎙 Tap & Speak"}
        </button>

        {!supportsSpeech && (
          <div style={{ padding: "12px 0", opacity: 0.75 }}>
            Voice not supported here — use typing below.
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Short title (item)</label>
          <input
            value={title}
            onChange={(e) => {
              userEditedTitleRef.current = true;
              setTitle(e.target.value);
            }}
            placeholder="e.g. Out of milk"
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              fontSize: 16,
            }}
          />
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Tip: Keep this short — it’s what you’ll search later.
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontWeight: 600 }}>
            Memo (full transcript / notes)
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Speak or type: 'We are out of milk at the front…'"
            rows={6}
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              fontSize: 16,
              resize: "vertical",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6, minWidth: 180 }}>
            <label style={{ fontWeight: 600 }}>Level</label>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setQty("low")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background:
                    qty === "low" ? "rgba(0,0,0,0.08)" : "transparent",
                }}
              >
                Low
              </button>
              <button
                onClick={() => setQty("empty")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background:
                    qty === "empty" ? "rgba(0,0,0,0.08)" : "transparent",
                }}
              >
                Empty
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 6, minWidth: 200 }}>
            <label style={{ fontWeight: 600 }}>Location</label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as Location)}
              style={{
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
                fontSize: 16,
              }}
            >
              <option value="Front">Front</option>
              <option value="Kitchen">Kitchen</option>
            </select>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={submitMemo}
          disabled={status === "submitting"}
          style={{
            padding: "14px 14px",
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.2)",
            opacity: status === "submitting" ? 0.7 : 1,
          }}
        >
          {status === "submitting" ? "Submitting…" : "Submit Memo Alert"}
        </button>

        {/* Status */}
        {status === "success" && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(0,0,0,0.06)",
            }}
          >
            ✅ Sent to Manager List + Checklist
          </div>
        )}

        {status === "error" && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,0,0,0.08)",
            }}
          >
            ❌ {errorMsg || "Something went wrong."}
          </div>
        )}

        {!!errorMsg && status !== "error" && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,165,0,0.12)",
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}

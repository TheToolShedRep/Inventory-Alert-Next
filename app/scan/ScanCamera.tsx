"use client";

import { useEffect, useRef, useState } from "react";

export default function ScanCamera({
  onDetected,
}: {
  onDetected: (upc: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [supported, setSupported] = useState(false);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState<string>(
    "Tap “Start Camera” to scan a barcode."
  );
  const [busy, setBusy] = useState(false);

  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string>("");

  // Detect BarcodeDetector support once
  useEffect(() => {
    const hasBarcodeDetector =
      typeof (window as any).BarcodeDetector !== "undefined";
    setSupported(hasBarcodeDetector);
  }, []);

  async function startCamera() {
    setCameraError("");
    setStatus("Starting camera…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraStarted(true);

      setStatus(
        supported
          ? "Point camera at barcode"
          : "Camera started. This device may not support live barcode detection — use manual entry."
      );
    } catch (e: any) {
      const msg =
        e?.name === "NotAllowedError"
          ? "Camera permission was denied. Enable it in your browser settings, or use manual entry below."
          : e?.message || "Could not start camera.";

      setCameraError(msg);
      setStatus("Camera not available.");
      setCameraStarted(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStarted(false);
    setStatus("Camera stopped. Tap “Start Camera” to scan again.");
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Live scanning loop (only when camera started + supported)
  useEffect(() => {
    if (!supported) return;
    if (!cameraStarted) return;
    if (!videoRef.current) return;
    if (busy) return;

    const BarcodeDetector = (window as any).BarcodeDetector;
    const detector = new BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
    });

    let raf = 0;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;

      try {
        const video = videoRef.current!;
        if (video.readyState >= 2) {
          const barcodes = await detector.detect(video);
          if (barcodes?.length) {
            const value = (barcodes[0]?.rawValue || "").trim();
            if (value) {
              setBusy(true);
              // stop camera to avoid double-detections / heat
              stopCamera();
              onDetected(value);
              return;
            }
          }
        }
      } catch {
        // ignore detection errors
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [supported, cameraStarted, busy, onDetected]);

  const canManualGo = (manual || "").replace(/\D/g, "").length >= 8;

  return (
    <div className="space-y-3">
      {/* Camera area */}
      <div className="rounded-xl border bg-black/5 p-2">
        <video
          ref={videoRef}
          className="h-[360px] w-full rounded-lg object-cover"
          playsInline
          muted
        />

        {/* Start/Stop controls */}
        <div className="mt-2 flex gap-2">
          {!cameraStarted ? (
            <button
              type="button"
              onClick={startCamera}
              className="w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Start Camera
            </button>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              className="w-full rounded-lg border bg-white px-4 py-2 text-sm font-medium"
            >
              Stop Camera
            </button>
          )}
        </div>
      </div>

      {/* Status / errors */}
      <div className="text-sm text-neutral-600">{status}</div>

      {cameraError ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {cameraError}
          <div className="mt-2 text-xs text-amber-800">
            Tip: On iPhone Safari, tap the <b>aA</b> icon → Website Settings →
            Camera → <b>Allow</b>. On Chrome, tap the lock icon → Permissions →
            Camera → <b>Allow</b>.
          </div>
        </div>
      ) : null}

      {/* Manual entry */}
      <div className="rounded-xl border p-3">
        <div className="text-sm font-medium">Manual barcode entry</div>
        <div className="mt-2 flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            inputMode="numeric"
            placeholder="Enter barcode digits"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={!canManualGo}
            onClick={() => {
              const digits = (manual || "").replace(/\D/g, "");
              if (!digits) return;
              setBusy(true);
              onDetected(digits);
            }}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Go
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Manual entry always works and is a good fallback if camera scanning is
          flaky on a device.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, Result } from "@zxing/library";

/**
 * ScanCamera
 * - Android/modern browsers: uses native BarcodeDetector for live scanning (fast/reliable)
 * - iPhone (Safari/PWA): native BarcodeDetector is usually missing, so live scanning won't work.
 *   We default to PHOTO scan as the primary action to avoid the "Start Camera does nothing" trap.
 */
export default function ScanCamera({
  onDetected,
}: {
  onDetected: (upc: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [supported, setSupported] = useState(false); // native BarcodeDetector
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState<string>(
    'Scan a barcode (iPhone: use "Take Photo to Scan").',
  );
  const [busy, setBusy] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string>("");

  // ---- Platform detection ----
  const isIOS = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  }, []);

  // iOS "standalone" PWA (Home Screen) (used only for messaging)
  const isStandalonePWA = useMemo(() => {
    if (typeof window === "undefined") return false;

    const navAny = navigator as any;
    const iosStandalone =
      typeof navAny.standalone === "boolean" && navAny.standalone;

    const displayModeStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;

    return Boolean(iosStandalone || displayModeStandalone);
  }, []);

  // ✅ Based on testing: iPhone browsers ALSO unreliable for live decoding.
  // So we "prefer photo scan" on all iOS (Safari + PWA).
  const shouldPreferPhotoScan = isIOS;

  // Detect native BarcodeDetector support once
  useEffect(() => {
    const hasBarcodeDetector =
      typeof (window as any).BarcodeDetector !== "undefined";
    setSupported(hasBarcodeDetector);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStarted(false);

    // ✅ On iPhone we don't want to keep prompting "Start Camera" since live decode won't run.
    if (isIOS) {
      setStatus('Ready. Use "Take Photo to Scan" (recommended on iPhone).');
    } else {
      setStatus('Camera stopped. Tap "Start Camera" to scan again.');
    }
  }, [isIOS]);

  const startCamera = useCallback(async () => {
    setCameraError("");
    setStatus("Starting camera…");

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.muted = true;
        await videoRef.current.play();
      }

      setBusy(false);
      setCameraStarted(true);

      // ✅ Status messaging depends on capability
      if (supported && !shouldPreferPhotoScan) {
        setStatus("Point camera at barcode");
      } else if (shouldPreferPhotoScan) {
        setStatus('iPhone: Use "Take Photo to Scan" (most reliable).');
      } else {
        setStatus("Point camera at barcode (compat mode)");
      }
    } catch (e: any) {
      const msg =
        e?.name === "NotAllowedError"
          ? "Camera permission was denied. Enable it in Settings/Safari, or use manual entry."
          : e?.message || "Could not start camera.";

      setCameraError(msg);
      setStatus("Camera not available.");
      setCameraStarted(false);
    }
  }, [supported, shouldPreferPhotoScan]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  /**
   * ✅ Live scanning loop (Native BarcodeDetector only)
   * - Great on Android Chrome
   * - On iOS, BarcodeDetector is often missing (supported=false)
   * - Even if it exists, iOS live decode is flaky, so we skip live decode when shouldPreferPhotoScan=true
   */
  useEffect(() => {
    if (!cameraStarted) return;
    if (!videoRef.current) return;
    if (busy) return;
    if (!supported) return;
    if (shouldPreferPhotoScan) return; // ✅ do not attempt live decode on iOS

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
              stopCamera();
              onDetected(value);
              return;
            }
          }
        }
      } catch {
        // ignore
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [
    cameraStarted,
    supported,
    shouldPreferPhotoScan,
    busy,
    onDetected,
    stopCamera,
  ]);

  /**
   * ✅ Photo decode (reliable on iOS)
   * 2-pass strategy:
   *  - Pass 1: decode full image (downscaled + contrast)
   *  - Pass 2: if fail, decode a centered crop strip (effectively "zoom in")
   */
  const decodeImageFile = useCallback(
    async (file: File) => {
      if (!file) return;

      setBusy(true);
      setCameraError("");
      setStatus("Scanning photo…");

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
      ]);

      const reader = new BrowserMultiFormatReader(hints);

      let objectUrl = "";
      try {
        const img = new Image();
        objectUrl = URL.createObjectURL(file);

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Could not load image"));
          img.src = objectUrl;
        });

        // ✅ Downscale huge iPhone images (critical)
        const MAX_WIDTH = 1000;
        const scale = Math.min(1, MAX_WIDTH / img.width);

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(img.width * scale));
        canvas.height = Math.max(1, Math.floor(img.height * scale));

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported");

        // Helper: try decode from whatever is currently drawn on canvas
        const tryDecode = async () => {
          const result: Result = await reader.decodeFromCanvas(canvas);
          const value = result?.getText()?.trim();
          return value || "";
        };

        // -------------------------
        // Pass 1: full image
        // -------------------------
        ctx.filter = "contrast(1.35)";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let value = "";
        try {
          value = await tryDecode();
        } catch {
          value = "";
        }

        // -------------------------
        // Pass 2: center crop strip
        // (only if full image fails)
        // -------------------------
        if (!value) {
          // We crop a wide horizontal band from the center of the image.
          // This "zooms in" on where users typically frame the barcode.
          const cropW = Math.floor(canvas.width * 0.8); // 80% width
          const cropH = Math.floor(canvas.height * 0.35); // 35% height band

          const sx = Math.max(0, Math.floor((canvas.width - cropW) / 2));
          const sy = Math.max(0, Math.floor((canvas.height - cropH) / 2));

          // Redraw: take the crop and stretch it to fill the canvas
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          ctx.filter = "contrast(1.55)";
          // Draw from existing canvas region (faster than re-drawing from img)
          ctx.drawImage(
            canvas,
            sx,
            sy,
            cropW,
            cropH,
            0,
            0,
            canvas.width,
            canvas.height,
          );

          try {
            value = await tryDecode();
          } catch {
            value = "";
          }
        }

        if (!value) throw new Error("No barcode found in image.");

        stopCamera();
        onDetected(value);
      } catch (e: any) {
        setBusy(false);
        setStatus("Could not read barcode. Try again or use manual entry.");
        setCameraError(e?.message || "Could not read barcode from photo.");
      } finally {
        try {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        } catch {}
      }
    },
    [onDetected, stopCamera],
  );

  const canManualGo = (manual || "").replace(/\D/g, "").length >= 8;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-black/5 p-2">
        <video
          ref={videoRef}
          className="h-[360px] w-full rounded-lg object-cover"
          playsInline
          muted
        />

        {/* ✅ Hidden file input (used by iPhone photo scan). Lives once here so buttons can trigger it. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = ""; // allow selecting same file again
            if (f) decodeImageFile(f);
          }}
        />

        <div className="mt-2 space-y-2">
          {/* ✅ iPhone: Photo scan is PRIMARY (because live decode is not supported here) */}
          {isIOS ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Take Photo to Scan (Recommended)
              </button>

              {/* Optional: allow starting camera just to help frame the barcode */}
              {!cameraStarted ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full rounded-lg border bg-white px-4 py-2 text-sm font-medium"
                >
                  Preview Camera (Optional)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="w-full rounded-lg border bg-white px-4 py-2 text-sm font-medium"
                >
                  Stop Preview
                </button>
              )}

              {/* <div className="text-xs text-neutral-600">
                iPhone browsers/PWA often can’t decode live barcodes reliably.
                Photo scan is the most consistent option.
              </div> */}

              <div className="space-y-1 text-xs text-neutral-600">
                <div>
                  iPhone browsers/PWA often can’t decode live barcode reliably.
                  Photo scan is the most consistent option.
                </div>
                <div className="font-medium text-neutral-800">
                  Tip: Move closer and fill the frame with the barcode.
                </div>
              </div>
            </>
          ) : (
            /* ✅ Non-iPhone: keep live scan button as primary */
            <>
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
            </>
          )}
        </div>

        <div className="mt-2 text-xs text-neutral-500">
          iOS: {String(isIOS)} | Standalone: {String(isStandalonePWA)} |
          BarcodeDetector: {String(supported)}
        </div>
      </div>

      <div className="text-sm text-neutral-600">{status}</div>

      {cameraError ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {cameraError}
        </div>
      ) : null}

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
            disabled={!canManualGo || busy}
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
          Manual entry always works if scanning is flaky.
        </p>
      </div>
    </div>
  );
}

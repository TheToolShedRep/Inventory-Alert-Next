// lib/email.ts
import { Resend } from "resend";

type SendAlertEmailArgs = {
  subject: string;
  html: string;
  /**
   * Optional recipient(s).
   * If omitted, we'll fall back to ALERT_EMAIL_TO from env.
   */
  to?: string | string[];
};

function normalizeRecipients(to?: string | string[]) {
  // If caller passed to: "...", or ["..."]
  if (typeof to === "string") return [to];
  if (Array.isArray(to)) return to.filter(Boolean);

  // Otherwise fall back to env
  const fallback = process.env.ALERT_EMAIL_TO || "";
  if (!fallback) return [];

  // Support comma-separated env like: "a@x.com,b@y.com"
  return fallback
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function sendAlertEmail({
  subject,
  html,
  to,
}: SendAlertEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY env var");
  }
  if (!from) {
    throw new Error("Missing ALERT_EMAIL_FROM env var");
  }

  const recipients = normalizeRecipients(to);

  if (recipients.length === 0) {
    // Don't hard fail the entire alert flow if no recipients are configured.
    console.warn(
      "⚠️ sendAlertEmail: No recipients found. Provide `to` or set ALERT_EMAIL_TO.",
    );
    return { ok: false, skipped: true, reason: "no_recipients" };
  }

  const resend = new Resend(apiKey);

  console.log("📧 sendAlertEmail → from:", from);
  console.log("📧 sendAlertEmail → to:", recipients);
  console.log("📧 sendAlertEmail → subject:", subject);

  const { data, error } = await resend.emails.send({
    from,
    to: recipients,
    subject,
    html,
  });

  if (error) {
    // Throw so the caller can log the real Resend error
    throw new Error(`Resend send failed: ${error.message}`);
  }

  return { ok: true, id: data?.id };
}

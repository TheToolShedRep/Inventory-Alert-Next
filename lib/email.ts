import { Resend } from "resend";

export async function sendAlertEmail(args: { subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from =
    process.env.ALERT_EMAIL_FROM || "Inventory Alerts <onboarding@resend.dev>";

  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  if (!to) throw new Error("Missing ALERT_EMAIL_TO");

  const resend = new Resend(apiKey);

  return await resend.emails.send({
    from,
    to,
    subject: args.subject,
    html: args.html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Optional outgoing email.
//
// Farooq BizManager works fully without email. To switch email on, create a
// free account at https://resend.com, verify your sending domain, and set one
// environment variable on your Convex deployment:
//
//     RESEND_API_KEY = re_xxxxxxxx
//
// (Convex dashboard → Settings → Environment Variables.)
// If the key is not set, sendEmail() throws "Email is not configured"; the
// callers catch that and record the reminder as "failed" in the alert log,
// so nothing else in the app is affected.
// ─────────────────────────────────────────────────────────────────────────────

export type OutgoingEmail = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Email is not configured (RESEND_API_KEY is not set).");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: email.from,
      to: Array.isArray(email.to) ? email.to : [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Email provider error ${response.status}: ${body.slice(0, 300)}`);
  }
}

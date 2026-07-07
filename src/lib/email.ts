/**
 * src/lib/email.ts · Envio de mail generico via Resend.
 *
 * Extraido del patron ya usado en digest.ts (fetch directo a la API HTTP de
 * Resend, sin SDK) para reusarlo en cualquier feature que necesite mandar un
 * mail ad-hoc (hoy: propuestas). RESEND_API_KEY es el mismo que ya usa el
 * digest diario.
 */

export interface EmailAttachment {
  filename: string;
  /** Contenido en base64 (sin el prefijo data:...;base64,). */
  content: string;
}

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  ok: boolean;
  reason?: string;
}

/** Envia un mail via Resend. Devuelve { ok:false, reason } en vez de tirar si
 * falta config o la API responde error, para que el caller decida como avisar
 * (mismo patron tolerante que runDigest). */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY no configurado" };

  const from = process.env.RESEND_FROM || process.env.DIGEST_FROM || "propuestas@niuro.io";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(args.to) ? args.to : [args.to],
        subject: args.subject,
        html: args.html,
        attachments: args.attachments,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `Resend respondio ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

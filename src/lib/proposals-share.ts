/**
 * src/lib/proposals-share.ts · Share token de una propuesta (link publico).
 *
 * Reusado por el endpoint /share (pedir el link) y /send-whatsapp (necesita el
 * link para armar el mensaje). Idempotente: si ya existe, lo reusa.
 */
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";

function publicOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || "http://127.0.0.1:3001";
}

export function getOrCreateShareToken(id: string): { token: string; url: string } | null {
  const row = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!row) return null;

  let token = row.shareToken;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "");
    db.update(proposals).set({ shareToken: token, updatedAt: new Date() }).where(eq(proposals.id, id)).run();
  }
  return { token, url: `${publicOrigin()}/p/${token}` };
}

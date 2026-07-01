import { NextRequest, NextResponse } from "next/server";
import { hasAccount, createAccount, createSession, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Crea la única cuenta de esta instalación. 409 si ya existe una. */
export async function POST(req: NextRequest) {
  if (hasAccount()) {
    return NextResponse.json({ error: "Ya existe una cuenta en esta instalación" }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }

  createAccount(email, password);
  const token = createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}

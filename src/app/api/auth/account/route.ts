import { NextRequest, NextResponse } from "next/server";
import { verifyAccountPassword, changePassword, deleteAccount, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Cambia la contraseña (requiere la actual). */
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!verifyAccountPassword(currentPassword)) {
    return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 401 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "La nueva contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }

  changePassword(newPassword);
  return NextResponse.json({ ok: true });
}

/** Cierra la cuenta: borra la credencial y todas las sesiones. NO borra datos
 * de negocio (contactos/deals/etc.) — solo el acceso a esta instalación. */
export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!verifyAccountPassword(password)) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  deleteAccount();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

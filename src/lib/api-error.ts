import { NextResponse } from "next/server";

/**
 * Loguea el detalle real del error server-side y devuelve un string genérico para
 * el cliente. Reemplaza el patrón `error instanceof Error ? error.message : "..."`
 * que filtraba mensajes internos (Drizzle/SQLite, rutas, constraints) al cliente.
 */
export function loggedErrorDetail(error: unknown): string {
  console.error("[api]", error instanceof Error ? error.stack || error.message : String(error));
  return "error interno";
}

/** Respuesta 500 estándar: loguea el detalle y devuelve un cuerpo genérico. */
export function serverError(error: unknown, status = 500): NextResponse {
  return NextResponse.json({ error: loggedErrorDetail(error) }, { status });
}

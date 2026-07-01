import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { getOperator } from "@/lib/operator";
import { writeSettingsOn } from "@/lib/settings";
import { assertLoopbackHttpUrl } from "@/lib/url-safety";

export const dynamic = "force-dynamic";

function dbPath(): string {
  return process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
}

/** Identidad resuelta (crm_settings > env > default) para que el cliente la lea en runtime. */
export function GET() {
  return NextResponse.json(getOperator());
}

/** Persiste la identidad del onboarding y marca el primer arranque como completado. */
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const str = (v: unknown, max = 200) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";

  const name = str(body.name, 80);
  const role = str(body.role, 80);
  const email = str(body.email, 120);
  const company = str(body.company, 120);
  const pitch = str(body.pitch, 400);
  const bridgeUrl = str(body.bridgeUrl, 200);

  if (!name || !company) {
    return NextResponse.json({ error: "Nombre y empresa son requeridos" }, { status: 400 });
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (bridgeUrl) {
    try {
      assertLoopbackHttpUrl(bridgeUrl);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "URL de bridge inválida" },
        { status: 400 }
      );
    }
  }

  const settings: Record<string, string> = {
    operator_name: name,
    operator_role: role || "Ventas",
    operator_email: email || "operador@example.com",
    company_name: company,
    company_pitch: pitch || "una empresa de servicios",
    onboarding_completed: "1",
  };
  if (bridgeUrl) settings.whatsapp_bridge_url = bridgeUrl;

  // Una sola conexion/transaccion para crm_settings + el UPDATE de agents: antes
  // de la consolidacion sobre writeSettings() esto era atomico (auditoria
  // adversarial detecto la regresion). writeSettingsOn compone sobre ESTA
  // conexion en vez de abrir la suya propia.
  const sqlite = new Database(dbPath(), { timeout: 15000 });
  try {
    sqlite.transaction(() => {
      writeSettingsOn(sqlite, settings);
      // Deja el agente seed 'asistente' consistente con la identidad real.
      sqlite
        .prepare("UPDATE agents SET name = ?, role = ?, email = ? WHERE id = 'asistente'")
        .run(name, role || "Ventas", email || null);
    })();
  } finally {
    sqlite.close();
  }

  return NextResponse.json(getOperator());
}

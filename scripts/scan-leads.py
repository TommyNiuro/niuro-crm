#!/usr/bin/env python3
"""
Detector de leads de WhatsApp por reglas (determinista, sin IA).

Clasificador BASADO EN FEATURES (no en palabras sueltas), anclado en patrones
reales del corpus de Niuro. Separa lo que dice el DUEÑO (is_from_me=1, el dueño)
de lo que dice el CONTACTO (is_from_me=0), lee el NOMBRE del chat y el media.

Señales (de mayor a menor poder predictivo, validadas contra leads etiquetados):
  1. Token de empresa en el nombre del chat (el dueño lo renombra al calificar).
  2. El dueño está vendiendo (menciona Niuro / perfiles / entrevistas / propuesta).
  3. El dueño envió documentos (propuesta / descripción de cargo).
  4. Reciprocidad: contacto + dueño hablan de contratación.
  5. Intención del contacto.
Overrides negativos por DENSIDAD (no single-hit): romántico / evento / voluntariado /
busca-trabajo -> descartado.

Las features se mapean a la rúbrica de 5 dimensiones (para el desglose visual) y se
guarda un objeto "signals" que explica el porqué. Envía CANDIDATOS al CRM (van a
"Leads detectados" para revisión humana). No crea contactos ni envía mensajes.
Re-ejecutar es seguro: el endpoint deduplica pendientes por chat_jid.

Env (con defaults):
  WHATSAPP_DB_PATH, CRM_URL, WHATSAPP_SINCE, SCAN_DAYS (default 365)
"""
import json
import os
import re
import sqlite3
import sys
import unicodedata
import urllib.request
from datetime import datetime, timedelta

DB_PATH = os.environ.get(
    "WHATSAPP_DB_PATH",
    "./data/whatsapp/messages.db",
)
CRM_URL = os.environ.get("CRM_URL", "http://localhost:3001").rstrip("/")
SINCE = os.environ.get("WHATSAPP_SINCE", "2026-01-01")
MIN_BASE = 18

# ---- Rúbrica de intención/necesidad del CONTACTO (niveles) ----
INTENTION = [
    (35, ["entrevistas tecnicas", "entrevistas técnicas", "pasarte", "asignar", "asignarse",
          "alocar", "alocado", "onboarding", "arrancamos", "kickoff", "kick off"]),
    (28, ["propuesta", "cotiz", "agendar", "agendemos", "reunión", "reunion", "ver perfiles",
          "mándame perfiles", "mandame perfiles", "los perfiles", "demo", "firmar", "contrato", "avancemos"]),
    (18, ["cómo funciona", "como funciona", "cuánto cuesta", "cuanto cuesta", "que stack",
          "qué stack", "tarifa", "cuánto sale", "cuanto sale", "cobran", "qué precio", "que precio"]),
    (10, ["algún día", "algun dia", "más adelante", "mas adelante", "qué hacen", "que hacen",
          "me interesa", "interesad", "a futuro", "tengo una duda"]),
]
AUTHORITY = [
    (20, ["cto", "ceo", "founder", "fundador", "co-founder", "cofounder", "cofundador",
          "dueño", "dueno", "director", " vp", "head of"]),
    (13, ["manager", "líder", "lider", "jefe", "gerente", "encargad", " lead", "lead ", " pm "]),
]
URGENCY = [
    (15, ["urgente", "cuanto antes", "cuánto antes", "lo antes posible", "esta semana",
          "ya lo necesito", "asap", "ahora mismo", "para ya"]),
    (10, ["este mes", "próximas semanas", "proximas semanas", "pronto", "deadline", "plazo",
          "este trimestre", "en julio", "en agosto"]),
    (5, ["más adelante", "mas adelante", "viendo opciones", "explorando", "a futuro", "sin apuro"]),
]
BUDGET = [
    (10, ["presupuesto", "comparando", "ontop", "otro proveedor", "otra empresa", "negociar",
          "negociando", "budget", "tenemos para invertir"]),
    (7, ["levantamos", "ronda", "serie a", "seed", "inversión", "inversion", "funding", "respaldo"]),
    (4, ["precio", "cuánto cuesta", "cuanto cuesta", "costo", "tarifa", "cobran"]),
]
STACKS = ["react", "node", "python", "java", "golang", ".net", "php", "ruby", "angular", "vue",
          "backend", "frontend", "fullstack", "full-stack", "devops", " qa", "data", "mobile",
          "flutter", "ios", "android", "sre", "machine learning"]
NEED_CONCRETE = ["vacante", "posición", "posicion", " rol", "rol ", "proyecto", "deadline", "board",
                 "contratar", "contratación", "contratacion"]
NEED_PROFILE = ["perfil", "senior", "semi senior", "ssr", "desarrollador", "programador", "ingenier", "dev"]
NEED_VAGUE = ["falta gente", "nos falta", "crecer el equipo", "necesitamos", "sumar gente",
              "escalar el equipo", "armar equipo"]

# ---- Comportamiento del DUEÑO (Operador vendiendo) ----
OWNER_SELL_KW = ["niuro", "ingenier", "perfil", "candidat", "entrevista", "descripción de cargo",
                 "descripcion de cargo", "propuesta", "asignar", "staff", "talento", "semi senior",
                 "ssr", "matching", "developers", "desarrolladores"]

# ---- Tokens para overrides (se cuentan por densidad en SQL) ----
ROMANTIC = ["te amo", "te quiero", "mi amor", "mi vida", "amor mío", "amor mio", " amor", "bebé",
            "tqm", "te extraño", "te extrano", "cariño", "mi cielo", "mi rey", "mi reina", "beso", "abrazo apretado"]
EVENT = ["boda", "matrimonio", "lista de invitados", "los invitados", "cumpleaños", "cumpleanos",
         "bautizo", " misa", "parroquia", "graduación", "despedida de solter", "voluntariado", "aiesec"]
JOBSEEKER = ["busco trabajo", "busco pega", "busco empleo", "estoy buscando trabajo", "te dejo mi cv",
             "te mando mi cv", "alguna oportunidad para mi", "alguna oportunidad para mí",
             "estoy postulando", "busco oportunidad laboral"]

# Tokens del nombre que NO son empresa (países, etiquetas, etc.)
NONCOMPANY = {"MX", "CHILE", "COLOMBIA", "MEXICO", "MÉXICO", "ARGENTINA", "PERU", "PERÚ", "X",
              "VOLUNTARIOS", "ONG", "IGLESIA", "FAMILIA", "CASA"}
ROLE_TOKENS = {"CEO", "CTO", "CPO", "COO", "CFO", "VP", "CMO", "CRO", "CISO"}


def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def crm_up():
    try:
        with urllib.request.urlopen(f"{CRM_URL}/api/whatsapp/candidates?status=pending", timeout=5) as r:
            return r.status == 200
    except Exception as e:
        log(f"CRM no responde ({e}). El servidor del CRM debe estar corriendo. Salgo.")
        return False


def best_level(text, levels):
    for pts, pats in levels:
        hit = [p for p in pats if p in text]
        if hit:
            return pts, hit
    return 0, []


def need_level(text):
    has_stack = any(s in text for s in STACKS)
    concrete = [p for p in NEED_CONCRETE if p in text]
    if concrete and (has_stack or "deadline" in text or "board" in text):
        return 20, concrete
    profile = [p for p in NEED_PROFILE if p in text]
    if has_stack or profile:
        return 13, (profile or ["stack"])
    vague = [p for p in NEED_VAGUE if p in text]
    if vague:
        return 7, vague
    return 0, []


def recency_factor(days):
    if days <= 7:
        return 1.0
    if days <= 21:
        return 0.85
    if days <= 45:
        return 0.7
    return 0.5


def detect_company_token(name):
    """El nombre del chat suele traer la empresa cuando el dueño lo califica."""
    s = "".join(ch for ch in (name or "") if unicodedata.category(ch)[0] != "C").strip()
    toks = [t.strip(".,|-") for t in re.split(r"\s+", s) if t.strip(".,|-")]
    if len(toks) < 3:
        return False, None
    company = []
    for t in toks[2:]:  # tras nombre + apellido
        up = t.upper()
        if up in ROLE_TOKENS or up in NONCOMPANY:
            continue
        if re.fullmatch(r"[A-ZÁÉÍÓÚÑ0-9]{2,}", t) or re.fullmatch(r"[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}", t):
            company.append(t)
    if company:
        return True, " ".join(company)
    return False, None


def owner_selling(owner_text):
    hits = sorted({k for k in OWNER_SELL_KW if k in owner_text})
    return (len(hits) >= 2), len(hits), hits


def like_clause(col, words):
    return " OR ".join(f"{col} LIKE '%' || ? || '%'" for _ in words)


def main():
    if not os.path.exists(DB_PATH):
        log(f"No existe la base de WhatsApp en {DB_PATH}. Salgo.")
        return 0
    if not crm_up():
        return 0

    days = int(os.environ.get("SCAN_DAYS", "365"))
    now = datetime.now()
    window_cut = max((now - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S"), SINCE)

    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute(
        """
        SELECT c.jid AS jid, c.name AS name, MAX(m.timestamp) AS last_ts
        FROM chats c JOIN messages m ON m.chat_jid = c.jid
        WHERE c.jid LIKE '%@s.whatsapp.net'
          AND c.jid NOT LIKE '%@broadcast'
          AND c.name IS NOT NULL AND c.name <> ''
          AND substr(m.timestamp,1,19) >= ?
        GROUP BY c.jid
        ORDER BY MAX(m.timestamp) DESC
        LIMIT 250
        """,
        (window_cut,),
    )
    chats = cur.fetchall()

    rom_sql = like_clause("lower(content)", ROMANTIC)
    evt_sql = like_clause("lower(content)", EVENT)

    candidates = []
    skipped = 0
    for ch in chats:
        # Texto reciente separado por autor (para keywords)
        cur.execute(
            "SELECT content, is_from_me FROM messages WHERE chat_jid = ? AND substr(timestamp,1,19) >= ? "
            "ORDER BY timestamp DESC LIMIT 60",
            (ch["jid"], window_cut),
        )
        recent = cur.fetchall()
        owner_text = " \n ".join((m["content"] or "") for m in recent if m["is_from_me"]).lower()
        contact_text = " \n ".join((m["content"] or "") for m in recent if not m["is_from_me"]).lower()
        combined = owner_text + " \n " + contact_text

        # Agregados sobre toda la ventana (densidad histórica: documentos, romántico, evento)
        cur.execute(
            f"""SELECT
                  SUM(CASE WHEN is_from_me=1 AND media_type='document' THEN 1 ELSE 0 END) AS owner_docs,
                  SUM(CASE WHEN is_from_me=0 THEN 1 ELSE 0 END) AS contact_msgs,
                  SUM(CASE WHEN {rom_sql} THEN 1 ELSE 0 END) AS rom,
                  SUM(CASE WHEN {evt_sql} THEN 1 ELSE 0 END) AS evt
                FROM messages WHERE chat_jid = ? AND substr(timestamp,1,19) >= ?""",
            (*ROMANTIC, *EVENT, ch["jid"], window_cut),
        )
        agg = cur.fetchone()
        owner_docs = agg["owner_docs"] or 0
        contact_msgs = agg["contact_msgs"] or 0
        rom = agg["rom"] or 0
        evt = agg["evt"] or 0

        # --- Features (el token de empresa se calcula primero: protege del override) ---
        company_token, token_text = detect_company_token(ch["name"])
        selling, sell_kw, sell_hits = owner_selling(owner_text)

        # --- Overrides por densidad. Un chat con token de empresa (el dueño lo calificó)
        # NUNCA se descarta por menciones personales incidentales (boda de un tercero,
        # un "cariño" suelto). Solo matan chats claramente personales (nivel Laura). ---
        override = None
        if not company_token:
            if any(j in contact_text for j in JOBSEEKER):
                override = "jobseeker"
            elif rom >= 8 or (contact_msgs > 0 and rom / contact_msgs >= 0.10):
                override = "romantic"
            elif evt >= 5:
                override = "event"
        if override:
            skipped += 1
            continue
        ci, ci_kw = best_level(contact_text, INTENTION)
        cn, cn_kw = need_level(contact_text)
        reciprocity = selling and ci >= 18

        # --- Mapeo a las 5 dimensiones (el desglose del doc) ---
        authority = best_level(ch["name"].lower() + " " + contact_text, AUTHORITY)[0]
        if company_token:
            authority += 12
        if authority == 0 and (ci >= 18 or cn > 0 or selling):
            authority = 6
        authority = min(20, authority)

        intention = ci + (20 if selling else 0) + (10 if (selling and owner_docs >= 1) else 0)
        intention = min(35, intention)

        need = min(20, cn + (7 if selling else 0))
        urgency = best_level(combined, URGENCY)[0]
        budget = best_level(combined, BUDGET)[0]

        base = authority + intention + need + urgency + budget
        if base < MIN_BASE:
            continue

        last_day = (ch["last_ts"] or "")[:10]
        try:
            dsl = (now - datetime.strptime(last_day, "%Y-%m-%d")).days
        except Exception:
            dsl = 0
        factor = recency_factor(dsl)
        final = max(0, min(100, round(base * factor)))
        temp = "hot" if (final >= 70 and intention >= 28) else "warm" if final >= 40 else "cold"

        # Razón legible desde señales
        parts = []
        if company_token:
            parts.append(f"Empresa: {token_text}")
        if selling:
            parts.append(f"Operador vendiendo ({sell_kw} señales)")
        if owner_docs >= 1 and selling:
            parts.append(f"propuesta/JD enviada ({owner_docs})")
        if ci >= 18:
            parts.append("el contacto pide info/acción")
        if reciprocity:
            parts.append("reciprocidad")
        reason = " · ".join(parts) if parts else "Señal de negocio débil."

        phone = "+" + "".join(c for c in ch["jid"].split("@")[0] if c.isdigit())
        candidates.append({
            "name": ch["name"],
            "phone": phone,
            "chatJid": ch["jid"],
            "score": final,
            "temperature": temp,
            "reason": reason,
            "nextAction": (
                "Responder hoy: oportunidad activa." if temp == "hot"
                else "Dar seguimiento esta semana." if temp == "warm"
                else "Nutrir; señal débil o antigua."
            ),
            "lastMessageAt": (ch["last_ts"] or "").replace(" ", "T")[:25] or None,
            "breakdown": {
                "intention": intention, "authority": authority, "need": need,
                "urgency": urgency, "budget": budget, "base": base, "factor": factor,
                "signals": {
                    "companyToken": company_token, "companyTokenText": token_text,
                    "ownerSelling": selling, "ownerSellKw": sell_kw,
                    "docsSent": owner_docs, "reciprocity": reciprocity,
                    "contactIntent": ci, "override": None,
                },
            },
        })

    conn.close()
    candidates.sort(key=lambda c: -c["score"])
    candidates = candidates[:120]

    if not candidates:
        log(f"No se detectaron candidatos (descartados por override: {skipped}).")
        return 0

    body = json.dumps(candidates).encode("utf-8")
    req = urllib.request.Request(
        f"{CRM_URL}/api/whatsapp/candidates",
        data=body, headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            resp = json.loads(r.read().decode("utf-8"))
        hot = sum(1 for c in candidates if c["temperature"] == "hot")
        warm = sum(1 for c in candidates if c["temperature"] == "warm")
        cold = sum(1 for c in candidates if c["temperature"] == "cold")
        log(f"Ingresados {resp.get('ingested', len(candidates))} candidatos "
            f"(hot={hot}, warm={warm}, cold={cold}; descartados por override={skipped}).")
    except Exception as e:
        log(f"Error al ingresar candidatos: {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

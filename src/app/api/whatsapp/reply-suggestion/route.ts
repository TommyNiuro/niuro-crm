import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dbExists, getMessages } from "@/lib/whatsapp";
import { scoreLead } from "@/lib/score-lead";
import { getRubricConfig } from "@/lib/score-lead-server";
import { runClaude, FAST_MODEL } from "@/lib/claude-subprocess";
import { STAGES } from "@/lib/crm-ui";
import { getOperator } from "@/lib/operator";
import type { Temperature } from "@/types";

interface Body {
  chatJid?: string;
  stage?: string;
  temperature?: Temperature;
  contactId?: string | null;
}

const STAGE_PLAYS: Record<string, { hot: string[]; warm: string[]; cold: string[] }> = {
  Prospecto: {
    hot: [
      "Te leo. Mira, lo que hacemos es bajar a un equipo senior de LATAM en 2 semanas, ya pre-vetted. ¿Te suma una llamada de 20 min mañana para entender qué necesitas y armar la primera tanda de perfiles?",
      "Gracias por escribir. Para no marearte con material, ¿agendamos 20 min esta semana? Cuéntame el rol y la urgencia y voy directo a perfiles.",
    ],
    warm: [
      "Hola, gracias por escribir. ¿Te tinca una llamada corta esta semana para ver si te calzamos? Cuéntame qué rol estás tratando de cubrir y cuándo necesitas que arranque.",
      "Te leo. Para no irnos por las ramas, ¿qué rol específico estás buscando y para cuándo? Con eso te digo en 24h si te puedo bajar 2-3 perfiles.",
    ],
    cold: [
      `Hola, ¿qué tal? Soy {{name}} de {{company}}, bajamos ingenieros senior de LATAM para startups. Si en algún momento necesitas sumar gente al equipo, escríbeme y vemos. Sin apuro.`,
      "Hola. Te dejo abierta la puerta: si te toca contratar tech, podemos bajar perfiles pre-vetted en 2 semanas. Cualquier cosa me escribes.",
    ],
  },
  Discovery: {
    hot: [
      "Genial. Para cerrar el Discovery, ¿me confirmas el stack exacto, la senioridad y cuándo necesitas que arranque? Con eso te bajo perfiles en 48h.",
      "Listo, lo tengo. Antes de mandar perfiles, ¿el presupuesto target por dev mensual ya lo tienes mapeado o lo afinamos juntos?",
    ],
    warm: [
      "Cuéntame un poco más: ¿qué dolor estás resolviendo con esta contratación y qué pasa si no lo cubres este trimestre? Con eso aterrizo bien la propuesta.",
      "Para no dispararle a ciegas, ¿me cuentas la urgencia y el stack que necesitas? Si tienes una JD a mano me la pasas y avanzo.",
    ],
    cold: [
      "Hola, retomo. ¿Sigue en pie lo que conversamos o lo movieron de prioridad? Sin presión, solo para saber dónde estamos.",
    ],
  },
  Propuesta: {
    hot: [
      "Hola, paso a dar seguimiento a la propuesta que te mandé. ¿La pudiste revisar? Cualquier ajuste lo movemos al toque.",
      "Quería ver si ya pudiste revisar la propuesta. Si hay algo que ajustar de stack, ramp-up o tarifa, dime y te paso la versión corregida hoy.",
    ],
    warm: [
      "Hola, ¿pudiste revisar la propuesta? Si necesitas que se la presente a alguien más del equipo (técnico o finanzas), me dices y agendamos.",
    ],
    cold: [
      "Hola, ¿la propuesta sigue en evaluación o cambió la prioridad? Si quedó pausada, dime y te escribo en 30 días sin molestar.",
    ],
  },
  Perfil: {
    hot: [
      "Te mando 2 perfiles que calzan con lo que conversamos. Los miras y me dices con cuál arrancamos entrevistas esta semana.",
      "Tengo perfiles listos. ¿Te paso 2 ahora o esperamos a tener 3 para que tengas con qué comparar?",
    ],
    warm: [
      "Hola, ¿alcanzaste a mirar los perfiles que te mandé? Si necesitas otra mirada (más senior, otro stack), dime y te paso 1-2 más.",
    ],
    cold: [
      "¿Quedó dormido el proceso de perfiles? Si la prioridad cambió, dime y los archivo; si sigue activo, te bajo perfiles frescos.",
    ],
  },
  Entrevistas: {
    hot: [
      "¿Cómo te quedó la entrevista con el candidato? Si te tinca, avanzamos al técnico esta semana; si no, te bajo otro perfil mañana.",
    ],
    warm: [
      "Hola, ¿cómo te fue con las entrevistas? Si necesitas feedback nuestro de algún candidato, dime y te lo paso.",
    ],
    cold: [
      "Retomo: ¿siguieron las entrevistas o quedó pausado? Si quedó frío, dime y te escribo en un par de semanas.",
    ],
  },
  Cierre: {
    hot: [
      "Te mando el contrato hoy. ¿Lo firmas con DocuSign o prefieres PDF? Onboarding lo arrancamos el lunes.",
      "Listo para cerrar. ¿Confirmas la fecha de inicio y a quién le mando el contrato del lado de ustedes?",
    ],
    warm: [
      "¿En qué quedó el contrato? Si hay algo trabado por el lado legal o de procurement, dime y te ayudo a destrabar.",
    ],
    cold: [
      "Hola, paso a ver cómo va el cierre. Si lo movieron a Q siguiente, dime y te escribo más adelante sin agobiar.",
    ],
  },
  Expansion: {
    hot: [
      "Hola, paso a saludar. ¿Cómo viene el equipo en estos 30 días? Si necesitas sumar otro perfil, dime y lo arranco esta semana.",
    ],
    warm: [
      "¿Cómo va el equipo? Si necesitas sumar otro perfil para el próximo sprint, dime y bajo perfiles antes que se te tape la agenda.",
    ],
    cold: [
      "Hola, paso a saludar. Cualquier movimiento del equipo o necesidad nueva, ya sabes dónde encontrarme.",
    ],
  },
};

const DEFAULT_PLAYS = {
  hot: ["Te leo. ¿Te tinca una llamada corta esta semana para entender qué necesitas y ver si calzamos?"],
  warm: ["Gracias por escribir. Para no marearte, cuéntame qué estás tratando de resolver y vemos si te ayudo."],
  cold: ["Hola, ¿qué tal? Si en algún momento necesitas sumar tech senior al equipo, escríbeme y vemos. Sin apuro."],
};

function pick<T>(arr: T[], seed: number): T {
  if (!arr.length) throw new Error("empty pool");
  return arr[Math.abs(seed) % arr.length];
}

async function generateAISuggestion(opts: {
  chatJid: string;
  contactName: string | null;
  company: string | null;
  stage: string;
  temperature: Temperature;
  score: number | null;
}): Promise<string | null> {
  if (!dbExists()) return null;
  const operator = getOperator();
  // 40 (antes 15): con 15 mensajes la IA no tenía el tono ni la historia de la
  // relación, y las sugerencias salían genéricas de vendedor.
  const msgs = getMessages({ chatJid: opts.chatJid, limit: 40 });
  if (!msgs.length) return null;

  const transcript = msgs
    .map((m) => `${m.isFromMe ? operator.name : opts.contactName || "Lead"}: ${m.content?.trim() || `[${m.mediaType}]`}`)
    .join("\n");

  // Contexto temporal: la sugerencia DEBE saber cuánto pasó desde el último
  // mensaje y quién habló último. Sin esto, la IA continuaba la conversación
  // "como si nada" después de semanas, sin saludar ni re-abrir.
  const last = msgs[msgs.length - 1];
  const lastTs = last?.timestamp ? new Date(last.timestamp) : null;
  const hoursSince = lastTs ? Math.max(0, (Date.now() - lastTs.getTime()) / 3600000) : null;
  const sameDay = lastTs ? lastTs.toDateString() === new Date().toDateString() : false;
  const gapDesc =
    hoursSince == null ? "desconocido"
    : sameDay ? `hoy mismo (hace ${Math.round(hoursSince)}h)`
    : hoursSince < 48 ? "ayer"
    : hoursSince < 24 * 14 ? `hace ${Math.round(hoursSince / 24)} días`
    : `hace ${Math.round(hoursSince / 24 / 7)} semanas`;
  const lastSpeaker = last?.isFromMe ? `${operator.name} (sin respuesta del contacto)` : "el contacto";

  const prompt = `Eres ${operator.name}, de ${operator.company} (${operator.pitch}).

Contexto del prospecto:
- Nombre: ${opts.contactName || "desconocido"}
- Empresa: ${opts.company || "desconocida"}
- Etapa del pipeline: ${opts.stage}
- Temperatura: ${opts.temperature}${opts.score != null ? ` (score ${opts.score}/100)` : ""}
- Último mensaje: ${gapDesc}. Habló último: ${lastSpeaker}.

Ultimos mensajes de la conversacion:
${transcript}

Escribe el proximo mensaje que ${operator.name} deberia enviar por WhatsApp.

REGLA DE TIEMPO (obligatoria, según "Último mensaje"):
- Hoy mismo: continúa la conversación natural, sin volver a saludar.
- Ayer o más: abre saludando breve ("Hola ${opts.contactName?.split(" ")[0] || "!"}, ¿cómo va?") y reconecta con el ÚLTIMO TEMA antes de avanzar. NUNCA sigas como si la charla fuera de hoy.
- Semanas o más: es una re-apertura, no un seguimiento. Saluda, referencia lo que quedó pendiente CON LAS PALABRAS DEL CONTACTO, y aporta algo nuevo (novedad, perfil disponible, caso, idea) que justifique escribir. Jamás un "¿pudiste verlo?" pelado.

REGLAS DE HUMANIDAD (las más importantes: un mensaje que suena a vendedor genérico es un mensaje FALLIDO):
- ESPEJÁ el registro del contacto: si escribe informal con modismos, vos también; si usa emojis, usá 1 (el mismo estilo); si es seco y formal, andá al grano sin confianzudeces. Copiale el "vos/tú/usted" que él use.
- Reconocé lo EMOCIONAL antes de lo comercial: si contó algo personal (viaje, hijo, logro, problema, chiste), tu primera frase reacciona a ESO como lo haría un conocido real. Recién después viene el negocio, si corresponde.
- Usá las palabras DE ÉL: nombres propios, apodos, términos que usó. Nada de plantilla.
- Longitud espejo: si él escribe 1 línea, no le mandes un párrafo.
- SI LA CONVERSACIÓN ES PERSONAL (familia, amigos, hobby, cero señal de negocio): la sugerencia es un mensaje cálido de persona a persona. PROHIBIDO meter venta, agenda o perfiles. Respondé como ${operator.name} humano, no como ${operator.company}.

REGLAS DE VENTA (solo si la conversación ES de negocio, estilo ${operator.company}):
- Cero desesperación: tono de quien tiene agenda llena. No ruegues, no presiones, no te disculpes por escribir.
- Personaliza con lo que el contacto DIJO (su rol, su dolor, sus palabras). Nada genérico.
- Si ${operator.name} habló último y no respondieron: NO repitas lo mismo; cambia de ángulo o aporta valor nuevo.
- Si preguntan precio en seco: no lo des pelado; ancla valor en una frase y haz UNA pregunta para dimensionar (rol/seniority/cuándo), o da rango con opciones.
- Si el deal está avanzado (Propuesta en adelante) o el contacto está caliente: propone una llamada corta con día concreto, no más chat.
- Cierra SIEMPRE con UNA sola pregunta concreta o paso accionable (nunca dos).
- Prohibido: "¿pudiste revisarlo?", "quedo atento", "no quiero molestar", presión falsa de escasez.

Reglas de voz:
- Tuteo directo, sin formalidades. Máximo 3 oraciones.
- Sin guion largo (—), sin palabras relleno (adicionalmente, crucial, transformador)
- Sin emojis excesivos. En español con acentos.

Devuelve SOLO el texto del mensaje, sin comillas ni explicacion.`;

  try {
    const result = await runClaude(prompt, {
      model: FAST_MODEL,
      // 90s (antes 45): haiku por subprocess tarda 50-60s seguido; cortar antes
      // hacía caer al fallback de plantillas genéricas, que es justo lo que no
      // queremos mostrar cuando hay contexto real para personalizar.
      timeoutMs: 90_000,
    });
    const text = result.trim();
    return text.length > 10 ? text : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { chatJid, contactId } = body;
  let stage = body.stage;
  let temperature: Temperature = body.temperature || "cold";
  let contactName: string | null = null;
  let company: string | null = null;
  let score: number | null = null;

  if (contactId) {
    const c = db.select().from(contacts).where(eq(contacts.id, contactId)).get();
    if (c) {
      stage = c.stage;
      temperature = (c.temperature as Temperature) || temperature;
      contactName = c.name;
      company = c.company ?? null;
      score = c.score ?? null;
    }
  }

  if (!stage && chatJid && dbExists()) {
    try {
      const msgs = getMessages({ chatJid, limit: 40 });
      if (msgs.length) {
        const sl = scoreLead(
          msgs.map((m) => ({ content: m.content, isFromMe: m.isFromMe, timestamp: m.timestamp, mediaType: m.mediaType })),
          null,
          { rubric: getRubricConfig() }
        );
        temperature = sl.temperature;
      }
    } catch {
      // ignorar; cae a defaults
    }
    stage = "Prospecto";
  }

  const stageKey = stage && (STAGES as readonly string[]).includes(stage) ? stage : "Prospecto";

  // Intentar sugerencia IA primero
  if (chatJid) {
    const aiSuggestion = await generateAISuggestion({
      chatJid,
      contactName,
      company,
      stage: stageKey,
      temperature,
      score,
    });
    if (aiSuggestion) {
      return NextResponse.json({
        suggestion: aiSuggestion,
        mode: "ai",
        stage: stageKey,
        temperature,
      });
    }
  }

  // Fallback a reglas si IA falla o no hay chatJid
  const pool = STAGE_PLAYS[stageKey] || DEFAULT_PLAYS;
  const tempPool = pool[temperature] || pool.warm || DEFAULT_PLAYS.warm;
  const seed = (chatJid || "x").length + (Date.now() % 13);
  const op = getOperator();
  const text = pick(tempPool, seed)
    .replace(/\{\{name\}\}/g, op.name)
    .replace(/\{\{company\}\}/g, op.company);

  return NextResponse.json({
    suggestion: text,
    mode: "rules",
    stage: stageKey,
    temperature,
  });
}

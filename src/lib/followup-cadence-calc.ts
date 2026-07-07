/**
 * Lógica pura de cadencia de seguimiento (Agenda). Sin DB: el motor
 * (scripts/followup-cadence.ts) y los tests la comparten.
 */
export const MAX_TOUCHES = 5;
const DAY = 86400000;

// Título por número de toque — encode el playbook para que la Agenda te diga
// exactamente QUÉ hacer, no solo "dar seguimiento".
export function touchTitle(n: number): string {
  switch (n) {
    case 1: return "Seguimiento 1: retomar por WhatsApp con valor nuevo (no '¿pudiste verlo?')";
    case 2: return "Seguimiento 2: cambiar de ángulo, no repetir el mensaje anterior";
    case 3: return "Seguimiento 3: COMBO llamada corta + WhatsApp si no contesta";
    case 4: return "Seguimiento 4: enviar caso de éxito o perfil concreto que le calce";
    default: return "Seguimiento 5 (último): mensaje de cierre, si no responde marcar Lead perdido";
  }
}

/** last_interaction_at puede venir en segundos (10 dígitos) o ms (más dígitos). */
export function toMillis(unixValue: number): number {
  return String(unixValue).length <= 10 ? unixValue * 1000 : unixValue;
}

export function computeNextTouch(input: {
  hasIncomingMsg: boolean; // el contacto habló último y no se le respondió
  baseTs: number; // ms: último mensaje saliente o última interacción registrada
  prevTouches: number;
  now: number; // ms
}): { title: string; dueAt: number; touch: number | null } {
  if (input.hasIncomingMsg) {
    // El contacto habló último: responder HOY, no cuenta como toque de cadencia.
    return { title: "", dueAt: input.now, touch: null };
  }
  const touch = Math.min(MAX_TOUCHES, input.prevTouches + 1);
  // Gap incremental: toque n vence n días después del último contacto,
  // pero nunca en el pasado (si ya pasó, vence hoy).
  const dueAt = Math.max(input.now, input.baseTs + touch * DAY);
  return { title: touchTitle(touch), dueAt, touch };
}

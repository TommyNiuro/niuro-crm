/**
 * src/lib/proposals-ai/voice.ts · Voz Niuro por default
 *
 * Port literal de NIURO_VOICE (propuestas-niuro/src/lib/ai/voice-prompt.ts).
 *
 * En propuestas-niuro la voz era configurable por organizacion (tabla
 * organizations.voice_rules en Postgres, con cache Redis). Este CRM no
 * tiene multi-org ni esa tabla, asi que aqui la voz es una constante: la voz
 * Niuro hardcodeada que el origen usaba como fallback. getVoiceRules queda como
 * helper sincrono que siempre la devuelve, para mantener la firma de los
 * builders ({system, user} = builder(proposal, voiceRules)).
 *
 * NO TOCAR el texto sin testear 3 propuestas reales: afecta cada generacion de
 * cards/summary.
 */

export const NIURO_VOICE = `Voz Niuro (no negociable):
- Primera persona plural: nosotros, nuestro equipo, proponemos.
- Tono founder a founder, cercano, directo. Vulnerable cuando cabe.
- Tuteo siempre. Nombre de pila.
- NUNCA uses: guion largo (—), potenciar, robusto, transformador, seamless, sinergias, crucial, fundamental, panorama, llevar al siguiente nivel, adicionalmente, leverage, empower, en resumen, profundamente, sin lugar a dudas, soluciones innovadoras, outsourcing, reclutamiento, reclutador.
- Cards: máximo 32 palabras y 2 frases.
- Si falta un dato, escribe "Pendiente por confirmar". NUNCA inventes datos.
- Staff Aug: la clausula de incorporacion directa al payroll (absorcion) es 17% del valor anualizado, PAGO UNICO (sin cuotas). Solo se incluye si el cliente la pidio explicitamente.`;

/**
 * Devuelve el snippet de voz para inyectar en el system prompt.
 * En este repo siempre es NIURO_VOICE (no hay voz por org). Se mantiene como
 * funcion para que los callers no dependan de la constante directamente y un
 * futuro refactor a voz configurable no rompa firmas.
 */
export function getVoiceRules(): string {
  return NIURO_VOICE;
}

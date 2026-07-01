/**
 * Validación de URLs configurables por usuario antes de usarlas como destino
 * de fetch() en el servidor (defensa contra SSRF). Chequeo por string del
 * hostname, sin resolución DNS: no cubre DNS rebinding, pero cierra el ataque
 * simple de apuntar directo a un rango privado/localhost/metadata.
 */
const PRIVATE_OR_LOOPBACK_RE =
  /^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$)|^172\.(1[6-9]|2\d|3[01])\.|^(\[?::1\]?|localhost)$/i;

const LOOPBACK_RE = /^(127\.0\.0\.1|localhost|\[?::1\]?)$/i;

// Solo el rango de metadata de nube (AWS/GCP/Azure sirven credenciales ahi) —
// el ataque SSRF clasico. NO bloquea localhost ni redes privadas: a diferencia
// de un workflow step (destino elegido por texto libre/IA), esto es para un
// usuario apuntando a su propia segunda instancia (ej. localhost:3001 o un
// server en su LAN), un destino legitimo y esperado.
const METADATA_RE = /^169\.254\./;

function parseHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`URL insegura: protocolo no permitido (${url.protocol})`);
  }
  return url;
}

/** Para destinos externos configurables (ej. steps de workflow): bloquea red interna. */
export function assertPublicHttpUrl(raw: string): URL {
  const url = parseHttpUrl(raw);
  if (PRIVATE_OR_LOOPBACK_RE.test(url.hostname)) {
    throw new Error(`URL insegura: destino privado/local no permitido (${url.hostname})`);
  }
  return url;
}

/** Para destinos que SIEMPRE deben ser localhost (ej. el bridge de WhatsApp). */
export function assertLoopbackHttpUrl(raw: string): URL {
  const url = parseHttpUrl(raw);
  if (!LOOPBACK_RE.test(url.hostname)) {
    throw new Error(`Debe correr en localhost (recibido: ${url.hostname})`);
  }
  return url;
}

/** Para una segunda instancia propia del usuario (ej. crm_sync_url): localhost
 * y red local son destinos legítimos, solo bloquea el endpoint de metadata. */
export function assertUserInstanceUrl(raw: string): URL {
  const url = parseHttpUrl(raw);
  if (METADATA_RE.test(url.hostname)) {
    throw new Error(`URL insegura: destino de metadata no permitido (${url.hostname})`);
  }
  return url;
}

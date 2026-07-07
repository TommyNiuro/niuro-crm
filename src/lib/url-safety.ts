/**
 * Validación de URLs configurables por usuario antes de usarlas como destino
 * de fetch() en el servidor (defensa contra SSRF). Chequeo por string del
 * hostname, sin resolución DNS: no cubre DNS rebinding, pero cierra el ataque
 * simple de apuntar directo a un rango privado/localhost/metadata.
 */
import net from "node:net";

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

// Bloquea host privado/local cubriendo las codificaciones que evaden el regex
// dotted: entero decimal (2130706433 = 127.0.0.1), hex (0x7f000001), octal, e
// IPv6 (::1, ::ffff:127.x mapeadas, link-local fe80::, ULA fc00::/7). NO resuelve
// DNS: el DNS rebinding sigue fuera de alcance (documentado).
function isBlockedPublicHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost") return true;
  if (/^0x[0-9a-f]+$/.test(h)) return true; // hex
  if (/^0[0-7]+$/.test(h)) return true; // octal
  if (/^\d+$/.test(h)) return true; // entero decimal (nunca es un host público legítimo)
  if (net.isIP(h) === 6) {
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true; // link-local / ULA
    const mapped = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return PRIVATE_OR_LOOPBACK_RE.test(mapped[1]);
    return false;
  }
  return PRIVATE_OR_LOOPBACK_RE.test(h);
}

/** Para destinos externos configurables (ej. steps de workflow): bloquea red interna. */
export function assertPublicHttpUrl(raw: string): URL {
  const url = parseHttpUrl(raw);
  if (isBlockedPublicHost(url.hostname)) {
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

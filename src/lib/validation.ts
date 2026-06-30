import { z } from "zod";

// Schemas de validacion para rutas de escritura (auditoria 2026-06-29).
// Trust boundary: el body del request es input no confiable. POST exige los
// campos minimos; PUT es .partial() (edicion inline manda un solo campo).
// Los .max() evitan blobs gigantes; los numeros se coercionan desde string.

const optionalText = z.string().max(2000).nullish();

export const contactCreateSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(200),
  email: z.string().max(320).nullish(),
  phone: z.string().max(40).nullish(),
  company: z.string().max(200).nullish(),
  source: z.string().max(50).optional(),
  temperature: z.enum(["hot", "warm", "cold"]).optional(),
  score: z.coerce.number().int().min(0).max(100).optional(),
  notes: optionalText,
});

// PUT de contacto: todos opcionales (edicion parcial). Solo tipa/limita lo que
// la ruta ya whitelistea; campos extra se ignoran (la ruta cherry-pickea).
export const contactUpdateSchema = contactCreateSchema
  .partial()
  .extend({
    country: z.string().max(120).nullish(),
    channel: z.string().max(50).optional(),
    probability: z.coerce.number().int().min(0).max(100).optional(),
    valueCents: z.coerce.number().int().min(0).optional(),
    nextAction: optionalText,
    agentId: z.string().max(100).nullish(),
    archived: z.boolean().optional(),
    disqualifyReason: optionalText,
    stage: z.string().max(100).optional(),
    tags: z.union([z.array(z.string().max(100)), z.string().max(2000)]).nullish(),
    deletedAt: z.null().optional(), // papelera: solo se admite restaurar (null) por PUT
  });

export const dealCreateSchema = z.object({
  title: z.string().min(1, "El titulo es requerido").max(300),
  contactId: z.string().min(1, "El contacto es requerido").max(100),
  value: z.coerce.number().int().min(0).optional(),
  stageId: z.string().max(100).optional(),
  expectedClose: z.union([z.string(), z.number()]).nullish(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  notes: optionalText,
});

export const dealUpdateSchema = dealCreateSchema.partial().extend({
  deletedAt: z.null().optional(), // papelera: restaurar (null) por PUT
});

export const companyCreateSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(200),
  domain: z.string().max(200).nullish(),
  industry: z.string().max(120).nullish(),
  size: z.string().max(60).nullish(),
  country: z.string().max(120).nullish(),
  linkedin: z.string().max(300).nullish(),
  notes: optionalText,
});

// PUT de empresa: edición parcial (la edición inline manda un solo campo).
export const companyUpdateSchema = companyCreateSchema.partial().extend({
  archived: z.boolean().optional(),
  deletedAt: z.null().optional(), // papelera: restaurar (null) por PUT
});

/**
 * Corre un schema sobre el body. Devuelve { data } o { error } con el primer
 * mensaje legible para responder 400. No lanza.
 */
export function validate<T>(
  schema: z.ZodType<T>,
  body: unknown
): { ok: true; data: T } | { ok: false; error: string } {
  const r = schema.safeParse(body);
  if (r.success) return { ok: true, data: r.data };
  const first = r.error.issues[0];
  return { ok: false, error: first?.message ?? "Datos invalidos" };
}

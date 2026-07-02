import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const contacts = sqliteTable("contacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  source: text("source").notNull().default("otro"),
  contactType: text("contact_type").notNull().default("lead"), // 'lead' | 'engineer'
  temperature: text("temperature").notNull().default("cold"),
  score: integer("score").notNull().default(0),
  notes: text("notes"),
  whatsappJid: text("whatsapp_jid"), // enlace a la conversación de WhatsApp (chat_jid del puente)
  // --- Modelo del prototipo (chat-centric) ---
  stage: text("stage").notNull().default("Prospecto"),
  channel: text("channel").notNull().default("whatsapp"),
  probability: integer("probability").notNull().default(0),
  valueCents: integer("value_cents").notNull().default(0),
  country: text("country"),
  tags: text("tags"), // JSON array de strings
  agentId: text("agent_id"),
  nextAction: text("next_action"),
  nextStepDue: integer("next_step_due", { mode: "timestamp" }),
  online: integer("online", { mode: "boolean" }).notNull().default(false),
  lastInteractionAt: integer("last_interaction_at", { mode: "timestamp" }),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  deletedAt: integer("deleted_at", { mode: "timestamp" }), // papelera (soft delete): null = vivo
  disqualifyReason: text("disqualify_reason"),
  scoreBreakdown: text("score_breakdown"), // JSON {intencion,autoridad,necesidad,urgencia,presupuesto,signals,...}
  jobDescription: text("job_description"), // descripción de cargo / requerimiento extraído de la conversación
  salesIntel: text("sales_intel"), // JSON: brief de venta IA {painPoints,budgetSignal,decisionMaker,keyObjections,openQuestions,responseStrategy,salesSignals,objectionHandling,competitor,stageMismatch,stack,seniority,urgency,headcount,updatedAt}
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Empresas / Organizaciones (objeto core estilo Twenty). Normaliza el texto libre
// contacts.company; el detalle relaciona contactos y deals por nombre (case-insensitive).
export const companies = sqliteTable("companies", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  domain: text("domain"), // web / dominio
  industry: text("industry"),
  size: text("size"), // banda de empleados (1-10, 11-50, 51-200, ...)
  country: text("country"),
  linkedin: text("linkedin"),
  notes: text("notes"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  deletedAt: integer("deleted_at", { mode: "timestamp" }), // papelera (soft delete): null = vivo
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Tareas obligatorias del playbook (ejecución con fecha).
export const tasks = sqliteTable("tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contactId: text("contact_id").notNull(),
  title: text("title").notNull(),
  stepName: text("step_name"), // etapa que la disparó
  dueAt: integer("due_at", { mode: "timestamp" }),
  status: text("status").notNull().default("open"), // open | completed | cancelled
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Transiciones entre etapas (para analítica de embudo).
export const stepTransitions = sqliteTable("step_transitions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contactId: text("contact_id").notNull(),
  fromStep: text("from_step"),
  toStep: text("to_step").notNull(),
  durationDays: integer("duration_days"),
  occurredAt: integer("occurred_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// --- Equipo de ventas ---
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("Sales"),
  color: text("color").notNull().default("#10b981"),
  email: text("email"),
  online: integer("online", { mode: "boolean" }).notNull().default(false),
});

// --- Agenda ---
export const events = sqliteTable("events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  type: text("type").notNull().default("meeting"), // demo|call|meeting|deal|reminder
  date: text("date").notNull(), // YYYY-MM-DD
  time: text("time"), // HH:MM
  contactId: text("contact_id"),
  agentId: text("agent_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// --- Automatizaciones ---
export const automations = sqliteTable("automations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  processed: integer("processed").notNull().default(0),
  successPct: integer("success_pct").notNull().default(0),
});

// --- Integraciones ---
export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#10b981"),
  connected: integer("connected", { mode: "boolean" }).notNull().default(false),
  leads: integer("leads").notNull().default(0),
  lastSync: text("last_sync"),
});

// --- Tickets de soporte ---
export const tickets = sqliteTable("tickets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  code: text("code"), // TK-001
  subject: text("subject").notNull(),
  status: text("status").notNull().default("open"), // open|pending|resolved
  priority: text("priority").notNull().default("medium"), // high|medium|low
  sla: text("sla"),
  agentId: text("agent_id"),
  contactId: text("contact_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// --- Respuestas rápidas ---
export const quickReplies = sqliteTable("quick_replies", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  label: text("label").notNull(),
  text: text("text").notNull(),
});

export const pipelineStages = sqliteTable("pipeline_stages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  color: text("color").notNull().default("#64748b"),
  isWon: integer("is_won", { mode: "boolean" }).notNull().default(false),
  isLost: integer("is_lost", { mode: "boolean" }).notNull().default(false),
});

export const deals = sqliteTable("deals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  value: integer("value").notNull().default(0),
  stageId: text("stage_id")
    .notNull()
    .references(() => pipelineStages.id),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id),
  expectedClose: integer("expected_close", { mode: "timestamp" }),
  probability: integer("probability").notNull().default(0),
  notes: text("notes"),
  deletedAt: integer("deleted_at", { mode: "timestamp" }), // papelera (soft delete): null = vivo
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const activities = sqliteTable("activities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(),
  description: text("description").notNull(),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id),
  dealId: text("deal_id").references(() => deals.id),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const crmSettings = sqliteTable("crm_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Detected lead candidates from WhatsApp (pending review before becoming contacts)
export const leadCandidates = sqliteTable("lead_candidates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  phone: text("phone"),
  chatJid: text("chat_jid").notNull(),
  score: integer("score").notNull().default(0),
  temperature: text("temperature").notNull().default("cold"),
  reason: text("reason"),
  nextAction: text("next_action"),
  breakdown: text("breakdown"), // JSON: {intention,authority,need,urgency,budget,base,factor,signals:{companyToken,ownerSelling,docsSent,reciprocity,override,...}}
  source: text("source").notNull().default("whatsapp"),
  status: text("status").notNull().default("pending"), // pending | approved | dismissed
  contactId: text("contact_id"),
  lastMessageAt: integer("last_message_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Importar leads desde captura: capturas de webs de empresas/startups subidas
// por el operador. La IA (visión) las evalúa como cliente potencial de Niuro, extrae
// datos y las deja en revisión antes de aprobarlas como contacto (Prospecto).
export const imageLeads = sqliteTable("image_leads", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  imagePath: text("image_path").notNull(), // ruta absoluta en data/uploads/
  status: text("status").notNull().default("analyzing"), // analyzing | ready | approved | dismissed
  score: integer("score").notNull().default(0), // 0-100: qué tan buen cliente potencial es (IA)
  company: text("company"),
  whatTheyDo: text("what_they_do"),
  role: text("role"), // rol/cargo que podrían necesitar contratar
  stack: text("stack"), // JSON array de tecnologías detectadas
  seniority: text("seniority"),
  contactEmail: text("contact_email"),
  contactUrl: text("contact_url"),
  contactInfo: text("contact_info"), // teléfono / handle / otro dato de contacto visible
  summary: text("summary"), // resumen ejecutivo IA (por qué es o no cliente potencial)
  notes: text("notes"), // notas editables por el operador
  rawExtract: text("raw_extract"), // JSON completo de la extracción IA (incluye isLead)
  contactId: text("contact_id"), // contacto creado al aprobar
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Propuestas comerciales (portado de propuestas-niuro, Postgres -> SQLite).
// Dos modos: 'staff-aug' (perfil mensual) y 'sprint' (precio cerrado). El
// contenido editorial lo genera la IA y se guarda como JSON serializado en TEXT.
// Los shapes JSON viven en src/types/index.ts (Proposal*).
export const proposals = sqliteTable("proposals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contactId: text("contact_id").references(() => contacts.id),
  dealId: text("deal_id").references(() => deals.id),
  mode: text("mode").notNull(), // 'staff-aug' | 'sprint'
  status: text("status").notNull().default("draft"), // draft|sent|in-review|negotiation|signed|lost|archived
  date: text("date"), // human-readable, ej "Mayo 2026"
  client: text("client").notNull(), // JSON: {name, industry, country, initial?, logoColor?, logoSrc?, website?}
  role: text("role"), // staff-aug: rol exacto con stack
  duration: text("duration"), // sprint: duración total
  transcript: text("transcript"),
  notes: text("notes"),
  pricing: text("pricing"), // JSON discriminado por mode
  summary: text("summary"),
  context: text("context"), // JSON {paragraph, dataPoints}
  cards: text("cards"), // JSON {objective, scope, governance}
  roadmap: text("roadmap"), // JSON ProposalRoadmapPhase[]
  team: text("team"), // JSON ProposalTeamMember[]
  risks: text("risks"), // JSON ProposalRisk[]
  generated: integer("generated", { mode: "boolean" })
    .notNull()
    .default(false),
  priority: text("priority"), // high|medium|low
  // Estado de la generacion IA en background (fire-and-forget + polling):
  // null = manual/migrada, 'generating' = la IA trabaja, 'ready' = lista,
  // 'error' = fallo (detalle en genError). La UI hace polling mientras 'generating'.
  genStatus: text("gen_status"),
  genError: text("gen_error"),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  signedAt: integer("signed_at", { mode: "timestamp" }),
  closedAt: integer("closed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Proposal = typeof proposals.$inferSelect;
export type NewProposal = typeof proposals.$inferInsert;

// Radar de grupos: mensajes en grupos de WhatsApp donde alguien busca talento
// de software que Niuro puede proveer. Detectados por scripts/scan-groups.ts.
export const groupOpportunities = sqliteTable("group_opportunities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  messageId: text("message_id").notNull(),
  chatJid: text("chat_jid").notNull(),
  groupName: text("group_name"),
  sender: text("sender"),
  senderPhone: text("sender_phone"),
  messageAt: text("message_at"), // ISO del mensaje original
  excerpt: text("excerpt").notNull(),
  role: text("role"),
  stack: text("stack"),
  seniority: text("seniority"),
  company: text("company"),
  urgency: text("urgency"),
  score: integer("score").notNull().default(0),
  summary: text("summary"),
  suggestedReply: text("suggested_reply"),
  status: text("status").notNull().default("new"), // new | contacted | discarded
  source: text("source").notNull().default("whatsapp"), // whatsapp | getonboard
  url: text("url"), // link al aviso original (solo fuentes externas)
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Notas genericas por registro del record-view (target_type=objeto, target_id=fila).
export const notes = sqliteTable("notes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  targetType: text("target_type").notNull(), // "contacts" | "deals" | ...
  targetId: text("target_id").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Favoritos fijados (b7): cualquier registro o link arbitrario, mostrado en el
// sidebar. target_type + target_id identifican el registro; href es a dónde lleva.
export const favorites = sqliteTable("favorites", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  targetType: text("target_type").notNull(), // "contacts" | "deals" | ...
  targetId: text("target_id").notNull(),
  label: text("label").notNull(),
  href: text("href").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Archivos adjuntos por registro. path es la ruta absoluta dentro de data/uploads.
export const attachments = sqliteTable("attachments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  path: text("path").notNull(),
  name: text("name").notNull(), // nombre original del archivo
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

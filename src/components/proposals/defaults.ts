/* Contenido fallback cuando la IA aun no genero cards/roadmap/team/risks.
 * Port literal de propuestas-niuro/src/components/proposal/defaults.ts.
 * Se usan para que el preview no quede vacio durante el builder.
 */
import type { Card, RoadmapPhase, TeamMember, ProposalRenderData } from "./render-types";
import { PENDING_LABEL, fmtAmount } from "./utils";

export function defaultObjectiveCardsStaff(clientName: string | undefined): Card[] {
  const name = clientName && clientName.trim() ? clientName : "el negocio";
  return [
    {
      icon: "▤",
      title: `Rol critico para ${name}`,
      body:
        "Buscamos un perfil que entienda el dolor real de negocio y que su trabajo impacte directamente la calidad y velocidad de la operacion. " +
        PENDING_LABEL,
      pill: "Business Critical",
    },
    {
      icon: "✦",
      title: "Seniority con vision de IA aplicada",
      body: "Priorizamos candidatos con base solida en el stack solicitado, pero con criterio para incorporar IA en procesos clave donde tenga sentido de negocio.",
      pill: "AI Readiness",
    },
    {
      icon: "↗",
      title: "Velocidad sin sacrificar validacion",
      body: "Activamos un proceso que combina matching asistido por IA, filtro humano, evaluacion de soft skills y validacion tecnica para shortlistar perfiles en 6 a 10 dias.",
      pill: "Speed",
    },
    {
      icon: "◍",
      title: "Integracion real con el equipo",
      body: "Disenamos el servicio para que el perfil opere como parte del equipo, alineado con stakeholders clave y con la dinamica de trabajo del cliente.",
      pill: "Integration",
    },
  ];
}

export function defaultScopeCardsStaff(): Card[] {
  return [
    {
      icon: "⌁",
      title: "Onboarding de negocio y accesos (30 dias)",
      body: "Alineamos contexto de negocio, stakeholders, herramientas, repositorios y expectativas para que el perfil entre con claridad operativa desde el dia uno.",
    },
    {
      icon: "⌕",
      title: "Discovery tecnico y priorizacion (30 dias)",
      body: "Revisamos arquitectura, deuda tecnica y backlog inmediato, identificando quick wins y definiendo un plan realista de ejecucion.",
    },
    {
      icon: "✳",
      title: "Primeras entregas y validacion (60 dias)",
      body: "Ejecutamos los entregables priorizados con foco en estabilidad y mantenibilidad, incorporando automatizacion donde tenga sentido.",
    },
    {
      icon: "⌘",
      title: "Optimizacion del core tecnico (60 dias)",
      body: "Trabajo directo sobre los componentes criticos del stack, con foco en performance, calidad de codigo y trazabilidad.",
    },
    {
      icon: "◫",
      title: "Estabilizacion operativa y buenas practicas (90 dias)",
      body: "Consolidamos rituales, criterios de calidad y documentacion minima para reducir dependencia tactica y dar previsibilidad al delivery.",
    },
    {
      icon: "↗",
      title: "Visibilidad para decisiones de negocio (90 dias)",
      body: "Dejamos capacidad instalada, claridad sobre el roadmap y una base tecnica mas fuerte para decidir nuevas contrataciones y prioridades.",
    },
  ];
}

export function defaultGovernanceCardsStaff(): Card[] {
  return [
    {
      icon: "⌖",
      title: "Integracion al equipo",
      body: "El perfil opera como parte del equipo, con interaccion directa con los stakeholders clave del cliente.",
      pill: "Internal",
    },
    {
      icon: "◴",
      title: "Cadencia operativa",
      body: "Busqueda con shortlist en 6 a 10 dias y seguimiento semanal de integracion, prioridades y performance para no perder traccion tras la contratacion.",
      pill: "Agile",
    },
    {
      icon: "◔",
      title: "Gobernanza y reporting",
      body: "Visibilidad ejecutiva sobre avance, riesgos y bloqueos. El cliente toma decisiones rapido, con informacion clara y sin perder control del servicio.",
      pill: "Governance",
    },
    {
      icon: "◆",
      title: "Ownership del servicio",
      body: "No nos limitamos a presentar candidatos. Acompanamos la relacion, hacemos seguimiento tecnico y de encaje, y actuamos rapido si vemos senales de desalineacion.",
      pill: "Ownership",
    },
  ];
}

export function defaultRoadmapStaff(): RoadmapPhase[] {
  return [
    {
      period: "Semanas 1-2",
      label: "Onboarding",
      focus: "Contexto, accesos y criterios de trabajo",
      activities: [
        "Alineacion con stakeholders clave y objetivos del rol.",
        "Accesos a herramientas, repositorios, flujos y documentacion.",
        "Confirmacion del esquema operativo esperado.",
      ],
      milestone: "Base operativa alineada",
    },
    {
      period: "Semanas 3-4",
      label: "Discovery",
      focus: "Diagnostico tecnico y priorizacion",
      activities: [
        "Revision de arquitectura y backlog relevante.",
        "Identificacion de quick wins en el stack.",
        "Definicion de plan 30 / 60 / 90 con foco en impacto real.",
      ],
      milestone: "Diagnostico entregado",
    },
    {
      period: "Semanas 5-8",
      label: "Ejecucion",
      focus: "Implementacion y optimizacion",
      activities: [
        "Desarrollo sobre componentes criticos del stack.",
        "Primeras iniciativas de automatizacion.",
        "Seguimiento ejecutivo de riesgos y velocidad.",
      ],
      milestone: "Primer impacto visible",
    },
    {
      period: "Semanas 9-12",
      label: "Stabilization",
      focus: "Consolidacion y siguiente etapa",
      activities: [
        "Documentacion minima, rituales y criterios sostenibles.",
        "Revision del desempeno del perfil.",
        "Definicion del roadmap del siguiente trimestre.",
      ],
      milestone: "Operacion estabilizada",
    },
  ];
}

export function defaultRisksStaff(): Card[] {
  return [
    {
      icon: "✎",
      title: "Alcance poco definido",
      body: '<strong>Mitigacion:</strong> alineamos prioridades desde el inicio, traducimos el dolor de negocio en foco operativo y hacemos seguimiento continuo para que el perfil no se absorba por urgencias desconectadas del objetivo.',
    },
    {
      icon: "⤢",
      title: "Dependencias internas del cliente",
      body: '<strong>Mitigacion:</strong> trabajamos con visibilidad sobre stakeholders, bloqueos y decisiones pendientes para que la persona asignada tenga contexto, capacidad de avanzar y ownership real.',
    },
    {
      icon: "◴",
      title: "Onboarding lento por accesos",
      body: '<strong>Mitigacion:</strong> activamos un checklist de inicio y empujamos la coordinacion de accesos, herramientas y documentacion desde la primera semana.',
    },
    {
      icon: "❞",
      title: "Alineacion cultural y comunicacion",
      body: '<strong>Mitigacion:</strong> filtramos capacidad de comunicacion, seniority y encaje con un entorno donde el rol debe convivir con negocio, producto y operacion.',
    },
  ];
}

export function defaultTeamStaff(proposal: ProposalRenderData): TeamMember[] {
  const { role, client, pricing } = proposal;
  const currency = pricing?.currency ?? "CLP";
  const min = pricing?.monthlyMin;
  const max = pricing?.monthlyMax;
  const isRange = !!(max && min && max !== min && max > min);
  return [
    {
      role: role ?? "Senior Engineer",
      stack: PENDING_LABEL,
      modality: "Full-time dedicado · " + (client?.country ?? PENDING_LABEL),
      responsibilities: [
        "Hacerse cargo end-to-end del rol critico definido con el cliente.",
        "Desarrollar y mantener funcionalidades sobre componentes clave del stack.",
        "Alinear ejecucion con stakeholders y elevar el estandar tecnico del equipo.",
      ],
      valueMain: min ? fmtAmount(min, currency) + " + IVA" : PENDING_LABEL,
      valueMainNote: isRange ? "/ mes (base referencial)" : "/ mes",
      valueAlt: isRange && max ? "Hasta " + fmtAmount(max, currency) + " + IVA" : null,
      valueAltNote: isRange ? "/ mes (para ampliar el pool de perfiles)" : null,
    },
  ];
}

/* ============================================================
   SPRINT defaults
   ============================================================ */
export function defaultObjectiveCardsSprint(): Card[] {
  return [
    {
      icon: "▣",
      title: "Entregables Definidos",
      body: "No pagas por hora ni por perfil mensual; pagas por un proyecto cerrado con entregables y fechas exactas. Hitos claros, precio fijo y total claridad desde el dia uno.",
      pill: "Fixed Price",
    },
    {
      icon: "◫",
      title: "Prioridad tecnica del proyecto",
      body:
        "Convertimos el dolor mas importante del cliente en la prioridad de ejecucion del sprint, con foco en lo que realmente mueve la aguja. " +
        PENDING_LABEL,
      pill: "Priority",
    },
    {
      icon: "✳",
      title: "Diferenciador del sprint",
      body:
        "El equipo esta listo para lo que hace distinto a este proyecto, ya sea integraciones con IA existente, modelos de datos sensibles o restricciones regulatorias. " +
        PENDING_LABEL,
      pill: "Quality",
    },
    {
      icon: "◍",
      title: "Equipo Dedicado al Sprint",
      body: "Asignamos un equipo dedicado al proyecto. Si el alcance crece, el sprint simplemente se extiende. Al finalizar, puedes transicionar a Staff Augmentation sin friccion.",
      pill: "Sprint Team",
    },
  ];
}

export function defaultScopeCardsSprint(): Card[] {
  return [
    {
      icon: "→",
      title: "Setup & Arquitectura (semanas 1-2)",
      body: "Setup de repositorios, CI/CD y ambientes. Definicion de arquitectura, modelo de datos y plan de integracion.",
    },
    {
      icon: "▤",
      title: "Core Backend (30 dias)",
      body: "API principal, auth, RBAC y modelo de datos cifrado. Motor de decision por reglas y logs de trazabilidad.",
    },
    {
      icon: "⌘",
      title: "Frontend + Integraciones (60 dias)",
      body: "UI responsive con flujos principales, pagos, agendamiento y notificaciones. Integraciones externas conectadas.",
    },
    {
      icon: "◧",
      title: "Modulo especifico del cliente (75 dias)",
      body: "Capa diferenciadora del proyecto. " + PENDING_LABEL,
    },
    {
      icon: "✦",
      title: "Funcionalidad diferenciadora (90 dias)",
      body: "Lo que hace unico este sprint: interfaz no-code, sandbox de pruebas o equivalente segun contexto.",
    },
    {
      icon: "◷",
      title: "Deploy + Estabilizacion (90 dias)",
      body: "Optimizacion de infraestructura, auditoria de seguridad y deploy final a produccion con documentacion entregada.",
    },
  ];
}

export function defaultGovernanceCardsSprint(): Card[] {
  return [
    {
      icon: "⌖",
      title: "Integracion al equipo",
      body: "Canales compartidos y KAM dedicado para alinear avance tecnico con objetivos de negocio.",
      pill: "Collaboration",
    },
    {
      icon: "☑",
      title: "Cadencia semanal",
      body: "Check-ins semanales con entregables tangibles, revision de bloqueos y validacion estrategica en lenguaje claro.",
      pill: "Management",
    },
    {
      icon: "⌥",
      title: "Developer senior de apoyo",
      body: "Implementador respaldado por Tech Lead para arquitectura, calidad de codigo e integraciones complejas.",
      pill: "Code Quality",
    },
    {
      icon: "◆",
      title: "Ownership tecnico",
      body: "Niuro asume responsabilidad end-to-end: producto entregado funcionando, documentado y listo para escalar.",
      pill: "Responsibility",
    },
  ];
}

export function defaultRoadmapSprint(): RoadmapPhase[] {
  return [
    {
      period: "Semanas 1-2",
      label: "Onboarding",
      focus: "Setup & Arquitectura",
      activities: [
        "Setup AWS, repositorios, CI/CD, ambientes.",
        "Definicion de arquitectura y modelo de datos.",
        "Pruebas de integracion tempranas con servicios externos.",
      ],
      milestone: "Arquitectura definida",
    },
    {
      period: "Semanas 3-6",
      label: "30 dias",
      focus: "Core Backend",
      activities: [
        "API principal, auth, RBAC.",
        "Modelo de datos y logica de decision.",
        "Logs y trazabilidad.",
      ],
      milestone: "Backend + Decision Engine",
    },
    {
      period: "Semanas 7-10",
      label: "60 dias",
      focus: "Frontend + Integraciones",
      activities: [
        "UI principal y onboarding.",
        "Integraciones externas (pagos, agendamiento, notificaciones).",
        "QA inicial sobre flujo completo.",
      ],
      milestone: "Flujo principal completo",
    },
    {
      period: "Semanas 11-12",
      label: "90 dias",
      focus: "Deploy + Cierre",
      activities: [
        "Optimizacion de infraestructura.",
        "Auditoria de seguridad y reglas criticas.",
        "Deploy final y documentacion.",
      ],
      milestone: "Producto en produccion",
    },
  ];
}

export function defaultRisksSprint(): Card[] {
  return [
    {
      icon: "⤨",
      title: "Cambios drasticos de alcance",
      body: '<strong>Mitigacion:</strong> el modelo Sprint protege fechas y entregables. Si el alcance requiere crecer sustancialmente a mitad del proyecto, documentamos el nuevo requerimiento y extendemos el sprint de manera formal y transparente.',
    },
    {
      icon: "⤢",
      title: "Dependencias tecnicas externas",
      body: '<strong>Mitigacion:</strong> realizamos pruebas de integracion con servicios externos del cliente en las primeras 2 semanas para identificar bloqueos tecnicos tempranos y ajustar la arquitectura a tiempo.',
    },
    {
      icon: "◴",
      title: "Retrasos en accesos (Onboarding)",
      body: '<strong>Mitigacion:</strong> previo al arranque, el KAM coordina el checklist de onboarding para obtener accesos a infraestructura, repositorios y documentacion, garantizando arranque efectivo el dia uno.',
    },
    {
      icon: "◯",
      title: "Alineacion con el negocio",
      body: '<strong>Mitigacion:</strong> el KAM mantiene la perspectiva estrategica para asegurar que las decisiones tecnicas resuelvan problemas reales del cliente, evitando la sobre-ingenieria.',
    },
  ];
}

/* Fallback de equipo sprint SIN datos personales reales. Antes traia nombres y
 * emails concretos (riesgo: enviarlos en una propuesta que no involucra a esas
 * personas). Roles genericos: el equipo real se completa a mano en el editor. */
export function defaultTeamSprint(): TeamMember[] {
  return [
    {
      role: "Implementador Principal",
      responsibilities:
        "Ingeniero senior responsable de la construccion del codigo: Backend, Web Apps, integraciones ML/IA e infraestructura. Lidera la ejecucion tecnica del sprint.",
      participation: "Core Tech",
      participationNote: "Dedicado al desarrollo",
    },
    {
      role: "Tech Lead Interno",
      responsibilities:
        "Soporte tecnico y revision de arquitectura end-to-end. Desbloquea dependencias complejas, audita la calidad del codigo y asegura mejores practicas de seguridad e infraestructura.",
      participation: "Soporte y QA",
      participationNote: "Acompanamiento tecnico",
    },
    {
      role: "Key Account Manager",
      responsibilities:
        "Punto de contacto principal dia a dia para el equipo del cliente. Asegura cumplimiento de tiempos, hitos de pago y fluidez en la comunicacion.",
      participation: "Gestion / KAM",
      participationNote: "Coordinacion de negocio",
    },
  ];
}

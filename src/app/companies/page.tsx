"use client";

import { RecordIndex } from "@/components/record/RecordIndex";
import { companiesConfig } from "@/components/record/configs/companies";

// Empresas / Organizaciones como "record view" estilo Twenty: objeto core del CRM.
// El listado se siembra desde el texto libre contacts.company; el detalle relaciona
// sus contactos y deals por nombre. (FK normalizada: iteración futura.)
export default function EmpresasPage() {
  return <RecordIndex config={companiesConfig} />;
}

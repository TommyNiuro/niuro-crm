"use client";

import { RecordIndex } from "@/components/record/RecordIndex";
import { leadsConfig } from "@/components/record/configs/leads";

export default function WhatsAppLeadsPage() {
  return <RecordIndex config={leadsConfig} />;
}

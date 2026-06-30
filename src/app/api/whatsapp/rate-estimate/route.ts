import { NextRequest, NextResponse } from "next/server";
import { estimateMonthlyRate, findRoleEntry, type Seniority } from "@/lib/rate-cards";

const SENIORITIES: Seniority[] = ["junior", "mid", "senior", "lead", "principal"];

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { role, seniority, headcount } = body as {
    role?: string; seniority?: string | null; headcount?: number;
  };
  if (!role) return NextResponse.json({ estimatedMonthly: null });

  const sen = seniority && SENIORITIES.includes(seniority as Seniority) ? (seniority as Seniority) : null;
  const range = estimateMonthlyRate(role, sen);
  if (!range) return NextResponse.json({ estimatedMonthly: null });

  const hc = Math.max(1, Number(headcount) || 1);
  const entry = findRoleEntry(role);
  return NextResponse.json({
    estimatedMonthly: {
      perPerson: range,
      min: range.min * hc,
      max: range.max * hc,
      role: entry?.role || role,
    },
  });
}

import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";

export async function GET() {
  return NextResponse.json(db.select().from(agents).all());
}

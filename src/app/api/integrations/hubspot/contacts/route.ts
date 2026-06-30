import { NextResponse } from "next/server"
import { listContacts } from "@/lib/hubspot"

export async function GET() {
  if (!process.env.HUBSPOT_API_KEY) {
    return NextResponse.json([])
  }
  try {
    const { contacts } = await listContacts()
    return NextResponse.json(contacts)
  } catch {
    return NextResponse.json([])
  }
}

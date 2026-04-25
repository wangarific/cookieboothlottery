import { ensureDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const db = await ensureDb();
  const { order } = await req.json() as { order: Array<{ id: number; draft_position: number }> };

  const statements = order.map((entry) => ({
    sql: "UPDATE troops SET draft_position = ? WHERE id = ?",
    args: [entry.draft_position, entry.id],
  }));

  await db.batch(statements, "write");

  return NextResponse.json({ ok: true });
}

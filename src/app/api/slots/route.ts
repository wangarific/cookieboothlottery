import { ensureDb } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await ensureDb();
  const result = await db.execute(`
    SELECT ts.*, l.name as location_name, l.address as location_address
    FROM time_slots ts
    JOIN locations l ON l.id = ts.location_id
    ORDER BY ts.date, ts.start_time, l.name
  `);
  return NextResponse.json(result.rows);
}

export async function POST(req: Request) {
  const db = await ensureDb();
  const { location_id, date, start_time, end_time } = await req.json();
  const result = await db.execute({
    sql: "INSERT INTO time_slots (location_id, date, start_time, end_time) VALUES (?, ?, ?, ?)",
    args: [location_id, date, start_time, end_time],
  });
  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

export async function DELETE(req: Request) {
  const db = await ensureDb();
  const { id } = await req.json();
  await db.execute({
    sql: "DELETE FROM time_slots WHERE id = ?",
    args: [id],
  });
  return NextResponse.json({ ok: true });
}

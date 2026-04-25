import { ensureDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const db = await ensureDb();
  const result = await db.execute("SELECT * FROM troops ORDER BY draft_position, name");
  return NextResponse.json(result.rows);
}

export async function POST(req: Request) {
  const db = await ensureDb();
  const { name, leader_name, contact, email } = await req.json();
  const result = await db.execute({
    sql: "INSERT INTO troops (name, leader_name, contact, email) VALUES (?, ?, ?, ?)",
    args: [name, leader_name || "", contact || "", email || ""],
  });
  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

export async function PUT(req: Request) {
  const db = await ensureDb();
  const { id, name, leader_name, contact, email, draft_position, max_one_per_weekend, max_booths, no_same_day, no_same_time } = await req.json();
  await db.execute({
    sql: "UPDATE troops SET name = ?, leader_name = ?, contact = ?, email = ?, draft_position = ?, max_one_per_weekend = ?, max_booths = ?, no_same_day = ?, no_same_time = ? WHERE id = ?",
    args: [name, leader_name || "", contact || "", email || "", draft_position, max_one_per_weekend ?? 0, max_booths ?? 0, no_same_day ?? 0, no_same_time ?? 0, id],
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const db = await ensureDb();
  const { id } = await req.json();
  await db.execute({
    sql: "DELETE FROM troops WHERE id = ?",
    args: [id],
  });
  return NextResponse.json({ ok: true });
}

import { ensureDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const db = await ensureDb();
  const result = await db.execute(`
    SELECT l.*, json_group_array(
      CASE WHEN ts.id IS NOT NULL THEN json_object(
        'id', ts.id, 'date', ts.date, 'start_time', ts.start_time, 'end_time', ts.end_time
      ) ELSE NULL END
    ) as slots
    FROM locations l
    LEFT JOIN time_slots ts ON ts.location_id = l.id
    GROUP BY l.id
    ORDER BY l.name
  `);

  const parsed = result.rows.map((loc) => ({
    ...loc,
    slots: JSON.parse(loc.slots as string).filter((s: unknown) => s !== null),
  }));

  return NextResponse.json(parsed);
}

export async function POST(req: Request) {
  const db = await ensureDb();
  const body = await req.json();
  const { name, address, slots, import_batch } = body;

  const loc = await db.execute({
    sql: "INSERT INTO locations (name, address, import_batch) VALUES (?, ?, ?)",
    args: [name, address || "", import_batch || null],
  });
  const locationId = loc.lastInsertRowid;

  if (slots && Array.isArray(slots)) {
    for (const slot of slots) {
      await db.execute({
        sql: "INSERT INTO time_slots (location_id, date, start_time, end_time) VALUES (?, ?, ?, ?)",
        args: [locationId!, slot.date, slot.start_time, slot.end_time],
      });
    }
  }

  return NextResponse.json({ id: Number(locationId) }, { status: 201 });
}

export async function PUT(req: Request) {
  const db = await ensureDb();
  const { id, name, address } = await req.json();
  await db.execute({
    sql: "UPDATE locations SET name = ?, address = ? WHERE id = ?",
    args: [name, address || "", id],
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const db = await ensureDb();
  const { id, import_batch } = await req.json();
  if (import_batch) {
    await db.execute({
      sql: "DELETE FROM locations WHERE import_batch = ?",
      args: [import_batch],
    });
  } else {
    await db.execute({
      sql: "DELETE FROM locations WHERE id = ?",
      args: [id],
    });
  }
  return NextResponse.json({ ok: true });
}

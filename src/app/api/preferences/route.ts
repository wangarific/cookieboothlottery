import { ensureDb } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = await ensureDb();
  const { searchParams } = new URL(req.url);
  const troopId = searchParams.get("troop_id");

  if (troopId) {
    const result = await db.execute({
      sql: `
        SELECT p.*, ts.date, ts.start_time, ts.end_time, l.name as location_name
        FROM preferences p
        JOIN time_slots ts ON ts.id = p.slot_id
        JOIN locations l ON l.id = ts.location_id
        WHERE p.troop_id = ?
        ORDER BY p.rank
      `,
      args: [Number(troopId)],
    });
    return NextResponse.json(result.rows);
  }

  const result = await db.execute(`
    SELECT p.*, ts.date, ts.start_time, ts.end_time, l.name as location_name, t.name as troop_name
    FROM preferences p
    JOIN time_slots ts ON ts.id = p.slot_id
    JOIN locations l ON l.id = ts.location_id
    JOIN troops t ON t.id = p.troop_id
    ORDER BY p.troop_id, p.rank
  `);
  return NextResponse.json(result.rows);
}

export async function POST(req: Request) {
  const db = await ensureDb();
  const { troop_id, rankings } = await req.json();

  // rankings is an array of slot_ids in order of preference
  const statements = [
    { sql: "DELETE FROM preferences WHERE troop_id = ?", args: [troop_id] },
    ...rankings.map((slotId: number, index: number) => ({
      sql: "INSERT INTO preferences (troop_id, slot_id, rank) VALUES (?, ?, ?)",
      args: [troop_id, slotId, index + 1],
    })),
  ];

  await db.batch(statements, "write");

  return NextResponse.json({ ok: true });
}

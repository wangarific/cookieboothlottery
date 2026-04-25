import { ensureDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const db = await ensureDb();
  const result = await db.execute(`
    SELECT a.*, t.name as troop_name, ts.date, ts.start_time, ts.end_time,
           l.name as location_name, l.address as location_address
    FROM assignments a
    JOIN troops t ON t.id = a.troop_id
    JOIN time_slots ts ON ts.id = a.slot_id
    JOIN locations l ON l.id = ts.location_id
    ORDER BY a.pick_number
  `);
  return NextResponse.json(result.rows);
}

export async function POST(req: Request) {
  const db = await ensureDb();
  const { snake = true } = await req.json().catch(() => ({ snake: true }));

  // Clear existing assignments
  await db.execute("DELETE FROM assignments");

  // Get troops in draft order
  const troopsResult = await db.execute(
    "SELECT * FROM troops WHERE draft_position IS NOT NULL ORDER BY draft_position"
  );
  const troops = troopsResult.rows as unknown as Array<{ id: number; draft_position: number; name: string; max_one_per_weekend: number; max_booths: number; no_same_day: number; no_same_time: number }>;

  if (troops.length === 0) {
    return NextResponse.json(
      { error: "No troops have draft positions assigned" },
      { status: 400 }
    );
  }

  // Get all slots with their dates and times for constraint checking
  const slotsResult = await db.execute("SELECT id, date, start_time, end_time FROM time_slots");
  const allSlots = slotsResult.rows as unknown as Array<{ id: number; date: string; start_time: string; end_time: string }>;
  const slotDateMap = new Map(allSlots.map((s) => [s.id, s.date]));
  const slotInfoMap = new Map(allSlots.map((s) => [s.id, s]));
  const totalSlots = allSlots.length;

  // Get all preferences upfront
  const allPrefsResult = await db.execute("SELECT * FROM preferences ORDER BY troop_id, rank");
  const allPrefs = allPrefsResult.rows as unknown as Array<{ troop_id: number; slot_id: number; rank: number }>;
  const prefsByTroop = new Map<number, Array<{ slot_id: number; rank: number }>>();
  for (const p of allPrefs) {
    const arr = prefsByTroop.get(p.troop_id) || [];
    arr.push({ slot_id: p.slot_id, rank: p.rank });
    prefsByTroop.set(p.troop_id, arr);
  }

  // Returns a weekend key for Fri/Sat/Sun of the same week, or null if the date is Mon-Thu
  function getWeekendKey(dateStr: string): string | null {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay(); // 0=Sun, 5=Fri, 6=Sat
    if (day !== 0 && day !== 5 && day !== 6) return null;
    const friday = new Date(d);
    if (day === 0) friday.setDate(d.getDate() - 2);
    else if (day === 6) friday.setDate(d.getDate() - 1);
    return friday.toISOString().slice(0, 10);
  }

  function timesOverlap(s1Start: string, s1End: string, s2Start: string, s2End: string): boolean {
    return s1Start < s2End && s2Start < s1End;
  }

  const assignedSlots = new Set<number>();
  const assignmentInserts: Array<{ sql: string; args: (string | number)[] }> = [];
  const log: string[] = [];
  const troopWeekends = new Map<number, Set<string>>();
  const troopBoothCount = new Map<number, number>();
  const troopDates = new Map<number, Set<string>>();
  const troopSlots = new Map<number, Array<{ date: string; start_time: string; end_time: string }>>();

  let pickNumber = 0;

  // Run the algorithm entirely in memory
  let round = 0;
  while (assignedSlots.size < totalSlots) {
    round++;
    const orderedTroops = snake && round % 2 === 0 ? [...troops].reverse() : [...troops];

    let anyAssignedThisRound = false;
    for (const troop of orderedTroops) {
      if (assignedSlots.size >= totalSlots) break;

      const boothCount = troopBoothCount.get(troop.id) || 0;
      if (troop.max_booths > 0 && boothCount >= troop.max_booths) {
        log.push(
          `Round ${round}: ${troop.name} (pick #${troop.draft_position}) - passed (reached max of ${troop.max_booths} booth${troop.max_booths === 1 ? "" : "s"})`
        );
        continue;
      }

      const prefs = prefsByTroop.get(troop.id) || [];
      const weekends = troopWeekends.get(troop.id) || new Set<string>();
      const dates = troopDates.get(troop.id) || new Set<string>();
      const assignedTroopSlots = troopSlots.get(troop.id) || [];

      let assigned = false;
      let firstAvailableRank: number | null = null;
      const skippedReasons: string[] = [];
      for (const pref of prefs) {
        if (assignedSlots.has(pref.slot_id)) continue;

        if (firstAvailableRank === null) {
          firstAvailableRank = pref.rank;
        }

        const slotDate = slotDateMap.get(pref.slot_id)!;
        const slotInfo = slotInfoMap.get(pref.slot_id)!;

        if (troop.max_one_per_weekend) {
          const weekKey = getWeekendKey(slotDate);
          if (weekKey && weekends.has(weekKey)) {
            if (skippedReasons.length === 0) skippedReasons.push("one booth per weekend limit");
            continue;
          }
        }

        if (troop.no_same_day) {
          if (dates.has(slotDate)) {
            if (!skippedReasons.includes("no two booths same day")) skippedReasons.push("no two booths same day");
            continue;
          }
        }

        if (troop.no_same_time) {
          const hasOverlap = assignedTroopSlots.some(
            (s) => s.date === slotDate && timesOverlap(s.start_time, s.end_time, slotInfo.start_time, slotInfo.end_time)
          );
          if (hasOverlap) {
            if (!skippedReasons.includes("overlapping time slot")) skippedReasons.push("overlapping time slot");
            continue;
          }
        }

        pickNumber++;
        assignmentInserts.push({
          sql: "INSERT INTO assignments (troop_id, slot_id, round, pick_number) VALUES (?, ?, ?, ?)",
          args: [troop.id, pref.slot_id, round, pickNumber],
        });
        assignedSlots.add(pref.slot_id);

        const wk = getWeekendKey(slotDate);
        if (wk) weekends.add(wk);
        troopWeekends.set(troop.id, weekends);
        dates.add(slotDate);
        troopDates.set(troop.id, dates);
        assignedTroopSlots.push({ date: slotDate, start_time: slotInfo.start_time, end_time: slotInfo.end_time });
        troopSlots.set(troop.id, assignedTroopSlots);
        troopBoothCount.set(troop.id, boothCount + 1);

        let msg = `Round ${round}: ${troop.name} (pick #${troop.draft_position}) assigned choice #${pref.rank}`;
        if (firstAvailableRank !== null && pref.rank > firstAvailableRank && skippedReasons.length > 0) {
          msg += ` (skipped choice #${firstAvailableRank} — ${skippedReasons.join(", ")})`;
        }
        log.push(msg);
        assigned = true;
        anyAssignedThisRound = true;
        break;
      }

      if (!assigned) {
        log.push(
          `Round ${round}: ${troop.name} (pick #${troop.draft_position}) - no available preferred slots`
        );
      }
    }

    if (!anyAssignedThisRound) {
      const remaining = totalSlots - assignedSlots.size;
      log.push(`Stopped after round ${round}: ${remaining} slot(s) unassigned (no troop has them in preferences)`);
      break;
    }
  }

  // Batch-insert all assignments
  if (assignmentInserts.length > 0) {
    await db.batch(assignmentInserts, "write");
  }

  return NextResponse.json({ assignments: assignmentInserts.length, log });
}

export async function DELETE() {
  const db = await ensureDb();
  await db.execute("DELETE FROM assignments");
  return NextResponse.json({ ok: true });
}

import { ensureDb } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const db = await ensureDb();
  const { snake = true, roundOffset = 0 } = await req.json().catch(() => ({ snake: true, roundOffset: 0 }));

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

  // Determine what round we're on based on existing assignments
  const maxRoundResult = await db.execute("SELECT MAX(round) as max_round FROM assignments");
  const maxRound = (maxRoundResult.rows[0]?.max_round as number | null) || 0;
  const round = maxRound + 1;

  // Get max pick_number so far
  const maxPickResult = await db.execute("SELECT MAX(pick_number) as max_pick FROM assignments");
  let pickNumber = (maxPickResult.rows[0]?.max_pick as number | null) || 0;

  // Get all slots
  const slotsResult = await db.execute("SELECT id, date, start_time, end_time FROM time_slots");
  const allSlots = slotsResult.rows as unknown as Array<{ id: number; date: string; start_time: string; end_time: string }>;
  const slotDateMap = new Map(allSlots.map((s) => [s.id, s.date]));
  const slotInfoMap = new Map(allSlots.map((s) => [s.id, s]));
  const totalSlots = allSlots.length;

  // Build state from existing assignments
  const existingResult = await db.execute("SELECT troop_id, slot_id FROM assignments");
  const existingAssignments = existingResult.rows as unknown as Array<{ troop_id: number; slot_id: number }>;

  const assignedSlots = new Set(existingAssignments.map((a) => a.slot_id));

  if (assignedSlots.size >= totalSlots) {
    return NextResponse.json({ round, log: ["All slots are already assigned."], allDone: true });
  }

  // Rebuild per-troop tracking from existing assignments
  const troopWeekends = new Map<number, Set<string>>();
  const troopBoothCount = new Map<number, number>();
  const troopDates = new Map<number, Set<string>>();
  const troopSlots = new Map<number, Array<{ date: string; start_time: string; end_time: string }>>();

  function getWeekendKey(dateStr: string): string | null {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay();
    if (day !== 0 && day !== 5 && day !== 6) return null;
    const friday = new Date(d);
    if (day === 0) friday.setDate(d.getDate() - 2);
    else if (day === 6) friday.setDate(d.getDate() - 1);
    return friday.toISOString().slice(0, 10);
  }

  function timesOverlap(s1Start: string, s1End: string, s2Start: string, s2End: string): boolean {
    return s1Start < s2End && s2Start < s1End;
  }

  for (const a of existingAssignments) {
    const slotDate = slotDateMap.get(a.slot_id)!;
    const slotInfo = slotInfoMap.get(a.slot_id)!;

    troopBoothCount.set(a.troop_id, (troopBoothCount.get(a.troop_id) || 0) + 1);

    const wk = getWeekendKey(slotDate);
    if (wk) {
      const weekends = troopWeekends.get(a.troop_id) || new Set<string>();
      weekends.add(wk);
      troopWeekends.set(a.troop_id, weekends);
    }

    const dates = troopDates.get(a.troop_id) || new Set<string>();
    dates.add(slotDate);
    troopDates.set(a.troop_id, dates);

    const slots = troopSlots.get(a.troop_id) || [];
    slots.push({ date: slotDate, start_time: slotInfo.start_time, end_time: slotInfo.end_time });
    troopSlots.set(a.troop_id, slots);
  }

  // Get all preferences upfront
  const allPrefsResult = await db.execute("SELECT * FROM preferences ORDER BY troop_id, rank");
  const allPrefs = allPrefsResult.rows as unknown as Array<{ troop_id: number; slot_id: number; rank: number }>;
  const prefsByTroop = new Map<number, Array<{ slot_id: number; rank: number }>>();
  for (const p of allPrefs) {
    const arr = prefsByTroop.get(p.troop_id) || [];
    arr.push({ slot_id: p.slot_id, rank: p.rank });
    prefsByTroop.set(p.troop_id, arr);
  }

  // Run one round
  const effectiveRound = round + roundOffset;
  const orderedTroops = snake && effectiveRound % 2 === 0 ? [...troops].reverse() : [...troops];
  const log: string[] = [];
  let anyAssigned = false;

  const assignmentInserts: Array<{ sql: string; args: (string | number)[] }> = [];

  for (const troop of orderedTroops) {
    if (assignedSlots.size >= totalSlots) break;

    const boothCount = troopBoothCount.get(troop.id) || 0;
    if (troop.max_booths > 0 && boothCount >= troop.max_booths) {
      log.push(
        `${troop.name} (pick #${troop.draft_position}) - passed (reached max of ${troop.max_booths} booth${troop.max_booths === 1 ? "" : "s"})`
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

      let msg = `${troop.name} (pick #${troop.draft_position}) assigned choice #${pref.rank}`;
      if (firstAvailableRank !== null && pref.rank > firstAvailableRank && skippedReasons.length > 0) {
        msg += ` (skipped choice #${firstAvailableRank} — ${skippedReasons.join(", ")})`;
      }
      log.push(msg);
      assigned = true;
      anyAssigned = true;
      break;
    }

    if (!assigned) {
      log.push(
        `${troop.name} (pick #${troop.draft_position}) - no available preferred slots`
      );
    }
  }

  // Batch-insert all assignments for this round
  if (assignmentInserts.length > 0) {
    await db.batch(assignmentInserts, "write");
  }

  const allDone = assignedSlots.size >= totalSlots || !anyAssigned;
  if (!anyAssigned && assignedSlots.size < totalSlots) {
    const remaining = totalSlots - assignedSlots.size;
    log.push(`${remaining} slot(s) remain unassigned (no troop has them in preferences)`);
  }

  return NextResponse.json({ round, log, allDone });
}

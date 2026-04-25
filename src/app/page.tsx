"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Slot = { id: number; date: string; start_time: string; end_time: string };
type Location = { id: number; name: string; address: string; slots: Slot[]; import_batch: string | null };
type Troop = {
  id: number;
  name: string;
  leader_name: string;
  contact: string;
  email: string;
  draft_position: number | null;
  max_one_per_weekend: number;
  max_booths: number;
  no_same_day: number;
  no_same_time: number;
};
type Assignment = {
  id: number;
  troop_id: number;
  slot_id: number;
  round: number;
  troop_name: string;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string;
  location_address: string;
};

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}/${y}`;
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = Number(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

export default function AdminPage() {
  const [tab, setTab] = useState<"locations" | "troops" | "lottery" | "results">("locations");
  const [locations, setLocations] = useState<Location[]>([]);
  const [troops, setTroops] = useState<Troop[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [lotteryLog, setLotteryLog] = useState<string[]>([]);
  const [visibleLogCount, setVisibleLogCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [fullLog, setFullLog] = useState<string[]>([]);
  const [expandedTroops, setExpandedTroops] = useState<Set<string>>(new Set());
  const logEndRef = useRef<HTMLDivElement>(null);

  // Location form
  const [locName, setLocName] = useState("");
  const [locAddress, setLocAddress] = useState("");
  const [slotDate, setSlotDate] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [pendingSlots, setPendingSlots] = useState<
    { date: string; start_time: string; end_time: string }[]
  >([]);

  // Troop form
  const [troopName, setTroopName] = useState("");
  const [troopLeader, setTroopLeader] = useState("");
  const [troopContact, setTroopContact] = useState("");
  const [troopEmail, setTroopEmail] = useState("");
  const [snakeDraft, setSnakeDraft] = useState(true);
  const [draftMode, setDraftMode] = useState<"auto" | "live">("auto");
  const [liveRound, setLiveRound] = useState(0);
  const [liveStatus, setLiveStatus] = useState<"idle" | "waiting" | "done">("idle");
  const [keepPreviousOrder, setKeepPreviousOrder] = useState(false);
  const [roundOffset, setRoundOffset] = useState(0);

  // Editing
  const [editingTroop, setEditingTroop] = useState<Troop | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  // Location import
  const [locImportError, setLocImportError] = useState<string | null>(null);
  const [locImportSuccess, setLocImportSuccess] = useState(false);

  // Troop import
  const [troopImportError, setTroopImportError] = useState<string | null>(null);
  const [troopImportSuccess, setTroopImportSuccess] = useState(false);

  // Slot form for existing location
  const [addSlotLocId, setAddSlotLocId] = useState<number | null>(null);
  const [addSlotDate, setAddSlotDate] = useState("");
  const [addSlotStart, setAddSlotStart] = useState("");
  const [addSlotEnd, setAddSlotEnd] = useState("");

  const fetchLocations = useCallback(() => {
    fetch("/api/locations").then((r) => r.json()).then(setLocations);
  }, []);

  const fetchTroops = useCallback(() => {
    fetch("/api/troops").then((r) => r.json()).then(setTroops);
  }, []);

  const fetchAssignments = useCallback(() => {
    fetch("/api/lottery").then((r) => r.json()).then(setAssignments);
  }, []);

  useEffect(() => {
    fetchLocations();
    fetchTroops();
    fetchAssignments();
  }, [fetchLocations, fetchTroops, fetchAssignments]);

  useEffect(() => {
    if (isAnimating && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [visibleLogCount, isAnimating]);

  async function addLocation(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: locName, address: locAddress, slots: pendingSlots }),
    });
    setLocName("");
    setLocAddress("");
    setPendingSlots([]);
    fetchLocations();
  }

  function addPendingSlot() {
    if (!slotDate || !slotStart || !slotEnd) return;
    setPendingSlots([...pendingSlots, { date: slotDate, start_time: slotStart, end_time: slotEnd }]);
    setSlotDate("");
    setSlotStart("");
    setSlotEnd("");
  }

  async function addSlotToLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!addSlotLocId) return;
    await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: addSlotLocId,
        date: addSlotDate,
        start_time: addSlotStart,
        end_time: addSlotEnd,
      }),
    });
    setAddSlotLocId(null);
    setAddSlotDate("");
    setAddSlotStart("");
    setAddSlotEnd("");
    fetchLocations();
  }

  async function saveLocation(loc: Location) {
    await fetch("/api/locations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: loc.id, name: loc.name, address: loc.address }),
    });
    setEditingLocation(null);
    fetchLocations();
  }

  async function deleteImportBatch(batchId: string) {
    await fetch("/api/locations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_batch: batchId }),
    });
    fetchLocations();
  }

  async function deleteLocation(id: number) {
    await fetch("/api/locations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchLocations();
  }

  async function deleteSlot(id: number) {
    await fetch("/api/slots", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchLocations();
  }

  async function addTroop(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/troops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: troopName, leader_name: troopLeader, contact: troopContact, email: troopEmail }),
    });
    setTroopName("");
    setTroopLeader("");
    setTroopContact("");
    setTroopEmail("");
    fetchTroops();
  }

  async function saveTroop(t: Troop) {
    await fetch("/api/troops", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    setEditingTroop(null);
    fetchTroops();
  }

  async function deleteTroop(id: number) {
    await fetch("/api/troops", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchTroops();
  }

  async function randomizeDraftOrder() {
    const shuffled = [...troops].sort(() => Math.random() - 0.5);
    const order = shuffled.map((t, i) => ({ id: t.id, draft_position: i + 1 }));
    await fetch("/api/troops/randomize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
    fetchTroops();
  }

  async function runLottery() {
    const res = await fetch("/api/lottery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snake: snakeDraft }),
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    const log = data.log || [];
    setFullLog(log);
    setVisibleLogCount(0);
    setIsAnimating(true);
    // Animate lines appearing
    for (let i = 0; i < log.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setVisibleLogCount(i + 1);
    }
    setIsAnimating(false);
    setLotteryLog(log);
    fetchAssignments();
    setTab("results");
  }

  async function clearAssignments() {
    await fetch("/api/lottery", { method: "DELETE" });
    setAssignments([]);
    setLotteryLog([]);
    setLiveRound(0);
    setLiveStatus("idle");
    setRoundOffset(0);
  }

  async function startLiveDraft() {
    // Get the previous max round before clearing (for snake continuation)
    let offset = 0;
    if (keepPreviousOrder && snakeDraft) {
      const res = await fetch("/api/lottery");
      const prev = await res.json();
      if (prev.length > 0) {
        offset = Math.max(...prev.map((a: Assignment) => a.round));
      }
    }
    setRoundOffset(offset);

    // Clear previous assignments
    await fetch("/api/lottery", { method: "DELETE" });

    // Only randomize if not keeping previous order
    if (!keepPreviousOrder) {
      await randomizeDraftOrder();
    }

    setLotteryLog([]);
    setAssignments([]);

    // Run round 1 (with offset so snake pattern continues)
    const res = await fetch("/api/lottery/round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snake: snakeDraft, roundOffset: offset }),
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    setLotteryLog(data.log || []);
    setLiveRound(data.round || 1);
    setLiveStatus(data.allDone ? "done" : "waiting");
    fetchAssignments();
  }

  async function runNextRound() {
    const res = await fetch("/api/lottery/round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snake: snakeDraft, roundOffset }),
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    setLotteryLog((prev) => [...prev, "", `--- Round ${data.round} ---`, ...(data.log || [])]);
    setLiveRound(data.round);
    setLiveStatus(data.allDone ? "done" : "waiting");
    fetchAssignments();
  }

  function exportLocationsCSV() {
    const header = "Location,Address,Date,Start,End";
    const escapeCsv = (val: string) =>
      val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
    const rows: string[] = [];
    for (const loc of locations) {
      if (loc.slots.length === 0) {
        rows.push([escapeCsv(loc.name), escapeCsv(loc.address), "", "", ""].join(","));
      } else {
        for (const s of loc.slots) {
          rows.push(
            [escapeCsv(loc.name), escapeCsv(loc.address), s.date, s.start_time, s.end_time].join(",")
          );
        }
      }
    }
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "locations_and_slots.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function readCsvFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Detect UTF-16 LE BOM (FF FE) - common from Excel
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(buffer);
    }
    // Detect UTF-16 BE BOM (FE FF)
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(buffer);
    }
    // Detect UTF-8 BOM (EF BB BF)
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder("utf-8").decode(buffer);
    }
    // Check if it looks like UTF-16 LE without BOM (every other byte is 0 for ASCII content)
    if (bytes.length >= 4 && bytes[1] === 0 && bytes[3] === 0) {
      return new TextDecoder("utf-16le").decode(buffer);
    }
    // Default to UTF-8
    return new TextDecoder("utf-8").decode(buffer);
  }

  async function readSpreadsheetFile(file: File): Promise<string> {
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      // Format date/time cells properly for CSV output
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, rawNumbers: false });
      return rows.map((row) =>
        row.map((cell) => {
          if (cell instanceof Date) {
            // Check if it's a time-only value (date part is 1899-12-30, Excel epoch)
            if (cell.getFullYear() === 1899) {
              const h = String(cell.getHours()).padStart(2, "0");
              const m = String(cell.getMinutes()).padStart(2, "0");
              return `${h}:${m}`;
            }
            // Otherwise format as YYYY-MM-DD
            const y = cell.getFullYear();
            const mo = String(cell.getMonth() + 1).padStart(2, "0");
            const d = String(cell.getDate()).padStart(2, "0");
            return `${y}-${mo}-${d}`;
          }
          const s = String(cell ?? "");
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(",")
      ).join("\n");
    }
    return readCsvFile(file);
  }

  function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  async function importLocationsCSV(file: File) {
    setLocImportError(null);
    setLocImportSuccess(false);
    const text = await readSpreadsheetFile(file);
    const lines = text.split(/\r?\n/).filter((l) => l.replace(/,/g, "").trim());
    if (lines.length < 2) {
      setLocImportError("File is empty or has no data rows.");
      return;
    }

    // Detect columns by header name (case-insensitive, flexible matching)
    const headerFields = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    const colIdx = {
      location: headerFields.findIndex((h) => h.includes("location") || h.includes("name") || h.includes("store")),
      address: headerFields.findIndex((h) => h.includes("address") || h.includes("addr")),
      date: headerFields.findIndex((h) => h.includes("date")),
      start: headerFields.findIndex((h) => h.includes("start") || h.includes("begin") || h.includes("from")),
      end: headerFields.findIndex((h) => h.includes("end") || h.includes("stop") || h.includes("to") || h.includes("until")),
    };

    if (colIdx.location === -1) {
      setLocImportError(`Could not find a "Location" column in the header row: ${lines[0]}`);
      return;
    }

    // Group rows by location
    const locationMap = new Map<string, { address: string; slots: { date: string; start_time: string; end_time: string }[] }>();

    // Normalize date to YYYY-MM-DD from various formats
    function normalizeDate(d: string): string {
      const s = d.trim();
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
        const [y, m, day] = s.split("-");
        return `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
      // M/D/YYYY or MM/DD/YYYY
      const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (slashMatch) {
        return `${slashMatch[3]}-${slashMatch[1].padStart(2, "0")}-${slashMatch[2].padStart(2, "0")}`;
      }
      // Try JS Date parse for formats like "Sun, February 8, 2026" or "February 8, 2026"
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, "0");
        const day = String(parsed.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      return s;
    }

    // Normalize time to HH:MM from various formats
    function normalizeTime(t: string): string {
      const s = t.trim().toUpperCase();
      // Already HH:MM or H:MM
      const timeMatch = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
      if (timeMatch) {
        let [, hStr, min, ampm] = timeMatch;
        let h = Number(hStr);
        if (ampm === "PM" && h !== 12) h += 12;
        if (ampm === "AM" && h === 12) h = 0;
        return `${String(h).padStart(2, "0")}:${min}`;
      }
      // Bare number like "1" or "13" — treat as hour
      const numMatch = s.match(/^(\d{1,2})\s*(AM|PM)?$/);
      if (numMatch) {
        let h = Number(numMatch[1]);
        const ampm = numMatch[2];
        if (ampm === "PM" && h !== 12) h += 12;
        if (ampm === "AM" && h === 12) h = 0;
        // If no AM/PM and hour <= 6, assume PM (booth hours are typically daytime)
        if (!ampm && h >= 1 && h <= 6) h += 12;
        return `${String(h).padStart(2, "0")}:00`;
      }
      return s;
    }

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      const name = fields[colIdx.location]?.trim() || "";
      const address = colIdx.address >= 0 ? fields[colIdx.address]?.trim() || "" : "";
      const rawDate = colIdx.date >= 0 ? fields[colIdx.date]?.trim() || "" : "";
      const rawStart = colIdx.start >= 0 ? fields[colIdx.start]?.trim() || "" : "";
      const rawEnd = colIdx.end >= 0 ? fields[colIdx.end]?.trim() || "" : "";

      if (!name) continue;
      const key = `${name}|||${address}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, { address, slots: [] });
      }
      if (rawDate && rawStart && rawEnd) {
        locationMap.get(key)!.slots.push({
          date: normalizeDate(rawDate),
          start_time: normalizeTime(rawStart),
          end_time: normalizeTime(rawEnd),
        });
      }
    }

    // Create each location with its slots, tagged with a batch ID
    const batchId = `import-${Date.now()}`;
    for (const [key, data] of locationMap) {
      const name = key.split("|||")[0];
      await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address: data.address, slots: data.slots, import_batch: batchId }),
      });
    }

    setLocImportSuccess(true);
    fetchLocations();
  }

  async function exportResultsXlsx() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Tab 1: All Results
    const allRows = assignments.map((a) => ({
      "Round": a.round,
      "Troop": a.troop_name,
      "Location": a.location_name,
      "Address": a.location_address,
      "Date": a.date,
      "Start": a.start_time,
      "End": a.end_time,
    }));
    const allSheet = XLSX.utils.json_to_sheet(allRows);
    XLSX.utils.book_append_sheet(wb, allSheet, "All Results");

    // Per-troop tabs
    for (const [troopName, troopAssignments] of assignmentsByTroop) {
      const troopRows = troopAssignments.map((a) => ({
        "Round": a.round,
        "Location": a.location_name,
        "Address": a.location_address,
        "Date": a.date,
        "Start": a.start_time,
        "End": a.end_time,
      }));
      const troopSheet = XLSX.utils.json_to_sheet(troopRows);
      // Sheet names max 31 chars, no special chars
      const sheetName = troopName.replace(/[\\/*?[\]:]/g, "").slice(0, 31);
      XLSX.utils.book_append_sheet(wb, troopSheet, sheetName);
    }

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lottery_results.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportTroopsCSV() {
    const header = "Troop,Leader Name,Email,Phone";
    const escapeCsv = (val: string) =>
      val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
    const rows = troops.map((t) =>
      [escapeCsv(t.name), escapeCsv(t.leader_name), escapeCsv(t.email), escapeCsv(t.contact)].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "troops.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importTroopsCSV(file: File) {
    setTroopImportError(null);
    setTroopImportSuccess(false);
    const text = await readSpreadsheetFile(file);
    const lines = text.split(/\r?\n/).filter((l) => l.replace(/,/g, "").trim());
    if (lines.length < 2) {
      setTroopImportError("File is empty or has no data rows.");
      return;
    }

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      if (fields.length < 1 || !fields[0]) {
        continue;
      }
      const [name, leader_name, email, contact] = fields;
      await fetch("/api/troops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          leader_name: leader_name || "",
          email: email || "",
          contact: contact || "",
        }),
      });
    }

    setTroopImportSuccess(true);
    fetchTroops();
  }

  function getLogLineClass(line: string): string {
    if (line.startsWith("---")) return "text-blue-600 font-bold mt-2";
    if (line === "") return "h-2";
    if (line.includes("passed") || line.includes("no available") || line.includes("unassigned"))
      return "text-red-600 bg-red-50 rounded px-2 py-1 my-0.5";
    if (line.includes("skipped"))
      return "text-amber-700 bg-amber-50 rounded px-2 py-1 my-0.5";
    if (line.includes("assigned"))
      return "text-green-700 bg-green-50 rounded px-2 py-1 my-0.5";
    if (line.includes("Stopped"))
      return "text-gray-500 italic";
    return "text-gray-700";
  }

  function toggleTroopExpand(name: string) {
    setExpandedTroops(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const assignmentsByTroop = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const group = assignmentsByTroop.get(a.troop_name) || [];
    group.push(a);
    assignmentsByTroop.set(a.troop_name, group);
  }

  const tabs = [
    { key: "locations" as const, label: "Locations & Slots" },
    { key: "troops" as const, label: "Troops & Draft Order" },
    { key: "lottery" as const, label: "Run Lottery" },
    { key: "results" as const, label: "Results" },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-r from-[#008c47] via-[#00ae58] to-[#34d399] text-white px-6 py-4 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 64 64" className="w-16 h-16 shrink-0" aria-label="Happy Cookie Monster">
              {/* Head */}
              <ellipse cx="32" cy="34" rx="26" ry="24" fill="#3b82f6" />
              {/* Fun fur tufts */}
              <path d="M10 20 Q6 10 14 14 Q10 6 18 12" fill="#60a5fa" stroke="#3b82f6" strokeWidth="1" />
              <path d="M50 18 Q56 8 48 14 Q54 6 46 12" fill="#60a5fa" stroke="#3b82f6" strokeWidth="1" />
              <path d="M24 12 Q26 4 30 9" fill="#60a5fa" stroke="#3b82f6" strokeWidth="1" />
              <path d="M34 10 Q38 2 40 11" fill="#60a5fa" stroke="#3b82f6" strokeWidth="1" />
              {/* Happy left eye */}
              <circle cx="22" cy="26" r="9" fill="white" />
              <circle cx="23" cy="25" r="4.5" fill="#1a1a1a" />
              <circle cx="24.5" cy="23.5" r="1.5" fill="white" />
              {/* Happy right eye */}
              <circle cx="42" cy="26" r="9" fill="white" />
              <circle cx="43" cy="25" r="4.5" fill="#1a1a1a" />
              <circle cx="44.5" cy="23.5" r="1.5" fill="white" />
              {/* Rosy cheeks */}
              <circle cx="12" cy="38" r="4" fill="#f472b6" opacity="0.3" />
              <circle cx="52" cy="38" r="4" fill="#f472b6" opacity="0.3" />
              {/* Big happy open mouth */}
              <path d="M16 42 Q32 58 48 42" fill="#1a1a1a" stroke="#111" strokeWidth="1" />
              {/* Tongue */}
              <ellipse cx="32" cy="50" rx="6" ry="4" fill="#ef4444" />
              {/* Teeth */}
              <path d="M22 42 L24 46" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <path d="M40 42 L42 46" stroke="white" strokeWidth="2" strokeLinecap="round" />
              {/* Cookie crumbs flying */}
              <circle cx="50" cy="40" r="1" fill="#d97706" />
              <circle cx="54" cy="36" r="0.8" fill="#92400e" />
              <circle cx="12" cy="42" r="0.8" fill="#d97706" />
              {/* Cookie held up high */}
              <circle cx="56" cy="14" r="7" fill="#d97706" />
              <circle cx="54" cy="12" r="1" fill="#78350f" />
              <circle cx="58" cy="16" r="1" fill="#78350f" />
              <circle cx="55" cy="17" r="0.8" fill="#78350f" />
              <circle cx="58" cy="12" r="0.8" fill="#78350f" />
              {/* Arm reaching up */}
              <path d="M46 30 Q52 20 54 16" stroke="#3b82f6" strokeWidth="5" fill="none" strokeLinecap="round" />
            </svg>
            <div>
              <h1 className="text-3xl font-bold">Cookie Booth Lottery</h1>
              <p className="text-green-100 text-sm">Admin Dashboard</p>
            </div>
          </div>
          <a
            href="/troop"
            className="bg-white text-gs-green px-4 py-2 rounded-lg font-medium text-sm hover:bg-green-50 transition"
          >
            Troop View
          </a>
        </div>
      </header>

      <nav className="bg-white border-b">
        <div className="max-w-5xl mx-auto flex">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
                tab === t.key
                  ? "border-gs-green text-gs-green"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-6">
        {tab === "locations" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
              <h2 className="text-lg font-semibold mb-1">Export / Import Locations</h2>
              <p className="text-sm text-gray-500 mb-4">
                Download a CSV of all locations and slots, or upload one to add new locations in bulk.
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  onClick={exportLocationsCSV}
                  disabled={locations.length === 0}
                  className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40"
                >
                  Download Locations CSV
                </button>
                <label className="bg-gs-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gs-green-dark transition cursor-pointer">
                  Upload Locations CSV
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importLocationsCSV(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {locImportSuccess && (
                  <span className="text-green-600 text-sm font-medium">Imported successfully!</span>
                )}
                {locImportError && (
                  <span className="text-red-600 text-sm font-medium">{locImportError}</span>
                )}
              </div>

              {(() => {
                const batches = new Map<string, { count: number; date: string; slotCount: number }>();
                for (const loc of locations) {
                  if (loc.import_batch) {
                    const b = batches.get(loc.import_batch) || { count: 0, date: "", slotCount: 0 };
                    b.count++;
                    b.slotCount += loc.slots.length;
                    if (!b.date) {
                      const ts = loc.import_batch.replace("import-", "");
                      b.date = new Date(Number(ts)).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                    }
                    batches.set(loc.import_batch, b);
                  }
                }
                if (batches.size === 0) return null;
                return (
                  <div className="mt-4 border-t pt-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Import History</h3>
                    <div className="space-y-2">
                      {Array.from(batches.entries()).map(([batchId, { count, date, slotCount }]) => (
                        <div key={batchId} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border text-sm">
                          <div>
                            <span className="font-medium">{date}</span>
                            <span className="text-gray-500 ml-2">
                              {count} location{count !== 1 ? "s" : ""}, {slotCount} slot{slotCount !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <button
                            onClick={() => deleteImportBatch(batchId)}
                            className="text-red-500 text-sm hover:text-red-700 font-medium"
                          >
                            Delete All
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
              <h2 className="text-lg font-semibold mb-4">Add Location</h2>
              <form onSubmit={addLocation} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location Name
                    </label>
                    <input
                      type="text"
                      value={locName}
                      onChange={(e) => setLocName(e.target.value)}
                      required
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. Walmart on Main St"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input
                      type="text"
                      value={locAddress}
                      onChange={(e) => setLocAddress(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="123 Main St"
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Time Slots (optional - can add later)
                  </h3>
                  <div className="flex gap-3 items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Date</label>
                      <input
                        type="date"
                        value={slotDate}
                        onChange={(e) => setSlotDate(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Start</label>
                      <input
                        type="time"
                        value={slotStart}
                        onChange={(e) => setSlotStart(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">End</label>
                      <input
                        type="time"
                        value={slotEnd}
                        onChange={(e) => setSlotEnd(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addPendingSlot}
                      className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
                    >
                      + Add Slot
                    </button>
                  </div>
                  {pendingSlots.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {pendingSlots.map((s, i) => (
                        <div key={i} className="text-sm text-gray-600 flex items-center gap-2">
                          <span>
                            {formatDate(s.date)} {formatTime(s.start_time)} -{" "}
                            {formatTime(s.end_time)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingSlots(pendingSlots.filter((_, j) => j !== i))
                            }
                            className="text-red-500 text-xs"
                          >
                            remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="bg-gs-green text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gs-green-dark transition"
                >
                  Add Location
                </button>
              </form>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
              <h2 className="text-lg font-semibold mb-4">
                Locations & Time Slots ({locations.length})
              </h2>
              {locations.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0 1 15 0Z" />
                  </svg>
                  <p className="text-gray-500 font-medium mb-1">No locations added yet</p>
                  <p className="text-gray-400 text-sm mb-4">Add your first location using the form above</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {locations.map((loc) => (
                    <div key={loc.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        {editingLocation?.id === loc.id ? (
                          <div className="flex gap-2 items-end flex-1 mr-3">
                            <div className="flex-1">
                              <label className="block text-xs text-gray-500 mb-1">Name</label>
                              <input
                                type="text"
                                value={editingLocation.name}
                                onChange={(e) => setEditingLocation({ ...editingLocation, name: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs text-gray-500 mb-1">Address</label>
                              <input
                                type="text"
                                value={editingLocation.address}
                                onChange={(e) => setEditingLocation({ ...editingLocation, address: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                            </div>
                            <button
                              onClick={() => saveLocation(editingLocation)}
                              className="bg-gs-green text-white px-3 py-1 rounded text-sm"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingLocation(null)}
                              className="text-gray-500 text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div>
                            <h3 className="font-medium">{loc.name}</h3>
                            {loc.address && (
                              <p className="text-sm text-gray-500">{loc.address}</p>
                            )}
                          </div>
                        )}
                        {editingLocation?.id !== loc.id && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingLocation(loc)}
                              className="text-gs-green text-sm hover:text-gs-green-dark"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteLocation(loc.id)}
                              className="text-red-500 text-sm hover:text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                      {loc.slots.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {loc.slots.map((s) => (
                            <div
                              key={s.id}
                              className="text-sm text-gray-600 flex items-center gap-2"
                            >
                              <span>
                                {formatDate(s.date)} {formatTime(s.start_time)} -{" "}
                                {formatTime(s.end_time)}
                              </span>
                              <button
                                onClick={() => deleteSlot(s.id)}
                                className="text-red-400 text-xs hover:text-red-600"
                              >
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {addSlotLocId === loc.id ? (
                        <form onSubmit={addSlotToLocation} className="mt-3 flex gap-2 items-end">
                          <input
                            type="date"
                            value={addSlotDate}
                            onChange={(e) => setAddSlotDate(e.target.value)}
                            required
                            className="border rounded px-2 py-1 text-sm"
                          />
                          <input
                            type="time"
                            value={addSlotStart}
                            onChange={(e) => setAddSlotStart(e.target.value)}
                            required
                            className="border rounded px-2 py-1 text-sm"
                          />
                          <input
                            type="time"
                            value={addSlotEnd}
                            onChange={(e) => setAddSlotEnd(e.target.value)}
                            required
                            className="border rounded px-2 py-1 text-sm"
                          />
                          <button
                            type="submit"
                            className="bg-gs-green text-white px-3 py-1 rounded text-sm"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddSlotLocId(null)}
                            className="text-gray-500 text-sm"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          onClick={() => setAddSlotLocId(loc.id)}
                          className="mt-2 text-sm text-gs-green hover:text-gs-green-dark"
                        >
                          + Add time slot
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "troops" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
              <h2 className="text-lg font-semibold mb-1">Export / Import Troops</h2>
              <p className="text-sm text-gray-500 mb-4">
                Download a CSV of all troops, or upload one to add troops in bulk.
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  onClick={exportTroopsCSV}
                  disabled={troops.length === 0}
                  className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40"
                >
                  Download Troops CSV
                </button>
                <label className="bg-gs-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gs-green-dark transition cursor-pointer">
                  Upload Troops CSV
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importTroopsCSV(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {troopImportSuccess && (
                  <span className="text-green-600 text-sm font-medium">Imported successfully!</span>
                )}
                {troopImportError && (
                  <span className="text-red-600 text-sm font-medium">{troopImportError}</span>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
              <h2 className="text-lg font-semibold mb-4">Add Troop</h2>
              <form onSubmit={addTroop} className="space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Troop Name/Number
                    </label>
                    <input
                      type="text"
                      value={troopName}
                      onChange={(e) => setTroopName(e.target.value)}
                      required
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. Troop 1234"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Leader Name
                    </label>
                    <input
                      type="text"
                      value={troopLeader}
                      onChange={(e) => setTroopLeader(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={troopEmail}
                      onChange={(e) => setTroopEmail(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="jane@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={troopContact}
                      onChange={(e) => setTroopContact(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="bg-gs-green text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gs-green-dark transition"
                >
                  Add Troop
                </button>
              </form>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Troops & Draft Order ({troops.length})</h2>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={snakeDraft}
                      onChange={(e) => setSnakeDraft(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-gs-green focus:ring-gs-green"
                    />
                    <span className="text-sm text-gray-700">Snake draft</span>
                  </label>
                  <button
                    onClick={randomizeDraftOrder}
                    className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 transition"
                  >
                    Randomize Draft Order
                  </button>
                </div>
              </div>
              {troops.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                  </svg>
                  <p className="text-gray-500 font-medium mb-1">No troops added yet</p>
                  <p className="text-gray-400 text-sm mb-4">Add your first troop using the form above</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-gray-600">Draft #</th>
                      <th className="pb-2 font-medium text-gray-600">Troop</th>
                      <th className="pb-2 font-medium text-gray-600">Leader</th>
                      <th className="pb-2 font-medium text-gray-600">Email</th>
                      <th className="pb-2 font-medium text-gray-600">Phone</th>
                      <th className="pb-2 font-medium text-gray-600">Preferences</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {troops.map((t) => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 text-center w-16">
                          {t.draft_position ?? "-"}
                        </td>
                        {editingTroop?.id === t.id ? (
                          <>
                            <td className="py-2">
                              <input
                                type="text"
                                value={editingTroop.name}
                                onChange={(e) => setEditingTroop({ ...editingTroop, name: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                            </td>
                            <td className="py-2">
                              <input
                                type="text"
                                value={editingTroop.leader_name}
                                onChange={(e) => setEditingTroop({ ...editingTroop, leader_name: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                            </td>
                            <td className="py-2">
                              <input
                                type="email"
                                value={editingTroop.email}
                                onChange={(e) => setEditingTroop({ ...editingTroop, email: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                            </td>
                            <td className="py-2">
                              <input
                                type="text"
                                value={editingTroop.contact}
                                onChange={(e) => setEditingTroop({ ...editingTroop, contact: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                            </td>
                            <td className="py-2" colSpan={2}>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveTroop(editingTroop)}
                                  className="bg-gs-green text-white px-3 py-1 rounded text-sm"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingTroop(null)}
                                  className="text-gray-500 text-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 font-medium">{t.name}</td>
                            <td className="py-2 text-gray-600">{t.leader_name}</td>
                            <td className="py-2 text-gray-600">{t.email}</td>
                            <td className="py-2 text-gray-600">{t.contact}</td>
                            <td className="py-2">
                              <a
                                href={`/troop?id=${t.id}`}
                                className="text-gs-green hover:text-gs-green-dark text-sm"
                              >
                                Submit Preferences
                              </a>
                            </td>
                            <td className="py-2 text-right">
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => setEditingTroop(t)}
                                  className="text-gs-green text-sm hover:text-gs-green-dark"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => deleteTroop(t.id)}
                                  className="text-red-500 text-sm hover:text-red-700"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === "lottery" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
              <h2 className="text-lg font-semibold mb-4">Run the Lottery</h2>

              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => setDraftMode("auto")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    draftMode === "auto"
                      ? "bg-gs-green text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Auto Draft
                </button>
                <button
                  onClick={() => setDraftMode("live")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    draftMode === "live"
                      ? "bg-gs-green text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Live Draft
                </button>
              </div>

              {draftMode === "auto" && (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    Runs all rounds automatically until every slot is filled. Troops submit preferences
                    beforehand and the system assigns everything at once.
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm">
                    <strong>Before running:</strong>
                    <ul className="list-disc ml-5 mt-1 space-y-1 text-gray-700">
                      <li>
                        All troops need draft positions assigned (set them above or click &quot;Randomize
                        Draft Order&quot;)
                      </li>
                      <li>
                        Troops should have submitted their preferences (use the Troop View page)
                      </li>
                      <li>Running the lottery will clear any previous assignments</li>
                    </ul>
                  </div>
                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={snakeDraft}
                        onChange={(e) => setSnakeDraft(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-gs-green focus:ring-gs-green"
                      />
                      <span className="text-sm text-gray-700">Snake draft</span>
                    </label>
                    <button
                      onClick={runLottery}
                      className="bg-gs-green text-white px-6 py-2 rounded-lg font-medium hover:bg-gs-green-dark transition"
                    >
                      Run Lottery
                    </button>
                    {assignments.length > 0 && (
                      <button
                        onClick={clearAssignments}
                        className="bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition"
                      >
                        Clear Results
                      </button>
                    )}
                  </div>
                </>
              )}

              {draftMode === "live" && (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    Runs one round at a time. After each round, troops can revise their preferences
                    before the next round begins. Draft order is randomized at the start. Continues
                    until all slots are assigned or no troop wants more.
                  </p>

                  {liveStatus === "idle" && (
                    <>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm">
                        <strong>Before starting:</strong>
                        <ul className="list-disc ml-5 mt-1 space-y-1 text-gray-700">
                          <li>Troops should have submitted their initial preferences</li>
                          <li>Starting will clear any previous assignments</li>
                        </ul>
                      </div>

                      <label className="flex items-center gap-3 cursor-pointer mb-4">
                        <input
                          type="checkbox"
                          checked={keepPreviousOrder}
                          onChange={(e) => setKeepPreviousOrder(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-gs-green focus:ring-gs-green"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-700">
                            Keep previous draft order
                          </span>
                          <p className="text-xs text-gray-500">
                            {"Reuse the current draft positions instead of randomizing."}
                            {snakeDraft ? " Snake pattern will continue from where the last draft left off." : ""}
                          </p>
                        </div>
                      </label>
                    </>
                  )}

                  {liveStatus === "waiting" && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-sm">
                      <strong>Round {liveRound} complete.</strong> Troops can now revise their preferences
                      on the <a href="/troop" className="text-gs-green underline">Troop View page</a> before
                      you run the next round. When ready, click &quot;Run Round {liveRound + 1}&quot;.
                    </div>
                  )}

                  {liveStatus === "done" && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 text-sm">
                      <strong>Live draft complete!</strong> All slots have been assigned or no troop
                      wants additional slots. Check the Results tab for the final assignments.
                    </div>
                  )}

                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={snakeDraft}
                        onChange={(e) => setSnakeDraft(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-gs-green focus:ring-gs-green"
                        disabled={liveStatus !== "idle"}
                      />
                      <span className="text-sm text-gray-700">Snake draft</span>
                    </label>
                    {liveStatus === "idle" && (
                      <button
                        onClick={startLiveDraft}
                        className="bg-gs-green text-white px-6 py-2 rounded-lg font-medium hover:bg-gs-green-dark transition"
                      >
                        Start Live Draft
                      </button>
                    )}
                    {liveStatus === "waiting" && (
                      <button
                        onClick={runNextRound}
                        className="bg-gs-green text-white px-6 py-2 rounded-lg font-medium hover:bg-gs-green-dark transition"
                      >
                        Run Round {liveRound + 1}
                      </button>
                    )}
                    {(liveStatus === "waiting" || liveStatus === "done") && (
                      <button
                        onClick={clearAssignments}
                        className="bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition"
                      >
                        Reset Draft
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {(lotteryLog.length > 0 || isAnimating) && (
              <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-semibold">Draft Log</h2>
                  {isAnimating && (
                    <button
                      onClick={() => { setVisibleLogCount(fullLog.length); setIsAnimating(false); setLotteryLog(fullLog); fetchAssignments(); }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Skip Animation
                    </button>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm space-y-1 max-h-96 overflow-y-auto">
                  {(isAnimating ? fullLog.slice(0, visibleLogCount) : lotteryLog).map((line, i) => (
                    <div
                      key={i}
                      className={`${getLogLineClass(line)} ${isAnimating && i === visibleLogCount - 1 ? "animate-fade-in" : ""}`}
                    >
                      {line || "\u00A0"}
                    </div>
                  ))}
                  {isAnimating && (
                    <div ref={logEndRef} />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "results" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
              <h2 className="text-lg font-semibold mb-3">Draft Order</h2>
              {troops.filter((t) => t.draft_position !== null).length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                  </svg>
                  <p className="text-gray-500 font-medium mb-1">No draft positions assigned yet</p>
                  <p className="text-gray-400 text-sm mb-4">Randomize the draft order on the Troops tab</p>
                  <button className="bg-gs-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gs-green-dark transition" onClick={() => setTab("troops")}>Go to Troops tab</button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {troops
                    .filter((t) => t.draft_position !== null)
                    .sort((a, b) => (a.draft_position ?? 0) - (b.draft_position ?? 0))
                    .map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2 text-sm"
                      >
                        <span className="w-6 h-6 bg-gs-green text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                          {t.draft_position}
                        </span>
                        <span className="font-medium">{t.name}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
              {assignments.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
                  </svg>
                  <p className="text-gray-500 font-medium mb-1">No assignments yet</p>
                  <p className="text-gray-400 text-sm mb-4">Run the lottery to assign booths to troops</p>
                  <button className="bg-gs-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gs-green-dark transition" onClick={() => setTab("lottery")}>Run the Lottery</button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold">Assignments ({assignments.length})</h2>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={exportResultsXlsx}
                        className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition"
                      >
                        Download Results (.xlsx)
                      </button>
                      <button
                        onClick={() => {
                          if (expandedTroops.size === assignmentsByTroop.size) setExpandedTroops(new Set());
                          else setExpandedTroops(new Set(assignmentsByTroop.keys()));
                        }}
                        className="text-sm text-gs-green hover:text-gs-green-dark"
                      >
                        {expandedTroops.size === assignmentsByTroop.size ? "Collapse All" : "Expand All"}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {Array.from(assignmentsByTroop.entries()).map(([troopName, troopAssignments]) => (
                      <div key={troopName} className="border rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleTroopExpand(troopName)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-sm">{troopName}</span>
                            <span className="bg-gs-green text-white text-xs px-2 py-0.5 rounded-full">
                              {troopAssignments.length} booth{troopAssignments.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedTroops.has(troopName) ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {expandedTroops.has(troopName) && (
                          <div className="p-4 space-y-2 bg-white">
                            {troopAssignments.map((a) => (
                              <div key={a.id} className="flex justify-between items-center text-sm py-1.5 border-b last:border-0">
                                <div>
                                  <span className="font-medium">{a.location_name}</span>
                                  {a.location_address && <span className="text-gray-400 ml-2">{a.location_address}</span>}
                                </div>
                                <div className="text-gray-600 shrink-0 ml-4">
                                  {formatDate(a.date)} {formatTime(a.start_time)} - {formatTime(a.end_time)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

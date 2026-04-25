"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type Slot = {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string;
  location_address: string;
};
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
};

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  const dow = dayNames[new Date(Number(y), Number(m) - 1, Number(day)).getDay()];
  return `${dow} ${Number(m)}/${Number(day)}/${y}`;
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = Number(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function TroopPageContent() {
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("id");

  const [troops, setTroops] = useState<Troop[]>([]);
  const [selectedTroop, setSelectedTroop] = useState<number | null>(
    preselectedId ? Number(preselectedId) : null
  );
  const [slots, setSlots] = useState<Slot[]>([]);
  const [rankings, setRankings] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [slotView, setSlotView] = useState<"list" | "calendar">("calendar");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    fetch("/api/troops").then((r) => r.json()).then(setTroops);
    fetch("/api/slots").then((r) => r.json()).then(setSlots);
    fetch("/api/lottery").then((r) => r.json()).then(setAssignments);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedTroop) {
      fetch(`/api/preferences?troop_id=${selectedTroop}`)
        .then((r) => r.json())
        .then((prefs: Array<{ slot_id: number }>) => {
          setRankings(prefs.map((p) => p.slot_id));
          setSaved(false);
        });
    }
  }, [selectedTroop]);

  function addToRankings(slotId: number) {
    if (!rankings.includes(slotId)) {
      setRankings([...rankings, slotId]);
      setSaved(false);
    }
  }

  function removeFromRankings(slotId: number) {
    setRankings(rankings.filter((id) => id !== slotId));
    setSaved(false);
  }


  async function savePreferences() {
    await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ troop_id: selectedTroop, rankings }),
    });
    setSaved(true);
  }

  function exportSlotsCSV() {
    const header = "Rank,Location,Address,Date,Start,End";
    const escapeCsv = (val: string) =>
      val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;

    // Ranked slots first, in preference order
    const rankedSlots = rankings
      .map((id) => slots.find((s) => s.id === id))
      .filter((s): s is Slot => s !== undefined);
    // Unranked slots after
    const unrankedSlots = slots.filter((s) => !rankings.includes(s.id));
    const ordered = [...rankedSlots, ...unrankedSlots];

    const rows = ordered.map((s, i) => {
      return [
        i + 1,
        escapeCsv(s.location_name),
        escapeCsv(s.location_address),
        s.date,
        s.start_time,
        s.end_time,
      ].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "booth_slots.csv";
    a.click();
    URL.revokeObjectURL(url);
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

  // Normalize date to YYYY-MM-DD regardless of input format
  // Handles: 2026-03-07, 3/7/2026, 03/07/2026, etc.
  function normalizeDate(d: string): string {
    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(d)) {
      const [y, m, day] = d.split("-");
      return `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    // M/D/YYYY or MM/DD/YYYY format
    const slashMatch = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [, m, day, y] = slashMatch;
      return `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    return d;
  }

  // Normalize time to HH:MM (24h) regardless of input format
  // Handles: 09:00, 9:00, 9:00 AM, 12:00 PM, etc.
  function normalizeTime(t: string): string {
    const stripped = t.trim().toUpperCase();
    const match = stripped.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    if (!match) return t;
    let [, hStr, min, ampm] = match;
    let h = Number(hStr);
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${min}`;
  }

  function findSlotByFields(location: string, address: string, date: string, start: string, end: string): Slot | undefined {
    const nd = normalizeDate(date);
    const ns = normalizeTime(start);
    const ne = normalizeTime(end);
    return slots.find(
      (s) =>
        s.location_name === location &&
        s.location_address === address &&
        s.date === nd &&
        s.start_time === ns &&
        s.end_time === ne
    );
  }

  async function readCsvFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(buffer);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(buffer);
    }
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder("utf-8").decode(buffer);
    }
    if (bytes.length >= 4 && bytes[1] === 0 && bytes[3] === 0) {
      return new TextDecoder("utf-16le").decode(buffer);
    }
    return new TextDecoder("utf-8").decode(buffer);
  }

  async function readSpreadsheetFile(file: File): Promise<string> {
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, rawNumbers: false });
      return rows.map((row) =>
        row.map((cell) => {
          if (cell instanceof Date) {
            if (cell.getFullYear() === 1899) {
              const h = String(cell.getHours()).padStart(2, "0");
              const m = String(cell.getMinutes()).padStart(2, "0");
              return `${h}:${m}`;
            }
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

  async function importSlotsCSV(file: File) {
    setUploadError(null);
    setUploadSuccess(false);

    const text = await readSpreadsheetFile(file);
    const lines = text.split(/\r?\n/).filter((l) => l.replace(/,/g, "").trim());
    if (lines.length < 2) {
      setUploadError("File is empty or has no data rows.");
      return;
    }

    const parsed: { rank: number; slotId: number; row: number }[] = [];

      for (let i = 1; i < lines.length; i++) {
        const fields = parseCsvLine(lines[i]);
        // Columns: Rank, Location, Address, Date, Start, End
        if (fields.length < 6) {
          setUploadError(`Row ${i + 1}: expected 6 columns but found ${fields.length}.`);
          return;
        }
        const [rankStr, location, address, date, start, end] = fields;
        const rank = Number(rankStr);
        if (isNaN(rank)) {
          setUploadError(`Row ${i + 1}: invalid rank "${rankStr}".`);
          return;
        }
        const slot = findSlotByFields(location, address, date, start, end);
        if (!slot) {
          setUploadError(
            `Row ${i + 1}: no matching slot found for "${location}" on ${date} ${start}-${end}.`
          );
          return;
        }
        if (parsed.some((p) => p.slotId === slot.id)) {
          setUploadError(`Row ${i + 1}: duplicate slot "${location}" on ${date} ${start}-${end}.`);
          return;
        }
        parsed.push({ rank, slotId: slot.id, row: i + 1 });
      }

      // Sort by the Rank column so reordering rows OR changing rank numbers both work
      parsed.sort((a, b) => a.rank - b.rank);
      const slotIds = parsed.map((p) => p.slotId);

    setRankings(slotIds);
    setSaved(false);
    setUploadSuccess(true);
  }

  function getSlot(id: number) {
    return slots.find((s) => s.id === id);
  }

  const troopAssignments = assignments.filter((a) => a.troop_id === selectedTroop);
  const currentTroop = troops.find((t) => t.id === selectedTroop);

  // Group available slots by location
  const slotsByLocation: Record<string, Slot[]> = {};
  for (const slot of slots) {
    if (!slotsByLocation[slot.location_name]) {
      slotsByLocation[slot.location_name] = [];
    }
    slotsByLocation[slot.location_name].push(slot);
  }

  // Group slots by date for calendar view
  const slotsByDate: Record<string, Slot[]> = {};
  for (const slot of slots) {
    if (!slotsByDate[slot.date]) slotsByDate[slot.date] = [];
    slotsByDate[slot.date].push(slot);
  }

  // Get unique months from slots
  function getCalendarMonths() {
    if (slots.length === 0) return [];
    const dates = slots.map((s) => s.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const first = new Date(dates[0] + "T00:00:00");
    const last = new Date(dates[dates.length - 1] + "T00:00:00");
    const months: { year: number; month: number }[] = [];
    const d = new Date(first.getFullYear(), first.getMonth(), 1);
    while (d <= last) {
      months.push({ year: d.getFullYear(), month: d.getMonth() });
      d.setMonth(d.getMonth() + 1);
    }
    return months;
  }

  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfWeek(year: number, month: number) {
    return new Date(year, month, 1).getDay();
  }

  function padDate(n: number) {
    return n < 10 ? `0${n}` : `${n}`;
  }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-r from-[#008c47] via-[#00ae58] to-[#34d399] text-white px-6 py-4 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 64 64" className="w-16 h-16 shrink-0" aria-label="Happy Cookie Monster">
              <ellipse cx="32" cy="34" rx="26" ry="24" fill="#3b82f6" />
              <path d="M10 20 Q6 10 14 14 Q10 6 18 12" fill="#60a5fa" stroke="#3b82f6" strokeWidth="1" />
              <path d="M50 18 Q56 8 48 14 Q54 6 46 12" fill="#60a5fa" stroke="#3b82f6" strokeWidth="1" />
              <path d="M24 12 Q26 4 30 9" fill="#60a5fa" stroke="#3b82f6" strokeWidth="1" />
              <path d="M34 10 Q38 2 40 11" fill="#60a5fa" stroke="#3b82f6" strokeWidth="1" />
              <circle cx="22" cy="26" r="9" fill="white" />
              <circle cx="23" cy="25" r="4.5" fill="#1a1a1a" />
              <circle cx="24.5" cy="23.5" r="1.5" fill="white" />
              <circle cx="42" cy="26" r="9" fill="white" />
              <circle cx="43" cy="25" r="4.5" fill="#1a1a1a" />
              <circle cx="44.5" cy="23.5" r="1.5" fill="white" />
              <circle cx="12" cy="38" r="4" fill="#f472b6" opacity="0.3" />
              <circle cx="52" cy="38" r="4" fill="#f472b6" opacity="0.3" />
              <path d="M16 42 Q32 58 48 42" fill="#1a1a1a" stroke="#111" strokeWidth="1" />
              <ellipse cx="32" cy="50" rx="6" ry="4" fill="#ef4444" />
              <path d="M22 42 L24 46" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <path d="M40 42 L42 46" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <circle cx="50" cy="40" r="1" fill="#d97706" />
              <circle cx="54" cy="36" r="0.8" fill="#92400e" />
              <circle cx="12" cy="42" r="0.8" fill="#d97706" />
              <circle cx="56" cy="14" r="7" fill="#d97706" />
              <circle cx="54" cy="12" r="1" fill="#78350f" />
              <circle cx="58" cy="16" r="1" fill="#78350f" />
              <circle cx="55" cy="17" r="0.8" fill="#78350f" />
              <circle cx="58" cy="12" r="0.8" fill="#78350f" />
              <path d="M46 30 Q52 20 54 16" stroke="#3b82f6" strokeWidth="5" fill="none" strokeLinecap="round" />
            </svg>
            <div>
              <h1 className="text-3xl font-bold">Cookie Booth Lottery</h1>
              <p className="text-green-100 text-sm">Troop Preference Submission</p>
            </div>
          </div>
          <a
            href="/"
            className="bg-white text-gs-green px-4 py-2 rounded-lg font-medium text-sm hover:bg-green-50 transition"
          >
            Admin View
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border p-6 card-hover mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Your Troop</label>
          <select
            value={selectedTroop ?? ""}
            onChange={(e) => setSelectedTroop(e.target.value ? Number(e.target.value) : null)}
            className="border rounded-lg px-3 py-2 text-sm w-64"
          >
            <option value="">-- Choose a troop --</option>
            {troops.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {selectedTroop && (
          <>
            <div className="bg-white rounded-xl shadow-sm border p-6 card-hover mb-6 space-y-4">
              <h2 className="text-lg font-semibold">Booth Limits</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentTroop?.max_one_per_weekend === 1}
                  onChange={async (e) => {
                    if (!currentTroop) return;
                    await fetch("/api/troops", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        ...currentTroop,
                        max_one_per_weekend: e.target.checked ? 1 : 0,
                      }),
                    });
                    fetch("/api/troops").then((r) => r.json()).then(setTroops);
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-gs-green focus:ring-gs-green"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    Limit to one booth per weekend
                  </span>
                  <p className="text-xs text-gray-500">
                    The lottery will only assign your troop one booth per Friday/Saturday/Sunday weekend
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentTroop?.no_same_day === 1}
                  onChange={async (e) => {
                    if (!currentTroop) return;
                    await fetch("/api/troops", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        ...currentTroop,
                        no_same_day: e.target.checked ? 1 : 0,
                      }),
                    });
                    fetch("/api/troops").then((r) => r.json()).then(setTroops);
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-gs-green focus:ring-gs-green"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    No two booths on the same day
                  </span>
                  <p className="text-xs text-gray-500">
                    The lottery will skip slots on a day where your troop is already assigned
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentTroop?.no_same_time === 1}
                  onChange={async (e) => {
                    if (!currentTroop) return;
                    await fetch("/api/troops", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        ...currentTroop,
                        no_same_time: e.target.checked ? 1 : 0,
                      }),
                    });
                    fetch("/api/troops").then((r) => r.json()).then(setTroops);
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-gs-green focus:ring-gs-green"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    No overlapping time slots
                  </span>
                  <p className="text-xs text-gray-500">
                    The lottery will skip slots that overlap with a booth your troop is already assigned
                  </p>
                </div>
              </label>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Max total booths</label>
                <select
                  value={currentTroop?.max_booths ?? 0}
                  onChange={async (e) => {
                    if (!currentTroop) return;
                    await fetch("/api/troops", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        ...currentTroop,
                        max_booths: Number(e.target.value),
                      }),
                    });
                    fetch("/api/troops").then((r) => r.json()).then(setTroops);
                  }}
                  className="border rounded-lg px-3 py-1.5 text-sm"
                >
                  <option value={0}>No limit</option>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">
                  The lottery will stop assigning booths to your troop after this many
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 card-hover mb-6">
              <h2 className="text-lg font-semibold mb-1">Export / Import Preferences</h2>
              <p className="text-sm text-gray-500 mb-4">
                Download a CSV of all available slots, reorder the rows to set your preference
                (row 1 = top choice), then upload it back.
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  onClick={exportSlotsCSV}
                  disabled={slots.length === 0}
                  className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40"
                >
                  Download Slots CSV
                </button>
                <label className="bg-gs-green text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gs-green-dark transition cursor-pointer">
                  Upload Ranked CSV
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importSlotsCSV(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {uploadSuccess && (
                  <span className="text-green-600 text-sm font-medium">
                    Loaded! Review your rankings below, then click Save Preferences.
                  </span>
                )}
                {uploadError && (
                  <span className="text-red-600 text-sm font-medium">{uploadError}</span>
                )}
              </div>
            </div>

            {troopAssignments.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
                <h2 className="text-lg font-semibold text-green-800 mb-3">
                  Your Assigned Booths
                </h2>
                <div className="space-y-2">
                  {troopAssignments.map((a) => (
                    <div
                      key={a.id}
                      className="bg-white rounded-lg p-3 border border-green-200 text-sm"
                    >
                      <span className="font-medium">{a.location_name}</span> -{" "}
                      {formatDate(a.date)} {formatTime(a.start_time)} - {formatTime(a.end_time)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-semibold">Available Booth Slots</h2>
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setSlotView("calendar")}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition ${slotView === "calendar" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      Calendar
                    </button>
                    <button
                      onClick={() => setSlotView("list")}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition ${slotView === "list" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      List
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Click to add to your ranked list
                </p>

                {slots.length === 0 ? (
                  <p className="text-gray-500 text-sm">No slots available yet.</p>
                ) : slotView === "calendar" ? (
                  <div className="space-y-6">
                    {getCalendarMonths().map(({ year, month }) => {
                      const daysInMonth = getDaysInMonth(year, month);
                      const firstDay = getFirstDayOfWeek(year, month);
                      return (
                        <div key={`${year}-${month}`}>
                          <h3 className="font-semibold text-sm text-gray-800 mb-2">{monthNames[month]} {year}</h3>
                          <div className="grid grid-cols-7 gap-1 text-center">
                            {dayHeaders.map((d) => (
                              <div key={d} className="text-xs font-medium text-gray-400 py-1">{d}</div>
                            ))}
                            {Array.from({ length: firstDay }).map((_, i) => (
                              <div key={`empty-${i}`} />
                            ))}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                              const day = i + 1;
                              const dateStr = `${year}-${padDate(month + 1)}-${padDate(day)}`;
                              const daySlots = slotsByDate[dateStr] || [];
                              const hasSlots = daySlots.length > 0;
                              const allRanked = hasSlots && daySlots.every((s) => rankings.includes(s.id));
                              const someRanked = hasSlots && daySlots.some((s) => rankings.includes(s.id));
                              const isExpanded = expandedDay === dateStr;

                              return (
                                <div key={day} className="relative">
                                  <button
                                    onClick={() => hasSlots && setExpandedDay(isExpanded ? null : dateStr)}
                                    disabled={!hasSlots}
                                    className={`w-full aspect-square rounded-lg text-xs flex flex-col items-center justify-center gap-0.5 transition border ${
                                      !hasSlots
                                        ? "text-gray-300 border-transparent cursor-default"
                                        : isExpanded
                                          ? "bg-gs-green text-white border-gs-green shadow-md"
                                          : allRanked
                                            ? "bg-green-100 text-green-700 border-green-200"
                                            : someRanked
                                              ? "bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-300"
                                              : "bg-white text-gray-700 border-gray-200 hover:border-gs-green hover:bg-green-50"
                                    }`}
                                  >
                                    <span className="font-medium">{day}</span>
                                    {hasSlots && (
                                      <span className={`text-[10px] leading-none ${isExpanded ? "text-green-100" : allRanked ? "text-green-500" : "text-gray-400"}`}>
                                        {daySlots.length} slot{daySlots.length !== 1 ? "s" : ""}
                                      </span>
                                    )}
                                  </button>
                                  {isExpanded && (
                                    <div className="absolute z-10 top-full mt-1 left-1/2 -translate-x-1/2 w-56 bg-white rounded-lg shadow-lg border p-2 space-y-1">
                                      {daySlots.map((s) => {
                                        const isRanked = rankings.includes(s.id);
                                        return (
                                          <button
                                            key={s.id}
                                            onClick={(e) => { e.stopPropagation(); if (!isRanked) { addToRankings(s.id); } }}
                                            disabled={isRanked}
                                            className={`w-full text-left text-xs px-2 py-1.5 rounded border transition ${
                                              isRanked
                                                ? "bg-gray-50 text-gray-400 border-gray-200"
                                                : "bg-white hover:bg-green-50 hover:border-gs-green border-gray-200 cursor-pointer"
                                            }`}
                                          >
                                            <div className="font-medium">{s.location_name}</div>
                                            <div className="text-gray-500">{formatTime(s.start_time)} - {formatTime(s.end_time)}</div>
                                            {isRanked && <span className="text-gray-400">(added)</span>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(slotsByLocation).map(([locName, locSlots]) => (
                      <div key={locName}>
                        <h3 className="font-medium text-sm text-gray-800 mb-1">{locName}</h3>
                        <div className="space-y-1">
                          {locSlots.map((s) => {
                            const isRanked = rankings.includes(s.id);
                            return (
                              <button
                                key={s.id}
                                onClick={() => !isRanked && addToRankings(s.id)}
                                disabled={isRanked}
                                className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition ${
                                  isRanked
                                    ? "bg-gray-100 text-gray-400 border-gray-200"
                                    : "bg-white hover:bg-green-50 hover:border-gs-green border-gray-200 cursor-pointer"
                                }`}
                              >
                                {formatDate(s.date)} {formatTime(s.start_time)} -{" "}
                                {formatTime(s.end_time)}
                                {isRanked && (
                                  <span className="ml-2 text-xs text-gray-400">(added)</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border p-6 card-hover">
                <h2 className="text-lg font-semibold mb-1">
                  Your Rankings for {currentTroop?.name}
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Drag to reorder. #1 is your top choice.
                </p>
                {rankings.length === 0 ? (
                  <p className="text-gray-500 text-sm">
                    Click on slots from the left to add them to your list.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {rankings.map((slotId, index) => {
                      const slot = getSlot(slotId);
                      if (!slot) return null;
                      const isDragging = dragIndex === index;
                      const isDragOver = dragOverIndex === index;
                      return (
                        <div
                          key={slotId}
                          draggable
                          onDragStart={() => {
                            setDragIndex(index);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverIndex(index);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragIndex !== null && dragIndex !== index) {
                              const newRankings = [...rankings];
                              const [moved] = newRankings.splice(dragIndex, 1);
                              newRankings.splice(index, 0, moved);
                              setRankings(newRankings);
                              setSaved(false);
                            }
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          onDragEnd={() => {
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          className={`flex items-center gap-2 rounded-lg p-2 border cursor-grab active:cursor-grabbing transition-all ${
                            isDragging
                              ? "opacity-40 border-dashed border-gs-green bg-green-50"
                              : isDragOver
                                ? "border-gs-green bg-green-50 shadow-sm"
                                : "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <span className="text-gray-300 select-none px-1">&#x2630;</span>
                          <span className="w-8 h-8 bg-gs-green text-white rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                            {index + 1}
                          </span>
                          <div className="flex-1 text-sm">
                            <div className="font-medium">{slot.location_name}</div>
                            <div className="text-gray-500">
                              {formatDate(slot.date)} {formatTime(slot.start_time)} -{" "}
                              {formatTime(slot.end_time)}
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromRankings(slotId)}
                            className="text-red-400 hover:text-red-600 text-sm px-2"
                          >
                            x
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {rankings.length > 0 && (
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={savePreferences}
                      className="bg-gs-green text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-gs-green-dark transition"
                    >
                      Save Preferences
                    </button>
                    {saved && (
                      <span className="text-green-600 text-sm font-medium">Saved!</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function TroopPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <TroopPageContent />
    </Suspense>
  );
}

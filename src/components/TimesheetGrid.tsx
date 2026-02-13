"use client";

import { DayEntry } from "@/lib/types";

const DAY_LABELS: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
};

interface TimesheetGridProps {
  days: DayEntry[];
  onChange: (days: DayEntry[]) => void;
  confidences?: Record<string, Record<string, number | null>>; // date -> field -> confidence
}

export default function TimesheetGrid({
  days,
  onChange,
  confidences,
}: TimesheetGridProps) {
  function updateDay(index: number, field: keyof DayEntry, value: string) {
    const updated = [...days];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  function getConfidenceColor(date: string, field: string): string {
    const c = confidences?.[date]?.[field];
    if (c == null) return "";
    if (c >= 0.8) return "ring-2 ring-emerald-300 bg-emerald-50";
    if (c >= 0.5) return "ring-2 ring-amber-300 bg-amber-50";
    return "ring-2 ring-red-300 bg-red-50";
  }

  return (
    <div className="space-y-3">
      {/* Header row - desktop */}
      <div className="hidden lg:grid lg:grid-cols-[140px_90px_90px_80px_80px_80px_1fr] gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide px-1">
        <div>Day</div>
        <div>Start</div>
        <div>End</div>
        <div>Hours</div>
        <div>Break (min)</div>
        <div>Km</div>
        <div>Notes</div>
      </div>

      {days.map((day, i) => (
        <div
          key={day.date}
          className="card !p-4 grid gap-3 lg:grid-cols-[140px_90px_90px_80px_80px_80px_1fr] lg:items-center"
        >
          {/* Day label */}
          <div>
            <div className="font-medium text-gray-900 text-sm">
              {DAY_LABELS[day.dayOfWeek]}
            </div>
            <div className="text-xs text-gray-500">{day.date}</div>
          </div>

          {/* Start time */}
          <div>
            <label className="lg:hidden text-xs text-gray-500 mb-0.5 block">Start</label>
            <input
              type="time"
              value={day.startTime}
              onChange={(e) => updateDay(i, "startTime", e.target.value)}
              className={`input-field text-sm ${getConfidenceColor(day.date, "startTime")}`}
            />
          </div>

          {/* End time */}
          <div>
            <label className="lg:hidden text-xs text-gray-500 mb-0.5 block">End</label>
            <input
              type="time"
              value={day.endTime}
              onChange={(e) => updateDay(i, "endTime", e.target.value)}
              className={`input-field text-sm ${getConfidenceColor(day.date, "endTime")}`}
            />
          </div>

          {/* Total hours */}
          <div>
            <label className="lg:hidden text-xs text-gray-500 mb-0.5 block">Hours</label>
            <input
              type="number"
              step="0.25"
              min="0"
              max="24"
              placeholder="0"
              value={day.totalHours}
              onChange={(e) => updateDay(i, "totalHours", e.target.value)}
              className={`input-field text-sm ${getConfidenceColor(day.date, "totalHours")}`}
            />
          </div>

          {/* Break */}
          <div>
            <label className="lg:hidden text-xs text-gray-500 mb-0.5 block">Break (min)</label>
            <input
              type="number"
              min="0"
              max="240"
              placeholder="0"
              value={day.breakMinutes}
              onChange={(e) => updateDay(i, "breakMinutes", e.target.value)}
              className={`input-field text-sm ${getConfidenceColor(day.date, "breakMinutes")}`}
            />
          </div>

          {/* Km */}
          <div>
            <label className="lg:hidden text-xs text-gray-500 mb-0.5 block">Km</label>
            <input
              type="number"
              min="0"
              max="2000"
              placeholder="0"
              value={day.kilometers}
              onChange={(e) => updateDay(i, "kilometers", e.target.value)}
              className={`input-field text-sm ${getConfidenceColor(day.date, "kilometers")}`}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="lg:hidden text-xs text-gray-500 mb-0.5 block">Notes</label>
            <input
              type="text"
              placeholder="Optional notes"
              value={day.notes}
              onChange={(e) => updateDay(i, "notes", e.target.value)}
              className={`input-field text-sm ${getConfidenceColor(day.date, "notes")}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

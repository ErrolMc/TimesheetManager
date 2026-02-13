"use client";

import { useState, useCallback } from "react";
import WeekPicker from "@/components/WeekPicker";
import TimesheetGrid from "@/components/TimesheetGrid";
import FileUpload from "@/components/FileUpload";
import { DayEntry, AIExtractionResult } from "@/lib/types";
import { generateWeekDays, getCurrentWeekStart } from "@/lib/dates";
import { generateXeroCSV } from "@/lib/xero";

export default function Home() {
  const [email, setEmail] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);
  const [days, setDays] = useState<DayEntry[]>(() =>
    generateWeekDays(getCurrentWeekStart())
  );
  const [confidences, setConfidences] = useState<
    Record<string, Record<string, number | null>>
  >({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  function handleWeekChange(date: string) {
    setWeekStart(date);
    setDays(generateWeekDays(date));
    setConfidences({});
    setWarnings([]);
  }

  const handleExtracted = useCallback(
    (data: unknown) => {
      const result = data as AIExtractionResult;

      // Fill employee info if returned
      if (result.employee?.fullName && !employeeName) {
        setEmployeeName(result.employee.fullName);
      }
      if (result.employee?.email && !email) {
        setEmail(result.employee.email);
      }

      // Map AI days directly — support any number of days returned
      if (result.days && result.days.length > 0) {
        const newDays = result.days.map((aiDay) => ({
          date: aiDay.date,
          dayOfWeek: aiDay.dayOfWeek,
          startTime: aiDay.work.startTime || "",
          endTime: aiDay.work.endTime || "",
          totalHours:
            aiDay.work.totalHours != null
              ? String(aiDay.work.totalHours)
              : "",
          breakMinutes:
            aiDay.work.breakMinutes != null
              ? String(aiDay.work.breakMinutes)
              : "",
          kilometers:
            aiDay.work.kilometers != null
              ? String(aiDay.work.kilometers)
              : "",
          notes: aiDay.notes || "",
        }));
        setDays(newDays);

        // Build confidence map
        const confMap: Record<string, Record<string, number | null>> = {};
        result.days.forEach((aiDay) => {
          confMap[aiDay.date] = aiDay.confidence.fields;
        });
        setConfidences(confMap);
      }

      if (result.warnings?.length) {
        setWarnings(result.warnings);
      }

      // Update week start if AI detected a different one
      if (result.period?.weekStartDate) {
        setWeekStart(result.period.weekStartDate);
      }

      setShowUpload(false);
    },
    [days, email, employeeName]
  );

  function handleDownloadCSV() {
    const name = employeeName || email || "Employee";
    const csv = generateXeroCSV(name, days);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${weekStart}-${name.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasAnyData = days.some(
    (d) => d.startTime || d.endTime || d.totalHours || d.kilometers
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Weekly Timesheet</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter your hours manually or upload a document for AI extraction.
          Download as Xero-ready CSV when done.
        </p>
      </div>

      {/* Employee info + week */}
      <div className="card">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              placeholder="John Smith"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              placeholder="john@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
            />
          </div>
          <WeekPicker value={weekStart} onChange={handleWeekChange} />
        </div>
      </div>

      {/* AI Upload section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              AI Extraction
            </h2>
            <p className="text-sm text-gray-500">
              Upload a photo or document to auto-fill the timesheet
            </p>
          </div>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="btn-secondary"
          >
            {showUpload ? "Hide" : "Upload File"}
          </button>
        </div>

        {showUpload && <FileUpload onExtracted={handleExtracted} employeeName={employeeName} />}

        {/* Confidence legend */}
        {Object.keys(confidences).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded ring-2 ring-emerald-300 bg-emerald-50" />
              High confidence
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded ring-2 ring-amber-300 bg-amber-50" />
              Medium
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded ring-2 ring-red-300 bg-red-50" />
              Low — please review
            </span>
          </div>
        )}

        {/* Warnings from AI */}
        {warnings.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-sm font-medium text-amber-800 mb-1">
              Extraction Warnings
            </p>
            <ul className="text-sm text-amber-700 list-disc list-inside space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Timesheet grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Hours — Period Starting {weekStart}
        </h2>
        <TimesheetGrid
          days={days}
          onChange={setDays}
          confidences={confidences}
        />
      </div>

      {/* Summary + download */}
      <div className="card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Summary</h2>
            <div className="mt-1 flex gap-6 text-sm text-gray-600">
              <span>
                Total Hours:{" "}
                <span className="font-semibold text-gray-900">
                  {days
                    .reduce((sum, d) => {
                      let h = parseFloat(d.totalHours) || 0;
                      if (!h && d.startTime && d.endTime) {
                        const [sh, sm] = d.startTime.split(":").map(Number);
                        const [eh, em] = d.endTime.split(":").map(Number);
                        h = eh - sh + (em - sm) / 60;
                        h -= (parseFloat(d.breakMinutes) || 0) / 60;
                      }
                      return sum + Math.max(0, h);
                    }, 0)
                    .toFixed(1)}
                </span>
              </span>
              <span>
                Total Km:{" "}
                <span className="font-semibold text-gray-900">
                  {days
                    .reduce(
                      (sum, d) => sum + (parseFloat(d.kilometers) || 0),
                      0
                    )
                    .toFixed(0)}
                </span>
              </span>
            </div>
          </div>

          <button
            onClick={handleDownloadCSV}
            disabled={!hasAnyData || !employeeName}
            className="btn-success"
            title={
              !employeeName
                ? "Enter employee name first"
                : !hasAnyData
                  ? "Enter some timesheet data first"
                  : "Download Xero CSV"
            }
          >
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download Xero CSV
          </button>
        </div>
      </div>
    </div>
  );
}

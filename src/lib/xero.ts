import { DayEntry } from "./types";

export function generateXeroCSV(
  employeeName: string,
  days: DayEntry[]
): string {
  const rows: string[] = [];
  rows.push("Employee Name,Date,Earnings Rate,Units,Notes");

  for (const day of days) {
    let hours = parseFloat(day.totalHours) || 0;

    if (!hours && day.startTime && day.endTime) {
      const [sh, sm] = day.startTime.split(":").map(Number);
      const [eh, em] = day.endTime.split(":").map(Number);
      hours = eh - sh + (em - sm) / 60;
      const breakMins = parseFloat(day.breakMinutes) || 0;
      hours -= breakMins / 60;
    }

    if (hours > 0) {
      rows.push(
        `"${employeeName}","${day.date}","Ordinary Hours","${hours.toFixed(2)}","${day.notes || ""}"`
      );
    }

    const km = parseFloat(day.kilometers) || 0;
    if (km > 0) {
      rows.push(
        `"${employeeName}","${day.date}","Kilometers","${km.toFixed(2)}","${km} km"`
      );
    }
  }

  return rows.join("\n");
}

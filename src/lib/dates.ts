import { DayOfWeek, DayEntry } from "./types";

const DAY_NAMES: DayOfWeek[] = ["MON", "TUE", "WED", "THU", "FRI"];

export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function generateWeekDays(weekStartDate: string): DayEntry[] {
  const monday = new Date(weekStartDate + "T00:00:00");
  return DAY_NAMES.map((dayOfWeek, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return {
      date: formatDate(d),
      dayOfWeek,
      startTime: "",
      endTime: "",
      totalHours: "",
      breakMinutes: "",
      kilometers: "",
      notes: "",
    };
  });
}

export function getCurrentWeekStart(): string {
  return formatDate(getMonday(new Date()));
}

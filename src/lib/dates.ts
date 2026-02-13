import { DayOfWeek, DayEntry } from "./types";

const ALL_DAY_NAMES: DayOfWeek[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

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

export function getDayName(date: Date): DayOfWeek {
  return ALL_DAY_NAMES[date.getDay()];
}

export function generateWeekDays(weekStartDate: string): DayEntry[] {
  const start = new Date(weekStartDate + "T00:00:00");
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return {
      date: formatDate(d),
      dayOfWeek: getDayName(d),
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

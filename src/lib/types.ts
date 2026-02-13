export type DayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI";

export interface DayEntry {
  date: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  totalHours: string;
  breakMinutes: string;
  kilometers: string;
  notes: string;
}

export interface TimesheetData {
  email: string;
  employeeName: string;
  weekStartDate: string;
  days: DayEntry[];
}

export interface AIExtractionDay {
  date: string;
  dayOfWeek: DayOfWeek;
  work: {
    startTime: string | null;
    endTime: string | null;
    totalHours: number | null;
    breakMinutes: number | null;
    kilometers: number | null;
  };
  notes: string | null;
  confidence: {
    overall: number;
    fields: Record<string, number | null>;
  };
}

export interface AIValidationData {
  supervisor: { name: string | null; signature: string | null };
  approver: { name: string | null; date: string | null };
  client: { name: string | null; project: string | null };
  custom: Record<string, unknown>;
}

export interface AIExtractionResult {
  employee: {
    fullName: string;
    employeeId: string | null;
    email: string | null;
  };
  period: {
    weekStartDate: string;
    weekEndDate: string;
  };
  days: AIExtractionDay[];
  validation: AIValidationData;
  warnings: string[];
  source: {
    fileType: string;
    pageOrImageCount: number;
  };
}

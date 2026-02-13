import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // seconds (Vercel Pro allows up to 300)
export const runtime = "nodejs";

const AI_PROMPT = `You are a timesheet data extraction assistant. Extract working hours from whatever an employee uploads — handwritten notes, photos, spreadsheets, text files, or any other format. Be pragmatic, not analytical. Your goal is to produce a clean timesheet, not to critique the source data.

EMPLOYEE IDENTITY (non-negotiable):
- The employee's name is provided as confirmed context. ALL hours belong to them.
- Other names in the data are references — coworkers, supervisors, customers, clients. The employee is noting who they worked WITH or FOR.
- NEVER exclude hours because another name appears. NEVER warn about employee identity.
- Place other names under "validation" (supervisor, client, custom) and/or in day "notes".

WORK PERIOD:
- Pay weeks can start on ANY day (Fri–Thu, Mon–Fri, Wed–Tue, etc.). This is normal — do not warn about it.
- The first day listed in the data is the start of the pay period.
- Return one day entry per day the employee worked (could be 1–7 days). Order chronologically.
- Set weekStartDate to the first day and weekEndDate to the last day found.

DATE INTERPRETATION:
- The employee's day-of-week labels (e.g., "Friday", "Monday") are the PRIMARY source of truth. The employee knows what day they worked.
- Numeric dates (e.g., 06/02) are SECONDARY. If a numeric date conflicts with the employee's day label, adjust the numeric date to match the day label, not the other way around.
- For example: if the employee writes "Friday 06/02" but 2025-02-06 is a Thursday, the employee means Friday 2025-02-07. Use the day label to find the correct date.
- DD/MM format (e.g., 06/02 = 6th of February) is common outside the US. Use sequential context to determine format.
- To resolve dates: identify the approximate date range from the numeric dates, then assign each entry the nearest calendar date that matches the employee's stated day of week.
- NEVER warn about date/day-of-week mismatches. Just resolve them silently using the day label as primary.

BREAKS:
- If break times are explicitly stated, use them.
- If breaks are NOT mentioned for a worked day, default to 30 minutes (breakMinutes: 30).
- Only set breakMinutes to 0 if the data explicitly says no break was taken.

HOURS:
- If total hours are given, use them directly as totalHours. These are the employee's stated hours — do not second-guess them or warn that breaks may not have been deducted. The employer will review.
- If only start/end times are given, calculate totalHours = (end - start) - breakMinutes/60.
- If only total hours are given with no start/end, set startTime and endTime to null.
- Extract kilometers if present, otherwise null.

NOTES:
- Capture extra details (job sites, client names, tasks, locations, coworker names) in the day's "notes" field.
- These help the employer validate the timesheet.

WARNINGS:
- The warnings array should almost always be empty. Only warn if data is truly unreadable or critically incomplete (e.g., no hours at all for any day, file is corrupt/blank).
- Do NOT warn about: employee identity, non-standard week periods, date formats, day-of-week labels, other people's names, break assumptions, or how totals were calculated.

Return ONLY valid JSON (no markdown, no explanation):
{
  "employee": { "fullName": "string", "employeeId": "string|null", "email": "string|null" },
  "period": { "weekStartDate": "YYYY-MM-DD", "weekEndDate": "YYYY-MM-DD" },
  "days": [
    {
      "date": "YYYY-MM-DD",
      "dayOfWeek": "MON|TUE|WED|THU|FRI|SAT|SUN",
      "work": {
        "startTime": "HH:MM|null",
        "endTime": "HH:MM|null",
        "totalHours": number|null,
        "breakMinutes": number|null,
        "kilometers": number|null
      },
      "notes": "string|null",
      "confidence": {
        "overall": number_between_0_and_1,
        "fields": { "startTime": number|null, "endTime": number|null, "totalHours": number|null, "breakMinutes": number|null, "kilometers": number|null }
      }
    }
  ],
  "validation": {
    "supervisor": { "name": "string|null", "signature": "string|null" },
    "approver": { "name": "string|null", "date": "YYYY-MM-DD|null" },
    "client": { "name": "string|null", "project": "string|null" },
    "custom": {}
  },
  "warnings": [],
  "source": { "fileType": "string", "pageOrImageCount": number }
}

Rules:
- ALL hours belong to the confirmed employee
- One entry per worked day, ordered chronologically
- Dates: YYYY-MM-DD, Times: HH:MM 24h, Confidence: 0–1
- Default breakMinutes: 30 when not stated
- Use totalHours as the employee reported them
- Other names → validation/notes, never used to exclude hours
- Warnings only for truly unreadable/missing data
- JSON ONLY`;

function extractJSON(raw: string): unknown {
  // Strip markdown code fences if the AI wrapped the response
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  return JSON.parse(cleaned);
}

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const employeeName = (formData.get("employeeName") as string | null)?.trim();

    if (!employeeName) {
      return NextResponse.json({ error: "Employee name is required before uploading." }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 }
      );
    }

    const provider = process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai");
    const apiKey =
      process.env.AI_API_KEY ||
      (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined) ||
      (provider === "openai" ? process.env.OPENAI_API_KEY : undefined);

    console.log("[extract] provider:", provider);
    console.log("[extract] AI_API_KEY set:", !!process.env.AI_API_KEY);
    console.log("[extract] ANTHROPIC_API_KEY set:", !!process.env.ANTHROPIC_API_KEY);
    console.log("[extract] OPENAI_API_KEY set:", !!process.env.OPENAI_API_KEY);
    console.log("[extract] ANTHROPIC_BASE_URL:", process.env.ANTHROPIC_BASE_URL || "(not set)");
    console.log("[extract] resolved apiKey present:", !!apiKey);

    if (!apiKey || apiKey === "your_key_here") {
      return NextResponse.json(
        { error: "AI API key not configured. Set AI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY as an environment variable." },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let result: unknown;

    if (provider === "openai") {
      result = await callOpenAI(buffer, file.type, file.name, apiKey, employeeName);
    } else if (provider === "anthropic") {
      result = await callAnthropic(buffer, file.type, file.name, apiKey, employeeName);
    } else {
      return NextResponse.json({ error: `Unknown AI provider: ${provider}` }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function callOpenAI(
  buffer: Buffer,
  contentType: string,
  filename: string,
  apiKey: string,
  employeeName: string
): Promise<unknown> {
  const isImage = contentType.startsWith("image/");
  const promptWithName = `${AI_PROMPT}\n\nCONFIRMED EMPLOYEE: "${employeeName}" — This is the verified submitting employee. All timesheet hours in the uploaded data belong to this person. Any other names are coworkers, supervisors, clients, or references from their notes.`;

  const messages: Array<Record<string, unknown>> = [];
  if (isImage) {
    const base64 = buffer.toString("base64");
    messages.push({
      role: "user",
      content: [
        { type: "text", text: promptWithName },
        { type: "image_url", image_url: { url: `data:${contentType};base64,${base64}` } },
      ],
    });
  } else {
    const text = buffer.toString("utf-8");
    messages.push({
      role: "user",
      content: `${promptWithName}\n\nFile: ${filename}\nContent:\n${text}`,
    });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${await response.text()}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response");
  }
  return extractJSON(content);
}

async function callAnthropic(
  buffer: Buffer,
  contentType: string,
  filename: string,
  apiKey: string,
  employeeName: string
): Promise<unknown> {
  const isImage = contentType.startsWith("image/");
  const promptWithName = `${AI_PROMPT}\n\nCONFIRMED EMPLOYEE: "${employeeName}" — This is the verified submitting employee. All timesheet hours in the uploaded data belong to this person. Any other names are coworkers, supervisors, clients, or references from their notes.`;
  const content: Array<Record<string, unknown>> = [];

  if (isImage) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: contentType, data: buffer.toString("base64") },
    });
  }

  content.push({
    type: "text",
    text: isImage
      ? promptWithName
      : `${promptWithName}\n\nFile: ${filename}\nContent:\n${buffer.toString("utf-8")}`,
  });

  const baseUrl = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const url = `${baseUrl}/v1/messages`;
  console.log("[extract] Anthropic URL:", url);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[extract] Anthropic error response:", response.status, errText);
    throw new Error(`Anthropic error: ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Anthropic returned an empty response");
  }
  return extractJSON(textBlock.text);
}

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // seconds (Vercel Pro allows up to 300)
export const runtime = "nodejs";

const AI_PROMPT = `You are a timesheet data extraction assistant. Your job is to extract working hours from whatever data an employee provides — handwritten notes, photos, spreadsheets, text files, or any other format.

CRITICAL CONTEXT — Employee Identity:
- The submitting employee's name is provided separately as verified context. That person IS the employee. Period.
- ALL hours in the uploaded data belong to that employee unless clearly impossible.
- Any OTHER names appearing in the data (coworkers, supervisors, customers, clients, managers) are contextual notes from the employee's record-keeping process. They do NOT represent separate workers. They may indicate who the employee worked with, who they reported to, or whose job/project they worked on.
- NEVER attribute hours away from the submitting employee because another name appears next to a time entry. The employee is recording who they worked WITH or FOR, not who else worked.
- Place any non-employee names under "validation" as supervisor, client, or custom metadata.

CRITICAL CONTEXT — Work Week Period:
- Different companies use different pay week start days. A work week does NOT always run Monday to Friday.
- Determine the actual work period from the data provided. If the first day listed is a Friday, that Friday is the START of the pay period, not the end.
- Examine the dates/days in the data and infer the 5-day work period accordingly (e.g., Fri–Thu, Mon–Fri, Wed–Tue, etc.).
- Set "weekStartDate" and "weekEndDate" to reflect the actual period found in the data.
- Always return exactly 5 day entries covering the work period, ordered chronologically.

CRITICAL CONTEXT — Breaks:
- If break times are explicitly provided in the data, use those values.
- If break times are NOT mentioned at all for a worked day, default to 30 minutes (breakMinutes: 30). Employees are assumed to take at least a 30-minute break per worked day.
- Only set breakMinutes to null/0 if the data explicitly states no break was taken.

CRITICAL CONTEXT — Hours Extraction:
- Extract totalHours, startTime, and endTime where available.
- If only total hours are given (no start/end times), record totalHours and leave startTime/endTime null.
- If only start/end times are given, calculate totalHours from them minus breakMinutes.
- Kilometers (km travelled) should be extracted if present, otherwise null.

CRITICAL CONTEXT — Notes and Extra Details:
- Any detail beyond hours, breaks, and km (e.g., job descriptions, client names, locations, tasks performed, coworker names) should be captured in the "notes" field for that day.
- These notes help the employer validate and cross-reference the timesheet.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation, no commentary:
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
- Every submission is for ONE employee — ALL hours belong to them
- Return exactly 5 day entries for the work period found in the data
- Dates in YYYY-MM-DD format
- Times in HH:MM 24-hour format
- Confidence values between 0 and 1
- If a day has no data, set all work fields to null with confidence 0 (but still include breakMinutes: 30 if it falls within the work period)
- Names of other people go under "validation" or in day "notes" as context — never use them to exclude hours from the submitting employee
- The "custom" object under "validation" captures any other non-employee metadata as key-value pairs
- Only produce warnings for genuinely ambiguous or missing data — do NOT warn about the employee's identity (it is confirmed) or about non-standard week periods (these are normal)
- Return JSON ONLY, no wrapping markdown`;

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

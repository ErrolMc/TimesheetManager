import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // seconds (Vercel Pro allows up to 300)
export const runtime = "nodejs";

const AI_PROMPT = `You are a timesheet data extraction assistant. Each form submission belongs to a single employee. Your job is to extract that employee's timesheet data.

Any information that does NOT belong to the submitting employee — such as supervisor names, manager signatures, client details, approver info, or company metadata — is validation context. Extract it separately under the "validation" key.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation, no commentary:
{
  "employee": { "fullName": "string", "employeeId": "string|null", "email": "string|null" },
  "period": { "weekStartDate": "YYYY-MM-DD", "weekEndDate": "YYYY-MM-DD" },
  "days": [
    {
      "date": "YYYY-MM-DD",
      "dayOfWeek": "MON|TUE|WED|THU|FRI",
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
- Every submission is for ONE employee — extract only their timesheet hours
- Exactly 5 days (Monday-Friday)
- Dates in YYYY-MM-DD format
- Times in HH:MM 24-hour format
- Confidence values between 0 and 1
- If a day has no data, set all work fields to null with confidence 0
- Any names, signatures, or references to people other than the submitting employee go under "validation"
- The "custom" object under "validation" captures any other non-employee metadata as key-value pairs
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
  const promptWithName = `${AI_PROMPT}\n\nThe submitting employee's name is: "${employeeName}". Use this as context to identify which data belongs to them.`;

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
  const promptWithName = `${AI_PROMPT}\n\nThe submitting employee's name is: "${employeeName}". Use this as context to identify which data belongs to them.`;
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

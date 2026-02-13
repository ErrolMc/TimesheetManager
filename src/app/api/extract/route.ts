import { NextRequest, NextResponse } from "next/server";

const AI_PROMPT = `You are a timesheet data extraction assistant. Extract structured timesheet data from the provided content.

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
  "warnings": [],
  "source": { "fileType": "string", "pageOrImageCount": number }
}

Rules:
- Exactly 5 days (Monday-Friday)
- Dates in YYYY-MM-DD format
- Times in HH:MM 24-hour format
- Confidence values between 0 and 1
- If a day has no data, set all work fields to null with confidence 0
- Return JSON ONLY, no wrapping markdown`;

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

    const provider = process.env.AI_PROVIDER || "openai";
    const apiKey = process.env.AI_API_KEY;

    if (!apiKey || apiKey === "your_key_here") {
      return NextResponse.json(
        { error: "AI API key not configured. Set AI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let result: unknown;

    if (provider === "openai") {
      result = await callOpenAI(buffer, file.type, file.name, apiKey);
    } else if (provider === "anthropic") {
      result = await callAnthropic(buffer, file.type, file.name, apiKey);
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
  apiKey: string
): Promise<unknown> {
  const isImage = contentType.startsWith("image/");

  const messages: Array<Record<string, unknown>> = [];
  if (isImage) {
    const base64 = buffer.toString("base64");
    messages.push({
      role: "user",
      content: [
        { type: "text", text: AI_PROMPT },
        { type: "image_url", image_url: { url: `data:${contentType};base64,${base64}` } },
      ],
    });
  } else {
    const text = buffer.toString("utf-8");
    messages.push({
      role: "user",
      content: `${AI_PROMPT}\n\nFile: ${filename}\nContent:\n${text}`,
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
  return JSON.parse(data.choices[0].message.content);
}

async function callAnthropic(
  buffer: Buffer,
  contentType: string,
  filename: string,
  apiKey: string
): Promise<unknown> {
  const isImage = contentType.startsWith("image/");
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
      ? AI_PROMPT
      : `${AI_PROMPT}\n\nFile: ${filename}\nContent:\n${buffer.toString("utf-8")}`,
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic error: ${await response.text()}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((b: { type: string }) => b.type === "text");
  return JSON.parse(textBlock.text);
}

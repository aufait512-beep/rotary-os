import { NextResponse } from "next/server";

type ParseRequest = {
  inputText?: string;
  activeYear?: {
    name?: string;
    displayName?: string;
    startDate?: string;
    endDate?: string;
  };
};

const eventSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    event_type: { type: "string" },
    event_name: { type: "string" },
    meeting_no: { type: "string" },
    date: { type: "string" },
    dinner_time: { type: "string" },
    meeting_time: { type: "string" },
    end_time: { type: "string" },
    location: { type: "string" },
    speaker: { type: "string" },
    topic: { type: "string" },
    fellowship_chair: { type: "string" },
    sergeant_at_arms: { type: "string" },
    description: { type: "string" },
    note: { type: "string" },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "event_type",
    "event_name",
    "meeting_no",
    "date",
    "dinner_time",
    "meeting_time",
    "end_time",
    "location",
    "speaker",
    "topic",
    "fellowship_chair",
    "sergeant_at_arms",
    "description",
    "note",
    "warnings",
  ],
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Jade AI 尚未設定 API 金鑰，請在伺服器環境變數設定 OPENAI_API_KEY。" },
      { status: 500 }
    );
  }

  let body: ParseRequest;
  try {
    body = (await request.json()) as ParseRequest;
  } catch {
    return NextResponse.json({ error: "請提供可解析的 JSON 請求。" }, { status: 400 });
  }

  const inputText = body.inputText?.trim();
  if (!inputText) {
    return NextResponse.json({ error: "請貼上活動文字。" }, { status: 400 });
  }

  const activeYear = body.activeYear;
  const prompt = buildPrompt(inputText, activeYear);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You are Jade AI for Rotary OS. Extract event data from Traditional Chinese Rotary club messages. Return only schema-valid JSON. Never invent details that are not inferable; use empty strings and warnings.",
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "rotary_event_parse",
            schema: eventSchema,
            strict: true,
          },
        },
      }),
    });

    const result = (await response.json()) as {
      output_text?: string;
      error?: { message?: string };
      output?: Array<{
        content?: Array<{ text?: string }>;
      }>;
    };

    if (!response.ok) {
      console.error("Jade AI parse failed", result);
      return NextResponse.json(
        { error: result.error?.message || "AI 解析失敗，請稍後再試。" },
        { status: response.status }
      );
    }

    const outputText =
      result.output_text ||
      result.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text ||
      "";

    if (!outputText) {
      return NextResponse.json({ error: "AI 沒有回傳可讀取的結果。" }, { status: 502 });
    }

    return NextResponse.json({ event: normalizeParsedEvent(JSON.parse(outputText)) });
  } catch (error) {
    console.error("Jade AI parse unexpected error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 解析發生未知錯誤。" },
      { status: 500 }
    );
  }
}

function buildPrompt(inputText: string, activeYear: ParseRequest["activeYear"]) {
  return `
請解析以下活動文字，輸出符合 JSON schema 的活動資料。

目前 active 年度：
- name: ${activeYear?.name || ""}
- display_name: ${activeYear?.displayName || ""}
- start_date: ${activeYear?.startDate || ""}
- end_date: ${activeYear?.endDate || ""}

規則：
1. date 必須是 YYYY-MM-DD。若只有 7/22，請依 active 年度推斷年份。
2. 若日期無法推斷，date 留空並加入 warnings。
3. meeting_no 只保留數字。若文字出現「第26次例會」且是高雄晨光扶輪社 2026-2027 年度，請輸出 426。
4. 時間必須是 HH:mm。若文字為 8:30 / 9:15 / 0:10 且語境是晚上例會，請分別正規化為 18:30 / 19:15 / 20:10。
5. 若缺少 dinner_time、meeting_time、end_time，請使用 18:30、19:15、20:10，並在 warnings 說明是預設時間。
6. 不要輸出 undefined 或 null，未知欄位用空字串。
7. speaker 是主講人，topic 是主題，location 可包含地點與樓層。
8. fellowship_chair 是聯誼長，sergeant_at_arms 是糾察長。
9. description 放活動說明，note 放其他備註或不確定資訊。

活動文字：
${inputText}
`;
}

function normalizeParsedEvent(value: Record<string, unknown>) {
  return {
    event_type: stringValue(value.event_type),
    event_name: stringValue(value.event_name),
    meeting_no: stringValue(value.meeting_no),
    date: stringValue(value.date),
    dinner_time: stringValue(value.dinner_time),
    meeting_time: stringValue(value.meeting_time),
    end_time: stringValue(value.end_time),
    location: stringValue(value.location),
    speaker: stringValue(value.speaker),
    topic: stringValue(value.topic),
    fellowship_chair: stringValue(value.fellowship_chair),
    sergeant_at_arms: stringValue(value.sergeant_at_arms),
    description: stringValue(value.description),
    note: stringValue(value.note),
    warnings: Array.isArray(value.warnings) ? value.warnings.map(stringValue).filter(Boolean) : [],
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

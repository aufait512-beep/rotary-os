import { NextRequest, NextResponse } from "next/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://vmwjmtrugqlhyecovysl.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_cZAZwCZXU9eXTGCdP6SJIA_ipsTnfL_";

const headers = {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`,
  "Content-Type": "application/json",
};

export async function GET() {
  const [plansResponse, boardResponse] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/donation_plans?select=*&status=eq.open&order=category,sort_order`,
      { headers, cache: "no-store" }
    ),
    fetch(`${supabaseUrl}/rest/v1/rpc/public_donation_board`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_access_token: null }),
      cache: "no-store",
    }),
  ]);

  if (!plansResponse.ok || !boardResponse.ok) {
    return NextResponse.json(
      { error: "捐獻總表暫時無法讀取" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    plans: await plansResponse.json(),
    board: await boardResponse.json(),
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    memberPublicKey?: string;
    planId?: string;
    quantity?: number;
    billingMonth?: string;
  };

  if (
    !body.memberPublicKey ||
    !body.planId ||
    !Number.isInteger(body.quantity) ||
    Number(body.quantity) < 0 ||
    Number(body.quantity) > 10 ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.billingMonth ?? "")
  ) {
    return NextResponse.json({ error: "填寫內容不完整" }, { status: 400 });
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/set_public_donation_units`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_member_public_key: body.memberPublicKey,
        p_plan_id: body.planId,
        p_quantity: body.quantity,
        p_billing_month: body.billingMonth,
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: "認捐資料無法儲存，請確認該筆資料尚未入帳。" },
      { status: response.status }
    );
  }

  return NextResponse.json({ ok: true });
}


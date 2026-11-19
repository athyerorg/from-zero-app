// confirm-payment — the ONLY place a membership is activated.
// Two ways in:
//   1) The browser, after Moyasar sends the customer back: POST { id } with the user's sign-in token.
//   2) Moyasar's webhook (payment_paid): POST { type, secret_token, data: { id } }.
// Either way we never trust what we were told: we ask Moyasar for the payment ourselves (with the
// SECRET key, which lives only here), check amount + status + which user it was for, then write the
// membership with the service role (the browser can never write memberships).
//
// Secrets (Supabase → Edge Functions → Secrets): MOYASAR_SECRET_KEY, MOYASAR_WEBHOOK_SECRET (optional).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from "npm:@supabase/supabase-js@2";

const PLAN = { amount: 4900, currency: "SAR", days: 30 }; // 49 SAR, in halalas
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const secret = Deno.env.get("MOYASAR_SECRET_KEY");
  if (!secret) return json({ error: "MOYASAR_SECRET_KEY is not set" }, 500);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // Who is asking? A signed-in user (browser) or Moyasar (webhook).
  let userId: string | null = null;
  let paymentId: string | null = null;
  if (body.type && body.data?.id) {
    const want = Deno.env.get("MOYASAR_WEBHOOK_SECRET");
    if (want && body.secret_token !== want) return json({ error: "bad webhook secret" }, 401);
    if (body.type !== "payment_paid") return json({ ok: true, ignored: body.type });
    paymentId = String(body.data.id);
  } else {
    const auth = req.headers.get("Authorization") || "";
    const { data: { user } } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!user) return json({ error: "not signed in" }, 401);
    userId = user.id;
    paymentId = String(body.id || "");
  }
  if (!paymentId || !/^[\w-]{10,}$/.test(paymentId)) return json({ error: "no payment id" }, 400);

  // Ask Moyasar. Basic auth = secret key as the username, empty password.
  const r = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
    headers: { Authorization: "Basic " + btoa(secret + ":") },
  });
  if (!r.ok) return json({ error: "payment not found at Moyasar", status: r.status }, 404);
  const p = await r.json();

  const forUser = p.metadata?.user_id ? String(p.metadata.user_id) : null;
  if (!forUser) return json({ error: "payment has no user" }, 400);
  if (userId && userId !== forUser) return json({ error: "this payment is not yours" }, 403);
  if (p.status !== "paid") return json({ ok: false, status: p.status, message: p.source?.message || "" });
  if (p.amount !== PLAN.amount || p.currency !== PLAN.currency) return json({ error: "wrong amount" }, 400);

  const paidAt = new Date();
  const expires = new Date(paidAt.getTime() + PLAN.days * 86400000);
  const { error } = await admin.from("memberships").upsert({
    user_id: forUser, status: "active", provider: "moyasar", reference: p.id,
    paid_at: paidAt.toISOString(), expires_at: expires.toISOString(),
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, status: "paid" });
});

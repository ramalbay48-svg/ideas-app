// IDEAS APP — SplashPay webhook receiver (logging-only safety phase)
// Verifies SplashPay's documented HMAC-SHA256 signature and stores events.
// IMPORTANT: This version deliberately DOES NOT mark purchases as paid.
// Payment reconciliation/unlocking must be added only after the payment-initiation
// flow writes a unique merchant reference and status verification is implemented.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-splashpay-signature, x-splashpay-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("SPLASHPAY_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Fail closed until the distinct SplashPay webhook secret is configured.
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "Webhook is not configured" }, 503);
  }

  const timestamp = req.headers.get("x-splashpay-timestamp") ?? "";
  const signature = req.headers.get("x-splashpay-signature") ?? "";
  if (!/^\d{10,13}$/.test(timestamp)) return json({ error: "Invalid timestamp" }, 401);

  // SplashPay documents a Unix timestamp. Accept seconds or milliseconds,
  // with a five-minute clock-skew window to reduce replay risk.
  const numericTimestamp = Number(timestamp);
  const timestampMs = timestamp.length > 10 ? numericTimestamp : numericTimestamp * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return json({ error: "Expired timestamp" }, 401);
  }

  const rawBody = await req.text();
  if (rawBody.length === 0 || rawBody.length > 256_000) {
    return json({ error: "Invalid payload size" }, 400);
  }

  const supplied = hexToBytes(signature);
  if (!supplied) return json({ error: "Invalid signature format" }, 401);

  const expectedHex = await hmacSha256Hex(webhookSecret, `${timestamp}.${rawBody}`);
  const expected = hexToBytes(expectedHex);
  if (!expected || !constantTimeEqual(supplied, expected)) {
    return json({ error: "Invalid signature" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const allowedEvents = new Set([
    "payment.success",
    "payment.failed",
    "payment.cancelled",
    "payment.expired",
    "payment.user_cancelled",
    "payment.in_progress",
    "payment.pending",
    "payment.rejected",
  ]);

  const event = payload.event;
  const data = payload.data;
  if (typeof event !== "string" || !allowedEvents.has(event) ||
      !data || typeof data !== "object" || Array.isArray(data)) {
    return json({ error: "Unsupported webhook payload" }, 400);
  }

  const payment = data as Record<string, unknown>;
  if (typeof payment.reference !== "string" || payment.reference.length < 1 ||
      typeof payment.amount !== "string" && typeof payment.amount !== "number" ||
      payment.currency !== "TZS") {
    return json({ error: "Missing or invalid payment fields" }, 400);
  }

  // A deterministic digest makes identical provider retries idempotent even
  // though the sample payload does not include a unique event ID.
  const eventId = await sha256Hex(`${timestamp}.${rawBody}`);
  const databaseResponse = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/splashpay_webhook_events?on_conflict=event_id`,
    {
      method: "POST",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({
        event_id: eventId,
        provider_reference: payment.reference,
        event_type: event,
        payload,
      }),
    },
  );

  if (!databaseResponse.ok) {
    // Non-2xx makes SplashPay retry; never acknowledge an event we failed to store.
    return json({ error: "Could not persist webhook event" }, 500);
  }

  // Reconcile only against a payment row created by our authenticated initiation function.
  // The SQL function checks the exact TZS amount and updates the payment + purchase atomically.
  const reconcileResponse = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/process_splashpay_payment`,
    {
      method: "POST",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_reference: payment.reference,
        p_amount: Number(payment.amount),
        p_event: event,
        p_payload: payload,
      }),
    },
  );

  if (!reconcileResponse.ok) {
    const detail = await reconcileResponse.text();
    await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/splashpay_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ processing_error: detail.slice(0, 1000) }),
      },
    );
    return json({ error: "Payment reconciliation failed" }, 500);
  }

  const reconciliation = await reconcileResponse.json();
  if (!reconciliation?.matched) {
    return json({ error: "Payment reference is not linked to a pending IDEAS APP purchase" }, 500);
  }

  await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/splashpay_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ processed_at: new Date().toISOString(), processing_error: null }),
    },
  );

  return json({ success: true, received: true, processed: true, payment: reconciliation });
});

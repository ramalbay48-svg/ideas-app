// IDEAS APP — start a real SplashPay mobile-money collection.
// API credentials stay on the server. A purchase is never marked paid here;
// only the signed webhook reconciliation function can unlock the slip.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const splashKey = Deno.env.get("SPLASHPAY_API_KEY");
  const splashSecret = Deno.env.get("SPLASHPAY_API_SECRET");
  if (!supabaseUrl || !serviceKey || !anonKey || !splashKey || !splashSecret) {
    return reply({ error: "Payment service is not fully configured." }, 503);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return reply({ error: "Please log in." }, 401);

  // Verify the caller's Supabase session before using the service-role key.
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!userResponse.ok) return reply({ error: "Your session is invalid. Please log in again." }, 401);
  const user = await userResponse.json();
  if (!user?.id) return reply({ error: "Could not verify your account." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid request body." }, 400);
  }

  const slipId = typeof body.slip_id === "string" ? body.slip_id : "";
  const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const customerName = typeof body.customer_name === "string" ? body.customer_name.trim() : "";
  const customerEmail = typeof body.customer_email === "string" ? body.customer_email.trim() : "";
  const provider = typeof body.provider === "string" ? body.provider : "";

  if (!/^[0-9a-f-]{36}$/i.test(slipId)) return reply({ error: "Choose a valid betslip." }, 400);
  if (!/^255[67][0-9]{8}$/.test(phone)) return reply({ error: "Enter a valid Tanzanian mobile number." }, 400);
  if (customerName.length < 2 || customerName.length > 100) return reply({ error: "Enter your full name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return reply({ error: "Enter a valid email address." }, 400);
  if (!["M-Pesa", "Tigo Pesa", "Airtel Money", "HaloPesa"].includes(provider)) {
    return reply({ error: "Choose a supported mobile money network." }, 400);
  }

  const base = supabaseUrl.replace(/\/$/, "");
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // Load the authoritative slip price and ownership from Supabase.
  const slipUrl = new URL(`${base}/rest/v1/betslips`);
  slipUrl.searchParams.set("select", "id,price_tzs,expires_at,status,tipster_id,tipsters!inner(user_id,status)");
  slipUrl.searchParams.set("id", `eq.${slipId}`);
  const slipResponse = await fetch(slipUrl, { headers: dbHeaders });
  if (!slipResponse.ok) return reply({ error: "Could not verify the betslip." }, 500);
  const slips = await slipResponse.json();
  const slip = slips?.[0];
  if (!slip || slip.status !== "published" || slip.tipsters?.status !== "approved" || new Date(slip.expires_at).getTime() <= Date.now()) {
    return reply({ error: "This betslip is unavailable or expired." }, 404);
  }
  if (slip.tipsters?.user_id === user.id) return reply({ error: "You cannot buy your own betslip." }, 403);

  const amount = Number(slip.price_tzs);
  if (!Number.isSafeInteger(amount) || amount < 1) return reply({ error: "Invalid betslip price." }, 400);

  // Reuse the buyer's single purchase row; never reset an already-paid purchase.
  const purchaseUrl = new URL(`${base}/rest/v1/purchases`);
  purchaseUrl.searchParams.set("on_conflict", "customer_id,slip_id");
  const purchaseInsert = await fetch(purchaseUrl, {
    method: "POST",
    headers: { ...dbHeaders, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ customer_id: user.id, slip_id: slipId, amount_tzs: amount, status: "pending" }),
  });
  if (!purchaseInsert.ok) return reply({ error: "Could not create your purchase record." }, 500);

  const purchaseLookup = new URL(`${base}/rest/v1/purchases`);
  purchaseLookup.searchParams.set("select", "id,status,amount_tzs");
  purchaseLookup.searchParams.set("customer_id", `eq.${user.id}`);
  purchaseLookup.searchParams.set("slip_id", `eq.${slipId}`);
  const purchaseResponse = await fetch(purchaseLookup, { headers: dbHeaders });
  if (!purchaseResponse.ok) return reply({ error: "Could not load your purchase." }, 500);
  const purchases = await purchaseResponse.json();
  const purchase = purchases?.[0];
  if (!purchase) return reply({ error: "Purchase record was not found." }, 500);
  if (purchase.status === "paid") return reply({ already_paid: true, message: "This betslip is already unlocked." });
  if (Number(purchase.amount_tzs) !== amount) return reply({ error: "Purchase price mismatch." }, 409);

  const reference = `IDEAS-${crypto.randomUUID()}`;
  const paymentInsert = await fetch(`${base}/rest/v1/payment_transactions`, {
    method: "POST",
    headers: { ...dbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({
      purchase_id: purchase.id,
      provider: "SplashPay",
      provider_reference: reference,
      phone: `+${phone}`,
      amount_tzs: amount,
      status: "pending",
    }),
  });
  if (!paymentInsert.ok) return reply({ error: "Could not create a secure payment record." }, 500);

  // SplashPay automatically routes supported Tanzanian mobile numbers.
  const idemKey = reference;
  let splashResponse: Response;
  try {
    splashResponse = await fetch("https://api.splashpay.co.tz/api/v1/payments/mobile-money", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": splashKey,
        "X-API-SECRET": splashSecret,
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify({
        amount,
        currency: "TZS",
        reference,
        phone,
        customer_name: customerName,
        customer_email: customerEmail,
        metadata: { purchase_id: purchase.id, slip_id: slipId, customer_id: user.id },
      }),
    });
  } catch {
    await fetch(`${base}/rest/v1/payment_transactions?provider_reference=eq.${encodeURIComponent(reference)}`, {
      method: "PATCH",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ status: "failed" }),
    });
    return reply({ error: "SplashPay could not be reached. No payment confirmation was received." }, 502);
  }

  const splashPayload = await splashResponse.json().catch(() => ({}));
  if (!splashResponse.ok || splashPayload?.status !== "success" || !splashPayload?.data?.reference) {
    await fetch(`${base}/rest/v1/payment_transactions?provider_reference=eq.${encodeURIComponent(reference)}`, {
      method: "PATCH",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ status: "failed", provider_payload: splashPayload }),
    });
    return reply({
      error: splashPayload?.message || "SplashPay did not accept the payment request.",
      provider_code: splashPayload?.code || null,
    }, 502);
  }

  await fetch(`${base}/rest/v1/payment_transactions?provider_reference=eq.${encodeURIComponent(reference)}`, {
    method: "PATCH",
    headers: { ...dbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ provider_payload: splashPayload }),
  });

  return reply({
    success: true,
    reference,
    amount_tzs: amount,
    status: splashPayload.data.status || "pending",
    message: "Payment prompt initiated. Approve it on your mobile money phone. Your betslip stays locked until SplashPay confirms success.",
  });
});

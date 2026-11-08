// IDEAS APP Management Portal. Browser uses only the Supabase publishable key.
(() => {
  const URL = "https://hclgguciyhdqaqsvuddp.supabase.co";
  const KEY = "sb_publishable_6WzBBcoIz8YABVp2KlHh8A_vSOOKbJU";
  const $ = (id) => document.getElementById(id);
  const client = window.supabase?.createClient(URL, KEY);
  let user = null, profile = null, tipster = null;
  const status = (msg) => $("connectionStatus").textContent = msg;
  const error = (msg) => $("workspaceError").textContent = msg || "";
  const alias = (raw) => "255" + raw + "@ideasapp.invalid";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  if (!client) { status("Database library did not load. Refresh the page."); return; }
  status("Database connection ready. Sign in with your customer app account.");

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("loginButton").disabled = true; $("loginError").textContent = "";
    const raw = $("phone").value.replace(/\D/g,"");
    if (!/^[67]\d{8}$/.test(raw)) { $("loginError").textContent = "Enter 9 digits after +255."; $("loginButton").disabled = false; return; }
    try {
      const {data,error} = await client.auth.signInWithPassword({email:alias(raw),password:$("password").value});
      if (error) throw error;
      await enter(data.user);
    } catch (e) { $("loginError").textContent = e.message || "Sign in failed."; }
    finally { $("loginButton").disabled = false; }
  });

  async function enter(authUser) {
    user = authUser;
    const {data,error:profileError} = await client.from("profiles").select("id,phone,display_name,role").eq("id",user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!data) throw new Error("Your profile could not be found. Please contact the app administrator.");
    profile = data;
    $("loginPanel").classList.add("hidden");
    $("workspace").classList.remove("hidden");
    $("welcomeTitle").textContent = "Welcome" + (profile.display_name ? ", " + profile.display_name : "");
    $("accountPhone").textContent = profile.phone || "IDEAS APP account";
    $("roleLabel").textContent = String(profile.role || "customer").toUpperCase() + " WORKSPACE";
    if (profile.role === "admin") {
      $("roleNotice").textContent = "Administrator access: review tipster applications. Decisions are checked and recorded by the database.";
      $("adminPanel").classList.remove("hidden");
      $("auditPanel").classList.remove("hidden");
      $("applyPanel").classList.add("hidden");
      await loadApplications();
      await loadAuditLogs();
    } else if (profile.role === "tipster") {
      $("roleNotice").textContent = "Tipster access: create and manage your marketplace listings.";
      $("tipsterPanel").classList.remove("hidden");
      await loadTipster();
    } else {
      $("roleNotice").textContent = "Customer account: apply below to become a tipster. Publishing access starts only after admin approval.";
      $("applyPanel").classList.remove("hidden");
      await checkApplication();
    }
  }

  async function checkApplication() {
    const {data,error:e} = await client.from("tipsters").select("username,status,bio").eq("user_id",user.id).maybeSingle();
    if (e) throw e;
    if (data) {
      $("applicationStatus").textContent = "Your application @" + data.username + " is " + data.status + ".";
      $("applyForm").classList.add("hidden");
    }
  }

  $("applyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = $("username").value.trim();
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return $("applicationStatus").textContent = "Use 3–24 letters, numbers or underscores.";
    const button = e.submitter; button.disabled = true;
    try {
      const {error:e2} = await client.from("tipsters").insert({user_id:user.id,username,bio:$("bio").value.trim(),status:"pending"});
      if (e2) throw e2;
      $("applicationStatus").textContent = "Application submitted. An administrator must review it.";
      $("applyForm").classList.add("hidden");
    } catch (e2) { $("applicationStatus").textContent = e2.message || "Could not submit application."; }
    finally { button.disabled = false; }
  });

  async function loadApplications() {
    $("applicationList").textContent = "Loading applications…";
    const {data,error:e} = await client.from("tipsters").select("id,user_id,username,bio,status,created_at,profiles(display_name,phone)").order("created_at",{ascending:false});
    if (e) throw e;
    if (!data?.length) { $("applicationList").textContent = "No tipster applications yet."; return; }
    $("applicationList").innerHTML = data.map(t => '<article class="record"><div class="record-head"><div><strong>@'+esc(t.username)+'</strong><small>'+esc(t.profiles?.display_name || "Applicant")+' · '+esc(t.profiles?.phone || "")+'</small></div><span class="tag">'+esc(t.status)+'</span></div><p class="muted">'+esc(t.bio || "No bio provided")+'</p>'+(t.status === "pending" ? '<div class="record-actions"><button class="approve" data-approve="'+t.id+'">Approve</button><button class="reject" data-reject="'+t.id+'">Reject</button></div>' : '')+'</article>').join("");
    $("applicationList").querySelectorAll("[data-approve]").forEach(b => b.addEventListener("click", () => reviewTipster(b.dataset.approve,"approved")));
    $("applicationList").querySelectorAll("[data-reject]").forEach(b => b.addEventListener("click", () => reviewTipster(b.dataset.reject,"rejected")));
  }

  async function reviewTipster(id, decision) {
    error("");
    try {
      const {data,error:e} = await client.rpc("review_tipster_application", {
        p_tipster_id:id, p_decision:decision, p_reason:null
      });
      if (e) throw e;
      if (!data?.success) throw new Error("The database did not confirm the decision.");
      await loadApplications();
      await loadAuditLogs();
    } catch (e) { error("Could not update application: " + (e.message || "Unknown error")); }
  }

  async function loadAuditLogs() {
    $("auditList").textContent = "Loading recent admin activity…";
    const {data,error:e} = await client.from("admin_audit_logs")
      .select("action,target_type,target_id,reason,created_at,details")
      .order("created_at",{ascending:false}).limit(20);
    if (e) throw e;
    if (!data?.length) { $("auditList").textContent = "No admin actions have been recorded yet."; return; }
    $("auditList").innerHTML = data.map(a => '<article class="record"><strong>'+esc(a.action.replaceAll("_"," "))+'</strong><small>'+esc(new Date(a.created_at).toLocaleString())+'</small><p class="muted">'+esc(a.details?.username ? "@"+a.details.username : a.target_type || "")+(a.reason ? " · "+esc(a.reason) : "")+'</p></article>').join("");
  }

  async function loadTipster() {
    const {data,error:e} = await client.from("tipsters").select("id,username,status").eq("user_id",user.id).maybeSingle();
    if (e) throw e;
    tipster = data;
    if (!tipster || tipster.status !== "approved") throw new Error("Your tipster account is not approved.");
    await loadMySlips();
  }

  $("slipForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("slipStatus").textContent = "";
    const button = e.submitter; button.disabled = true;
    try {
      if (!tipster) await loadTipster();
      const expiry = new Date($("expiry").value);
      if (!(expiry > new Date())) throw new Error("Choose a future expiry date and time.");
      const payload = {tipster_id:tipster.id,total_odds:Number($("odds").value),price_tzs:Math.round(Number($("price").value)),betting_company:$("company").value,expires_at:expiry.toISOString(),status:"published"};
      const {error:e2} = await client.from("betslips").insert(payload);
      if (e2) throw e2;
      $("slipStatus").textContent = "Listing published. It should now appear in the customer app marketplace.";
      $("slipForm").reset();
      await loadMySlips();
    } catch (e2) { $("slipStatus").textContent = e2.message || "Could not publish listing."; }
    finally { button.disabled = false; }
  });

  async function loadMySlips() {
    const {data,error:e} = await client.from("betslips").select("id,total_odds,price_tzs,betting_company,expires_at,status,created_at").eq("tipster_id",tipster.id).order("created_at",{ascending:false});
    if (e) throw e;
    if (!data?.length) { $("mySlips").textContent = "You have not published any listings yet."; return; }
    $("mySlips").innerHTML = data.map(s => '<article class="record"><div class="record-head"><strong>'+esc(s.betting_company)+' · Odds '+esc(s.total_odds)+'</strong><span class="tag">'+esc(s.status)+'</span></div><small>'+esc(new Date(s.expires_at).toLocaleString())+' · TZS '+Number(s.price_tzs).toLocaleString("en-US")+'</small></article>').join("");
  }

  $("logoutButton").addEventListener("click", async () => {
    await client.auth.signOut(); user = null; profile = null; tipster = null;
    $("workspace").classList.add("hidden"); $("loginPanel").classList.remove("hidden");
    $("adminPanel").classList.add("hidden"); $("auditPanel").classList.add("hidden"); $("tipsterPanel").classList.add("hidden"); $("applyPanel").classList.add("hidden");
    $("loginForm").reset(); $("workspaceError").textContent = "";
  });

  client.auth.getSession().then(async ({data}) => {
    if (data.session?.user) {
      try { await enter(data.session.user); }
      catch (e) { error(e.message || "Could not load workspace."); }
    }
  });
})();

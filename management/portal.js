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
    if (profile.role !== "admin") {
      throw new Error("This app is for administrators only. Please use the IDEAS APP Tipster app or Customer app.");
    }
    $("loginPanel").classList.add("hidden");
    $("workspace").classList.remove("hidden");
    $("welcomeTitle").textContent = "Welcome" + (profile.display_name ? ", " + profile.display_name : "");
    $("accountPhone").textContent = profile.phone || "IDEAS APP account";
    $("roleLabel").textContent = "ADMINISTRATOR WORKSPACE";
    $("roleNotice").textContent = "Administrator access: review tipster applications. Decisions are checked and recorded by the database.";
    $("adminPanel").classList.remove("hidden");
    $("resultsPanel").classList.remove("hidden");
    $("auditPanel").classList.remove("hidden");
    await loadApplications();
    await renderAdminTools();
    await loadResultSubmissions();
    await loadAuditLogs();
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
      const {error:e} = await client.rpc("admin_review_tipster", {
        p_tipster_id:id, p_decision:decision, p_reason:null
      });
      if (e) throw e;
      await loadApplications();
      await loadAuditLogs();
    } catch (e) { error("Could not update application: " + (e.message || "Unknown error")); }
  }


  async function renderAdminTools() {
    let tools = $("adminToolsPanel");
    if (!tools) {
      tools = document.createElement("section");
      tools.id = "adminToolsPanel";
      tools.className = "panel";
      $("adminPanel").appendChild(tools);
    }
    tools.innerHTML = '<div class="panel-heading"><div><p class="eyebrow">ADMIN CONTROLS</p><h3>Manage tipster profiles</h3></div></div><div id="managedTipsters" class="records">Loading tipsters…</div><div class="subheading">Customer app banners</div><form id="bannerForm"><label>Banner title</label><input id="bannerTitle" maxlength="80" required><label>Banner message</label><textarea id="bannerMessage" maxlength="240" rows="2" required></textarea><label>Optional banner image URL</label><input id="bannerImage" type="url" placeholder="https://…"><label><input id="bannerActive" type="checkbox" checked> Show this banner in Customer App</label><button class="primary">Save banner</button></form><p class="hint" id="bannerStatus"></p><div id="bannerList" class="records">Loading banners…</div>';
    await loadManagedTipsters();
    await loadBanners();
    $("bannerForm").addEventListener("submit", saveBanner);
  }

  async function loadManagedTipsters() {
    const root = $("managedTipsters");
    const {data,error:e} = await client.from("tipsters").select("id,user_id,username,bio,status,profiles(display_name,phone)").order("created_at",{ascending:false});
    if (e) { root.textContent = "Could not load tipsters: " + e.message; return; }
    if (!data?.length) { root.textContent = "No tipsters found."; return; }
    root.innerHTML = data.map(t => '<article class="record"><div class="record-head"><strong>@'+esc(t.username)+'</strong><span class="tag">'+esc(t.status)+'</span></div><small>'+esc(t.profiles?.display_name||"")+' · '+esc(t.profiles?.phone||"")+'</small><label>Display name</label><input data-display="'+t.id+'" value="'+esc(t.profiles?.display_name||"")+'" maxlength="60"><label>Username</label><input data-username="'+t.id+'" value="'+esc(t.username)+'" maxlength="24"><label>Description</label><textarea data-bio="'+t.id+'" rows="2" maxlength="240">'+esc(t.bio||"")+'</textarea><div class="record-actions"><button class="approve" data-save-tipster="'+t.id+'">Save changes</button><button class="reject" data-remove-tipster="'+t.id+'">Remove tipster</button></div></article>').join("");
    root.querySelectorAll("[data-save-tipster]").forEach(b=>b.addEventListener("click",()=>saveTipster(b.dataset.saveTipster)));
    root.querySelectorAll("[data-remove-tipster]").forEach(b=>b.addEventListener("click",()=>removeTipster(b.dataset.removeTipster)));
  }

  async function saveTipster(id) {
    try {
      const username=$("[data-username='"+id+"']").value.trim();
      const bio=$("[data-bio='"+id+"']").value.trim();
      const displayName=$("[data-display='"+id+"']").value.trim();
      const {error:e}=await client.rpc("admin_update_tipster_profile",{p_tipster_id:id,p_username:username,p_bio:bio,p_display_name:displayName});
      if(e)throw e;
      error("Tipster profile saved.");
      await loadManagedTipsters(); await loadApplications(); await loadAuditLogs();
    } catch(e) { error("Could not save tipster: "+(e.message||"Unknown error")); }
  }

  async function removeTipster(id) {
    if (!confirm("Remove this tipster from public access? Their historical sales and results will be preserved.")) return;
    try {
      const {error:e}=await client.rpc("admin_remove_tipster",{p_tipster_id:id});
      if(e)throw e;
      error("Tipster removed from public access.");
      await loadManagedTipsters(); await loadApplications(); await loadAuditLogs();
    } catch(e) { error("Could not remove tipster: "+(e.message||"Unknown error")); }
  }

  async function loadBanners() {
    const root=$("bannerList");
    const {data,error:e}=await client.from("announcements").select("id,title,message,image_url,active").order("created_at",{ascending:false});
    if(e){root.textContent="Could not load banners: "+e.message;return;}
    if(!data?.length){root.textContent="No banners created yet.";return;}
    root.innerHTML=data.map(a=>'<article class="record"><div class="record-head"><strong>'+esc(a.title)+'</strong><span class="tag">'+(a.active?"ACTIVE":"HIDDEN")+'</span></div><p class="muted">'+esc(a.message)+'</p><div class="record-actions"><button class="approve" data-edit-banner="'+a.id+'">Edit</button><button class="reject" data-delete-banner="'+a.id+'">Delete</button></div></article>').join("");
    root.querySelectorAll("[data-edit-banner]").forEach(b=>b.addEventListener("click",()=>{const a=data.find(x=>x.id===b.dataset.editBanner);$("bannerTitle").value=a.title;$("bannerMessage").value=a.message;$("bannerImage").value=a.image_url||"";$("bannerActive").checked=a.active;$("bannerForm").dataset.editId=a.id;}));
    root.querySelectorAll("[data-delete-banner]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Delete this banner?"))return;const {error:e2}=await client.from("announcements").delete().eq("id",b.dataset.deleteBanner);if(e2){sayBanner(e2.message);return;}await loadBanners();}));
  }

  function sayBanner(message){$("bannerStatus").textContent=message;}

  async function saveBanner(e) {
    e.preventDefault();
    const payload={title:$("bannerTitle").value.trim(),message:$("bannerMessage").value.trim(),image_url:$("bannerImage").value.trim()||null,active:$("bannerActive").checked,created_by:user.id,updated_at:new Date().toISOString()};
    try {
      const id=$("bannerForm").dataset.editId;
      const result=id?await client.from("announcements").update(payload).eq("id",id):await client.from("announcements").insert(payload);
      if(result.error)throw result.error;
      $("bannerForm").reset();delete $("bannerForm").dataset.editId;$("bannerActive").checked=true;
      sayBanner("Banner saved. It will appear in the Customer App.");
      await loadBanners();
    } catch(e2){sayBanner(e2.message||"Could not save banner.");}
  }

  async function loadResultSubmissions() {
    $("resultList").textContent = "Loading result submissions…";
    const {data,error:e} = await client.from("result_submissions")
      .select("id,slip_id,submitted_by,submitted_result,note,status,created_at,review_reason,betslips(betting_company,total_odds,tipsters(username))")
      .order("created_at",{ascending:false}).limit(50);
    if (e) throw e;
    if (!data?.length) { $("resultList").textContent = "No result submissions yet."; return; }
    $("resultList").innerHTML = data.map(r => {
      const slip = r.betslips || {};
      const tipsterName = slip.tipsters?.username ? "@" + slip.tipsters.username : "Tipster";
      return '<article class="record"><div class="record-head"><div><strong>' + esc(tipsterName) + ' · ' + esc(slip.betting_company || "Betting slip") + '</strong><small>Submitted ' + esc(new Date(r.created_at).toLocaleString()) + '</small></div><span class="tag">' + esc(r.status) + '</span></div><p class="muted">Claimed result: <strong>' + esc(r.submitted_result) + '</strong>' + (slip.total_odds ? ' · Odds ' + esc(slip.total_odds) : '') + '</p>' + (r.note ? '<p class="muted">' + esc(r.note) + '</p>' : '') + (r.review_reason ? '<p class="muted">Review note: ' + esc(r.review_reason) + '</p>' : '') + (r.status === "pending" ? '<div class="record-actions"><button class="approve" data-result-approve="' + r.id + '">Confirm result</button><button class="reject" data-result-reject="' + r.id + '">Reject result</button></div>' : '') + '</article>';
    }).join("");
    $("resultList").querySelectorAll("[data-result-approve]").forEach(b => b.addEventListener("click", () => reviewResult(b.dataset.resultApprove,"approved")));
    $("resultList").querySelectorAll("[data-result-reject]").forEach(b => b.addEventListener("click", () => reviewResult(b.dataset.resultReject,"rejected")));
  }

  async function reviewResult(id, decision) {
    error("");
    try {
      const {error:e} = await client.rpc("admin_review_result_submission", {
        p_submission_id:id, p_decision:decision, p_reason:null
      });
      if (e) throw e;
      await loadResultSubmissions();
      await loadAuditLogs();
    } catch (e) { error("Could not review result: " + (e.message || "Unknown error")); }
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

  $("resultSubmitForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("resultSubmitStatus").textContent = "";
    const button = e.submitter; button.disabled = true;
    try {
      if (!tipster) await loadTipster();
      const slipId = $("resultSlip").value;
      if (!slipId) throw new Error("Choose one of your published listings.");
      const {error:e2} = await client.from("result_submissions").insert({
        slip_id:slipId,
        submitted_by:user.id,
        submitted_result:$("submittedResult").value,
        note:$("resultNote").value.trim(),
        status:"pending"
      });
      if (e2) throw e2;
      $("resultSubmitStatus").textContent = "Result submitted. It is waiting for administrator review.";
      $("resultNote").value = "";
    } catch (e2) { $("resultSubmitStatus").textContent = e2.message || "Could not submit result."; }
    finally { button.disabled = false; }
  });

  async function loadMySlips() {
    const {data,error:e} = await client.from("betslips").select("id,total_odds,price_tzs,betting_company,expires_at,status,created_at").eq("tipster_id",tipster.id).order("created_at",{ascending:false});
    if (e) throw e;
    if (!data?.length) {
      $("mySlips").textContent = "You have not published any listings yet.";
      $("resultSubmitForm").classList.add("hidden");
      return;
    }
    $("resultSubmitForm").classList.remove("hidden");
    $("resultSlip").innerHTML = data.map(s => '<option value="' + esc(s.id) + '">' + esc(s.betting_company) + ' · Odds ' + esc(s.total_odds) + ' · ' + esc(new Date(s.created_at).toLocaleDateString()) + '</option>').join("");
    $("mySlips").innerHTML = data.map(s => '<article class="record"><div class="record-head"><strong>'+esc(s.betting_company)+' · Odds '+esc(s.total_odds)+'</strong><span class="tag">'+esc(s.status)+'</span></div><small>'+esc(new Date(s.expires_at).toLocaleString())+' · TZS '+Number(s.price_tzs).toLocaleString("en-US")+'</small></article>').join("");
  }

  $("logoutButton").addEventListener("click", async () => {
    await client.auth.signOut(); user = null; profile = null; tipster = null;
    $("workspace").classList.add("hidden"); $("loginPanel").classList.remove("hidden");
    $("adminPanel").classList.add("hidden"); $("resultsPanel").classList.add("hidden"); $("auditPanel").classList.add("hidden"); $("tipsterPanel").classList.add("hidden"); $("applyPanel").classList.add("hidden");
    $("loginForm").reset(); $("workspaceError").textContent = "";
  });

  client.auth.getSession().then(async ({data}) => {
    if (data.session?.user) {
      try { await enter(data.session.user); }
      catch (e) { error(e.message || "Could not load workspace."); }
    }
  });
})();

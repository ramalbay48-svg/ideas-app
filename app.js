// IDEAS APP — connected marketplace frontend (Supabase)
const IDEAS_SUPABASE_URL = "https://hclgguciyhdqaqsvuddp.supabase.co";
const IDEAS_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6WzBBcoIz8YABVp2KlHh8A_vSOOKbJU";
const $ = (selector) => document.querySelector(selector);
const backendStatus = $("#backendStatus");
let db = null;
let currentUser = null;
let currentProfile = null;
let activeCompany = "All";
let selectedSlip = null;


function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 3000);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function money(value) {
  return "TZS " + Number(value || 0).toLocaleString("en-US");
}
function openCheckout(slip, tipsterName = "Tipster") {
  if (!currentUser) return showAuth("login");
  if (!slip?.id || countdownText(slip.expires_at) === "Expired") {
    toast("This betslip has expired and cannot be purchased.");
    return;
  }
  selectedSlip = slip;
  $("#checkoutForm").reset();
  $("#checkoutForm button[type='submit']").disabled = false;
  $("#checkoutForm button[type='submit']").textContent = "Pay with mobile money";
  $("#checkoutSummary").innerHTML =
    "<strong>" + escapeHtml(slip.betting_company || "Betslip") + " · " + escapeHtml(tipsterName) + "</strong>" +
    "<small>Total odds: " + escapeHtml(slip.total_odds) + " · Valid until: " +
    escapeHtml(new Date(slip.expires_at).toLocaleString()) + "</small>";
  $("#checkoutTotal").textContent = money(slip.price_tzs);
  $("#unlockPreview").hidden = true;
  $("#checkoutModal").showModal();
}
$("#checkoutClose").addEventListener("click", () => {
  $("#checkoutModal").close();
  selectedSlip = null;
});
$("#checkoutForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!selectedSlip) return toast("Please choose a betslip again.");
  if (countdownText(selectedSlip.expires_at) === "Expired") {
    $("#checkoutModal").close();
    selectedSlip = null;
    return toast("This betslip has expired.");
  }

  const provider = $("#paymentMethod").value;
  const phone = $("#paymentPhone").value.trim();
  const customerName = $("#paymentCustomerName").value.trim();
  const customerEmail = $("#paymentCustomerEmail").value.trim();
  if (!provider || !/^[67][0-9]{8}$/.test(phone)) {
    return toast("Choose a payment method and enter a valid Tanzanian number.");
  }
  if (customerName.length < 2) return toast("Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return toast("Enter a valid email address.");
  }

  const submitButton = $("#checkoutForm button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Requesting payment…";
  try {
    const {data, error} = await db.functions.invoke("splashpay-initiate", {
      body: {
        slip_id: selectedSlip.id,
        provider,
        phone: "255" + phone,
        customer_name: customerName,
        customer_email: customerEmail
      }
    });
    if (error) throw error;
    if (data?.already_paid) {
      $("#unlockPreview").innerHTML =
        "<strong>This betslip is already purchased</strong><p>Opening your purchased betslip…</p>";
      $("#unlockPreview").hidden = false;
      submitButton.textContent = "Already purchased";
      await openPaidPurchaseForSlip(selectedSlip.id);
      return;
    }
    if (!data?.success || !data?.reference) {
      throw new Error(data?.error || "SplashPay did not confirm the payment request.");
    }

    $("#unlockPreview").innerHTML =
      "<strong>Payment prompt sent to your phone</strong>" +
      "<p>" + escapeHtml(provider) + " · +255 " + escapeHtml(phone) +
      ". Approve the request on your mobile money phone. Your betslip stays locked until SplashPay verifies payment. We will open it automatically after confirmation.</p><p id=\"paymentWaitStatus\">Waiting for payment confirmation…</p>";
    $("#unlockPreview").hidden = false;
    submitButton.textContent = "Waiting for confirmation…";
    toast("Approve the payment prompt on your phone.");
    await waitForPaidPurchase(selectedSlip.id, submitButton);
  } catch (error) {
    console.error("SplashPay payment initiation:", error);
    toast(error.message || "Could not start the payment. Please try again.");
    submitButton.disabled = false;
    submitButton.textContent = "Try payment again";
  }
});
async function openPurchaseDetail(panel,purchaseId) {
  if(!currentUser || !panel || !purchaseId)return;
  panel.innerHTML='<h2>Purchased betslip</h2><p class="muted">Loading your private betslip…</p>';
  const {data:p,error}=await db.from("purchases")
    .select("id,status,amount_tzs,created_at,paid_at,slip_id,betslips(id,total_odds,betting_company,expires_at,tipsters(username))")
    .eq("id",purchaseId).eq("customer_id",currentUser.id).maybeSingle();
  if(error || !p){panel.innerHTML='<h2>Purchased betslip</h2><p class="muted">Could not open this purchase. Please try again.</p><button class="secondary-action" id="backToPurchases">Back to My Purchases</button>';$("#backToPurchases").onclick=()=>loadPurchasesPage(panel);return;}
  if(p.status!=="paid"){panel.innerHTML='<h2>Purchased betslip</h2><p class="muted">Payment is not confirmed yet. This slip is still locked.</p><button class="secondary-action" id="backToPurchases">Back to My Purchases</button>';$("#backToPurchases").onclick=()=>loadPurchasesPage(panel);return;}
  const slip=p.betslips||{};
  const {data:asset,error:assetError}=await db.from("slip_assets").select("storage_path").eq("slip_id",p.slip_id).maybeSingle();
  let image="";
  if(!assetError && asset?.storage_path){
    const {data:signed,error:signedError}=await db.storage.from("ideas-betslips").createSignedUrl(asset.storage_path,3600);
    if(!signedError && signed?.signedUrl)image='<img alt="Your purchased betslip" src="'+escapeHtml(signed.signedUrl)+'" style="width:100%;height:auto;max-height:760px;object-fit:contain;border-radius:12px;margin-top:14px">';
  }
  const expired=slip.expires_at && new Date(slip.expires_at).getTime()<=Date.now();
  panel.innerHTML='<button type="button" class="secondary-action" id="backToPurchases">← Back to My Purchases</button><h2>Purchased betslip</h2><article class="slip-card"><strong>'+escapeHtml(slip.betting_company||"Betslip")+'</strong><p class="muted">@'+escapeHtml(slip.tipsters?.username||"Tipster")+' · Odds '+escapeHtml(slip.total_odds||"—")+'</p><p>'+money(p.amount_tzs)+' · Payment confirmed</p><p class="muted">'+(expired?'This slip has expired in the marketplace. Your purchase is still saved.':'Purchased successfully')+'</p>'+(image||'<p class="muted">The private image is not available yet. Contact support if this continues.</p>')+'</article>';
  $("#backToPurchases").onclick=()=>loadPurchasesPage(panel);
}
async function openPaidPurchaseForSlip(slipId) {
  if (!currentUser || !slipId) return;
  const {data,error} = await db.from("purchases")
    .select("id,status")
    .eq("customer_id",currentUser.id)
    .eq("slip_id",slipId)
    .eq("status","paid")
    .maybeSingle();
  if (error || !data) {
    toast("Payment is confirmed. Open My Purchases to view your slip.");
    return;
  }
  $("#checkoutModal").close();
  selectedSlip = null;
  showPage("purchases");
  const panel = $("#appPagePanel");
  await openPurchaseDetail(panel,data.id);
}
async function waitForPaidPurchase(slipId, submitButton) {
  const started = Date.now();
  const timeoutMs = 180000;
  while (Date.now() - started < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve,3000));
    if (!currentUser) return;
    const {data,error} = await db.from("purchases")
      .select("id,status")
      .eq("customer_id",currentUser.id)
      .eq("slip_id",slipId)
      .maybeSingle();
    if (error) {
      console.warn("Payment confirmation check:",error.message);
      continue;
    }
    if (data?.status === "paid") {
      toast("Payment confirmed. Opening your betslip…");
      $("#checkoutModal").close();
      selectedSlip = null;
      showPage("purchases");
      await openPurchaseDetail($("#appPagePanel"),data.id);
      return;
    }
    if (data?.status === "failed" || data?.status === "refunded") {
      const statusNode=$("#paymentWaitStatus");
      if(statusNode)statusNode.textContent="Payment was not completed. You can check My Purchases or try again.";
      submitButton.disabled=false;
      submitButton.textContent="Try payment again";
      return;
    }
    const statusNode=$("#paymentWaitStatus");
    if(statusNode)statusNode.textContent="Still waiting for SplashPay confirmation…";
  }
  const statusNode=$("#paymentWaitStatus");
  if(statusNode)statusNode.textContent="We have not received confirmation yet. If you approved payment, check My Purchases; your slip unlocks only after verified confirmation.";
  submitButton.disabled=false;
  submitButton.textContent="Check My Purchases";
  submitButton.onclick=async event=>{
    event.preventDefault();
    $("#checkoutModal").close();
    selectedSlip=null;
    showPage("purchases");
    await loadPurchasesPage($("#appPagePanel"));
  };
}
function countdownText(expiresAt) {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return "Expired";
  const seconds = Math.floor(remaining / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return (days ? days + "d " : "") + String(hours).padStart(2,"0") + ":" +
    String(minutes).padStart(2,"0") + ":" + String(secs).padStart(2,"0");
}
function updateSlipCountdowns() {
  document.querySelectorAll("[data-slip-countdown]").forEach(node => {
    const value = countdownText(node.dataset.expiresAt);
    node.textContent = value;
    node.classList.toggle("expired", value === "Expired");
  });
}
setInterval(updateSlipCountdowns, 1000);

function publicAvatar(path) {
  if (!path || !db) return "";
  return db.storage.from("ideas-public-media").getPublicUrl(path).data.publicUrl;
}
async function getPublicTipsterProfiles(userIds) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  if (!uniqueIds.length) return new Map();
  const {data, error} = await db.from("public_tipster_profiles")
    .select("user_id,display_name,avatar_path").in("user_id", uniqueIds);
  if (error) {
    console.warn("Public tipster profiles:", error.message);
    return new Map();
  }
  return new Map((data || []).map(profile => [profile.user_id, profile]));
}
function showPage(page, skipTipsterListLoad = false) {
  const homeSections = [".welcome", ".banner", ".section:not(#marketplaceSection)", ".notice"];
  homeSections.forEach(selector => document.querySelectorAll(selector).forEach(el => el.hidden = page !== "home"));
  const marketplace = $("#marketplaceSection");
  if (marketplace) marketplace.hidden = page !== "betslips";
  let panel = $("#appPagePanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "appPagePanel";
    panel.className = "section";
    $(".page").insertBefore(panel, $(".notice"));
  }
  panel.hidden = page === "home" || page === "betslips";
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("selected", b.dataset.view === page));
  if (page === "betslips") loadMarketplace();
  if (page === "tipsters" && !skipTipsterListLoad) loadTipstersPage(panel);
  if (page === "following") loadFollowingPage(panel);
  if (page === "profile") loadProfilePage(panel);
  window.scrollTo({top:0, behavior:"smooth"});
}
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.view)));
document.addEventListener("click", async event => {
  const button = event.target.closest("[data-open-tipster]");
  if (!button) return;
  const tipsterId = button.dataset.openTipster;
  if (!tipsterId) return;
  const panel = $("#appPagePanel");
  if (!panel) return;
  const rows = await getApprovedTipsters();
  const selected = rows.find(t => t.id === tipsterId);
  if (!selected) return toast("This tipster profile is unavailable.");
  showPage("tipsters", true);
  await loadTipsterDetail($("#appPagePanel"), selected);
});
document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach(b => b.classList.toggle("active", b === button));
  activeCompany = button.dataset.company;
  loadMarketplace();
}));
function applyTheme(mode) {
  const dark = mode === "dark";
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("ideas-app-theme", dark ? "dark" : "light");
  $("#themeToggle").textContent = dark ? "☾" : "☼";
  $("#themeToggle").setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  $("#themeToggle").title = dark ? "Switch to light mode" : "Switch to dark mode";
  $('meta[name="theme-color"]').content = dark ? "#0D0D0D" : "#f5f8f6";
}
applyTheme(localStorage.getItem("ideas-app-theme") === "dark" ? "dark" : "light");
$("#themeToggle").addEventListener("click", () => {
  applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
});
$("#searchInput").addEventListener("input", loadMarketplace);

function showAuth(mode = "login") {
  setAuthMode(mode);
  $("#authModal").showModal();
}
$("#authClose").addEventListener("click", () => $("#authModal").close());
document.querySelectorAll(".auth-tab").forEach(b => b.addEventListener("click", () => setAuthMode(b.dataset.auth)));
function setAuthMode(mode) {
  const isRegister = mode === "register";
  document.querySelectorAll(".auth-tab").forEach(b => b.classList.toggle("active", b.dataset.auth === mode));
  $("#authTitle").textContent = isRegister ? "Create account" : "Welcome back";
  $("#authSubmit").textContent = isRegister ? "Create account" : "Log in";
  $("#passwordInput").autocomplete = isRegister ? "new-password" : "current-password";
  $("#passwordInput").placeholder = isRegister ? "At least 8 characters" : "Enter your password";
  $("#authHelp").textContent = isRegister ? "Create an account with your phone number and password. No SMS code is sent; phone numbers are not verified." : "Enter your Tanzanian number and password.";
  $("#otpField")?.remove();
  $("#verifyOtpButton")?.remove();

  $("#authForm").dataset.mode = mode;
}
function phoneLoginEmail(raw) {
  // Internal login alias only. Customers still use their phone number in the app.
  return "255" + raw + "@ideasapp.invalid";
}
$("#authForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!db) return toast("Database is not connected yet.");
  const raw = $("#phoneInput").value.replace(/\D/g, "");
  const phone = "+255" + raw;
  const password = $("#passwordInput").value;
  if (!/^[67]\d{8}$/.test(raw)) return toast("Enter a valid 9-digit Tanzanian mobile number.");
  if (password.length < 8) return toast("Password must contain at least 8 characters.");
  const mode = event.currentTarget.dataset.mode;
  $("#authSubmit").disabled = true;
  try {
    const email = phoneLoginEmail(raw);
    if (mode === "register") {
      const {data, error} = await db.auth.signUp({
        email,
        password,
        options: {data: {display_name: "", phone}}
      });
      if (error) throw error;
      if (data.session) {
        await afterLogin(data.user);
        $("#authModal").close();
        return toast("Account created. No SMS verification was sent.");
      }
      toast("Account request received. In Supabase, email confirmation must be OFF for password-only registration.");
    } else {
      const {data, error} = await db.auth.signInWithPassword({email, password});
      if (error) throw error;
      await afterLogin(data.user);
      $("#authModal").close();
      toast("You are logged in.");
    }
  } catch (error) {
    toast(error.message || "Authentication failed.");
  } finally {
    $("#authSubmit").disabled = false;
  }
});
async function afterLogin(user) {
  currentUser = user;
  const {data, error} = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) console.warn("Profile lookup:", error.message);
  currentProfile = data || null;
  updateAccountControls();
}
function updateAccountControls() {
  $("#loginOpen").textContent = currentUser ? "Log out" : "Log in";
  $("#loginOpen").onclick = currentUser ? async () => {
    await db.auth.signOut();
    currentUser = null; currentProfile = null;
    updateAccountControls();
    toast("Logged out.");
    showPage("home");
  } : () => showAuth("login");
  // Customer app has no tipster or management entry points. Those functions live in separate apps.
  $("#tipsterOpen").hidden = true;
  $("#adminOpen").hidden = true;
}

async function getFollowStats(tipsterIds) {
  const ids = [...new Set((tipsterIds || []).filter(Boolean))];
  const counts = new Map(), followed = new Set();
  if (!db || !ids.length) return {counts, followed};
  const {data: countRows, error: countError} = await db.from("public_tipster_follower_counts")
    .select("tipster_id,follower_count").in("tipster_id", ids);
  if (countError) console.warn("Follower totals:", countError.message);
  (countRows || []).forEach(row => counts.set(row.tipster_id, Number(row.follower_count || 0)));
  if (currentUser) {
    const {data: ownRows, error: ownError} = await db.from("tipster_follows")
      .select("tipster_id").eq("follower_id", currentUser.id).in("tipster_id", ids);
    if (ownError) console.warn("Following list:", ownError.message);
    (ownRows || []).forEach(row => followed.add(row.tipster_id));
  }
  return {counts, followed};
}
async function toggleTipsterFollow(tipsterId) {
  if (!currentUser) {
    showAuth("login");
    toast("Log in to follow this tipster.");
    return;
  }
  const {data:existing, error:lookupError} = await db.from("tipster_follows")
    .select("tipster_id").eq("tipster_id", tipsterId).eq("follower_id", currentUser.id).maybeSingle();
  if (lookupError) return toast("Could not check your following list. Please try again.");
  const result = existing
    ? await db.from("tipster_follows").delete().eq("tipster_id", tipsterId).eq("follower_id", currentUser.id)
    : await db.from("tipster_follows").insert({tipster_id:tipsterId, follower_id:currentUser.id});
  if (result.error) {
    console.warn("Follow update:", result.error.message);
    return toast("Could not update your follow. Please try again.");
  }
  toast(existing ? "Tipster removed from Following." : "You are now following this tipster.");
  await loadHomeTipsters();
  const panel = $("#appPagePanel");
  if (panel && /YOUR PICKS|Following/i.test(panel.textContent || "")) {
    await loadFollowingPage(panel);
  } else if (panel && /TIPSTER PROFILE/.test(panel.textContent || "")) {
    const updatedRows = await getApprovedTipsters();
    const updatedTipster = updatedRows.find(item => item.id === tipsterId);
    if (updatedTipster) await loadTipsterDetail(panel, updatedTipster);
  } else if (panel && /DISCOVER/.test(panel.textContent || "")) {
    await loadTipstersPage(panel);
  }
}
function followButton(tipsterId, isFollowing = false) {
  return '<button type="button" class="follow-button" data-follow="' + escapeHtml(tipsterId) + '" aria-pressed="' + isFollowing + '">' + (isFollowing ? 'Following' : '+ Follow') + '</button>';
}
function wireFollowButtons(root) {
  root.querySelectorAll("[data-follow]").forEach(button => button.addEventListener("click", () => toggleTipsterFollow(button.dataset.follow)));
}
async function getApprovedTipsters() {
  if (!db) return [];
  const {data,error} = await db.from("tipsters").select("id,user_id,username,bio").eq("status","approved").order("created_at",{ascending:false});
  if (error) { console.warn("Approved tipsters:",error.message); return []; }
  const profiles = await getPublicTipsterProfiles((data||[]).map(t=>t.user_id));
  const stats = await getFollowStats((data||[]).map(t=>t.id));
  return (data||[]).map(t=>({...t,profiles:profiles.get(t.user_id)||null,followers_count:stats.counts.get(t.id)||0,is_following:stats.followed.has(t.id)}));
}
function tipsterCard(t) {
  const name=t.profiles?.display_name||t.username||"Tipster";
  const avatar=t.profiles?.avatar_path?'<img alt="Profile picture of '+escapeHtml(name)+'" src="'+escapeHtml(publicAvatar(t.profiles.avatar_path))+'">':'<span>'+escapeHtml(name.charAt(0).toUpperCase())+'</span>';
  return '<article class="tipster"><button type="button" class="tipster-card-open" data-open-tipster="'+escapeHtml(t.id)+'" aria-label="Open '+escapeHtml(name)+' profile"><div class="tipster-card-photo">'+avatar+'</div><strong>'+escapeHtml(name)+' <span class="verified-mark">✓</span></strong><small>Open profile · View performance</small></button><small class="follower-count">'+Number(t.followers_count||0).toLocaleString()+' followers</small>'+followButton(t.id,t.is_following)+'<button type="button" class="tipster-view-button" data-open-tipster="'+escapeHtml(t.id)+'">View profile</button></article>';
}
async function loadHomeTipsters() {
  const term = ($("#homeTipsterSearch")?.value || "").trim().toLowerCase();
  const allRows=await getApprovedTipsters();
  const rows=allRows.filter(t => (t.profiles?.display_name||t.username||"").toLowerCase().includes(term) || (t.username||"").toLowerCase().includes(term));
  const root=$("#tipsters"), suggestions=$("#followSuggestions");
  if (!root || !suggestions) return;
  if (!rows.length) {root.innerHTML='<div class="empty">Approved tipsters will appear here.</div>';suggestions.innerHTML='<div class="empty">New tipsters will appear here.</div>';return;}
  root.innerHTML=rows.slice(0,6).map(tipsterCard).join("");
  suggestions.innerHTML=rows.filter(t=>!t.is_following).slice(0,6).map(tipsterCard).join("") || '<div class="empty">You are following all currently listed tipsters.</div>';
  [root,suggestions].forEach(wireFollowButtons);
}
$("#homeTipsterSearch")?.addEventListener("input", loadHomeTipsters);
async function loadFollowingPage(panel) {
  panel.innerHTML='<p class="eyebrow">YOUR PICKS</p><h2>Following</h2><p class="muted">Tipsters you follow.</p><div class="tipster-row" id="followingList"><div class="empty">Loading…</div></div>';
  if (!currentUser) {
    panel.querySelector("#followingList").innerHTML='<div class="empty">Log in to see and manage your followed tipsters.</div><button class="primary-action" id="followingLogin">Log in</button>';
    $("#followingLogin").onclick=()=>showAuth("login");
    return;
  }
  const rows=await getApprovedTipsters(), selected=rows.filter(t=>t.is_following), root=$("#followingList");
  if (!selected.length) {root.innerHTML='<div class="empty">You are not following anyone yet. Explore approved tipsters and tap Follow.</div><button class="primary-action" id="discoverTipsters">Discover tipsters</button>';$("#discoverTipsters").onclick=()=>showPage("tipsters");return;}
  root.innerHTML=selected.map(tipsterCard).join("");wireFollowButtons(root);
}
async function loadTipstersPage(panel) {
  panel.innerHTML = '<p class="eyebrow">DISCOVER</p><h2>Approved tipsters</h2><p class="muted">Loading tipsters…</p>';
  if (!db) return;
  const {data, error} = await db.from("tipsters").select("id,user_id,username,bio").eq("status","approved").order("created_at",{ascending:false});
  if (error) { panel.innerHTML = '<h2>Tipsters</h2><p class="muted">Could not load tipsters. Check database permissions.</p>'; return; }
  if (!data?.length) { panel.innerHTML = '<h2>Approved tipsters</h2><div class="empty">No approved tipsters yet. Check back soon.</div>'; return; }
  const profiles = await getPublicTipsterProfiles(data.map(t => t.user_id));
  const stats = await getFollowStats(data.map(t => t.id));
  const rows = data.map(t => ({...t, profiles: profiles.get(t.user_id) || null, followers_count: stats.counts.get(t.id) || 0, is_following: stats.followed.has(t.id)}));
  panel.innerHTML = '<p class="eyebrow">DISCOVER</p><h2>Approved tipsters</h2><div class="tipster-row">' + rows.map(t => '<article class="tipster"><div class="tipster-avatar">'+(t.profiles?.avatar_path?'<img alt="Profile picture of '+escapeHtml(t.profiles?.display_name||t.username)+'" src="'+escapeHtml(publicAvatar(t.profiles.avatar_path))+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">':escapeHtml((t.profiles?.display_name||t.username||"T").charAt(0).toUpperCase()))+'</div><strong>'+escapeHtml(t.profiles?.display_name||t.username)+'</strong><small>@'+escapeHtml(t.username)+'</small><small class="follower-count">'+Number(t.followers_count||0).toLocaleString()+' followers</small>'+followButton(t.id,t.is_following)+'<p class="muted">'+escapeHtml(t.bio||"")+'</p><button type="button" class="tipster-view-button" data-open-tipster="'+escapeHtml(t.id)+'">View profile</button></article>').join("") + '</div>';
  wireFollowButtons(panel);

}
async function loadTipsterDetail(panel, tipster) {
  if (!tipster) return;
  const displayName = tipster.profiles?.display_name || tipster.username || "Tipster";
  const avatar = tipster.profiles?.avatar_path ? '<img alt="Profile picture of '+escapeHtml(displayName)+'" src="'+escapeHtml(publicAvatar(tipster.profiles.avatar_path))+'">' : '<span>'+escapeHtml(displayName.charAt(0).toUpperCase())+'</span>';
  panel.innerHTML = '<button class="secondary-action" id="backToTipsters">← Back to tipsters</button><section class="tipster-profile-hero"><div class="tipster-profile-cover">'+avatar+'</div><h2>' + escapeHtml(displayName) + ' <span class="verified-mark">✓</span></h2><p class="muted">@' + escapeHtml(tipster.username) + '</p><div class="tipster-profile-follow"><strong>' + Number(tipster.followers_count||0).toLocaleString() + ' followers</strong>' + followButton(tipster.id,tipster.is_following) + '</div><p class="tipster-profile-bio">' + escapeHtml(tipster.bio || "No profile description yet.") + '</p></section><div class="tipster-results-wrap"><strong class="tipster-results-title">Last 10 consecutive verified slips</strong><div id="tipsterVerifiedResults" class="tipster-results"><div class="empty">Loading results…</div></div><p id="tipsterAccuracy" class="tipster-accuracy">Calculating performance…</p></div><h3>Published betting slips</h3><p class="muted">Loading available slips…</p>';
  $("#backToTipsters").addEventListener("click", () => loadTipstersPage(panel));
  wireFollowButtons(panel);
  const {data: verifiedRows, error: verifiedError} = await db.from("public_verified_results")
    .select("id,slip_id,tipster_id,username,submitted_result,total_odds,betting_company,reviewed_at")
    .eq("tipster_id", tipster.id).order("reviewed_at", {ascending:false}).limit(40);
  const verifiedRoot = $("#tipsterVerifiedResults");
  if (verifiedRoot) {
    if (verifiedError) {
      console.warn("Tipster verified results:", verifiedError.message);
      verifiedRoot.innerHTML = '<div class="empty">Verified results are temporarily unavailable.</div>';
      $("#tipsterAccuracy").textContent = "Performance unavailable";
    } else {
      const seen = new Set();
      const lastTen = (verifiedRows || []).filter(row => {
        if (!row.slip_id || seen.has(row.slip_id)) return false;
        seen.add(row.slip_id);
        return true;
      }).slice(0,10);
      if (!lastTen.length) {
        verifiedRoot.innerHTML = '<div class="empty">No administrator-verified results yet.</div>';
        $("#tipsterAccuracy").textContent = "No verified performance yet";
      } else {
        const wins = lastTen.filter(row => row.submitted_result === "won").length;
        const accuracy = Math.round((wins / lastTen.length) * 100);
        verifiedRoot.innerHTML = lastTen.map(result => verifiedResultRow(result)).join("");
        $("#tipsterAccuracy").textContent = accuracy + "% accuracy · " + wins + " wins from " + lastTen.length + " consecutive slips";
      }
    }
  }
  const {data, error} = await db.from("betslips").select("id,total_odds,price_tzs,betting_company,expires_at").eq("tipster_id", tipster.id).eq("status", "published").gt("expires_at", new Date().toISOString()).order("created_at", {ascending:false});
  if (error) {
    panel.innerHTML += '<div class="empty">Could not load this tipster’s slips right now.</div>';
    console.warn("Tipster slips:", error.message);
    return;
  }
  const heading = '<h3>Published betting slips</h3>';
  if (!data?.length) {
    panel.innerHTML = panel.innerHTML.replace('<h3>Published betting slips</h3><p class="muted">Loading available slips…</p>', heading + '<div class="empty">This tipster has no active published slips right now.</div>');
    return;
  }
  const cards = data.map(s => '<article class="slip-card"><div class="slip-top"><strong>' + escapeHtml(s.betting_company || "Betting company") + '</strong><span class="company">Published</span></div><div class="slip-stats"><div class="stat"><small>Total odds</small><strong>' + escapeHtml(s.total_odds) + '</strong></div><div class="stat"><small>Valid until</small><strong>' + escapeHtml(new Date(s.expires_at).toLocaleString()) + '</strong></div><div class="stat"><small>Time remaining</small><strong data-slip-countdown data-expires-at="' + escapeHtml(s.expires_at) + '">Calculating…</strong></div></div><div class="locked-preview">▣ BETSLIP HIDDEN UNTIL PAYMENT</div><div class="slip-footer"><div class="price">' + money(s.price_tzs) + '<small>One-time purchase</small></div><button class="buy-button" data-view-slip="' + escapeHtml(s.id) + '">View Bet Slip</button></div></article>').join("");
  panel.innerHTML = panel.innerHTML.replace('<h3>Published betting slips</h3><p class="muted">Loading available slips…</p>', heading + cards);
  panel.querySelectorAll("[data-view-slip]").forEach(button => button.addEventListener("click", () => {
    const slip = data.find(item => item.id === button.dataset.viewSlip);
    if (slip) openSlipDetail(slip, tipster.username || "Tipster");
  }));
}

function verifiedResultRow(result) {
  const won = result.submitted_result === "won";
  return '<div class="tipster-result-row '+(won ? "won" : "lost")+'" aria-label="'+(won ? "Won" : "Lost")+'"><span class="tipster-result-dot" aria-hidden="true"></span></div>';
}

function openSlipDetail(slip, tipsterName = "Tipster") {
  if (!slip?.id) return;
  const panel = $("#appPagePanel");
  if (!panel) return;
  showPage("slip-detail", true);
  panel.innerHTML = '<button type="button" class="secondary-action" id="backToBetslips">← Back to betslips</button><p class="eyebrow">BETSLIP DETAILS</p><h2>'+escapeHtml(tipsterName)+'</h2><article class="slip-detail-card"><div class="slip-detail-meta"><span class="company">'+escapeHtml(slip.betting_company||"Betting company")+'</span><span class="company">Private until purchased</span></div><div class="slip-stats"><div class="stat"><small>Total odds</small><strong>'+escapeHtml(slip.total_odds)+'</strong></div><div class="stat"><small>Price</small><strong>'+money(slip.price_tzs)+'</strong></div><div class="stat"><small>Validity</small><strong data-slip-countdown data-expires-at="'+escapeHtml(slip.expires_at)+'">Calculating…</strong></div></div><div class="locked-preview slip-detail-preview">▣ BETSLIP IMAGE LOCKED</div><p class="muted">The full betslip image is revealed only after SplashPay confirms your payment.</p><button type="button" class="buy-button slip-detail-buy" id="detailBuySlip">Buy Bet Slip · '+money(slip.price_tzs)+'</button></article>';
  $("#backToBetslips").onclick=()=>showPage("betslips");
  $("#detailBuySlip").onclick=()=>openCheckout(slip,tipsterName);
}
async function loadMarketplace() {
  const root = $("#slips");
  if (!root || !db) return;
  root.innerHTML = '<div class="empty">Loading available slips…</div>';
  let query = db.from("betslips").select("id,total_odds,price_tzs,betting_company,expires_at,tipsters(id,username,user_id)").eq("status","published").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false});
  if (activeCompany !== "All" && activeCompany !== "Other") query = query.eq("betting_company",activeCompany);
  const {data,error} = await query;
  if (error) { root.innerHTML = '<div class="empty">Marketplace could not load. Please try again later.</div>'; console.warn(error.message); return; }
  const profiles = await getPublicTipsterProfiles((data || []).map(s => s.tipsters?.user_id));
  const term = $("#searchInput").value.trim().toLowerCase();
  const rows = (data||[]).filter(s => {
    const profile = profiles.get(s.tipsters?.user_id);
    const name = profile?.display_name || s.tipsters?.username || "";
    const company = s.betting_company || "";
    return (activeCompany !== "Other" || !["SportPesa","Betika","BetPawa"].includes(company)) && (name.toLowerCase().includes(term) || (s.tipsters?.username||"").toLowerCase().includes(term));
  });
  if (!rows.length) { root.innerHTML = '<div class="empty">No published slips are available right now.</div>'; return; }
  root.innerHTML = rows.map(s => {
    const profile = profiles.get(s.tipsters?.user_id);
    const name = profile?.display_name || s.tipsters?.username || "Tipster";
    const username = s.tipsters?.username || "";
    return '<article class="slip-card"><div class="slip-top"><button type="button" class="seller tipster-profile-link" data-open-tipster="'+escapeHtml(s.tipsters?.id)+'"><div class="seller-avatar">'+(profile?.avatar_path?'<img alt="Profile picture of '+escapeHtml(name)+'" src="'+escapeHtml(publicAvatar(profile.avatar_path))+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">':escapeHtml(name.charAt(0).toUpperCase()))+'</div><div><strong>'+escapeHtml(name)+'</strong><small>@'+escapeHtml(username)+'</small></div></button><span class="company">'+escapeHtml(s.betting_company)+'</span></div><div class="slip-stats"><div class="stat"><small>Total odds</small><strong>'+escapeHtml(s.total_odds)+'</strong></div><div class="stat"><small>Validity</small><strong>'+new Date(s.expires_at).toLocaleString()+'</strong></div><div class="stat"><small>Time remaining</small><strong data-slip-countdown data-expires-at="'+escapeHtml(s.expires_at)+'">Calculating…</strong></div><div class="stat"><small>Slip image</small><strong>Covered</strong></div></div><div class="locked-preview">▣ BETSLIP HIDDEN UNTIL PAYMENT</div><div class="slip-footer"><div class="price">'+money(s.price_tzs)+'<small>One-time purchase</small></div><button class="buy-button" data-view-slip="'+s.id+'">View Bet Slip</button></div></article>';
  }).join("");
  root.querySelectorAll("[data-view-slip]").forEach(b => b.addEventListener("click", () => {
    const slip = rows.find(item => item.id === b.dataset.viewSlip);
    if (slip) openSlipDetail(slip, slip.tipsters?.username || "Tipster");
  }));
}
async function loadPurchasesPage(panel) {
  if (!currentUser) {
    panel.innerHTML = '<h2>My slips</h2><p class="muted">Log in to see your purchases.</p><button class="primary-action" id="pageLogin">Log in</button>';
    $("#pageLogin").onclick = () => showAuth("login");
    return;
  }
  panel.innerHTML = '<h2>My slips</h2><p class="muted">Loading your purchases…</p>';
  const {data,error} = await db.from("purchases")
    .select("id,status,amount_tzs,created_at,betslips(id,total_odds,betting_company,expires_at,tipsters(username))")
    .eq("customer_id",currentUser.id)
    .order("created_at",{ascending:false});
  if (error) {
    panel.innerHTML = '<h2>My slips</h2><p class="muted">Could not load purchases.</p>';
    console.warn("My slips:", error.message);
    return;
  }
  if (!data?.length) {
    panel.innerHTML = '<h2>My slips</h2><div class="empty">You have not purchased any slips yet.</div>';
    return;
  }

  // Private asset rows and Storage objects are only readable after the backend marks a purchase paid.
  const paidSlipIds = [...new Set(data.filter(p => p.status === "paid" && p.betslips?.id).map(p => p.betslips.id))];
  const assetUrls = new Map();
  if (paidSlipIds.length) {
    const {data:assets,error:assetError} = await db.from("slip_assets")
      .select("slip_id,storage_path")
      .in("slip_id",paidSlipIds);
    if (assetError) {
      console.warn("Purchased slip assets:", assetError.message);
    } else {
      await Promise.all((assets || []).map(async asset => {
        const {data:signed,error:signedError} = await db.storage
          .from("ideas-betslips")
          .createSignedUrl(asset.storage_path,3600);
        if (signedError) {
          console.warn("Purchased slip image:", signedError.message);
          return;
        }
        if (signed?.signedUrl) assetUrls.set(asset.slip_id,signed.signedUrl);
      }));
    }
  }

  panel.innerHTML = '<h2>My Purchases</h2><p class="muted">Your paid slips remain saved here even after their marketplace expiry time.</p>' + data.map(p => {
    const slip = p.betslips || {};
    const paid = p.status === "paid";
    const expired = slip.expires_at && new Date(slip.expires_at).getTime() <= Date.now();
    return '<article class="slip-card"><strong>' + escapeHtml(slip.betting_company || "Betslip") +
      '</strong><p class="muted">' + escapeHtml(slip.tipsters?.username || "Tipster") +
      ' · Odds ' + escapeHtml(slip.total_odds || "—") + '</p><p>' + money(p.amount_tzs) +
      ' · ' + (paid ? 'Payment confirmed' : escapeHtml(p.status)) +
      (expired ? ' · Expired in marketplace' : '') + '</p>' +
      (paid ? '<button type="button" class="primary-action" data-open-purchase="' + escapeHtml(p.id) + '">Open purchased betslip</button>' :
       '<p class="muted">The betslip stays locked until payment is confirmed.</p>') +
      '</article>';
  }).join("");
  panel.querySelectorAll("[data-open-purchase]").forEach(button => button.addEventListener("click",()=>openPurchaseDetail(panel,button.dataset.openPurchase)));
}
async function loadProfilePage(panel) {
  if (!currentUser) { panel.innerHTML='<h2>Your profile</h2><p class="muted">Log in or create an account to manage your profile.</p><button class="primary-action" id="profileLogin">Log in / Register</button>'; $("#profileLogin").onclick=()=>showAuth("register"); return; }
  const p=currentProfile || {};
  panel.innerHTML='<p class="eyebrow">ACCOUNT</p><h2>Your profile</h2><div class="slip-card"><strong>'+escapeHtml(p.display_name||"IDEAS APP member")+'</strong><p class="muted">'+escapeHtml(currentUser.phone||"")+'</p><p class="muted">Account type: '+escapeHtml(p.role||"customer")+'</p></div><button class="secondary-action" id="myPurchasesButton">My purchases</button><div id="myPurchasesPanel"></div><button class="primary-action" id="logoutButton">Log out</button>';
  $("#myPurchasesButton").onclick=()=>loadPurchasesPage($("#myPurchasesPanel"));
  $("#logoutButton").onclick=async()=>{await db.auth.signOut();currentUser=null;currentProfile=null;updateAccountControls();showPage("home");toast("Logged out.");};
}
$("#tipsterOpen").addEventListener("click", () => {
  if (!currentUser || !["tipster","admin"].includes(currentProfile?.role)) return toast("A tipster account is required.");
  $("#tipsterDashboard").showModal();
});
$("#adminOpen").addEventListener("click", () => {
  if (currentProfile?.role !== "admin") return toast("Admin access required.");
  $("#adminDashboard").showModal();
});

const slipImageInput = $("#slipImage");
slipImageInput.addEventListener("change", () => {
  const file = slipImageInput.files?.[0];
  const preview = $("#slipImagePreview");
  if (!file) { preview.textContent = "Your selected betslip image preview will appear here."; return; }
  if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    slipImageInput.value = "";
    preview.textContent = "Choose a JPG, PNG or WebP image no larger than 5 MB.";
    return toast("Image must be JPG, PNG or WebP and no larger than 5 MB.");
  }
  const url = URL.createObjectURL(file);
  preview.innerHTML = '<img alt="Selected betslip preview" src="' + url + '" style="max-width:100%;max-height:260px;object-fit:contain;border-radius:12px">';
});
$("#slipUploadForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!db || !currentUser) return toast("Please log in first.");
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  const odds = Number($("#slipOdds").value);
  const price = Number($("#slipPrice").value);
  const company = $("#slipCompany").value;
  const expiryValue = $("#slipExpiry").value;
  const file = slipImageInput.files?.[0];
  const expiresAt = new Date(expiryValue);
  if (!Number.isFinite(odds) || odds <= 1 || !Number.isSafeInteger(price) || price < 1 || !company || !expiryValue || !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    return toast("Check the odds, price, company and future expiry time.");
  }
  if (!file || !["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    return toast("Choose a JPG, PNG or WebP image no larger than 5 MB.");
  }
  submit.disabled = true;
  submit.textContent = "Uploading securely…";
  let uploadedPath = null;
  try {
    const {data:tipster,error:tipsterError} = await db.from("tipsters").select("id").eq("user_id",currentUser.id).eq("status","approved").maybeSingle();
    if (tipsterError) throw tipsterError;
    if (!tipster) throw new Error("This login has no approved tipster profile. Sign in with the account that owns the approved tipster profile.");
    const {data:slip,error:slipError} = await db.from("betslips").insert({
      tipster_id:tipster.id,total_odds:odds,price_tzs:price,betting_company:company,expires_at:expiresAt.toISOString(),status:"draft"
    }).select("id").single();
    if (slipError) throw slipError;
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g,"-").slice(-80) || "betslip-image";
    uploadedPath = currentUser.id + "/" + slip.id + "/" + safeName;
    const {error:uploadError} = await db.storage.from("ideas-betslips").upload(uploadedPath,file,{cacheControl:"3600",upsert:false,contentType:file.type});
    if (uploadError) throw uploadError;
    const {error:assetError} = await db.from("slip_assets").insert({slip_id:slip.id,storage_path:uploadedPath});
    if (assetError) {
      await db.storage.from("ideas-betslips").remove([uploadedPath]);
      throw assetError;
    }
    event.currentTarget.reset();
    $("#slipImagePreview").textContent = "Your selected betslip image preview will appear here.";
    toast("Betslip uploaded as a private draft. It is not published yet.");
  } catch(error) {
    console.error("Betslip draft upload:",error);
    toast(error.message || "Could not upload this draft. Please try again.");
  } finally {
    submit.disabled = false;
    submit.textContent = "Upload private draft";
  }
});

$("#dashboardClose").addEventListener("click",()=>$("#tipsterDashboard").close());
$("#adminClose").addEventListener("click",()=>$("#adminDashboard").close());
$("#profileClose").addEventListener("click",()=>$("#profileModal").close());
$("#authModal").addEventListener("click", event => { if(event.target === $("#authModal")) $("#authModal").close(); });

let bannerSlides = [];
let bannerIndex = 0;
let bannerTimer = null;
function showBannerSlide(index) {
  const banner = $(".banner");
  if (!banner || !bannerSlides.length) return;
  bannerIndex = (index + bannerSlides.length) % bannerSlides.length;
  const slide = bannerSlides[bannerIndex];
  const heading = banner.querySelector("h2");
  const message = banner.querySelector("p");
  const symbol = banner.querySelector(".banner-symbol");
  const tag = banner.querySelector(".banner-tag");
  if (heading) heading.textContent = slide.title || "IDEAS APP";
  if (message) message.textContent = slide.message || "";
  if (tag) tag.textContent = "FEATURED";
  if (symbol) symbol.hidden = !!slide.image_url;
  banner.classList.toggle("has-image", !!slide.image_url);
  banner.style.backgroundImage = slide.image_url
    ? 'linear-gradient(90deg,rgba(0,0,0,.78),rgba(0,0,0,.16)),url(' + JSON.stringify(slide.image_url) + ')'
    : "";
  banner.style.backgroundSize = slide.image_url ? "cover" : "";
  banner.style.backgroundPosition = slide.image_url ? "center" : "";
  banner.querySelectorAll("[data-banner-dot]").forEach((dot, i) => {
    dot.classList.toggle("active", i === bannerIndex);
    dot.setAttribute("aria-current", i === bannerIndex ? "true" : "false");
  });
}
function startBannerCarousel() {
  const banner = $(".banner");
  if (!banner) return;
  clearInterval(bannerTimer);
  bannerTimer = null;
  if (bannerSlides.length < 2) return;
  bannerTimer = setInterval(() => {
    if (!document.hidden) showBannerSlide(bannerIndex + 1);
  }, 5000);
  banner.addEventListener("click", event => {
    const dot = event.target.closest("[data-banner-dot]");
    if (!dot) return;
    showBannerSlide(Number(dot.dataset.bannerDot));
  });
}
async function initialize() {
  $("#tipsterOpen").hidden = true;
  $("#adminOpen").hidden = true;
  if (!window.supabase?.createClient) {
    if (backendStatus) backendStatus.textContent = "Could not load Supabase library. Check your connection.";
    return;
  }
  db = window.supabase.createClient(IDEAS_SUPABASE_URL, IDEAS_SUPABASE_PUBLISHABLE_KEY);
  try {
    const {error} = await db.from("announcements").select("id").limit(1);
    if (backendStatus) backendStatus.textContent = error ? "Database connection needs attention." : "Database connection: connected";
    if (error) console.warn("Supabase check:",error.message);
  } catch(error) {
    if (backendStatus) backendStatus.textContent = "Database connection needs attention.";
  }
  const {data:{session}} = await db.auth.getSession();
  if (session?.user) await afterLogin(session.user);
  db.auth.onAuthStateChange(async (_event, sessionNow) => {
    if (sessionNow?.user) { currentUser=sessionNow.user; setTimeout(()=>afterLogin(sessionNow.user),0); }
    else { currentUser=null; currentProfile=null; updateAccountControls(); }
  });
  await loadMarketplace();
  await loadHomeTipsters();
  const {data:news, error:newsError} = await db.from("announcements")
    .select("id,title,message,image_url")
    .eq("active",true)
    .order("created_at",{ascending:false});
  if (newsError) console.warn("Featured banners:", newsError.message);
  bannerSlides = news || [];
  const banner = $(".banner");
  if (banner && bannerSlides.length) {
    const content = banner.querySelector(":scope > div:first-child");
    if (content) {
      content.classList.add("banner-content");
      const dots = document.createElement("div");
      dots.className = "banner-dots";
      dots.setAttribute("aria-label", "Choose featured banner");
      dots.innerHTML = bannerSlides.map((slide, i) =>
        '<button type="button" class="banner-dot' + (i === 0 ? ' active' : '') +
        '" data-banner-dot="' + i + '" aria-label="Show banner ' + (i + 1) +
        '" aria-current="' + (i === 0 ? 'true' : 'false') + '"></button>'
      ).join("");
      banner.appendChild(dots);
    }
    showBannerSlide(0);
    startBannerCarousel();
  }
  updateAccountControls();
}
initialize();

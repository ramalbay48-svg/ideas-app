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
let otpPendingPhone = null;

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
function showPage(page) {
  const homeSections = [".welcome", ".banner", ".section", ".notice"];
  homeSections.forEach(selector => document.querySelectorAll(selector).forEach(el => el.hidden = page !== "home"));
  let panel = $("#appPagePanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "appPagePanel";
    panel.className = "section";
    $(".page").insertBefore(panel, $(".notice"));
  }
  panel.hidden = page === "home";
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("selected", b.dataset.view === page));
  if (page === "tipsters") loadTipstersPage(panel);
  if (page === "betslips") loadPurchasesPage(panel);
  if (page === "profile") loadProfilePage(panel);
  window.scrollTo({top:0, behavior:"smooth"});
}
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.view)));
document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach(b => b.classList.toggle("active", b === button));
  activeCompany = button.dataset.company;
  loadMarketplace();
}));
$("#themeToggle").addEventListener("click", () => {
  document.documentElement.classList.toggle("light");
  $('meta[name="theme-color"]').content = document.documentElement.classList.contains("light") ? "#f5f7f5" : "#0D0D0D";
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
  $("#authSubmit").textContent = isRegister ? "Send verification code" : "Log in";
  $("#passwordInput").autocomplete = isRegister ? "new-password" : "current-password";
  $("#passwordInput").placeholder = isRegister ? "At least 8 characters" : "Enter your password";
  $("#authHelp").textContent = isRegister ? "A verification code will be sent by SMS. SMS delivery must be enabled for this Supabase project." : "Enter your Tanzanian number and password.";
  $("#otpField")?.remove();
  $("#verifyOtpButton")?.remove();
  otpPendingPhone = null;
  $("#authForm").dataset.mode = mode;
}
function ensureOtpField() {
  if ($("#otpField")) return;
  const label = document.createElement("label");
  label.id = "otpField";
  label.className = "field-label";
  label.textContent = "SMS verification code";
  const input = document.createElement("input");
  input.id = "otpInput";
  input.className = "form-input";
  input.inputMode = "numeric";
  input.autocomplete = "one-time-code";
  input.maxLength = 6;
  input.placeholder = "Enter the 6-digit code";
  input.required = true;
  label.appendChild(input);
  $("#authForm").appendChild(label);
  const verify = document.createElement("button");
  verify.type = "button";
  verify.id = "verifyOtpButton";
  verify.className = "primary-action";
  verify.textContent = "Verify code and finish registration";
  verify.addEventListener("click", verifyPhoneOtp);
  $("#authForm").appendChild(verify);
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
    if (mode === "register") {
      const {data, error} = await db.auth.signUp({phone, password, options:{data:{display_name:""}}});
      if (error) throw error;
      if (data.session) {
        await afterLogin(data.user);
        $("#authModal").close();
        return toast("Account created successfully.");
      }
      otpPendingPhone = phone;
      ensureOtpField();
      toast("Verification code requested. Check your SMS.");
    } else {
      const {data, error} = await db.auth.signInWithPassword({phone, password});
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
async function verifyPhoneOtp() {
  if (!db || !otpPendingPhone) return;
  const token = $("#otpInput").value.trim();
  if (!/^\d{6}$/.test(token)) return toast("Enter the 6-digit verification code.");
  try {
    const {data, error} = await db.auth.verifyOtp({phone:otpPendingPhone, token, type:"sms"});
    if (error) throw error;
    await afterLogin(data.user);
    $("#authModal").close();
    toast("Phone verified. Account created.");
  } catch (error) {
    toast(error.message || "Could not verify that code.");
  }
}
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
  $("#tipsterOpen").hidden = !currentProfile || !["tipster","admin"].includes(currentProfile.role);
  $("#adminOpen").hidden = !currentProfile || currentProfile.role !== "admin";
}

async function loadTipstersPage(panel) {
  panel.innerHTML = '<p class="eyebrow">DISCOVER</p><h2>Approved tipsters</h2><p class="muted">Loading tipsters…</p>';
  if (!db) return;
  const {data, error} = await db.from("tipsters").select("id,username,bio,profiles(display_name)").eq("status","approved").order("created_at",{ascending:false});
  if (error) { panel.innerHTML = '<h2>Tipsters</h2><p class="muted">Could not load tipsters. Check database permissions.</p>'; return; }
  if (!data?.length) { panel.innerHTML = '<h2>Approved tipsters</h2><div class="empty">No approved tipsters yet. Check back soon.</div>'; return; }
  panel.innerHTML = '<p class="eyebrow">DISCOVER</p><h2>Approved tipsters</h2><div class="tipster-row">' + data.map(t => '<article class="tipster"><div class="tipster-avatar">'+escapeHtml((t.profiles?.display_name||t.username||"T").charAt(0).toUpperCase())+'</div><strong>'+escapeHtml(t.profiles?.display_name||t.username)+'</strong><small>@'+escapeHtml(t.username)+'</small><p class="muted">'+escapeHtml(t.bio||"")+'</p></article>').join("") + '</div>';
}
async function loadMarketplace() {
  const root = $("#slips");
  if (!root || !db) return;
  root.innerHTML = '<div class="empty">Loading available slips…</div>';
  let query = db.from("betslips").select("id,total_odds,price_tzs,betting_company,expires_at,tipsters(id,username,profiles(display_name))").eq("status","published").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false});
  if (activeCompany !== "All" && activeCompany !== "Other") query = query.eq("betting_company",activeCompany);
  const {data,error} = await query;
  if (error) { root.innerHTML = '<div class="empty">Marketplace could not load. Please try again later.</div>'; console.warn(error.message); return; }
  const term = $("#searchInput").value.trim().toLowerCase();
  const rows = (data||[]).filter(s => {
    const name = s.tipsters?.profiles?.display_name || s.tipsters?.username || "";
    const company = s.betting_company || "";
    return (activeCompany !== "Other" || !["SportPesa","Betika","BetPawa"].includes(company)) && (name.toLowerCase().includes(term) || (s.tipsters?.username||"").toLowerCase().includes(term));
  });
  if (!rows.length) { root.innerHTML = '<div class="empty">No published slips are available right now.</div>'; return; }
  root.innerHTML = rows.map(s => {
    const name = s.tipsters?.profiles?.display_name || s.tipsters?.username || "Tipster";
    const username = s.tipsters?.username || "";
    return '<article class="slip-card"><div class="slip-top"><div class="seller"><div class="seller-avatar">'+escapeHtml(name.charAt(0).toUpperCase())+'</div><div><strong>'+escapeHtml(name)+'</strong><small>@'+escapeHtml(username)+'</small></div></div><span class="company">'+escapeHtml(s.betting_company)+'</span></div><div class="slip-stats"><div class="stat"><small>Total odds</small><strong>'+escapeHtml(s.total_odds)+'</strong></div><div class="stat"><small>Validity</small><strong>'+new Date(s.expires_at).toLocaleString()+'</strong></div><div class="stat"><small>Slip image</small><strong>Covered</strong></div></div><div class="locked-preview">▣ BETSLIP HIDDEN UNTIL PAYMENT</div><div class="slip-footer"><div class="price">'+money(s.price_tzs)+'<small>One-time purchase</small></div><button class="buy-button" data-buy="'+s.id+'">Buy slip</button></div></article>';
  }).join("");
  root.querySelectorAll("[data-buy]").forEach(b => b.addEventListener("click", () => {
    if (!currentUser) return showAuth("login");
    toast("Secure checkout is not enabled yet. No payment has been taken.");
  }));
}
async function loadPurchasesPage(panel) {
  if (!currentUser) { panel.innerHTML = '<h2>My slips</h2><p class="muted">Log in to see your purchases.</p><button class="primary-action" id="pageLogin">Log in</button>'; $("#pageLogin").onclick=()=>showAuth("login"); return; }
  panel.innerHTML = '<h2>My slips</h2><p class="muted">Loading your purchases…</p>';
  const {data,error} = await db.from("purchases").select("id,status,amount_tzs,created_at,betslips(total_odds,betting_company,expires_at,tipsters(username))").eq("customer_id",currentUser.id).order("created_at",{ascending:false});
  if (error) { panel.innerHTML='<h2>My slips</h2><p class="muted">Could not load purchases.</p>'; return; }
  if (!data?.length) { panel.innerHTML='<h2>My slips</h2><div class="empty">You have not purchased any slips yet.</div>'; return; }
  panel.innerHTML='<h2>My slips</h2>'+data.map(p=>'<article class="slip-card"><strong>'+escapeHtml(p.betslips?.betting_company||"Betslip")+'</strong><p class="muted">'+escapeHtml(p.betslips?.tipsters?.username||"Tipster")+' · Odds '+escapeHtml(p.betslips?.total_odds||"—")+'</p><p>'+money(p.amount_tzs)+' · '+escapeHtml(p.status)+'</p>'+(p.status==="paid"?'<p class="muted">Payment confirmed. Secure image access will appear when private storage is configured.</p>':'<p class="muted">Waiting for verified payment.</p>')+'</article>').join("");
}
async function loadProfilePage(panel) {
  if (!currentUser) { panel.innerHTML='<h2>Your profile</h2><p class="muted">Log in or create an account to manage your profile.</p><button class="primary-action" id="profileLogin">Log in / Register</button>'; $("#profileLogin").onclick=()=>showAuth("register"); return; }
  const p=currentProfile || {};
  panel.innerHTML='<p class="eyebrow">ACCOUNT</p><h2>Your profile</h2><div class="slip-card"><strong>'+escapeHtml(p.display_name||"IDEAS APP member")+'</strong><p class="muted">'+escapeHtml(currentUser.phone||"")+'</p><p class="muted">Account type: '+escapeHtml(p.role||"customer")+'</p></div><button class="primary-action" id="logoutButton">Log out</button>';
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
$("#dashboardClose").addEventListener("click",()=>$("#tipsterDashboard").close());
$("#adminClose").addEventListener("click",()=>$("#adminDashboard").close());
$("#profileClose").addEventListener("click",()=>$("#profileModal").close());
$("#authModal").addEventListener("click", event => { if(event.target === $("#authModal")) $("#authModal").close(); });

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
  const {data:news} = await db.from("announcements").select("title,message").eq("active",true).limit(1).maybeSingle();
  if (news && $(".banner p")) $(".banner p").textContent = news.message;
  updateAccountControls();
}
initialize();

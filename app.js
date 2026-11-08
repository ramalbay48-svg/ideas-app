const tipsters=[
  {name:"Alpha Tips",handle:"@alphatips",initial:"A",verified:true},
  {name:"Golden Picks",handle:"@goldenpicks",initial:"G",verified:true},
  {name:"Smart Analyst",handle:"@smartanalyst",initial:"S",verified:true}
];
const slips=[
  {id:1,name:"Alpha Tips",handle:"@alphatips",initial:"A",company:"SportPesa",odds:"8.50",price:2500,expires:"2h 30m"},
  {id:2,name:"Golden Picks",handle:"@goldenpicks",initial:"G",company:"Betika",odds:"5.20",price:3000,expires:"5h 10m"},
  {id:3,name:"Smart Analyst",handle:"@smartanalyst",initial:"S",company:"BetPawa",odds:"12.00",price:2000,expires:"Tomorrow"}
];
let activeCompany="All";\nlet selectedCheckoutSlip=null;
const tipsterRoot=document.querySelector("#tipsters");
const slipRoot=document.querySelector("#slips");
const search=document.querySelector("#searchInput");
const toast=document.querySelector("#toast");
function showToast(message){toast.textContent=message;toast.classList.add("show");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove("show"),2300)}
function renderTipsters(){tipsterRoot.innerHTML=tipsters.map(t=>`<article class="tipster"><div class="tipster-avatar">${t.initial}</div><strong>${t.name} <span class="verified">✓</span></strong><small>${t.handle}</small></article>`).join("")}
function renderSlips(){
 const term=search.value.trim().toLowerCase();
 const shown=slips.filter(s=>(activeCompany==="All"||s.company===activeCompany||activeCompany==="Other"&&!["SportPesa","Betika","BetPawa"].includes(s.company))&&(s.name.toLowerCase().includes(term)||s.handle.toLowerCase().includes(term)));
 if(!shown.length){slipRoot.innerHTML='<div class="empty">No demo slips match your search.</div>';return}
 slipRoot.innerHTML=shown.map(s=>`<article class="slip-card">
  <div class="slip-top"><div class="seller"><div class="seller-avatar">${s.initial}</div><div><strong>${s.name} <span class="verified">✓</span></strong><small>${s.handle}</small></div></div><span class="company">${s.company}</span></div>
  <div class="slip-stats"><div class="stat"><small>Total odds</small><strong>${s.odds}</strong></div><div class="stat"><small>Validity</small><strong>${s.expires}</strong></div><div class="stat"><small>Slip image</small><strong>Covered</strong></div></div>
  <div class="locked-preview"><span class="lock">▣</span> BETSLIP HIDDEN UNTIL PAYMENT</div>
  <div class="slip-footer"><div class="price">TZS ${s.price.toLocaleString("en-US")}<small>One-time purchase · demo price</small></div><button class="buy-button" data-buy="${s.id}">Buy slip</button></div>
 </article>`).join("");
 slipRoot.querySelectorAll("[data-buy]").forEach(button=>button.addEventListener("click",()=>openCheckout(Number(button.dataset.buy))));
}
document.querySelectorAll(".filter").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".filter").forEach(b=>b.classList.remove("active"));button.classList.add("active");activeCompany=button.dataset.company;renderSlips()}));
search.addEventListener("input",renderSlips);
document.querySelector("#themeToggle").addEventListener("click",()=>{document.documentElement.classList.toggle("light");document.querySelector('meta[name="theme-color"]').content=document.documentElement.classList.contains("light")?"#f5f7f5":"#0D0D0D"});
document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>showToast(button.dataset.view==="home"?"You are on Home.":`${button.dataset.view[0].toUpperCase()+button.dataset.view.slice(1)} will be added in the next build stage.`)));
renderTipsters();renderSlips();
const authModal=document.querySelector("#authModal");
const profileModal=document.querySelector("#profileModal");
let authMode="register";
function setAuthMode(mode){authMode=mode;document.querySelectorAll(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.auth===mode));document.querySelector("#authTitle").textContent=mode==="register"?"Create account":"Welcome back";document.querySelector("#authSubmit").textContent=mode==="register"?"Create account":"Log in";document.querySelector("#passwordInput").autocomplete=mode==="register"?"new-password":"current-password";document.querySelector("#passwordInput").placeholder=mode==="register"?"At least 8 characters":"Enter your password";document.querySelector("#authHelp").textContent="Use your Tanzanian mobile number. Enter the 9 digits after +255."}
document.querySelector("#loginOpen").addEventListener("click",()=>{setAuthMode("login");authModal.showModal()});
document.querySelector("#authClose").addEventListener("click",()=>authModal.close());
document.querySelectorAll(".auth-tab").forEach(b=>b.addEventListener("click",()=>setAuthMode(b.dataset.auth)));
document.querySelector("#authForm").addEventListener("submit",event=>{event.preventDefault();const phone=document.querySelector("#phoneInput");const password=document.querySelector("#passwordInput");if(!phone.checkValidity()){phone.reportValidity();return}if(password.value.length<8){password.setCustomValidity("Use at least 8 characters.");password.reportValidity();password.setCustomValidity("");return}showToast("Demo only — secure account services are not connected.");authModal.close();event.target.reset()});
document.querySelector("#profileClose").addEventListener("click",()=>profileModal.close());
function openTipsterProfile(t){document.querySelector("#profileName").textContent=t.name;document.querySelector("#profileHandle").textContent=t.handle;document.querySelector("#profileInitial").textContent=t.initial;profileModal.showModal()}
tipsterRoot.addEventListener("click",event=>{const card=event.target.closest(".tipster");if(!card)return;const name=card.querySelector("strong").textContent.replace("✓","").trim();const t=tipsters.find(item=>item.name===name);if(t)openTipsterProfile(t)});

const dashboard=document.querySelector("#tipsterDashboard");
document.querySelector("#tipsterOpen").addEventListener("click",()=>dashboard.showModal());
document.querySelector("#dashboardClose").addEventListener("click",()=>dashboard.close());
const slipImageInput=document.querySelector("#slipImage");
const slipImagePreview=document.querySelector("#slipImagePreview");
let slipImageObjectUrl=null;
slipImageInput.addEventListener("change",()=>{const file=slipImageInput.files&&slipImageInput.files[0];if(slipImageObjectUrl){URL.revokeObjectURL(slipImageObjectUrl);slipImageObjectUrl=null}slipImagePreview.replaceChildren();if(!file){slipImagePreview.textContent="Your selected betslip image preview will appear here.";return}if(!file.type.startsWith("image/")){slipImagePreview.textContent="Please choose an image file.";slipImageInput.value="";return}slipImageObjectUrl=URL.createObjectURL(file);const img=document.createElement("img");img.src=slipImageObjectUrl;img.alt="Selected betslip preview";slipImagePreview.appendChild(img)});
document.querySelector("#slipUploadForm").addEventListener("submit",event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const expiry=new Date(document.querySelector("#slipExpiry").value);if(Number.isNaN(expiry.getTime())||expiry<=new Date()){showToast("Choose a future expiry time.");return}showToast("Slip draft prepared for preview only — not uploaded.");form.reset();if(slipImageObjectUrl){URL.revokeObjectURL(slipImageObjectUrl);slipImageObjectUrl=null}slipImagePreview.textContent="Your selected betslip image preview will appear here."});

const checkoutModal=document.querySelector("#checkoutModal");
function openCheckout(id){
 selectedCheckoutSlip=slips.find(s=>s.id===id);
 if(!selectedCheckoutSlip)return;
 document.querySelector("#checkoutSummary").innerHTML=`<strong>${selectedCheckoutSlip.name}</strong><small>${selectedCheckoutSlip.company} · Total odds ${selectedCheckoutSlip.odds} · Slip remains covered</small>`;
 document.querySelector("#checkoutTotal").textContent="TZS "+selectedCheckoutSlip.price.toLocaleString("en-US");
 document.querySelector("#unlockPreview").hidden=true;
 checkoutModal.showModal();
}
document.querySelector("#checkoutClose").addEventListener("click",()=>checkoutModal.close());
document.querySelector("#checkoutForm").addEventListener("submit",event=>{
 event.preventDefault();
 const form=event.currentTarget;
 if(!form.reportValidity())return;
 const phone=document.querySelector("#paymentPhone");
 if(!phone.checkValidity()){phone.reportValidity();return}
 document.querySelector("#unlockPreview").hidden=false;
 showToast("Demo checkout only — no payment was made.");
});

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
let activeCompany="All";
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
 slipRoot.querySelectorAll("[data-buy]").forEach(button=>button.addEventListener("click",()=>showToast("Demo only — payments are not connected yet.")));
}
document.querySelectorAll(".filter").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".filter").forEach(b=>b.classList.remove("active"));button.classList.add("active");activeCompany=button.dataset.company;renderSlips()}));
search.addEventListener("input",renderSlips);
document.querySelector("#themeToggle").addEventListener("click",()=>{document.documentElement.classList.toggle("light");document.querySelector('meta[name="theme-color"]').content=document.documentElement.classList.contains("light")?"#f5f7f5":"#0D0D0D"});
document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>showToast(button.dataset.view==="home"?"You are on Home.":`${button.dataset.view[0].toUpperCase()+button.dataset.view.slice(1)} will be added in the next build stage.`)));
renderTipsters();renderSlips();
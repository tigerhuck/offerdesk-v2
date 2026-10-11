/* OfferDesk v2 — all logic client-side. No accounts, no servers, works at the table. */
(function(){
"use strict";

var $ = function(id){ return document.getElementById(id); };
function num(id, def){
  var v = parseFloat(($(id).value || "").replace(/[$,%\s]/g,""));
  return isNaN(v) ? def : v;
}
function money(x){
  if(x===null || x===undefined || isNaN(x)) return "—";
  var neg = x < 0, a = Math.abs(Math.round(x));
  return (neg?"−$":"$") + a.toLocaleString("en-US");
}
function pct(x){
  if(x===null || x===undefined || isNaN(x)) return "—";
  return (Math.round(x*10)/10) + "%";
}

/* ---------- tabs ---------- */
var btns = document.querySelectorAll(".tabbtn");
btns.forEach(function(b){
  b.addEventListener("click", function(){
    btns.forEach(function(x){x.classList.remove("active");});
    b.classList.add("active");
    document.querySelectorAll(".tab").forEach(function(t){t.classList.add("hidden");});
    $("tab-"+b.dataset.goto).classList.remove("hidden");
    window.scrollTo(0,0);
  });
});

/* ---------- comp deep links ---------- */
document.querySelectorAll(".linkbtn[data-comp]").forEach(function(b){
  b.addEventListener("click", function(){
    var card = ($("f-card").value || $("p-card").value || "").trim() || "sports card";
    var q = encodeURIComponent(card);
    var url =
      b.dataset.comp==="ebay" ? "https://www.ebay.com/sch/i.html?_nkw="+q+"&LH_Sold=1&LH_Complete=1" :
      b.dataset.comp==="130"  ? "https://www.130point.com/" :
                                "https://www.psacard.com/cert";
    window.open(url, "_blank");
  });
});

/* ---------- FLIP analyzer ---------- */
$("f-go").addEventListener("click", function(){
  var raw=num("f-raw"), p10=num("f-p10"), p9=num("f-p9"),
      grading=num("f-grading",25), fee=num("f-fee",13), gem=num("f-gem",50);
  var res=$("f-result");
  if(!(raw>0) || !(p10>0) || !(p9>0)){
    res.classList.remove("hidden");
    $("f-verdict").textContent="—"; $("f-verdict").className="verdict";
    $("f-ev").textContent="—";
    $("f-note").textContent="Enter the raw price, PSA 10 and PSA 9 sold prices to run the math.";
    $("f-net10").textContent="—"; $("f-net9").textContent="—"; $("f-breakeven").textContent="—";
    return;
  }
  var keep = 1 - fee/100;
  var net10 = p10*keep - raw - grading;
  var net9  = p9*keep  - raw - grading;
  var g = Math.min(100, Math.max(0, gem))/100;
  var ev = g*net10 + (1-g)*net9;
  var denom = net10 - net9;
  var breakeven = denom > 0 ? (-net9/denom)*100 : null;

  var v=$("f-verdict"), cls, label;
  if(ev >= 100){ label="GRADE IT"; cls="good"; }
  else if(ev <= -50){ label="PASS"; cls="bad"; }
  else { label="COIN FLIP"; cls="warn"; }
  v.textContent=label; v.className="verdict "+cls;

  var evEl=$("f-ev");
  evEl.textContent=(ev<0?"−$":"+$")+Math.abs(Math.round(ev)).toLocaleString("en-US");
  evEl.className = ev>=0 ? "pos" : "neg";

  var n10=$("f-net10"); n10.textContent=money(net10); n10.className=net10>=0?"pos":"neg";
  var n9=$("f-net9"); n9.textContent=money(net9); n9.className=net9>=0?"pos":"neg";
  $("f-breakeven").textContent = breakeven===null ? "—" : pct(Math.max(0,breakeven)) + " gem rate";

  var note=[];
  if(breakeven!==null && breakeven>70) note.push("You'd need to gem "+pct(breakeven)+" of these — be honest about your gem rate before you buy.");
  if(net9>=0) note.push("Even a 9 makes money here. That's a green light.");
  if(ev>=100 && net9<0) note.push("This only works if it gems. Check centering and corners hard.");
  $("f-note").textContent = note.join(" ");
  res.classList.remove("hidden");
  res.dataset.ev = Math.round(ev);
  res.dataset.card = $("f-card").value.trim();
  res.scrollIntoView({behavior:"smooth", block:"nearest"});
});
$("f-save").addEventListener("click", function(){
  var ev=parseFloat($("f-result").dataset.ev||"0");
  var card=$("f-result").dataset.card||"Grade flip";
  addEntry("flip", card+" (flip EV)", ev);
  document.querySelector('[data-goto="pnl"]').click();
});

/* ---------- OFFER: subtabs ---------- */
document.querySelectorAll(".subtab").forEach(function(b){
  b.addEventListener("click", function(){
    document.querySelectorAll(".subtab").forEach(function(x){x.classList.remove("active");});
    b.classList.add("active");
    ["single","lot","counter"].forEach(function(m){
      $("mode-"+m).classList.toggle("hidden", m!==b.dataset.mode);
    });
  });
});

function tiers(comp, feePct, ship, marginTarget){
  var resaleNet = comp*(1-feePct/100) - ship;
  var out = [65,70,75].map(function(p){
    var offer = comp*p/100, profit = resaleNet-offer;
    var margin = resaleNet>0 ? profit/resaleNet*100 : 0;
    return {pct:p, offer:offer, profit:profit, margin:margin, meets: margin>=marginTarget};
  });
  var pick = out.filter(function(t){return t.meets;}).pop() || out[0];
  return {tiers:out, pick:pick, resaleNet:resaleNet};
}
function tierHTML(t, isPick){
  return '<div class="tier'+(isPick?' pick':'')+'">'+
    '<span class="tpct">'+t.pct+'%</span>'+
    '<span class="tinfo"><b>'+money(t.offer)+'</b>'+money(t.profit)+' profit · '+pct(t.margin)+' margin</span></div>';
}

$("o-go").addEventListener("click", function(){
  var box=$("o-tiers");
  var comp=num("o-comp");
  if(!(comp>0)){ box.innerHTML='<p class="fine">Enter the comp first.</p>'; return; }
  var r=tiers(comp, num("o-fee",13), num("o-ship",5), num("o-margin",30));
  var html='<p class="fine" style="margin:10px 0 2px">Resale net '+money(r.resaleNet)+' — your offer:</p>';
  r.tiers.forEach(function(t){ html+=tierHTML(t, t===r.pick); });
  html+='<p class="fine">Offer <b style="color:var(--good)">'+money(r.pick.offer)+'</b> at '+r.pick.pct+'%.</p>';
  box.innerHTML=html;
});

/* lot */
$("lot-add").addEventListener("click", function(){
  var d=document.createElement("div"); d.className="lotrow";
  d.innerHTML='<input class="lot-name" placeholder="Card"><input class="lot-comp" inputmode="decimal" placeholder="$ comp">';
  $("lot-rows").appendChild(d);
});
$("l-go").addEventListener("click", function(){
  var box=$("l-result"), total=0, n=0;
  document.querySelectorAll("#lot-rows .lot-comp").forEach(function(i){
    var v=parseFloat((i.value||"").replace(/[$,\s]/g,""));
    if(v>0){ total+=v; n++; }
  });
  if(!n){ box.innerHTML='<p class="fine">Add at least one comp.</p>'; return; }
  var r=tiers(total, num("l-fee",13), 5*n, num("l-margin",30));
  var html='<p class="fine" style="margin:10px 0 2px">'+n+' cards · '+money(total)+' total comp:</p>';
  r.tiers.forEach(function(t){ html+=tierHTML(t, t===r.pick); });
  box.innerHTML=html;
});

/* counter */
$("c-go").addEventListener("click", function(){
  var comp=num("c-comp"), ask=num("c-ask");
  var res=$("c-result");
  if(!(comp>0)||!(ask>0)){ return; }
  var fee=num("c-fee",13), target=num("c-margin",30);
  var resaleNet=comp*(1-fee/100)-5;
  var profit=resaleNet-ask, margin=resaleNet>0?profit/resaleNet*100:0;
  var maxPay=resaleNet*(1-target/100);
  var v=$("c-verdict"), label, cls;
  if(margin>=target){ label="TAKE IT"; cls="good"; }
  else if(margin>=target-8){ label="COUNTER "+money(maxPay); cls="warn"; }
  else { label="WALK"; cls="bad"; }
  v.textContent=label; v.className="verdict "+cls;
  var mo=$("c-marginout"); mo.textContent=pct(margin); mo.className=margin>=0?"pos":"neg";
  var po=$("c-profitout"); po.textContent=money(profit); po.className=profit>=0?"pos":"neg";
  $("c-maxpay").textContent=money(maxPay);
  res.classList.remove("hidden");
});

/* ---------- P&L ---------- */
function loadLog(){
  try{ return JSON.parse(localStorage.getItem("od2_log")||"[]"); }
  catch(e){ return []; }
}
function saveLog(l){ try{ localStorage.setItem("od2_log", JSON.stringify(l)); }catch(e){} }
function addEntry(type, card, amt){
  var l=loadLog();
  l.unshift({type:type, card:card||"—", amt:Math.round(amt)||0, ts:Date.now()});
  saveLog(l); renderLog();
}
function renderLog(){
  var l=loadLog(), inn=0, out=0, html="";
  l.forEach(function(e){
    if(e.type==="buy") out+=Math.abs(e.amt);
    else if(e.type==="sell") inn+=e.amt;
    else { if(e.amt>=0) inn+=e.amt; else out+=Math.abs(e.amt); }
    var sign = e.type==="buy" ? "−" : "+";
    html+='<div class="prow"><span>'+escapeHtml(e.card)+'</span><b class="'+(e.type==="buy"?"pa-buy":"pa-sell")+'">'+
      sign+money(Math.abs(e.amt)).replace(/^−/,"")+'</b></div>';
  });
  var net=inn-out, netEl=$("p-net");
  netEl.textContent=(net<0?"−$":"$")+Math.abs(Math.round(net)).toLocaleString("en-US");
  netEl.className=net>=0?"pos":"neg";
  $("p-in").textContent=money(inn); $("p-out").textContent=money(out);
  $("p-list").innerHTML = l.length? html : '<p class="fine">Nothing logged yet.</p>';
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
$("p-buy").addEventListener("click", function(){
  var a=num("p-amt"); if(!(a>0)) return;
  addEntry("buy", $("p-card").value.trim(), a); $("p-card").value=""; $("p-amt").value="";
});
$("p-sell").addEventListener("click", function(){
  var a=num("p-amt"); if(!(a>0)) return;
  addEntry("sell", $("p-card").value.trim(), a); $("p-card").value=""; $("p-amt").value="";
});
$("p-clear").addEventListener("click", function(){
  if(confirm("Clear the whole weekend?")){ saveLog([]); renderLog(); }
});
renderLog();
})();

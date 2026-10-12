/* OfferDesk v3 — live answers. Everything recalculates as you type. */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
function val(el){ return parseFloat((el.value||"").replace(/[$,%\s]/g,"")); }
function num(id, def){ var v = val($(id)); return isNaN(v) ? def : v; }
function money(x){
  if(x===null||x===undefined||isNaN(x)) return "—";
  var neg=x<0, a=Math.abs(Math.round(x));
  return (neg?"−$":"$")+a.toLocaleString("en-US");
}
function moneySigned(x){
  if(x===null||x===undefined||isNaN(x)) return "—";
  return (x<0?"−$":"+$")+Math.abs(Math.round(x)).toLocaleString("en-US");
}
function pct(x){ if(x===null||x===undefined||isNaN(x)) return "—"; return (Math.round(x*10)/10)+"%"; }
function esc(s){ return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }

/* ---------- tabs ---------- */
var btns=document.querySelectorAll(".tabbtn");
btns.forEach(function(b){ b.addEventListener("click",function(){
  btns.forEach(function(x){x.classList.remove("active");}); b.classList.add("active");
  document.querySelectorAll(".tab").forEach(function(t){t.classList.add("hidden");});
  $("tab-"+b.dataset.goto).classList.remove("hidden"); window.scrollTo(0,0);
});});

/* ---------- sales-list component: many sold prices -> one comp ---------- */
function makeSalesList(listId, initial){
  var list=$(listId);
  function addRow(v){
    var inp=document.createElement("input");
    inp.setAttribute("inputmode","decimal"); inp.placeholder="$ sold";
    if(v!==undefined) inp.value=v;
    inp.addEventListener("input", recalcAll);
    list.appendChild(inp);
  }
  (initial&&initial.length?initial:[""]).forEach(addRow);
  return {
    add:function(){ addRow(); var i=list.lastChild; if(i&&i.focus) i.focus(); },
    comp:function(){
      var vals=[];
      list.querySelectorAll("input").forEach(function(i){ var v=val(i); if(v>0) vals.push(v); });
      if(!vals.length) return null;
      vals.sort(function(a,b){return a-b;});
      var use=vals;
      if(vals.length>=5) use=vals.slice(1,-1);           // trimmed mean: drop high/low
      var avg=use.reduce(function(s,v){return s+v;},0)/use.length;
      return {comp:avg, n:vals.length, lo:vals[0], hi:vals[vals.length-1]};
    },
    clear:function(){ list.innerHTML=""; addRow(); recalcAll(); }
  };
}
var fP10=makeSalesList("f-p10sales",["3100","2950","3050"]);
var fP9 =makeSalesList("f-p9sales",["820","790","810"]);
var oSales=makeSalesList("o-sales",["500","480","520"]);
document.querySelectorAll("[data-add]").forEach(function(b){
  b.addEventListener("click",function(){
    ({ "f-p10sales":fP10, "f-p9sales":fP9, "o-sales":oSales })[b.dataset.add].add();
  });
});

/* ---------- FLIP ---------- */
function recalcFlip(){
  var p10=fP10.comp(), p9=fP9.comp();
  var p10c=p10?p10.comp:null, p9c=p9?p9.comp:null;
  $("f-p10comp").textContent = p10? money(p10c):"—";
  $("f-p10n").textContent = p10? "("+p10.n+" sales)":"";
  $("f-p9comp").textContent = p9? money(p9c):"—";
  $("f-p9n").textContent = p9? "("+p9.n+" sales)":"";
  var raw=num("f-raw"), grading=num("f-grading",25), fee=num("f-fee",13), gem=num("f-gem",50);
  var V=$("f-verdict");
  if(!(raw>0)||p10c===null||p9c===null){
    V.textContent="Enter sales above"; V.className="verdict";
    $("f-ev").textContent="—"; $("f-net10").textContent="—";
    $("f-net9").textContent="—"; $("f-breakeven").textContent="—"; $("f-note").textContent="";
    return;
  }
  var keep=1-fee/100;
  var net10=p10c*keep-raw-grading, net9=p9c*keep-raw-grading;
  var g=Math.min(100,Math.max(0,gem))/100;
  var ev=g*net10+(1-g)*net9;
  var denom=net10-net9, be=denom>0?(-net9/denom)*100:null;
  var label,cls;
  if(ev>=100){label="GRADE IT";cls="good";} else if(ev<=-50){label="PASS";cls="bad";}
  else{label="COIN FLIP";cls="warn";}
  V.textContent=label; V.className="verdict "+cls;
  var evEl=$("f-ev"); evEl.textContent=moneySigned(ev); evEl.className=ev>=0?"pos":"neg";
  var n10=$("f-net10"); n10.textContent=money(net10); n10.className=net10>=0?"pos":"neg";
  var n9=$("f-net9"); n9.textContent=money(net9); n9.className=net9>=0?"pos":"neg";
  $("f-breakeven").textContent = be===null?"—":pct(Math.max(0,be))+" gem rate";
  var note=[];
  if(be!==null&&be>70) note.push("You'd need to gem "+pct(be)+" of these — be honest about your gem rate before you buy.");
  if(net9>=0) note.push("Even a 9 makes money. Green light.");
  else if(ev>=100) note.push("Only works if it gems — check centering and corners hard.");
  else if(label==="COIN FLIP") note.push("Not a deal at your gem rate. Negotiate the raw price down or walk.");
  $("f-note").textContent=note.join(" ");
  var r=$("f-result"); r.dataset.ev=Math.round(ev); r.dataset.card=$("f-card").value.trim();
}
$("f-clear").addEventListener("click",function(){
  fP10.clear(); fP9.clear();
  ["f-raw","f-grading","f-fee","f-gem"].forEach(function(id){$(id).value="";});
  $("f-card").value=""; $("f-grading").value=25; $("f-fee").value=13; $("f-gem").value=50;
});
$("f-save").addEventListener("click",function(){
  addEntry("flip", ($("f-result").dataset.card||"Grade flip")+" (flip EV)",
    parseFloat($("f-result").dataset.ev||"0"));
  document.querySelector('[data-goto="pnl"]').click();
});

/* ---------- OFFER ---------- */
function tiers(comp,feePct,ship,marginTarget){
  var rn=comp*(1-feePct/100)-ship;
  var out=[65,70,75].map(function(p){
    var offer=comp*p/100, profit=rn-offer;
    return {pct:p,offer:offer,profit:profit,margin:rn>0?profit/rn*100:0,meets:(rn>0?profit/rn*100:0)>=marginTarget};
  });
  return {tiers:out, pick:out.filter(function(t){return t.meets;}).pop()||out[0], rn:rn};
}
function tierHTML(t,pick){
  return '<div class="tier'+(t===pick?' pick':'')+'"><span class="tpct">'+t.pct+'%</span>'+
    '<span class="tinfo"><b>'+money(t.offer)+'</b>'+money(t.profit)+' profit · '+pct(t.margin)+'</span></div>';
}
function recalcOffer(){
  var c=oSales.comp(), box=$("o-tiers");
  var co=$("o-compout");
  if(!c){ co.textContent="—"; $("o-compn").textContent=""; box.innerHTML=""; return; }
  co.textContent=money(c.comp); $("o-compn").textContent="("+c.n+" sales)";
  var r=tiers(c.comp,num("o-fee",13),num("o-ship",5),num("o-margin",30));
  var h='<p class="fine" style="margin:10px 0 2px">Resale net '+money(r.rn)+' — offer:</p>';
  r.tiers.forEach(function(t){ h+=tierHTML(t,r.pick); });
  h+='<p class="pickline">Offer <b>'+money(r.pick.offer)+'</b> at '+r.pick.pct+'%.</p>';
  box.innerHTML=h;
}
/* lot */
function lotRow(name,comp){
  var d=document.createElement("div"); d.className="lotrow";
  d.innerHTML='<input class="lot-name" placeholder="Card" value="'+esc(name||"")+'">'+
    '<input class="lot-comp" inputmode="decimal" placeholder="$ comp" value="'+esc(comp||"")+'">';
  d.querySelectorAll("input").forEach(function(i){ i.addEventListener("input",recalcAll); });
  $("lot-rows").appendChild(d);
}
lotRow("","500"); lotRow("","300");
$("lot-add").addEventListener("click",function(){ lotRow("",""); });
function recalcLot(){
  var total=0,n=0;
  document.querySelectorAll("#lot-rows .lot-comp").forEach(function(i){
    var v=val(i); if(v>0){total+=v;n++;}
  });
  var box=$("l-result");
  if(!n){ box.innerHTML=""; return; }
  var r=tiers(total,num("l-fee",13),5*n,num("l-margin",30));
  var h='<p class="fine" style="margin:10px 0 2px">'+n+' cards · '+money(total)+' total:</p>';
  r.tiers.forEach(function(t){ h+=tierHTML(t,r.pick); });
  box.innerHTML=h;
}
/* counter */
function recalcCounter(){
  var comp=num("c-comp"), ask=num("c-ask"), V=$("c-verdict");
  if(!(comp>0)||!(ask>0)){ V.textContent="—"; V.className="verdict";
    $("c-marginout").textContent="—";$("c-profitout").textContent="—";$("c-maxpay").textContent="—"; return; }
  var fee=num("c-fee",13), target=num("c-margin",30);
  var rn=comp*(1-fee/100)-5, profit=rn-ask, margin=rn>0?profit/rn*100:0;
  var maxPay=rn*(1-target/100), label,cls;
  if(margin>=target){label="TAKE IT";cls="good";}
  else if(margin>=target-8){label="COUNTER "+money(maxPay);cls="warn";}
  else{label="WALK";cls="bad";}
  V.textContent=label; V.className="verdict "+cls;
  var mo=$("c-marginout"); mo.textContent=pct(margin); mo.className=margin>=0?"pos":"neg";
  var po=$("c-profitout"); po.textContent=money(profit); po.className=profit>=0?"pos":"neg";
  $("c-maxpay").textContent=money(maxPay);
}
document.querySelectorAll(".subtab").forEach(function(b){
  b.addEventListener("click",function(){
    document.querySelectorAll(".subtab").forEach(function(x){x.classList.remove("active");});
    b.classList.add("active");
    ["single","lot","counter"].forEach(function(m){ $("mode-"+m).classList.toggle("hidden",m!==b.dataset.mode); });
  });
});

/* ---------- P&L ---------- */
function loadLog(){ try{return JSON.parse(localStorage.getItem("od2_log")||"[]");}catch(e){return[];} }
function saveLog(l){ try{localStorage.setItem("od2_log",JSON.stringify(l));}catch(e){} }
function addEntry(type,card,amt){
  var l=loadLog(); l.unshift({type:type,card:card||"—",amt:Math.round(amt)||0,ts:Date.now()});
  saveLog(l); renderLog();
}
function renderLog(){
  var l=loadLog(),inn=0,out=0,h="";
  l.forEach(function(e){
    if(e.type==="buy") out+=Math.abs(e.amt);
    else if(e.type==="sell") inn+=e.amt;
    else{ if(e.amt>=0) inn+=e.amt; else out+=Math.abs(e.amt); }
    h+='<div class="prow"><span>'+esc(e.card)+'</span><b class="'+(e.type==="buy"?"pa-buy":"pa-sell")+'">'+
      (e.type==="buy"?"−$":"+$")+Math.abs(e.amt).toLocaleString("en-US")+'</b></div>';
  });
  var net=inn-out, ne=$("p-net");
  ne.textContent=(net<0?"−$":"$")+Math.abs(Math.round(net)).toLocaleString("en-US");
  ne.className=net>=0?"pos":"neg";
  $("p-in").textContent=money(inn); $("p-out").textContent=money(out);
  $("p-list").innerHTML=l.length?h:'<p class="fine">Nothing logged yet.</p>';
}
$("p-buy").addEventListener("click",function(){ var a=num("p-amt"); if(!(a>0))return;
  addEntry("buy",$("p-card").value.trim(),a); $("p-card").value="";$("p-amt").value=""; });
$("p-sell").addEventListener("click",function(){ var a=num("p-amt"); if(!(a>0))return;
  addEntry("sell",$("p-card").value.trim(),a); $("p-card").value="";$("p-amt").value=""; });
$("p-clear").addEventListener("click",function(){ if(confirm("Clear the whole weekend?")){saveLog([]);renderLog();} });

/* ---------- AUTH + PRO ---------- */
var ME={email:null,pro:false,flipsLeft:1};
function api(path,opts){
  return fetch(path,Object.assign({headers:{"Content-Type":"application/json"},
    credentials:"same-origin"},opts||{}))
    .then(function(r){ return r.json().catch(function(){return {};}); });
}
function renderAccount(){
  var out=$("acct-out"), inn=$("acct-in");
  if(!ME.email){ out.classList.remove("hidden"); inn.classList.add("hidden"); return; }
  out.classList.add("hidden"); inn.classList.remove("hidden");
  $("a-who").textContent=ME.email;
  var plan=$("a-plan");
  plan.textContent=ME.pro?"Pro — unlimited":"Free";
  plan.style.color=ME.pro?"var(--good)":"";
  $("a-flips").textContent=ME.pro?"unlimited":ME.flipsLeft;
  $("a-pro").classList.toggle("hidden",ME.pro);
  $("a-paid").classList.toggle("hidden",ME.pro);
  if(ME.pro) $("f-upsell").classList.add("hidden");
}
function refreshMe(){
  return api("/api/me").then(function(d){
    ME.email=d.email||null; ME.pro=!!d.pro;
    ME.flipsLeft=(d.flips_left===null||d.flips_left===undefined)?1:d.flips_left;
    renderAccount();
  }).catch(function(){ renderAccount(); });
}
function authErr(m){ $("a-err").textContent=m||""; }
function gotoTab(name){
  document.querySelector('[data-goto="'+name+'"]').click();
}
$("a-login").addEventListener("click",function(){ authErr("");
  api("/api/login",{method:"POST",body:JSON.stringify({email:$("a-email").value,password:$("a-pw").value})})
    .then(function(d){ if(d.ok){$("a-pw").value="";refreshMe();} else authErr(d.error||"Login failed."); });
});
$("a-signup").addEventListener("click",function(){ authErr("");
  api("/api/signup",{method:"POST",body:JSON.stringify({email:$("a-email").value,password:$("a-pw").value})})
    .then(function(d){ if(d.ok){$("a-pw").value="";refreshMe();} else authErr(d.error||"Signup failed."); });
});
$("a-logout").addEventListener("click",function(){
  api("/api/logout",{method:"POST"}).then(function(){
    ME={email:null,pro:false,flipsLeft:1}; renderAccount(); });
});
$("a-pro").addEventListener("click",function(){ authErr("");
  api("/api/checkout",{method:"POST",body:JSON.stringify({})}).then(function(d){
    if(d.ok&&d.url) window.location=d.url; else authErr(d.error||"Checkout failed to start.");
  });
});
$("a-paid").addEventListener("click",function(){ authErr("");
  api("/api/refresh-pro",{method:"POST"}).then(function(d){
    if(d.ok){ refreshMe();
      if(!d.pro) authErr("No active subscription found for this email yet — make sure you checked out with the same email.");
    } else authErr(d.error||"Refresh failed.");
  });
});
$("f-gopro").addEventListener("click",function(){ gotoTab("account"); });

/* flip freemium gate: the pre-loaded example is always free; your own flips cost 1/day */
var flipTouched=false, flipGateTimer=null;
function anonUseFlip(){
  try{
    var k="odpro_free_"+new Date().toISOString().slice(0,10);
    var n=parseInt(localStorage.getItem(k)||"0",10);
    if(n>=1) return false;
    localStorage.setItem(k,String(n+1)); return true;
  }catch(e){ return true; }
}
function gateFlip(){
  if(ME.pro) return Promise.resolve(true);
  if(ME.email){
    return api("/api/flip-used",{method:"POST"}).then(function(d){
      if(typeof d.flips_left==="number") ME.flipsLeft=d.flips_left;
      renderAccount(); return !!d.ok;
    }).catch(function(){ return true; });
  }
  return Promise.resolve(anonUseFlip());
}
function showFlipUpsell(){ $("f-upsell").classList.remove("hidden"); }
$("tab-flip").addEventListener("input",function(){
  if(ME.pro) return;
  if(!flipTouched) flipTouched=true;
  clearTimeout(flipGateTimer);
  flipGateTimer=setTimeout(function(){
    gateFlip().then(function(ok){ if(!ok) showFlipUpsell(); });
  },3000);
});
if(window.location.search.indexOf("paid=1")>=0){
  gotoTab("account");
  setTimeout(function(){ authErr("Payment received — log in with the email you checked out with, then hit refresh."); },400);
}

/* ---------- live recalc ---------- */
function recalcAll(){ recalcFlip(); recalcOffer(); recalcLot(); recalcCounter(); }
document.querySelectorAll("input").forEach(function(i){
  if(!i.closest(".saleslist")&&!i.classList.contains("lot-comp")) i.addEventListener("input",recalcAll);
});
renderLog(); recalcAll(); refreshMe();
})();

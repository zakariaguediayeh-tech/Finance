/* ============ MES FINANCES — app.js ============ */
const CUR = "€";
const fmt = n => (n<0?"-":"") + Math.abs(n).toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:2}) + " " + CUR;
const fmt2 = n => Math.abs(n).toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:0});

/* Catégories (dépenses) */
const CATS = [
  {id:"alim", n:"Alimentation", e:"🛒", c:"#2dd4a7"},
  {id:"loge", n:"Logement",     e:"🏠", c:"#4d9ef6"},
  {id:"transp",n:"Transport",   e:"🚗", c:"#8b7cf6"},
  {id:"loisir",n:"Loisirs",     e:"🎮", c:"#f0b429"},
  {id:"sante", n:"Santé",       e:"⚕️", c:"#f4736b"},
  {id:"resto", n:"Restaurant",  e:"🍽️", c:"#fb923c"},
  {id:"shop",  n:"Shopping",    e:"🛍️", c:"#ec4899"},
  {id:"abo",   n:"Abonnements", e:"📱", c:"#22d3ee"},
  {id:"autre", n:"Autre",       e:"📦", c:"#94a3b8"},
];
const INCOME_CATS = [
  {id:"salaire",n:"Salaire", e:"💼", c:"#2dd4a7"},
  {id:"freelance",n:"Freelance",e:"💻",c:"#4d9ef6"},
  {id:"cadeau", n:"Cadeau",  e:"🎁", c:"#8b7cf6"},
  {id:"autre_in",n:"Autre",  e:"💰", c:"#94a3b8"},
];
const catById = id => CATS.find(c=>c.id===id) || INCOME_CATS.find(c=>c.id===id) || {n:"Autre",e:"📦",c:"#94a3b8"};

/* ============ ÉTAT + PERSISTANCE ============ */
const KEY = "mesfinances_v1";
let DB = load();
let tab = "dash";
let txType = "expense";   // pour le formulaire
let txCat = "alim";

function load(){
  try{
    const d = JSON.parse(localStorage.getItem(KEY));
    if(d) return d;
  }catch(e){}
  return { tx:[], budgets:{}, goals:[], settings:{} };
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(DB)); }catch(e){} }

/* ============ HELPERS DATE / CALCULS ============ */
function ym(d){ const x=new Date(d); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,'0'); }
function curMonth(){ return ym(new Date()); }
const MONTHNAMES=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
function monthLabel(yms){ const [y,m]=yms.split('-'); return MONTHNAMES[+m-1]+" "+y; }

function txOfMonth(yms){ return DB.tx.filter(t=>ym(t.date)===yms); }
function sumIncome(yms){ return txOfMonth(yms).filter(t=>t.type==="income").reduce((a,t)=>a+t.amount,0); }
function sumExpense(yms){ return txOfMonth(yms).filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0); }
function spentByCat(yms,catId){ return txOfMonth(yms).filter(t=>t.type==="expense"&&t.cat===catId).reduce((a,t)=>a+t.amount,0); }

/* ============ NAV ============ */
function go(t){
  tab=t;
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("on",b.dataset.tab===t));
  document.getElementById("fab").style.display = (t==="invest")?"none":"flex";
  render();
}
function toast(msg,type){
  const el=document.getElementById("toast");
  el.textContent=msg; el.className="toast show"+(type?(" "+type):"");
  clearTimeout(el._t); el._t=setTimeout(()=>el.className="toast",1700);
}

/* ============ RENDER ROUTER ============ */
function render(){
  document.getElementById("hdrMonth").textContent = monthLabel(curMonth());
  const subs={dash:"Tableau de bord",tx:"Transactions",budget:"Budgets & alertes",save:"Épargne & objectifs",invest:"Investir (éducatif)"};
  document.getElementById("hdrSub").textContent = subs[tab];
  const v=document.getElementById("view");
  v.innerHTML = ({dash:viewDash,tx:viewTx,budget:viewBudget,save:viewSave,invest:viewInvest})[tab]();
  if(tab==="dash") drawDonut();
  if(tab==="invest") calcCI();
}

/* ============ VUE TABLEAU DE BORD ============ */
function viewDash(){
  const m=curMonth();
  const inc=sumIncome(m), exp=sumExpense(m), bal=inc-exp;
  const savingRate = inc>0 ? Math.round((bal/inc)*100) : 0;
  // alertes budget
  let alerts="";
  CATS.forEach(c=>{
    const b=DB.budgets[c.id]; if(!b) return;
    const s=spentByCat(m,c.id); const r=s/b;
    if(r>=1) alerts+=`<div class="alert danger">⛔ Budget <b>${c.n}</b> dépassé : ${fmt(s)} / ${fmt(b)}</div>`;
    else if(r>=0.8) alerts+=`<div class="alert">⚠️ Budget <b>${c.n}</b> presque atteint : ${fmt(s)} / ${fmt(b)} (${Math.round(r*100)}%)</div>`;
  });
  // 6 derniers mois (balance)
  const months=[]; const now=new Date();
  for(let i=5;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push(ym(d)); }
  const maxAbs=Math.max(1,...months.map(mm=>Math.max(sumIncome(mm),sumExpense(mm))));
  let bars=months.map(mm=>{
    const e=sumExpense(mm); const h=Math.max(3,e/maxAbs*100);
    return `<div style="flex:1;text-align:center">
      <div class="bars" style="height:90px;margin:0"><div class="bar" style="height:${h}%;background:var(--expense)"><span style="position:absolute;top:-15px;left:0;right:0;font-size:9px;color:var(--muted)">${e>0?fmt2(e):''}</span></div></div>
      <div class="barlbl">${MONTHNAMES[+mm.split('-')[1]-1].replace('.','')}</div></div>`;
  }).join('');

  const recent = [...DB.tx].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4);
  let recentHtml = recent.length ? recent.map(txRow).join('') : '<div class="empty">Aucune transaction.<br>Appuie sur + pour commencer.</div>';

  return `<div class="wrap">
    ${alerts}
    <div class="card">
      <div class="muted">Solde du mois — ${monthLabel(m)}</div>
      <div class="big ${bal>=0?'income':'expense'}">${fmt(bal)}</div>
      <div class="grid2" style="margin-top:13px">
        <div class="stat"><div class="v income">${fmt(inc)}</div><div class="l">↓ Revenus</div></div>
        <div class="stat"><div class="v expense">${fmt(exp)}</div><div class="l">↑ Dépenses</div></div>
      </div>
      <div class="row between" style="margin-top:13px">
        <span class="muted">Taux d'épargne</span>
        <b class="${savingRate>=0?'income':'expense'}">${savingRate}%</b>
      </div>
      <div class="progwrap"><div class="progbar" style="width:${Math.max(0,Math.min(100,savingRate))}%;background:var(--income)"></div></div>
    </div>

    <div class="card">
      <b style="font-size:15px">Répartition des dépenses</b>
      <div class="muted" style="font-size:11px;margin-bottom:6px">${monthLabel(m)}</div>
      <div id="donutWrap" style="text-align:center"></div>
    </div>

    <div class="card">
      <b style="font-size:15px">Dépenses · 6 mois</b>
      <div class="bars" style="height:auto;align-items:flex-end">${bars}</div>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:6px">
        <b style="font-size:15px">Dernières transactions</b>
        <button class="del" style="color:var(--accent)" onclick="go('tx')">Tout voir →</button>
      </div>
      ${recentHtml}
    </div>
    <div style="height:10px"></div>
  </div>`;
}

function drawDonut(){
  const m=curMonth();
  const data=CATS.map(c=>({...c,v:spentByCat(m,c.id)})).filter(d=>d.v>0).sort((a,b)=>b.v-a.v);
  const wrap=document.getElementById('donutWrap'); if(!wrap) return;
  const total=data.reduce((a,d)=>a+d.v,0);
  if(total===0){ wrap.innerHTML='<div class="empty">Pas encore de dépenses ce mois-ci.</div>'; return; }
  const R=58, C=2*Math.PI*R; let off=0;
  let circles=data.map(d=>{
    const frac=d.v/total; const len=frac*C;
    const el=`<circle cx="80" cy="80" r="${R}" fill="none" stroke="${d.c}" stroke-width="22"
      stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"/>`;
    off+=len; return el;
  }).join('');
  let legend=data.map(d=>`<div class="li"><span class="dot" style="background:${d.c}"></span>
    <span style="flex:1">${d.e} ${d.n}</span><b>${fmt(d.v)}</b>
    <span class="muted" style="margin-left:6px">${Math.round(d.v/total*100)}%</span></div>`).join('');
  wrap.innerHTML=`<svg class="donut" width="160" height="160" viewBox="0 0 160 160">
    ${circles}
    <text x="80" y="74" text-anchor="middle" fill="var(--muted)" font-size="10">Total</text>
    <text x="80" y="92" text-anchor="middle" fill="var(--txt)" font-size="16" font-weight="800">${fmt2(total)}${CUR}</text>
  </svg><div class="legend">${legend}</div>`;
}

/* ============ VUE TRANSACTIONS ============ */
function txRow(t){
  const c=catById(t.cat);
  const sign=t.type==="income"?"+":"−";
  const cls=t.type==="income"?"income":"expense";
  return `<div class="tx">
    <div class="ic" style="background:${c.c}22;color:${c.c}">${c.e}</div>
    <div class="info"><div class="t">${t.label||c.n}</div>
      <div class="d">${c.n} · ${new Date(t.date).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</div></div>
    <div class="amt ${cls}">${sign}${fmt(t.amount)}</div>
  </div>`;
}
function viewTx(){
  const sorted=[...DB.tx].sort((a,b)=>new Date(b.date)-new Date(a.date));
  // group by month
  const groups={};
  sorted.forEach(t=>{ const k=ym(t.date); (groups[k]=groups[k]||[]).push(t); });
  let html="";
  if(sorted.length===0) html='<div class="card"><div class="empty">Aucune transaction.<br>Appuie sur le bouton + en bas à droite.</div></div>';
  for(const k in groups){
    const inc=groups[k].filter(t=>t.type==="income").reduce((a,t)=>a+t.amount,0);
    const exp=groups[k].filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
    html+=`<div class="card">
      <div class="row between" style="margin-bottom:4px">
        <b>${monthLabel(k)}</b>
        <span class="muted"><span class="income">+${fmt2(inc)}</span> · <span class="expense">−${fmt2(exp)}</span> ${CUR}</span>
      </div>
      ${groups[k].map(t=>`<div onclick="confirmDel('${t.id}')">${txRow(t)}</div>`).join('')}
    </div>`;
  }
  return `<div class="wrap">
    <div class="muted" style="font-size:12px;margin-bottom:10px;text-align:center">Astuce : appuie sur une transaction pour la supprimer</div>
    ${html}<div style="height:10px"></div></div>`;
}
function confirmDel(id){
  if(confirm("Supprimer cette transaction ?")){
    DB.tx=DB.tx.filter(t=>t.id!==id); save(); render(); toast("Transaction supprimée");
  }
}

/* ----- MODAL AJOUT TRANSACTION ----- */
function openTx(){
  txType="expense"; txCat="alim";
  renderSheet();
  document.getElementById("modal").classList.add("show");
}
function closeSheet(){ document.getElementById("modal").classList.remove("show"); }
function setTxType(t){ txType=t; txCat = t==="income"?"salaire":"alim"; renderSheet(); }
function setTxCat(id){ txCat=id; renderSheet(); }
function renderSheet(){
  const cats = txType==="income"?INCOME_CATS:CATS;
  const chips=cats.map(c=>`<div class="catchip ${c.id===txCat?'on':''}" onclick="setTxCat('${c.id}')">${c.e} ${c.n}</div>`).join('');
  const today=new Date().toISOString().slice(0,10);
  document.getElementById("sheet").innerHTML=`
    <h3>Nouvelle transaction</h3>
    <div class="seg">
      <button class="${txType==='expense'?'on':''}" onclick="setTxType('expense')" style="${txType==='expense'?'background:var(--expense)':''}">Dépense</button>
      <button class="${txType==='income'?'on':''}" onclick="setTxType('income')" style="${txType==='income'?'background:var(--income);color:#04210f':''}">Revenu</button>
    </div>
    <div class="field"><label>Montant (${CUR})</label>
      <input id="txAmt" type="number" inputmode="decimal" placeholder="0" autofocus></div>
    <div class="field"><label>Catégorie</label>
      <div class="catrow">${chips}</div></div>
    <div class="field"><label>Libellé (optionnel)</label>
      <input id="txLabel" type="text" placeholder="Ex : Courses Carrefour"></div>
    <div class="field"><label>Date</label>
      <input id="txDate" type="date" value="${today}"></div>
    <button class="btn" onclick="addTx()">Ajouter</button>
    <button class="btn ghost" style="margin-top:8px" onclick="closeSheet()">Annuler</button>`;
  setTimeout(()=>{const a=document.getElementById("txAmt");if(a)a.focus();},100);
}
function addTx(){
  const amt=parseFloat(document.getElementById("txAmt").value);
  if(!amt||amt<=0){ toast("Entre un montant valide","err"); return; }
  const label=document.getElementById("txLabel").value.trim();
  const date=document.getElementById("txDate").value||new Date().toISOString().slice(0,10);
  DB.tx.push({ id:Date.now()+"_"+Math.random().toString(36).slice(2,7), type:txType, cat:txCat, amount:amt, label, date });
  save(); closeSheet();
  // check budget alert
  if(txType==="expense"){
    const b=DB.budgets[txCat];
    if(b){ const s=spentByCat(curMonth(),txCat);
      if(s>b) toast(`⛔ Budget ${catById(txCat).n} dépassé !`,"err");
      else if(s>=b*0.8) toast(`⚠️ Budget ${catById(txCat).n} bientôt atteint`,"warn");
      else toast("Transaction ajoutée ✓"); }
    else toast("Transaction ajoutée ✓");
  } else toast("Revenu ajouté ✓");
  render();
}

/* ============ VUE BUDGETS ============ */
function viewBudget(){
  const m=curMonth();
  let totalBudget=0,totalSpent=0;
  let rows=CATS.map(c=>{
    const b=DB.budgets[c.id]||0; const s=spentByCat(m,c.id);
    totalBudget+=b; totalSpent+=s;
    const r=b>0?s/b:0; const pct=Math.min(100,r*100);
    const color = r>=1?'var(--expense)': r>=0.8?'var(--amber)':'var(--income)';
    return `<div class="card" style="padding:13px">
      <div class="row between">
        <div class="row" style="gap:9px"><span style="font-size:18px">${c.e}</span><b>${c.n}</b></div>
        <button class="btn sm ghost" onclick="editBudget('${c.id}')">${b>0?'Modifier':'+ Définir'}</button>
      </div>
      ${b>0?`<div class="row between" style="margin-top:9px;font-size:13px">
        <span class="muted">${fmt(s)} dépensés</span><span style="color:${color};font-weight:700">${Math.round(r*100)}%</span></div>
      <div class="progwrap"><div class="progbar" style="width:${pct}%;background:${color}"></div></div>
      <div class="muted" style="font-size:11px;margin-top:5px">${b-s>=0?`Reste ${fmt(b-s)}`:`Dépassé de ${fmt(s-b)}`} · budget ${fmt(b)}</div>`
      :`<div class="muted" style="font-size:12px;margin-top:7px">Pas de budget défini · ${fmt(s)} dépensés ce mois</div>`}
    </div>`;
  }).join('');
  const tr=totalBudget>0?totalSpent/totalBudget:0;
  return `<div class="wrap">
    <div class="card">
      <div class="muted">Budget total · ${monthLabel(m)}</div>
      <div class="big ${tr>=1?'expense':''}">${fmt(totalSpent)} <span style="font-size:16px;color:var(--muted)">/ ${fmt(totalBudget)}</span></div>
      <div class="progwrap"><div class="progbar" style="width:${Math.min(100,tr*100)}%;background:${tr>=1?'var(--expense)':tr>=0.8?'var(--amber)':'var(--income)'}"></div></div>
      <div class="muted" style="font-size:12px;margin-top:7px">Définis un plafond mensuel par catégorie. L'app t'alerte à 80% et à 100%.</div>
    </div>
    ${rows}<div style="height:10px"></div></div>`;
}
function editBudget(catId){
  const c=catById(catId); const cur=DB.budgets[catId]||"";
  const val=prompt(`Budget mensuel pour ${c.n} (${CUR}) :`, cur);
  if(val===null) return;
  const n=parseFloat(val);
  if(!n||n<=0){ delete DB.budgets[catId]; toast("Budget retiré"); }
  else { DB.budgets[catId]=n; toast(`Budget ${c.n} : ${fmt(n)}`); }
  save(); render();
}

/* ============ VUE ÉPARGNE / OBJECTIFS ============ */
function viewSave(){
  let goals=DB.goals.map((g,i)=>{
    const r=g.target>0?g.saved/g.target:0; const pct=Math.min(100,r*100);
    const done=g.saved>=g.target;
    return `<div class="card">
      <div class="row between">
        <div class="row" style="gap:9px"><span style="font-size:20px">${g.emoji||'🎯'}</span>
          <div><b>${g.name}</b><div class="muted" style="font-size:11px">Objectif ${fmt(g.target)}</div></div></div>
        <button class="del" onclick="delGoal(${i})">✕</button>
      </div>
      <div class="progwrap" style="height:10px"><div class="progbar" style="width:${pct}%;background:${done?'var(--income)':'var(--accent)'}"></div></div>
      <div class="row between" style="margin-top:7px">
        <b class="${done?'income':''}">${fmt(g.saved)}</b>
        <span class="muted">${done?'✓ Atteint !':`Reste ${fmt(g.target-g.saved)} · ${Math.round(r*100)}%`}</span>
      </div>
      <div class="row" style="gap:7px;margin-top:10px">
        <button class="btn sm ghost" style="flex:1" onclick="addToGoal(${i},1)">+ Ajouter</button>
        <button class="btn sm ghost" style="flex:1" onclick="addToGoal(${i},-1)">− Retirer</button>
      </div>
    </div>`;
  }).join('');
  if(DB.goals.length===0) goals='<div class="card"><div class="empty">Aucun objectif.<br>Crée ton premier objectif d\'épargne 🎯</div></div>';
  const totalSaved=DB.goals.reduce((a,g)=>a+g.saved,0);
  const totalTarget=DB.goals.reduce((a,g)=>a+g.target,0);
  return `<div class="wrap">
    <div class="card">
      <div class="muted">Épargne totale</div>
      <div class="big income">${fmt(totalSaved)}</div>
      ${totalTarget>0?`<div class="muted" style="font-size:12px">sur ${fmt(totalTarget)} d'objectifs (${Math.round(totalSaved/totalTarget*100)}%)</div>`:''}
    </div>
    <button class="btn" onclick="newGoal()">+ Nouvel objectif</button>
    <div style="height:13px"></div>
    ${goals}
    <div class="card">
      <b>💡 Règle des 50/30/20</b>
      <div class="muted" style="line-height:1.6;margin-top:7px;font-size:12.5px">
      Une méthode simple pour répartir tes revenus :<br>
      • <b style="color:var(--blue)">50%</b> besoins (loyer, courses, factures)<br>
      • <b style="color:var(--pur)">30%</b> envies (loisirs, resto, shopping)<br>
      • <b style="color:var(--income)">20%</b> épargne & investissement
      </div>
    </div>
    <div style="height:10px"></div></div>`;
}
function newGoal(){
  const name=prompt("Nom de l'objectif (ex : Vacances, Fonds d'urgence) :");
  if(!name) return;
  const target=parseFloat(prompt(`Montant à atteindre (${CUR}) :`));
  if(!target||target<=0){ toast("Montant invalide","err"); return; }
  const emojis=['🎯','✈️','🏠','🚗','💻','🎓','💍','🛡️','🏖️'];
  DB.goals.push({name,target,saved:0,emoji:emojis[DB.goals.length%emojis.length]});
  save(); render(); toast("Objectif créé 🎯");
}
function addToGoal(i,sign){
  const g=DB.goals[i];
  const v=parseFloat(prompt(`${sign>0?'Ajouter à':'Retirer de'} "${g.name}" (${CUR}) :`));
  if(!v||v<=0) return;
  g.saved=Math.max(0,g.saved+sign*v); save(); render();
  if(g.saved>=g.target) toast("🎉 Objectif atteint !");
  else toast(sign>0?"Épargne ajoutée ✓":"Retiré");
}
function delGoal(i){ if(confirm("Supprimer cet objectif ?")){ DB.goals.splice(i,1); save(); render(); } }

/* ============ VUE INVESTIR (ÉDUCATIF) ============ */
function viewInvest(){
  return `<div class="wrap">
    <div class="alert" style="background:rgba(77,158,246,.1);border-color:var(--blue);color:var(--blue)">
      ℹ️ Contenu éducatif uniquement — ceci n'est pas un conseil financier personnalisé. Renseigne-toi et/ou consulte un professionnel avant d'investir.
    </div>

    <div class="card">
      <b style="font-size:15px">Avant d'investir : les bases</b>
      <div class="adviceblk" style="margin-top:10px"><b>1. Fonds d'urgence d'abord.</b> Garde 3 à 6 mois de dépenses sur un livret sécurisé (ex : Livret A) avant tout investissement.</div>
      <div class="adviceblk"><b>2. Rembourse les dettes coûteuses.</b> Un crédit conso à 15% « rapporte » plus à rembourser qu'un placement moyen.</div>
      <div class="adviceblk"><b>3. Investis sur le long terme.</b> Plus l'horizon est long (5-10 ans+), plus le risque se lisse avec le temps.</div>
    </div>

    <div class="card">
      <b style="font-size:15px">Profils de risque</b>
      <div class="muted" style="font-size:12px;margin-bottom:6px">Répartition indicative selon ta tolérance</div>
      ${riskProfile("Prudent","Sécurité avant tout",[["Fonds €/Livrets",70,"var(--income)"],["Obligations",20,"var(--blue)"],["Actions",10,"var(--pur)"]])}
      ${riskProfile("Équilibré","Croissance modérée",[["Fonds €/Livrets",40,"var(--income)"],["Obligations",25,"var(--blue)"],["Actions",35,"var(--pur)"]])}
      ${riskProfile("Dynamique","Long terme, plus de risque",[["Fonds €/Livrets",15,"var(--income)"],["Obligations",20,"var(--blue)"],["Actions",65,"var(--pur)"]])}
    </div>

    <div class="card">
      <b style="font-size:15px">Enveloppes en France 🇫🇷</b>
      <div class="adviceblk" style="margin-top:10px"><b>Livret A / LDDS.</b> Sans risque, disponible, défiscalisé. Idéal pour le fonds d'urgence.</div>
      <div class="adviceblk"><b>Assurance-vie.</b> Souple, fiscalité avantageuse après 8 ans. Fonds euros (sécurisé) ou unités de compte (risqué).</div>
      <div class="adviceblk"><b>PEA.</b> Actions européennes, exonération d'impôt sur les gains après 5 ans (hors prélèvements sociaux).</div>
      <div class="adviceblk"><b>ETF / trackers.</b> Paniers d'actions diversifiés à frais réduits. Souvent logés dans un PEA ou une assurance-vie.</div>
    </div>

    <div class="card">
      <b style="font-size:15px">🧮 Simulateur intérêts composés</b>
      <div class="muted" style="font-size:12px;margin:5px 0 10px">Estime la croissance d'un placement régulier</div>
      <div class="field"><label>Versement mensuel (${CUR})</label><input id="ciMonthly" type="number" inputmode="decimal" value="100" oninput="calcCI()"></div>
      <div class="field"><label>Durée (années)</label><input id="ciYears" type="number" inputmode="numeric" value="10" oninput="calcCI()"></div>
      <div class="field"><label>Rendement annuel estimé (%)</label><input id="ciRate" type="number" inputmode="decimal" value="5" oninput="calcCI()"></div>
      <div id="ciResult"></div>
    </div>

    <div class="card">
      <b style="font-size:15px">⚠️ Pièges à éviter</b>
      <div class="muted" style="line-height:1.7;margin-top:8px;font-size:12.5px">
      • Promesses de gains rapides/garantis élevés = arnaque<br>
      • N'investis jamais ce que tu ne peux pas perdre<br>
      • Diversifie — ne mets pas tout au même endroit<br>
      • Méfie-toi des frais élevés qui grignotent les gains<br>
      • Évite les décisions sous le coup de l'émotion (FOMO, panique)
      </div>
    </div>
    <div style="height:10px"></div></div>`;
}
function riskProfile(name,desc,parts){
  const bar=parts.map(p=>`<div style="width:${p[1]}%;background:${p[2]}"></div>`).join('');
  const leg=parts.map(p=>`<span style="font-size:11px;color:var(--muted)"><span class="dot" style="background:${p[2]};display:inline-block;vertical-align:middle"></span> ${p[0]} ${p[1]}%</span>`).join(' &nbsp; ');
  return `<div style="margin:13px 0 4px"><div class="row between"><b style="font-size:13px">${name}</b><span class="muted" style="font-size:11px">${desc}</span></div>
    <div class="riskbar">${bar}</div><div style="line-height:1.8">${leg}</div></div>`;
}
function calcCI(){
  const m=parseFloat(document.getElementById("ciMonthly").value)||0;
  const y=parseFloat(document.getElementById("ciYears").value)||0;
  const r=(parseFloat(document.getElementById("ciRate").value)||0)/100;
  const n=y*12; const mr=r/12;
  let fv = mr>0 ? m*((Math.pow(1+mr,n)-1)/mr) : m*n;
  const invested=m*n; const gain=fv-invested;
  document.getElementById("ciResult").innerHTML=`
    <div class="grid2" style="margin-top:4px">
      <div class="stat"><div class="v">${fmt(invested)}</div><div class="l">Total versé</div></div>
      <div class="stat"><div class="v income">+${fmt(gain)}</div><div class="l">Gains estimés</div></div>
    </div>
    <div class="stat" style="margin-top:11px;text-align:center"><div class="v income" style="font-size:26px">${fmt(fv)}</div><div class="l">Capital final estimé après ${y} ans</div></div>`;
}

/* ============ INIT ============ */
function boot(){
  go('dash');
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
}
boot();

/* ===== Mosolo - Interface ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, cur = 'FC') => Number(n || 0).toLocaleString('fr-FR') + ' ' + cur;
const fdate = d => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const byGroup = g => ACCOUNTS.filter(a => a.group === g);
const opts = (list, sel) => list.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)} — ${fmt(balance(a.id), a.cur)}</option>`).join('');
const PAY_FC = ACCOUNTS.filter(a => a.cur === 'FC' && a.group !== 'dist');
const PAY_ALL = ACCOUNTS.filter(a => a.group !== 'dist');

let page = 'home', period = 'day', histFilter = { q: '', type: '', status: '' }, repPeriod = 'month';
const NAV = [['home', '🏠', 'Accueil'], ['hist', '📋', 'Historique'], ['close', '✅', 'Clôture'], ['rep', '📊', 'Rapports'], ['set', '⚙️', 'Réglages']];

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2600); }
function go(p) { page = p; render(); window.scrollTo(0, 0); }
function openModal(html) { const m = $('#modal'); m.innerHTML = '<div>' + html + '</div>'; m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); }; }
function closeModal() { $('#modal').classList.add('hidden'); }

/* ---------- Rendu général ---------- */
function render() {
  if (!S.setup) return renderSetup();
  const nav = NAV.map(n => `<a class="${page === n[0] ? 'on' : ''}" onclick="go('${n[0]}')"><span>${n[1]}</span>${n[2]}</a>`).join('');
  const body = { home: pageHome, hist: pageHist, close: pageClose, rep: pageRep, set: pageSet }[page]();
  $('#app').innerHTML = `<div class="layout">
    <aside class="side"><h1>📒 ${esc(S.cabin)}</h1><small>Mosolo</small>${nav}<a onclick="logout()" style="margin-top:auto"><span>🚪</span>Déconnexion</a></aside>
    <main>${body}</main>
    <nav class="bottom">${nav}</nav>
  </div><button class="fab noprint" onclick="chooseOp()" aria-label="Nouvelle opération">+</button>`;
}

/* ---------- Configuration initiale ---------- */
function renderSetup() {
  const inputs = g => byGroup(g).map(a => `<label>${a.name} (${a.cur})</label><input type="number" min="0" inputmode="numeric" name="${a.id}" placeholder="0">`).join('');
  $('#app').innerHTML = `<div class="hero"><div class="card">
    <h2>👋 Bienvenue sur Mosolo</h2>
    <p class="sub">Notez ce que vous avez réellement aujourd'hui. L'application fera les calculs pour vous après chaque opération.</p>
    <div class="logos"><img src="assets/orange.jpg"><img src="assets/airtel.jpg"><img src="assets/mpesa.jpg"><img src="assets/afrimoney.png"></div>
    <form id="sf" onsubmit="finishSetup(event)">
      <label>Nom de la cabine</label><input name="cabin" required placeholder="Ex : Cabine Espoir">
      <label>Votre nom</label><input name="owner" required placeholder="Ex : Jean" value="${esc(window.USER_NAME || '')}">
      <h3>💵 Argent liquide en caisse</h3>${inputs('cash')}
      <h3>📱 Soldes Mobile Money</h3>${inputs('mm')}
      <h3>📶 Fonds pour vendre crédit & forfaits</h3>${inputs('dist')}
      <div class="hint">Ces montants sont vos soldes de départ. Ce ne sont pas des bénéfices. Laissez 0 si vous n'avez rien.</div>
      <button class="btn green" style="width:100%;margin-top:18px">Valider et commencer</button>
    </form></div></div>`;
}
function finishSetup(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  ACCOUNTS.forEach(a => S.opening[a.id] = Math.max(0, Number(f.get(a.id)) || 0));
  S.cabin = f.get('cabin').trim(); S.owner = f.get('owner').trim(); S.agents = [S.owner];
  S.openedAt = new Date().toISOString(); S.setup = true; save(); go('home');
}

/* ---------- Accueil ---------- */
function accCard(a) {
  const b = balance(a.id), low = a.cur === 'FC' && b < S.threshold;
  return `<div class="card acc"><div class="ic">${a.logo ? `<img src="${a.logo}" alt="">` : a.icon}</div>
    <div><small>${esc(a.name)}</small><b class="${low ? 'warn' : ''}">${fmt(b, a.cur)}</b></div></div>`;
}
function pageHome() {
  const st = stats(period), pend = S.tx.filter(t => t.status === 'attente').length;
  const alerts = [];
  ACCOUNTS.forEach(a => { if (a.cur === 'FC' && balance(a.id) < S.threshold) alerts.push(`⚠️ ${a.name} est bas : ${fmt(balance(a.id))}`); });
  if (pend) alerts.push(`⏳ ${pend} opération(s) en attente de validation`);
  const today = new Date().toDateString();
  if (!S.closures.some(c => new Date(c.date).toDateString() === today)) alerts.push('🔔 La clôture du jour n\'est pas encore faite');
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d; });
  const vals = days.map(d => S.tx.filter(t => t.status === 'valide' && !t.cancelledBy && !['annulation', 'ajustement'].includes(t.type) && new Date(t.date).toDateString() === d.toDateString())
    .reduce((s, t) => s + (t.commission || 0) + (t.margin || 0), 0));
  const max = Math.max(...vals, 1);
  const last = S.tx.slice(-5).reverse().map(txRow).join('') || '<p class="sub">Aucune opération pour le moment. Appuyez sur le bouton vert +</p>';
  const P = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']];
  return `<h2>Bonjour ${esc(S.owner)} 👋</h2><p class="sub">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
  ${alerts.map(a => `<div class="alert">${a}</div>`).join('')}
  <h3>Que voulez-vous faire ?</h3>
  <div class="quick">
    <button onclick="openOp('credit')"><span>📱</span>Vente crédit</button>
    <button onclick="openOp('forfait')"><span>🌐</span>Vente forfait</button>
    <button onclick="openOp('depot')"><span>⬇️</span>Dépôt</button>
    <button onclick="openOp('retrait')"><span>⬆️</span>Retrait</button>
    <button onclick="openOp('depense')"><span>🧾</span>Dépense</button>
    <button onclick="chooseOp()"><span>➕</span>Autres</button>
  </div>
  ${['cash', 'mm', 'dist'].map(g => `<h3>${GROUPS[g]}</h3><div class="grid">${byGroup(g).map(accCard).join('')}</div>`).join('')}
  <h3>Activité</h3>
  <div class="tabs">${P.map(p => `<button class="${period === p[0] ? 'on' : ''}" onclick="period='${p[0]}';render()">${p[1]}</button>`).join('')}</div>
  <div class="grid">
    <div class="card stat"><small>Opérations</small><b>${st.count}</b></div>
    <div class="card stat"><small>Dépôts</small><b>${fmt(st.depots)}</b></div>
    <div class="card stat"><small>Retraits</small><b>${fmt(st.retraits)}</b></div>
    <div class="card stat"><small>Ventes crédit</small><b>${fmt(st.credit)}</b></div>
    <div class="card stat"><small>Ventes forfaits</small><b>${fmt(st.forfait)}</b></div>
    <div class="card stat"><small>Commissions</small><b>${fmt(st.commissions)}</b></div>
    <div class="card stat"><small>Dépenses</small><b class="neg">${fmt(st.depenses)}</b></div>
    <div class="card stat"><small>Bénéfice brut</small><b>${fmt(st.brut)}</b></div>
    <div class="card stat big"><small>Bénéfice net</small><b>${fmt(st.net)}</b></div>
  </div>
  <h3>Gains des 7 derniers jours</h3>
  <div class="card"><div class="bars">${vals.map((v, i) => `<div><span>${v ? v.toLocaleString('fr-FR') : ''}</span><i style="height:${Math.round(v / max * 90)}%"></i>${days[i].toLocaleDateString('fr-FR', { weekday: 'short' })}</div>`).join('')}</div></div>
  <h3>Dernières opérations</h3><div class="card">${last}</div>`;
}

/* ---------- Ligne d'opération ---------- */
function txRow(t, actions) {
  const sign = t.moves.map(m => `${esc(A[m.a].name)} ${m.v > 0 ? '+' : '−'}${Math.abs(m.v).toLocaleString('fr-FR')}`).join(' · ');
  const cancelled = !!t.cancelledBy;
  const st = cancelled ? '<span class="badge annule">Annulée</span>' : t.status === 'attente' ? '<span class="badge attente">En attente</span>' : '';
  const gain = (t.commission || 0) + (t.margin || 0);
  let act = '';
  if (actions) {
    if (t.status === 'attente') act += `<button class="btn green sm" onclick="doValidate('${t.id}')">Valider</button> `;
    if (t.status === 'valide' && !cancelled && !['annulation', 'ajustement'].includes(t.type)) act += `<button class="btn gray sm" onclick="doCancel('${t.id}')">Annuler</button>`;
  }
  return `<div class="tx"><div><b>${TYPE_LABEL[t.type]}</b> ${st}<small>${esc(t.label || '')}</small><small>${sign}</small>
    <small>${fdate(t.date)} · ${esc(t.agent || '')}${t.ref ? ' · Réf ' + esc(t.ref) : ''}${gain ? ' · Gain ' + fmt(gain) : ''}</small>${act ? '<div style="margin-top:6px">' + act + '</div>' : ''}</div>
    <div class="r"><b style="${cancelled ? 'text-decoration:line-through' : ''}">${t.amount ? t.amount.toLocaleString('fr-FR') : ''}</b></div></div>`;
}

/* ---------- Historique ---------- */
function filtered() {
  const q = histFilter.q.toLowerCase();
  return S.tx.slice().reverse().filter(t => (!histFilter.type || t.type === histFilter.type) &&
    (!histFilter.status || (histFilter.status === 'annulee' ? t.cancelledBy : t.status === histFilter.status && !t.cancelledBy)) &&
    (!q || [t.label, t.client, t.ref, t.agent].join(' ').toLowerCase().includes(q)));
}
function pageHist() {
  const list = filtered();
  return `<h2>Historique</h2><p class="sub">Toutes les opérations. Rien n'est supprimé : une annulation crée une écriture inverse.</p>
  <div class="filters noprint"><input placeholder="🔍 Rechercher (client, référence, agent…)" value="${esc(histFilter.q)}" oninput="histFilter.q=this.value;renderHistList()">
  <select onchange="histFilter.type=this.value;renderHistList()"><option value="">Tous les types</option>${Object.keys(TYPE_LABEL).map(k => `<option value="${k}" ${histFilter.type === k ? 'selected' : ''}>${TYPE_LABEL[k]}</option>`).join('')}</select>
  <select onchange="histFilter.status=this.value;renderHistList()"><option value="">Tous statuts</option><option value="valide" ${histFilter.status === 'valide' ? 'selected' : ''}>Validées</option><option value="attente" ${histFilter.status === 'attente' ? 'selected' : ''}>En attente</option><option value="annulee" ${histFilter.status === 'annulee' ? 'selected' : ''}>Annulées</option></select></div>
  <div class="row noprint" style="margin-bottom:10px"><span class="sub" style="margin:0" id="hcount">${list.length} opération(s)</span><span><button class="btn gray sm" onclick="exportCSV(filtered())">Excel</button> <button class="btn gray sm" onclick="window.print()">Imprimer</button></span></div>
  <div class="card" id="hlist">${list.map(t => txRow(t, true)).join('') || '<p class="sub">Aucune opération.</p>'}</div>`;
}
function renderHistList() { const l = filtered(); $('#hlist').innerHTML = l.map(t => txRow(t, true)).join('') || '<p class="sub">Aucune opération.</p>'; $('#hcount').textContent = l.length + ' opération(s)'; }
function doValidate(id) { try { validateTx(id); toast('Opération validée ✅'); render(); } catch (e) { alert(e.message); } }
function doCancel(id) {
  const r = prompt('Pourquoi annuler cette opération ?'); if (r === null) return;
  try { cancelTx(id, r, currentAgent()); toast('Annulée : soldes rétablis'); render(); } catch (e) { alert(e.message); }
}
function currentAgent() { return S.agents[0] || S.owner; }

/* ---------- Choix & formulaires d'opération ---------- */
function chooseOp() {
  openModal(`<h2>Nouvelle opération</h2><p class="sub">Choisissez :</p><div class="quick">
  <button onclick="openOp('depot')"><span>⬇️</span>Dépôt client</button><button onclick="openOp('retrait')"><span>⬆️</span>Retrait client</button>
  <button onclick="openOp('credit')"><span>📱</span>Vente crédit</button><button onclick="openOp('forfait')"><span>🌐</span>Vente forfait</button>
  <button onclick="openOp('appro')"><span>🔄</span>Approvisionner un fonds</button><button onclick="openOp('transfert')"><span>↔️</span>Transfert entre comptes</button>
  <button onclick="openOp('depense')"><span>🧾</span>Dépense</button></div>
  <button class="btn gray" style="width:100%;margin-top:14px" onclick="closeModal()">Fermer</button>`);
}
const num = (v) => Number(v) || 0;
const FORMS = {
  depot: { title: '⬇️ Dépôt client', hint: 'Le client vous donne du cash. Caisse + / compte Mobile Money −.',
    html: () => `<label>Compte Mobile Money utilisé</label><select name="acc">${opts(byGroup('mm'))}</select>
      <label>Montant du dépôt (FC)</label><input name="amount" type="number" min="1" required inputmode="numeric">
      <label>Numéro du client (facultatif)</label><input name="client" inputmode="tel">
      <label>Votre commission (FC, facultatif)</label><input name="commission" type="number" min="0" inputmode="numeric">`,
    build: v => { const a = num(v.amount); if (a <= 0) throw Error('Entrez un montant'); return { amount: a, commission: num(v.commission), client: v.client, label: 'Dépôt ' + A[v.acc].name + (v.client ? ' · ' + v.client : ''), moves: [{ a: 'caisse_fc', v: a }, { a: v.acc, v: -a }] }; } },
  retrait: { title: '⬆️ Retrait client', hint: 'Le client reçoit du cash. Caisse − / compte Mobile Money +.',
    html: () => FORMS.depot.html().replace('du dépôt', 'du retrait'),
    build: v => { const a = num(v.amount); if (a <= 0) throw Error('Entrez un montant'); return { amount: a, commission: num(v.commission), client: v.client, label: 'Retrait ' + A[v.acc].name + (v.client ? ' · ' + v.client : ''), moves: [{ a: 'caisse_fc', v: -a }, { a: v.acc, v: a }] }; } },
  transfert: { title: '↔️ Transfert entre comptes', hint: 'Déplace de l\'argent entre vos comptes. Ce n\'est pas un bénéfice.',
    html: () => `<label>De</label><select name="from">${opts(PAY_FC, 'orange')}</select><label>Vers</label><select name="to">${opts(PAY_FC, 'mpesa')}</select>
      <label>Montant (FC)</label><input name="amount" type="number" min="1" required inputmode="numeric">`,
    build: v => { const a = num(v.amount); if (a <= 0) throw Error('Entrez un montant'); if (v.from === v.to) throw Error('Choisissez deux comptes différents'); return { amount: a, label: A[v.from].name + ' → ' + A[v.to].name, moves: [{ a: v.from, v: -a }, { a: v.to, v: a }] }; } },
  appro: { title: '🔄 Approvisionner un fonds', hint: 'Vous payez pour recharger votre fonds de distribution. Ce n\'est pas un bénéfice.',
    html: () => `<label>Fonds à recharger</label><select name="fund">${opts(byGroup('dist'))}</select><label>Payé depuis</label><select name="src">${opts(PAY_FC)}</select>
      <label>Montant (FC)</label><input name="amount" type="number" min="1" required inputmode="numeric">`,
    build: v => { const a = num(v.amount); if (a <= 0) throw Error('Entrez un montant'); return { amount: a, label: 'Approvisionnement ' + A[v.fund].name + ' depuis ' + A[v.src].name, moves: [{ a: v.src, v: -a }, { a: v.fund, v: a }] }; } },
  credit: { title: '📱 Vente de crédit', hint: '',
    html: () => `<label>Fonds utilisé</label><select name="fund">${opts(byGroup('dist'))}</select>
      <label>Numéro du client (facultatif)</label><input name="client" inputmode="tel">
      <div class="two"><div><label>Valeur du crédit</label><input name="amount" type="number" min="1" required inputmode="numeric"></div>
      <div><label>Coût réel (débité du fonds)</label><input name="cost" type="number" min="0" required inputmode="numeric"></div></div>
      <label>Prix payé par le client</label><input name="price" type="number" min="0" required inputmode="numeric">
      <label>Le client a payé avec</label><select name="pay">${opts(PAY_FC)}</select><div class="hint" id="margin">Marge : 0 FC</div>`,
    build: v => saleBuild(v, 'Crédit ' + A[v.fund].name.replace('Fonds ', '')) },
  forfait: { title: '🌐 Vente de forfait', hint: '',
    html: () => `${S.products.length ? `<label>Produit enregistré</label><select name="prod" onchange="pickProduct(this.value)"><option value="">— Autre —</option>${S.products.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}</select>` : ''}
      <label>Nom du forfait</label><input name="name" required placeholder="Ex : 1 Go 24h">
      <label>Fonds utilisé</label><select name="fund">${opts(byGroup('dist'))}</select>
      <label>Numéro du client (facultatif)</label><input name="client" inputmode="tel">
      <div class="two"><div><label>Coût réel</label><input name="cost" type="number" min="0" required inputmode="numeric"></div>
      <div><label>Prix de vente</label><input name="price" type="number" min="0" required inputmode="numeric"></div></div>
      <label>Le client a payé avec</label><select name="pay">${opts(PAY_FC)}</select><div class="hint" id="margin">Marge : 0 FC</div>`,
    build: v => { v.amount = v.price; return saleBuild(v, 'Forfait ' + (v.name || ''), 'forfait'); } },
  depense: { title: '🧾 Dépense', hint: 'Une dépense réduit votre bénéfice net.',
    html: () => `<label>Catégorie</label><select name="cat">${['Transport', 'Restauration', 'Électricité', 'Internet', 'Loyer', 'Fournitures', 'Entretien', 'Autres'].map(c => `<option>${c}</option>`).join('')}</select>
      <label>Description (facultatif)</label><input name="desc"><label>Payée avec</label><select name="pay" onchange="$('#cur').textContent=A[this.value].cur">${opts(PAY_ALL)}</select>
      <label>Montant (<span id="cur">FC</span>)</label><input name="amount" type="number" min="1" required inputmode="numeric">`,
    build: v => { const a = num(v.amount); if (a <= 0) throw Error('Entrez un montant'); return { amount: a, label: v.cat + (v.desc ? ' · ' + v.desc : ''), moves: [{ a: v.pay, v: -a }] }; } },
};
function saleBuild(v, label, type) {
  const cost = num(v.cost), price = num(v.price);
  if (price <= 0) throw Error('Entrez le prix payé par le client');
  return { type, amount: num(v.amount) || price, price, cost, margin: price - cost, client: v.client, label: label + (v.client ? ' · ' + v.client : ''),
    moves: [{ a: v.fund, v: -cost }, { a: v.pay, v: price }] };   // marge = prix client − coût réel
}
function pickProduct(i) {
  const f = $('#opform'); if (i === '') return; const p = S.products[i];
  f.name.value = p.name; f.cost.value = p.cost; f.price.value = p.price; if (p.fund) f.fund.value = p.fund; updMargin();
}
function updMargin() { const f = $('#opform'), m = $('#margin'); if (m) m.textContent = 'Marge : ' + fmt(num(f.price.value) - num(f.cost.value)); }

function openOp(type) {
  const F = FORMS[type], id = uid();
  openModal(`<h2>${F.title}</h2>${F.hint ? `<div class="hint">${F.hint}</div>` : ''}
  <form id="opform" onsubmit="submitOp(event,'${type}','${id}')">${F.html()}
    <div class="two"><div><label>Date et heure</label><input name="date" type="datetime-local" value="${nowLocal()}"></div>
    <div><label>Agent</label><select name="agent">${S.agents.map(a => `<option>${esc(a)}</option>`).join('')}</select></div></div>
    <label>Référence (facultatif)</label><input name="ref">
    <label class="chk"><input type="checkbox" name="pending"> Mettre en attente (ne change pas les soldes)</label>
    <div id="ferr"></div>
    <div class="two" style="margin-top:16px"><button type="button" class="btn gray" onclick="closeModal()">Annuler</button><button class="btn green" id="subbtn">Enregistrer</button></div>
  </form>`);
  $('#opform').addEventListener('input', updMargin);
}
function submitOp(e, type, id) {
  e.preventDefault();
  const btn = $('#subbtn'); btn.disabled = true;
  const v = Object.fromEntries(new FormData(e.target));
  try {
    const t = FORMS[type].build(v);
    t.id = id; t.type = t.type || type; t.agent = v.agent; t.ref = v.ref;
    t.date = v.date ? new Date(v.date).toISOString() : new Date().toISOString();
    t.status = v.pending ? 'attente' : 'valide';
    addTx(t); closeModal(); toast(t.status === 'valide' ? 'Opération enregistrée ✅' : 'Mise en attente ⏳'); render();
  } catch (err) { btn.disabled = false; $('#ferr').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
}

/* ---------- Clôture ---------- */
function pageClose() {
  const rows = ACCOUNTS.map(a => `<tr><td>${a.logo ? `<img src="${a.logo}" width="22" style="vertical-align:middle;border-radius:5px"> ` : a.icon + ' '}${esc(a.name)}</td>
    <td class="n">${balance(a.id).toLocaleString('fr-FR')}</td><td><input name="r_${a.id}" type="number" inputmode="numeric" placeholder="compté" oninput="updEcart('${a.id}')" style="padding:8px;min-width:90px"></td>
    <td class="n" id="e_${a.id}">—</td></tr>`).join('');
  const hist = S.closures.slice().reverse().slice(0, 5).map(c => `<div class="tx"><div><b>${fdate(c.date)}</b><small>${esc(c.agent)}</small><small>${c.lines.filter(l => l.ecart).map(l => `${esc(A[l.a].name)} : ${l.ecart > 0 ? '+' : ''}${l.ecart.toLocaleString('fr-FR')}`).join(' · ') || 'Tout est conforme ✅'}</small></div></div>`).join('') || '<p class="sub">Aucune clôture.</p>';
  return `<h2>Clôture du jour</h2><p class="sub">Comptez votre argent et vos soldes réels, puis comparez avec l'application.</p>
  <form id="cf" class="card" onsubmit="saveClose(event)"><div style="overflow-x:auto"><table><tr><th>Compte</th><th class="n">Théorique</th><th>Réel</th><th class="n">Écart</th></tr>${rows}</table></div>
  <label class="chk"><input type="checkbox" name="adjust"> Corriger les soldes avec une écriture d'ajustement (si écart)</label>
  <label>Explication (facultatif)</label><input name="note" placeholder="Ex : erreur de monnaie">
  <button class="btn green" style="width:100%;margin-top:14px">Enregistrer la clôture</button></form>
  <h3>Dernières clôtures</h3><div class="card">${hist}</div>`;
}
function updEcart(id) {
  const v = $(`[name=r_${id}]`).value, el = $('#e_' + id);
  if (v === '') { el.textContent = '—'; el.className = 'n'; return; }
  const e = num(v) - balance(id);
  el.textContent = e === 0 ? '✅ OK' : (e > 0 ? 'Excédent +' : 'Manquant ') + e.toLocaleString('fr-FR');
  el.className = 'n ' + (e === 0 ? 'pos' : e > 0 ? 'warn' : 'neg');
}
function saveClose(e) {
  e.preventDefault(); const f = new FormData(e.target), lines = [];
  ACCOUNTS.forEach(a => { const r = f.get('r_' + a.id); if (r !== '') lines.push({ a: a.id, theo: balance(a.id), reel: num(r), ecart: num(r) - balance(a.id) }); });
  if (!lines.length) return alert('Entrez au moins un montant compté.');
  if (f.get('adjust')) lines.filter(l => l.ecart).forEach(l => addTx({ id: uid(), type: 'ajustement', status: 'valide', agent: currentAgent(), amount: Math.abs(l.ecart),
    label: 'Ajustement clôture ' + A[l.a].name + (f.get('note') ? ' · ' + f.get('note') : ''), moves: [{ a: l.a, v: l.ecart }] }));
  S.closures.push({ id: uid(), date: new Date().toISOString(), agent: currentAgent(), note: f.get('note'), lines }); save();
  toast('Clôture enregistrée ✅'); render();
}

/* ---------- Rapports ---------- */
function pageRep() {
  const st = stats(repPeriod), list = activeTx(repPeriod);
  const P = [['day', 'Aujourd\'hui'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année'], ['all', 'Tout']];
  const byType = {}; list.forEach(t => byType[t.type] = (byType[t.type] || 0) + 1);
  return `<h2>Rapports</h2><p class="sub">${esc(S.cabin)} — ${new Date().toLocaleDateString('fr-FR')}</p>
  <div class="tabs">${P.map(p => `<button class="${repPeriod === p[0] ? 'on' : ''}" onclick="repPeriod='${p[0]}';render()">${p[1]}</button>`).join('')}</div>
  <div class="card"><table>
   <tr><td>Commissions</td><td class="n">${fmt(st.commissions)}</td></tr><tr><td>Marges sur crédit et forfaits</td><td class="n">${fmt(st.marges)}</td></tr>
   <tr><td><b>Bénéfice brut</b></td><td class="n"><b>${fmt(st.brut)}</b></td></tr><tr><td>Dépenses</td><td class="n neg">− ${fmt(st.depenses)}</td></tr>
   <tr><td><b>Bénéfice net</b></td><td class="n"><b class="${st.net >= 0 ? 'pos' : 'neg'}">${fmt(st.net)}</b></td></tr></table></div>
  <h3>Volumes</h3><div class="card"><table><tr><td>Dépôts</td><td class="n">${fmt(st.depots)}</td></tr><tr><td>Retraits</td><td class="n">${fmt(st.retraits)}</td></tr>
   <tr><td>Ventes de crédit</td><td class="n">${fmt(st.credit)}</td></tr><tr><td>Ventes de forfaits</td><td class="n">${fmt(st.forfait)}</td></tr>
   <tr><td>Nombre d'opérations</td><td class="n">${st.count}</td></tr></table></div>
  <h3>Soldes actuels</h3><div class="card"><table>${ACCOUNTS.map(a => `<tr><td>${esc(a.name)}</td><td class="n">${fmt(balance(a.id), a.cur)}</td></tr>`).join('')}</table></div>
  <div class="row noprint" style="margin-top:16px"><button class="btn" onclick="window.print()">🖨️ Imprimer / PDF</button><button class="btn gray" onclick="exportCSV(activeTx(repPeriod))">📥 Excel</button></div>`;
}
function exportCSV(list) {
  const head = ['Date', 'Type', 'Détail', 'Montant', 'Commission', 'Coût réel', 'Marge', 'Agent', 'Référence', 'Statut', 'Mouvements'];
  const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const rows = list.map(t => [fdate(t.date), TYPE_LABEL[t.type], t.label, t.amount, t.commission || 0, t.cost || '', t.margin || '', t.agent, t.ref, t.cancelledBy ? 'annulée' : t.status,
    t.moves.map(m => A[m.a].name + ' ' + m.v).join(' | ')].map(q).join(';'));
  const blob = new Blob(['\ufeff' + head.join(';') + '\n' + rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mosolo.csv'; a.click();
}

/* ---------- Réglages ---------- */
function pageSet() {
  return `<h2>Réglages</h2><p class="sub">Tout reste simple.</p>
  <div class="card"><label>Nom de la cabine</label><input id="s_cabin" value="${esc(S.cabin)}">
   <label>Alerte quand un solde FC passe sous</label><input id="s_thr" type="number" value="${S.threshold}">
   <button class="btn" style="margin-top:12px" onclick="saveSettings()">Enregistrer</button></div>
  <h3>Agents</h3><div class="card">${S.agents.map((a, i) => `<div class="row" style="padding:6px 0"><span>👤 ${esc(a)}</span>${i ? `<button class="btn gray sm" onclick="delAgent(${i})">Retirer</button>` : '<small class="sub" style="margin:0">Propriétaire</small>'}</div>`).join('')}
   <div class="two" style="margin-top:8px"><input id="s_agent" placeholder="Nom du nouvel agent"><button class="btn" onclick="addAgent()">Ajouter</button></div></div>
  <h3>Mes forfaits (prix modifiables)</h3><div class="card">${S.products.map((p, i) => `<div class="row" style="padding:6px 0"><span>${esc(p.name)}<small class="sub" style="margin:0;display:block">Coût ${fmt(p.cost)} · Vente ${fmt(p.price)}</small></span><button class="btn gray sm" onclick="delProd(${i})">Retirer</button></div>`).join('') || '<p class="sub">Aucun forfait enregistré.</p>'}
   <label>Nom</label><input id="p_name"><label>Fonds</label><select id="p_fund">${byGroup('dist').map(a => `<option value="${a.id}">${a.name}</option>`).join('')}</select>
   <div class="two"><div><label>Coût réel</label><input id="p_cost" type="number"></div><div><label>Prix de vente</label><input id="p_price" type="number"></div></div>
   <button class="btn" style="margin-top:12px" onclick="addProd()">Ajouter le forfait</button></div>
  <h3>Mon compte</h3><div class="card"><p class="sub">Connecté : ${esc(window.USER_EMAIL || '')}</p><button class="btn gray" onclick="logout()">🚪 Se déconnecter</button></div>
  <h3>Sauvegarde</h3><div class="card"><p class="sub">Vos données sont enregistrées en ligne dans votre compte. Vous pouvez aussi garder une copie de sécurité.</p>
   <div class="two"><button class="btn green" onclick="backup()">💾 Sauvegarder</button><label class="btn gray" style="margin:0;text-align:center">📂 Restaurer<input type="file" accept=".json" hidden onchange="restore(this)"></label></div>
   <button class="btn red sm" style="margin-top:14px" onclick="resetAll()">Tout effacer</button></div>`;
}
function saveSettings() { S.cabin = $('#s_cabin').value.trim() || S.cabin; S.threshold = num($('#s_thr').value); save(); toast('Enregistré ✅'); render(); }
function addAgent() { const v = $('#s_agent').value.trim(); if (!v) return; S.agents.push(v); save(); render(); }
function delAgent(i) { S.agents.splice(i, 1); save(); render(); }
function addProd() { const n = $('#p_name').value.trim(); if (!n) return alert('Entrez un nom'); S.products.push({ name: n, fund: $('#p_fund').value, cost: num($('#p_cost').value), price: num($('#p_price').value) }); save(); render(); }
function delProd(i) { S.products.splice(i, 1); save(); render(); }
function backup() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })); a.download = 'sauvegarde-cabine-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); }
function restore(inp) { const r = new FileReader(); r.onload = () => { try { S = Object.assign(blank(), JSON.parse(r.result)); save(); toast('Données restaurées ✅'); go('home'); } catch (e) { alert('Fichier invalide'); } }; if (inp.files[0]) r.readAsText(inp.files[0]); }
function resetAll() { if (confirm('Effacer TOUTES les données ?') && confirm('Vraiment sûr ? Faites d\'abord une sauvegarde.')) { S = blank(); save(); render(); } }

boot();

/* ===== Mosolo+ - Interface (design moderne) ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, cur = 'FC') => Number(n || 0).toLocaleString('fr-FR') + ' ' + cur;
const fdate = d => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const byGroup = g => ACCOUNTS.filter(a => a.group === g);
const opts = (list, sel) => list.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)} — ${fmt(balance(a.id), a.cur)}</option>`).join('');
const PAY_FC = ACCOUNTS.filter(a => a.cur === 'FC' && a.group !== 'dist');
const PAY_ALL = ACCOUNTS.filter(a => a.group !== 'dist');
const num = v => Number(v) || 0;

let page = 'home', period = 'day', histFilter = { q: '', type: '', status: '' }, repPeriod = 'month';
const NAV = [['home', 'home', 'Accueil'], ['hist', 'list', 'Historique'], ['close', 'check', 'Clôture'], ['rep', 'chart', 'Rapports'], ['set', 'settings', 'Réglages']];
const GROUP_ICON = { cash: ['wallet', 't-green'], mm: ['phone', 't-orange'], dist: ['signal', 't-violet'] };
/* icône + couleur de chaque type d'opération */
const TV = { depot: ['down', 't-green'], retrait: ['up', 't-orange'], transfert: ['swap', 't-blue'], appro: ['refresh', 't-blue'], credit: ['phone', 't-violet'],
  forfait: ['globe', 't-teal'], depense: ['receipt', 't-red'], annulation: ['undo', 't-gray'], ajustement: ['sliders', 't-gray'] };
const acIcon = a => a.logo ? `<img src="${a.logo}" alt="">` : ic(a.icon, 22);

function toast(m) { const t = $('#toast'); t.innerHTML = ic('tick', 18) + '<span>' + esc(m) + '</span>'; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2600); }
function go(p) { page = p; render(); window.scrollTo(0, 0); }
function openModal(html) { const m = $('#modal'); m.innerHTML = '<div>' + html + '</div>'; m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); }; }
function closeModal() { $('#modal').classList.add('hidden'); }
const mhead = (title, hint) => `<div class="mhead"><h2>${title}</h2><button type="button" class="iconbtn" onclick="closeModal()" aria-label="Fermer">${ic('x', 18)}</button></div>${hint ? `<div class="hint" style="margin-top:4px">${hint}</div>` : ''}`;

/* ---------- Rendu général ---------- */
function render() {
  if (!S.setup) return renderSetup();
  const nav = NAV.map(n => `<a class="${page === n[0] ? 'on' : ''}" onclick="go('${n[0]}')">${ic(n[1], 21)}<em>${n[2]}</em></a>`).join('');
  const body = { home: pageHome, hist: pageHist, close: pageClose, rep: pageRep, set: pageSet }[page]();
  $('#app').innerHTML = `<div class="layout">
    <aside class="side"><div class="brand">${logoMark(40)}<div><b>Mosolo+</b><small>${esc(S.cabin)}</small></div></div><nav class="menu">${nav}</nav>
      <a class="logout" onclick="logout()">${ic('logout', 20)}<em>Déconnexion</em></a></aside>
    <main>${body}</main>
    <nav class="bottom">${nav}</nav>
  </div><button class="fab noprint" onclick="chooseOp()" aria-label="Nouvelle opération">${ic('plus', 28)}</button>`;
}

/* ---------- Configuration initiale ---------- */
function renderSetup() {
  const inputs = g => `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${byGroup(g).map(a => `<div><label>${a.name} (${a.cur})</label><input type="number" min="0" inputmode="numeric" name="${a.id}" placeholder="0"></div>`).join('')}</div>`;
  const sec = (g, t) => `<div class="section"><header><span class="avatar ${GROUP_ICON[g][1]}">${ic(GROUP_ICON[g][0], 18)}</span>${t}</header>${inputs(g)}</div>`;
  $('#app').innerHTML = `<div class="hero"><div class="card setup">
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:6px">${logoMark(48)}<div><h2 style="margin:0">Bienvenue sur Mosolo+</h2></div></div>
    <p class="sub">Notez ce que vous avez réellement aujourd'hui. L'application fera tous les calculs après chaque opération.</p>
    <form id="sf" onsubmit="finishSetup(event)">
      <div class="two"><div><label>Nom de la cabine</label><input name="cabin" required placeholder="Ex : Cabine Espoir"></div>
      <div><label>Votre nom</label><input name="owner" required placeholder="Ex : Jean" value="${esc(window.USER_NAME || '')}"></div></div>
      <div style="height:16px"></div>
      ${sec('cash', 'Argent liquide en caisse')}${sec('mm', 'Soldes Mobile Money')}${sec('dist', 'Fonds pour vendre crédit & forfaits')}
      <div class="hint">Ces montants sont vos soldes de départ, pas des bénéfices. Laissez vide si vous n'avez rien.</div>
      <button class="btn green block" style="margin-top:18px;padding:16px">Valider et commencer</button>
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
  return `<div class="card acc"><span class="avatar ${a.logo ? '' : GROUP_ICON[a.group][1]}">${acIcon(a)}</span>
    <div><small>${esc(a.name)}</small><b class="${low ? 'warn' : ''}">${fmt(b, a.cur)}</b></div></div>`;
}
const statCard = (icn, tint, label, val, cls = '') => `<div class="card stat"><span class="avatar ${tint}">${ic(icn, 20)}</span><div><small>${label}</small><b class="${cls}">${val}</b></div></div>`;
function pageHome() {
  const st = stats(period), pend = S.tx.filter(t => t.status === 'attente').length;
  const alerts = [];
  ACCOUNTS.forEach(a => { if (a.cur === 'FC' && balance(a.id) < S.threshold) alerts.push(['alert', `${esc(a.name)} est bas : ${fmt(balance(a.id))}`]); });
  if (pend) alerts.push(['clock', `${pend} opération(s) en attente de validation`, 'info']);
  const today = new Date().toDateString();
  if (!S.closures.some(c => new Date(c.date).toDateString() === today)) alerts.push(['bell', 'La clôture du jour n\'est pas encore faite', 'info']);
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d; });
  const vals = days.map(d => S.tx.filter(t => t.status === 'valide' && !t.cancelledBy && !['annulation', 'ajustement'].includes(t.type) && new Date(t.date).toDateString() === d.toDateString())
    .reduce((s, t) => s + (t.commission || 0) + (t.margin || 0), 0));
  const max = Math.max(...vals, 1);
  const last = S.tx.slice(-5).reverse().map(t => txRow(t)).join('') || '<p class="sub" style="margin:0">Aucune opération pour le moment. Appuyez sur le bouton vert +</p>';
  const P = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']];
  const q = (t, label, i) => `<button onclick="openOp('${t}')" class="${TV[t][1]}"><span class="avatar">${ic(i, 24)}</span>${label}</button>`;
  return `<h2>Bonjour ${esc(S.owner)}</h2><p class="sub">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
  ${alerts.map(a => `<div class="alert ${a[2] || ''}">${ic(a[0], 18)}<span>${a[1]}</span></div>`).join('')}
  <div class="hero-card"><div class="pills">${P.map(p => `<button class="${period === p[0] ? 'on' : ''}" onclick="period='${p[0]}';render()">${p[1]}</button>`).join('')}</div>
    <small>Bénéfice net</small><span class="big">${fmt(st.net)}</span>
    <div class="mini"><div><small>Commissions</small><b>${fmt(st.commissions)}</b></div><div><small>Marges</small><b>${fmt(st.marges)}</b></div><div><small>Dépenses</small><b>${fmt(st.depenses)}</b></div></div></div>
  <h3>Actions rapides</h3>
  <div class="quick">${q('credit', 'Vente crédit', 'phone')}${q('forfait', 'Vente forfait', 'globe')}${q('depot', 'Dépôt', 'down')}${q('retrait', 'Retrait', 'up')}${q('depense', 'Dépense', 'receipt')}
    <button onclick="chooseOp()" class="t-blue"><span class="avatar">${ic('plus', 24)}</span>Autres</button></div>
  <h3>Mes soldes</h3>
  ${['cash', 'mm', 'dist'].map(g => `<div class="section"><header><span class="avatar ${GROUP_ICON[g][1]}">${ic(GROUP_ICON[g][0], 18)}</span>${GROUPS[g]}</header><div class="grid">${byGroup(g).map(accCard).join('')}</div></div>`).join('')}
  <h3>Activité (${P.find(p => p[0] === period)[1].toLowerCase()})</h3>
  <div class="grid">
    ${statCard('list', 't-gray', 'Opérations', st.count)}${statCard('down', 't-green', 'Dépôts', fmt(st.depots))}${statCard('up', 't-orange', 'Retraits', fmt(st.retraits))}
    ${statCard('phone', 't-violet', 'Ventes crédit', fmt(st.credit))}${statCard('globe', 't-teal', 'Ventes forfaits', fmt(st.forfait))}${statCard('tag', 't-blue', 'Commissions', fmt(st.commissions))}
    ${statCard('receipt', 't-red', 'Dépenses', fmt(st.depenses), 'neg')}${statCard('trend', 't-green', 'Bénéfice brut', fmt(st.brut))}
  </div>
  <h3>Gains des 7 derniers jours</h3>
  <div class="card"><div class="bars">${vals.map((v, i) => `<div><span>${v ? v.toLocaleString('fr-FR') : ''}</span><i style="height:${Math.round(v / max * 90)}%"></i>${days[i].toLocaleDateString('fr-FR', { weekday: 'short' })}</div>`).join('')}</div></div>
  <h3>Dernières opérations</h3><div class="card">${last}</div>`;
}

/* ---------- Ligne d'opération ---------- */
function txRow(t, actions) {
  const v = TV[t.type] || TV.ajustement;
  const sign = t.moves.map(m => `${esc(A[m.a].name)} ${m.v > 0 ? '+' : '−'}${Math.abs(m.v).toLocaleString('fr-FR')}`).join(' · ');
  const cancelled = !!t.cancelledBy;
  const st = cancelled ? '<span class="badge annule">Annulée</span>' : t.status === 'attente' ? '<span class="badge attente">En attente</span>' : '';
  const gain = (t.commission || 0) + (t.margin || 0);
  let act = '';
  if (actions) {
    if (t.status === 'attente') act += `<button class="btn green sm" onclick="doValidate('${t.id}')">${ic('tick', 15)}Valider</button> `;
    if (t.status === 'valide' && !cancelled && !['annulation', 'ajustement'].includes(t.type)) act += `<button class="btn gray sm" onclick="doCancel('${t.id}')">${ic('undo', 15)}Annuler</button>`;
  }
  return `<div class="tx"><span class="avatar ${v[1]}">${ic(v[0], 20)}</span><div class="mid"><b>${TYPE_LABEL[t.type]}</b>${st}<small>${esc(t.label || '')}</small><small>${sign}</small>
    <small>${fdate(t.date)} · ${esc(t.agent || '')}${t.ref ? ' · Réf ' + esc(t.ref) : ''}${gain ? ' · Gain ' + fmt(gain) : ''}</small>${act ? '<div style="margin-top:8px;display:flex;gap:8px">' + act + '</div>' : ''}</div>
    <div class="r"><b style="${cancelled ? 'text-decoration:line-through;opacity:.5' : ''}">${t.amount ? t.amount.toLocaleString('fr-FR') : ''}</b></div></div>`;
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
  <div class="filters noprint"><div class="search">${ic('search', 18)}<input placeholder="Rechercher (client, référence, agent…)" value="${esc(histFilter.q)}" oninput="histFilter.q=this.value;renderHistList()"></div>
  <select onchange="histFilter.type=this.value;renderHistList()"><option value="">Tous les types</option>${Object.keys(TYPE_LABEL).map(k => `<option value="${k}" ${histFilter.type === k ? 'selected' : ''}>${TYPE_LABEL[k]}</option>`).join('')}</select>
  <select onchange="histFilter.status=this.value;renderHistList()"><option value="">Tous statuts</option><option value="valide" ${histFilter.status === 'valide' ? 'selected' : ''}>Validées</option><option value="attente" ${histFilter.status === 'attente' ? 'selected' : ''}>En attente</option><option value="annulee" ${histFilter.status === 'annulee' ? 'selected' : ''}>Annulées</option></select></div>
  <div class="row noprint" style="margin-bottom:12px"><span class="sub" style="margin:0" id="hcount">${list.length} opération(s)</span><span style="display:flex;gap:8px"><button class="btn gray sm" onclick="exportCSV(filtered())">${ic('download', 15)}Excel</button><button class="btn gray sm" onclick="window.print()">${ic('printer', 15)}Imprimer</button></span></div>
  <div class="card" id="hlist">${list.map(t => txRow(t, true)).join('') || '<p class="sub" style="margin:0">Aucune opération.</p>'}</div>`;
}
function renderHistList() { const l = filtered(); $('#hlist').innerHTML = l.map(t => txRow(t, true)).join('') || '<p class="sub" style="margin:0">Aucune opération.</p>'; $('#hcount').textContent = l.length + ' opération(s)'; }
function doValidate(id) { try { validateTx(id); toast('Opération validée'); render(); } catch (e) { alert(e.message); } }
function doCancel(id) {
  const r = prompt('Pourquoi annuler cette opération ?'); if (r === null) return;
  try { cancelTx(id, r, currentAgent()); toast('Annulée : soldes rétablis'); render(); } catch (e) { alert(e.message); }
}
function currentAgent() { return S.agents[0] || S.owner; }

/* ---------- Choix & formulaires d'opération ---------- */
function chooseOp() {
  const b = (t, label, i) => `<button onclick="openOp('${t}')" class="${TV[t][1]}"><span class="avatar">${ic(i, 24)}</span>${label}</button>`;
  openModal(`${mhead('Nouvelle opération')}<p class="sub">Que voulez-vous enregistrer ?</p><div class="quick">
  ${b('depot', 'Dépôt client', 'down')}${b('retrait', 'Retrait client', 'up')}${b('credit', 'Vente crédit', 'phone')}${b('forfait', 'Vente forfait', 'globe')}
  ${b('appro', 'Approvisionner', 'refresh')}${b('transfert', 'Transfert', 'swap')}${b('depense', 'Dépense', 'receipt')}</div>`);
}
/* Forfait : quantité + bascule Go / Mo / Autre */
const unitSeg = (u = 'Go') => `<div class="seg" role="group">${['Go', 'Mo', 'Autre'].map(x => `<button type="button" class="${u === x ? 'on' : ''}" onclick="pickUnit(this)" data-u="${x}">${x}</button>`).join('')}</div>`;
const unitRow = () => `<div class="unitrow"><input class="qty" name="qty" inputmode="decimal" autocomplete="off" placeholder="Quantité, ex : 1" required>${unitSeg('Go')}<input type="hidden" name="unit" value="Go"></div>`;
function pickUnit(b) {
  const r = b.closest('.unitrow'); r.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
  r.querySelector('input[type=hidden]').value = b.dataset.u; const q = r.querySelector('input.qty');
  q.placeholder = b.dataset.u === 'Autre' ? 'Nom du forfait, ex : Illimité nuit' : 'Quantité, ex : 1'; q.inputMode = b.dataset.u === 'Autre' ? 'text' : 'decimal'; q.focus();
}
const pkgName = (qty, unit, validity) => { qty = String(qty || '').trim(); return (unit === 'Autre' ? qty : qty + ' ' + unit) + (validity ? ' · ' + String(validity).trim() : ''); };
/* Option "calculer ma marge" : le coût réel est facultatif (sans coût, marge = 0) */
const costBox = `<details class="adv" id="adv"><summary>${ic('trend', 17)}Calculer ma marge (facultatif)</summary><div><label>Coût réel pour vous (débité de votre fonds)</label>
  <input name="cost" type="number" min="0" inputmode="numeric" placeholder="Laissez vide si identique au prix de vente"><div class="hint" id="margin"></div></div></details>`;

const FORMS = {
  depot: { title: 'Dépôt client', hint: 'Le client vous donne du cash : la caisse augmente, le compte Mobile Money diminue.',
    html: () => `<label>Compte Mobile Money utilisé</label><select name="acc">${opts(byGroup('mm'))}</select>
      <label>Montant du dépôt (FC)</label><input class="amount" name="amount" type="number" min="1" required inputmode="numeric" placeholder="0">
      <label>Numéro du client (facultatif)</label><input name="client" inputmode="tel">
      <label>Votre commission (FC, facultatif)</label><input name="commission" type="number" min="0" inputmode="numeric">`,
    build: v => { const a = num(v.amount); if (a <= 0) throw Error('Entrez un montant'); return { amount: a, commission: num(v.commission), client: v.client, label: 'Dépôt ' + A[v.acc].name + (v.client ? ' · ' + v.client : ''), moves: [{ a: 'caisse_fc', v: a }, { a: v.acc, v: -a }] }; } },
  retrait: { title: 'Retrait client', hint: 'Le client reçoit du cash : la caisse diminue, le compte Mobile Money augmente.',
    html: () => FORMS.depot.html().replace('du dépôt', 'du retrait'),
    build: v => { const a = num(v.amount); if (a <= 0) throw Error('Entrez un montant'); return { amount: a, commission: num(v.commission), client: v.client, label: 'Retrait ' + A[v.acc].name + (v.client ? ' · ' + v.client : ''), moves: [{ a: 'caisse_fc', v: -a }, { a: v.acc, v: a }] }; } },
  transfert: { title: 'Transfert entre comptes', hint: 'Déplace de l\'argent entre vos comptes. Ce n\'est pas un bénéfice.',
    html: () => `<label>De</label><select name="from">${opts(PAY_FC, 'orange')}</select><label>Vers</label><select name="to">${opts(PAY_FC, 'mpesa')}</select>
      <label>Montant (FC)</label><input class="amount" name="amount" type="number" min="1" required inputmode="numeric" placeholder="0">`,
    build: v => { const a = num(v.amount); if (a <= 0) throw Error('Entrez un montant'); if (v.from === v.to) throw Error('Choisissez deux comptes différents'); return { amount: a, label: A[v.from].name + ' → ' + A[v.to].name, moves: [{ a: v.from, v: -a }, { a: v.to, v: a }] }; } },
  appro: { title: 'Approvisionner un fonds', hint: 'Vous payez pour recharger votre fonds de distribution. Ce n\'est pas un bénéfice.',
    html: () => `<label>Fonds à recharger</label><select name="fund">${opts(byGroup('dist'))}</select><label>Payé depuis</label><select name="src">${opts(PAY_FC)}</select>
      <label>Montant (FC)</label><input class="amount" name="amount" type="number" min="1" required inputmode="numeric" placeholder="0">`,
    build: v => { const a = num(v.amount); if (a <= 0) throw Error('Entrez un montant'); return { amount: a, label: 'Approvisionnement ' + A[v.fund].name + ' depuis ' + A[v.src].name, moves: [{ a: v.src, v: -a }, { a: v.fund, v: a }] }; } },
  credit: { title: 'Vente de crédit', hint: '',
    html: () => `<label>Fonds utilisé</label><select name="fund">${opts(byGroup('dist'))}</select>
      <label>Prix de vente (FC)</label><input class="amount" name="price" type="number" min="1" required inputmode="numeric" placeholder="0">
      <label>Numéro du client (facultatif)</label><input name="client" inputmode="tel">
      <label>Le client a payé avec</label><select name="pay">${opts(PAY_FC)}</select>${costBox}`,
    build: v => saleBuild(v, 'Crédit ' + A[v.fund].name.replace('Fonds ', '')) },
  forfait: { title: 'Vente de forfait', hint: '',
    html: () => `${S.products.length ? `<label>Forfait enregistré</label><select name="prod" onchange="pickProduct(this.value)"><option value="">— Autre —</option>${S.products.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}</select>` : ''}
      <label>Forfait vendu</label>${unitRow()}
      <label>Validité (facultatif)</label><input name="validity" placeholder="Ex : 24h, 7 jours, 30 jours">
      <label>Fonds utilisé</label><select name="fund">${opts(byGroup('dist'))}</select>
      <label>Prix de vente (FC)</label><input class="amount" name="price" type="number" min="1" required inputmode="numeric" placeholder="0">
      <label>Numéro du client (facultatif)</label><input name="client" inputmode="tel">
      <label>Le client a payé avec</label><select name="pay">${opts(PAY_FC)}</select>${costBox}`,
    build: v => saleBuild(v, 'Forfait ' + pkgName(v.qty, v.unit, v.validity), 'forfait') },
  depense: { title: 'Dépense', hint: 'Une dépense réduit votre bénéfice net.',
    html: () => `<label>Catégorie</label><select name="cat">${['Transport', 'Restauration', 'Électricité', 'Internet', 'Loyer', 'Fournitures', 'Entretien', 'Autres'].map(c => `<option>${c}</option>`).join('')}</select>
      <label>Description (facultatif)</label><input name="desc"><label>Payée avec</label><select name="pay" onchange="$('#cur').textContent=A[this.value].cur">${opts(PAY_ALL)}</select>
      <label>Montant (<span id="cur">FC</span>)</label><input class="amount" name="amount" type="number" min="1" required inputmode="numeric" placeholder="0">`,
    build: v => { const a = num(v.amount); if (a <= 0) throw Error('Entrez un montant'); return { amount: a, label: v.cat + (v.desc ? ' · ' + v.desc : ''), moves: [{ a: v.pay, v: -a }] }; } },
};
/* Vente : seul le prix de vente est obligatoire. Marge = prix client − coût réel (coût = prix si non renseigné). */
function saleBuild(v, label, type) {
  const price = num(v.price); if (price <= 0) throw Error('Entrez le prix de vente');
  const hasCost = String(v.cost ?? '').trim() !== ''; const cost = hasCost ? num(v.cost) : price;
  return { type, amount: price, price, cost, margin: price - cost, client: v.client, label: label + (v.client ? ' · ' + v.client : ''),
    moves: [{ a: v.fund, v: -cost }, { a: v.pay, v: price }] };
}
function pickProduct(i) {
  const f = $('#opform'); if (i === '') return; const p = S.products[i]; const u = p.unit || 'Autre';
  f.qty.value = p.unit ? p.qty : p.name; f.unit.value = u;
  document.querySelectorAll('#opform .unitrow .seg button').forEach(x => x.classList.toggle('on', x.dataset.u === u));
  if (f.validity) f.validity.value = p.validity || '';
  f.cost.value = p.cost || ''; f.price.value = p.price; if (p.fund) f.fund.value = p.fund; if (p.cost) $('#adv').open = true; updMargin();
}
function updMargin() {
  const f = $('#opform'), m = $('#margin'); if (!m || !f.price) return; const c = String(f.cost.value ?? '').trim();
  m.textContent = c === '' ? 'Sans coût réel : marge = 0 (le fonds est débité du prix de vente).' : 'Marge : ' + fmt(num(f.price.value) - num(c));
}

function openOp(type) {
  const F = FORMS[type], id = uid();
  openModal(`${mhead(F.title, F.hint)}
  <form id="opform" onsubmit="submitOp(event,'${type}','${id}')">${F.html()}
    <details class="adv"><summary>${ic('settings', 17)}Plus d'options</summary><div>
      <div class="two"><div><label>Date et heure</label><input name="date" type="datetime-local" value="${nowLocal()}"></div>
      <div><label>Agent</label><select name="agent">${S.agents.map(a => `<option>${esc(a)}</option>`).join('')}</select></div></div>
      <label>Référence</label><input name="ref">
      <label class="chk"><input type="checkbox" name="pending"> Mettre en attente (ne change pas les soldes)</label></div></details>
    <div id="ferr"></div>
    <div class="two" style="margin-top:18px"><button type="button" class="btn gray" onclick="closeModal()">Annuler</button><button class="btn green" id="subbtn">${ic('tick', 18)}Enregistrer</button></div>
  </form>`);
  $('#opform').addEventListener('input', updMargin); updMargin();
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
    addTx(t); closeModal(); toast(t.status === 'valide' ? 'Opération enregistrée' : 'Mise en attente'); render();
  } catch (err) { btn.disabled = false; $('#ferr').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
}

/* ---------- Clôture ---------- */
function pageClose() {
  const rows = ACCOUNTS.map(a => `<tr><td><div style="display:flex;gap:10px;align-items:center"><span class="avatar ${a.logo ? '' : GROUP_ICON[a.group][1]}" style="width:32px;height:32px;border-radius:10px">${a.logo ? `<img src="${a.logo}" alt="">` : ic(a.icon, 16)}</span>${esc(a.name)}</div></td>
    <td class="n">${balance(a.id).toLocaleString('fr-FR')}</td><td><input name="r_${a.id}" type="number" inputmode="numeric" placeholder="compté" oninput="updEcart('${a.id}')" style="padding:9px;min-width:100px"></td>
    <td class="n" id="e_${a.id}">—</td></tr>`).join('');
  const hist = S.closures.slice().reverse().slice(0, 5).map(c => `<div class="tx"><span class="avatar t-green">${ic('check', 20)}</span><div class="mid"><b>${fdate(c.date)}</b><small>${esc(c.agent)}</small><small>${c.lines.filter(l => l.ecart).map(l => `${esc(A[l.a].name)} : ${l.ecart > 0 ? '+' : ''}${l.ecart.toLocaleString('fr-FR')}`).join(' · ') || 'Tout est conforme'}</small></div></div>`).join('') || '<p class="sub" style="margin:0">Aucune clôture.</p>';
  return `<h2>Clôture du jour</h2><p class="sub">Comptez votre argent et vos soldes réels, puis comparez avec l'application.</p>
  <form id="cf" class="card" onsubmit="saveClose(event)"><div style="overflow-x:auto"><table><tr><th>Compte</th><th class="n">Théorique</th><th>Réel</th><th class="n">Écart</th></tr>${rows}</table></div>
  <label class="chk"><input type="checkbox" name="adjust"> Corriger les soldes avec une écriture d'ajustement (si écart)</label>
  <label>Explication (facultatif)</label><input name="note" placeholder="Ex : erreur de monnaie">
  <button class="btn green block" style="margin-top:16px">${ic('tick', 18)}Enregistrer la clôture</button></form>
  <h3>Dernières clôtures</h3><div class="card">${hist}</div>`;
}
function updEcart(id) {
  const v = $(`[name=r_${id}]`).value, el = $('#e_' + id);
  if (v === '') { el.textContent = '—'; el.className = 'n'; return; }
  const e = num(v) - balance(id);
  el.textContent = e === 0 ? 'Conforme' : (e > 0 ? 'Excédent +' : 'Manquant ') + e.toLocaleString('fr-FR');
  el.className = 'n ' + (e === 0 ? 'pos' : e > 0 ? 'warn' : 'neg');
}
function saveClose(e) {
  e.preventDefault(); const f = new FormData(e.target), lines = [];
  ACCOUNTS.forEach(a => { const r = f.get('r_' + a.id); if (r !== '') lines.push({ a: a.id, theo: balance(a.id), reel: num(r), ecart: num(r) - balance(a.id) }); });
  if (!lines.length) return alert('Entrez au moins un montant compté.');
  if (f.get('adjust')) lines.filter(l => l.ecart).forEach(l => addTx({ id: uid(), type: 'ajustement', status: 'valide', agent: currentAgent(), amount: Math.abs(l.ecart),
    label: 'Ajustement clôture ' + A[l.a].name + (f.get('note') ? ' · ' + f.get('note') : ''), moves: [{ a: l.a, v: l.ecart }] }));
  S.closures.push({ id: uid(), date: new Date().toISOString(), agent: currentAgent(), note: f.get('note'), lines }); save();
  toast('Clôture enregistrée'); render();
}

/* ---------- Rapports ---------- */
function pageRep() {
  const st = stats(repPeriod), list = activeTx(repPeriod);
  const P = [['day', 'Aujourd\'hui'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année'], ['all', 'Tout']];
  return `<h2>Rapports</h2><p class="sub">${esc(S.cabin)} — ${new Date().toLocaleDateString('fr-FR')}</p>
  <div class="tabs">${P.map(p => `<button class="${repPeriod === p[0] ? 'on' : ''}" onclick="repPeriod='${p[0]}';render()">${p[1]}</button>`).join('')}</div>
  <div class="hero-card"><small>Bénéfice net</small><span class="big">${fmt(st.net)}</span><div class="mini"><div><small>Commissions</small><b>${fmt(st.commissions)}</b></div><div><small>Marges</small><b>${fmt(st.marges)}</b></div><div><small>Dépenses</small><b>${fmt(st.depenses)}</b></div></div></div>
  <h3>Résultat</h3><div class="card"><table>
   <tr><td>Commissions</td><td class="n">${fmt(st.commissions)}</td></tr><tr><td>Marges sur crédit et forfaits</td><td class="n">${fmt(st.marges)}</td></tr>
   <tr><td><b>Bénéfice brut</b></td><td class="n"><b>${fmt(st.brut)}</b></td></tr><tr><td>Dépenses</td><td class="n neg">− ${fmt(st.depenses)}</td></tr>
   <tr><td><b>Bénéfice net</b></td><td class="n"><b class="${st.net >= 0 ? 'pos' : 'neg'}">${fmt(st.net)}</b></td></tr></table></div>
  <h3>Volumes</h3><div class="card"><table><tr><td>Dépôts</td><td class="n">${fmt(st.depots)}</td></tr><tr><td>Retraits</td><td class="n">${fmt(st.retraits)}</td></tr>
   <tr><td>Ventes de crédit</td><td class="n">${fmt(st.credit)}</td></tr><tr><td>Ventes de forfaits</td><td class="n">${fmt(st.forfait)}</td></tr>
   <tr><td>Nombre d'opérations</td><td class="n">${st.count}</td></tr></table></div>
  <h3>Soldes actuels</h3><div class="card"><table>${ACCOUNTS.map(a => `<tr><td>${esc(a.name)}</td><td class="n">${fmt(balance(a.id), a.cur)}</td></tr>`).join('')}</table></div>
  <div class="row noprint" style="margin-top:18px;justify-content:flex-start"><button class="btn" onclick="window.print()">${ic('printer', 18)}Imprimer / PDF</button><button class="btn gray" onclick="exportCSV(activeTx(repPeriod))">${ic('download', 18)}Excel</button></div>`;
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
  <div class="card"><label style="margin-top:0">Nom de la cabine</label><input id="s_cabin" value="${esc(S.cabin)}">
   <label>Alerte quand un solde FC passe sous</label><input id="s_thr" type="number" value="${S.threshold}">
   <button class="btn" style="margin-top:14px" onclick="saveSettings()">${ic('save', 18)}Enregistrer</button></div>
  <h3>Agents</h3><div class="card">${S.agents.map((a, i) => `<div class="row" style="padding:8px 0"><span style="display:flex;gap:10px;align-items:center"><span class="avatar t-gray" style="width:36px;height:36px;border-radius:11px">${ic('user', 18)}</span>${esc(a)}</span>${i ? `<button class="btn gray sm" onclick="delAgent(${i})">${ic('trash', 15)}Retirer</button>` : '<small class="sub" style="margin:0">Propriétaire</small>'}</div>`).join('')}
   <div class="two" style="margin-top:10px"><input id="s_agent" placeholder="Nom du nouvel agent"><button class="btn" onclick="addAgent()">${ic('plus', 18)}Ajouter</button></div></div>
  <h3>Mes forfaits (prix modifiables)</h3><div class="card">${S.products.map((p, i) => `<div class="row" style="padding:8px 0"><span style="display:flex;gap:10px;align-items:center"><span class="avatar t-teal" style="width:36px;height:36px;border-radius:11px">${ic('globe', 18)}</span><span>${esc(p.name)}<small class="sub" style="margin:0;display:block">Vente ${fmt(p.price)}${p.cost ? ' · Coût ' + fmt(p.cost) : ''}</small></span></span><button class="btn gray sm" onclick="delProd(${i})">${ic('trash', 15)}Retirer</button></div>`).join('') || '<p class="sub" style="margin:0">Aucun forfait enregistré.</p>'}
   <div id="prodbox" style="margin-top:8px"><label>Forfait</label><div class="unitrow"><input class="qty" inputmode="decimal" autocomplete="off" placeholder="Quantité, ex : 1">${unitSeg('Go')}<input type="hidden" value="Go"></div>
   <label>Validité (facultatif)</label><input id="p_valid" placeholder="Ex : 24h, 7 jours">
   <label>Fonds</label><select id="p_fund">${byGroup('dist').map(a => `<option value="${a.id}">${a.name}</option>`).join('')}</select>
   <div class="two"><div><label>Prix de vente (FC)</label><input id="p_price" type="number" inputmode="numeric"></div><div><label>Coût réel (facultatif)</label><input id="p_cost" type="number" inputmode="numeric"></div></div>
   <button class="btn" style="margin-top:14px" onclick="addProd()">${ic('plus', 18)}Ajouter le forfait</button></div></div>
  <h3>Mon compte</h3><div class="card"><p class="sub">Connecté : ${esc(window.USER_EMAIL || '')}</p><button class="btn gray" onclick="logout()">${ic('logout', 18)}Se déconnecter</button></div>
  <h3>Sauvegarde</h3><div class="card"><p class="sub">Vos données sont enregistrées en ligne dans votre compte. Vous pouvez aussi garder une copie de sécurité.</p>
   <div class="two"><button class="btn green" onclick="backup()">${ic('download', 18)}Sauvegarder</button><label class="btn gray" style="margin:0;cursor:pointer">${ic('upload', 18)}Restaurer<input type="file" accept=".json" hidden onchange="restore(this)"></label></div>
   <button class="btn red sm" style="margin-top:16px" onclick="resetAll()">${ic('trash', 15)}Tout effacer</button></div>`;
}
function saveSettings() { S.cabin = $('#s_cabin').value.trim() || S.cabin; S.threshold = num($('#s_thr').value); save(); toast('Enregistré'); render(); }
function addAgent() { const v = $('#s_agent').value.trim(); if (!v) return; S.agents.push(v); save(); render(); }
function delAgent(i) { S.agents.splice(i, 1); save(); render(); }
function addProd() {
  const box = $('#prodbox'), qty = box.querySelector('input.qty').value.trim(), unit = box.querySelector('input[type=hidden]').value;
  if (!qty) return alert('Entrez la quantité ou le nom du forfait'); const price = num($('#p_price').value); if (price <= 0) return alert('Entrez le prix de vente');
  const validity = $('#p_valid').value.trim();
  S.products.push({ name: pkgName(qty, unit, validity), qty, unit, validity, fund: $('#p_fund').value, cost: num($('#p_cost').value), price }); save(); render();
}
function delProd(i) { S.products.splice(i, 1); save(); render(); }
function backup() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })); a.download = 'sauvegarde-cabine-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); }
function restore(inp) { const r = new FileReader(); r.onload = () => { try { S = Object.assign(blank(), JSON.parse(r.result)); save(); toast('Données restaurées'); go('home'); } catch (e) { alert('Fichier invalide'); } }; if (inp.files[0]) r.readAsText(inp.files[0]); }
function resetAll() { if (confirm('Effacer TOUTES les données ?') && confirm('Vraiment sûr ? Faites d\'abord une sauvegarde.')) { S = blank(); save(); render(); } }

boot();
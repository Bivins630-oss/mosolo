/* ===== Mosolo - Moteur comptable (aucun affichage ici) =====
   Règle : Solde = Solde d'ouverture + mouvements des opérations VALIDÉES.
   Une opération en attente ne change aucun solde.
   Une annulation crée des mouvements inverses (l'historique reste). */
const DB_KEY = 'cabine_gestion_v1';

const ACCOUNTS = [
  { id: 'caisse_fc',  group: 'cash', name: 'Caisse FC',  cur: 'FC',  icon: '💵' },
  { id: 'caisse_usd', group: 'cash', name: 'Caisse USD', cur: 'USD', icon: '💲' },
  { id: 'orange',     group: 'mm', name: 'Orange Money', cur: 'FC', logo: 'assets/orange.jpg' },
  { id: 'airtel',     group: 'mm', name: 'Airtel Money', cur: 'FC', logo: 'assets/airtel.jpg' },
  { id: 'mpesa',      group: 'mm', name: 'M-Pesa',       cur: 'FC', logo: 'assets/mpesa.jpg' },
  { id: 'afrimoney',  group: 'mm', name: 'Afrimoney',    cur: 'FC', logo: 'assets/afrimoney.png' },
  { id: 'd_orange',   group: 'dist', name: 'Fonds Orange',   cur: 'FC', icon: '📶' },
  { id: 'd_airtel',   group: 'dist', name: 'Fonds Airtel',   cur: 'FC', icon: '📶' },
  { id: 'd_vodacom',  group: 'dist', name: 'Fonds Vodacom',  cur: 'FC', icon: '📶' },
  { id: 'd_africell', group: 'dist', name: 'Fonds Africell', cur: 'FC', icon: '📶' },
];
const A = Object.fromEntries(ACCOUNTS.map(a => [a.id, a]));
const GROUPS = { cash: 'Caisse (argent liquide)', mm: 'Comptes Mobile Money', dist: 'Fonds de distribution (crédit & forfaits)' };
const TYPE_LABEL = { depot: 'Dépôt', retrait: 'Retrait', transfert: 'Transfert', appro: 'Approvisionnement',
  credit: 'Vente crédit', forfait: 'Vente forfait', depense: 'Dépense', annulation: 'Annulation', ajustement: 'Ajustement' };

function blank() {
  return { setup: false, cabin: '', owner: '', agents: [], opening: {}, openedAt: null,
           tx: [], closures: [], products: [], threshold: 20000 };
}
let S = blank();
/* Les données sont enregistrées dans Supabase (voir js/cloud.js), séparées par compte utilisateur */
function save() { if (typeof cloudSave === 'function') cloudSave(); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* Solde actuel d'un compte */
function balance(id) {
  let b = Number(S.opening[id] || 0);
  for (const t of S.tx) {
    if (t.status !== 'valide') continue;
    for (const m of t.moves) if (m.a === id) b += m.v;
  }
  return b;
}

/* Vérifie qu'aucun compte ne passe sous zéro */
function checkFunds(moves) {
  const delta = {};
  moves.forEach(m => delta[m.a] = (delta[m.a] || 0) + m.v);
  for (const id in delta) {
    if (delta[id] < 0 && balance(id) + delta[id] < 0)
      throw new Error('Solde insuffisant dans : ' + A[id].name + ' (disponible ' + balance(id).toLocaleString('fr-FR') + ')');
  }
}

/* Enregistre une opération. L'id unique évite les doubles validations (double clic). */
function addTx(t) {
  if (S.tx.some(x => x.id === t.id)) return null;
  t.date = t.date || new Date().toISOString();
  t.moves = t.moves || [];
  if (t.status === 'valide') checkFunds(t.moves);
  S.tx.push(t); save(); return t;
}

function validateTx(id) {
  const t = S.tx.find(x => x.id === id);
  if (!t || t.status !== 'attente') return;
  checkFunds(t.moves);
  t.status = 'valide'; save();
}

/* Annulation = nouvelle opération avec mouvements inverses */
function cancelTx(id, reason, agent) {
  const t = S.tx.find(x => x.id === id);
  if (!t || t.status !== 'valide' || t.cancelledBy || ['annulation', 'ajustement'].includes(t.type)) throw new Error('Opération non annulable');
  const c = { id: uid(), type: 'annulation', status: 'valide', date: new Date().toISOString(), agent,
    label: 'Annulation : ' + (reason || ''), cancelOf: id, amount: t.amount,
    moves: t.moves.map(m => ({ a: m.a, v: -m.v })) };
  t.cancelledBy = c.id; S.tx.push(c); save();
}

function periodStart(p) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (p === 'month') d.setDate(1);
  if (p === 'year') { d.setMonth(0); d.setDate(1); }
  if (p === 'all') return new Date(0);
  return d;
}

/* Opérations comptant dans les statistiques (valides, non annulées) */
function activeTx(p) {
  const s = periodStart(p);
  return S.tx.filter(t => t.status === 'valide' && !t.cancelledBy && !['annulation', 'ajustement'].includes(t.type) && new Date(t.date) >= s);
}

/* Bénéfice brut = commissions + marges ; net = brut - dépenses.
   Dépôts, retraits, transferts, approvisionnements ne sont JAMAIS des bénéfices. */
function stats(p) {
  const r = { count: 0, depots: 0, retraits: 0, credit: 0, forfait: 0, commissions: 0, marges: 0, depenses: 0 };
  for (const t of activeTx(p)) {
    r.count++;
    if (t.type === 'depot') r.depots += t.amount;
    if (t.type === 'retrait') r.retraits += t.amount;
    if (t.type === 'credit') r.credit += t.price || 0;
    if (t.type === 'forfait') r.forfait += t.price || 0;
    r.commissions += t.commission || 0;
    r.marges += t.margin || 0;
    if (t.type === 'depense') r.depenses += t.amount;
  }
  r.brut = r.commissions + r.marges;
  r.net = r.brut - r.depenses;
  return r;
}

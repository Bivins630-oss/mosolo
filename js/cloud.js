/* ===== Mosolo - Comptes (Supabase Auth) et enregistrement en ligne ===== */
let sb = null, user = null, saveTimer = null, dirty = false, recovery = false;

const okConfig = () => window.supabase && SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;
const tr = m => ({ 'Invalid login credentials': 'E-mail ou mot de passe incorrect.', 'User already registered': 'Cet e-mail a déjà un compte. Connectez-vous.',
  'Email not confirmed': 'Confirmez d\'abord votre e-mail (regardez votre boîte de réception).', 'Password should be at least 6 characters.': 'Mot de passe trop court.' }[m] || m);

/* --- Enregistrement des données de l'utilisateur connecté --- */
function cloudSave() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); }
async function flush() {
  if (!user || !dirty) return; dirty = false;
  const { error } = await sb.from('cabines').upsert({ user_id: user.id, data: S, updated_at: new Date().toISOString() });
  if (error) { dirty = true; toast('⚠️ Enregistrement en ligne impossible : ' + error.message); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('pagehide', flush);

async function loadData() {
  const { data, error } = await sb.from('cabines').select('data').eq('user_id', user.id).maybeSingle();
  if (error) { alert('Impossible de charger vos données : ' + error.message); return; }
  S = Object.assign(blank(), (data && data.data) || {});
}

/* --- Écrans de connexion --- */
function authShell(inner) {
  $('#app').innerHTML = `<div class="hero"><div class="card"><h2>📒 Mosolo</h2>
  <p class="sub">Gérez votre cabine facilement : caisse, Mobile Money, crédits, forfaits et bénéfices.</p>
  <div class="logos"><img src="assets/orange.jpg"><img src="assets/airtel.jpg"><img src="assets/mpesa.jpg"><img src="assets/afrimoney.png"></div>${inner}</div></div>`;
}
function renderAuth(mode = 'login', msg = '') {
  const m = msg ? `<div class="${msg.startsWith('✅') ? 'hint' : 'err'}">${esc(msg)}</div>` : '';
  if (mode === 'login') return authShell(`<form onsubmit="doLogin(event)"><label>Adresse e-mail</label><input name="email" type="email" required autocomplete="email">
    <label>Mot de passe</label><input name="password" type="password" required autocomplete="current-password">${m}
    <button class="btn green" id="ab" style="width:100%;margin-top:16px">Se connecter</button></form>
    <p style="margin-top:14px;text-align:center"><a href="#" onclick="renderAuth('forgot');return false">Mot de passe oublié ?</a></p>
    <p style="margin-top:8px;text-align:center">Pas encore de compte ? <a href="#" onclick="renderAuth('signup');return false"><b>Créer un compte</b></a></p>`);
  if (mode === 'signup') return authShell(`<form onsubmit="doSignup(event)"><label>Nom complet</label><input name="name" required autocomplete="name">
    <label>Adresse e-mail</label><input name="email" type="email" required autocomplete="email">
    <label>Téléphone</label><input name="phone" type="tel" required autocomplete="tel" placeholder="+243…">
    <label>Mot de passe (8 caractères minimum)</label><input name="password" type="password" minlength="8" required autocomplete="new-password">
    <label>Confirmer le mot de passe</label><input name="password2" type="password" minlength="8" required autocomplete="new-password">
    <label class="chk"><input type="checkbox" required> J'accepte les conditions d'utilisation et la politique de confidentialité</label>${m}
    <button class="btn green" id="ab" style="width:100%;margin-top:16px">Créer mon compte</button></form>
    <p style="margin-top:14px;text-align:center">Déjà un compte ? <a href="#" onclick="renderAuth('login');return false"><b>Se connecter</b></a></p>`);
  if (mode === 'forgot') return authShell(`<form onsubmit="doForgot(event)"><p class="sub">Entrez votre e-mail : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
    <label>Adresse e-mail</label><input name="email" type="email" required>${m}
    <button class="btn green" id="ab" style="width:100%;margin-top:16px">Envoyer le lien</button></form>
    <p style="margin-top:14px;text-align:center"><a href="#" onclick="renderAuth('login');return false">← Retour</a></p>`);
  if (mode === 'newpass') return authShell(`<form onsubmit="doNewPass(event)"><p class="sub">Choisissez votre nouveau mot de passe.</p>
    <label>Nouveau mot de passe</label><input name="password" type="password" minlength="8" required autocomplete="new-password">${m}
    <button class="btn green" id="ab" style="width:100%;margin-top:16px">Enregistrer</button></form>`);
}

async function enter(session) {
  user = session.user; window.USER_EMAIL = user.email; window.USER_NAME = (user.user_metadata || {}).full_name || '';
  await loadData(); render();
}
const form = e => { e.preventDefault(); $('#ab').disabled = true; return Object.fromEntries(new FormData(e.target)); };
async function doLogin(e) {
  const v = form(e); const { data, error } = await sb.auth.signInWithPassword({ email: v.email.trim(), password: v.password });
  if (error) return renderAuth('login', tr(error.message)); enter(data.session);
}
async function doSignup(e) {
  const v = form(e);
  if (v.password !== v.password2) return renderAuth('signup', 'Les deux mots de passe sont différents.');
  const { data, error } = await sb.auth.signUp({ email: v.email.trim(), password: v.password,
    options: { data: { full_name: v.name.trim(), phone: v.phone.trim() }, emailRedirectTo: location.origin } });
  if (error) return renderAuth('signup', tr(error.message));
  if (data.session) return enter(data.session);
  renderAuth('login', '✅ Compte créé ! Confirmez votre e-mail (lien reçu), puis connectez-vous.');
}
async function doForgot(e) {
  const v = form(e); const { error } = await sb.auth.resetPasswordForEmail(v.email.trim(), { redirectTo: location.origin });
  renderAuth('forgot', error ? tr(error.message) : '✅ Si cet e-mail existe, un lien vient d\'être envoyé.');
}
async function doNewPass(e) {
  const v = form(e); const { error } = await sb.auth.updateUser({ password: v.password });
  if (error) return renderAuth('newpass', tr(error.message));
  recovery = false; history.replaceState(null, '', location.pathname);
  const { data } = await sb.auth.getSession(); enter(data.session);
}
async function logout() { await flush(); await sb.auth.signOut(); }

/* --- Démarrage --- */
async function boot() {
  if (!okConfig()) {
    return authShell('<div class="err">⚠️ Supabase n\'est pas encore configuré. Ouvrez le fichier <b>js/config.js</b> et collez votre URL et votre clé (voir LISEZ-MOI.txt).</div>');
  }
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') { recovery = true; renderAuth('newpass'); }
    if (ev === 'SIGNED_OUT') { user = null; S = blank(); renderAuth('login'); }
  });
  if (location.hash.includes('type=recovery')) recovery = true;
  const { data } = await sb.auth.getSession();
  if (recovery) return renderAuth('newpass');
  if (data.session) enter(data.session); else renderAuth('login');
}

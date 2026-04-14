/* ══════════════════════════════════════════════════════════════════════════
   CONFIG — Variables injectées par _middleware.js via window.__ENV__
   ══════════════════════════════════════════════════════════════════════════ */
const _ENV = window.__ENV__ || {};
const SUPABASE_URL       = _ENV.SUPABASE_URL       || '';
const SUPABASE_KEY       = _ENV.SUPABASE_KEY       || '';
const TELEGRAM_BOT_TOKEN = _ENV.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = _ENV.TELEGRAM_CHAT_ID   || '';

if (!SUPABASE_URL || !SUPABASE_KEY) console.error('[MindCash] Variables manquantes.');

const DEPOT_MIN       = 5000;
const RETRAIT_MIN     = 4450;
const FRAIS_PERCENT   = 5;
const TIMER_SEC       = 30;
const BONUS_N1        = 2050;
const BONUS_N2        = 750;
const DEPOT_H_DEBUT   = 6;
const DEPOT_H_FIN     = 22;
const RETRAIT_H_DEBUT = 7;
const RETRAIT_H_FIN   = 17;
const RETRAIT_JOURS   = [1,2,3,4,5];
const JOURS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let user = null, userData = null, bal = 0;
let completedMissions = new Set();
let aTimerIv = null;
let pendingDepotNum = '', pendingDepotMt = 0;

/* ══════════════════════════════════════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════════════════════════════════════ */
let toastIv = null;
function toast(msg, dur = 3500){
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastIv);
  toastIv = setTimeout(() => t.style.display = 'none', dur);
}

/* ══════════════════════════════════════════════════════════════════════════
   TELEGRAM
   ══════════════════════════════════════════════════════════════════════════ */
async function sendTG(text){
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode:'HTML' })
    });
  } catch(e){ console.warn('TG error:', e); }
}

/* ══════════════════════════════════════════════════════════════════════════
   HORAIRES
   ══════════════════════════════════════════════════════════════════════════ */
function depotOuvert(){
  const h = new Date().getHours();
  return h >= DEPOT_H_DEBUT && h < DEPOT_H_FIN;
}
function retraitOuvert(){
  const now = new Date(), h = now.getHours(), j = now.getDay();
  return RETRAIT_JOURS.includes(j) && h >= RETRAIT_H_DEBUT && h < RETRAIT_H_FIN;
}

/* ══════════════════════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════════════════════ */
function swTab(id){
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.frm').forEach(f => f.classList.remove('on'));
  if(id === 'login'){
    document.querySelector('.tab:first-child').classList.add('on');
    document.getElementById('fLogin').classList.add('on');
  } else {
    document.querySelector('.tab:last-child').classList.add('on');
    document.getElementById('fReg').classList.add('on');
  }
}

function checkPassMatch(){
  const p1  = document.getElementById('rPass').value;
  const p2  = document.getElementById('rPassConfirm').value;
  const msg = document.getElementById('passMatchMsg');
  const i1  = document.getElementById('rPass');
  const i2  = document.getElementById('rPassConfirm');
  if(!p2){ msg.className = 'pass-match-msg'; msg.textContent = ''; return false; }
  if(p1 === p2){
    msg.className = 'pass-match-msg ok'; msg.textContent = '✅ Les mots de passe correspondent';
    i2.className = 'input-ok'; i1.className = 'input-ok'; return true;
  } else {
    msg.className = 'pass-match-msg err'; msg.textContent = '❌ Les mots de passe ne correspondent pas';
    i2.className = 'input-error'; i1.className = ''; return false;
  }
}

// Pré-remplir le code parrain depuis l'URL
const _ref = new URLSearchParams(window.location.search).get('ref');
if(_ref){
  const r = document.getElementById('rRef');
  if(r){ r.value = _ref; r.readOnly = true; r.style.background = '#eee'; r.style.cursor = 'not-allowed'; }
}

async function doRegister(){
  const name  = document.getElementById('rName').value.trim();
  const phone = document.getElementById('rPhone').value.trim();
  const pass  = document.getElementById('rPass').value;
  const pconf = document.getElementById('rPassConfirm').value;
  const ref   = document.getElementById('rRef').value.trim() || null;
  if(!name || !phone || !pass || !pconf){ toast('Remplis tous les champs obligatoires'); return; }
  if(pass !== pconf){ toast('❌ Les mots de passe ne correspondent pas'); return; }
  if(pass.length < 6){ toast('Le mot de passe doit faire au moins 6 caractères'); return; }
  const { data, error } = await supabaseClient.auth.signUp({ email: phone+'@mindcash.app', password: pass });
  if(error){ toast(error.message); return; }
  let referredBy = null;
  if(ref){
    const { data: ru } = await supabaseClient.from('users').select('id').eq('ref_code', ref).single();
    if(ru?.id) referredBy = ru.id; else toast('Code parrain invalide');
  }
  const refCode = 'MC-' + Math.floor(100000 + Math.random()*899999);
  const { error: ie } = await supabaseClient.from('users').insert({
    id: data.user.id, name, phone, balance: 0, is_active: false, ref_code: refCode, referred_by: referredBy
  });
  if(ie){ toast(ie.message); return; }
  toast('✅ Compte créé ! Connectez-vous.'); swTab('login');
}

async function doLogin(){
  const phone = document.getElementById('lPhone').value.trim();
  const pass  = document.getElementById('lPass').value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email: phone+'@mindcash.app', password: pass });
  if(error){ toast(error.message); return; }
  user = data.user; await loadUser();
}

async function doLogout(){
  await supabaseClient.auth.signOut();
  ['sMain','sActivate'].forEach(id => document.getElementById(id).classList.remove('on'));
  document.getElementById('sAuth').classList.add('on');
  document.getElementById('modActivate').classList.remove('on');
  resetModActivate();
  user = null; userData = null; bal = 0; completedMissions = new Set();
}

/* ══════════════════════════════════════════════════════════════════════════
   LOAD USER
   ══════════════════════════════════════════════════════════════════════════ */
async function loadUser(){
  const { data, error } = await supabaseClient.from('users').select('*').eq('id', user.id).single();
  if(error || !data){ toast('Erreur chargement profil'); return; }
  userData = data; bal = data.balance || 0;
  document.getElementById('sAuth').classList.remove('on');
  if(!data.is_active){
    document.getElementById('sMain').classList.remove('on');
    document.getElementById('sActivate').classList.add('on');
    return;
  }
  document.getElementById('sActivate').classList.remove('on');
  document.getElementById('sMain').classList.add('on');
  const btnD = document.getElementById('btnDepotMain');
  if(btnD) btnD.style.display = 'none';
  updBal(); setUserUI(data.name, data.phone, data.ref_code, data.is_active);
  await Promise.all([loadTransactions(), loadStats(), loadAffilTree(), loadDepotBalance(), loadAds(), loadCompletedMissions()]);
  await checkBonusToday();
}

/* ══════════════════════════════════════════════════════════════════════════
   UI HELPERS
   ══════════════════════════════════════════════════════════════════════════ */
function updBal(){
  document.getElementById('balAmt').innerHTML = bal.toLocaleString('fr-FR') + ' <span style="font-size:17px;font-weight:400">FCFA</span>';
  const p = document.getElementById('profBal'); if(p) p.textContent = bal.toLocaleString('fr-FR') + ' FCFA';
  const s = document.getElementById('soldeDispo'); if(s) s.textContent = bal.toLocaleString('fr-FR') + ' FCFA';
}

function setUserUI(name, phone, refCode, isActive){
  const ini = name.split(' ').map(w => w[0]||'').join('').toUpperCase().slice(0,2);
  document.getElementById('uName').textContent      = name.split(' ')[0];
  document.getElementById('uAvatar').textContent    = ini;
  document.getElementById('profAvatar').textContent = ini;
  document.getElementById('profName').textContent   = name;
  document.getElementById('profPhone').textContent  = phone;
  document.getElementById('refCode').textContent    = refCode || '—';
  document.getElementById('uID').textContent        = refCode || '—';
  const sEl = document.getElementById('uStatus'), pEl = document.getElementById('profStatus');
  if(isActive){
    sEl.textContent = 'actif'; sEl.style.color = '#7fc97f';
    pEl.innerHTML = '<span class="bdg bdg-g">Actif</span>';
  } else {
    sEl.textContent = 'inactif'; sEl.style.color = '#e24b4a';
    pEl.innerHTML = '<span class="bdg bdg-r">Inactif</span>';
  }
}

function showPg(id){
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
  document.getElementById('pg'+id).classList.add('on');
  document.getElementById('ni-'+id.toLowerCase()).classList.add('on');
}

/* ══════════════════════════════════════════════════════════════════════════
   DÉPÔT D'ACTIVATION
   ══════════════════════════════════════════════════════════════════════════ */
function ouvrirDepotActivation(){
  if(userData && userData.is_active){ toast('✅ Votre compte est déjà actif.'); return; }
  if(!depotOuvert()){ toast(`⏰ Dépôts fermés ! Ouverts de ${DEPOT_H_DEBUT}h à ${DEPOT_H_FIN}h`); return; }
  document.getElementById('modActivate').classList.add('on');
}

function fermerModActivate(){
  document.getElementById('modActivate').classList.remove('on');
  resetModActivate();
}

function resetModActivate(){
  document.querySelectorAll('[id^="aS"]').forEach(s => s.classList.remove('on'));
  const s1 = document.getElementById('aS1'); if(s1) s1.classList.add('on');
  if(aTimerIv){ clearInterval(aTimerIv); aTimerIv = null; }
  pendingDepotNum = ''; pendingDepotMt = 0;
}

async function aCreerDepot(){
  const num = document.getElementById('aNum').value.trim();
  const mt  = parseInt(document.getElementById('aMt').value);
  if(!num || !mt || isNaN(mt)){ toast('Remplis tous les champs'); return; }
  if(mt < DEPOT_MIN){ toast(`Minimum ${DEPOT_MIN.toLocaleString('fr-FR')} FCFA`); return; }
  const btn = document.getElementById('aBtnCreer');
  btn.disabled = true; btn.textContent = 'Création en cours…';
  try {
    const { data: dep, error: depErr } = await supabaseClient
      .from('deposits')
      .insert({ user_id: user.id, number: num, operator: 'MTN MoMo', amount: mt, status: 'pending', is_activation: true })
      .select('id').single();
    if(depErr){ toast('Erreur : ' + depErr.message); btn.disabled = false; btn.textContent = 'Créer le dépôt'; return; }
    await supabaseClient.from('transactions').insert({
      user_id: user.id, type: 'deposit', amount: mt, status: 'pending',
      meta: { activation: true, deposit_id: dep?.id }
    });
    pendingDepotNum = num; pendingDepotMt = mt;
    document.getElementById('aS1').classList.remove('on');
    document.getElementById('aS2').classList.add('on');
    aTimerIv = lancerTimer('aTimerDisplay', 'aBtnConfirm', TIMER_SEC);
    toast('Dépôt enregistré — suivez les instructions MTN MoMo');
  } catch(e){
    toast('Erreur inattendue. Réessayez.');
    btn.disabled = false; btn.textContent = 'Créer le dépôt';
  }
}

async function aConfirmerPaiement(){
  if(aTimerIv){ clearInterval(aTimerIv); aTimerIv = null; }
  document.getElementById('aNumConf').textContent = pendingDepotNum;
  document.getElementById('aMtConf').textContent  = pendingDepotMt.toLocaleString('fr-FR') + ' FCFA';
  document.getElementById('aS2').classList.remove('on');
  document.getElementById('aS3').classList.add('on');
  await sendTG(
    `🔔 <b>DÉPÔT D'ACTIVATION EN ATTENTE</b>\n\n` +
    `👤 Utilisateur : <b>${userData.name}</b>\n📞 ${userData.phone}\n🆔 Ref : ${userData.ref_code}\n` +
    `💰 Montant : <b>${pendingDepotMt.toLocaleString('fr-FR')} FCFA</b>\n` +
    `📱 MTN MoMo · 📲 ${pendingDepotNum}\n\n✅ Validez depuis le tableau de bord admin.`
  );
  toast("Paiement confirmé — l'admin va activer votre compte !");
}

function lancerTimer(displayId, btnId, seconds){
  let rem = seconds;
  const display = document.getElementById(displayId);
  const btn     = document.getElementById(btnId);
  if(!display || !btn) return null;
  btn.disabled = true; btn.textContent = '🔒 Attendez la fin du compte à rebours…';
  function tick(){
    const m = Math.floor(rem / 60), s = rem % 60;
    display.textContent = m + ':' + String(s).padStart(2, '0');
    if(rem <= 0){ clearInterval(iv); btn.disabled = false; btn.textContent = '✅ Confirmer le paiement'; }
    rem--;
  }
  tick();
  const iv = setInterval(tick, 1000);
  return iv;
}

/* ══════════════════════════════════════════════════════════════════════════
   RETRAIT
   ══════════════════════════════════════════════════════════════════════════ */
function ouvrirRetrait(){
  if(!retraitOuvert()){
    const j = JOURS_FR[new Date().getDay()];
    toast(`⏰ Retraits fermés ! Lun–Ven ${RETRAIT_H_DEBUT}h–${RETRAIT_H_FIN}h. Aujourd'hui : ${j}`);
    return;
  }
  document.getElementById('modRetrait').classList.add('on');
}

function fermerRetrait(){
  document.getElementById('modRetrait').classList.remove('on');
  document.getElementById('rS1').classList.add('on');
  document.getElementById('rS2').classList.remove('on');
  document.getElementById('fraisBox').style.display = 'none';
  document.getElementById('rMt').value = '';
  document.getElementById('rNum').value = '';
}

function updateFrais(){
  const mt = parseInt(document.getElementById('rMt').value);
  const box = document.getElementById('fraisBox');
  if(!mt || mt < 1){ box.style.display = 'none'; return; }
  const frais = Math.round(mt * FRAIS_PERCENT / 100), net = mt - frais;
  document.getElementById('fraisMtBrut').textContent  = mt.toLocaleString('fr-FR') + ' FCFA';
  document.getElementById('fraisMontant').textContent = '− ' + frais.toLocaleString('fr-FR') + ' FCFA';
  document.getElementById('fraisNet').textContent     = net.toLocaleString('fr-FR') + ' FCFA';
  box.style.display = 'block';
}

async function doRetrait(){
  if(!retraitOuvert()){ toast('⏰ Retraits fermés !'); return; }
  const num = document.getElementById('rNum').value.trim();
  const mt  = parseInt(document.getElementById('rMt').value);
  if(!num){ toast('Entre ton numéro MTN MoMo'); return; }
  if(!mt || isNaN(mt)){ toast('Entre un montant valide'); return; }
  if(mt > bal){ toast('Solde insuffisant'); return; }
  if(mt < RETRAIT_MIN){ toast(`Minimum ${RETRAIT_MIN.toLocaleString('fr-FR')} FCFA`); return; }
  const frais = Math.round(mt * FRAIS_PERCENT / 100), net = mt - frais;
  const { data: wd, error: wErr } = await supabaseClient
    .from('withdrawals')
    .insert({ user_id: user.id, number: num, operator: 'MTN MoMo', amount: mt, status: 'pending', fees: frais, net_amount: net })
    .select('id').single();
  if(wErr){ toast('Erreur retrait : ' + wErr.message); return; }
  await supabaseClient.from('transactions').insert({
    user_id: user.id, type: 'withdraw', amount: mt, status: 'pending',
    meta: { fees: frais, net_amount: net, withdrawal_id: wd?.id }
  });
  await supabaseClient.rpc('increment_balance', { uid: user.id, amount: -mt });
  bal -= mt; updBal();
  await sendTG(
    `💳 <b>DEMANDE DE RETRAIT</b>\n\n👤 <b>${userData.name}</b>\n📞 ${userData.phone}\n🆔 ${userData.ref_code}\n` +
    `💰 Montant : <b>${mt.toLocaleString('fr-FR')} FCFA</b>\n` +
    `💸 Frais (${FRAIS_PERCENT}%) : ${frais.toLocaleString('fr-FR')} FCFA\n` +
    `✅ Net : <b>${net.toLocaleString('fr-FR')} FCFA</b>\n📱 MTN : ${num}`
  );
  document.getElementById('rNumConf').textContent   = num;
  document.getElementById('rMtConf').textContent    = mt.toLocaleString('fr-FR') + ' FCFA';
  document.getElementById('rFraisConf').textContent = '− ' + frais.toLocaleString('fr-FR') + ' FCFA';
  document.getElementById('rNetConf').textContent   = net.toLocaleString('fr-FR') + ' FCFA';
  document.getElementById('rS1').classList.remove('on');
  document.getElementById('rS2').classList.add('on');
  toast('Retrait soumis — admin notifié ✅');
  await Promise.all([loadTransactions(), loadStats(), loadDepotBalance()]);
}

/* ══════════════════════════════════════════════════════════════════════════
   DATA LOADERS
   ══════════════════════════════════════════════════════════════════════════ */
async function loadTransactions(){
  const { data } = await supabaseClient.from('transactions').select('*')
    .eq('user_id', user.id).order('created_at', {ascending:false}).limit(10);
  const el = document.getElementById('txList');
  if(!data?.length){ el.innerHTML = '<div class="row" style="justify-content:center;color:var(--gr600);font-size:13px">Aucune transaction</div>'; return; }
  const lbl = { deposit:'Dépôt', withdraw:'Retrait', bonus:'Bonus quotidien', ad:'Pub regardée', mission:'Mission', referral:'Parrainage' };
  el.innerHTML = data.map(tx => {
    const pos  = tx.type !== 'withdraw';
    const date = new Date(tx.created_at).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    const cls  = tx.status==='success'?'bdg-g':tx.status==='pending'?'bdg-a':'bdg-r';
    const stxt = tx.status==='success'?'Validé':tx.status==='pending'?'En attente':'Échoué';
    return `<div class="row"><div><div style="font-weight:600;font-size:13px">${lbl[tx.type]||tx.type}</div><div class="row-sub">${date} · <span class="bdg ${cls}">${stxt}</span></div></div><div style="color:${pos?'var(--g600)':'var(--r600)'};font-weight:700">${pos?'+':'−'}${tx.amount.toLocaleString('fr-FR')} FCFA</div></div>`;
  }).join('');
}

async function loadStats(){
  const { data: gains } = await supabaseClient.from('transactions').select('amount,type')
    .eq('user_id', user.id).in('type', ['bonus','ad','mission','referral']).eq('status','success');
  const tg = (gains||[]).reduce((s,t) => s+(t.amount||0), 0);
  document.getElementById('statTotalGagne').textContent = tg.toLocaleString('fr-FR');
  document.getElementById('profTotalGagne').textContent = tg.toLocaleString('fr-FR') + ' FCFA';
  const { data: rets } = await supabaseClient.from('withdrawals').select('amount,status').eq('user_id', user.id).eq('status','success');
  const tr = (rets||[]).reduce((s,r) => s+(r.amount||0), 0);
  document.getElementById('statRetraits').textContent     = (rets||[]).length;
  document.getElementById('profTotalRetrait').textContent = tr.toLocaleString('fr-FR') + ' FCFA';
  const { data: n1 } = await supabaseClient.from('users').select('id').eq('referred_by', user.id);
  document.getElementById('statFilleuls').textContent = (n1||[]).length;
}

async function loadDepotBalance(){
  const { data: deps } = await supabaseClient.from('deposits').select('amount,status').eq('user_id', user.id);
  const td = (deps||[]).filter(d => d.status==='success').reduce((s,d) => s+(d.amount||0), 0);
  document.getElementById('totalDeposeAmt').textContent = td.toLocaleString('fr-FR') + ' FCFA';
  const p = document.getElementById('profTotalDepose'); if(p) p.textContent = td.toLocaleString('fr-FR') + ' FCFA';
  const { data: rets } = await supabaseClient.from('withdrawals').select('amount,status').eq('user_id', user.id).eq('status','pending');
  const tp = (rets||[]).reduce((s,r) => s+(r.amount||0), 0);
  document.getElementById('retraitsPendingAmt').textContent = tp.toLocaleString('fr-FR') + ' FCFA';
}

/* ══════════════════════════════════════════════════════════════════════════
   MISSIONS — Table completed_missions (persistant, une seule fois à vie)
   ══════════════════════════════════════════════════════════════════════════ */
async function loadCompletedMissions(){
  const { data } = await supabaseClient
    .from('completed_missions').select('mission_id').eq('user_id', user.id);
  completedMissions = new Set();
  (data||[]).forEach(row => {
    const key = String(row.mission_id);
    completedMissions.add(key);
    const el = document.getElementById('tM'+key)
            || document.getElementById('tAaa'+key)
            || document.getElementById('tAa'+key);
    if(el) el.classList.add('done');
  });
  document.getElementById('mCount').textContent = completedMissions.size;
}

async function doMissionLink(id, name, rewardStr, link){
  if(!userData?.is_active){ toast('Compte non activé.'); return; }
  const key = String(id);
  const { data: existing } = await supabaseClient
    .from('completed_missions').select('id')
    .eq('user_id', user.id).eq('mission_id', key).maybeSingle();
  if(existing || completedMissions.has(key)){
    toast('✅ Mission déjà complétée !');
    const el = document.getElementById('tM'+key) || document.getElementById('tAaa'+key) || document.getElementById('tAa'+key);
    if(el) el.classList.add('done'); return;
  }
  if(link && link !== '#') window.open(link, '_blank');
  const gain = parseInt(rewardStr);
  const { error: mErr } = await supabaseClient
    .from('completed_missions')
    .insert({ user_id: user.id, mission_id: key, mission_name: name, reward: gain });
  if(mErr){ toast('✅ Mission déjà complétée !'); return; }
  await supabaseClient.rpc('increment_balance', { uid: user.id, amount: gain });
  await supabaseClient.from('transactions').insert({
    user_id: user.id, type: 'mission', amount: gain, status: 'success',
    meta: { mission_id: key, mission_name: name }
  });
  completedMissions.add(key); bal += gain; updBal();
  toast('+' + gain + ' FCFA — ' + name);
  const el = document.getElementById('tM'+key) || document.getElementById('tAaa'+key) || document.getElementById('tAa'+key);
  if(el) el.classList.add('done');
  document.getElementById('mCount').textContent = completedMissions.size;
  await loadTransactions();
}

/* ══════════════════════════════════════════════════════════════════════════
   ADS
   ══════════════════════════════════════════════════════════════════════════ */
async function loadAds(){
  const today = new Date().toISOString().split('T')[0];
  const { data: ads } = await supabaseClient.from('ads').select('*').eq('is_active', true).order('created_at', {ascending:false});
  const el = document.getElementById('adsList');
  if(!ads?.length){
    el.innerHTML = '<div style="text-align:center;color:var(--gr600);font-size:13px;padding:16px 0;background:#fff;border-radius:14px;border:1px solid #e2eaf4">Aucune publicité disponible</div>';
    return;
  }
  const { data: wt } = await supabaseClient.from('transactions').select('meta')
    .eq('user_id', user.id).eq('type','ad').gte('created_at', today+'T00:00:00');
  const wids = new Set((wt||[]).map(t => t.meta?.ad_id ? String(t.meta.ad_id) : null).filter(Boolean));
  el.innerHTML = ads.map(ad => {
    const done = wids.has(String(ad.id));
    return `<div class="task ${done?'done':''}" id="ad-${ad.id}" onclick="watchAd(${ad.id},${ad.duration_seconds},${ad.reward})"><div class="task-ico" style="background:var(--b50)">${ad.icon||'📢'}</div><div class="task-body"><div class="task-title">${ad.title}</div><div class="task-desc">${ad.description||'Regarder '+ad.duration_seconds+'s'}</div></div><div class="task-rew">+${ad.reward} FCFA</div></div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════════════
   BONUS QUOTIDIEN
   ══════════════════════════════════════════════════════════════════════════ */
async function claimBonus(){
  if(!userData?.is_active){ toast('Compte non activé.'); return; }
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabaseClient
    .from('transactions').select('id')
    .eq('user_id', user.id).eq('type','bonus').eq('status','success')
    .gte('created_at', today+'T00:00:00').maybeSingle();
  if(existing){ toast('⏰ Bonus déjà récupéré aujourd\'hui !'); document.getElementById('tBonus').classList.add('done'); return; }
  const gain = 20;
  await supabaseClient.rpc('increment_balance', { uid: user.id, amount: gain });
  await supabaseClient.from('transactions').insert({ user_id: user.id, type:'bonus', amount: gain, status:'success' });
  bal += gain; updBal();
  toast('+' + gain + ' FCFA 🎁 Bonus du jour récupéré !');
  document.getElementById('tBonus').classList.add('done');
  await loadTransactions();
}

async function checkBonusToday(){
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabaseClient
    .from('transactions').select('id')
    .eq('user_id', user.id).eq('type','bonus').eq('status','success')
    .gte('created_at', today+'T00:00:00').maybeSingle();
  if(existing){ const el = document.getElementById('tBonus'); if(el) el.classList.add('done'); }
}

/* ══════════════════════════════════════════════════════════════════════════
   PUBS
   ══════════════════════════════════════════════════════════════════════════ */
function watchAd(adId, duration, gain){
  if(!userData?.is_active){ toast('Compte non activé.'); return; }
  const el = document.getElementById('ad-'+adId);
  if(el?.classList.contains('done')){ toast('Déjà regardée aujourd\'hui'); return; }
  toast(`Pub en cours… (${duration}s)`);
  if(el){ el.style.opacity = '0.5'; el.style.pointerEvents = 'none'; }
  setTimeout(async () => {
    await supabaseClient.rpc('increment_balance', { uid: user.id, amount: gain });
    await supabaseClient.from('transactions').insert({
      user_id: user.id, type:'ad', amount: gain, status:'success', meta:{ ad_id: adId }
    });
    bal += gain; updBal(); toast(`+${gain} FCFA`);
    if(el) el.classList.add('done');
    document.getElementById('mCount').textContent = parseInt(document.getElementById('mCount').textContent) + 1;
    await loadTransactions();
  }, duration * 1000);
}

/* ══════════════════════════════════════════════════════════════════════════
   PARRAINAGE
   ══════════════════════════════════════════════════════════════════════════ */
function copyLink(){
  if(!userData?.is_active){ toast('Activez votre compte avant de parrainer'); return; }
  navigator.clipboard.writeText('https://cashmind.pages.dev/?ref=' + userData.ref_code)
    .then(() => toast('Lien copié ! 🔗')).catch(() => toast('Copie échouée'));
}

async function loadAffilTree(){
  const { data: n1 } = await supabaseClient.from('users')
    .select('id,name,ref_code,is_active,created_at').eq('referred_by', user.id);
  if(!n1?.length){
    document.getElementById('affilTree').innerHTML = '<div style="text-align:center;color:var(--gr600);font-size:13px;padding:20px 0">Pas encore de filleuls</div>';
    ['afN1Count','afN2Count','afN1Gains','afN2Gains'].forEach(id => document.getElementById(id).textContent = '0');
    return;
  }
  let html = '', n2Total = 0, gainsN1 = 0, gainsN2 = 0;
  for(const u1 of n1){
    const date = new Date(u1.created_at).toLocaleDateString('fr-FR');
    const b1 = u1.is_active ? `<span class="bdg bdg-g">+${BONUS_N1.toLocaleString('fr-FR')} FCFA</span>` : '<span class="bdg bdg-a">En attente</span>';
    if(u1.is_active) gainsN1 += BONUS_N1;
    html += `<div class="tree-node"><div><div style="font-size:13px;font-weight:600">${u1.name||'Utilisateur'}</div><div style="font-size:11px;color:var(--gr600)">${u1.is_active?'Actif':'En attente'} · ${date} · N1</div></div>${b1}</div>`;
    const { data: n2 } = await supabaseClient.from('users')
      .select('id,name,ref_code,is_active,created_at').eq('referred_by', u1.id);
    if(n2?.length){
      html += '<div class="tree-indent">';
      for(const u2 of n2){
        const d2 = new Date(u2.created_at).toLocaleDateString('fr-FR');
        const b2 = u2.is_active ? `<span class="bdg bdg-g">+${BONUS_N2.toLocaleString('fr-FR')} FCFA</span>` : '<span class="bdg bdg-a">En attente</span>';
        if(u2.is_active) gainsN2 += BONUS_N2;
        html += `<div class="tree-node"><div><div style="font-size:13px;font-weight:600">${u2.name||'Utilisateur'}</div><div style="font-size:11px;color:var(--gr600)">${u2.is_active?'Actif':'En attente'} · ${d2} · N2</div></div>${b2}</div>`;
        n2Total++;
      }
      html += '</div>';
    }
  }
  document.getElementById('affilTree').innerHTML = html;
  document.getElementById('afN1Count').textContent = n1.length;
  document.getElementById('afN2Count').textContent = n2Total;
  document.getElementById('afN1Gains').textContent = gainsN1.toLocaleString('fr-FR');
  document.getElementById('afN2Gains').textContent = gainsN2.toLocaleString('fr-FR');
}

/* ══════════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════════ */
async function checkUser(){
  const { data } = await supabaseClient.auth.getUser();
  if(data?.user){ user = data.user; await loadUser(); }
}
checkUser();

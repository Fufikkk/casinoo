'use strict';
// ═══════════════════════════════════════════════════════════
//  ABYSSAL CASINO v3 — script.js
//  All 10 games + Economy + Stats + Auth + Achievements +
//  Leaderboard + Bonuses + Admin + Chat + Responsible Gambling
// ═══════════════════════════════════════════════════════════

// ── ADMIN CONFIG ─────────────────────────────────────────────
const ADMIN_CONFIG = {
  rtp:{ slots:.96, deepReels:.96, crash:.95, roulette:.973, blackjack:.995, coinflip:.98, poker:.975, mines:.97, plinko:.97, keno:.96 },
  betLimits:{ min:10, max:1000 },
  dailyBonus:500, welcomeBonus:2500,
  vipLevels:[
    { name:'DIVER',     threshold:0,      badge:'🤿', perks:'Access to all games',          dailyBonus:500  },
    { name:'SAILOR',    threshold:5000,   badge:'⛵', perks:'+5% win multiplier',            dailyBonus:600  },
    { name:'CAPTAIN',   threshold:25000,  badge:'⚓', perks:'+10% wins, daily 750 Kč',      dailyBonus:750  },
    { name:'ADMIRAL',   threshold:100000, badge:'🔱', perks:'+15% wins, daily 1500 Kč',     dailyBonus:1500 },
    { name:'LEVIATHAN', threshold:500000, badge:'🐙', perks:'Max multipliers + VIP chat',   dailyBonus:3000 },
  ],
  antiBotDelay:350,
};

// ── PERSISTENCE ───────────────────────────────────────────────
const DB = {
  get:(k,fb=null)=>{ try{ const v=localStorage.getItem(k); return v!==null?JSON.parse(v):fb; }catch{ return fb; }},
  set:(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch{} },
  del:(k)=>{ try{ localStorage.removeItem(k); }catch{} },
};

// ── GLOBAL STATE ──────────────────────────────────────────────
let currentUser = null;
let ucet        = 0;
let activeGame  = '';
let popupOpen   = false;
let sessionStartBalance = 0;
let sessionStartTime    = Date.now();
let currentStreak       = 0;
let jackpotPool         = DB.get('ac_jackpot', 125000);
let lastActionTs        = 0;

// ── RATE LIMITER ─────────────────────────────────────────────
function rateLimitOk() {
  const now = Date.now();
  if (now - lastActionTs < ADMIN_CONFIG.antiBotDelay) return false;
  lastActionTs = now;
  return true;
}

// ═══════════════════════════════════════════════
// SECTION 1: AUTH
// ═══════════════════════════════════════════════

function getUserDB()        { return DB.get('ac_users', {}); }
function saveUserDB(u)      { DB.set('ac_users', u); }
function loadUser(name)     { return getUserDB()[name] || null; }
function saveCurrentUser()  { if (!currentUser) return; const db=getUserDB(); db[currentUser.name]=currentUser; saveUserDB(db); DB.set('ac_session',currentUser.name); }

function createUser(name) {
  return {
    name, pin:'', balance:ADMIN_CONFIG.welcomeBonus, avatar:'🐚',
    totalWagered:0, totalWon:0, totalLost:0, gamesPlayed:0,
    biggestWin:0, biggestLoss:0, currentStreak:0, bestStreak:0,
    createdAt:Date.now(), lastLogin:Date.now(), lastDaily:0, lastBonusWheel:0,
    vipXP:0, referralCode:'ABY-'+Math.random().toString(36).substr(2,6).toUpperCase(),
    referrals:0, selfExcludedUntil:0, dailyLossLimit:0, dailyLossToday:0, lastLossReset:0,
    gameStats:{ slots:{w:0,l:0,pl:0}, deepReels:{w:0,l:0,pl:0}, crash:{w:0,l:0,pl:0}, roulette:{w:0,l:0,pl:0}, blackjack:{w:0,l:0,pl:0}, coinflip:{w:0,l:0,pl:0}, poker:{w:0,l:0,pl:0}, mines:{w:0,l:0,pl:0}, plinko:{w:0,l:0,pl:0}, keno:{w:0,l:0,pl:0} },
    achievements:{},
    cfHeads:0, cfTails:0,
    rouletteHistory:[],
  };
}

function getVipLevel(user) {
  const xp=user.vipXP||0, lvls=ADMIN_CONFIG.vipLevels;
  let lv=0;
  for (let i=lvls.length-1;i>=0;i--) { if(xp>=lvls[i].threshold){lv=i;break;} }
  return { index:lv, ...lvls[lv] };
}
function getVipMult() { return 1 + getVipLevel(currentUser).index * 0.05; }

function showAuthTab(tab) {
  document.getElementById('authLogin').classList.toggle('hidden', tab!=='login');
  document.getElementById('authRegister').classList.toggle('hidden', tab!=='register');
  document.getElementById('tabLogin').classList.toggle('active', tab==='login');
  document.getElementById('tabRegister').classList.toggle('active', tab==='register');
}

function doRegister() {
  const name=document.getElementById('regName').value.trim();
  const pin =document.getElementById('regPin').value.trim();
  const ref  =document.getElementById('regRef')?.value.trim()||'';
  if (!name||name.length<2) return showAlert('Username must be 2+ characters','⚠️');
  if (!/^\d{4}$/.test(pin))  return showAlert('PIN must be exactly 4 digits','⚠️');
  const db=getUserDB();
  if (db[name]) return showAlert('Username already taken','⚠️');
  const user=createUser(name); user.pin=pin;
  // Referral bonus
  if (ref) {
    const referrer = Object.values(db).find(u=>u.referralCode===ref);
    if (referrer) { referrer.balance=(referrer.balance||0)+500; referrer.referrals=(referrer.referrals||0)+1; db[referrer.name]=referrer; user.balance+=500; showAlert('Referral bonus!\n+500 Kč for you and your friend','🎁'); }
  }
  db[name]=user; saveUserDB(db);
  adminLog('REGISTER',`New user: ${name}`);
  loginAs(user);
}

function doLogin() {
  const name=document.getElementById('loginName').value.trim();
  const pin =document.getElementById('loginPin').value.trim();
  const user=loadUser(name);
  if (!user)          return showAlert('User not found','❌');
  if (user.pin!==pin) return showAlert('Wrong PIN','❌');
  // Self-exclusion check
  if (user.selfExcludedUntil && Date.now() < user.selfExcludedUntil) {
    const days=Math.ceil((user.selfExcludedUntil-Date.now())/86400000);
    return showAlert(`Account self-excluded\n${days} day(s) remaining`,'🛡️');
  }
  user.lastLogin=Date.now();
  adminLog('LOGIN',`User: ${name}`);
  loginAs(user);
}

function loginAs(user) {
  currentUser=user; ucet=user.balance;
  saveCurrentUser();
  document.getElementById('authModal').classList.add('hidden');
  initAllSystems();
}

function doLogout() {
  saveCurrentUser(); currentUser=null;
  DB.del('ac_session');
  location.reload();
}

function tryAutoLogin() {
  const name=DB.get('ac_session',null);
  if (name) { const u=loadUser(name); if(u){ loginAs(u); return; } }
  document.getElementById('authModal').classList.remove('hidden');
}

// ═══════════════════════════════════════════════
// SECTION 2: ECONOMY
// ═══════════════════════════════════════════════

function updateBalance(delta, game, won) {
  if (!currentUser) return;
  ucet = Math.max(0, ucet + delta);
  currentUser.balance = ucet;
  const abs = Math.abs(delta);
  if (delta > 0) { currentUser.totalWon=(currentUser.totalWon||0)+delta; if(delta>currentUser.biggestWin)currentUser.biggestWin=delta; }
  if (delta < 0) { currentUser.totalLost=(currentUser.totalLost||0)+abs; if(abs>currentUser.biggestLoss)currentUser.biggestLoss=abs; }
  if (game && currentUser.gameStats[game]) {
    currentUser.gameStats[game].pl+=delta;
    if (won) currentUser.gameStats[game].w++; else currentUser.gameStats[game].l++;
  }
  currentUser.vipXP=(currentUser.vipXP||0)+(delta<0?abs:0);
  currentUser.gamesPlayed=(currentUser.gamesPlayed||0)+1;
  // Streak
  if (won) { currentStreak=Math.max(0,currentStreak)+1; if(currentStreak>currentUser.bestStreak)currentUser.bestStreak=currentStreak; }
  else { currentStreak=Math.min(0,currentStreak)-1; }
  currentUser.currentStreak=currentStreak;
  // Daily loss reset
  const today=new Date().setHours(0,0,0,0);
  if ((currentUser.lastLossReset||0)<today) { currentUser.dailyLossToday=0; currentUser.lastLossReset=today; }
  if (delta<0) currentUser.dailyLossToday=(currentUser.dailyLossToday||0)+abs;
  // Jackpot contribution
  if (delta<0) { jackpotPool=Math.floor(jackpotPool+abs*0.01); DB.set('ac_jackpot',jackpotPool); updateJackpotTicker(); }
  addHistory(game, delta, won);
  checkAchievements();
  saveCurrentUser();
  renderBalanceUI();
  renderStatsTicker();
  updateStreakBar();
  // Live win feed
  if (won && delta>=500) pushLiveWin(delta, game);
  // Chat bot win message
  if (won && delta>=1000) addChatMsg('System','🐚',`🎉 ${currentUser.name} just won ${delta.toLocaleString()} Kč on ${game}!`,true);
}

function addWager(amount, game) {
  if (!currentUser) return;
  currentUser.totalWagered=(currentUser.totalWagered||0)+amount;
  currentUser.vipXP=(currentUser.vipXP||0)+amount;
}

function checkDailyLossLimit() {
  if (!currentUser||!currentUser.dailyLossLimit) return true;
  return (currentUser.dailyLossToday||0) < currentUser.dailyLossLimit;
}

function renderBalanceUI() {
  const set=(id,v)=>{ const e=document.getElementById(id);if(e)e.textContent=v; };
  const b=ucet.toLocaleString()+' Kč';
  set('ucetLabel',b); set('balanceDisplay',b);
  if (currentUser) {
    const vip=getVipLevel(currentUser);
    const badge=document.getElementById('vipBadge');
    if(badge){badge.textContent=`${vip.badge} ${vip.name}`;badge.style.color=['#00d4aa','#4cc9f0','#ffd166','#ff6b6b','#c77dff'][vip.index];}
  }
}

function topUp() { updateBalance(10,null,true); showAlert('💰 +10 Kč deposited!','🐚'); playSFX('click'); }
function resetAccount() { if(!currentUser)return; ucet=0;currentUser.balance=0;renderBalanceUI();saveCurrentUser();showAlert('Balance wiped\n0 Kč','🌀'); }

// ═══════════════════════════════════════════════
// SECTION 3: HISTORY & STATS
// ═══════════════════════════════════════════════

function addHistory(game, delta, won) {
  if (!currentUser||!game) return;
  const key='ac_hist_'+currentUser.name;
  const hist=DB.get(key,[]);
  hist.unshift({t:Date.now(),game,delta,won});
  DB.set(key, hist.slice(0,300));
}

function getHistory() { if(!currentUser)return[]; return DB.get('ac_hist_'+currentUser.name,[]); }

function renderHistory(filter, btn) {
  if (btn) { document.querySelectorAll('.hf-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }
  const el=document.getElementById('historyContent'); if(!el)return;
  let hist=getHistory();
  if (filter==='wins')   hist=hist.filter(h=>h.won);
  if (filter==='losses') hist=hist.filter(h=>!h.won);
  if (!hist.length){el.innerHTML='<div class="lb-empty">No records yet</div>';return;}
  el.innerHTML=hist.slice(0,80).map(h=>{
    const time=new Date(h.t).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'});
    const amt=h.delta>=0?'+'+h.delta.toLocaleString():h.delta.toLocaleString();
    return `<div class="history-item">
      <span class="hi-time">${time}</span>
      <span class="hi-game">${h.game}</span>
      <span class="hi-detail">${h.won?'✅ Win':'❌ Loss'}</span>
      <span class="hi-amount ${h.delta>=0?'win':'loss'}">${amt} Kč</span>
    </div>`;
  }).join('');
}

function renderStats() {
  const el=document.getElementById('statsContent'); if(!el||!currentUser)return;
  const u=currentUser;
  const wagered=u.totalWagered||0, won=u.totalWon||0, lost=u.totalLost||0;
  const rtp=wagered>0?Math.min(200,(won/wagered*100)).toFixed(1):'—';
  const pl=won-lost, rtpNum=wagered>0?Math.min(100,won/wagered*100):96;
  const totalW=Object.values(u.gameStats).reduce((a,g)=>a+g.w,0);
  const totalL=Object.values(u.gameStats).reduce((a,g)=>a+g.l,0);
  const gameRows=Object.entries(u.gameStats).map(([name,gs])=>{
    const s=gs.pl>=0?'+':'';
    return `<div class="gb-item"><span class="gb-game">${name}</span><span class="gb-wl">${gs.w}W/${gs.l}L</span><span class="gb-pl ${gs.pl>=0?'pos':'neg'}">${s}${gs.pl.toLocaleString()} Kč</span></div>`;
  }).join('');
  // Session chart data
  const hist=getHistory().slice(0,20).reverse();
  const sessionPL=ucet-sessionStartBalance;
  el.innerHTML=`
    <div class="stats-grid">
      <div class="sg-item"><div class="sg-label">GAMES PLAYED</div><div class="sg-val">${(u.gamesPlayed||0).toLocaleString()}</div></div>
      <div class="sg-item"><div class="sg-label">WIN / LOSS</div><div class="sg-val">${totalW}W / ${totalL}L</div></div>
      <div class="sg-item"><div class="sg-label">TOTAL WAGERED</div><div class="sg-val">${wagered.toLocaleString()} Kč</div></div>
      <div class="sg-item"><div class="sg-label">BIGGEST WIN</div><div class="sg-val gold">${(u.biggestWin||0).toLocaleString()} Kč</div></div>
      <div class="sg-item"><div class="sg-label">BEST STREAK</div><div class="sg-val">${u.bestStreak||0} wins</div></div>
      <div class="sg-item"><div class="sg-label">PROFIT / LOSS</div><div class="sg-val ${pl>=0?'':'red'}">${pl>=0?'+':''}${pl.toLocaleString()} Kč</div></div>
    </div>
    <div class="stats-rtp-bar">
      <div class="rtp-label">RETURN TO PLAYER (estimated)</div>
      <div class="rtp-track"><div class="rtp-fill" style="width:${rtpNum}%"></div></div>
      <div class="rtp-val">${rtp}%</div>
    </div>
    <div style="margin-top:10px;font-family:var(--font-display);font-size:.62rem;letter-spacing:2px;color:var(--teal)">SESSION P/L: <b style="color:${sessionPL>=0?'var(--teal)':'var(--coral)'}">${sessionPL>=0?'+':''}${sessionPL.toLocaleString()} Kč</b></div>
    <div class="game-breakdown" style="margin-top:14px">${gameRows}</div>`;
}

function renderStatsTicker() {
  if (!currentUser) return;
  const u=currentUser, pl=(u.totalWon||0)-(u.totalLost||0);
  const wagered=u.totalWagered||0, rtp=wagered>0?((u.totalWon||0)/wagered*100).toFixed(1)+'%':'—';
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('tickerBal',  ucet.toLocaleString()+' Kč');
  set('tickerPL',   (pl>=0?'+':'')+pl.toLocaleString()+' Kč');
  set('tickerBW',   (u.biggestWin||0).toLocaleString()+' Kč');
  set('tickerGames',(u.gamesPlayed||0).toString());
  set('tickerRTP',  rtp);
}

function updateStreakBar() {
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('streakCount', currentStreak>=0?`${currentStreak}🔥`:`${Math.abs(currentStreak)}❄️`);
  const sessionPL=ucet-sessionStartBalance;
  set('sessionPL',(sessionPL>=0?'+':'')+sessionPL.toLocaleString()+' Kč');
  // Lucky game
  if (currentUser) {
    const best=Object.entries(currentUser.gameStats).sort((a,b)=>b[1].pl-a[1].pl)[0];
    if(best)set('luckyGame',best[0]);
  }
}

// Session timer
setInterval(()=>{
  const secs=Math.floor((Date.now()-sessionStartTime)/1000);
  const h=Math.floor(secs/3600), m=Math.floor((secs%3600)/60), s=secs%60;
  const el=document.getElementById('sessionTimer');
  if(el)el.textContent=h>0?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;
  // Session warning every 2 hours
  if (secs>0 && secs%7200===0) {
    const w=document.getElementById('sessionWarning');
    const t=document.getElementById('sessionWarnTime');
    if(w&&t){t.textContent=`${Math.floor(secs/3600)}h`;w.classList.remove('hidden');}
  }
},1000);

// ═══════════════════════════════════════════════
// SECTION 4: LEADERBOARD
// ═══════════════════════════════════════════════

const LB_KEY='ac_leaderboard';
function getLeaderboard(){ return DB.get(LB_KEY,[]); }
function saveLeaderboard(lb){ DB.set(LB_KEY,lb); }
function getISOWeek(){ const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+4-(d.getDay()||7));const y=d.getFullYear();return`${y}-W${Math.ceil((((d-new Date(y,0,1))/86400000)+1)/7)}`; }

function submitLeaderboardEntry(score, game) {
  if (!currentUser||score<=0) return;
  const lb=getLeaderboard();
  lb.push({name:currentUser.name,avatar:currentUser.avatar,score,game,ts:Date.now(),week:getISOWeek()});
  lb.sort((a,b)=>b.score-a.score);
  saveLeaderboard(lb.slice(0,50));
}

function renderLeaderboard(mode) {
  document.querySelectorAll('.lb-tab').forEach((t,i)=>t.classList.toggle('active',['alltime','weekly','biggest'][i]===mode));
  const el=document.getElementById('leaderboardContent'); if(!el)return;
  let lb=getLeaderboard();
  if (mode==='alltime') {
    lb=Object.values(getUserDB()).map(u=>({name:u.name,avatar:u.avatar||'🐚',score:u.balance||0,game:'Balance'})).sort((a,b)=>b.score-a.score);
  } else if (mode==='weekly') {
    lb=lb.filter(e=>e.week===getISOWeek());
  }
  lb=lb.slice(0,15);
  if (!lb.length){el.innerHTML='<div class="lb-empty">No entries yet — play to make history!</div>';return;}
  el.innerHTML=lb.map((e,i)=>{
    const medals=['🥇','🥈','🥉']; const rc=i<3?['gold','silver','bronze'][i]:'';
    return `<div class="lb-entry"><span class="lb-rank ${rc}">${i<3?medals[i]:'#'+(i+1)}</span><span style="font-size:1.2rem">${e.avatar||'🐚'}</span><span class="lb-name">${e.name}</span><span class="lb-game-tag">${e.game}</span><span class="lb-score">${(e.score||0).toLocaleString()} Kč</span></div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
// SECTION 5: DAILY REWARD & BONUSES
// ═══════════════════════════════════════════════

function isDailyAvailable() { if(!currentUser)return false; return (Date.now()-(currentUser.lastDaily||0))>23*3600*1000; }

function claimDaily() {
  if (!isDailyAvailable()) {
    const wait=23*3600*1000-(Date.now()-(currentUser.lastDaily||0));
    const h=Math.floor(wait/3600000), m=Math.floor((wait%3600000)/60000);
    return showAlert(`Come back in ${h}h ${m}m\nfor your daily reward`,'⏳');
  }
  const vip=getVipLevel(currentUser);
  const amt=vip.dailyBonus;
  currentUser.lastDaily=Date.now();
  updateBalance(amt,null,true);
  showAlert(`🎁 DAILY REWARD!\n+${amt.toLocaleString()} Kč\n(${vip.name} bonus)`,'🎁');
  playSFX('daily');
  updateDailyBtn();
}

function updateDailyBtn() {
  const btn=document.getElementById('dailyBtn'); if(!btn)return;
  const avail=isDailyAvailable();
  btn.style.opacity=avail?'1':'0.45';
  btn.title=avail?'Claim daily reward!':'Already claimed today';
  let dot=btn.querySelector('.daily-badge-dot');
  if (!dot&&avail){dot=document.createElement('span');dot.className='daily-badge-dot';dot.style.cssText='position:absolute;top:-3px;right:-3px;width:9px;height:9px;background:#ffd166;border-radius:50%;box-shadow:0 0 8px rgba(255,209,102,.8);animation:pulse-dot 1.5s ease infinite';btn.appendChild(dot);}
  if (dot) dot.style.display=avail?'block':'none';
}

// Bonus Wheel
const WHEEL_PRIZES = [
  {label:'500 Kč',   color:'#00d4aa', value:500,    type:'cash'},
  {label:'5 Spins',  color:'#c77dff', value:5,      type:'spins'},
  {label:'200 Kč',   color:'#2176ae', value:200,    type:'cash'},
  {label:'1000 Kč',  color:'#ffd166', value:1000,   type:'cash'},
  {label:'NOTHING',  color:'#1a1a2e', value:0,      type:'none'},
  {label:'10 Spins', color:'#f72585', value:10,     type:'spins'},
  {label:'300 Kč',   color:'#40916c', value:300,    type:'cash'},
  {label:'2× Mult',  color:'#ff6b35', value:2,      type:'mult'},
];

let wheelSpinning=false, wheelAngle=0;

function isBonusWheelAvailable() { if(!currentUser)return false; return (Date.now()-(currentUser.lastBonusWheel||0))>7*24*3600*1000; }

function initBonusWheel() {
  const canvas=document.getElementById('bonusWheelCanvas'); if(!canvas)return;
  const ctx=canvas.getContext('2d');
  drawBonusWheel(ctx, wheelAngle, -1);
  const btn=document.getElementById('spinWheelBtn');
  const hint=document.getElementById('bonusWheelHint');
  const avail=isBonusWheelAvailable();
  if(btn)btn.disabled=!avail;
  if(hint){
    if(avail) hint.textContent='Spin your free weekly reward!';
    else{const ms=7*24*3600*1000-(Date.now()-(currentUser.lastBonusWheel||0));const d=Math.floor(ms/86400000);hint.textContent=`Next spin in ${d} day(s)`;}
  }
  const res=document.getElementById('bonusWheelResult'); if(res)res.textContent='';
}

function drawBonusWheel(ctx, angle, highlight) {
  const W=300,H=300,cx=150,cy=150,r=140,n=WHEEL_PRIZES.length,seg=(Math.PI*2)/n;
  ctx.clearRect(0,0,W,H);
  WHEEL_PRIZES.forEach((p,i)=>{
    const a=angle+i*seg;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,a,a+seg);ctx.closePath();
    ctx.fillStyle=i===highlight?'#fff':p.color;ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.3)';ctx.lineWidth=1.5;ctx.stroke();
    ctx.save();ctx.translate(cx,cy);ctx.rotate(a+seg/2);
    ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font='bold 11px Cinzel';
    ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=4;
    ctx.fillText(p.label,r-8,4);ctx.restore();
  });
  ctx.beginPath();ctx.arc(cx,cy,18,0,Math.PI*2);ctx.fillStyle='#010c18';ctx.fill();ctx.strokeStyle='#00d4aa';ctx.lineWidth=2;ctx.stroke();
}

function spinBonusWheel() {
  if (wheelSpinning||!isBonusWheelAvailable())return;
  wheelSpinning=true;
  const canvas=document.getElementById('bonusWheelCanvas'); if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const btn=document.getElementById('spinWheelBtn');
  if(btn)btn.disabled=true;
  const idx=Math.floor(Math.random()*WHEEL_PRIZES.length);
  const n=WHEEL_PRIZES.length, seg=(Math.PI*2)/n;
  const targetAngle=-(Math.PI*2)*8-(idx*seg+seg/2)+(Math.PI/2);
  const start=performance.now(), dur=5000, startAngle=wheelAngle;
  function frame(now){
    const t=Math.min((now-start)/dur,1);
    const ease=1-Math.pow(1-t,4);
    wheelAngle=startAngle+(targetAngle-startAngle)*ease;
    drawBonusWheel(ctx,wheelAngle,t>=1?idx:-1);
    if(t<1)requestAnimationFrame(frame);
    else{
      wheelSpinning=false;
      const prize=WHEEL_PRIZES[idx];
      currentUser.lastBonusWheel=Date.now();
      const res=document.getElementById('bonusWheelResult');
      if(prize.type==='cash'){updateBalance(prize.value,null,true);if(res)res.textContent=`🎉 Won ${prize.value} Kč!`;}
      else if(prize.type==='spins'){freeSpinsLeft+=prize.value;updateFreeSpinsBanner();if(res)res.textContent=`🎰 Won ${prize.value} Free Spins!`;}
      else if(prize.type==='mult'){if(res)res.textContent=`⚡ 2× multiplier next spin!`;}
      else{if(res)res.textContent='Better luck next time!';}
      showAlert(`🎡 BONUS WHEEL!\n${prize.label}`,prize.type!=='none'?'🎉':'😔');
      saveCurrentUser();
      if(btn)btn.disabled=true;
      const hint=document.getElementById('bonusWheelHint');
      if(hint)hint.textContent='Come back next week!';
    }
  }
  requestAnimationFrame(frame);
}

// ═══════════════════════════════════════════════
// SECTION 6: ACHIEVEMENTS
// ═══════════════════════════════════════════════

const ACHIEVEMENTS = [
  {id:'first_win',     icon:'🎯', name:'First Win',          desc:'Win your first game',                  check:u=>u.totalWon>0},
  {id:'big_winner',    icon:'💰', name:'Big Winner',          desc:'Win 1,000 Kč in a single game',        check:u=>u.biggestWin>=1000},
  {id:'high_roller',   icon:'💎', name:'High Roller',         desc:'Wager 10,000 Kč total',                check:u=>(u.totalWagered||0)>=10000},
  {id:'streak_5',      icon:'🔥', name:'On Fire',             desc:'Win 5 games in a row',                 check:u=>u.bestStreak>=5},
  {id:'jackpot',       icon:'🔱', name:'Jackpot King',        desc:'Win a jackpot',                        check:u=>u.biggestWin>=5000},
  {id:'centurion',     icon:'🏅', name:'Centurion',           desc:'Play 100 games',                       check:u=>(u.gamesPlayed||0)>=100},
  {id:'survivor',      icon:'🃏', name:'Blackjack Survivor',  desc:'Win 10 blackjack games',               check:u=>(u.gameStats?.blackjack?.w||0)>=10},
  {id:'crash_5x',      icon:'🚀', name:'To The Moon',         desc:'Cash out at 5× or higher on Crash',    check:u=>false},// flagged manually
  {id:'full_house',    icon:'♠️', name:'Full House',          desc:'Hit a full house in Poker',             check:u=>false},// flagged manually
  {id:'mines_10',      icon:'💣', name:'Minesweeper',         desc:'Reveal 10 safe tiles in one Mines game',check:u=>false},// flagged manually
  {id:'vip1',          icon:'⛵', name:'Set Sail',            desc:'Reach SAILOR VIP level',               check:u=>(u.vipXP||0)>=5000},
  {id:'daily_7',       icon:'📅', name:'Dedicated',           desc:'Claim daily bonus 7 times (lifetime)',  check:u=>false},// needs counter
  {id:'referral',      icon:'👥', name:'Recruiter',           desc:'Refer a friend',                       check:u=>(u.referrals||0)>=1},
  {id:'millionaire',   icon:'🤑', name:'Millionaire',         desc:'Have 10,000 Kč balance',               check:u=>u.balance>=10000},
];

function checkAchievements() {
  if (!currentUser) return;
  if (!currentUser.achievements) currentUser.achievements={};
  let newlyUnlocked=[];
  ACHIEVEMENTS.forEach(a=>{
    if (!currentUser.achievements[a.id] && a.check(currentUser)) {
      currentUser.achievements[a.id]={unlockedAt:Date.now()};
      newlyUnlocked.push(a);
    }
  });
  if (newlyUnlocked.length>0) {
    const a=newlyUnlocked[0];
    setTimeout(()=>showAlert(`🏅 ACHIEVEMENT UNLOCKED!\n${a.icon} ${a.name}`,'🏅'),800);
  }
}

function flagAchievement(id) {
  if (!currentUser||!id) return;
  if (!currentUser.achievements) currentUser.achievements={};
  if (!currentUser.achievements[id]) {
    currentUser.achievements[id]={unlockedAt:Date.now()};
    const a=ACHIEVEMENTS.find(x=>x.id===id);
    if(a) setTimeout(()=>showAlert(`🏅 ACHIEVEMENT!\n${a.icon} ${a.name}`,'🏅'),900);
    saveCurrentUser();
  }
}

function renderAchievements() {
  const el=document.getElementById('achievementsContent'); if(!el||!currentUser)return;
  const unlocked=currentUser.achievements||{};
  const total=ACHIEVEMENTS.length, done=Object.keys(unlocked).length;
  el.innerHTML=`<div style="font-family:var(--font-display);font-size:.7rem;letter-spacing:2px;color:var(--text-dim);text-align:center;margin-bottom:14px">${done} / ${total} UNLOCKED</div><div class="ach-grid">${
    ACHIEVEMENTS.map(a=>{
      const u=unlocked[a.id];
      return `<div class="ach-item ${u?'unlocked':''}">
        <span class="ach-icon">${u?a.icon:'🔒'}</span>
        <div class="ach-info">
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
          <div class="ach-status ${u?'done':'locked'}">${u?'✓ UNLOCKED '+new Date(u.unlockedAt).toLocaleDateString():'Locked'}</div>
        </div>
      </div>`;
    }).join('')
  }</div>`;
}

// ═══════════════════════════════════════════════
// SECTION 7: PROFILE & VIP
// ═══════════════════════════════════════════════

const AVATARS=['🐚','⚓','🔱','🐠','🦑','🐙','🌊','💎','🦈','🐋','🦀','🐡','🪸','🫧','🐬','🐳'];

function renderProfile() {
  const el=document.getElementById('profileContent'); if(!el||!currentUser)return;
  const u=currentUser, vip=getVipLevel(u), next=ADMIN_CONFIG.vipLevels[vip.index+1];
  const xp=u.vipXP||0, prog=next?Math.min(100,((xp-vip.threshold)/(next.threshold-vip.threshold)*100)).toFixed(0):100;
  el.innerHTML=`
    <div class="profile-avatar">${u.avatar||'🐚'}</div>
    <div class="profile-info">
      <div class="profile-name">${u.name}</div>
      <div class="profile-sub">${vip.badge} ${vip.name} · ${vip.perks}</div>
      <div class="profile-sub" style="margin-top:4px">Referral code: <b style="color:var(--gold)">${u.referralCode}</b></div>
    </div>
    <div class="profile-stats-grid">
      <div class="psg-item"><div class="psg-label">BALANCE</div><div class="psg-val">${ucet.toLocaleString()} Kč</div></div>
      <div class="psg-item"><div class="psg-label">GAMES PLAYED</div><div class="psg-val">${(u.gamesPlayed||0).toLocaleString()}</div></div>
      <div class="psg-item"><div class="psg-label">BIGGEST WIN</div><div class="psg-val">${(u.biggestWin||0).toLocaleString()} Kč</div></div>
      <div class="psg-item"><div class="psg-label">BEST STREAK</div><div class="psg-val">${u.bestStreak||0} wins</div></div>
    </div>
    <div style="font-family:var(--font-display);font-size:.62rem;letter-spacing:2px;color:var(--teal);margin-bottom:6px">VIP: ${vip.name} → ${next?next.name:'MAX'}</div>
    <div class="vip-progress"><div class="vip-bar" style="width:${prog}%"></div></div>
    <div style="font-size:.6rem;color:var(--text-dim);text-align:center;margin-top:4px;font-family:var(--font-display)">${xp.toLocaleString()} / ${(next?next.threshold:xp).toLocaleString()} XP</div>
    <div style="margin-top:18px;font-family:var(--font-display);font-size:.62rem;letter-spacing:2px;color:var(--teal)">CHOOSE AVATAR</div>
    <div class="avatar-grid">${AVATARS.map(a=>`<span class="av-opt ${a===u.avatar?'active':''}" onclick="setAvatar('${a}')">${a}</span>`).join('')}</div>`;
}

function setAvatar(emoji) {
  if (!currentUser) return;
  currentUser.avatar=emoji; saveCurrentUser();
  document.querySelectorAll('.av-opt').forEach(a=>a.classList.toggle('active',a.textContent===emoji));
  document.querySelector('.profile-avatar').textContent=emoji;
}

// ═══════════════════════════════════════════════
// SECTION 8: RESPONSIBLE GAMBLING
// ═══════════════════════════════════════════════

function renderRG() {
  const el=document.getElementById('rgContent'); if(!el||!currentUser)return;
  const u=currentUser;
  el.innerHTML=`
    <div class="rg-section">
      <h3>🔒 DAILY LOSS LIMIT</h3>
      <div class="rg-row">
        <span class="rg-label">Max daily loss (0 = disabled)</span>
        <input class="rg-input" id="rgLossLimit" type="number" value="${u.dailyLossLimit||0}" min="0" max="10000" step="100"/>
        <button class="rg-btn" onclick="setLossLimit()">SAVE</button>
      </div>
      <div style="font-size:.65rem;color:var(--text-dim);font-family:var(--font-display)">Lost today: ${(u.dailyLossToday||0).toLocaleString()} Kč</div>
    </div>
    <div class="rg-section">
      <h3>⏸ SELF-EXCLUSION</h3>
      <div class="rg-row">
        <span class="rg-label">Exclude account for:</span>
        <button class="rg-btn danger" onclick="selfExclude(1)">1 DAY</button>
        <button class="rg-btn danger" onclick="selfExclude(7)">7 DAYS</button>
        <button class="rg-btn danger" onclick="selfExclude(30)">30 DAYS</button>
      </div>
      <div style="font-size:.65rem;color:var(--text-dim);font-family:var(--font-display)">Exclusion will take effect immediately and cannot be undone early.</div>
    </div>
    <div class="rg-section">
      <h3>📊 SESSION STATS</h3>
      <div style="font-family:var(--font-display);font-size:.7rem;color:var(--text-mid);line-height:2">
        Time playing: <b id="rgSessionTime">—</b><br>
        Session P/L: <b style="color:${ucet-sessionStartBalance>=0?'var(--teal)':'var(--coral)'}">${ucet-sessionStartBalance>=0?'+':''}${(ucet-sessionStartBalance).toLocaleString()} Kč</b><br>
        Games this session: <b id="rgSessionGames">—</b>
      </div>
    </div>
    <div class="rg-section">
      <h3>ℹ️ RESOURCES</h3>
      <div style="font-size:.68rem;color:var(--text-dim);line-height:1.8">
        This is a demo casino with virtual currency only.<br>
        If gambling is affecting your life, seek help.<br>
        <a href="https://www.gamblingtherapy.org" target="_blank" style="color:var(--teal)">gamblingtherapy.org</a>
      </div>
    </div>`;
  const secs=Math.floor((Date.now()-sessionStartTime)/1000);
  const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60);
  const rgt=document.getElementById('rgSessionTime');
  if(rgt)rgt.textContent=h>0?`${h}h ${m}m`:`${m}m`;
  const rgg=document.getElementById('rgSessionGames');
  if(rgg)rgg.textContent=currentUser.gamesPlayed||0;
}

function setLossLimit() {
  const v=parseInt(document.getElementById('rgLossLimit')?.value)||0;
  currentUser.dailyLossLimit=v; saveCurrentUser();
  showAlert(`Daily loss limit set\nto ${v>0?v.toLocaleString()+' Kč':'disabled'}`,'🛡️');
}

function selfExclude(days) {
  if(!currentUser)return;
  currentUser.selfExcludedUntil=Date.now()+days*86400000;
  saveCurrentUser();
  showAlert(`Account excluded for ${days} day(s)\nYou will be logged out now`,'🛡️');
  setTimeout(doLogout,2000);
}

// ═══════════════════════════════════════════════
// SECTION 9: LIVE WIN FEED & JACKPOT TICKER
// ═══════════════════════════════════════════════

function pushLiveWin(amount, game) {
  const feed=document.getElementById('liveWinFeed'); if(!feed)return;
  const div=document.createElement('div'); div.className='lwf-item';
  div.textContent=`${currentUser.avatar} ${currentUser.name} won ${amount.toLocaleString()} Kč on ${game}`;
  feed.appendChild(div);
  setTimeout(()=>div.remove(),4100);
  while(feed.children.length>5)feed.removeChild(feed.firstChild);
}

function updateJackpotTicker() {
  const el=document.getElementById('jackpotAmount');
  if(el)el.textContent=jackpotPool.toLocaleString();
}

// Animate jackpot counter
setInterval(()=>{
  jackpotPool+=Math.floor(Math.random()*50+10);
  DB.set('ac_jackpot',jackpotPool);
  updateJackpotTicker();
},3000);

// ═══════════════════════════════════════════════
// SECTION 10: POPUP & EFFECTS
// ═══════════════════════════════════════════════

const SFX={spin:null,win:null,jackpot:null,lose:null,click:null,daily:null,crash:null,card:null,coin:null};
function playSFX(name){try{if(SFX[name]){SFX[name].currentTime=0;SFX[name].play();}}catch{}}

let popupTimer=null;
function showAlert(text,emoji=''){
  popupOpen=true; clearTimeout(popupTimer);
  const ov=document.getElementById('overlay'),at=document.getElementById('alertText'),ae=document.getElementById('alertEmoji');
  if(!ov)return;
  if(at)at.textContent=text; if(ae)ae.textContent=emoji;
  ov.classList.add('active');
  popupTimer=setTimeout(()=>{ov.classList.remove('active');popupOpen=false;},500);
}

function winFlash(red=false){
  const el=document.createElement('div');el.className='win-flash-overlay'+(red?' flash-red':'');
  document.body.appendChild(el);setTimeout(()=>el.remove(),900);
}

function moneyBurst(ox,oy,count=50){
  const SYMS=['💸','💰','🤑','💵','💎','⭐','🪙'];
  const frag=document.createDocumentFragment();
  for(let i=0;i<count;i++){
    const el=document.createElement('span');el.className='money-particle';
    el.textContent=SYMS[Math.floor(Math.random()*SYMS.length)];
    const a=Math.random()*Math.PI*2,d=120+Math.random()*400;
    const dur=0.7+Math.random()*.9,del=Math.random()*.3,sz=(1+Math.random()*2).toFixed(1);
    el.style.cssText=`left:${ox}px;top:${oy}px;font-size:${sz}rem;--tx:${(Math.cos(a)*d).toFixed(0)}px;--ty:${(Math.sin(a)*d).toFixed(0)}px;--rot:${(-540+Math.random()*1080).toFixed(0)}deg;--duration:${dur.toFixed(2)}s;--delay:${del.toFixed(2)}s`;
    el.addEventListener('animationend',()=>el.remove(),{once:true});
    frag.appendChild(el);
  }
  document.body.appendChild(frag);
}

function triggerJackpotEffect(){
  const flash=document.createElement('div');flash.className='flash-overlay';document.body.appendChild(flash);setTimeout(()=>flash.remove(),600);
  const ov=document.getElementById('jackpotOverlay');ov?.classList.remove('hidden');setTimeout(()=>ov?.classList.add('hidden'),2800);
  moneyBurst(window.innerWidth/2,window.innerHeight*.55,80);
  playSFX('jackpot');
}

// ═══════════════════════════════════════════════
// SECTION 11: NAVIGATION
// ═══════════════════════════════════════════════

const GAME_SECTIONS={slots:'sectionSlots',slots5:'sectionDeepReels',crash:'sectionCrash',roulette:'sectionRoulette',blackjack:'sectionBlackjack',coinflip:'sectionCoinflip',poker:'sectionPoker',mines:'sectionMines',plinko:'sectionPlinko',keno:'sectionKeno'};
const GAME_BTNS    ={slots:'btnSlots',slots5:'btnDeepReels',crash:'btnCrash',roulette:'btnRoulette',blackjack:'btnBlackjack',coinflip:'btnCoinflip',poker:'btnPoker',mines:'btnMines',plinko:'btnPlinko',keno:'btnKeno'};

function switchGame(game){
  if(game===activeGame)return;
  crashStop();
  activeGame=game;
  Object.values(GAME_SECTIONS).forEach(id=>document.getElementById(id)?.classList.add('hidden'));
  Object.values(GAME_BTNS).forEach(id=>document.getElementById(id)?.classList.remove('active'));
  document.getElementById(GAME_SECTIONS[game])?.classList.remove('hidden');
  document.getElementById(GAME_BTNS[game])?.classList.add('active');
  if(game==='slots5')updateUI();
  if(game==='roulette')buildRouletteBettingGrid();
  if(game==='poker')buildPokerPaytable();
  if(game==='keno')buildKenoGrid();
  if(game==='plinko')initPlinko();
}

function openModal(id){document.getElementById(id)?.classList.remove('hidden');}
function closeModal(id){document.getElementById(id)?.classList.add('hidden');}

// ═══════════════════════════════════════════════
// SECTION 12: CLASSIC 3-REEL SLOTS
// ═══════════════════════════════════════════════

const SLOT_SYMBOLS=['🐚','🔱','💎','⭐','🐠','🪸','🫧','⚓'];
const STRIP_ROWS=12;
let spinning=false, slotsBet=100;

function setSlotsBet(amount){
  slotsBet=amount;
  const lbl=document.getElementById('slotsBetLabel');if(lbl)lbl.textContent=`${amount} Kč`;
  document.querySelectorAll('#sectionSlots .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===amount));
}

function buildReels(){
  for(let r=1;r<=3;r++){
    const strip=document.getElementById(`strip${r}`);if(!strip)continue;
    strip.innerHTML='';
    for(let i=0;i<STRIP_ROWS;i++){const div=document.createElement('div');div.className='slot-sym';div.textContent=SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)];strip.appendChild(div);}
  }
}

function loadStrip(strip,finalRow){
  const cells=strip.querySelectorAll('.slot-sym');
  cells.forEach((cell,i)=>{ cell.textContent=i<STRIP_ROWS-3?SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]:finalRow[i-(STRIP_ROWS-3)]; });
}

function spin(){
  if(spinning||popupOpen||!rateLimitOk())return;
  if(!checkDailyLossLimit()&&slotsBet>0){showAlert('Daily loss limit reached!\nTake a break 🛡️','🛡️');return;}
  if(ucet<slotsBet){showAlert('Not enough gold!\nAdd more funds.','💸');return;}
  addWager(slotsBet,'slots'); ucet-=slotsBet; renderBalanceUI();
  spinning=true;
  const btn=document.getElementById('spinBtn');if(btn)btn.disabled=true;
  document.getElementById('slotResult').textContent='';
  playSFX('spin');
  const outcomes=[1,2,3].map(()=>[SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)],SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)],SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]]);
  for(let r=1;r<=3;r++){
    const strip=document.getElementById(`strip${r}`);
    strip.style.transition='none';strip.style.transform='translateY(0)';
    loadStrip(strip,outcomes[r-1]);
  }
  const SYM_H=84,SCROLL_TO=-((STRIP_ROWS-3)*SYM_H),BASE=750,STAGGER=280;
  for(let r=1;r<=3;r++){
    const strip=document.getElementById(`strip${r}`);
    const dur=BASE+(r-1)*STAGGER;
    strip.classList.add('spinning-blur');void strip.offsetWidth;
    strip.style.transition=`transform ${dur}ms cubic-bezier(0.08,0.0,0.15,1)`;
    strip.style.transform=`translateY(${SCROLL_TO}px)`;
    setTimeout(()=>strip.classList.remove('spinning-blur'),dur-80);
  }
  setTimeout(()=>resolveSlots(outcomes),BASE+2*STAGGER+120);
}

function resolveSlots(outcomes){
  const mid=outcomes.map(r=>r[1]);
  let payout=0,resultText='',alertMsg='',alertEmoji='',resultColor='';
  const vMult=getVipMult();
  if(mid[0]===mid[1]&&mid[1]===mid[2]){
    payout=Math.floor(slotsBet*5*vMult);
    resultText=`⚓ JACKPOT! +${payout} Kč`;alertMsg=`TRIDENT JACKPOT!\n${mid.join('  ')}\n+${payout} Kč`;alertEmoji='🔱';resultColor='var(--gold)';
    triggerJackpotEffect();moneyBurst(window.innerWidth/2,window.innerHeight*.5);
    document.querySelector('.machine-frame')?.classList.add('win-flash');setTimeout(()=>document.querySelector('.machine-frame')?.classList.remove('win-flash'),750);
    flagAchievement('jackpot');
  }else if(mid[0]===mid[1]||mid[1]===mid[2]||mid[0]===mid[2]){
    payout=Math.floor(slotsBet*2*vMult);
    resultText=`🌊 TWIN CURRENT! +${payout} Kč`;alertMsg=`TWIN CURRENT!\n${mid.join('  ')}\n+${payout} Kč`;alertEmoji='🌊';resultColor='var(--teal)';
  }else{
    resultText=`🦑 Abyss takes it. −${slotsBet} Kč`;alertMsg=`The abyss claims all\n${mid.join('  ')}\n−${slotsBet} Kč`;alertEmoji='🦑';resultColor='var(--coral)';
  }
  const won=payout>0;
  updateBalance(payout,'slots',won);
  const resEl=document.getElementById('slotResult');
  if(resEl){resEl.textContent=resultText;resEl.style.color=resultColor;}
  if(won){winFlash();submitLeaderboardEntry(payout,'Slots');}else winFlash(true);
  playSFX(won?(payout>=slotsBet*4?'jackpot':'win'):'lose');
  showAlert(alertMsg,alertEmoji);
  spinning=false;
  const btn=document.getElementById('spinBtn');if(btn)btn.disabled=false;
}

// ═══════════════════════════════════════════════
// SECTION 13: DEEP REELS (5-reel)
// ═══════════════════════════════════════════════

const REEL_COUNT=5,VISIBLE_ROWS=3,STRIP_EXTRA=20,SYMBOL_H=90,BASE_SPIN_MS=900,STAGGER_MS=220;

const symbols={
  SEVEN:  {id:'SEVEN',  glyph:'7️⃣',weight:2, pay:{3:50,4:200,5:1000},label:'Seven'  },
  DIAMOND:{id:'DIAMOND',glyph:'💎',weight:4, pay:{3:20,4:80, 5:400 },label:'Diamond'},
  CROWN:  {id:'CROWN',  glyph:'👑',weight:6, pay:{3:12,4:40, 5:200 },label:'Crown'  },
  BELL:   {id:'BELL',   glyph:'🔔',weight:10,pay:{3:8, 4:20, 5:100 },label:'Bell'   },
  STAR:   {id:'STAR',   glyph:'⭐',weight:12,pay:{3:5, 4:15, 5:60  },label:'Star'   },
  CLOVER: {id:'CLOVER', glyph:'🍀',weight:14,pay:{3:4, 4:10, 5:40  },label:'Clover' },
  BOLT:   {id:'BOLT',   glyph:'⚡',weight:15,pay:{3:3, 4:8,  5:25  },label:'Bolt'   },
  LEMON:  {id:'LEMON',  glyph:'🍋',weight:18,pay:{3:2, 4:5,  5:15  },label:'Lemon'  },
  WILD:   {id:'WILD',   glyph:'🌊',weight:3, pay:{3:25,4:100,5:500 },label:'Wild',  isWild:true   },
  SCATTER:{id:'SCATTER',glyph:'🐚',weight:3, pay:{3:0, 4:0,  5:0  },label:'Scatter',isScatter:true},
};
const SYMBOL_POOL=[];
Object.values(symbols).forEach(s=>{for(let i=0;i<s.weight;i++)SYMBOL_POOL.push(s.id);});

const PAYLINES=[
  {id:0,rows:[1,1,1,1,1],label:'Middle', color:'#00d4aa'},
  {id:1,rows:[0,0,0,0,0],label:'Top',    color:'#ffd166'},
  {id:2,rows:[2,2,2,2,2],label:'Bottom', color:'#ff6b6b'},
  {id:3,rows:[0,1,2,1,0],label:'V',      color:'#c77dff'},
  {id:4,rows:[2,1,0,1,2],label:'Arch',   color:'#4cc9f0'},
  {id:5,rows:[0,0,1,2,2],label:'Slope↓', color:'#f72585'},
  {id:6,rows:[2,2,1,0,0],label:'Slope↑', color:'#7bed9f'},
  {id:7,rows:[1,0,0,0,1],label:'Dip',    color:'#ffa502'},
  {id:8,rows:[1,2,2,2,1],label:'Bowl',   color:'#eccc68'},
];

let balance=0,bet=50,isSpinning=false,autoSpinOn=false,autoSpinLeft=0,autoSpinCount=10;
let freeSpinsLeft=0,autoTimer=null;
let grid=Array.from({length:REEL_COUNT},()=>['LEMON','LEMON','LEMON']);
let reelEls=[],reelSymbols=[];

function buildDeepReels(){
  const inner=document.getElementById('reelsInner');if(!inner)return;
  inner.innerHTML='';reelEls=[];reelSymbols=[];
  for(let c=0;c<REEL_COUNT;c++){
    const wrap=document.createElement('div');wrap.className='reel-wrap';wrap.id=`reelW${c}`;
    const strip=document.createElement('div');strip.className='reel-strip';strip.id=`dstrip${c}`;
    const total=STRIP_EXTRA+VISIBLE_ROWS,colSyms=[];
    for(let r=0;r<total;r++){const span=document.createElement('span');span.className='reel-symbol';span.textContent=randomSymGlyph();strip.appendChild(span);if(r>=STRIP_EXTRA)colSyms.push(span);}
    reelSymbols.push(colSyms);wrap.appendChild(strip);inner.appendChild(wrap);reelEls.push(strip);
  }
  resetStrips();
}
function resetStrips(){reelEls.forEach(s=>{s.style.transition='none';s.style.transform=`translateY(-${STRIP_EXTRA*SYMBOL_H}px)`;});}
function randomSymGlyph(){return symbols[SYMBOL_POOL[Math.floor(Math.random()*SYMBOL_POOL.length)]].glyph;}

function buildPaylineIndicators(){
  const L=document.getElementById('plLeft'),R=document.getElementById('plRight');if(!L||!R)return;
  L.innerHTML=R.innerHTML='';
  PAYLINES.forEach(pl=>[L,R].forEach(c=>{const d=document.createElement('div');d.className='pl-dot';d.id=`pldot-${pl.id}-${c===L?'l':'r'}`;d.textContent=pl.id+1;d.title=pl.label;d.style.borderColor=pl.color;c.appendChild(d);}));
}

function buildPaytableStrip(){
  const strip=document.getElementById('paytableStrip');if(!strip)return;
  strip.innerHTML='';
  Object.values(symbols).forEach(s=>{const item=document.createElement('div');item.className='pt-item';item.innerHTML=`<span class="pt-sym">${s.glyph}</span><span class="pt-mult">${s.pay[5]}×</span>`;item.title=`${s.label}: 3×=${s.pay[3]} 4×=${s.pay[4]} 5×=${s.pay[5]}`;strip.appendChild(item);});
}

function updateUI(){
  const bd=document.getElementById('balanceDisplay'),btd=document.getElementById('betDisplay');
  if(bd)bd.textContent=ucet.toLocaleString()+' Kč';if(btd)btd.textContent=bet+' Kč';
  const el=document.getElementById('ucetLabel');if(el)el.textContent=ucet.toLocaleString()+' Kč';
}
function setResultText(text,color='var(--text-bright)'){const el=document.getElementById('resultDisplay');if(!el)return;el.textContent=text;el.style.color=color;el.style.textShadow=color!=='var(--text-bright)'?`0 0 14px ${color}`:'none';}
function setWinDisplay(amount){const el=document.getElementById('winDisplay');if(!el)return;el.textContent=amount>0?`+${amount.toLocaleString()} Kč`:'—';}
function setMarquee(text){const el=document.getElementById('marqueeText');if(el)el.textContent=text;}
function setBet(amount){if(isSpinning)return;bet=amount;document.querySelectorAll('#sectionDeepReels .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===amount));updateUI();}
function setMaxBet(){setBet(1000);}
function setAutoCount(n){autoSpinCount=n;}

function toggleAuto(){
  if(isSpinning)return; autoSpinOn=!autoSpinOn;
  document.getElementById('autoBtn')?.classList.toggle('on',autoSpinOn);
  if(autoSpinOn){autoSpinLeft=autoSpinCount;startSpin();}else{autoSpinLeft=0;clearTimeout(autoTimer);}
}

function startSpin(){
  if(isSpinning||!rateLimitOk())return;
  if(!checkDailyLossLimit()&&bet>0){setResultText('Daily loss limit reached!','var(--coral)');autoSpinOn=false;document.getElementById('autoBtn')?.classList.remove('on');return;}
  const cost=freeSpinsLeft>0?0:bet;
  if(cost>0&&ucet<cost){setResultText('Not enough balance!','var(--coral)');autoSpinOn=false;document.getElementById('autoBtn')?.classList.remove('on');return;}
  if(cost>0){addWager(cost,'deepReels');ucet-=cost;renderBalanceUI();}
  else if(freeSpinsLeft>0){freeSpinsLeft--;updateFreeSpinsBanner();}
  setWinDisplay(0);updateUI();clearPaylineHighlights();setResultText('');
  isSpinning=true;playSFX('spin');
  const sb=document.getElementById('deepSpinBtn');if(sb){sb.disabled=true;sb.classList.add('spinning');}
  const outcome=Array.from({length:REEL_COUNT},()=>Array.from({length:VISIBLE_ROWS},()=>SYMBOL_POOL[Math.floor(Math.random()*SYMBOL_POOL.length)]));
  animateReels(outcome,()=>{
    grid=outcome;updateVisibleSymbols();
    const {totalWin,winLines,scatterCount}=evaluate(outcome);
    const finalWin=totalWin>0?Math.floor(totalWin*getVipMult()):0;
    if(finalWin>0){updateBalance(finalWin,'deepReels',true);setWinDisplay(finalWin);submitLeaderboardEntry(finalWin,'Deep Reels');}
    else updateBalance(0,'deepReels',false);
    updateUI();handleDeepResults(finalWin,winLines,scatterCount);
    isSpinning=false;if(sb){sb.disabled=false;sb.classList.remove('spinning');}
    if(autoSpinOn&&autoSpinLeft>0){autoSpinLeft--;if(autoSpinLeft===0){autoSpinOn=false;document.getElementById('autoBtn')?.classList.remove('on');}else autoTimer=setTimeout(startSpin,900);}
    if(freeSpinsLeft>0&&!autoSpinOn)autoTimer=setTimeout(startSpin,1100);
    if(freeSpinsLeft===0){const b=document.getElementById('freeSpinsBanner');if(b&&!b.classList.contains('hidden')){b.classList.add('hidden');setMarquee('◈ ABYSSAL DEEP REELS ◈ SPIN TO WIN ◈');}}
  });
}

function animateReels(outcome,onComplete){
  let done=0;
  for(let c=0;c<REEL_COUNT;c++){
    const strip=reelEls[c],dur=BASE_SPIN_MS+c*STAGGER_MS+300;
    strip.style.transition='none';strip.style.transform='translateY(0px)';
    const cells=strip.querySelectorAll('.reel-symbol');
    cells.forEach((cell,idx)=>{if(idx<STRIP_EXTRA){cell.textContent=randomSymGlyph();cell.className='reel-symbol';}else{cell.textContent=symbols[outcome[c][idx-STRIP_EXTRA]].glyph;cell.className='reel-symbol';}});
    void strip.offsetWidth;
    strip.style.transition=`transform ${dur}ms cubic-bezier(0.06,0.95,0.28,1.02)`;
    strip.style.transform=`translateY(${-(STRIP_EXTRA*SYMBOL_H)}px)`;
    setTimeout(()=>{strip.style.transition='none';strip.style.transform=`translateY(${-(STRIP_EXTRA*SYMBOL_H)}px)`;if(++done===REEL_COUNT)onComplete();},c*STAGGER_MS+dur+20);
  }
}

function updateVisibleSymbols(){
  for(let c=0;c<REEL_COUNT;c++){const strip=reelEls[c];const cells=strip.querySelectorAll('.reel-symbol');grid[c].forEach((sid,r)=>{const cell=cells[STRIP_EXTRA+r];if(cell){cell.textContent=symbols[sid].glyph;cell.className='reel-symbol';}});}
}

function evaluate(outcome){
  let totalWin=0;const winLines=[];let scatterCount=0;
  outcome.forEach(col=>col.forEach(s=>{if(symbols[s]?.isScatter)scatterCount++;}));
  PAYLINES.forEach(pl=>{
    const line=pl.rows.map((row,col)=>outcome[col][row]);
    let base=null;for(let i=0;i<line.length;i++){if(!symbols[line[i]]?.isWild&&!symbols[line[i]]?.isScatter){base=line[i];break;}}
    if(!base)return;
    let count=0;for(let i=0;i<line.length;i++){if(line[i]===base||symbols[line[i]]?.isWild)count++;else break;}
    if(count>=3){const payout=(symbols[base]?.pay[count]||0)*bet;if(payout>0){totalWin+=payout;winLines.push({payline:pl,matches:count,symbol:symbols[base],payout});}}
  });
  return{totalWin,winLines,scatterCount};
}

function handleDeepResults(totalWin,winLines,scatterCount){
  clearPaylineHighlights();dimAllSymbols();
  if(winLines.length>0){
    const isJP=winLines.some(w=>w.matches===5&&w.symbol.id==='SEVEN');
    winLines.forEach((wl,i)=>setTimeout(()=>highlightPayline(wl),i*250));
    if(isJP){setTimeout(triggerJackpotEffect,600);setResultText('🔱 JACKPOT! 🔱','var(--gold)');setMarquee('🔱 JACKPOT! 🔱 JACKPOT! 🔱');setTimeout(()=>setMarquee('◈ ABYSSAL DEEP REELS ◈ SPIN TO WIN ◈'),4000);flagAchievement('jackpot');}
    else if(totalWin>=bet*20)setResultText(`⭐ BIG WIN! +${totalWin.toLocaleString()} Kč`,'var(--gold)');
    else setResultText(`✨ WIN! +${totalWin.toLocaleString()} Kč`,'var(--teal)');
    winFlash();playSFX(totalWin>=bet*20?'jackpot':'win');
  }else{unDimAllSymbols();setResultText('No win this time','var(--text-dim)');playSFX('lose');}
  if(scatterCount>=3&&freeSpinsLeft===0){const free=scatterCount===3?8:scatterCount===4?12:18;freeSpinsLeft=free;setTimeout(()=>activateFreeSpins(free),1200);}
}

function highlightPayline(wl){
  ['l','r'].forEach(s=>{const d=document.getElementById(`pldot-${wl.payline.id}-${s}`);if(d){d.classList.add('lit');d.style.background=wl.payline.color+'30';}});
  for(let c=0;c<wl.matches;c++){const row=wl.payline.rows[c];const cells=reelEls[c]?.querySelectorAll('.reel-symbol');const cell=cells?.[STRIP_EXTRA+row];if(cell){cell.classList.remove('dim');cell.classList.add('glow','win-bounce');}}
}
function clearPaylineHighlights(){document.querySelectorAll('.pl-dot').forEach(d=>{d.classList.remove('lit');d.style.background='';});}
function dimAllSymbols(){reelEls.forEach(s=>s.querySelectorAll('.reel-symbol').forEach(c=>{c.classList.add('dim');c.classList.remove('glow','win-bounce');}));}
function unDimAllSymbols(){reelEls.forEach(s=>s.querySelectorAll('.reel-symbol').forEach(c=>c.classList.remove('dim','glow','win-bounce')));}

function activateFreeSpins(count){freeSpinsLeft=count;updateFreeSpinsBanner();setResultText(`🐚 FREE SPINS x${count} ACTIVATED!`,'#7fffd4');setMarquee(`◈ FREE SPINS — ${count} REMAINING ◈`);setTimeout(startSpin,1400);}
function updateFreeSpinsBanner(){const b=document.getElementById('freeSpinsBanner'),t=document.getElementById('freeSpinsText');if(!b)return;if(freeSpinsLeft>0){b.classList.remove('hidden');if(t)t.textContent=`FREE SPINS: ${freeSpinsLeft}`;}else b.classList.add('hidden');}

function openPaytable(){
  const modal=document.getElementById('paytableModal'),content=document.getElementById('modalPaytable');if(!modal||!content)return;
  content.innerHTML=Object.values(symbols).map(s=>`<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #0e4a72"><span style="font-size:1.8rem">${s.glyph}</span><span style="font-family:Cinzel;font-size:.75rem;color:#8abccc;flex:1">${s.label}${s.isWild?' (WILD)':s.isScatter?' (SCATTER)':''}</span><span style="font-family:Cinzel;font-size:.7rem;color:#00d4aa">3×:${s.pay[3]} 4×:${s.pay[4]} 5×:${s.pay[5]}</span></div>`).join('')+`<p style="margin-top:14px;font-size:.7rem;color:#4a7a90;text-align:center">🐚 Scatter ×3 → 8 Free Spins &nbsp;|&nbsp; ×4 → 12 &nbsp;|&nbsp; ×5 → 18</p>`;
  modal.classList.remove('hidden');
}

// ═══════════════════════════════════════════════
// SECTION 14: CRASH
// ═══════════════════════════════════════════════

let crashState='idle',crashBet=100,crashMult=1.00,crashTarget=0;
let crashCashedOut=false,crashHistory=[],crashAnimFrame=null,crashPoints=[];
let crashCanvas,crashCtx,crashW,crashH;

function initCrashCanvas(){
  crashCanvas=document.getElementById('crashCanvas');if(!crashCanvas)return;
  crashCtx=crashCanvas.getContext('2d');
  function resize(){crashW=crashCanvas.width=crashCanvas.clientWidth*devicePixelRatio;crashH=crashCanvas.height=crashCanvas.clientHeight*devicePixelRatio;crashCtx.scale(devicePixelRatio,devicePixelRatio);crashW=crashCanvas.clientWidth;crashH=crashCanvas.clientHeight;}
  resize();window.addEventListener('resize',resize);drawCrashIdle();
}
function drawCrashIdle(){if(!crashCtx||!crashW)return;crashCtx.clearRect(0,0,crashW,crashH);drawCrashGrid();}
function drawCrashGrid(){crashCtx.strokeStyle='#0e4a72';crashCtx.lineWidth=.5;crashCtx.setLineDash([4,6]);for(let i=1;i<5;i++){const y=(crashH/5)*i;crashCtx.beginPath();crashCtx.moveTo(0,y);crashCtx.lineTo(crashW,y);crashCtx.stroke();}crashCtx.setLineDash([]);}
function drawCrashFrame(pts){
  if(!crashCtx||!pts||pts.length<2)return;
  crashCtx.clearRect(0,0,crashW,crashH);drawCrashGrid();
  const grad=crashCtx.createLinearGradient(0,0,0,crashH);grad.addColorStop(0,'rgba(0,212,170,.25)');grad.addColorStop(1,'rgba(0,212,170,.01)');
  crashCtx.beginPath();crashCtx.moveTo(pts[0].x,crashH);pts.forEach(p=>crashCtx.lineTo(p.x,p.y));crashCtx.lineTo(pts[pts.length-1].x,crashH);crashCtx.closePath();crashCtx.fillStyle=grad;crashCtx.fill();
  crashCtx.beginPath();crashCtx.strokeStyle='#00d4aa';crashCtx.lineWidth=2.5;crashCtx.lineJoin='round';pts.forEach((p,i)=>i===0?crashCtx.moveTo(p.x,p.y):crashCtx.lineTo(p.x,p.y));crashCtx.stroke();
  const tip=pts[pts.length-1];crashCtx.beginPath();crashCtx.arc(tip.x,tip.y,5,0,Math.PI*2);crashCtx.fillStyle='#00ffcc';crashCtx.fill();
}
function generateCrashPoint(){const r=Math.random();if(r<.01)return 10+Math.random()*40;if(r<.05)return 5+Math.random()*5;if(r<.25)return 2+Math.random()*3;if(r<.55)return 1.2+Math.random()*.8;return 1.0+Math.random()*.2;}
function setCrashBet(amount){if(crashState!=='idle')return;crashBet=amount;document.querySelectorAll('#sectionCrash .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===amount));}
function changeCrashAuto(delta){const inp=document.getElementById('autoCashoutInput');if(!inp)return;inp.value=Math.max(1.1,Math.min(100,parseFloat((parseFloat(inp.value)+delta).toFixed(1))));}

function crashPlaceBet(){
  if(crashState!=='idle'||!rateLimitOk())return;
  if(!checkDailyLossLimit()){showAlert('Daily loss limit reached!','🛡️');return;}
  if(ucet<crashBet){showAlert('Not enough gold!','💸');return;}
  addWager(crashBet,'crash');ucet-=crashBet;renderBalanceUI();
  crashState='running';crashMult=1.00;crashCashedOut=false;crashTarget=generateCrashPoint();crashPoints=[];
  const mEl=document.getElementById('crashMultiplier'),sEl=document.getElementById('crashStatus'),bbBtn=document.getElementById('crashBetBtn'),coBtn=document.getElementById('crashCashoutBtn');
  if(mEl){mEl.className='crash-multiplier';mEl.textContent='1.00×';}if(sEl)sEl.textContent=`Bet: ${crashBet} Kč — Flying!`;if(bbBtn)bbBtn.disabled=true;if(coBtn)coBtn.disabled=false;
  playSFX('spin');
  const W=crashCanvas?.clientWidth||600,H=crashCanvas?.clientHeight||260,t0=performance.now();
  function tick(now){
    const elapsed=(now-t0)/1000;
    crashMult=Math.max(1.0,Math.pow(Math.E,elapsed*0.35));
    const autoCO=parseFloat(document.getElementById('autoCashoutInput')?.value||999);
    if(!crashCashedOut&&crashMult>=autoCO){crashCashout();return;}
    if(crashMult>=crashTarget){crashDoExplosion();return;}
    if(mEl){mEl.textContent=crashMult.toFixed(2)+'×';crashMult>=5?mEl.classList.add('hot'):mEl.classList.remove('hot');}
    const t=Math.min(elapsed/8,1),x=t*W,yFrac=1-((crashMult-1)/Math.max(crashTarget,3)),y=Math.max(20,yFrac*(H-30));
    crashPoints.push({x,y});drawCrashFrame(crashPoints);
    crashAnimFrame=requestAnimationFrame(tick);
  }
  crashAnimFrame=requestAnimationFrame(tick);
}

function crashCashout(){
  if(crashState!=='running'||crashCashedOut)return;
  crashCashedOut=true;
  const win=Math.floor(crashBet*crashMult*getVipMult());
  updateBalance(win,'crash',true);
  const mEl=document.getElementById('crashMultiplier'),sEl=document.getElementById('crashStatus'),coBtn=document.getElementById('crashCashoutBtn');
  if(mEl)mEl.style.color='var(--gold)';if(sEl)sEl.textContent=`Cashed ${crashMult.toFixed(2)}× → +${win} Kč`;if(coBtn)coBtn.disabled=true;
  winFlash();playSFX('win');submitLeaderboardEntry(win,'Crash');
  showAlert(`💰 CASHED OUT!\n${crashMult.toFixed(2)}× → +${win} Kč`,'🚀');
  if(crashMult>=5)flagAchievement('crash_5x');
  crashHistory.unshift({mult:crashMult,win:true});crashStop();
}

function crashDoExplosion(){
  if(crashCashedOut){crashStop();return;}
  const mEl=document.getElementById('crashMultiplier'),sEl=document.getElementById('crashStatus'),bbBtn=document.getElementById('crashBetBtn'),coBtn=document.getElementById('crashCashoutBtn');
  if(mEl){mEl.className='crash-multiplier crashed';mEl.textContent='💥 CRASHED';}if(sEl)sEl.textContent=`Crashed ${crashTarget.toFixed(2)}× — Lost ${crashBet} Kč`;if(coBtn)coBtn.disabled=true;if(bbBtn)bbBtn.disabled=false;
  updateBalance(0,'crash',false);winFlash(true);playSFX('crash');
  showAlert(`💥 CRASHED!\nAt ${crashTarget.toFixed(2)}× — −${crashBet} Kč`,'💥');
  crashHistory.unshift({mult:crashTarget,win:false});crashState='idle';updateCrashHistory();setTimeout(resetCrashUI,1500);
}

function crashStop(){if(crashAnimFrame){cancelAnimationFrame(crashAnimFrame);crashAnimFrame=null;}crashState='idle';updateCrashHistory();setTimeout(resetCrashUI,800);}
function resetCrashUI(){const bbBtn=document.getElementById('crashBetBtn'),coBtn=document.getElementById('crashCashoutBtn'),mEl=document.getElementById('crashMultiplier'),sEl=document.getElementById('crashStatus');if(bbBtn)bbBtn.disabled=false;if(coBtn)coBtn.disabled=true;if(mEl){mEl.className='crash-multiplier';mEl.textContent='1.00×';}if(sEl)sEl.textContent='Place your bet';drawCrashIdle();}

function updateCrashHistory(){
  const c=document.getElementById('crashHistory');if(!c)return;
  c.innerHTML='<span class="ch-label">HISTORY:</span>';
  crashHistory.slice(0,12).forEach(h=>{const b=document.createElement('span');b.className='ch-bubble '+(h.mult>=5?'high':h.mult>=2?'mid':'low');b.textContent=h.mult.toFixed(2)+'×';c.appendChild(b);});
}

// ═══════════════════════════════════════════════
// SECTION 15: ROULETTE
// ═══════════════════════════════════════════════

const ROULETTE_NUMBERS=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const ROULETTE_REDS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
let rouletteBet=50,rouletteSelected=null,rouletteSpinning=false;
let rouletteCanvas,rouletteCtx;
let rouletteNumberHistory=[];

function setRouletteBet(amount){rouletteBet=amount;document.getElementById('rouletteBetAmt').textContent=amount;document.querySelectorAll('#sectionRoulette .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===amount));}

function buildRouletteBettingGrid(){
  const grid=document.getElementById('rouletteBettingGrid');if(!grid)return;
  const c=n=>n===0?'green':ROULETTE_REDS.has(n)?'red':'black';
  const nc=n=>n===0?'green-n':ROULETTE_REDS.has(n)?'red':'black-num';
  grid.innerHTML=`<div class="rb-section-title">OUTSIDE BETS</div>
  <div class="rb-row">
    <button class="rb-btn red" data-bet='{"type":"outside","value":"red","label":"Red","payout":2}'>🔴 RED</button>
    <button class="rb-btn" data-bet='{"type":"outside","value":"black","label":"Black","payout":2}'>⚫ BLACK</button>
    <button class="rb-btn" data-bet='{"type":"outside","value":"even","label":"Even","payout":2}'>EVEN</button>
    <button class="rb-btn" data-bet='{"type":"outside","value":"odd","label":"Odd","payout":2}'>ODD</button>
  </div>
  <div class="rb-row">
    <button class="rb-btn" data-bet='{"type":"outside","value":"low","label":"1-18","payout":2}'>1–18</button>
    <button class="rb-btn" data-bet='{"type":"outside","value":"high","label":"19-36","payout":2}'>19–36</button>
    <button class="rb-btn" data-bet='{"type":"outside","value":"dozen1","label":"1st 12","payout":3}'>1st 12</button>
    <button class="rb-btn" data-bet='{"type":"outside","value":"dozen2","label":"2nd 12","payout":3}'>2nd 12</button>
    <button class="rb-btn" data-bet='{"type":"outside","value":"dozen3","label":"3rd 12","payout":3}'>3rd 12</button>
  </div>
  <div class="rb-section-title">STRAIGHT UP (35×)</div>
  <div class="rb-row" style="flex-wrap:wrap;gap:3px">
    <button class="rb-btn green-n" data-bet='{"type":"straight","value":0,"label":"0","payout":36}' style="min-width:28px;padding:5px 7px">0</button>
    ${Array.from({length:36},(_,i)=>i+1).map(n=>`<button class="rb-btn ${nc(n)}" data-bet='{"type":"straight","value":${n},"label":"${n}","payout":36}' style="min-width:28px;padding:5px 7px">${n}</button>`).join('')}
  </div>`;
  grid.querySelectorAll('.rb-btn').forEach(btn=>{
    btn.addEventListener('click',function(){
      document.querySelectorAll('.rb-btn').forEach(b=>b.classList.remove('selected'));
      this.classList.add('selected');
      rouletteSelected=JSON.parse(this.dataset.bet);
      document.getElementById('rouletteBetOn').textContent=rouletteSelected.label;
    });
  });
  initRouletteCanvas();
}

function initRouletteCanvas(){
  rouletteCanvas=document.getElementById('rouletteCanvas');if(!rouletteCanvas)return;
  rouletteCtx=rouletteCanvas.getContext('2d');
  drawRouletteWheel(-1);
}

function drawRouletteWheel(highlightNum){
  if(!rouletteCtx)return;
  const ctx=rouletteCtx,W=260,H=260,cx=130,cy=130,r=120,n=ROULETTE_NUMBERS.length,seg=(Math.PI*2)/n;
  ctx.clearRect(0,0,W,H);
  ROULETTE_NUMBERS.forEach((num,i)=>{
    const a=i*seg-Math.PI/2;
    const color=num===0?'#006b3c':ROULETTE_REDS.has(num)?'#c0392b':'#1a1a1a';
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,a,a+seg);ctx.closePath();
    ctx.fillStyle=num===highlightNum?'#ffd166':color;ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.15)';ctx.lineWidth=.5;ctx.stroke();
    ctx.save();ctx.translate(cx,cy);ctx.rotate(a+seg/2);ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font='bold 9px Cinzel';ctx.fillText(num.toString(),r-4,4);ctx.restore();
  });
  ctx.beginPath();ctx.arc(cx,cy,80,0,Math.PI*2);const g=ctx.createRadialGradient(cx,cy,0,cx,cy,80);g.addColorStop(0,'#021627');g.addColorStop(1,'#063050');ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='#0d7fbf';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#00d4aa';ctx.font='bold 16px Cinzel';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('🐚',cx,cy);
}

function spinRoulette(){
  if(rouletteSpinning||!rateLimitOk())return;
  if(!rouletteSelected){showAlert('Choose a bet first!','⚠️');return;}
  if(!checkDailyLossLimit()){showAlert('Daily loss limit reached!','🛡️');return;}
  if(ucet<rouletteBet){showAlert('Not enough gold!','💸');return;}
  addWager(rouletteBet,'roulette');ucet-=rouletteBet;renderBalanceUI();
  rouletteSpinning=true;
  const btn=document.getElementById('rouletteSpinBtn');if(btn)btn.disabled=true;
  playSFX('spin');
  const resultNum=ROULETTE_NUMBERS[Math.floor(Math.random()*ROULETTE_NUMBERS.length)];
  const resultIdx=ROULETTE_NUMBERS.indexOf(resultNum);
  let frame=0,totalFrames=90;
  function animate(){
    const idx=(resultIdx+Math.floor((totalFrames-frame)*1.5))%ROULETTE_NUMBERS.length;
    drawRouletteWheel(ROULETTE_NUMBERS[idx]);frame++;
    if(frame<totalFrames)requestAnimationFrame(animate);
    else{drawRouletteWheel(resultNum);resolveRoulette(resultNum);rouletteSpinning=false;if(btn)btn.disabled=false;}
  }
  requestAnimationFrame(animate);
}

function resolveRoulette(num){
  const color=num===0?'green':ROULETTE_REDS.has(num)?'red':'black';
  const{type,value,payout}=rouletteSelected;
  let won=false;
  if(type==='straight')won=num===value;
  else if(value==='red')won=color==='red';else if(value==='black')won=color==='black';
  else if(value==='even')won=num!==0&&num%2===0;else if(value==='odd')won=num%2===1;
  else if(value==='low')won=num>=1&&num<=18;else if(value==='high')won=num>=19&&num<=36;
  else if(value==='dozen1')won=num>=1&&num<=12;else if(value==='dozen2')won=num>=13&&num<=24;else if(value==='dozen3')won=num>=25&&num<=36;
  const winAmt=won?Math.floor(rouletteBet*payout*getVipMult()):0;
  updateBalance(winAmt,'roulette',won);
  const el=document.getElementById('rouletteBall');
  if(el){el.textContent=num;el.style.color=color==='red'?'#ff6b6b':color==='green'?'#00d4aa':'#e0e0e0';}
  rouletteNumberHistory.push(num);
  addRouletteHistory(num,color);updateRouletteHotCold();
  if(won){winFlash();playSFX('win');submitLeaderboardEntry(winAmt,'Roulette');showAlert(`🎉 ${num} ${color.toUpperCase()}!\nWon ${winAmt} Kč!`,'🎡');}
  else{winFlash(true);playSFX('lose');showAlert(`${num} ${color.toUpperCase()}\nNo win this time`,'🎡');}
}

function addRouletteHistory(num,color){
  const hist=document.getElementById('rouletteHistory');if(!hist)return;
  const div=document.createElement('div');div.className=`rh-num ${color}`;div.textContent=num;
  hist.insertBefore(div,hist.firstChild);while(hist.children.length>12)hist.removeChild(hist.lastChild);
}

function updateRouletteHotCold(){
  const el=document.getElementById('rouletteHotCold');if(!el||rouletteNumberHistory.length<5)return;
  const freq={};rouletteNumberHistory.slice(-30).forEach(n=>{freq[n]=(freq[n]||0)+1;});
  const sorted=Object.entries(freq).sort((a,b)=>b[1]-a[1]);
  const hot=sorted.slice(0,3),cold=sorted.slice(-3);
  el.innerHTML=[...hot.map(([n])=>`<span class="rhc-num hot">${n}</span>`),...cold.map(([n])=>`<span class="rhc-num cold">${n}</span>`)].join('');
}

// ═══════════════════════════════════════════════
// SECTION 16: BLACKJACK
// ═══════════════════════════════════════════════

const SUITS=['♠','♥','♦','♣'],RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VALS={A:11,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:10,Q:10,K:10};
let bjDeck=[],bjPlayer=[],bjDealer=[],bjBet=100,bjInProgress=false;

function setBjBet(amount){if(bjInProgress)return;bjBet=amount;document.querySelectorAll('#sectionBlackjack .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===amount));}
function makeDeck(){const d=[];for(const s of SUITS)for(const r of RANKS)d.push({rank:r,suit:s});for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
function drawCard(deck){return deck.pop();}
function handValue(hand){let val=0,aces=0;hand.forEach(c=>{val+=RANK_VALS[c.rank];if(c.rank==='A')aces++;});while(val>21&&aces>0){val-=10;aces--;}return val;}

function bjDeal(){
  if(bjInProgress||!rateLimitOk())return;
  if(!checkDailyLossLimit()){showAlert('Daily loss limit reached!','🛡️');return;}
  if(ucet<bjBet){showAlert('Not enough gold!','💸');return;}
  addWager(bjBet,'blackjack');ucet-=bjBet;renderBalanceUI();
  bjDeck=makeDeck();bjPlayer=[];bjDealer=[];
  bjPlayer=[drawCard(bjDeck),drawCard(bjDeck)];bjDealer=[drawCard(bjDeck),drawCard(bjDeck)];
  bjInProgress=true;
  ['bjHitBtn','bjStandBtn','bjDoubleBtn'].forEach(id=>document.getElementById(id).disabled=false);
  document.getElementById('bjDealBtn').disabled=true;
  renderBjHands(true);
  document.getElementById('bjStatus').textContent='Your turn — Hit or Stand?';
  playSFX('card');
  if(handValue(bjPlayer)===21)bjStand();
}

function renderBjHands(hideDealer=false){
  const dh=document.getElementById('dealerHand'),ph=document.getElementById('playerHand');
  if(dh){dh.innerHTML='';bjDealer.forEach((c,i)=>dh.appendChild(makeCardEl(c,hideDealer&&i===1)));}
  if(ph){ph.innerHTML='';bjPlayer.forEach(c=>ph.appendChild(makeCardEl(c)));}
  document.getElementById('playerScore').textContent=handValue(bjPlayer);
  document.getElementById('dealerScore').textContent=hideDealer?'?':handValue(bjDealer);
}

function makeCardEl(card,faceDown=false){
  const el=document.createElement('div');
  if(faceDown){el.className='bj-card-el face-down';el.innerHTML='🂠';return el;}
  const isRed=card.suit==='♥'||card.suit==='♦';
  el.className=`bj-card-el ${isRed?'red':'black'}`;
  el.innerHTML=`<span class="card-rank">${card.rank}</span><span class="card-suit">${card.suit}</span>`;
  return el;
}

function bjHit(){if(!bjInProgress)return;bjPlayer.push(drawCard(bjDeck));renderBjHands(true);playSFX('card');if(handValue(bjPlayer)>21)bjResolve('bust');}
function bjStand(){
  if(!bjInProgress)return;
  ['bjHitBtn','bjStandBtn','bjDoubleBtn'].forEach(id=>document.getElementById(id).disabled=true);
  while(handValue(bjDealer)<17)bjDealer.push(drawCard(bjDeck));
  renderBjHands(false);
  const pv=handValue(bjPlayer),dv=handValue(bjDealer);
  if(dv>21||pv>dv)bjResolve('win');else if(pv===dv)bjResolve('push');else bjResolve('lose');
}
function bjDouble(){
  if(!bjInProgress||ucet<bjBet)return;
  addWager(bjBet,'blackjack');ucet-=bjBet;renderBalanceUI();bjBet*=2;
  bjPlayer.push(drawCard(bjDeck));renderBjHands(true);playSFX('card');
  if(handValue(bjPlayer)>21)bjResolve('bust');else bjStand();
}
function bjResolve(outcome){
  bjInProgress=false;
  ['bjHitBtn','bjStandBtn','bjDoubleBtn'].forEach(id=>document.getElementById(id).disabled=true);
  document.getElementById('bjDealBtn').disabled=false;
  renderBjHands(false);
  let msg='',won=false,win=0;
  if(outcome==='bust'){msg=`Bust! ${handValue(bjPlayer)} — Lost ${bjBet} Kč`;}
  else if(outcome==='win'){win=bjBet*2;won=true;msg=`You win! +${win} Kč`;flagAchievement('survivor');}
  else if(outcome==='push'){win=bjBet;msg='Push — bet returned';}
  else{msg=`Dealer wins — Lost ${bjBet} Kč`;}
  updateBalance(win,'blackjack',won);
  document.getElementById('bjStatus').textContent=msg;
  if(won){winFlash();playSFX('win');submitLeaderboardEntry(win,'Blackjack');showAlert(msg,'🃏');}
  else if(outcome==='push')showAlert(msg,'🤝');
  else{winFlash(true);playSFX('lose');showAlert(msg,'🃏');}
  bjBet=100;
}

// ═══════════════════════════════════════════════
// SECTION 17: COINFLIP
// ═══════════════════════════════════════════════

let cfBet=100,cfSide='heads',cfFlipping=false;

function setCfSide(side){cfSide=side;document.getElementById('cfHeads').classList.toggle('active',side==='heads');document.getElementById('cfTails').classList.toggle('active',side==='tails');}
function setCfBet(amount){cfBet=amount;document.querySelectorAll('#sectionCoinflip .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===amount));}

function doFlip(){
  if(cfFlipping||!rateLimitOk())return;
  if(!checkDailyLossLimit()){showAlert('Daily loss limit reached!','🛡️');return;}
  if(ucet<cfBet){showAlert('Not enough gold!','💸');return;}
  addWager(cfBet,'coinflip');ucet-=cfBet;renderBalanceUI();
  cfFlipping=true;const btn=document.getElementById('cfFlipBtn');if(btn)btn.disabled=true;
  document.getElementById('cfResult').textContent='';
  playSFX('coin');
  const result=Math.random()<.5?'heads':'tails',won=result===cfSide;
  const targetDeg=result==='heads'?1800:1980;
  const coin=document.getElementById('coin');
  coin.style.setProperty('--flip-target',targetDeg+'deg');
  coin.style.animation='none';void coin.offsetWidth;
  coin.style.animation='coin-flip 1.2s cubic-bezier(.4,0,.2,1) forwards';
  setTimeout(()=>{
    const win=won?Math.floor(cfBet*1.9*getVipMult()):0;
    updateBalance(win,'coinflip',won);
    // Track heads/tails
    if(result==='heads')currentUser.cfHeads=(currentUser.cfHeads||0)+1;else currentUser.cfTails=(currentUser.cfTails||0)+1;
    const hc=document.getElementById('cfHeadCount'),tc=document.getElementById('cfTailCount');
    if(hc)hc.textContent=currentUser.cfHeads||0;if(tc)tc.textContent=currentUser.cfTails||0;
    const res=document.getElementById('cfResult');
    const resultLabel=result==='heads'?'🐚 SHELL':'⚓ ANCHOR';
    if(won){if(res){res.textContent=`${resultLabel}! +${win} Kč`;res.style.color='var(--gold)';}winFlash();playSFX('win');submitLeaderboardEntry(win,'Coinflip');}
    else{if(res){res.textContent=`${resultLabel} — Lost ${cfBet} Kč`;res.style.color='var(--coral)';}winFlash(true);playSFX('lose');}
    showAlert(won?`${resultLabel}!\n+${win} Kč`:`${resultLabel}\n−${cfBet} Kč`,won?'🪙':'💸');
    cfFlipping=false;if(btn)btn.disabled=false;
  },1350);
}

// ═══════════════════════════════════════════════
// SECTION 18: VIDEO POKER
// ═══════════════════════════════════════════════

const POKER_PAYS=[
  {name:'Royal Flush',    pay:800,test:h=>isRoyalFlush(h)},
  {name:'Straight Flush', pay:50, test:h=>isStraightFlush(h)},
  {name:'Four of a Kind', pay:25, test:h=>hasSameRank(h,4)},
  {name:'Full House',     pay:9,  test:h=>isFullHouse(h)},
  {name:'Flush',          pay:6,  test:h=>isFlush(h)},
  {name:'Straight',       pay:4,  test:h=>isStraight(h)},
  {name:'Three of a Kind',pay:3,  test:h=>hasSameRank(h,3)},
  {name:'Two Pair',       pay:2,  test:h=>isTwoPair(h)},
  {name:'Jacks or Better',pay:1,  test:h=>isJacksOrBetter(h)},
];
let pokerDeck=[],pokerHand=[],pokerHeld=[],pokerBet=100,pokerPhase='bet';

function setPokerBet(amount){if(pokerPhase!=='bet')return;pokerBet=amount;document.querySelectorAll('#sectionPoker .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===amount));}
function buildPokerPaytable(){const el=document.getElementById('pokerPaytableMini');if(!el)return;el.innerHTML=POKER_PAYS.map(p=>`<span class="pp-row" id="pp_${p.name.replace(/\s/g,'_')}">${p.name} <b>${p.pay}×</b></span>`).join('');}

function pokerDeal(){
  if(pokerPhase!=='bet'||!rateLimitOk())return;
  if(!checkDailyLossLimit()){showAlert('Daily loss limit reached!','🛡️');return;}
  if(ucet<pokerBet){showAlert('Not enough gold!','💸');return;}
  addWager(pokerBet,'poker');ucet-=pokerBet;renderBalanceUI();
  pokerDeck=makeDeck();pokerHand=[];pokerHeld=[];
  for(let i=0;i<5;i++)pokerHand.push(drawCard(pokerDeck));
  pokerPhase='hold';document.getElementById('pokerDealBtn').disabled=true;document.getElementById('pokerDrawBtn').disabled=false;
  document.getElementById('pokerHint').textContent='Select cards to HOLD, then click DRAW';
  renderPokerHand();document.getElementById('pokerHandName').textContent='';playSFX('card');
}

function pokerDraw(){
  if(pokerPhase!=='hold')return;
  pokerHand=pokerHand.map((c,i)=>pokerHeld.includes(i)?c:drawCard(pokerDeck));
  pokerPhase='bet';pokerHeld=[];renderPokerHand();
  document.getElementById('pokerDealBtn').disabled=false;document.getElementById('pokerDrawBtn').disabled=true;
  document.getElementById('pokerHint').textContent='Place your bet and deal';
  evaluatePokerHand();playSFX('card');
}

function renderPokerHand(){
  const el=document.getElementById('pokerHand');if(!el)return;el.innerHTML='';
  pokerHand.forEach((c,i)=>{
    const div=document.createElement('div');const isRed=c.suit==='♥'||c.suit==='♦';
    div.className=`poker-card-el ${isRed?'red':'black'}${pokerHeld.includes(i)?' held':''}`;
    div.innerHTML=`<span class="card-rank">${c.rank}</span><span class="card-suit-big">${c.suit}</span>`;
    if(pokerPhase==='hold')div.onclick=()=>togglePokerHold(i);
    el.appendChild(div);
  });
}

function togglePokerHold(i){if(pokerPhase!=='hold')return;const idx=pokerHeld.indexOf(i);if(idx>=0)pokerHeld.splice(idx,1);else pokerHeld.push(i);renderPokerHand();}

function evaluatePokerHand(){
  for(const p of POKER_PAYS){
    if(p.test(pokerHand)){
      const win=Math.floor(pokerBet*p.pay*getVipMult());
      updateBalance(win,'poker',true);submitLeaderboardEntry(win,'Poker');
      document.getElementById('pokerHandName').textContent=p.name;
      document.getElementById('pokerHandName').style.color='var(--gold)';
      document.querySelectorAll('.pp-row').forEach(r=>r.classList.remove('active'));
      document.getElementById(`pp_${p.name.replace(/\s/g,'_')}`)?.classList.add('active');
      winFlash();playSFX(win>=pokerBet*25?'jackpot':'win');
      showAlert(`${p.name}!\n+${win} Kč`,'♠️');
      if(p.name==='Full House')flagAchievement('full_house');
      return;
    }
  }
  updateBalance(0,'poker',false);
  document.getElementById('pokerHandName').textContent='No win — try again';
  document.getElementById('pokerHandName').style.color='var(--text-dim)';
  document.querySelectorAll('.pp-row').forEach(r=>r.classList.remove('active'));
  winFlash(true);playSFX('lose');
}

function ranks(h){return h.map(c=>RANKS.indexOf(c.rank)).sort((a,b)=>a-b);}
function isFlush(h){return new Set(h.map(c=>c.suit)).size===1;}
function isStraight(h){const r=ranks(h);if(r.join()===([0,1,2,3,12]).join())return true;return r[4]-r[0]===4&&new Set(r).size===5;}
function isStraightFlush(h){return isFlush(h)&&isStraight(h);}
function isRoyalFlush(h){return isFlush(h)&&ranks(h).join()===[8,9,10,11,12].join();}
function groupRanks(h){const c={};h.forEach(card=>{c[card.rank]=(c[card.rank]||0)+1;});return Object.values(c).sort((a,b)=>b-a);}
function hasSameRank(h,n){return groupRanks(h)[0]>=n;}
function isFullHouse(h){const g=groupRanks(h);return g[0]===3&&g[1]===2;}
function isTwoPair(h){const g=groupRanks(h);return g[0]===2&&g[1]===2;}
function isJacksOrBetter(h){const hi=['A','K','Q','J'];const c={};h.forEach(card=>{c[card.rank]=(c[card.rank]||0)+1;});return hi.some(r=>c[r]>=2);}

// ═══════════════════════════════════════════════
// SECTION 19: MINES
// ═══════════════════════════════════════════════

let minesBet=100,minesCount=5,minesActive=false;
let minesBoard=[],minesRevealed=0;
const MINES_GRID_SIZE=25;

function setMinesBet(n){minesBet=n;document.querySelectorAll('#sectionMines .ctrl-group:first-child .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===n));}
function setMinesCount(n){minesCount=n;document.querySelectorAll('#sectionMines .ctrl-group:last-of-type .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===n));}

function getMinesMult(revealed,bombs){
  const safe=MINES_GRID_SIZE-bombs;
  let mult=1;
  for(let i=0;i<revealed;i++){mult*=(safe-i)/(MINES_GRID_SIZE-i);}
  return Math.max(1,(1/mult)*0.97);
}

function buildMinesGrid(){
  const grid=document.getElementById('minesGrid');if(!grid)return;
  grid.innerHTML='';
  for(let i=0;i<MINES_GRID_SIZE;i++){
    const cell=document.createElement('div');cell.className='mine-cell';cell.dataset.idx=i;cell.textContent='';
    if(minesActive)cell.onclick=()=>revealMineCell(i);
    else cell.classList.add('inactive');
    grid.appendChild(cell);
  }
}

function startMines(){
  if(!rateLimitOk())return;
  if(!checkDailyLossLimit()){showAlert('Daily loss limit reached!','🛡️');return;}
  if(ucet<minesBet){showAlert('Not enough gold!','💸');return;}
  addWager(minesBet,'mines');ucet-=minesBet;renderBalanceUI();
  // Place mines
  minesBoard=Array(MINES_GRID_SIZE).fill('gem');
  let placed=0;while(placed<minesCount){const idx=Math.floor(Math.random()*MINES_GRID_SIZE);if(minesBoard[idx]==='gem'){minesBoard[idx]='bomb';placed++;}}
  minesRevealed=0;minesActive=true;
  document.getElementById('minesStartBtn').disabled=true;
  document.getElementById('minesCashoutBtn').disabled=false;
  document.getElementById('minesMultiplier').textContent='1.00×';
  document.getElementById('minesProfit').textContent='0 Kč';
  document.getElementById('minesGems').textContent='0';
  buildMinesGrid();
}

function revealMineCell(idx){
  if(!minesActive)return;
  const cells=document.querySelectorAll('.mine-cell');
  const cell=cells[idx];if(!cell||cell.classList.contains('revealed'))return;
  cell.classList.add('revealed');
  if(minesBoard[idx]==='bomb'){
    cell.textContent='💣';cell.classList.add('bomb');
    minesActive=false;
    // Show all bombs
    minesBoard.forEach((type,i)=>{if(type==='bomb'&&i!==idx){const c=cells[i];if(c){c.textContent='💣';c.classList.add('revealed','bomb');}}});
    document.getElementById('minesStartBtn').disabled=false;
    document.getElementById('minesCashoutBtn').disabled=true;
    updateBalance(0,'mines',false);winFlash(true);playSFX('lose');
    showAlert(`💥 BOMB! Lost ${minesBet} Kč`,'💣');
    cells.forEach(c=>c.onclick=null);
  }else{
    cell.textContent='💎';cell.classList.add('gem');minesRevealed++;
    const mult=getMinesMult(minesRevealed,minesCount);
    document.getElementById('minesMultiplier').textContent=mult.toFixed(2)+'×';
    document.getElementById('minesGems').textContent=minesRevealed;
    const profit=Math.floor(minesBet*mult)-minesBet;
    document.getElementById('minesProfit').textContent=(profit>=0?'+':'')+profit.toLocaleString()+' Kč';
    playSFX('win');
    if(minesRevealed===MINES_GRID_SIZE-minesCount){minesCashout();flagAchievement('mines_10');}// revealed all safe tiles
    if(minesRevealed>=10)flagAchievement('mines_10');
  }
}

function minesCashout(){
  if(!minesActive||minesRevealed===0)return;
  minesActive=false;
  const mult=getMinesMult(minesRevealed,minesCount);
  const win=Math.floor(minesBet*mult*getVipMult());
  updateBalance(win,'mines',true);winFlash();playSFX('win');
  submitLeaderboardEntry(win,'Mines');
  showAlert(`💎 CASHED OUT!\n${minesRevealed} gems × ${mult.toFixed(2)}\n+${win} Kč`,'💎');
  document.getElementById('minesStartBtn').disabled=false;
  document.getElementById('minesCashoutBtn').disabled=true;
  document.querySelectorAll('.mine-cell').forEach(c=>c.onclick=null);
  // Reveal all
  document.querySelectorAll('.mine-cell').forEach((c,i)=>{if(!c.classList.contains('revealed')&&minesBoard[i]==='bomb'){c.textContent='💣';c.classList.add('revealed','bomb');}});
}

// ═══════════════════════════════════════════════
// SECTION 20: PLINKO
// ═══════════════════════════════════════════════

let plinkoBet=100,plinkoRisk='low',plinkoDropping=false;
let plinkoCanvas,plinkoCtx;

const PLINKO_MULTS={
  low:   [1.5,1.2,1.1,1.0,0.5,1.0,1.1,1.2,1.5],
  medium:[3,  1.5,1.2,0.5,0.3,0.5,1.2,1.5,3  ],
  high:  [10, 3,  2,  0.5,0.2,0.5,2,  3,  10 ],
};

function setPlinkoBet(n){plinkoBet=n;document.querySelectorAll('#sectionPlinko .ctrl-group:first-child .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===n));}
function setPlinkoRisk(r){plinkoRisk=r;document.querySelectorAll('#sectionPlinko .ctrl-group:last-of-type .bet-btn').forEach(b=>b.classList.toggle('active',b.textContent.toLowerCase()===r));renderPlinkoMults();}

function renderPlinkoMults(){
  const el=document.getElementById('plinkoMultipliers');if(!el)return;
  const mults=PLINKO_MULTS[plinkoRisk];
  el.innerHTML=mults.map((m,i)=>`<div class="plinko-mult-slot" id="pmslot_${i}">${m}×</div>`).join('');
}

function initPlinko(){
  plinkoCanvas=document.getElementById('plinkoCanvas');if(!plinkoCanvas)return;
  plinkoCtx=plinkoCanvas.getContext('2d');
  renderPlinkoMults();drawPlinkoBoard();
}

function drawPlinkoBoard(){
  if(!plinkoCtx)return;
  const W=plinkoCanvas.width,H=plinkoCanvas.height;
  plinkoCtx.clearRect(0,0,W,H);
  const rows=8,pegR=5;
  for(let r=0;r<rows;r++){
    const pegsInRow=r+3,rowY=50+r*(H-100)/rows;
    const rowW=(pegsInRow-1)*40,startX=(W-rowW)/2;
    for(let p=0;p<pegsInRow;p++){
      const px=startX+p*40;
      plinkoCtx.beginPath();plinkoCtx.arc(px,rowY,pegR,0,Math.PI*2);
      plinkoCtx.fillStyle='rgba(0,212,170,0.6)';plinkoCtx.fill();
      plinkoCtx.strokeStyle='rgba(0,212,170,0.9)';plinkoCtx.lineWidth=1;plinkoCtx.stroke();
    }
  }
}

function plinkoDrop(){
  if(plinkoDropping||!rateLimitOk())return;
  if(!checkDailyLossLimit()){showAlert('Daily loss limit reached!','🛡️');return;}
  if(ucet<plinkoBet){showAlert('Not enough gold!','💸');return;}
  addWager(plinkoBet,'plinko');ucet-=plinkoBet;renderBalanceUI();
  plinkoDropping=true;document.getElementById('plinkoDropBtn').disabled=true;
  const W=plinkoCanvas.width,H=plinkoCanvas.height;
  const rows=8,slots=PLINKO_MULTS[plinkoRisk].length;
  const rowH=(H-100)/rows;
  // Simulate ball path
  let slot=Math.floor(slots/2);
  const path=[];
  let x=W/2,y=50;path.push({x,y});
  for(let r=0;r<rows;r++){
    if(Math.random()<0.5)slot=Math.max(0,slot-1);else slot=Math.min(slots-1,slot+1);
    const rowPegs=r+3,rowY=50+(r+1)*rowH,rowW=(rowPegs-1)*40,startX=(W-rowW)/2;
    const pegX=startX+Math.floor(slot*(rowPegs-1)/(slots-1))*40;
    path.push({x:pegX,y:rowY});
  }
  const slotW=W/slots;
  path.push({x:slot*slotW+slotW/2,y:H-30});
  // Animate ball
  let step=0,subStep=0;
  const SUBSTEPS=12;
  function animBall(){
    if(step>=path.length-1){
      plinkoDropping=false;document.getElementById('plinkoDropBtn').disabled=false;
      // Result
      const mult=PLINKO_MULTS[plinkoRisk][slot];
      const win=Math.floor(plinkoBet*mult*getVipMult());
      const slotEl=document.getElementById(`pmslot_${slot}`);
      if(slotEl){slotEl.classList.add('hit');setTimeout(()=>slotEl?.classList.remove('hit'),800);}
      const resEl=document.getElementById('plinkoResult');
      if(win>plinkoBet){updateBalance(win,'plinko',true);winFlash();playSFX('win');submitLeaderboardEntry(win,'Plinko');if(resEl){resEl.textContent=`${mult}× → +${win} Kč`;resEl.style.color='var(--teal)';}}
      else{updateBalance(win,'plinko',false);winFlash(true);playSFX('lose');if(resEl){resEl.textContent=`${mult}× → ${win>0?'+':''}${win-plinkoBet} Kč`;resEl.style.color='var(--coral)';}}
      showAlert(`⚪ PLINKO ${mult}×\n${win>=plinkoBet?'+':''}${(win-plinkoBet).toLocaleString()} Kč`,win>=plinkoBet?'🎉':'😔');
      drawPlinkoBoard();return;
    }
    const from=path[step],to=path[step+1];
    const t=subStep/SUBSTEPS,bx=from.x+(to.x-from.x)*t,by=from.y+(to.y-from.y)*t;
    drawPlinkoBoard();
    plinkoCtx.beginPath();plinkoCtx.arc(bx,by,10,0,Math.PI*2);
    plinkoCtx.fillStyle='#ffd166';plinkoCtx.fill();
    plinkoCtx.strokeStyle='#ff6b35';plinkoCtx.lineWidth=2;plinkoCtx.stroke();
    subStep++;if(subStep>SUBSTEPS){subStep=0;step++;}
    requestAnimationFrame(animBall);
  }
  requestAnimationFrame(animBall);
}

// ═══════════════════════════════════════════════
// SECTION 21: KENO
// ═══════════════════════════════════════════════

let kenoBet=100,kenoSelected=new Set(),kenoLocked=false;

const KENO_PAYS=[
  [0,0,0,1,2,4,7,15,30,60,100],  // 0-10 matches
];
// Simplified payout by matches
const KENO_PAYOUT={0:0,1:0,2:0,3:1,4:2,5:4,6:7,7:15,8:30,9:60,10:100};

function setKenoBet(n){kenoBet=n;document.querySelectorAll('#sectionKeno .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===n));}

function buildKenoGrid(){
  const grid=document.getElementById('kenoGrid');if(!grid)return;
  grid.innerHTML='';kenoSelected.clear();kenoLocked=false;updateKenoInfo();buildKenoPaytable();
  for(let i=1;i<=80;i++){
    const btn=document.createElement('div');btn.className='keno-btn-num';btn.id=`kn_${i}`;btn.textContent=i;
    btn.onclick=()=>toggleKenoNum(i);
    grid.appendChild(btn);
  }
}

function buildKenoPaytable(){
  const el=document.getElementById('kenoPaytable');if(!el)return;
  el.innerHTML=Object.entries(KENO_PAYOUT).map(([m,p])=>`<span class="kp-item" id="kp_${m}">${m} match: ${p}×</span>`).join('');
}

function toggleKenoNum(n){
  if(kenoLocked)return;
  const btn=document.getElementById(`kn_${n}`);if(!btn)return;
  if(kenoSelected.has(n)){kenoSelected.delete(n);btn.classList.remove('selected');}
  else if(kenoSelected.size<10){kenoSelected.add(n);btn.classList.add('selected');}
  updateKenoInfo();
}

function updateKenoInfo(){
  const el=document.getElementById('kenoSelected');if(el)el.textContent=kenoSelected.size;
}

function kenoClear(){kenoSelected.clear();kenoLocked=false;document.querySelectorAll('.keno-btn-num').forEach(b=>{b.classList.remove('selected','drawn','match','locked');});updateKenoInfo();}

function kenoQuickPick(){
  kenoClear();
  const nums=Array.from({length:80},(_,i)=>i+1);
  for(let i=nums.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[nums[i],nums[j]]=[nums[j],nums[i]];}
  nums.slice(0,10).forEach(n=>{kenoSelected.add(n);document.getElementById(`kn_${n}`)?.classList.add('selected');});
  updateKenoInfo();
}

function kenoPlay(){
  if(!rateLimitOk())return;
  if(kenoSelected.size<1){showAlert('Select at least 1 number!','⚠️');return;}
  if(!checkDailyLossLimit()){showAlert('Daily loss limit reached!','🛡️');return;}
  if(ucet<kenoBet){showAlert('Not enough gold!','💸');return;}
  addWager(kenoBet,'keno');ucet-=kenoBet;renderBalanceUI();
  kenoLocked=true;document.querySelectorAll('.keno-btn-num').forEach(b=>b.classList.add('locked'));
  // Draw 20 numbers
  const pool=Array.from({length:80},(_,i)=>i+1);
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const drawn=new Set(pool.slice(0,20));
  // Animate reveals
  let matches=0;const drawnArr=[...drawn];
  let i=0;
  function revealNext(){
    if(i>=drawnArr.length){
      // Finished
      setTimeout(()=>{
        const mult=KENO_PAYOUT[Math.min(matches,10)]||0;
        const win=Math.floor(kenoBet*mult*getVipMult());
        const matchEl=document.getElementById('kenoMatches');if(matchEl)matchEl.textContent=matches;
        document.querySelectorAll('.kp-item').forEach(e=>e.classList.remove('active'));
        document.getElementById(`kp_${Math.min(matches,10)}`)?.classList.add('active');
        const resEl=document.getElementById('kenoResult');
        if(win>0){updateBalance(win,'keno',true);winFlash();playSFX('win');submitLeaderboardEntry(win,'Keno');if(resEl){resEl.textContent=`${matches} matches → ${mult}× → +${win} Kč`;resEl.style.color='var(--teal)';}}
        else{updateBalance(0,'keno',false);winFlash(true);playSFX('lose');if(resEl){resEl.textContent=`${matches} matches — No win`;resEl.style.color='var(--coral)';}}
        showAlert(`🔢 KENO: ${matches} matches\n${win>0?'+'+win.toLocaleString()+' Kč':'No win'}`,win>0?'🎉':'😔');
        kenoLocked=false;
      },300);
      return;
    }
    const n=drawnArr[i++];
    const btn=document.getElementById(`kn_${n}`);
    if(btn){
      if(kenoSelected.has(n)){btn.classList.add('match');matches++;}else btn.classList.add('drawn');
    }
    const drawEl=document.getElementById('kenoDraw');if(drawEl)drawEl.textContent=[...drawn].slice(0,i).join(', ');
    setTimeout(revealNext,80);
  }
  revealNext();
  
}


// ═══════════════════════════════════════════════
// SECTION 22: LIVE CHAT
// ═══════════════════════════════════════════════

const CHAT_BOTS=[{name:'TideMaster',avatar:'🌊'},{name:'DeepDiver',avatar:'🤿'},{name:'PearlHunter',avatar:'🐚'},{name:'CoralKing',avatar:'🪸'},{name:'AbyssWalker',avatar:'🦑'}];
const BOT_MSGS=['Just hit 3× on Crash! 🚀','Anyone grinding Keno?','The daily reward is my lifeline 💰','Deep Reels paylines hitting today!','Plinko high risk is insane','Blackjack is my weakness 😅','Royal Flush first time ever!','Mines is genuinely terrifying','Slowly hitting ADMIRAL VIP 🔱','Is the jackpot going to pop today??','Coinflip streak of 5 wins 🪙','Roulette red has been on fire'];
let chatOpen=false;

function toggleChat(){chatOpen=!chatOpen;document.getElementById('chatPanel').classList.toggle('hidden',!chatOpen);if(chatOpen)scrollChat();}

function sendChat(){
  if(!currentUser)return;
  const inp=document.getElementById('chatInput');const msg=inp.value.trim();if(!msg)return;
  addChatMsg(currentUser.name,currentUser.avatar||'🐚',msg,false);inp.value='';
  setTimeout(()=>{const bot=CHAT_BOTS[Math.floor(Math.random()*CHAT_BOTS.length)];addChatMsg(bot.name,bot.avatar,BOT_MSGS[Math.floor(Math.random()*BOT_MSGS.length)],false);},1200+Math.random()*2000);
}

function addChatMsg(name,avatar,text,isWin=false){
  const el=document.getElementById('chatMessages');if(!el)return;
  const div=document.createElement('div');div.className='chat-msg';
  div.innerHTML=`<span class="chat-msg-avatar">${avatar}</span><div class="chat-msg-body"><div class="chat-msg-name">${name}</div><div class="chat-msg-text ${isWin?'win-msg':''}">${text}</div></div>`;
  el.appendChild(div);scrollChat();
  while(el.children.length>80)el.removeChild(el.firstChild);
}

function scrollChat(){const el=document.getElementById('chatMessages');if(el)el.scrollTop=el.scrollHeight;}

function startBotChat(){
  const addMsg=()=>{const bot=CHAT_BOTS[Math.floor(Math.random()*CHAT_BOTS.length)];addChatMsg(bot.name,bot.avatar,BOT_MSGS[Math.floor(Math.random()*BOT_MSGS.length)]);setTimeout(addMsg,8000+Math.random()*14000);};
  setTimeout(addMsg,4000);
  // Fake online count
  setInterval(()=>{const el=document.getElementById('chatOnline');if(el)el.textContent=`● ${Math.floor(8+Math.random()*20)} online`;},15000);
}

// ═══════════════════════════════════════════════
// SECTION 23: ADMIN PANEL
// ═══════════════════════════════════════════════

function openAdmin(){
  if(!currentUser?.isAdmin){showAlert('Access denied','🚫');return;}
  renderAdmin();openModal('adminModal');
}

function adminLog(type,text){const logs=DB.get('ac_adminLog',[]);logs.unshift({ts:Date.now(),type,text});DB.set('ac_adminLog',logs.slice(0,300));}

function renderAdmin(){
  const el=document.getElementById('adminContent');if(!el)return;
  const users=getUserDB(),logs=DB.get('ac_adminLog',[]);
  el.innerHTML=`
    <div class="admin-section"><h3>USER MANAGEMENT (${Object.keys(users).length} users)</h3>
      ${Object.values(users).map(u=>`<div class="admin-row"><span class="admin-label">${u.avatar||'🐚'} ${u.name} — ${(u.balance||0).toLocaleString()} Kč — ${getVipLevel(u).name}</span><button class="admin-btn" onclick="adminGiveGold('${u.name}',1000)">+1000</button><button class="admin-btn danger" onclick="adminBanUser('${u.name}')">BAN</button></div>`).join('')}
    </div>
    <div class="admin-section"><h3>RTP CONFIG (simulated)</h3>
      ${Object.entries(ADMIN_CONFIG.rtp).map(([game,rtp])=>`<div class="admin-row"><span class="admin-label">${game}</span><input class="admin-input" type="number" value="${(rtp*100).toFixed(1)}" min="50" max="100" step="0.5" onchange="ADMIN_CONFIG.rtp['${game}']=parseFloat(this.value)/100"/></div>`).join('')}
    </div>
    <div class="admin-section"><h3>BET LIMITS</h3>
      <div class="admin-row"><span class="admin-label">Min bet (Kč)</span><input class="admin-input" type="number" value="${ADMIN_CONFIG.betLimits.min}" onchange="ADMIN_CONFIG.betLimits.min=parseInt(this.value)"/></div>
      <div class="admin-row"><span class="admin-label">Max bet (Kč)</span><input class="admin-input" type="number" value="${ADMIN_CONFIG.betLimits.max}" onchange="ADMIN_CONFIG.betLimits.max=parseInt(this.value)"/></div>
    </div>
    <div class="admin-section"><h3>ACTIONS</h3>
      <div class="admin-row"><button class="admin-btn danger" onclick="if(confirm('Clear leaderboard?')){DB.set('${LB_KEY}',[]);showAlert('Cleared','✅');}">CLEAR LEADERBOARD</button><button class="admin-btn danger" onclick="if(confirm('Wipe all stats?')){Object.keys(getUserDB()).forEach(n=>{const db=getUserDB();db[n].gameStats=Object.fromEntries(Object.keys(db[n].gameStats).map(g=>[g,{w:0,l:0,pl:0}]));saveUserDB(db);});showAlert('Cleared','✅');}">WIPE ALL STATS</button></div>
    </div>
    <div class="admin-section"><h3>RTP SIMULATOR (Deep Reels)</h3>
      <div class="admin-row">
        <span class="admin-label">Spins</span>
        <select class="admin-input" id="simSpins" style="width:120px">
          <option value="10000">10,000</option>
          <option value="100000" selected>100,000</option>
          <option value="500000">500,000</option>
          <option value="1000000">1,000,000</option>
        </select>
        <span class="admin-label" style="margin-left:12px">Bet</span>
        <input class="admin-input" type="number" id="simBetAmt" value="100" min="1" max="10000" style="width:80px"/>
        <button class="admin-btn" id="simRunBtn" onclick="runRTPSim()" style="margin-left:8px">▶ RUN</button>
      </div>
      <div id="simProgress" style="height:4px;background:var(--border);border-radius:2px;margin:8px 0;display:none"><div id="simBar" style="height:100%;background:var(--teal);border-radius:2px;width:0%;transition:width .1s"></div></div>
      <div id="simOutput" style="font-family:var(--font-display);font-size:.65rem;letter-spacing:1px;color:var(--text-dim);margin-top:8px"></div>
    </div>
    <div class="admin-section"><h3>SYSTEM LOG (last 30)</h3>
      <div class="admin-log">${logs.slice(0,30).map(l=>`<div class="log-entry"><span class="log-time">${new Date(l.ts).toLocaleTimeString()}</span><span class="log-text">[${l.type}] ${l.text}</span></div>`).join('')||'No logs'}</div>
    </div>`;
}

function adminGiveGold(name,amount){const db=getUserDB();if(!db[name])return;db[name].balance=(db[name].balance||0)+amount;saveUserDB(db);if(currentUser&&currentUser.name===name){ucet+=amount;renderBalanceUI();}adminLog('GIVE_GOLD',`+${amount} to ${name}`);renderAdmin();}
function adminBanUser(name){if(name===currentUser?.name){showAlert('Cannot ban yourself!','⚠️');return;}const db=getUserDB();delete db[name];saveUserDB(db);adminLog('BAN',`Banned: ${name}`);renderAdmin();}

// ═══════════════════════════════════════════════
// SECTION 23b: RTP SIMULATOR
// ═══════════════════════════════════════════════

async function runRTPSim() {
  const spins   = parseInt(document.getElementById('simSpins')?.value||'100000');
  const betAmt  = Math.max(1, parseInt(document.getElementById('simBetAmt')?.value||'100'));
  const btn     = document.getElementById('simRunBtn');
  const output  = document.getElementById('simOutput');
  const prog    = document.getElementById('simProgress');
  const bar     = document.getElementById('simBar');
  if (!output) return;

  btn.disabled = true; btn.textContent = '⏳ Running…';
  prog.style.display = 'block'; bar.style.width = '0%';
  output.textContent = 'Starting simulation…';
  await new Promise(r => setTimeout(r, 20));

  // Build weighted pool
  const pool = [];
  Object.values(symbols).forEach(s => { for(let i=0;i<s.weight;i++) pool.push(s.id); });

  let totalWagered=0, totalPayout=0, wins=0, losses=0;
  let biggestWin=0, biggestLoss=0, scatterTriggers=0;
  let maxWinStreak=0, maxLoseStreak=0, curWin=0, curLose=0;
  const symHits={}, plWins={};

  const CHUNK = 50000;
  for (let i=0; i<spins; i+=CHUNK) {
    const end = Math.min(i+CHUNK, spins);
    for (let j=i; j<end; j++) {
      // Generate 5x3 grid
      const simGrid = Array.from({length:5}, () => Array.from({length:3}, () => pool[Math.floor(Math.random()*pool.length)]));

      // Count scatters
      let scatters=0;
      for(let c=0;c<5;c++) for(let r=0;r<3;r++) if(simGrid[c][r]==='SCATTER') scatters++;
      if(scatters>=3) scatterTriggers++;

      // Evaluate paylines
      let spinWin=0;
      PAYLINES.forEach(pl => {
        const row = pl.rows.map((r,c) => simGrid[c][r]);
        const first = row[0]==='WILD' ? (row.find(s=>s!=='WILD')||'WILD') : row[0];
        if(first==='SCATTER') return;
        let count=0;
        for(let k=0;k<row.length;k++) { if(row[k]===first||row[k]==='WILD') count++; else break; }
        if(count>=3) {
          const sym=symbols[first];
          const mult=sym?.pay?.[count]||0;
          if(mult>0) {
            spinWin += betAmt * mult;
            const key=`${sym.label} ${count}x`;
            symHits[key]=(symHits[key]||0)+1;
            plWins[pl.label]=(plWins[pl.label]||0)+1;
          }
        }
      });

      totalWagered += betAmt;
      totalPayout  += spinWin;
      const net = spinWin - betAmt;
      if(net>0) {
        wins++; if(net>biggestWin) biggestWin=net;
        curWin++; if(curLose>maxLoseStreak) maxLoseStreak=curLose; curLose=0;
      } else {
        losses++; if(Math.abs(net)>biggestLoss) biggestLoss=Math.abs(net);
        curLose++; if(curWin>maxWinStreak) maxWinStreak=curWin; curWin=0;
      }
    }
    bar.style.width = Math.round(((Math.min(i+CHUNK,spins))/spins)*100)+'%';
    await new Promise(r => setTimeout(r, 0));
  }
  if(curWin>maxWinStreak) maxWinStreak=curWin;
  if(curLose>maxLoseStreak) maxLoseStreak=curLose;

  const rtp       = (totalPayout/totalWagered*100).toFixed(2);
  const winRate   = (wins/spins*100).toFixed(2);
  const avgWin    = wins>0 ? (totalPayout/wins).toFixed(0) : 0;
  const houseEdge = (100 - parseFloat(rtp)).toFixed(2);

  // Top symbols
  const topSyms = Object.entries(symHits).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}: ${v.toLocaleString()} (${(v/spins*100).toFixed(2)}%)`).join(' | ');
  // Top paylines
  const topPL = Object.entries(plWins).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}: ${v.toLocaleString()}`).join(' | ');

  output.innerHTML = `
    <div style="color:var(--text-bright);margin-bottom:10px;font-size:.75rem">── RESULTS: ${spins.toLocaleString()} SPINS @ ${betAmt} Kč ──</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:10px">
      <span>RTP: <b style="color:var(--gold)">${rtp}%</b></span>
      <span>House edge: <b style="color:var(--coral)">${houseEdge}%</b></span>
      <span>Win rate: <b style="color:var(--teal)">${winRate}%</b></span>
      <span>Total wagered: <b>${(totalWagered).toLocaleString()} Kč</b></span>
      <span>Total payout: <b>${(totalPayout).toLocaleString()} Kč</b></span>
      <span>Net (house): <b style="color:${totalWagered-totalPayout>0?'var(--teal)':'var(--coral)'}">${(totalWagered-totalPayout).toLocaleString()} Kč</b></span>
      <span>Biggest win: <b style="color:var(--gold)">${biggestWin.toLocaleString()} Kč</b></span>
      <span>Biggest loss: <b style="color:var(--coral)">${biggestLoss.toLocaleString()} Kč</b></span>
      <span>Avg win payout: <b>${avgWin} Kč</b></span>
      <span>Scatter triggers: <b>${scatterTriggers.toLocaleString()}</b></span>
      <span>Max win streak: <b>${maxWinStreak}</b></span>
      <span>Max lose streak: <b>${maxLoseStreak}</b></span>
    </div>
    <div style="margin-bottom:6px"><b style="color:var(--text-bright)">Top combos:</b> ${topSyms||'none'}</div>
    <div><b style="color:var(--text-bright)">Payline wins:</b> ${topPL||'none'}</div>
  `;
  btn.disabled=false; btn.textContent='▶ RUN';
  adminLog('SIMULATOR',`${spins.toLocaleString()} spins → RTP ${rtp}%`);
}

// ═══════════════════════════════════════════════
// SECTION 24: HOTKEYS
// ═══════════════════════════════════════════════

function showHotkeys(){document.getElementById('hotkeysOverlay')?.classList.remove('hidden');}
function closeHotkeys(){document.getElementById('hotkeysOverlay')?.classList.add('hidden');}

document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  if(e.code==='Space'&&!popupOpen){e.preventDefault();if(activeGame==='slots')spin();else if(activeGame==='slots5')startSpin();else if(activeGame==='coinflip')doFlip();else if(activeGame==='plinko')plinkoDrop();else if(activeGame==='keno')kenoPlay();}
  if(e.key==='H'&&activeGame==='blackjack')bjHit();
  if(e.key==='S'&&activeGame==='blackjack')bjStand();
  if(e.key==='D'&&activeGame==='blackjack')bjDouble();
  if(e.key==='?')document.getElementById('hotkeysOverlay')?.classList.toggle('hidden');
  if(e.key==='Escape'){['paytableModal','leaderboardModal','profileModal','statsModal','historyModal','achievementsModal','rgModal','bonusWheelModal','adminModal'].forEach(id=>closeModal(id));closeHotkeys();}
  const games=['slots','slots5','crash','roulette','blackjack','coinflip','poker','mines','plinko'];
  if(e.key>='1'&&e.key<='9'&&!e.ctrlKey)switchGame(games[parseInt(e.key)-1]||'slots');
});

document.querySelectorAll('.modal-overlay').forEach(m=>{m.addEventListener('click',e=>{if(e.target===m&&m.id!=='authModal')closeModal(m.id);});});

// ═══════════════════════════════════════════════
// SECTION 25: OCEAN BACKGROUND
// ═══════════════════════════════════════════════

(function initOceanParticles(){
  const canvas=document.getElementById('bgCanvas');if(!canvas)return;
  const ctx=canvas.getContext('2d');let W,H,pts;
  function resize(){W=canvas.width=innerWidth;H=canvas.height=innerHeight;}
  function mkPts(){pts=Array.from({length:55},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2.5+.5,vx:(Math.random()-.5)*.25,vy:-(Math.random()*.4+.1),a:Math.random()*.45+.08,hue:Math.random()>.6?175:200}));}
  function draw(){ctx.clearRect(0,0,W,H);pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`hsla(${p.hue},90%,65%,${p.a})`;ctx.fill();p.x+=p.vx;p.y+=p.vy;if(p.y<-5)p.y=H+5;if(p.x<-5)p.x=W+5;if(p.x>W+5)p.x=-5;});requestAnimationFrame(draw);}
  window.addEventListener('resize',()=>{resize();mkPts();});resize();mkPts();draw();
})();

(function spawnBubbles(){
  const c=document.getElementById('bubbles');if(!c)return;
  function add(){const b=document.createElement('div');b.className='bubble';const sz=Math.random()*14+4,left=Math.random()*100,dur=Math.random()*10+8,del=Math.random()*5;b.style.cssText=`width:${sz}px;height:${sz}px;left:${left}%;bottom:-20px;animation-duration:${dur}s;animation-delay:${del}s;opacity:0`;c.appendChild(b);setTimeout(()=>b.remove(),(dur+del)*1000+500);}
  setInterval(add,800);for(let i=0;i<8;i++)add();
})();

// ═══════════════════════════════════════════════
// SECTION 26: INIT
// ═══════════════════════════════════════════════

function initAllSystems(){
  sessionStartBalance=ucet;sessionStartTime=Date.now();currentStreak=currentUser.currentStreak||0;
  balance=ucet;renderBalanceUI();renderStatsTicker();updateDailyBtn();updateJackpotTicker();
  buildReels();buildDeepReels();buildPaylineIndicators();buildPaytableStrip();updateUI();
  buildPokerPaytable();initCrashCanvas();
  activeGame='';switchGame('slots5');
  startBotChat();addChatMsg('System','🐚',`Welcome ${currentUser.name}! Balance: ${ucet.toLocaleString()} Kč`,true);
  if(Date.now()-(currentUser.createdAt||0)<5000){setTimeout(()=>showAlert(`🎉 WELCOME BONUS!\n+${ADMIN_CONFIG.welcomeBonus.toLocaleString()} Kč added!\nEnjoy the Abyss!`,'🐚'),600);}
  if(isDailyAvailable()){setTimeout(()=>showAlert(`🎁 Daily reward ready!\nClick 🎁 to claim ${getVipLevel(currentUser).dailyBonus.toLocaleString()} Kč`,'🎁'),1800);}
  adminLog('INIT',`Session started: ${currentUser.name}`);
  checkAchievements();
  // Coinflip stats
  const hc=document.getElementById('cfHeadCount'),tc=document.getElementById('cfTailCount');
  if(hc)hc.textContent=currentUser.cfHeads||0;if(tc)tc.textContent=currentUser.cfTails||0;
  updateStreakBar();
  document.querySelector('[onclick="openAdmin()"]')?.style.setProperty('display', currentUser?.isAdmin ? '' : 'none');
}

document.addEventListener('DOMContentLoaded',()=>{ tryAutoLogin(); });
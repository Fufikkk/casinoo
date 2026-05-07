/* ═══════════════════════════════════════════════════════════
   ABYSSAL CASINO v2 — script.js
   Full casino platform: Auth · Economy · 7 Games · Stats
   Leaderboard · Chat · Admin · Bonuses · History
   ═══════════════════════════════════════════════════════════ */

   "use strict";

   // ═══════════════════════════════════════════════
   // SECTION 1: DATA LAYER — localStorage wrappers
   // ═══════════════════════════════════════════════
   
   const DB = {
     get(key, fallback = null) {
       try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
       catch { return fallback; }
     },
     set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
     del(key)      { try { localStorage.removeItem(key); } catch {} }
   };
   
   // ═══════════════════════════════════════════════
   // SECTION 2: SOUND HOOKS
   // ═══════════════════════════════════════════════
   
   const SFX = { spin:null, win:null, jackpot:null, lose:null, click:null, daily:null, crash:null, flip:null, card:null };
   function playSFX(name) { try { if(SFX[name]){SFX[name].currentTime=0;SFX[name].play();} } catch{} }
   
   // ═══════════════════════════════════════════════
   // SECTION 3: AUTH & USER SYSTEM
   // ═══════════════════════════════════════════════
   
   let currentUser = null;
   
   const AVATARS = ['🐚','🐠','🦈','🐙','🦑','🐡','🦞','🪸','🔱','👑','💎','🌊'];
   const VIP_LEVELS = [
     { name:'Drifter',   min:0,      emoji:'🌊', perks:'Daily: 500 Kč'        },
     { name:'Sailor',    min:5000,   emoji:'⛵', perks:'+10% daily bonus'     },
     { name:'Navigator', min:15000,  emoji:'🧭', perks:'+25% daily, free spins'},
     { name:'Captain',   min:40000,  emoji:'⚓', perks:'+50% daily, VIP chat' },
     { name:'Admiral',   min:100000, emoji:'🔱', perks:'Max bonuses + badge'  },
   ];
   
   function getVipLevel(totalWagered) {
     let lv = VIP_LEVELS[0];
     for (const v of VIP_LEVELS) { if (totalWagered >= v.min) lv = v; }
     return lv;
   }
   
   function loadUsers()        { return DB.get('ac_users', {}); }
   function saveUsers(users)   { DB.set('ac_users', users); }
   function loadCurrentUser()  { return DB.get('ac_session', null); }
   function saveSession(name)  { DB.set('ac_session', name); }
   function clearSession()     { DB.del('ac_session'); }
   
   function doRegister() {
     const name = document.getElementById('regName').value.trim();
     const pin  = document.getElementById('regPin').value.trim();
     if (!name || name.length < 2) { showAlert('Name must be 2+ chars', '⚠️'); return; }
     if (!/^\d{4}$/.test(pin))     { showAlert('PIN must be 4 digits', '⚠️'); return; }
     const users = loadUsers();
     if (users[name]) { showAlert('Username taken', '⚠️'); return; }
     users[name] = {
       name, pin,
       balance: 2500,          // welcome bonus
       avatar: '🐚',
       created: Date.now(),
       stats: freshStats(),
       inventory: [],
       lastDaily: 0,
       totalWagered: 0,
       history: []
     };
     saveUsers(users);
     saveSession(name);
     currentUser = users[name];
     addSystemChat(`🎉 ${name} just joined Abyssal Casino!`);
     addLog(`New user registered: ${name}`);
     hideAuthModal();
     bootApp();
     showAlert(`Welcome, ${name}!\nBonus: +2,500 Kč 🎁`, '🐚');
   }
   
   function doGuestLogin() {
     const guestId = 'Guest_' + Math.floor(Math.random()*9000+1000);
     const users = loadUsers();
     users[guestId] = {
       name: guestId,
       pin: '0000',
       balance: 1500,
       avatar: '🐠',
       created: Date.now(),
       stats: freshStats(),
       inventory: [],
       lastDaily: 0,
       totalWagered: 0,
       history: [],
       isGuest: true
     };
     saveUsers(users);
     saveSession(guestId);
     currentUser = users[guestId];
     hideAuthModal();
     bootApp();
     showAlert(`Welcome, ${guestId}!\nGuest balance: 1,500 Kč\n(Register to save progress)`, '🐠');
   }

   function doLogin() {
     const name = document.getElementById('loginName').value.trim();
     const pin  = document.getElementById('loginPin').value.trim();
     const users = loadUsers();
     if (!users[name] || users[name].pin !== pin) { showAlert('Wrong name or PIN', '❌'); return; }
     currentUser = users[name];
     saveSession(name);
     hideAuthModal();
     bootApp();
     showAlert(`Welcome back, ${name}!`, '🐚');
   }
   
   function doLogout() {
     saveUserData();
     clearSession();
     currentUser = null;
     location.reload();
   }
   
   function saveUserData() {
     if (!currentUser) return;
     const users = loadUsers();
     users[currentUser.name] = currentUser;
     saveUsers(users);
   }
   
   function freshStats() {
     return {
       totalGames:0, totalWins:0, totalLosses:0,
       totalWagered:0, totalPayout:0,
       biggestWin:0, biggestLoss:0,
       byGame:{}
     };
   }
   
   function recordGame(game, bet, payout) {
     if (!currentUser) return;
     const st = currentUser.stats;
     if (!st.byGame) st.byGame = {};
     st.totalGames++;
     st.totalWagered += bet;
     st.totalPayout  += payout;
     currentUser.totalWagered = (currentUser.totalWagered||0) + bet;
     const net = payout - bet;
     if (net > 0) { st.totalWins++; if(net > st.biggestWin) st.biggestWin = net; }
     else if (net < 0) { st.totalLosses++; if(Math.abs(net) > st.biggestLoss) st.biggestLoss = Math.abs(net); }
     if (!st.byGame[game]) st.byGame[game] = {games:0,wins:0,wagered:0,payout:0};
     const g = st.byGame[game];
     g.games++; g.wagered += bet; g.payout += payout;
     if (net > 0) g.wins++;
     addHistoryEntry(game, bet, payout, net);
     if (payout > bet * 3) addLeaderboardEntry(currentUser.name, net, game);
     updateVipBadge();
     updateTicker();
     saveUserData();
   }
   
   function addHistoryEntry(game, bet, payout, net) {
     if (!currentUser) return;
     if (!currentUser.history) currentUser.history = [];
     currentUser.history.unshift({ game, bet, payout, net, ts: Date.now() });
     if (currentUser.history.length > 200) currentUser.history.pop();
   }
   
   function showAuthTab(tab) {
     document.getElementById('authLogin').classList.toggle('hidden', tab !== 'login');
     document.getElementById('authRegister').classList.toggle('hidden', tab !== 'register');
     document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
     document.getElementById('tabRegister').classList.toggle('active', tab !== 'login');
   }
   
   function hideAuthModal() {
     const m = document.getElementById('authModal');
     if (m) m.classList.add('hidden');
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 4: ECONOMY
   // ═══════════════════════════════════════════════
   
   function getBalance()     { return currentUser ? currentUser.balance : 0; }
   function setBalance(v)    { if (currentUser) { currentUser.balance = Math.max(0, Math.round(v)); syncBalance(); } }
   function addBalance(v)    { setBalance(getBalance() + v); }
   function deductBalance(v) { setBalance(getBalance() - v); }
   let sessionStart = 0;
   
   function syncBalance() {
     const b = getBalance();
     const el = document.getElementById('ucetLabel');
     if (el) el.textContent = b.toLocaleString() + ' Kč';
     const bd = document.getElementById('balanceDisplay');
     if (bd) bd.textContent = b.toLocaleString() + ' Kč';
     updateTicker();
     saveUserData();
   }
   
   function topUp() {
     addBalance(1000);
     showAlert('💰 +1,000 Kč deposited!', '🐚');
     addLog(`Deposit +1000 Kč by ${currentUser?.name}`);
     playSFX('click');
   }
   
   function resetAccount() {
     if (!currentUser) return;
     currentUser.balance = 0;
     syncBalance();
     showAlert('Balance wiped to 0', '🌀');
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 5: POPUP ALERT
   // ═══════════════════════════════════════════════
   
   let popupOpen = false;
   function showAlert(text, emoji = '') {
     popupOpen = true;
     const ov = document.getElementById('overlay');
     const at = document.getElementById('alertText');
     const ae = document.getElementById('alertEmoji');
     if (!ov || !at) return;
     at.textContent  = text;
     if (ae) ae.textContent = emoji;
     ov.classList.add('active');
     setTimeout(() => { ov.classList.remove('active'); popupOpen = false; }, 1200);
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 6: NAVIGATION
   // ═══════════════════════════════════════════════
   
   let activeGame = '';
   
   function switchGame(game) {
     if (game === activeGame) return;
     activeGame = game;
     const all = ['Slots','DeepReels','Crash','Roulette','Blackjack','Coinflip','Poker'];
     all.forEach(s => document.getElementById('section'+s)?.classList.add('hidden'));
     ['btnSlots','btnDeepReels','btnCrash','btnRoulette','btnBlackjack','btnCoinflip','btnPoker']
       .forEach(b => document.getElementById(b)?.classList.remove('active'));
     const map = {
       slots:      ['sectionSlots',      'btnSlots'],
       slots5:     ['sectionDeepReels',  'btnDeepReels'],
       crash:      ['sectionCrash',      'btnCrash'],
       roulette:   ['sectionRoulette',   'btnRoulette'],
       blackjack:  ['sectionBlackjack',  'btnBlackjack'],
       coinflip:   ['sectionCoinflip',   'btnCoinflip'],
       poker:      ['sectionPoker',      'btnPoker'],
     };
     if (map[game]) {
       document.getElementById(map[game][0])?.classList.remove('hidden');
       document.getElementById(map[game][1])?.classList.add('active');
     }
     addLog(`Game switched to: ${game}`);
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 7: MODAL HELPERS
   // ═══════════════════════════════════════════════
   
   function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
   function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }
   
   // ═══════════════════════════════════════════════
   // SECTION 8: DAILY REWARD
   // ═══════════════════════════════════════════════
   
   const DAILY_BASE = 500;
   
   function getDailyAmount() {
     const vip = getVipLevel(currentUser?.totalWagered || 0);
     const idx = VIP_LEVELS.indexOf(vip);
     return DAILY_BASE * (1 + idx * 0.25);
   }
   
   function isDailyAvailable() {
     if (!currentUser) return false;
     return (Date.now() - (currentUser.lastDaily || 0)) > 23 * 3600 * 1000;
   }
   
   function claimDaily() {
     if (!currentUser) return;
     if (!isDailyAvailable()) {
       const wait = 23 * 3600 * 1000 - (Date.now() - currentUser.lastDaily);
       const h = Math.floor(wait/3600000), m = Math.floor((wait%3600000)/60000);
       showAlert(`Come back in ${h}h ${m}m`, '⏳'); return;
     }
     const amt = getDailyAmount();
     currentUser.lastDaily = Date.now();
     addBalance(amt);
     showAlert(`🎁 DAILY REWARD!\n+${amt.toLocaleString()} Kč`, '🎁');
     playSFX('daily');
     updateDailyBtn();
     addLog(`Daily claimed: +${amt} Kč by ${currentUser.name}`);
   }
   
   function updateDailyBtn() {
     const btn = document.getElementById('dailyBtn');
     if (!btn) return;
     const avail = isDailyAvailable();
     btn.style.borderColor = avail ? 'rgba(255,209,102,0.6)' : '';
     btn.style.color       = avail ? '#ffd166' : '';
     btn.title = avail ? `Claim ${getDailyAmount()} Kč daily` : 'Already claimed today';
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 9: FREE SPINS
   // ═══════════════════════════════════════════════
   
   let freeSpinsLeft = 0;
   
   function awardFreeSpins(n) {
     freeSpinsLeft += n;
     updateFreeSpinsBanner();
     showAlert(`🎰 You got ${n} FREE SPINS!`, '🌊');
   }
   
   function updateFreeSpinsBanner() {
     const banner = document.getElementById('freeSpinsBanner');
     const text   = document.getElementById('freeSpinsText');
     if (!banner) return;
     if (freeSpinsLeft > 0) {
       banner.classList.remove('hidden');
       if (text) text.textContent = `FREE SPINS: ${freeSpinsLeft}`;
     } else {
       banner.classList.add('hidden');
     }
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 10: LEADERBOARD
   // ═══════════════════════════════════════════════
   
   const LB_KEY = 'ac_leaderboard';
   
   function getLeaderboard()   { return DB.get(LB_KEY, []); }
   function saveLeaderboard(lb){ DB.set(LB_KEY, lb); }
   
   function addLeaderboardEntry(name, score, game) {
     if (!name || score <= 0) return;
     const lb = getLeaderboard();
     lb.push({ name, score, game, ts: Date.now() });
     lb.sort((a,b) => b.score - a.score);
     saveLeaderboard(lb.slice(0, 50));
   }
   
   function renderLeaderboard(mode = 'alltime') {
     const content = document.getElementById('leaderboardContent');
     if (!content) return;
     document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
     const tabs = { alltime:0, weekly:1, biggest:2 };
     document.querySelectorAll('.lb-tab')[tabs[mode]]?.classList.add('active');
   
     let lb = getLeaderboard();
     if (mode === 'weekly') {
       const weekAgo = Date.now() - 7*24*3600*1000;
       lb = lb.filter(e => e.ts > weekAgo);
     } else if (mode === 'biggest') {
       lb = [...lb].sort((a,b) => b.score - a.score);
     }
     lb = lb.slice(0, 15);
   
     if (lb.length === 0) {
       content.innerHTML = '<div class="lb-empty">◈ NO SCORES YET — PLAY TO MAKE HISTORY ◈</div>'; return;
     }
   
     content.innerHTML = lb.map((e, i) => {
       const rankClass = i===0?'gold':i===1?'silver':i===2?'bronze':'';
       const medal     = i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
       return `<div class="lb-entry">
         <span class="lb-rank ${rankClass}">${medal}</span>
         <span class="lb-name">${e.name}</span>
         <span class="lb-game-tag">${e.game||'?'}</span>
         <span class="lb-score">+${e.score.toLocaleString()} Kč</span>
       </div>`;
     }).join('');
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 11: STATS
   // ═══════════════════════════════════════════════
   
   function renderStats() {
     const el = document.getElementById('statsContent');
     if (!el || !currentUser) return;
     const st = currentUser.stats;
     const rtp = st.totalWagered > 0 ? ((st.totalPayout / st.totalWagered) * 100).toFixed(1) : '—';
     const pl  = st.totalPayout - st.totalWagered;
     const rtpNum = parseFloat(rtp) || 0;
   
     const gameRows = Object.entries(st.byGame).map(([g,d]) => {
       const gpl = d.payout - d.wagered;
       return `<div class="gb-item">
         <span class="gb-game">${g}</span>
         <span class="gb-wl">${d.wins}W / ${d.games-d.wins}L</span>
         <span class="gb-pl ${gpl>=0?'pos':'neg'}">${gpl>=0?'+':''}${gpl.toLocaleString()} Kč</span>
       </div>`;
     }).join('') || '<div class="lb-empty">Play some games first!</div>';
   
     el.innerHTML = `
       <div class="stats-grid">
         <div class="sg-item"><div class="sg-label">GAMES PLAYED</div><div class="sg-val">${st.totalGames}</div></div>
         <div class="sg-item"><div class="sg-label">WINS / LOSSES</div><div class="sg-val">${st.totalWins} / ${st.totalLosses}</div></div>
         <div class="sg-item"><div class="sg-label">WIN RATE</div><div class="sg-val">${st.totalGames>0?((st.totalWins/st.totalGames)*100).toFixed(1):0}%</div></div>
         <div class="sg-item"><div class="sg-label">TOTAL WAGERED</div><div class="sg-val">${st.totalWagered.toLocaleString()} Kč</div></div>
         <div class="sg-item"><div class="sg-label">BIGGEST WIN</div><div class="sg-val gold">${st.biggestWin.toLocaleString()} Kč</div></div>
         <div class="sg-item"><div class="sg-label">BIGGEST LOSS</div><div class="sg-val red">${st.biggestLoss.toLocaleString()} Kč</div></div>
       </div>
       <div class="stats-rtp-bar">
         <div class="rtp-label">RETURN TO PLAYER (RTP)</div>
         <div class="rtp-track"><div class="rtp-fill" style="width:${Math.min(rtpNum,130)}%"></div></div>
         <div class="rtp-val">${rtp}% <span style="color:var(--text-dim);font-size:.65rem">(house edge ~${rtp !== '—' ? (100-rtpNum).toFixed(1) : '?'}%)</span></div>
       </div>
       <div style="margin-top:14px">
         <div class="rtp-label">PROFIT / LOSS: <b style="color:${pl>=0?'var(--teal)':'var(--coral)'}">${pl>=0?'+':''}${pl.toLocaleString()} Kč</b></div>
       </div>
       <div class="game-breakdown" style="margin-top:14px">${gameRows}</div>
     `;
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 12: HISTORY
   // ═══════════════════════════════════════════════
   
   function renderHistory() {
     const el = document.getElementById('historyContent');
     if (!el || !currentUser) return;
     const hist = currentUser.history || [];
     if (hist.length === 0) {
       el.innerHTML = '<div class="lb-empty">No games played yet</div>'; return;
     }
     el.innerHTML = hist.slice(0,80).map(h => {
       const d = new Date(h.ts);
       const time = d.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'});
       return `<div class="history-item">
         <span class="hi-time">${time}</span>
         <span class="hi-game">${h.game}</span>
         <span class="hi-detail">Bet: ${h.bet} Kč</span>
         <span class="hi-amount ${h.net>=0?'win':'loss'}">${h.net>=0?'+':''}${h.net.toLocaleString()} Kč</span>
       </div>`;
     }).join('');
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 13: PROFILE
   // ═══════════════════════════════════════════════
   
   function renderProfile() {
     const el = document.getElementById('profileContent');
     if (!el || !currentUser) return;
     const vip  = getVipLevel(currentUser.totalWagered||0);
     const idx  = VIP_LEVELS.indexOf(vip);
     const next = VIP_LEVELS[idx+1];
     const prog = next ? Math.min(100, ((currentUser.totalWagered - vip.min) / (next.min - vip.min)) * 100) : 100;
     const avGrid = AVATARS.map(a =>
       `<div class="av-opt ${a===currentUser.avatar?'active':''}" onclick="setAvatar('${a}')">${a}</div>`
     ).join('');
   
     el.innerHTML = `
       <div class="profile-avatar" onclick="">${currentUser.avatar}</div>
       <div class="profile-info">
         <div class="profile-name">${currentUser.name}</div>
         <div class="profile-sub">${vip.emoji} ${vip.name} — ${vip.perks}</div>
       </div>
       <div class="profile-stats-grid">
         <div class="psg-item"><div class="psg-label">BALANCE</div><div class="psg-val">${getBalance().toLocaleString()} Kč</div></div>
         <div class="psg-item"><div class="psg-label">WAGERED</div><div class="psg-val">${(currentUser.totalWagered||0).toLocaleString()} Kč</div></div>
         <div class="psg-item"><div class="psg-label">GAMES</div><div class="psg-val">${currentUser.stats.totalGames}</div></div>
         <div class="psg-item"><div class="psg-label">WIN RATE</div><div class="psg-val">${currentUser.stats.totalGames>0?((currentUser.stats.totalWins/currentUser.stats.totalGames)*100).toFixed(1):0}%</div></div>
       </div>
       <div style="margin-bottom:14px">
         <div class="rtp-label">VIP PROGRESS TO ${next?next.name:'MAX'}</div>
         <div class="vip-progress"><div class="vip-bar" style="width:${prog}%"></div></div>
         <div style="font-size:.6rem;color:var(--text-dim);text-align:center;margin-top:4px;font-family:var(--font-display)">${prog.toFixed(0)}%${next?' — '+next.min.toLocaleString()+' Kč wagered to unlock':' — MAX LEVEL'}</div>
       </div>
       <div style="margin-bottom:8px;font-family:var(--font-display);font-size:.62rem;letter-spacing:2px;color:var(--teal)">CHOOSE AVATAR</div>
       <div class="avatar-grid">${avGrid}</div>
     `;
   }
   
   function setAvatar(av) {
     if (!currentUser) return;
     currentUser.avatar = av;
     saveUserData();
     renderProfile();
     updateVipBadge();
   }
   
   function updateVipBadge() {
     const el = document.getElementById('vipBadge');
     if (!el || !currentUser) return;
     const vip = getVipLevel(currentUser.totalWagered||0);
     const idx = VIP_LEVELS.indexOf(vip);
     el.textContent = `${vip.emoji} ${vip.name}`;
     const colors = ['#00d4aa','#4cc9f0','#c77dff','#ffd166','#ff6b6b'];
     el.style.color = colors[idx] || '#00d4aa';
     el.style.borderColor = colors[idx]+'55' || '';
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 14: TICKER
   // ═══════════════════════════════════════════════
   
   function updateTicker() {
     if (!currentUser) return;
     const b  = getBalance();
     const pl = b - sessionStart;
     const st = currentUser.stats;
     const rtp = st.totalWagered>0 ? ((st.totalPayout/st.totalWagered)*100).toFixed(1)+'%' : '—';
     const set = (id,v,cls) => { const e=document.getElementById(id); if(e){e.textContent=v; if(cls) e.className=cls;} };
     set('tickerBal',   b.toLocaleString()+' Kč');
     const plEl = document.getElementById('tickerPL');
     if (plEl) { plEl.textContent=(pl>=0?'+':'')+pl.toLocaleString()+' Kč'; plEl.className=pl>=0?'pos':'neg'; }
     set('tickerBW',    st.biggestWin.toLocaleString()+' Kč');
     set('tickerGames', st.totalGames);
     set('tickerRTP',   rtp);
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 15: WIN EFFECTS
   // ═══════════════════════════════════════════════
   
   function winFlash(color = 'teal') {
     const el = document.createElement('div');
     el.className = 'win-flash-overlay' + (color==='red'?' flash-red':'');
     document.body.appendChild(el);
     setTimeout(() => el.remove(), 900);
   }
   
   const JACKPOT_SYMBOLS = ['💸','💰','🤑','💵','💎','⭐','🪙'];
   
   function triggerJackpot(ox = innerWidth/2, oy = innerHeight*0.6, count = 80) {
     const frag = document.createDocumentFragment();
     const rand  = (a,b) => Math.random()*(b-a)+a;
     for (let i = 0; i < count; i++) {
       const el  = document.createElement('span');
       el.className = 'money-particle';
       el.textContent = JACKPOT_SYMBOLS[Math.floor(Math.random()*JACKPOT_SYMBOLS.length)];
       const ang = rand(0, Math.PI*2), dist = rand(140, 900);
       const dur = rand(0.85,1.55), delay = rand(0,0.25), size = rand(1.1,2.6).toFixed(2);
       el.style.cssText = `left:${ox}px;top:${oy}px;font-size:${size}rem;--tx:${(Math.cos(ang)*dist).toFixed(1)}px;--ty:${(Math.sin(ang)*dist).toFixed(1)}px;--rot:${rand(-540,540).toFixed(1)}deg;--duration:${dur.toFixed(3)}s;--delay:${delay.toFixed(3)}s;`;
       el.addEventListener('animationend', () => el.remove(), {once:true});
       frag.appendChild(el);
     }
     document.body.appendChild(frag);
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 16: CLASSIC SLOTS (3-reel)
   // ═══════════════════════════════════════════════
   
   const SLOT_SYMBOLS = ['🐚','🔱','💎','⭐','🐠','🪸','🫧','⚓'];
   const STRIP_ROWS   = 12;
   let spinning = false;
   let slotsBet = 100;
   
   function setSlotsBet(n) {
     slotsBet = n;
     document.querySelectorAll('#sectionSlots .bet-btn').forEach(b =>
       b.classList.toggle('active', parseInt(b.textContent) === n));
     const lbl = document.getElementById('slotsBetLabel');
     if (lbl) lbl.textContent = n + ' Kč';
   }
   
   function buildReels() {
     for (let r = 1; r <= 3; r++) {
       const strip = document.getElementById(`strip${r}`);
       if (!strip) continue;
       strip.innerHTML = '';
       for (let i = 0; i < STRIP_ROWS; i++) {
         const div = document.createElement('div');
         div.className = 'slot-sym';
         div.textContent = SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)];
         strip.appendChild(div);
       }
     }
   }
   
   function loadStrip(strip, finalRow) {
     const cells = strip.querySelectorAll('.slot-sym');
     cells.forEach((cell, i) => {
       cell.textContent = i < STRIP_ROWS-3
         ? SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]
         : finalRow[i-(STRIP_ROWS-3)];
     });
   }
   
   function spin() {
     if (spinning || popupOpen) return;
     const bet = freeSpinsLeft > 0 ? 0 : slotsBet;
     if (bet > 0 && getBalance() < bet) { showAlert('Not enough gold!\nAdd funds to dive.','💸'); return; }
     if (freeSpinsLeft > 0) { freeSpinsLeft--; updateFreeSpinsBanner(); }
     else { deductBalance(bet); }
     spinning = true;
     const spinBtn = document.getElementById('spinBtn');
     if (spinBtn) spinBtn.disabled = true;
     document.getElementById('slotResult').textContent = '';
     playSFX('spin');
   
     const outcomes = [1,2,3].map(() => [
       SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)],
       SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)],
       SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)]
     ]);
     for (let r = 1; r <= 3; r++) {
       const strip = document.getElementById(`strip${r}`);
       strip.style.transition = 'none'; strip.style.transform = 'translateY(0)';
       loadStrip(strip, outcomes[r-1]);
     }
     const SYM_H=84, SCROLL_TO=-((STRIP_ROWS-3)*SYM_H), BASE=750, STAGGER=280;
     for (let r = 1; r <= 3; r++) {
       const strip = document.getElementById(`strip${r}`);
       const dur = BASE + (r-1)*STAGGER;
       strip.classList.add('spinning-blur');
       void strip.offsetWidth;
       strip.style.transition = `transform ${dur}ms cubic-bezier(0.08,0,0.15,1)`;
       strip.style.transform  = `translateY(${SCROLL_TO}px)`;
       setTimeout(() => strip.classList.remove('spinning-blur'), dur-80);
     }
     setTimeout(() => resolveSlots(outcomes, bet), BASE + 2*STAGGER + 120);
   }
   
   function resolveSlots(outcomes, bet) {
     const mid = outcomes.map(r => r[1]);
     let payout = 0, resultText='', alertMsg='', alertEmoji='', resultColor='';
     if (mid[0]===mid[1] && mid[1]===mid[2]) {
       payout=bet*5; resultText=`⚓ JACKPOT! +${payout} Kč`; alertMsg=`TRIDENT JACKPOT!\n${mid.join('  ')}\n+${payout} Kč`; alertEmoji='🔱'; resultColor='var(--gold)';
       triggerJackpot(); winFlash();
       document.querySelector('.machine-frame')?.classList.add('win-flash');
       setTimeout(()=>document.querySelector('.machine-frame')?.classList.remove('win-flash'),750);
     } else if (mid[0]===mid[1]||mid[1]===mid[2]||mid[0]===mid[2]) {
       payout=bet*2; resultText=`🌊 TWIN CURRENT! +${payout} Kč`; alertMsg=`TWIN CURRENT!\n${mid.join('  ')}\n+${payout} Kč`; alertEmoji='🌊'; resultColor='var(--teal)';
       winFlash();
     } else {
       resultText=`🦑 The abyss takes it. −${bet} Kč`; alertMsg=`The abyss claims all\n${mid.join('  ')}\n−${bet} Kč`; alertEmoji='🦑'; resultColor='var(--coral)';
     }
     addBalance(payout);
     recordGame('Slots', bet||1, payout);
     const resEl = document.getElementById('slotResult');
     if (resEl) { resEl.textContent=resultText; resEl.style.color=resultColor; }
     showAlert(alertMsg, alertEmoji);
     playSFX(payout>=bet*5?'jackpot':payout>0?'win':'lose');
     spinning = false;
     const sb = document.getElementById('spinBtn');
     if (sb) sb.disabled = false;
     if (payout >= bet * 5) addLeaderboardEntry(currentUser?.name, payout-bet, 'Slots');
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 17: DEEP REELS (5-reel)
   // ═══════════════════════════════════════════════
   
   const REEL_COUNT   = 5;
   const VISIBLE_ROWS = 3;
   const STRIP_EXTRA  = 20;
   const SYMBOL_H     = 90;
   const BASE_SPIN_MS = 900;
   const STAGGER_MS   = 220;
   
   const deepSymbols = {
     SEVEN:   {id:'SEVEN',  glyph:'7️⃣', weight:2,  pay:{3:50,4:200,5:1000}, label:'Seven'  },
     DIAMOND: {id:'DIAMOND',glyph:'💎', weight:4,  pay:{3:20,4:80, 5:400 }, label:'Diamond'},
     CROWN:   {id:'CROWN',  glyph:'👑', weight:6,  pay:{3:12,4:40, 5:200 }, label:'Crown'  },
     BELL:    {id:'BELL',   glyph:'🔔', weight:10, pay:{3:8, 4:20, 5:100 }, label:'Bell'   },
     STAR:    {id:'STAR',   glyph:'⭐', weight:12, pay:{3:5, 4:15, 5:60  }, label:'Star'   },
     CLOVER:  {id:'CLOVER', glyph:'🍀', weight:14, pay:{3:4, 4:10, 5:40  }, label:'Clover' },
     BOLT:    {id:'BOLT',   glyph:'⚡', weight:15, pay:{3:3, 4:8,  5:25  }, label:'Bolt'   },
     LEMON:   {id:'LEMON',  glyph:'🍋', weight:18, pay:{3:2, 4:5,  5:15  }, label:'Lemon'  },
     WILD:    {id:'WILD',   glyph:'🌊', weight:3,  pay:{3:25,4:100,5:500 }, label:'Wild',    isWild:true   },
     SCATTER: {id:'SCATTER',glyph:'🐚', weight:3,  pay:{3:0, 4:0,  5:0  }, label:'Scatter', isScatter:true},
   };
   
   const SYMBOL_POOL = [];
   Object.values(deepSymbols).forEach(s => { for(let i=0;i<s.weight;i++) SYMBOL_POOL.push(s.id); });
   
   const PAYLINES = [
     {id:0,rows:[1,1,1,1,1],label:'Middle', color:'#00d4aa'},
     {id:1,rows:[0,0,0,0,0],label:'Top',    color:'#ffd166'},
     {id:2,rows:[2,2,2,2,2],label:'Bottom', color:'#ff6b6b'},
     {id:3,rows:[0,1,2,1,0],label:'V-Shape',color:'#c77dff'},
     {id:4,rows:[2,1,0,1,2],label:'Arch',   color:'#4cc9f0'},
     {id:5,rows:[0,0,1,2,2],label:'Slope↓', color:'#f72585'},
     {id:6,rows:[2,2,1,0,0],label:'Slope↑', color:'#7bed9f'},
     {id:7,rows:[1,0,0,0,1],label:'Dip',    color:'#ffa502'},
     {id:8,rows:[1,2,2,2,1],label:'Bowl',   color:'#eccc68'},
   ];
   
   // Admin-configurable RTP multiplier (0.5–1.5)
   let rtpMult = DB.get('ac_rtp', 1.0);
   
   let bet        = 50;
   let isSpinning = false;
   let autoSpinOn = false, autoSpinLeft = 0, autoSpinCount = 10, autoTimer = null;
   let grid = Array.from({length:REEL_COUNT}, () => ['LEMON','LEMON','LEMON']);
   let reelEls = [], reelSymbols = [];
   
   function randomSymbolId() {
     if (Math.random() > rtpMult && SYMBOL_POOL.length) {
       // Lower rtp: bias toward low-pay symbols
       const lowPool = SYMBOL_POOL.filter(s => ['LEMON','BOLT','CLOVER'].includes(s));
       if (lowPool.length) return lowPool[Math.floor(Math.random()*lowPool.length)];
     }
     return SYMBOL_POOL[Math.floor(Math.random()*SYMBOL_POOL.length)];
   }
   
   function randomSymbolGlyph() { return deepSymbols[randomSymbolId()].glyph; }
   
   function buildDeepReels() {
     const inner = document.getElementById('reelsInner');
     if (!inner) return;
     inner.innerHTML = ''; reelEls = []; reelSymbols = [];
     for (let c = 0; c < REEL_COUNT; c++) {
       const wrap = document.createElement('div'); wrap.className='reel-wrap'; wrap.id=`reel${c}`;
       const strip = document.createElement('div'); strip.className='reel-strip'; strip.id=`dstrip${c}`;
       const total = STRIP_EXTRA + VISIBLE_ROWS, colSyms = [];
       for (let r = 0; r < total; r++) {
         const span = document.createElement('span'); span.className='reel-symbol';
         span.textContent = randomSymbolGlyph();
         strip.appendChild(span);
         if (r >= STRIP_EXTRA) colSyms.push(span);
       }
       reelSymbols.push(colSyms);
       wrap.appendChild(strip); inner.appendChild(wrap); reelEls.push(strip);
     }
     resetStripPositions();
   }
   
   function resetStripPositions() {
     reelEls.forEach(s => { s.style.transition='none'; s.style.transform=`translateY(-${STRIP_EXTRA*SYMBOL_H}px)`; });
   }
   
   function buildPaylineIndicators() {
     const left=document.getElementById('plLeft'), right=document.getElementById('plRight');
     if (!left||!right) return;
     left.innerHTML=''; right.innerHTML='';
     PAYLINES.forEach(pl => {
       [left,right].forEach(container => {
         const dot=document.createElement('div'); dot.className='pl-dot';
         dot.id=`pldot-${pl.id}-${container===left?'l':'r'}`;
         dot.textContent=pl.id+1; dot.title=pl.label; dot.style.borderColor=pl.color;
         container.appendChild(dot);
       });
     });
   }
   
   function buildPaytableStrip() {
     const strip = document.getElementById('paytableStrip');
     if (!strip) return;
     strip.innerHTML = '';
     Object.values(deepSymbols).filter(s=>!s.isScatter).forEach(s => {
       const item = document.createElement('div'); item.className='pt-item';
       item.innerHTML=`<span class="pt-sym">${s.glyph}</span><span class="pt-mult">${s.pay[3]}×</span>`;
       strip.appendChild(item);
     });
   }
   
   function openPaytable() {
     const el = document.getElementById('modalPaytable');
     if (!el) return;
     el.innerHTML = Object.values(deepSymbols).map(s =>
       `<div class="lb-entry"><span class="lb-name" style="font-size:1.2rem">${s.glyph}</span>
        <span class="lb-game-tag">${s.label}</span>
        <span class="lb-score">${s.isScatter?'3+ = 10 Free Spins':`3×:${s.pay[3]} 4×:${s.pay[4]} 5×:${s.pay[5]}`}</span></div>`
     ).join('');
     openModal('paytableModal');
   }
   
   function closePaytable() { closeModal('paytableModal'); }
   
   function setBet(n) {
     if (isSpinning) return; bet=n;
     document.querySelectorAll('#sectionDeepReels .bet-buttons:first-of-type .bet-btn').forEach(b =>
       b.classList.toggle('active', parseInt(b.textContent)===n));
     updateUI();
   }
   
   function setMaxBet() { setBet(500); }
   
   function setAutoCount(n) {
     autoSpinCount=n;
     document.querySelectorAll('.spin-group ~ .ctrl-group .bet-btn').forEach(b =>
       b.classList.toggle('active', parseInt(b.textContent)===n));
   }
   
   function toggleAuto() {
     if (isSpinning && !autoSpinOn) return;
     autoSpinOn = !autoSpinOn;
     document.getElementById('autoBtn')?.classList.toggle('on', autoSpinOn);
     if (autoSpinOn) { autoSpinLeft = autoSpinCount; startSpin(); }
     else { autoSpinLeft = 0; clearTimeout(autoTimer); }
   }
   
   function generateOutcome() {
     return Array.from({length:REEL_COUNT}, () =>
       Array.from({length:VISIBLE_ROWS}, () => randomSymbolId()));
   }
   
   function updateVisibleSymbols() {
     for (let c = 0; c < REEL_COUNT; c++) {
       for (let r = 0; r < VISIBLE_ROWS; r++) {
         if (reelSymbols[c]?.[r]) reelSymbols[c][r].textContent = deepSymbols[grid[c][r]].glyph;
       }
     }
   }
   
   function clearPaylineHighlights() {
     reelSymbols.flat().forEach(s => { s.classList.remove('glow','dim','win-bounce'); });
     document.querySelectorAll('.pl-dot').forEach(d => d.classList.remove('lit'));
     document.getElementById('paylineOverlays').innerHTML='';
   }
   
   function setResultText(text, color='var(--text-bright)') {
     const el=document.getElementById('resultDisplay');
     if(!el) return; el.textContent=text; el.style.color=color; el.style.textShadow=color!=='var(--text-bright)'?`0 0 14px ${color}`:'none';
   }
   
   function setWinDisplay(amount) {
     const el=document.getElementById('winDisplay');
     if(!el) return; el.textContent=amount>0?`+${amount} Kč`:'—';
   }
   
   function updateUI() {
     const bd=document.getElementById('balanceDisplay'), btd=document.getElementById('betDisplay');
     if(bd) bd.textContent=getBalance().toLocaleString()+' Kč';
     if(btd) btd.textContent=bet+' Kč';
     const el=document.getElementById('ucetLabel'); if(el) el.textContent=getBalance().toLocaleString()+' Kč';
   }
   
   function setMarquee(text) { const el=document.getElementById('marqueeText'); if(el) el.textContent=text; }
   
   function evaluate(outcome) {
     let totalWin=0; const winLines=[];
     let scatterCount=0;
     for(let c=0;c<REEL_COUNT;c++) for(let r=0;r<VISIBLE_ROWS;r++) if(outcome[c][r]==='SCATTER') scatterCount++;
   
     PAYLINES.forEach(pl => {
       const row = pl.rows.map((r,c) => outcome[c][r]);
       const first = row[0]==='WILD' ? row.find(s=>s!=='WILD')||'WILD' : row[0];
       if(first==='SCATTER') return;
       let count=0;
       for(let i=0;i<row.length;i++) { if(row[i]===first||row[i]==='WILD') count++; else break; }
       if(count>=3) {
         const sym=deepSymbols[first];
         const mult=sym?.pay?.[count]||0;
         const winAmt=bet*mult;
         if(winAmt>0) { totalWin+=winAmt; winLines.push({pl,count,sym,winAmt}); }
       }
     });
     return {totalWin, winLines, scatterCount};
   }
   
   function animateReels(outcome, cb) {
     const totalCells=STRIP_EXTRA+VISIBLE_ROWS;
     reelEls.forEach((strip,c) => {
       strip.style.transition='none'; strip.style.transform='translateY(0)';
       const spans=strip.querySelectorAll('.reel-symbol');
       spans.forEach((sp,i) => {
         if(i < totalCells-VISIBLE_ROWS) sp.textContent=randomSymbolGlyph();
         else sp.textContent=deepSymbols[outcome[c][i-(totalCells-VISIBLE_ROWS)]].glyph;
       });
       void strip.offsetWidth;
       const dur=BASE_SPIN_MS+c*STAGGER_MS;
       strip.style.transition=`transform ${dur}ms cubic-bezier(0.08,0,0.15,1)`;
       strip.style.transform=`translateY(-${STRIP_EXTRA*SYMBOL_H}px)`;
     });
     setTimeout(cb, BASE_SPIN_MS + (REEL_COUNT-1)*STAGGER_MS + 120);
   }
   
   function handleResults(totalWin, winLines, scatterCount) {
     clearPaylineHighlights();
     if(winLines.length===0 && totalWin===0) {
       setResultText('No win this time…','var(--coral)');
       reelSymbols.flat().forEach(s => s.classList.add('dim'));
       setTimeout(()=>reelSymbols.flat().forEach(s=>s.classList.remove('dim')), 900);
       return;
     }
     const msgs=[], allWinPositions=new Set();
     winLines.forEach(({pl,count,sym,winAmt}) => {
       msgs.push(`${sym.glyph} ${count}× on ${pl.label} → +${winAmt} Kč`);
       pl.rows.forEach((r,c) => { if(c<count) allWinPositions.add(`${c},${r}`); });
       document.getElementById(`pldot-${pl.id}-l`)?.classList.add('lit');
       document.getElementById(`pldot-${pl.id}-r`)?.classList.add('lit');
     });
     reelSymbols.forEach((col,c) => col.forEach((span,r) => {
       if(allWinPositions.has(`${c},${r}`)) { span.classList.add('glow','win-bounce'); }
       else { span.classList.add('dim'); }
     }));
     if(scatterCount>=3) { awardFreeSpins(10); msgs.push('🐚 3+ Scatters → 10 FREE SPINS!'); }
     setResultText(msgs[0]||'WIN!','var(--gold)');
     setWinDisplay(totalWin);
     if(totalWin>=bet*20) { triggerJackpot(); setMarquee(`◈ JACKPOT! +${totalWin} Kč ◈`); }
     winFlash();
   }
   
   function startSpin() {
     if (isSpinning) return;
     const cost = freeSpinsLeft>0 ? 0 : bet;
     if (cost>0 && getBalance()<cost) {
       setResultText('Not enough balance!','var(--coral)');
       autoSpinOn=false;
       document.getElementById('autoBtn')?.classList.remove('on');
       return;
     }
     if (cost>0) deductBalance(cost);
     else if(freeSpinsLeft>0) { freeSpinsLeft--; updateFreeSpinsBanner(); }
     setWinDisplay(0); updateUI(); clearPaylineHighlights(); setResultText('');
     isSpinning=true; playSFX('spin');
     const deepSpinBtn=document.getElementById('deepSpinBtn');
     if(deepSpinBtn){deepSpinBtn.disabled=true; deepSpinBtn.classList.add('spinning');}
     const outcome=generateOutcome();
     animateReels(outcome, () => {
       grid=outcome; updateVisibleSymbols();
       const {totalWin,winLines,scatterCount}=evaluate(outcome);
       addBalance(totalWin);
       updateUI();
       recordGame('Deep Reels', cost||1, totalWin);
       handleResults(totalWin,winLines,scatterCount);
       playSFX(totalWin>=bet*20?'jackpot':totalWin>0?'win':'lose');
       if(totalWin>0 && currentUser) addSystemChat(`🎰 ${currentUser.name} won ${totalWin} Kč on Deep Reels!`);
       isSpinning=false;
       if(deepSpinBtn){deepSpinBtn.disabled=false; deepSpinBtn.classList.remove('spinning');}
       if(autoSpinOn && autoSpinLeft>0) {
         autoSpinLeft--;
         if(autoSpinLeft===0){autoSpinOn=false; document.getElementById('autoBtn')?.classList.remove('on');}
         else autoTimer=setTimeout(startSpin,900);
       }
       if(freeSpinsLeft>0 && !autoSpinOn) autoTimer=setTimeout(startSpin,1100);
       if(freeSpinsLeft===0) { const b=document.getElementById('freeSpinsBanner'); if(b&&!b.classList.contains('hidden')){b.classList.add('hidden'); setMarquee('◈ ABYSSAL DEEP REELS ◈ SPIN TO WIN ◈');}}
     });
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 18: CRASH GAME
   // ═══════════════════════════════════════════════
   
   let crashState='idle', crashBet=100, crashMult=1.00, crashTarget=0;
   let crashCashedOut=false, crashAnimFrame=null, crashPoints=[];
   let crashHistoryArr=[];
   let crashCanvas, crashCtx;
   
   const CRASH_C={line:'#00d4aa',dot:'#00ffcc',grid:'#0e4a72'};
   
   function initCrashCanvas() {
     crashCanvas=document.getElementById('crashCanvas');
     if(!crashCanvas) return;
     crashCtx=crashCanvas.getContext('2d');
     function resize() {
       const dpr=window.devicePixelRatio||1;
       crashCanvas.width=crashCanvas.clientWidth*dpr;
       crashCanvas.height=crashCanvas.clientHeight*dpr;
       crashCtx.scale(dpr,dpr);
     }
     resize();
     window.addEventListener('resize', resize);
     drawCrashIdle();
   }
   
   function drawCrashGrid(W,H) {
     if(!crashCtx) return;
     crashCtx.strokeStyle=CRASH_C.grid; crashCtx.lineWidth=0.5; crashCtx.setLineDash([4,6]);
     for(let i=1;i<5;i++){const y=(H/5)*i; crashCtx.beginPath(); crashCtx.moveTo(0,y); crashCtx.lineTo(W,y); crashCtx.stroke();}
     crashCtx.setLineDash([]);
   }
   
   function drawCrashIdle() {
     if(!crashCtx) return;
     const W=crashCanvas.clientWidth,H=crashCanvas.clientHeight;
     crashCtx.clearRect(0,0,W,H); drawCrashGrid(W,H);
   }
   
   function drawCrashFrame(points,W,H) {
     if(!crashCtx||!points||points.length<2) return;
     crashCtx.clearRect(0,0,W,H); drawCrashGrid(W,H);
     const grad=crashCtx.createLinearGradient(0,0,0,H);
     grad.addColorStop(0,'rgba(0,212,170,0.25)'); grad.addColorStop(1,'rgba(0,212,170,0.01)');
     crashCtx.beginPath(); crashCtx.moveTo(points[0].x,H);
     points.forEach(p=>crashCtx.lineTo(p.x,p.y));
     crashCtx.lineTo(points[points.length-1].x,H); crashCtx.closePath();
     crashCtx.fillStyle=grad; crashCtx.fill();
     crashCtx.beginPath(); crashCtx.strokeStyle=CRASH_C.line; crashCtx.lineWidth=2.5; crashCtx.lineJoin='round';
     crashCtx.moveTo(points[0].x,points[0].y);
     points.forEach(p=>crashCtx.lineTo(p.x,p.y)); crashCtx.stroke();
     const tip=points[points.length-1];
     crashCtx.beginPath(); crashCtx.arc(tip.x,tip.y,5,0,Math.PI*2); crashCtx.fillStyle=CRASH_C.dot; crashCtx.fill();
     crashCtx.beginPath(); crashCtx.arc(tip.x,tip.y,9,0,Math.PI*2); crashCtx.fillStyle='rgba(0,255,204,0.2)'; crashCtx.fill();
   }
   
   function generateCrashPoint() {
     const r=Math.random();
     if(r<0.01) return 10+Math.random()*40;
     if(r<0.05) return 5+Math.random()*5;
     if(r<0.25) return 2+Math.random()*3;
     if(r<0.55) return 1.2+Math.random()*0.8;
     return 1.0+Math.random()*0.2;
   }
   
   function setCrashBet(n) {
     if(crashState!=='idle') return;
     crashBet=n;
     document.querySelectorAll('#sectionCrash .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===n));
   }
   
   function changeCrashAuto(delta) {
     const inp=document.getElementById('autoCashoutInput');
     if(!inp) return;
     inp.value=Math.max(1.1,Math.min(100,parseFloat((parseFloat(inp.value)+delta).toFixed(1))));
   }
   
   function crashPlaceBet() {
     if(crashState!=='idle') return;
     if(getBalance()<crashBet){showAlert('Not enough balance!','💸');return;}
     deductBalance(crashBet); playSFX('spin');
     crashState='running'; crashMult=1.00; crashCashedOut=false;
     crashTarget=generateCrashPoint(); crashPoints=[];
     const multEl=document.getElementById('crashMultiplier');
     const statusEl=document.getElementById('crashStatus');
     const betBtn=document.getElementById('crashBetBtn');
     const coBtn=document.getElementById('crashCashoutBtn');
     if(multEl){multEl.className='crash-multiplier'; multEl.textContent='1.00×';}
     if(statusEl) statusEl.textContent=`Bet: ${crashBet} Kč — Flying!`;
     if(betBtn) betBtn.disabled=true;
     if(coBtn)  coBtn.disabled=false;
     const W=crashCanvas?.clientWidth||600, H=crashCanvas?.clientHeight||260;
     const startTime=performance.now();
     function tick(now){
       const elapsed=(now-startTime)/1000;
       crashMult=Math.max(1.0,Math.pow(Math.E,elapsed*0.35));
       const autoCO=parseFloat(document.getElementById('autoCashoutInput')?.value||999);
       if(!crashCashedOut && crashMult>=autoCO){crashCashout();return;}
       if(crashMult>=crashTarget){crashDoExplosion();return;}
       if(multEl){multEl.textContent=crashMult.toFixed(2)+'×'; multEl.classList.toggle('hot',crashMult>=5);}
       const t=Math.min(elapsed/8,1);
       const yFrac=1-((crashMult-1)/Math.max(crashTarget,3));
       crashPoints.push({x:t*W, y:Math.max(20,yFrac*(H-30))});
       drawCrashFrame(crashPoints,W,H);
       crashAnimFrame=requestAnimationFrame(tick);
     }
     crashAnimFrame=requestAnimationFrame(tick);
   }
   
   function crashCashout() {
     if(crashState!=='running'||crashCashedOut) return;
     crashCashedOut=true;
     const winAmt=Math.floor(crashBet*crashMult);
     addBalance(winAmt);
     recordGame('Crash', crashBet, winAmt);
     const statusEl=document.getElementById('crashStatus');
     const coBtn=document.getElementById('crashCashoutBtn');
     document.getElementById('crashMultiplier').style.color='var(--gold)';
     if(statusEl) statusEl.textContent=`Cashed at ${crashMult.toFixed(2)}× — Won ${winAmt} Kč!`;
     if(coBtn) coBtn.disabled=true;
     showAlert(`💰 CASHED OUT!\n${crashMult.toFixed(2)}× → +${winAmt} Kč`,'🚀');
     playSFX('win'); winFlash();
     const profit=winAmt-crashBet;
     if(profit>=500) { addLeaderboardEntry(currentUser?.name, profit,'Crash'); addSystemChat(`🚀 ${currentUser?.name} cashed out at ${crashMult.toFixed(2)}×!`);}
     crashHistoryArr.unshift({mult:crashMult,win:true});
     crashStop();
   }
   
   function crashDoExplosion() {
     if(crashCashedOut){crashStop();return;}
     const multEl=document.getElementById('crashMultiplier');
     const statusEl=document.getElementById('crashStatus');
     const coBtn=document.getElementById('crashCashoutBtn');
     const betBtn=document.getElementById('crashBetBtn');
     if(multEl){multEl.className='crash-multiplier crashed'; multEl.textContent='💥 CRASHED';}
     if(statusEl) statusEl.textContent=`Crashed at ${crashTarget.toFixed(2)}× — Lost ${crashBet} Kč`;
     if(coBtn) coBtn.disabled=true;
     if(betBtn) betBtn.disabled=false;
     recordGame('Crash', crashBet, 0);
     playSFX('crash'); winFlash('red');
     showAlert(`💥 CRASHED!\nAt ${crashTarget.toFixed(2)}× — −${crashBet} Kč`,'💥');
     crashHistoryArr.unshift({mult:crashTarget,win:false});
     crashState='idle'; updateCrashHistory();
     setTimeout(resetCrashUI,1200);
   }
   
   function crashStop() {
     if(crashAnimFrame){cancelAnimationFrame(crashAnimFrame); crashAnimFrame=null;}
     crashState='idle'; updateCrashHistory(); setTimeout(resetCrashUI,800);
   }
   
   function resetCrashUI() {
     const betBtn=document.getElementById('crashBetBtn');
     const coBtn=document.getElementById('crashCashoutBtn');
     const multEl=document.getElementById('crashMultiplier');
     const statusEl=document.getElementById('crashStatus');
     if(betBtn) betBtn.disabled=false;
     if(coBtn)  coBtn.disabled=true;
     if(multEl){multEl.className='crash-multiplier'; multEl.textContent='1.00×';}
     if(statusEl) statusEl.textContent='Place your bet';
     drawCrashIdle();
   }
   
   function updateCrashHistory() {
     const container=document.getElementById('crashHistory');
     if(!container) return;
     container.innerHTML='<span class="ch-label">HISTORY:</span>';
     crashHistoryArr.slice(0,12).forEach(h=>{
       const b=document.createElement('span');
       b.className='ch-bubble '+(h.mult>=5?'high':h.mult>=2?'mid':'low');
       b.textContent=h.mult.toFixed(2)+'×';
       container.appendChild(b);
     });
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 19: ROULETTE
   // ═══════════════════════════════════════════════
   
   const ROULETTE_NUMS = [
     0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26
   ];
   const RED_NUMS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
   
   let rouletteBet=50, roulettePick=null, rouletteSpinning=false, rouletteAngle=0;
   let rouletteCanvas, rouletteCtx;
   
   function initRoulette() {
     rouletteCanvas=document.getElementById('rouletteCanvas');
     if(!rouletteCanvas) return;
     rouletteCtx=rouletteCanvas.getContext('2d');
     buildRouletteBettingGrid();
     drawRouletteWheel(0);
   }
   
   function setRouletteBet(n) {
     rouletteBet=n;
     document.querySelectorAll('#sectionRoulette .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===n));
     document.getElementById('rouletteBetAmt').textContent=n;
   }
   
   function setRoulettePick(pick) {
     roulettePick=pick;
     document.querySelectorAll('.rb-btn').forEach(b=>b.classList.remove('selected'));
     event.currentTarget?.classList.add('selected');
     document.getElementById('rouletteBetOn').textContent=pick;
   }
   
   function buildRouletteBettingGrid() {
     const grid=document.getElementById('rouletteBettingGrid');
     if(!grid) return;
     grid.innerHTML=`
       <div class="rb-section-title">COLOUR</div>
       <div class="rb-row">
         <button class="rb-btn red" onclick="setRoulettePick('red')">🔴 RED (2×)</button>
         <button class="rb-btn" onclick="setRoulettePick('black')">⚫ BLACK (2×)</button>
         <button class="rb-btn green-n" onclick="setRoulettePick('green')">🟢 GREEN 0 (35×)</button>
       </div>
       <div class="rb-section-title">ODD / EVEN</div>
       <div class="rb-row">
         <button class="rb-btn" onclick="setRoulettePick('odd')">ODD (2×)</button>
         <button class="rb-btn" onclick="setRoulettePick('even')">EVEN (2×)</button>
       </div>
       <div class="rb-section-title">RANGE</div>
       <div class="rb-row">
         <button class="rb-btn" onclick="setRoulettePick('1-18')">1–18 (2×)</button>
         <button class="rb-btn" onclick="setRoulettePick('19-36')">19–36 (2×)</button>
       </div>
       <div class="rb-section-title">STRAIGHT UP (35×)</div>
       <div class="rb-row" style="flex-wrap:wrap">
         ${Array.from({length:37},(_,i)=>{
           const isRed=RED_NUMS.includes(i);
           return `<button class="rb-btn ${isRed?'red':'black-num'}" style="min-width:36px;flex:0" onclick="setRoulettePick(${i})">${i}</button>`;
         }).join('')}
       </div>
     `;
     // Fix onclick to not lose `event`
     grid.querySelectorAll('.rb-btn').forEach(btn=>{
       const orig=btn.getAttribute('onclick');
       btn.removeAttribute('onclick');
       btn.addEventListener('click',function(e){
         document.querySelectorAll('.rb-btn').forEach(b=>b.classList.remove('selected'));
         this.classList.add('selected');
         const match=orig.match(/setRoulettePick\((.+)\)/);
         if(match){
           let val=match[1]; try{val=JSON.parse(val);}catch{}
           roulettePick=val; document.getElementById('rouletteBetOn').textContent=val;
         }
       });
     });
   }
   
   function drawRouletteWheel(angle) {
     if(!rouletteCtx) return;
     const W=260,H=260,cx=130,cy=130,r=120;
     rouletteCtx.clearRect(0,0,W,H);
     const segAngle=(Math.PI*2)/ROULETTE_NUMS.length;
     ROULETTE_NUMS.forEach((num,i)=>{
       const a=angle+i*segAngle;
       rouletteCtx.beginPath(); rouletteCtx.moveTo(cx,cy);
       rouletteCtx.arc(cx,cy,r,a,a+segAngle); rouletteCtx.closePath();
       rouletteCtx.fillStyle=num===0?'#1e7b34':RED_NUMS.includes(num)?'#c0392b':'#1a1a2e';
       rouletteCtx.fill(); rouletteCtx.strokeStyle='rgba(255,255,255,0.1)'; rouletteCtx.lineWidth=0.5; rouletteCtx.stroke();
       // Number label
       const mid=a+segAngle/2;
       rouletteCtx.save(); rouletteCtx.translate(cx+Math.cos(mid)*(r*0.72),cy+Math.sin(mid)*(r*0.72));
       rouletteCtx.rotate(mid+Math.PI/2);
       rouletteCtx.fillStyle='#fff'; rouletteCtx.font='bold 8px Cinzel,serif';
       rouletteCtx.textAlign='center'; rouletteCtx.fillText(num,0,0); rouletteCtx.restore();
     });
     // Center circle
     rouletteCtx.beginPath(); rouletteCtx.arc(cx,cy,16,0,Math.PI*2);
     rouletteCtx.fillStyle='#010c18'; rouletteCtx.fill(); rouletteCtx.strokeStyle='var(--teal)||#00d4aa'; rouletteCtx.lineWidth=2; rouletteCtx.stroke();
     // Arrow pointer
     rouletteCtx.beginPath(); rouletteCtx.moveTo(cx,cy-r-2); rouletteCtx.lineTo(cx-8,cy-r+12); rouletteCtx.lineTo(cx+8,cy-r+12);
     rouletteCtx.closePath(); rouletteCtx.fillStyle='#ffd166'; rouletteCtx.fill();
   }
   
   function spinRoulette() {
     if(rouletteSpinning){return;}
     if(roulettePick===null||roulettePick===undefined){showAlert('Choose a bet first!','⚠️');return;}
     if(getBalance()<rouletteBet){showAlert('Not enough balance!','💸');return;}
     deductBalance(rouletteBet); rouletteSpinning=true;
     document.getElementById('rouletteSpinBtn').disabled=true;
     document.getElementById('rouletteBall').textContent='🌀';
     playSFX('spin');
   
     const resultIdx=Math.floor(Math.random()*ROULETTE_NUMS.length);
     const resultNum=ROULETTE_NUMS[resultIdx];
     const segAngle=(Math.PI*2)/ROULETTE_NUMS.length;
     // Calculate target angle so that resultIdx aligns under the pointer (top = -PI/2)
     const targetSegAngle = -Math.PI/2 - (resultIdx*segAngle + segAngle/2);
     const spins = 8; // full rotations
     const finalAngle = rouletteAngle + spins*Math.PI*2 + (targetSegAngle - (rouletteAngle % (Math.PI*2)));
   
     const start=performance.now(), dur=4500;
     const startAngle=rouletteAngle;
     function frame(now){
       const t=Math.min((now-start)/dur,1);
       const ease=1-Math.pow(1-t,4);
       rouletteAngle=startAngle+(finalAngle-startAngle)*ease;
       drawRouletteWheel(rouletteAngle);
       if(t<1){requestAnimationFrame(frame);}else{finishRoulette(resultNum);}
     }
     requestAnimationFrame(frame);
   }
   
   function finishRoulette(num) {
     rouletteSpinning=false;
     document.getElementById('rouletteSpinBtn').disabled=false;
     document.getElementById('rouletteBall').textContent=num;
     const isRed=RED_NUMS.includes(num);
     let payout=0, hit=false;
     const pick=roulettePick;
     if(pick===num){payout=rouletteBet*35; hit=true;}
     else if(pick==='red'   && isRed && num!==0){payout=rouletteBet*2; hit=true;}
     else if(pick==='black' && !isRed && num!==0){payout=rouletteBet*2; hit=true;}
     else if(pick==='green' && num===0){payout=rouletteBet*35; hit=true;}
     else if(pick==='odd'   && num!==0 && num%2!==0){payout=rouletteBet*2; hit=true;}
     else if(pick==='even'  && num!==0 && num%2===0){payout=rouletteBet*2; hit=true;}
     else if(pick==='1-18'  && num>=1 && num<=18){payout=rouletteBet*2; hit=true;}
     else if(pick==='19-36' && num>=19 && num<=36){payout=rouletteBet*2; hit=true;}
   
     addBalance(payout);
     recordGame('Roulette', rouletteBet, payout);
   
     // History bubble
     const hist=document.getElementById('rouletteHistory');
     if(hist){
       const d=document.createElement('div'); d.className=`rh-num ${num===0?'green':isRed?'red':'black'}`;
       d.textContent=num; hist.prepend(d);
       while(hist.children.length>14) hist.removeChild(hist.lastChild);
     }
     if(hit){ showAlert(`🎡 ${num}!\nYOU WIN +${payout} Kč`,'🎡'); playSFX('win'); winFlash(); }
     else   { showAlert(`🎡 ${num}\nNo win this time`,'🎡'); playSFX('lose'); }
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 20: BLACKJACK
   // ═══════════════════════════════════════════════
   
   const SUITS=['♠','♥','♦','♣'];
   const RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
   
   let bjDeck=[], bjPlayerHand=[], bjDealerHand=[], bjBet=100, bjGameOn=false, bjDealerHidden=true;
   
   function newDeck() {
     const d=[];
     for(const s of SUITS) for(const r of RANKS) d.push({suit:s,rank:r});
     for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
     return d;
   }
   
   function cardValue(rank) {
     if(['J','Q','K'].includes(rank)) return 10;
     if(rank==='A') return 11;
     return parseInt(rank);
   }
   
   function handValue(hand) {
     let total=0, aces=0;
     hand.forEach(c=>{total+=cardValue(c.rank); if(c.rank==='A') aces++;});
     while(total>21 && aces>0){total-=10; aces--;}
     return total;
   }
   
   function drawCard(deck) { return deck.pop(); }
   
   function setBjBet(n) {
     if(bjGameOn) return; bjBet=n;
     document.querySelectorAll('#sectionBlackjack .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===n));
   }
   
   function renderBjHand(hand, elId, hideSecond=false) {
     const el=document.getElementById(elId);
     if(!el) return;
     el.innerHTML='';
     hand.forEach((card,i)=>{
       const div=document.createElement('div');
       div.className='bj-card-el';
       if(hideSecond && i===1){div.className+=' face-down'; div.textContent='🂠'; el.appendChild(div); return;}
       const isRed=['♥','♦'].includes(card.suit);
       div.className+=' '+(isRed?'red':'black');
       div.innerHTML=`<span class="card-rank">${card.rank}</span><span class="card-suit">${card.suit}</span>`;
       el.appendChild(div);
     });
   }
   
   function bjDeal() {
     if(getBalance()<bjBet){showAlert('Not enough balance!','💸');return;}
     deductBalance(bjBet); bjGameOn=true; bjDealerHidden=true;
     bjDeck=newDeck(); bjPlayerHand=[drawCard(bjDeck),drawCard(bjDeck)];
     bjDealerHand=[drawCard(bjDeck),drawCard(bjDeck)];
     playSFX('card');
     renderBjHand(bjPlayerHand,'playerHand');
     renderBjHand(bjDealerHand,'dealerHand',true);
     document.getElementById('playerScore').textContent=handValue(bjPlayerHand);
     document.getElementById('dealerScore').textContent='?';
     document.getElementById('bjStatus').textContent='Your turn — Hit or Stand?';
     ['bjHitBtn','bjStandBtn','bjDoubleBtn'].forEach(id=>{const el=document.getElementById(id); if(el)el.disabled=false;});
     document.getElementById('bjDealBtn').disabled=true;
   
     if(handValue(bjPlayerHand)===21){bjEnd('blackjack');}
   }
   
   function bjHit() {
     if(!bjGameOn) return;
     bjPlayerHand.push(drawCard(bjDeck)); playSFX('card');
     renderBjHand(bjPlayerHand,'playerHand');
     const val=handValue(bjPlayerHand);
     document.getElementById('playerScore').textContent=val;
     document.getElementById('bjDoubleBtn').disabled=true;
     if(val>21) bjEnd('bust');
     else if(val===21) bjStand();
   }
   
   function bjStand() {
     if(!bjGameOn) return;
     bjDealerHidden=false;
     renderBjHand(bjDealerHand,'dealerHand');
     document.getElementById('dealerScore').textContent=handValue(bjDealerHand);
     ['bjHitBtn','bjStandBtn','bjDoubleBtn'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=true;});
     // Dealer draws to 17
     function dealerDraw(){
       if(handValue(bjDealerHand)<17){ bjDealerHand.push(drawCard(bjDeck)); playSFX('card'); renderBjHand(bjDealerHand,'dealerHand'); document.getElementById('dealerScore').textContent=handValue(bjDealerHand); setTimeout(dealerDraw,500); }
       else { determineWinner(); }
     }
     setTimeout(dealerDraw,500);
   }
   
   function bjDouble() {
     if(!bjGameOn||getBalance()<bjBet) return;
     deductBalance(bjBet); bjBet*=2;
     bjPlayerHand.push(drawCard(bjDeck)); playSFX('card');
     renderBjHand(bjPlayerHand,'playerHand');
     document.getElementById('playerScore').textContent=handValue(bjPlayerHand);
     if(handValue(bjPlayerHand)>21) bjEnd('bust'); else bjStand();
   }
   
   function determineWinner() {
     const pv=handValue(bjPlayerHand), dv=handValue(bjDealerHand);
     if(dv>21||pv>dv) bjEnd('win');
     else if(pv===dv) bjEnd('push');
     else bjEnd('lose');
   }
   
   function bjEnd(result) {
     bjGameOn=false;
     let payout=0, msg='', emoji='';
     const betUsed=bjBet;
     if(result==='blackjack'){ payout=Math.floor(betUsed*2.5); msg=`BLACKJACK! +${payout-betUsed} Kč`; emoji='🃏';}
     else if(result==='win') { payout=betUsed*2; msg=`YOU WIN! +${betUsed} Kč`; emoji='✅';}
     else if(result==='push'){ payout=betUsed; msg='PUSH — Bet returned'; emoji='🤝';}
     else if(result==='bust'){ msg=`BUST! −${betUsed} Kč`; emoji='💥';}
     else if(result==='lose'){ msg=`DEALER WINS −${betUsed} Kč`; emoji='❌';}
     addBalance(payout);
     recordGame('Blackjack', betUsed, payout);
     document.getElementById('bjStatus').textContent=msg;
     if(payout>betUsed){ winFlash(); playSFX('win'); }
     else playSFX('lose');
     showAlert(msg, emoji);
     if(bjDealerHidden){ bjDealerHidden=false; renderBjHand(bjDealerHand,'dealerHand'); document.getElementById('dealerScore').textContent=handValue(bjDealerHand); }
     ['bjHitBtn','bjStandBtn','bjDoubleBtn'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=true;});
     document.getElementById('bjDealBtn').disabled=false;
     bjBet=100; // reset to base after double
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 21: COINFLIP
   // ═══════════════════════════════════════════════
   
   let cfSide='heads', cfBet=100, cfFlipping=false;
   
   function setCfSide(side) {
     cfSide=side;
     document.getElementById('cfHeads')?.classList.toggle('active',side==='heads');
     document.getElementById('cfTails')?.classList.toggle('active',side==='tails');
   }
   
   function setCfBet(n) {
     cfBet=n;
     document.querySelectorAll('#sectionCoinflip .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===n));
   }
   
   function doFlip() {
     if(cfFlipping||popupOpen) return;
     if(getBalance()<cfBet){showAlert('Not enough balance!','💸');return;}
     deductBalance(cfBet); cfFlipping=true;
     document.getElementById('cfFlipBtn').disabled=true;
     document.getElementById('cfResult').textContent='';
     const result=Math.random()<0.5?'heads':'tails';
     const coin=document.getElementById('coin');
     if(!coin){cfFlipping=false;return;}
     playSFX('flip'||'spin');
     const target=result==='heads'?1800:1980; // land on heads=even*180, tails=odd*180
     coin.style.setProperty('--flip-target', target+'deg');
     coin.style.animation='none'; void coin.offsetWidth;
     coin.style.animation='coin-flip 1.2s cubic-bezier(0.4,0,0.2,1) forwards';
     setTimeout(()=>{
       cfFlipping=false;
       document.getElementById('cfFlipBtn').disabled=false;
       const won=result===cfSide;
       const payout=won?cfBet*2:0;
       addBalance(payout);
       recordGame('Coinflip',cfBet,payout);
       const resEl=document.getElementById('cfResult');
       const resultLabel=result==='heads'?'🐚 SHELL':'⚓ ANCHOR';
       if(resEl){resEl.textContent=resultLabel; resEl.style.color=won?'var(--gold)':'var(--coral)';}
       if(won){ showAlert(`${resultLabel}!\nYou win +${cfBet} Kč`,'🪙'); winFlash(); playSFX('win'); }
       else   { showAlert(`${resultLabel}!\nYou lose −${cfBet} Kč`,'😔'); playSFX('lose'); }
     },1300);
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 22: VIDEO POKER
   // ═══════════════════════════════════════════════
   
   const POKER_HANDS = [
     {name:'Royal Flush',    mult:250, check: h=>isRoyalFlush(h)   },
     {name:'Straight Flush', mult:50,  check: h=>isStraightFlush(h)},
     {name:'Four of a Kind', mult:25,  check: h=>isFourOfAKind(h)  },
     {name:'Full House',     mult:9,   check: h=>isFullHouse(h)    },
     {name:'Flush',          mult:6,   check: h=>isFlush(h)        },
     {name:'Straight',       mult:4,   check: h=>isStraight(h)     },
     {name:'Three of a Kind',mult:3,   check: h=>isThreeOfAKind(h) },
     {name:'Two Pair',       mult:2,   check: h=>isTwoPair(h)      },
     {name:'Jacks or Better',mult:1,   check: h=>isJacksOrBetter(h)},
   ];
   
   let pokerHand=[], pokerHeld=[], pokerBet=100, pokerPhase='bet', pokerDeckP=[];
   
   function setPokerBet(n){
     if(pokerPhase!=='bet') return; pokerBet=n;
     document.querySelectorAll('#sectionPoker .bet-btn').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===n));
   }
   
   function pokerDeal(){
     if(getBalance()<pokerBet){showAlert('Not enough balance!','💸');return;}
     deductBalance(pokerBet); pokerPhase='draw';
     pokerDeckP=newDeck(); pokerHeld=[false,false,false,false,false];
     pokerHand=[pokerDeckP.pop(),pokerDeckP.pop(),pokerDeckP.pop(),pokerDeckP.pop(),pokerDeckP.pop()];
     playSFX('card'); renderPokerHand(true);
     document.getElementById('pokerDealBtn').disabled=true;
     document.getElementById('pokerDrawBtn').disabled=false;
     document.getElementById('pokerHint').textContent='Click cards to HOLD, then click DRAW';
     document.getElementById('pokerHandName').textContent='Click DRAW to reveal';
     highlightPokerPaytable(null);
   }
   
   function pokerDraw(){
     pokerHand=pokerHand.map((card,i)=>pokerHeld[i]?card:pokerDeckP.pop());
     playSFX('card'); pokerPhase='bet';
     renderPokerHand(false);
     document.getElementById('pokerDrawBtn').disabled=true;
     document.getElementById('pokerDealBtn').disabled=false;
     document.getElementById('pokerHint').textContent='Place your bet and deal';
     evaluatePoker();
   }
   
   function renderPokerHand(holdable){
     const el=document.getElementById('pokerHand'); if(!el) return; el.innerHTML='';
     pokerHand.forEach((card,i)=>{
       const div=document.createElement('div'); div.className='poker-card-el';
       const isRed=['♥','♦'].includes(card.suit);
       div.className+=' '+(isRed?'red':'black');
       if(pokerHeld[i]) div.classList.add('held');
       div.innerHTML=`<span class="card-rank">${card.rank}</span><span class="card-suit-big">${card.suit}</span>`;
       if(holdable){ div.addEventListener('click',()=>{ pokerHeld[i]=!pokerHeld[i]; div.classList.toggle('held',pokerHeld[i]); }); }
       el.appendChild(div);
     });
     renderPokerPaytable();
   }
   
   function renderPokerPaytable(){
     const el=document.getElementById('pokerPaytableMini'); if(!el) return;
     el.innerHTML=POKER_HANDS.map(h=>`<span class="pp-row" data-hand="${h.name}">${h.name}: ${h.mult}×</span>`).join('');
   }
   
   function highlightPokerPaytable(handName){
     document.querySelectorAll('.pp-row').forEach(r=>r.classList.toggle('active',r.dataset.hand===handName));
   }
   
   function evaluatePoker(){
     let winner=null;
     for(const h of POKER_HANDS){ if(h.check(pokerHand)){winner=h; break;} }
     const nameEl=document.getElementById('pokerHandName');
     let payout=0;
     if(winner){
       payout=pokerBet*winner.mult;
       addBalance(payout);
       if(nameEl){nameEl.textContent=winner.name; nameEl.style.color='var(--gold)';}
       showAlert(`${winner.name}!\n+${payout} Kč`,'♠️');
       playSFX(winner.mult>=50?'jackpot':'win'); winFlash();
       highlightPokerPaytable(winner.name);
       if(winner.mult>=25) triggerJackpot();
     } else {
       if(nameEl){nameEl.textContent='No hand — try again'; nameEl.style.color='var(--coral)';}
       showAlert('No winning hand\n−'+pokerBet+' Kč','😔');
       playSFX('lose'); highlightPokerPaytable(null);
     }
     recordGame('Poker', pokerBet, payout);
   }
   
   // Poker hand checkers
   function rankCounts(hand){ const c={}; hand.forEach(({rank})=>{c[rank]=(c[rank]||0)+1;}); return Object.values(c).sort((a,b)=>b-a); }
   function isFlush(h){ return new Set(h.map(c=>c.suit)).size===1; }
   function isStraight(h){
     const vals=h.map(c=>RANKS.indexOf(c.rank)).sort((a,b)=>a-b);
     if(vals[4]-vals[0]===4 && new Set(vals).size===5) return true;
     if(JSON.stringify(vals)==='[0,9,10,11,12]') return true; // A-10-J-Q-K
     return false;
   }
   function isRoyalFlush(h){ return isFlush(h)&&isStraight(h)&&h.some(c=>c.rank==='A')&&h.some(c=>c.rank==='K'); }
   function isStraightFlush(h){ return isFlush(h)&&isStraight(h)&&!isRoyalFlush(h); }
   function isFourOfAKind(h){ return rankCounts(h)[0]===4; }
   function isFullHouse(h){ const c=rankCounts(h); return c[0]===3&&c[1]===2; }
   function isThreeOfAKind(h){ const c=rankCounts(h); return c[0]===3&&c[1]!==2; }
   function isTwoPair(h){ const c=rankCounts(h); return c[0]===2&&c[1]===2; }
   function isJacksOrBetter(h){
     const highRanks=['A','K','Q','J'];
     const c={}; h.forEach(({rank})=>{c[rank]=(c[rank]||0)+1;});
     return Object.entries(c).some(([r,n])=>n>=2&&highRanks.includes(r));
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 23: LIVE CHAT
   // ═══════════════════════════════════════════════
   
   const BOTS=[
     {name:'NautilusBot',  avatar:'🦑', msgs:['I just hit a straight flush! 🎉','Anyone else grinding Deep Reels?','The crash just went 8.5×! insane','Nice hand! Poker is the best']},
     {name:'CoralTrader',  avatar:'🪸', msgs:['Crashed at 1.2 again 😭','Red 32 keeps coming up on roulette','Free spins are where it\'s at!','This casino is 🔥']},
     {name:'AbyssWatcher', avatar:'🔱', msgs:['Big win incoming, I can feel it','Always bet max on slots 😈','RNG is rigged I swear lol','GG everyone']},
   ];
   let chatInterval;
   
   function initChat() {
     if(chatInterval) clearInterval(chatInterval);
     addSystemChat('🌊 Welcome to Abyssal Casino Live Chat!');
     chatInterval=setInterval(()=>{
       const bot=BOTS[Math.floor(Math.random()*BOTS.length)];
       const msg=bot.msgs[Math.floor(Math.random()*bot.msgs.length)];
       addChatMessage(bot.name, bot.avatar, msg, false);
     }, 8000 + Math.random()*12000);
   }
   
   function addSystemChat(msg){
     addChatMessage('SYSTEM','🐚',msg,true);
   }
   
   function addChatMessage(name, avatar, text, isSystem=false){
     const box=document.getElementById('chatMessages'); if(!box) return;
     const div=document.createElement('div'); div.className='chat-msg';
     div.innerHTML=`<span class="chat-msg-avatar">${avatar}</span><div class="chat-msg-body"><div class="chat-msg-name">${name}</div><div class="chat-msg-text ${isSystem?'win-msg':''}">${text}</div></div>`;
     box.appendChild(div); box.scrollTop=box.scrollHeight;
     while(box.children.length>60) box.removeChild(box.firstChild);
   }
   
   function toggleChat(){
     document.getElementById('chatPanel')?.classList.toggle('hidden');
   }
   
   function sendChat(){
     if(!currentUser) return;
     const inp=document.getElementById('chatInput'); if(!inp) return;
     const text=inp.value.trim(); if(!text) return;
     addChatMessage(currentUser.name, currentUser.avatar, text, false);
     inp.value='';
   }
   
   // ═══════════════════════════════════════════════
   // CUSTOM BET INPUT HANDLER
   // ═══════════════════════════════════════════════
   function applyCustomBet(game) {
     const ids = { slots:'slotsCustomBet', deep:'deepCustomBet', crash:'crashCustomBet', roulette:'rouletteCustomBet', bj:'bjCustomBet', cf:'cfCustomBet', poker:'pokerCustomBet' };
     const fns = { slots:setSlotsBet, deep:setBet, crash:setCrashBet, roulette:setRouletteBet, bj:setBjBet, cf:setCfBet, poker:setPokerBet };
     const input = document.getElementById(ids[game]);
     if (!input) return;
     const val = parseInt(input.value);
     if (isNaN(val) || val < 1) { showAlert('Enter a valid amount (min 1)', '⚠️'); return; }
     if (val > getBalance()) { showAlert('Not enough balance!', '💸'); return; }
     fns[game](val);
     input.value = '';
     input.placeholder = val.toLocaleString() + ' Kč ✓';
     setTimeout(() => { input.placeholder = 'Custom…'; }, 2000);
   }


   // ═══════════════════════════════════════════════

   const DEPOSIT_PRESETS = [500, 1000, 2500, 5000, 10000];

   function renderDeposit() {
     const el = document.getElementById('depositContent');
     if (!el || !currentUser) return;
     const bal = getBalance();
     const txHistory = (currentUser.txHistory || []).slice(0, 10);
     const txRows = txHistory.length
       ? txHistory.map(t => `<div class="history-item">
           <span class="hi-time">${new Date(t.ts).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'})}</span>
           <span class="hi-game" style="color:${t.type==='deposit'?'var(--teal)':'var(--coral)'}">${t.type==='deposit'?'DEPOSIT':'WITHDRAW'}</span>
           <span class="hi-amount ${t.type==='deposit'?'win':'loss'}">${t.type==='deposit'?'+':'−'}${t.amount.toLocaleString()} Kč</span>
         </div>`).join('')
       : '<div class="lb-empty">No transactions yet</div>';

     el.innerHTML = `
       <div style="text-align:center;margin-bottom:20px">
         <div class="sg-label" style="font-size:.65rem;letter-spacing:2px;color:var(--text-dim);font-family:var(--font-display)">CURRENT BALANCE</div>
         <div style="font-family:var(--font-display);font-size:2rem;font-weight:900;color:var(--gold);text-shadow:var(--glow-gold)">${bal.toLocaleString()} Kč</div>
       </div>
       <div style="margin-bottom:18px">
         <div class="rtp-label" style="margin-bottom:10px">QUICK DEPOSIT</div>
         <div class="bet-buttons" style="justify-content:center">
           ${DEPOSIT_PRESETS.map(n => `<button class="bet-btn" onclick="doDeposit(${n})">${n.toLocaleString()}</button>`).join('')}
         </div>
         <div style="display:flex;gap:8px;margin-top:10px">
           <input class="auth-input" id="customDepositAmt" type="number" placeholder="Custom amount…" min="1" max="100000" style="flex:1"/>
           <button class="auth-btn" style="padding:12px 20px;white-space:nowrap" onclick="doDeposit(parseInt(document.getElementById('customDepositAmt').value)||0)">DEPOSIT</button>
         </div>
       </div>
       <div style="margin-bottom:18px">
         <div class="rtp-label" style="margin-bottom:10px">WITHDRAW</div>
         <div style="display:flex;gap:8px">
           <input class="auth-input" id="withdrawAmt" type="number" placeholder="Amount to withdraw…" min="1" style="flex:1"/>
           <button class="auth-btn" style="padding:12px 20px;white-space:nowrap;background:linear-gradient(135deg,#7b2d00,#c94a00,#ff6b35)" onclick="doWithdraw(parseInt(document.getElementById('withdrawAmt').value)||0)">WITHDRAW</button>
         </div>
       </div>
       <div>
         <div class="rtp-label" style="margin-bottom:8px">TRANSACTION HISTORY</div>
         ${txRows}
       </div>
     `;
   }

   function doDeposit(amt) {
     if (!currentUser || isNaN(amt) || amt <= 0) { showAlert('Invalid amount', '⚠️'); return; }
     if (amt > 100000) { showAlert('Max deposit: 100,000 Kč', '⚠️'); return; }
     addBalance(amt);
     if (!currentUser.txHistory) currentUser.txHistory = [];
     currentUser.txHistory.unshift({ type:'deposit', amount:amt, ts:Date.now() });
     saveUserData();
     addLog(`Deposit +${amt} Kč by ${currentUser.name}`);
     showAlert(`💰 DEPOSITED!\n+${amt.toLocaleString()} Kč`, '🏦');
     renderDeposit();
   }

   function doWithdraw(amt) {
     if (!currentUser || isNaN(amt) || amt <= 0) { showAlert('Invalid amount', '⚠️'); return; }
     if (amt > getBalance()) { showAlert('Insufficient balance!', '💸'); return; }
     deductBalance(amt);
     if (!currentUser.txHistory) currentUser.txHistory = [];
     currentUser.txHistory.unshift({ type:'withdraw', amount:amt, ts:Date.now() });
     saveUserData();
     addLog(`Withdraw −${amt} Kč by ${currentUser.name}`);
     showAlert(`🏦 WITHDRAWN!\n−${amt.toLocaleString()} Kč`, '🏦');
     renderDeposit();
   }

   // ═══════════════════════════════════════════════
   // SECTION 23c: BONUS & REFERRAL SYSTEM
   // ═══════════════════════════════════════════════

   function renderBonuses() {
     const el = document.getElementById('bonusContent');
     if (!el || !currentUser) return;
     const refCode = currentUser.refCode || (currentUser.refCode = currentUser.name.slice(0,4).toUpperCase() + Math.floor(Math.random()*1000));
     saveUserData();
     const refCount = currentUser.refCount || 0;
     const vip = getVipLevel(currentUser.totalWagered || 0);
     const vipIdx = VIP_LEVELS.indexOf(vip);
     const dailyAmt = getDailyAmount();
     const dailyAvail = isDailyAvailable();

     el.innerHTML = `
       <div class="admin-section">
         <h3>🎁 DAILY REWARD</h3>
         <div class="admin-row">
           <span class="admin-label">${dailyAvail ? `Claim your daily ${dailyAmt.toLocaleString()} Kč!` : 'Already claimed — come back tomorrow'}</span>
           <button class="admin-btn" onclick="claimDaily();renderBonuses()" ${dailyAvail?'':'disabled'}>CLAIM ${dailyAmt.toLocaleString()} Kč</button>
         </div>
       </div>
       <div class="admin-section">
         <h3>🌀 FREE SPINS</h3>
         <div class="admin-row">
           <span class="admin-label">Current free spins: <b style="color:var(--gold)">${freeSpinsLeft}</b></span>
           ${vipIdx >= 2 ? `<button class="admin-btn" onclick="claimVipFreeSpins()">CLAIM VIP SPINS</button>` : '<span style="color:var(--text-dim);font-size:.65rem;font-family:var(--font-display)">Navigator+ VIP required</span>'}
         </div>
       </div>
       <div class="admin-section">
         <h3>👥 REFERRAL SYSTEM</h3>
         <div class="admin-row">
           <span class="admin-label">Your referral code: <b style="color:var(--teal);letter-spacing:3px">${refCode}</b></span>
           <button class="admin-btn" onclick="copyRefCode('${refCode}')">COPY</button>
         </div>
         <div class="admin-row">
           <span class="admin-label">Friends referred: <b style="color:var(--gold)">${refCount}</b> (+${(refCount*500).toLocaleString()} Kč earned)</span>
         </div>
         <div style="display:flex;gap:8px;margin-top:8px">
           <input class="auth-input" id="enterRefCode" placeholder="Enter a friend's code…" maxlength="8" style="flex:1"/>
           <button class="admin-btn" onclick="useRefCode()">APPLY</button>
         </div>
       </div>
       <div class="admin-section">
         <h3>👑 VIP REWARDS</h3>
         ${VIP_LEVELS.map((v,i) => `
           <div class="admin-row" style="opacity:${vipIdx>=i?1:0.4}">
             <span class="admin-label">${v.emoji} <b>${v.name}</b> — ${v.perks}</span>
             <span style="font-size:.6rem;font-family:var(--font-display);color:${vipIdx>=i?'var(--teal)':'var(--text-dim)'}">${vipIdx>=i?'✓ UNLOCKED':`${v.min.toLocaleString()} Kč to unlock`}</span>
           </div>`).join('')}
       </div>
     `;
   }

   function claimVipFreeSpins() {
     const vip = getVipLevel(currentUser?.totalWagered || 0);
     const idx = VIP_LEVELS.indexOf(vip);
     const spins = [0, 0, 5, 10, 20][idx] || 0;
     const lastKey = 'lastVipSpins';
     const last = currentUser[lastKey] || 0;
     if (Date.now() - last < 24 * 3600 * 1000) { showAlert('VIP spins already claimed today!', '⏳'); return; }
     if (spins <= 0) return;
     currentUser[lastKey] = Date.now();
     awardFreeSpins(spins);
     saveUserData();
     renderBonuses();
   }

   function copyRefCode(code) {
     navigator.clipboard?.writeText(code).then(() => showAlert(`Copied: ${code}`, '📋'));
   }

   function useRefCode() {
     if (!currentUser) return;
     const input = document.getElementById('enterRefCode');
     const code = input?.value.trim().toUpperCase();
     if (!code) return;
     if (currentUser.usedRefCode) { showAlert('Already used a referral code!', '⚠️'); return; }
     const users = loadUsers();
     const referrer = Object.values(users).find(u => u.refCode === code);
     if (!referrer) { showAlert('Invalid referral code!', '❌'); return; }
     if (referrer.name === currentUser.name) { showAlert('Cannot use your own code!', '⚠️'); return; }
     currentUser.usedRefCode = code;
     addBalance(500);
     referrer.refCount = (referrer.refCount || 0) + 1;
     addBalance.call({ currentUser: referrer }, 500); // give referrer bonus too
     referrer.balance = (referrer.balance || 0) + 500;
     users[referrer.name] = referrer;
     saveUsers(users);
     saveUserData();
     showAlert(`🎉 Referral applied!\n+500 Kč for you!\nYour friend also gets 500 Kč`, '🎁');
     addLog(`Referral used: ${currentUser.name} used code ${code}`);
     renderBonuses();
   }


   
   const ADMIN_PASS='abyss2025';
   const ADMIN_PASS_HASH=btoa(ADMIN_PASS);
   let adminLogs=[];
   
   function addLog(text, level='info'){
     const entry={ts:Date.now(), text, level};
     adminLogs.unshift(entry);
     if(adminLogs.length>100) adminLogs.pop();
   }
   
   function openAdminPanel(){
     const pass=prompt('Admin password:');
     if(!pass||btoa(pass)!==ADMIN_PASS_HASH){ showAlert('Wrong password','❌'); return; }
     renderAdmin(); openModal('adminModal');
   }
   
   function renderAdmin(){
     const el=document.getElementById('adminContent'); if(!el) return;
     const users=loadUsers(); const userCount=Object.keys(users).length;
     const logs=adminLogs.slice(0,20).map(l=>
       `<div class="log-entry"><span class="log-time">${new Date(l.ts).toLocaleTimeString()}</span><span class="log-text ${l.level}">${l.text}</span></div>`
     ).join('');
     el.innerHTML=`
       <div class="admin-section">
         <h3>⚙️ RTP CONFIGURATION</h3>
         <div class="admin-row"><span class="admin-label">Deep Reels RTP multiplier (0.5–1.5)</span><input class="admin-input" id="adminRTP" type="number" value="${rtpMult}" min="0.5" max="1.5" step="0.05"/></div>
         <div class="admin-row"><button class="admin-btn" onclick="applyRTP()">APPLY RTP</button></div>
       </div>
       <div class="admin-section">
         <h3>👥 USER MANAGEMENT (${userCount} users)</h3>
         ${Object.values(users).map(u=>`<div class="admin-row"><span class="admin-label">${u.avatar} ${u.name} — ${(u.balance||0).toLocaleString()} Kč</span><button class="admin-btn danger" onclick="wipeUser('${u.name}')">WIPE BALANCE</button></div>`).join('')}
       </div>
       <div class="admin-section">
         <h3>📋 SYSTEM LOGS</h3>
         <div class="admin-log">${logs||'<span style="color:var(--text-dim)">No logs yet</span>'}</div>
       </div>
       <div class="admin-section">
         <h3>🛑 DANGER ZONE</h3>
         <div class="admin-row"><button class="admin-btn danger" onclick="clearLeaderboard()">CLEAR LEADERBOARD</button><button class="admin-btn danger" onclick="clearAllHistory()">CLEAR ALL HISTORY</button></div>
       </div>
     `;
   }
   
   function applyRTP(){
     const v=parseFloat(document.getElementById('adminRTP')?.value);
     if(isNaN(v)||v<0.5||v>1.5){showAlert('Invalid RTP value','⚠️');return;}
     rtpMult=v; DB.set('ac_rtp',v);
     addLog(`RTP set to ${v} by admin`,'warn');
     showAlert(`RTP set to ${v}×`,'⚙️');
   }
   
   function wipeUser(name){
     const users=loadUsers();
     if(users[name]){users[name].balance=0; saveUsers(users);}
     if(currentUser?.name===name){currentUser.balance=0; syncBalance();}
     addLog(`Balance wiped for ${name}`,'warn');
     renderAdmin();
   }
   
   function clearLeaderboard(){ saveLeaderboard([]); addLog('Leaderboard cleared','warn'); showAlert('Leaderboard cleared','🗑️'); }
   function clearAllHistory(){
     const users=loadUsers(); Object.values(users).forEach(u=>{u.history=[];u.stats=freshStats();});
     saveUsers(users); if(currentUser){currentUser.history=[];currentUser.stats=freshStats();}
     addLog('All history cleared','warn'); showAlert('History cleared','🗑️');
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 25: ANTI-CHEAT / RATE LIMIT
   // ═══════════════════════════════════════════════
   
   const ACTION_TIMES={};
   const RATE_LIMITS={spin:300,flip:1400,deal:400,roulette:4800};
   
   function checkRateLimit(action){
     const now=Date.now(), limit=RATE_LIMITS[action]||300;
     if(ACTION_TIMES[action] && now-ACTION_TIMES[action]<limit){ addLog(`Rate limit hit: ${action}`,'warn'); return false; }
     ACTION_TIMES[action]=now; return true;
   }
   
   // Wrap key game functions with rate limiting
   const _origSpin=spin;
   window.spin=function(){ if(!checkRateLimit('spin')) return; _origSpin(); };
   const _origFlip=doFlip;
   window.doFlip=function(){ if(!checkRateLimit('flip')) return; _origFlip(); };
   const _origRoulette=spinRoulette;
   window.spinRoulette=function(){ if(!checkRateLimit('roulette')) return; _origRoulette(); };
   
   // ═══════════════════════════════════════════════
   // SECTION 26: BACKGROUND PARTICLES
   // ═══════════════════════════════════════════════
   
   (function initOceanParticles(){
     const canvas=document.getElementById('bgCanvas'); if(!canvas) return;
     const ctx=canvas.getContext('2d'); let W,H,particles;
     function resize(){W=canvas.width=innerWidth; H=canvas.height=innerHeight;}
     function mkParticles(){particles=Array.from({length:55},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2.5+0.5,vx:(Math.random()-.5)*.25,vy:-(Math.random()*.4+.1),alpha:Math.random()*.45+.08,hue:Math.random()>.6?175:200}));}
     function draw(){ctx.clearRect(0,0,W,H);particles.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`hsla(${p.hue},90%,65%,${p.alpha})`;ctx.fill();p.x+=p.vx;p.y+=p.vy;if(p.y<-5)p.y=H+5;if(p.x<-5)p.x=W+5;if(p.x>W+5)p.x=-5;});requestAnimationFrame(draw);}
     window.addEventListener('resize',()=>{resize();mkParticles();});resize();mkParticles();draw();
   })();
   
   (function spawnBubbles(){
     const c=document.getElementById('bubbles'); if(!c) return;
     function add(){const b=document.createElement('div');b.className='bubble';const sz=Math.random()*14+4,l=Math.random()*100,dur=Math.random()*10+8,dl=Math.random()*5;b.style.cssText=`width:${sz}px;height:${sz}px;left:${l}%;bottom:-20px;animation-duration:${dur}s;animation-delay:${dl}s;opacity:0`;c.appendChild(b);setTimeout(()=>b.remove(),(dur+dl)*1000+500);}
     setInterval(add,800); for(let i=0;i<8;i++)add();
   })();
   
   // ═══════════════════════════════════════════════
   // SECTION 27: KEYBOARD SHORTCUTS
   // ═══════════════════════════════════════════════
   
   document.addEventListener('keydown', e => {
     if (popupOpen) return;
     if (e.code==='Space' && activeGame==='slots') { e.preventDefault(); spin(); }
     if (e.code==='Space' && activeGame==='slots5') { e.preventDefault(); startSpin(); }
     if (e.code==='KeyH' && activeGame==='blackjack') bjHit();
     if (e.code==='KeyS' && activeGame==='blackjack') bjStand();
     if (e.code==='Escape') { ['paytableModal','leaderboardModal','profileModal','statsModal','historyModal','adminModal'].forEach(closeModal); }
   });
   
   // Click outside modal to close (non-auth modals)
   document.querySelectorAll('.modal-overlay:not(#authModal)').forEach(m => {
     m.addEventListener('click', e => { if(e.target===m) m.classList.add('hidden'); });
   });
   
   // ═══════════════════════════════════════════════
   // SECTION 28: BOOT
   // ═══════════════════════════════════════════════
   
   function bootApp() {
     sessionStart = getBalance();
     syncBalance();
     updateVipBadge();
     updateDailyBtn();
     updateTicker();
     buildReels();
     buildDeepReels();
     buildPaylineIndicators();
     buildPaytableStrip();
     updateUI();
     initCrashCanvas();
     initRoulette();
     renderPokerPaytable();
     initChat();
     addLog(`Session started: ${currentUser?.name}`);
   
     // Auto-open first game
     switchGame('slots5');
   
     // Check for new daily reward
     if (isDailyAvailable()) {
       setTimeout(()=>showAlert(`🎁 Daily reward available!\nClick 🎁 to claim ${getDailyAmount()} Kč`,'🎁'), 1500);
     }
   }
   
   // ═══════════════════════════════════════════════
   // SECTION 29: INIT
   // ═══════════════════════════════════════════════
   
   (function init() {
     // Check for existing session
     const sessionName = loadCurrentUser();
     if (sessionName) {
       const users = loadUsers();
       if (users[sessionName]) {
         currentUser = users[sessionName];
         hideAuthModal();
         bootApp();
         return;
       }
     }
     // Show auth modal
     openModal('authModal');
   })();

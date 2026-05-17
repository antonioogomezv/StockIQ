// ── Dark mode ────────────────────────────────────────────────
function toggleDarkMode() {
  let isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  let next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

function initTheme() {
  let saved = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', saved);

  // Follow system changes live, but only if the user hasn't manually picked a theme
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
    if (localStorage.getItem('theme')) return;
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  });
}
// ── END dark mode ────────────────────────────────────────────

// ── Market hours ─────────────────────────────────────────────
function isMarketOpen() {
  try {
    var etStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    var et = new Date(etStr);
    var day = et.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;
    var mins = et.getHours() * 60 + et.getMinutes();
    return mins >= 570 && mins < 960; // 9:30 AM – 4:00 PM ET
  } catch(e) { return false; }
}
// ── END market hours ─────────────────────────────────────────

let _toastTimer = null;
let _undoFn = null;
var _showFirstPortfolioBanner = false;

// ── XP PROGRESSIVE LEARNING SYSTEM ────────────────────────────────────────
var _userXP = 0;

var _XP_TIERS = [
  { tier: 1, name: 'Beginner',     minXP: 0,   next: 50  },
  { tier: 2, name: 'Explorer',     minXP: 50,  next: 150 },
  { tier: 3, name: 'Analyst',      minXP: 150, next: 350 },
  { tier: 4, name: 'Advanced',     minXP: 350, next: null },
];

function getUserLevel() {
  for (var i = _XP_TIERS.length - 1; i >= 0; i--) {
    if (_userXP >= _XP_TIERS[i].minXP) return _XP_TIERS[i];
  }
  return _XP_TIERS[0];
}

function addXP(amount) {
  var prevTier = getUserLevel().tier;
  _userXP = Math.max(0, _userXP + amount);
  saveToFirestore({ xp: _userXP });
  var newLevel = getUserLevel();
  if (newLevel.tier > prevTier) _showLevelUpToast(newLevel);
  refreshXPProgress();
}

var _XP_UNLOCK_MSG = {
  2: '4 Pillars + full 14-factor breakdown',
  3: 'Key Stats — P/E, beta, margins, market cap and more',
  4: 'Advanced mode — you\'ve analyzed stocks like a pro'
};

function _showLevelUpToast(level) {
  var msg = _XP_UNLOCK_MSG[level.tier] || 'more features';
  showToast('Level up! You are now ' + level.name + '. Unlocked: ' + msg);
}

function buildLockedCard(tierName, xpNeeded, desc) {
  return '<div class="locked-section-card">' +
    '<svg class="locked-icon-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
    '<div class="locked-card-body">' +
      '<div class="locked-card-title">Unlocks at ' + tierName + ' (' + xpNeeded + ' XP)</div>' +
      '<div class="locked-card-desc">' + desc + '</div>' +
    '</div>' +
  '</div>';
}

function hasCompletedQuizFor(ticker) {
  var done = JSON.parse(localStorage.getItem('quiz-done-tickers') || '[]');
  return done.indexOf(ticker.toUpperCase()) !== -1;
}

function markQuizCompletedFor(ticker) {
  var done = JSON.parse(localStorage.getItem('quiz-done-tickers') || '[]');
  var t = ticker.toUpperCase();
  if (done.indexOf(t) === -1) { done.push(t); localStorage.setItem('quiz-done-tickers', JSON.stringify(done)); }
}

function buildQuizLockedCard(name) {
  return '<div class="locked-section-card">' +
    '<svg class="locked-icon-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
    '<div class="locked-card-body">' +
      '<div class="locked-card-title">Take the quiz to unlock</div>' +
      '<div class="locked-card-desc">Answer the ' + escHtml(name) + ' quiz to see the full 4-pillar breakdown and 14 factors</div>' +
      '<button class="locked-quiz-btn" onclick="openStockQuiz()">Take quiz →</button>' +
    '</div>' +
  '</div>';
}

function _unlockBreakdownAfterQuiz() {
  var expEl = document.getElementById('explanation');
  if (!expEl || !window._lastFactorBarsHTML) return;
  expEl.innerHTML = window._lastFactorBarsHTML;
  if (window._lastPillarsResult) {
    var ps = buildPillarSummary(window._lastPillarsResult);
    var heading = "<div class='pillar-section-label'>4 PILLARS</div>";
    var factorHeading = "<div class='pillar-section-label' style='margin-top:20px;'>14 FACTORS</div>";
    expEl.innerHTML = heading + ps + factorHeading + expEl.innerHTML;
  }
  // Open the deep-dive section so the unlocked breakdown is visible
  var ddSection = document.getElementById('deep-dive-section');
  if (ddSection) ddSection.style.display = 'block';
  expEl.style.display = 'block';
  var detailsBtn = document.getElementById('show-details-btn');
  if (detailsBtn) detailsBtn.innerHTML = "Full Analysis <span style='float:right;'>▴</span>";
  showDecisionPoint2(currentName);
}

function refreshXPProgress() {
  var bar   = document.getElementById('xp-progress-bar');
  var label = document.getElementById('xp-progress-label');
  var badge = document.getElementById('xp-tier-badge');
  if (!bar) return;
  var level = getUserLevel();
  if (badge) badge.textContent = level.name;
  if (level.next === null) {
    bar.style.width = '100%';
    if (label) label.textContent = _userXP + ' XP — Max Level';
  } else {
    var pct = Math.round((_userXP - level.minXP) / (level.next - level.minXP) * 100);
    bar.style.width = pct + '%';
    var nextName = _XP_TIERS[level.tier] ? _XP_TIERS[level.tier].name : '';
    if (label) label.textContent = _userXP + ' / ' + level.next + ' XP to ' + nextName;
  }
}
// ── END XP SYSTEM ──────────────────────────────────────────────────────────
function showToast(msg) {
  let el = document.getElementById("toast");
  _undoFn = null;
  el.innerHTML = '<span>' + escHtml(msg) + '</span>';
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { el.classList.remove("show"); }, 3000);
}
function showUndoToast(msg, undoCallback) {
  _undoFn = undoCallback;
  let el = document.getElementById("toast");
  el.innerHTML = '<span>' + escHtml(msg) + '</span><button class="toast-undo-btn" onclick="_undoFn&&_undoFn()">Undo</button>';
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { el.classList.remove("show"); _undoFn = null; }, 3500);
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function parseMarkdown(text) {
  return text
    .replace(/^### (.*?)$/gm, "<strong style='font-size:13px;color:var(--text);display:block;margin-top:10px;margin-bottom:4px;'>$1</strong>")
    .replace(/^## (.*?)$/gm, "<strong style='font-size:14px;color:var(--text);display:block;margin-top:12px;margin-bottom:6px;'>$1</strong>")
    .replace(/^# (.*?)$/gm, "<strong style='font-size:15px;color:var(--text);display:block;margin-bottom:8px;'>$1</strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

// API calls are proxied through Netlify functions — keys never reach the browser
var _isNetlify = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

function finnhubUrl(path, params) {
  if (_isNetlify) {
    var q = Object.keys(params || {}).map(function(k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return '/.netlify/functions/finnhub?_path=' + encodeURIComponent(path) + (q ? '&' + q : '');
  }
  var key = window.FINNHUB_KEY || '';
  var q = Object.keys(params || {}).map(function(k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  return 'https://finnhub.io' + path + '?token=' + key + (q ? '&' + q : '');
}

function polygonUrl(path, params) {
  if (_isNetlify) {
    var q = Object.keys(params || {}).map(function(k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return '/.netlify/functions/polygon?_path=' + encodeURIComponent(path) + (q ? '&' + q : '');
  }
  var key = window.POLYGON_KEY || '';
  var q = Object.keys(params || {}).map(function(k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  return 'https://api.polygon.io' + path + '?apiKey=' + key + (q ? '&' + q : '');
}

function anthropicFetch(body) {
  if (_isNetlify) {
    return fetch('/.netlify/functions/anthropic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': window.ANTHROPIC_KEY || '', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body)
  });
}

let finnhubKey   = window.FINNHUB_KEY;
let polygonKey   = window.POLYGON_KEY;
let anthropicKey = window.ANTHROPIC_KEY;
let cache = {};

// ── Shared Firestore price cache ─────────────────────────────────────────────
// All authenticated users read from / write to sharedCache/prices in Firestore.
// TTL: 2 minutes for screener (135 stocks), 1 minute for market/trending.
// Only the first user whose cache is stale makes Finnhub calls — everyone else
// gets the result for free.

var _sharedPriceCache = null; // in-memory copy for this session

function getSharedPrices(symbols, ttlMs) {
  // 1. Check in-memory first — only use if ALL requested symbols are present
  if (_sharedPriceCache && _sharedPriceCache.ts && (Date.now() - _sharedPriceCache.ts < ttlMs)) {
    var missing = symbols.filter(function(s) { return !_sharedPriceCache.data[s]; });
    if (missing.length === 0) {
      var hit = {};
      symbols.forEach(function(s) { hit[s] = _sharedPriceCache.data[s]; });
      return Promise.resolve(hit);
    }
    // Some symbols missing from cache — fetch just the missing ones
    return _fetchAndCachePrices(missing, _sharedPriceCache.data).then(function(fetched) {
      var result = {};
      symbols.forEach(function(s) { if (_sharedPriceCache.data[s] || fetched[s]) result[s] = _sharedPriceCache.data[s] || fetched[s]; });
      return result;
    });
  }

  // 2. Check Firestore shared cache
  return db.collection('sharedCache').doc('prices').get()
    .then(function(doc) {
      var stored = doc.exists ? doc.data() : {};
      var age = stored.ts ? (Date.now() - stored.ts) : Infinity;
      var cachedData = stored.data || {};
      if (age < ttlMs && Object.keys(cachedData).length > 0) {
        _sharedPriceCache = stored;
        // Fetch only the symbols not in cache
        var missing = symbols.filter(function(s) { return !cachedData[s]; });
        if (missing.length === 0) {
          var hit = {};
          symbols.forEach(function(s) { hit[s] = cachedData[s]; });
          return hit;
        }
        return _fetchAndCachePrices(missing, cachedData).then(function(fetched) {
          var result = {};
          symbols.forEach(function(s) { if (cachedData[s] || fetched[s]) result[s] = cachedData[s] || fetched[s]; });
          return result;
        });
      }
      // Cache stale or empty — fetch all
      return _fetchAndCachePrices(symbols, cachedData);
    })
    .catch(function() {
      return _fetchAndCachePrices(symbols, {});
    });
}

function _fetchAndCachePrices(symbols, existing) {
  var priceMap = Object.assign({}, existing);
  var delay = 0;
  var promises = symbols.map(function(sym) {
    var d = delay; delay += 200;
    return new Promise(function(resolve) {
      setTimeout(function() {
        fetch(finnhubUrl('/api/v1/quote', {symbol: sym}))
          .then(function(r) { return r.json(); })
          .then(function(q) {
            var price = q.c > 0 ? q.c : (q.pc > 0 ? q.pc : 0);
            if (price > 0) {
              priceMap[sym] = { price: price, changePct: q.dp || 0, change: q.d || (q.pc > 0 ? q.c - q.pc : 0), prevClose: q.pc || 0 };
              // Persist last-known price as offline/rate-limit fallback
              var lkp = JSON.parse(localStorage.getItem('lkp') || '{}');
              lkp[sym] = priceMap[sym];
              localStorage.setItem('lkp', JSON.stringify(lkp));
              if (q.dp) {
                var lk = JSON.parse(localStorage.getItem('screener-changepct-last') || '{}');
                lk[sym] = q.dp;
                localStorage.setItem('screener-changepct-last', JSON.stringify(lk));
              }
            } else {
              // Rate-limited or API error — fall back to last known price
              var lkp = JSON.parse(localStorage.getItem('lkp') || '{}');
              if (lkp[sym]) { priceMap[sym] = lkp[sym]; }
              if (q.error) console.warn('Finnhub:', sym, q.error);
            }
          })
          .catch(function() {
            // Network error — fall back to last known price
            var lkp = JSON.parse(localStorage.getItem('lkp') || '{}');
            if (lkp[sym]) { priceMap[sym] = lkp[sym]; }
          })
          .then(resolve);
      }, d);
    });
  });
  return Promise.all(promises).then(function() {
    var record = { ts: Date.now(), data: priceMap };
    _sharedPriceCache = record;
    db.collection('sharedCache').doc('prices').set(record).catch(function() {});
    var result = {};
    symbols.forEach(function(s) { if (priceMap[s]) result[s] = priceMap[s]; });
    return result;
  });
}
// ─────────────────────────────────────────────────────────────────────────────
let chartInstance = null;
let currentTicker = null;
let currentScore = null;

function getChartTheme() {
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    grid:         isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    tick:         isDark ? '#8896a5' : '#64748b',
    volume:       isDark ? 'rgba(14,165,233,0.18)' : 'rgba(14,165,233,0.15)',
    tooltipBg:    '#1e293b',
    tooltipBorder:'#334155',
    tooltipTitle: '#f1f5f9',
    tooltipBody:  '#94a3b8'
  };
}

function formatChartDate(dateStr, range) {
  var dt = new Date(dateStr + 'T12:00:00');
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (range === '1W' || range === '1M') {
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  }
  if (range === '3M' || range === '6M') {
    return months[dt.getMonth()] + ' ' + dt.getDate();
  }
  return months[dt.getMonth()] + " '" + String(dt.getFullYear()).slice(2);
}
let currentName = null;
let userProfile = null;

// ── CURRENCY ─────────────────────────────────────────────────────────────────
let _currency = localStorage.getItem('currency') || 'USD';
let _fxRate   = 1;
let _fxSym    = '$';

function fmt$(amount, decimals) {
  var d = decimals !== undefined ? decimals : 2;
  var v = amount * _fxRate;
  return _fxSym + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtSigned$(amount) {
  var v = amount * _fxRate;
  var abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v >= 0 ? '+' : '-') + _fxSym + abs;
}

function _applyRateAndRerender() {
  // Re-render active tab
  if (document.getElementById('nav-portfolio').classList.contains('active')) renderPortfolio();
  else if (document.getElementById('nav-watchlist').classList.contains('active')) renderWatchlist();
  else if (allTrendingData && allTrendingData.length) renderTrending(allTrendingData);
  // Always refresh market bar prices
  loadMarketOverview();
}

function fetchFxRate(callback) {
  if (_currency === 'USD') { _fxRate = 1; _fxSym = '$'; if (callback) callback(); return; }
  var cached = JSON.parse(localStorage.getItem('fx-usdmxn') || 'null');
  if (cached && cached.rate && (Date.now() - cached.ts < 43200000)) {
    _fxRate = cached.rate; _fxSym = 'MX$'; if (callback) callback(); return;
  }
  fetch('/.netlify/functions/fx-rate')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var rate = data && data.rate;
      if (rate && rate > 1) {
        _fxRate = rate; _fxSym = 'MX$';
        localStorage.setItem('fx-usdmxn', JSON.stringify({ rate: rate, ts: Date.now() }));
      } else {
        var cached2 = JSON.parse(localStorage.getItem('fx-usdmxn') || 'null');
        _fxRate = (cached2 && cached2.rate) || 17.5;
        _fxSym = 'MX$';
      }
      if (callback) callback();
    })
    .catch(function() {
      var cached2 = JSON.parse(localStorage.getItem('fx-usdmxn') || 'null');
      _fxRate = (cached2 && cached2.rate) || 17.5;
      _fxSym = 'MX$';
      if (callback) callback();
    });
}

function setCurrency(code) {
  _currency = code;
  localStorage.setItem('currency', code);
  fetchFxRate(function() {
    _updateCurrencyLabels();
    _applyRateAndRerender();
  });
}

function _updateCurrencyLabels() {
  // Header button
  var btn = document.getElementById('currency-toggle');
  if (btn) {
    btn.textContent = _currency === 'MXN' ? 'MX$' : 'USD';
    btn.classList.toggle('active', _currency === 'MXN');
  }
  // Portfolio buy-price placeholder
  var priceInput = document.getElementById('port-price');
  if (priceInput) priceInput.placeholder = _currency === 'MXN' ? 'Buy price MX$' : 'Buy price $';
  // Quiz step 4 budget range labels
  var labels = _currency === 'MXN'
    ? ['Menos de MX$20,000', 'MX$20,000 – MX$100,000', 'MX$100,000 – MX$400,000', 'MX$400,000+']
    : ['Under $1,000', '$1,000 – $5,000', '$5,000 – $20,000', '$20,000+'];
  ['q4-opt1','q4-opt2','q4-opt3','q4-opt4'].forEach(function(id, i) {
    var el = document.getElementById(id);
    if (el) el.textContent = labels[i];
  });
}

function initCurrency() {
  if (_currency === 'MXN') {
    fetchFxRate(function() { _updateCurrencyLabels(); });
  } else {
    _fxRate = 1; _fxSym = '$';
    _updateCurrencyLabels();
  }
}
// ── END CURRENCY ──────────────────────────────────────────────────────────────

function _profileIcon(type) {
  if (type === 'Conservative') return '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
  if (type === 'Aggressive')  return '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="3 6 12 3 21 6"/><line x1="3" y1="6" x2="3" y2="13"/><line x1="21" y1="6" x2="21" y2="13"/><path d="M3 13a3 3 0 0 0 6 0H3z"/><path d="M15 13a3 3 0 0 0 6 0h-6z"/></svg>';
}
let quizAnswers = {};
let portfolioChartInstance = null;
let portfolioLineChartInstance = null;
let allChartPrices = [];
let allChartDates = [];
let allChartVolumes = [];
let allChartOHLC = [];
let _chartMode = 'line'; // 'line' | 'candle'
let _chartOHLCSlice = [];
let chartPrevClose = 0;
let chartDayHigh = 0;
let chartDayLow = 0;
let chartWeek52High = 0;
let wlSort = 'score'; // 'score' | 'change' | 'ticker'
let _spyBenchmark = null; // null=unfetched, false=unavailable, object=cached result

let sectorAverages = {
  "Technology": { pe: 25, margin: 18, growth: 12, beta: 1.2, debt: 0.8 },
  "Financial Services": { pe: 14, margin: 20, growth: 8, beta: 1.1, debt: 2.5 },
  "Healthcare": { pe: 22, margin: 12, growth: 9, beta: 0.8, debt: 0.6 },
  "Consumer Cyclical": { pe: 20, margin: 8, growth: 7, beta: 1.1, debt: 1.0 },
  "Consumer Defensive": { pe: 18, margin: 7, growth: 5, beta: 0.6, debt: 1.0 },
  "Industrials": { pe: 19, margin: 9, growth: 7, beta: 1.0, debt: 0.9 },
  "Energy": { pe: 12, margin: 10, growth: 5, beta: 1.2, debt: 0.7 },
  "Real Estate": { pe: 35, margin: 25, growth: 4, beta: 0.8, debt: 2.0 },
  "Utilities": { pe: 16, margin: 12, growth: 3, beta: 0.4, debt: 1.5 },
  "Communication Services": { pe: 18, margin: 14, growth: 8, beta: 1.0, debt: 0.9 },
  "Basic Materials": { pe: 15, margin: 10, growth: 6, beta: 1.0, debt: 0.7 }
};

function showTab(name) {
  document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'portfolio') renderPortfolio();
  if (name === 'profile') renderProfile();
  if (name === 'watchlist') renderWatchlist();
  if (name === 'learn') renderLearnTab();
  if (name === 'analyze') {
    // Restore screener whenever user returns to the analyze tab
    var sp = document.getElementById('screener-panel');
    var rs = document.getElementById('results-section');
    if (sp && rs && rs.style.display === 'none') sp.style.display = 'block';
    renderAnalyzeChallengeBanner();
  }
}

let _autocompleteTimer = null;

function onSearchInput() {
  let query = document.getElementById('stock-input').value.trim();
  let dropdown = document.getElementById('search-dropdown');
  clearTimeout(_autocompleteTimer);
  if (query.length < 2) { dropdown.style.display = 'none'; return; }
  _autocompleteTimer = setTimeout(function() {
    fetch(finnhubUrl('/api/v1/search', {q: query}))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.result || data.result.length === 0) { dropdown.style.display = 'none'; return; }
        let items = data.result.filter(function(r) { return r.type === 'Common Stock'; }).slice(0, 5);
        if (items.length === 0) { dropdown.style.display = 'none'; return; }
        dropdown.innerHTML = items.map(function(item) {
          return "<div class='autocomplete-item' onmousedown='selectAutocomplete(\"" + item.symbol + "\")'>" +
            "<span class='autocomplete-ticker'>" + escHtml(item.symbol) + "</span>" +
            "<span class='autocomplete-name'>" + escHtml(item.description) + "</span>" +
            "</div>";
        }).join('');
        dropdown.style.display = 'block';
      })
      .catch(function() { dropdown.style.display = 'none'; });
  }, 300);
}

function selectAutocomplete(ticker) {
  document.getElementById('stock-input').value = ticker;
  document.getElementById('search-dropdown').style.display = 'none';
  searchStock();
}

function hideDropdown() {
  setTimeout(function() { document.getElementById('search-dropdown').style.display = 'none'; }, 150);
}

let _portAutocompleteTimer = null;

function onPortTickerInput() {
  let query = document.getElementById('port-ticker').value.trim();
  var priceBtn = document.getElementById('port-use-price-btn');
  if (priceBtn) priceBtn.style.display = query.length >= 1 ? 'block' : 'none';
  let dropdown = document.getElementById('port-ticker-dropdown');
  clearTimeout(_portAutocompleteTimer);
  if (query.length < 2) { dropdown.style.display = 'none'; return; }
  _portAutocompleteTimer = setTimeout(function() {
    fetch(finnhubUrl('/api/v1/search', {q: query}))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.result || data.result.length === 0) { dropdown.style.display = 'none'; return; }
        let items = data.result.filter(function(r) { return r.type === 'Common Stock'; }).slice(0, 5);
        if (items.length === 0) { dropdown.style.display = 'none'; return; }
        dropdown.innerHTML = items.map(function(item) {
          return "<div class='autocomplete-item' onmousedown='selectPortAutocomplete(\"" + item.symbol + "\")'>" +
            "<span class='autocomplete-ticker'>" + escHtml(item.symbol) + "</span>" +
            "<span class='autocomplete-name'>" + escHtml(item.description) + "</span>" +
            "</div>";
        }).join('');
        dropdown.style.display = 'block';
      })
      .catch(function() { dropdown.style.display = 'none'; });
  }, 300);
}

var _THESIS_LABELS = {
  value:     'Value play',
  growth:    'Growth story',
  dividend:  'Dividend income',
  trend:     'Following a trend',
  exploring: 'Just exploring'
};

function selectThesis(btn) {
  document.querySelectorAll('.thesis-chip').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
}

function getSelectedThesis() {
  var active = document.querySelector('.thesis-chip.selected');
  return active ? active.getAttribute('data-thesis') : null;
}

function clearThesisSelection() {
  document.querySelectorAll('.thesis-chip').forEach(function(b) { b.classList.remove('selected'); });
}

function checkThesisMismatch(ticker, thesis) {
  if (!window._currentMetrics || currentTicker !== ticker) return null;
  var m = window._currentMetrics;
  var name = ticker;

  if (thesis === 'value') {
    if (m.pe > 25) return {
      data: name + ' has a P/E of ' + m.pe.toFixed(1) + 'x — above the average of ~20x for most stocks.',
      question: 'What makes you see ' + name + ' as underpriced at this valuation?'
    };
    if (m.price > 0 && m.week52High > 0 && m.price >= m.week52High * 0.92) return {
      data: name + ' is within 8% of its 52-week high — not a typical entry point for value investing.',
      question: 'Value plays usually enter when a stock is beaten down. What\'s your case here?'
    };
  }

  if (thesis === 'growth') {
    if (m.growth <= 5) return {
      data: name + '\'s revenue growth is ' + (m.growth > 0 ? '+' : '') + m.growth.toFixed(1) + '% — ' + (m.growth <= 0 ? 'declining.' : 'relatively flat.'),
      question: 'What growth are you expecting that the current numbers don\'t yet show?'
    };
  }

  if (thesis === 'dividend') {
    if ((window._currentDivYield || 0) === 0) return {
      data: name + ' does not currently pay a dividend.',
      question: 'Are you expecting them to start one, or is there another income angle here?'
    };
  }

  if (thesis === 'trend') {
    var belowMa = m.ma50 && m.price < m.ma50;
    var oversold = m.rsi && m.rsi < 40;
    if (belowMa || oversold) return {
      data: belowMa
        ? name + ' is trading below its 50-day average — currently in a downtrend.'
        : 'RSI is ' + m.rsi + ' — the stock has been selling off recently.',
      question: 'What trend are you following? Is this a reversal bet?'
    };
  }

  return null;
}

function showThesisChallenge(challenge) {
  var el = document.getElementById('thesis-challenge');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML =
    '<div class="thesis-challenge-data">' + escHtml(challenge.data) + '</div>' +
    '<div class="thesis-challenge-question">' + escHtml(challenge.question) + '</div>' +
    '<textarea id="thesis-reasoning-input" class="thesis-reasoning-input" placeholder="Your reasoning (optional)…" rows="2"></textarea>' +
    '<div class="thesis-challenge-actions">' +
      '<button class="thesis-proceed-btn" onclick="_doAddToPortfolio()">Add anyway</button>' +
      '<button class="thesis-change-btn" onclick="dismissThesisChallenge()">Change thesis</button>' +
    '</div>';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function dismissThesisChallenge() {
  var el = document.getElementById('thesis-challenge');
  if (el) el.style.display = 'none';
}

function prefillTodayDate() {
  var d = new Date();
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  document.getElementById('port-date').value = yyyy + '-' + mm + '-' + dd;
}

function prefillCurrentPrice() {
  var ticker = document.getElementById('port-ticker').value.trim().toUpperCase();
  if (!ticker) return;
  var btn = document.getElementById('port-use-price-btn');
  var priceEl = document.getElementById('port-price');
  if (btn) btn.textContent = 'Fetching…';
  fetch(finnhubUrl('/api/v1/quote', { symbol: ticker }))
    .then(function(r) { return r.json(); })
    .then(function(q) {
      if (q && q.c > 0) {
        priceEl.value = q.c.toFixed(2);
        if (btn) btn.textContent = 'Use today\'s price →';
      } else {
        if (btn) btn.textContent = 'Price unavailable';
        setTimeout(function() { if (btn) btn.textContent = 'Use today\'s price →'; }, 2000);
      }
    })
    .catch(function() {
      if (btn) btn.textContent = 'Use today\'s price →';
    });
}

function onPortDateChange() {
  let ticker = document.getElementById('port-ticker').value.trim().toUpperCase();
  let dateVal = document.getElementById('port-date').value;
  if (!ticker || !dateVal) return;

  // Don't overwrite if user already typed a price
  let priceEl = document.getElementById('port-price');
  let loadingEl = document.getElementById('port-price-loading');

  // Check it's a past date
  let selected = new Date(dateVal);
  let today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selected >= today) return; // today or future — use live price

  priceEl.value = '';
  if (loadingEl) { loadingEl.style.display = 'inline'; loadingEl.textContent = '...'; }

  // Try the selected date first, then fall back up to 5 days for weekends/holidays
  function tryDate(dateStr, triesLeft) {
    fetch(polygonUrl('/v1/open-close/' + ticker + '/' + dateStr, {adjusted: 'true'}))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.close) {
          priceEl.value = data.close.toFixed(2);
          if (loadingEl) { loadingEl.style.display = 'inline'; loadingEl.textContent = dateStr !== dateVal ? 'Used ' + dateStr : ''; setTimeout(function() { if (loadingEl) loadingEl.style.display = 'none'; }, 2000); }
        } else if (triesLeft > 0) {
          // Move back one day (weekend/holiday)
          let d = new Date(dateStr + 'T00:00:00');
          d.setDate(d.getDate() - 1);
          let prev = d.toISOString().split('T')[0];
          tryDate(prev, triesLeft - 1);
        } else {
          if (loadingEl) loadingEl.style.display = 'none';
        }
      })
      .catch(function() { if (loadingEl) loadingEl.style.display = 'none'; });
  }

  tryDate(dateVal, 5);
}

function hidePortDropdown() {
  setTimeout(function() { document.getElementById('port-ticker-dropdown').style.display = 'none'; }, 150);
}

function selectPortAutocomplete(ticker) {
  document.getElementById('port-ticker').value = ticker;
  document.getElementById('port-ticker-dropdown').style.display = 'none';
  var priceBtn = document.getElementById('port-use-price-btn');
  if (priceBtn) priceBtn.style.display = 'block';
  let loadingEl = document.getElementById('port-price-loading');
  let priceEl = document.getElementById('port-price');
  priceEl.value = '';
  if (loadingEl) loadingEl.style.display = 'inline';
  getSharedPrices([ticker], 60000).then(function(m) {
    if (loadingEl) loadingEl.style.display = 'none';
    var price = (m[ticker] || {}).price;
    if (price) priceEl.value = price.toFixed(2);
  }).catch(function() { if (loadingEl) loadingEl.style.display = 'none'; });
}

function saveSearchHistory(ticker, name) {
  let history = JSON.parse(localStorage.getItem('search-history') || '[]');
  history = history.filter(function(h) { return h.ticker !== ticker; });
  history.unshift({ ticker: ticker, name: name });
  if (history.length > 5) history = history.slice(0, 5);
  localStorage.setItem('search-history', JSON.stringify(history));
  renderSearchHistory();
}

function renderSearchHistory() {
  let el = document.getElementById('search-history');
  if (!el) return;
  let history = JSON.parse(localStorage.getItem('search-history') || '[]');
  if (history.length === 0) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = '<span class="search-history-label">Recent:</span>' +
    history.map(function(h) {
      return "<button class='search-history-chip' onclick='quickSearch(\"" + escHtml(h.ticker) + "\")'>" + escHtml(h.ticker) + "</button>";
    }).join('') +
    "<button class='search-history-clear' onclick='clearSearchHistory()'>Clear</button>";
}

function clearSearchHistory() {
  localStorage.removeItem('search-history');
  renderSearchHistory();
}

function searchStock() {
  let query = document.getElementById("stock-input").value.trim().toUpperCase();
  if (!query) { showToast("Please enter a company name or ticker!"); return; }
  hideQuickTickers();
  var sp = document.getElementById('screener-panel');
  if (sp) sp.style.display = 'none';

  document.getElementById("loading").style.display = "block";
  let loadingTickerEl = document.getElementById("loading-ticker");
  if (loadingTickerEl) loadingTickerEl.textContent = query;
  document.getElementById("stock-name").innerHTML = "";
  document.getElementById("health-score").innerHTML = "";
  document.getElementById("explanation").textContent = "";
  let aiBox = document.getElementById("ai-explanation");
  if (aiBox) aiBox.style.display = "none";
  let actionBtns = document.getElementById("action-btns");
  if (actionBtns) actionBtns.style.display = "none";
  let brokerHintEl = document.getElementById('broker-hint');
  if (brokerHintEl) brokerHintEl.style.display = 'none';
  let aboutCard = document.getElementById('company-about');
  if (aboutCard) aboutCard.style.display = 'none';
  let fundCard = document.getElementById('fundamentals-card');
  if (fundCard) fundCard.style.display = 'none';
  let earningsCard = document.getElementById('earnings-card');
  if (earningsCard) earningsCard.style.display = 'none';
  let scoreExp = document.getElementById('score-explainer-card');
  if (scoreExp) scoreExp.style.display = 'none';
  let ctxTerms = document.getElementById('contextual-terms');
  if (ctxTerms) ctxTerms.style.display = 'none';
  let newsSection = document.getElementById('news-section');
  if (newsSection) newsSection.style.display = 'none';
  var ddSection = document.getElementById('deep-dive-section');
  if (ddSection) ddSection.style.display = 'none';
  var detailsBtn = document.getElementById('show-details-btn');
  if (detailsBtn) detailsBtn.style.display = 'none';

  if (cache[query]) { displayData(cache[query]); return; }

  fetch(finnhubUrl("/api/v1/search", {q: query}))
    .then(function(r) { return r.json(); })
    .then(function(searchData) {
      let ticker = query;
      let isEtf = false;
      if (searchData.result && searchData.result.length > 0) {
        ticker = searchData.result[0].symbol;
        isEtf = searchData.result[0].type === 'ETP';
      }

      let today = new Date();
      let toDate = today.toISOString().split("T")[0];
      let fromDate2Y = new Date(today); fromDate2Y.setFullYear(today.getFullYear() - 2);
      let fromDate2YStr = fromDate2Y.toISOString().split("T")[0];
      let fromDate30 = new Date(today); fromDate30.setDate(today.getDate() - 30);
      let fromDate30Str = fromDate30.toISOString().split("T")[0];

      // Cache key "poly2_" busts old 90-day caches
      let _cachedRaw = localStorage.getItem("poly2_" + ticker);
      let _cachedEntry = _cachedRaw ? JSON.parse(_cachedRaw) : null;
      let _cacheValid = _cachedEntry && _cachedEntry.ts && (Date.now() - _cachedEntry.ts < 86400000);
      let historyPromise = _cacheValid
        ? Promise.resolve(_cachedEntry.data)
        : fetch(polygonUrl("/v2/aggs/ticker/" + ticker + "/range/1/day/" + fromDate2YStr + "/" + toDate, { limit: '730', sort: 'asc' })).then(function(r) { return r.json(); });

      let earningsFrom = toDate;
      let earningsTo = new Date(today); earningsTo.setDate(today.getDate() + 90);
      let earningsToStr = earningsTo.toISOString().split("T")[0];

      // Load core data first (no chart) — show results immediately
      Promise.all([
        fetch(finnhubUrl("/api/v1/quote", {symbol: ticker})).then(function(r) { return r.json(); }),
        fetch(finnhubUrl("/api/v1/stock/profile2", {symbol: ticker})).then(function(r) { return r.json(); }),
        fetch(finnhubUrl("/api/v1/company-news", {symbol: ticker, from: fromDate30Str, to: toDate})).then(function(r) { return r.json(); }),
        fetch(finnhubUrl("/api/v1/stock/metric", {symbol: ticker, metric: "all"})).then(function(r) { return r.json(); }),
        fetch(finnhubUrl("/api/v1/calendar/earnings", {symbol: ticker, from: earningsFrom, to: earningsToStr})).then(function(r) { return r.json(); }).catch(function() { return {}; }),
        fetch(finnhubUrl("/api/v1/stock/earnings", {symbol: ticker, limit: "1"})).then(function(r) { return r.json(); }).catch(function() { return []; }),
        fetch(polygonUrl("/v3/reference/tickers/" + ticker, {})).then(function(r) { return r.json(); }).catch(function() { return {}; }),
        isEtf ? fetch(finnhubUrl("/api/v1/etf/profile", {symbol: ticker})).then(function(r) { return r.json(); }).catch(function() { return {}; }) : Promise.resolve({}),
        isEtf ? fetch(finnhubUrl("/api/v1/etf/holdings", {symbol: ticker})).then(function(r) { return r.json(); }).catch(function() { return {}; }) : Promise.resolve({})
      ]).then(function(results) {
        let quote      = results[0];
        let profile    = results[1];
        let news       = results[2];
        let metrics    = results[3].metric || {};
        let earningsData = results[4];
        let pastEarnings = results[5];
        let tickerDetails = results[6].results || {};
        let etfProfile = results[7] || {};
        let etfHoldings = results[8] || {};
        if (tickerDetails.description) profile.description = tickerDetails.description;
        // Polygon type=ETF is a secondary ETF detection (overrides search result type)
        if (tickerDetails.type === 'ETF') isEtf = true;

        // Unsupported ticker — no price and no company name means Finnhub doesn't cover it
        if (!quote.c && !profile.name) {
          document.getElementById("loading").style.display = "none";
          let isMXq = ticker.endsWith('.MX');
          showToast("\"" + ticker + "\" isn't supported." + (isMXq ? " Try the full ticker, e.g. AMXL.MX" : " StockIQ covers US-listed stocks and major Mexican tickers (.MX)."));
          return;
        }

        let data = { ticker, quote, profile, news, metrics, prices: [], dates: [], volumes: [], ohlc: [], earningsData, pastEarnings, isEtf, etfProfile, etfHoldings };
        cache[query] = data;
        displayData(data);

        // Load chart separately — doesn't block the main results
        historyPromise.then(function(history) {
          let prices = [], dates = [], volumes = [], ohlc = [];
          if (history.results && history.results.length > 0) {
            localStorage.setItem("poly2_" + ticker, JSON.stringify({ ts: Date.now(), data: history }));
            history.results.forEach(function(bar) {
              dates.push(new Date(bar.t).toISOString().split("T")[0]);
              prices.push(bar.c);
              volumes.push(bar.v || 0);
              ohlc.push({ o: bar.o || bar.c, h: bar.h || bar.c, l: bar.l || bar.c, c: bar.c });
            });
          }
          cache[query].prices  = prices;
          cache[query].dates   = dates;
          cache[query].volumes = volumes;
          cache[query].ohlc    = ohlc;
          let q = cache[query].quote || {};
          loadChart(prices, dates, volumes, ohlc, q.pc || 0, q.h || 0, q.l || 0, metrics['52WeekHigh'] || 0);
          updateTechnicalFactors(prices, q.c || 0);
        }).catch(function() {});
      });
    })
    .catch(function() {
      document.getElementById("loading").style.display = "none";
      document.getElementById("explanation").textContent = "Error loading data. Try again.";
    });
}

function calculateMA(prices, period) {
  if (prices.length < period) return null;
  let sum = prices.slice(prices.length - period).reduce(function(a, b) { return a + b; }, 0);
  return sum / period;
}

function calculateRSI(prices, period) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    let change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return parseFloat((100 - (100 / (1 + avgGain / avgLoss))).toFixed(2));
}

function getScoreTier(s) {
  return s >= 85 ? { color: '#0a6642', label: 'Exceptional' }
       : s >= 70 ? { color: '#128257', label: 'Strong' }
       : s >= 55 ? { color: '#c17d08', label: 'Watch' }
       : s >= 40 ? { color: '#c4430f', label: 'Weak' }
       :           { color: '#dc2626', label: 'Risky' };
}

// ETF score — only uses factors relevant to funds (no P/E, margin, ROE, debt)
function calculateEtfScore(changePct, week52High, price, beta, rsi, ma50, dividend, qualScore) {
  let priceScore   = changePct > 3 ? 10 : changePct > 1 ? 8 : changePct > 0 ? 6 : changePct < -3 ? 1 : changePct < -1 ? 3 : 4;
  let posScore     = 5;
  if (week52High > 0) { let p = ((price - week52High) / week52High) * 100; posScore = p > -5 ? 9 : p > -15 ? 7 : p > -25 ? 5 : p > -40 ? 3 : 1; }
  let betaScore    = beta < 0.5 ? 8 : beta < 1 ? 7 : beta < 1.5 ? 5 : beta < 2 ? 3 : 1;
  let divScore     = dividend > 3 ? 9 : dividend > 1.5 ? 7 : dividend > 0.5 ? 6 : 5;
  let rsiScore     = rsi === null ? 5 : rsi < 30 ? 9 : rsi < 45 ? 7 : rsi < 55 ? 5 : rsi < 70 ? 4 : 1;
  let maScore      = 5;
  if (ma50 !== null) { let p = ((price - ma50) / ma50) * 100; maScore = p > 5 ? 8 : p > 0 ? 7 : p > -5 ? 4 : 2; }
  let newsScore    = qualScore || 5;
  let total = Math.round((priceScore + posScore + betaScore + divScore + rsiScore + maScore + newsScore) / 7 * 10);
  total = Math.max(10, Math.min(100, total));
  return { total, breakdown: { price: priceScore, position: posScore, beta: betaScore, div: divScore, rsi: rsiScore, ma: maScore, news: newsScore } };
}

function calculateScore(changePct, week52High, price, pe, metrics, qualScore, rsi, ma50) {
  let priceScore = changePct > 3 ? 10 : changePct > 1 ? 8 : changePct > 0 ? 6 : changePct < -3 ? 1 : changePct < -1 ? 3 : 4;

  let positionScore = 5;
  if (week52High > 0) {
    let p = ((price - week52High) / week52High) * 100;
    positionScore = p > -5 ? 9 : p > -15 ? 7 : p > -25 ? 5 : p > -40 ? 3 : 1;
  }

  let peScore = pe > 0 && pe < 10 ? 9 : pe > 0 && pe < 20 ? 8 : pe > 0 && pe < 30 ? 6 : pe > 0 && pe < 50 ? 4 : pe > 50 ? 2 : pe < 0 ? 1 : 5;
  let beta = metrics["beta"] || 1;
  let betaScore = beta < 0.5 ? 8 : beta < 1 ? 7 : beta < 1.5 ? 5 : beta < 2 ? 3 : 1;
  // Use null-check so missing metrics score neutral (5) instead of bottoming out at 0–2
  let marginRaw = metrics["netProfitMarginTTM"];
  let marginScore = marginRaw == null ? 5 : marginRaw > 25 ? 10 : marginRaw > 15 ? 8 : marginRaw > 5 ? 6 : marginRaw > 0 ? 4 : marginRaw > -20 ? 2 : marginRaw > -50 ? 1 : 0;
  let growthRaw = metrics["revenueGrowthTTMYoy"];
  let growthScore = growthRaw == null ? 5 : growthRaw > 20 ? 10 : growthRaw > 10 ? 8 : growthRaw > 0 ? 6 : growthRaw > -10 ? 3 : growthRaw > -25 ? 2 : 1;
  let dteRaw = metrics["totalDebt/totalEquityAnnual"];
  let debtScore = dteRaw == null ? 5 : dteRaw < 0.3 ? 10 : dteRaw < 0.6 ? 8 : dteRaw < 1 ? 6 : dteRaw < 2 ? 3 : 1;
  let rsiScore = rsi === null ? 5 : rsi < 30 ? 9 : rsi < 45 ? 7 : rsi < 55 ? 5 : rsi < 70 ? 4 : 1;
  let maScore = 5;
  if (ma50 !== null) {
    let p = ((price - ma50) / ma50) * 100;
    maScore = p > 5 ? 8 : p > 0 ? 7 : p > -5 ? 4 : 2;
  }

  let roeRaw = metrics["roeAnnual"] != null ? metrics["roeAnnual"] : metrics["roeTTM"];
  let roeScore = roeRaw == null ? 5 : roeRaw > 20 ? 10 : roeRaw > 15 ? 8 : roeRaw > 10 ? 7 : roeRaw > 5 ? 5 : roeRaw > 0 ? 3 : 1;

  let currentRatioRaw = metrics["currentRatioAnnual"] != null ? metrics["currentRatioAnnual"] : metrics["currentRatioQuarterly"];
  let currentRatioScore = currentRatioRaw == null ? 5 : currentRatioRaw > 3 ? 8 : currentRatioRaw > 2 ? 9 : currentRatioRaw > 1.5 ? 8 : currentRatioRaw > 1 ? 6 : currentRatioRaw > 0.5 ? 3 : 1;

  let interestRaw = metrics["netInterestCoverageAnnual"];
  let interestScore = interestRaw == null ? 5 : interestRaw > 10 ? 10 : interestRaw > 5 ? 8 : interestRaw > 3 ? 6 : interestRaw > 1 ? 4 : interestRaw > 0 ? 2 : 1;

  // Altman Z-Score → 0–10 scale
  // Safe (≥3): 9-10, Grey (1.81–2.99): 5-7, Distress (<1.81): 1-3, null: neutral 5
  var zRaw = calcAltmanZ(metrics);
  var altmanScore = zRaw === null ? 5
    : zRaw >= 5   ? 10
    : zRaw >= 3   ? 9
    : zRaw >= 2.6 ? 8
    : zRaw >= 2.3 ? 7
    : zRaw >= 1.81 ? 5
    : zRaw >= 1.23 ? 3
    : zRaw >= 0    ? 2
    : 1;

  // Weights revised: debt 3→8, altman 5→10, roe 8→12, price 12→4, rsi 8→5
  // Pillar A — Business Quality (35%): margin + roe + growth
  // Pillar B — Financial Safety  (29%): altman + debt + interest + currentRatio
  // Pillar C — Value             (16%): pe + position
  // Pillar D — Market Signals    (20%): rsi + ma + price + beta + news
  let total =
    marginScore       * 0.14 +
    roeScore          * 0.12 +
    growthScore       * 0.09 +
    altmanScore       * 0.10 +
    debtScore         * 0.08 +
    interestScore     * 0.07 +
    currentRatioScore * 0.04 +
    peScore           * 0.09 +
    positionScore     * 0.07 +
    rsiScore          * 0.05 +
    maScore           * 0.04 +
    priceScore        * 0.04 +
    betaScore         * 0.04 +
    qualScore         * 0.03;
  // 14+12+9+10+8+7+4+9+7+5+4+4+4+3 = 100 ✓

  var pillars = {
    businessQuality: {
      score: Math.min(100, Math.round(((marginScore * 14 + roeScore * 12 + growthScore * 9) / 35) * 10)),
      label: 'Business Quality', weight: 35,
      desc: 'Profitability, efficiency, and growth'
    },
    financialSafety: {
      score: Math.min(100, Math.round(((altmanScore * 10 + debtScore * 8 + interestScore * 7 + currentRatioScore * 4) / 29) * 10)),
      label: 'Financial Safety', weight: 29,
      desc: 'Debt, liquidity, and bankruptcy risk'
    },
    value: {
      score: Math.min(100, Math.round(((peScore * 9 + positionScore * 7) / 16) * 10)),
      label: 'Value', weight: 16,
      desc: 'Is the price fair vs. fundamentals?'
    },
    momentum: {
      score: Math.min(100, Math.round(((rsiScore * 5 + maScore * 4 + priceScore * 4 + betaScore * 4 + qualScore * 3) / 20) * 10)),
      label: 'Market Signals', weight: 20,
      desc: 'Trend, momentum, and news'
    }
  };

  return {
    total: Math.min(100, Math.max(0, Math.round(total * 10))),
    pillars: pillars,
    breakdown: {
      price: priceScore, position: positionScore, pe: peScore, beta: betaScore,
      margin: marginScore, growth: growthScore, debt: debtScore, rsi: rsiScore,
      ma: maScore, news: qualScore, roe: roeScore,
      currentRatio: currentRatioScore, interest: interestScore, altman: altmanScore,
      altmanZ: zRaw
    }
  };
}

function buildSignalChips(pe, margin, growth, beta, rsi, ma50, price) {
  var chips = [];
  if (margin > 20) chips.push({ icon: "↑", color: "#128257", label: "Strong margins" });
  else if (margin < 0) chips.push({ icon: "↓", color: "#dc2626", label: "Losing money" });
  else if (margin > 5) chips.push({ icon: "→", color: "#e07510", label: "Thin margins" });

  if (growth > 15) chips.push({ icon: "↑", color: "#128257", label: "Fast growth" });
  else if (growth < 0) chips.push({ icon: "↓", color: "#dc2626", label: "Shrinking sales" });
  else chips.push({ icon: "→", color: "#e07510", label: "Slow growth" });

  if (pe > 0 && pe < 20) chips.push({ icon: "↑", color: "#128257", label: "Cheap P/E" });
  else if (pe > 35) chips.push({ icon: "↓", color: "#dc2626", label: "Expensive P/E" });
  else if (pe > 0) chips.push({ icon: "→", color: "#e07510", label: "Fair P/E" });

  if (rsi !== null && rsi < 30) chips.push({ icon: "↑", color: "#128257", label: "Oversold" });
  else if (rsi !== null && rsi > 70) chips.push({ icon: "↓", color: "#dc2626", label: "Overbought" });

  if (beta < 1) chips.push({ icon: "↑", color: "#128257", label: "Low risk" });
  else if (beta > 1.5) chips.push({ icon: "↓", color: "#dc2626", label: "High risk" });

  if (ma50 !== null) {
    if (price > ma50) chips.push({ icon: "↑", color: "#128257", label: "Uptrend" });
    else chips.push({ icon: "↓", color: "#dc2626", label: "Downtrend" });
  }

  // Sort: bad first so user sees risks, then good — deduplicate by label
  var seen = {};
  chips = chips.filter(function(c) { if (seen[c.label]) return false; seen[c.label] = true; return true; });
  // Show only top 3 most diagnostic (prefer ↑ and ↓ over →)
  chips.sort(function(a) { return a.icon === "→" ? 1 : -1; });
  chips = chips.slice(0, 3);

  return "<div class='score-signal-chips'>" +
    chips.map(function(c) {
      return "<span class='score-signal-chip' style='color:" + c.color + ";border-color:" + c.color + "20;background:" + c.color + "0f;'>" +
        "<span class='ssc-icon'>" + c.icon + "</span>" + c.label + "</span>";
    }).join("") +
  "</div>";
}

function buildScoreExplainer(_bd, pe, margin, growth, beta, rsi, _ma50) {
  let lines = [];

  // Profit margin
  if (margin > 20) lines.push({ icon: "↑", color: "#128257", text: "Strong profit margins (" + margin.toFixed(1) + "%) — keeps more of every dollar earned" });
  else if (margin > 5) lines.push({ icon: "→", color: "#e07510", text: "Moderate profit margins (" + margin.toFixed(1) + "%) — decent but room to improve" });
  else if (margin < 0) lines.push({ icon: "↓", color: "#dc2626", text: "Negative profit margins (" + margin.toFixed(1) + "%) — currently losing money" });
  else lines.push({ icon: "→", color: "#e07510", text: "Thin profit margins (" + margin.toFixed(1) + "%) — not much profit per dollar of sales" });

  // Revenue growth
  if (growth > 15) lines.push({ icon: "↑", color: "#128257", text: "Strong revenue growth (+" + growth.toFixed(1) + "% YoY) — business is expanding fast" });
  else if (growth > 0) lines.push({ icon: "→", color: "#e07510", text: "Moderate revenue growth (+" + growth.toFixed(1) + "% YoY) — steady but not explosive" });
  else lines.push({ icon: "↓", color: "#dc2626", text: "Revenue shrinking (" + growth.toFixed(1) + "% YoY) — sales are declining" });

  // P/E ratio
  if (pe > 0 && pe < 15) lines.push({ icon: "↑", color: "#128257", text: "Low P/E ratio (" + pe.toFixed(1) + ") — may be undervalued relative to earnings" });
  else if (pe > 0 && pe < 30) lines.push({ icon: "→", color: "#e07510", text: "Average P/E ratio (" + pe.toFixed(1) + ") — fairly priced for current earnings" });
  else if (pe > 30) lines.push({ icon: "↓", color: "#dc2626", text: "High P/E ratio (" + pe.toFixed(1) + ") — priced for high future growth, adds risk" });
  else if (pe < 0) lines.push({ icon: "↓", color: "#dc2626", text: "Negative P/E — company is currently unprofitable" });

  // RSI
  if (rsi !== null) {
    if (rsi < 30) lines.push({ icon: "↑", color: "#128257", text: "RSI " + rsi + " — oversold, possible rebound ahead" });
    else if (rsi > 70) lines.push({ icon: "↓", color: "#dc2626", text: "RSI " + rsi + " — overbought, may pull back soon" });
    else lines.push({ icon: "→", color: "#64748b", text: "RSI " + rsi + " — neutral momentum, no extreme signals" });
  }

  // Beta (risk)
  if (beta < 1) lines.push({ icon: "↑", color: "#128257", text: "Low beta (" + beta.toFixed(2) + ") — less volatile than the market" });
  else if (beta < 1.5) lines.push({ icon: "→", color: "#e07510", text: "Beta " + beta.toFixed(2) + " — moves similarly to the overall market" });
  else lines.push({ icon: "↓", color: "#dc2626", text: "High beta (" + beta.toFixed(2) + ") — more volatile than the market, bigger swings" });

  let rows = lines.map(function(l) {
    return "<div class='score-explainer-row'>" +
      "<span class='score-explainer-icon' style='color:" + l.color + ";'>" + l.icon + "</span>" +
      "<span class='score-explainer-text'>" + l.text + "</span>" +
    "</div>";
  }).join("");

  return "<div class='score-explainer' id='score-explainer'>" +
    "<button class='score-explainer-toggle' onclick=\"var e=document.getElementById('score-explainer-body');var b=this;e.style.display=e.style.display==='none'?'block':'none';b.textContent=e.style.display==='none'?'What\\'s driving this score? ▾':'Hide ▴';\">What's driving this score? ▾</button>" +
    "<div id='score-explainer-body' style='display:none;'>" + rows + "</div>" +
  "</div>";
}

function buildPillarSummary(pillars) {
  if (!pillars) return '';
  var items = [
    { key: 'businessQuality', icon: '◆' },
    { key: 'financialSafety',  icon: '◆' },
    { key: 'value',            icon: '◆' },
    { key: 'momentum',         icon: '◆' }
  ];
  var html = "<div class='pillar-summary'>";
  items.forEach(function(item) {
    var p = pillars[item.key];
    var color = p.score >= 70 ? '#128257' : p.score >= 50 ? '#e07510' : '#dc2626';
    var grade = p.score >= 85 ? 'A' : p.score >= 70 ? 'B' : p.score >= 55 ? 'C' : p.score >= 40 ? 'D' : 'F';
    html += "<div class='pillar-tile'>" +
      "<div class='pillar-score' style='color:" + color + ";'>" + p.score + "<span class='pillar-grade'>" + grade + "</span></div>" +
      "<div class='pillar-label'>" + p.label + "</div>" +
      "<div class='pillar-desc'>" + p.desc + "</div>" +
    "</div>";
  });
  html += "</div>";
  return html;
}

function saveScoreHistory(ticker, score, breakdown, metrics) {
  let key = "history_score_" + ticker;
  let history = JSON.parse(localStorage.getItem(key) || "[]");
  let today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  let entry = { date: today, score: score };
  if (breakdown) entry.bd = breakdown;
  if (metrics) entry.m = metrics;
  if (history.length > 0 && history[history.length - 1].date === today) {
    history[history.length - 1] = entry;
  } else {
    history.push(entry);
  }
  if (history.length > 10) history = history.slice(-10);
  localStorage.setItem(key, JSON.stringify(history));

  // Sync to Firestore so other devices pick it up (omit raw metrics to keep payload small)
  let firestoreEntry = {};
  firestoreEntry['scoreHistory.' + ticker] = history.map(function(e) {
    return e.bd ? { date: e.date, score: e.score, bd: e.bd } : { date: e.date, score: e.score };
  });
  replaceInFirestore(firestoreEntry);

  return history;
}

function buildScoreHistoryBars(ticker, currentScore) {
  let key = "history_score_" + ticker;
  let history = JSON.parse(localStorage.getItem(key) || "[]");
  if (history.length < 2) return { trend: "", bars: "", diff: "" };
  let prev = history[history.length - 2];
  let curr = history[history.length - 1];
  let diff = currentScore - prev.score;
  let arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
  let color = diff > 0 ? "#128257" : diff < 0 ? "#dc2626" : "#64748b";
  let label = diff > 0 ? "improving" : diff < 0 ? "declining" : "unchanged";

  // Build "what changed" diff if both entries have breakdown data
  let diffHtml = "";
  if (prev.bd && curr.bd) {
    let factorNames = {
      pe: "P/E Ratio", margin: "Profit Margin", growth: "Revenue Growth",
      beta: "Risk (Beta)", rsi: "RSI", ma: "Moving Average",
      news: "News Sentiment", roe: "ROE", debt: "Debt Level",
      position: "52wk Position", price: "Price Movement",
      currentRatio: "Current Ratio", interest: "Interest Coverage"
    };
    let changes = [];
    Object.keys(factorNames).forEach(function(k) {
      let pv = prev.bd[k], cv = curr.bd[k];
      if (pv == null || cv == null) return;
      let d = cv - pv;
      if (d === 0) return;
      changes.push({ name: factorNames[k], delta: d });
    });
    changes.sort(function(a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    let top = changes.slice(0, 3);
    if (top.length > 0) {
      diffHtml = "<div class='score-history-diff'>" +
        "<div class='score-history-diff-title'>What changed since " + prev.date + ":</div>" +
        top.map(function(c) {
          let up = c.delta > 0;
          return "<div class='score-history-diff-row'>" +
            "<span class='diff-arrow' style='color:" + (up ? "#128257" : "#dc2626") + ";'>" + (up ? "↑" : "↓") + "</span>" +
            "<span class='diff-name'>" + c.name + "</span>" +
            "<span class='diff-delta' style='color:" + (up ? "#128257" : "#dc2626") + ";'>" + (up ? "+" : "") + c.delta + " pts</span>" +
          "</div>";
        }).join("") +
      "</div>";
    }
  }

  let bars = history.map(function(h) {
    let barColor = h.score >= 65 ? "#128257" : h.score >= 50 ? "#e07510" : "#dc2626";
    let height = Math.max(20, (h.score / 100) * 60);
    return "<div style='display:flex;flex-direction:column;align-items:center;gap:4px;'>" +
      "<div style='font-size:10px;color:#64748b;'>" + h.score + "</div>" +
      "<div style='width:20px;height:" + height + "px;background:" + barColor + ";border-radius:4px;opacity:0.8;'></div>" +
      "<div style='font-size:9px;color:#64748b;'>" + h.date + "</div>" +
      "</div>";
  }).join("");
  return {
    trend: "<span style='color:" + color + ";font-weight:600;font-size:12px;'>" + arrow + " " + Math.abs(diff) + " pts since " + prev.date + " — " + label + "</span>",
    bars: "<div style='display:flex;align-items:flex-end;gap:8px;margin-top:8px;padding:10px;background:var(--surface2);border-radius:10px;'>" + bars + "</div>" +
          "<div style='display:flex;gap:12px;margin-top:6px;font-size:10px;color:var(--text-muted);'>" +
          "<span><span style='color:#128257;font-weight:700;'>■</span> Strong 65+</span>" +
          "<span><span style='color:#e07510;font-weight:700;'>■</span> Watch 50–64</span>" +
          "<span><span style='color:#dc2626;font-weight:700;'>■</span> Risky &lt;50</span>" +
          "</div>",
    diff: diffHtml
  };
}

function getScoreHistoryHtml(ticker, currentScore) {
  let h = buildScoreHistoryBars(ticker, currentScore);
  if (!h.bars) return "";
  return "<div class='score-history-section'>" +
    "<div class='score-history-title'>SCORE HISTORY</div>" +
    h.trend + h.bars + h.diff +
  "</div>";
}

function displayData(data) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("results-section").style.display = "flex";
  var sp = document.getElementById('screener-panel');
  if (sp) sp.style.display = 'none';
  hideQuickTickers();
  setTimeout(maybeShowCoachMark, 600);

  let { ticker, quote, profile, news, metrics, prices, dates, volumes, earningsData, pastEarnings, isEtf, etfProfile, etfHoldings } = data;
  isEtf = isEtf || false;
  etfProfile = etfProfile || {};
  etfHoldings = etfHoldings || {};
  let price = quote.c, changePct = quote.dp, prevClose = quote.pc, dayHigh = quote.h, dayLow = quote.l;
  let companyName = profile.name || ticker;
  let industry = profile.finnhubIndustry || "";
  let week52High = metrics["52WeekHigh"] || 0;
  let week52Low  = metrics["52WeekLow"]  || 0;
  let pe = metrics["peBasicExclExtraTTM"] || 0;
  let beta = metrics["beta"] || 0;
  let margin = metrics["netProfitMarginTTM"] || 0;
  let growth = metrics["revenueGrowthTTMYoy"] || 0;
  let roe = metrics["roeAnnual"] || metrics["roeTTM"] || 0;
  let currentRatio = metrics["currentRatioAnnual"] || metrics["currentRatioQuarterly"] || 0;
  let interestCoverage = metrics["netInterestCoverageAnnual"] || 0;
  let rsi = prices.length > 14 ? calculateRSI(prices, 14) : null;
  let ma50 = prices.length >= 50 ? calculateMA(prices, 50) : null;
  let ma20 = prices.length >= 20 ? calculateMA(prices, 20) : null;

  let qualScore = 5, topHeadline = "No recent news found.";

  if (news && news.length > 0) {
    let relevant = news.filter(function(a) {
      return a.headline.toLowerCase().includes(ticker.toLowerCase()) ||
             a.headline.toLowerCase().includes(companyName.toLowerCase().split(" ")[0]);
    });
    let articles = relevant.length > 0 ? relevant : news;
    topHeadline = articles[0].headline;
    let pos = ["beat","growth","record","profit","strong","up","gains","rise","boost","high"];
    let neg = ["miss","loss","down","fall","cut","weak","drop","layoff","debt","crash"];
    let s = 0;
    articles.slice(0, 10).forEach(function(a) {
      let tx = a.headline.toLowerCase();
      pos.forEach(function(w) { if (tx.includes(w)) s++; });
      neg.forEach(function(w) { if (tx.includes(w)) s--; });
    });
    qualScore = s > 3 ? 9 : s > 1 ? 7 : s > 0 ? 6 : s === 0 ? 5 : s > -2 ? 4 : 2;
  }

  let result = isEtf
    ? calculateEtfScore(changePct, week52High, price, beta, rsi, ma50, metrics['dividendYieldIndicatedAnnual'] || 0, qualScore)
    : calculateScore(changePct, week52High, price, pe, metrics, qualScore, rsi, ma50);
  let totalScore = result.total;
  let breakdown = result.breakdown;

  saveScoreHistory(ticker, totalScore, breakdown, { pe, margin, growth, beta, rsi, roe, currentRatio, interestCoverage });
  let analyzed = parseInt(localStorage.getItem('total-analyzed') || '0');
  analyzed += 1;
  localStorage.setItem('total-analyzed', analyzed);
  saveToFirestore({ stats: { analyzed: analyzed } });
  addXP(10); // +10 XP for analyzing a stock

  currentTicker = ticker;
  currentScore = totalScore;
  currentName = companyName;
  window._currentMetrics = { pe, beta, margin, growth, roe, rsi, ma50, ma20, price, week52High, changePct };
  window._currentDivYield = 0; // will be updated below when _divYield is set
  saveSearchHistory(ticker, companyName);

  document.getElementById("action-btns").style.display = "flex";
  let brokerHint = document.getElementById('broker-hint');
  if (brokerHint && !localStorage.getItem('broker-hint-dismissed')) brokerHint.style.display = 'flex';
  let btn = document.getElementById("watchlist-btn");
  btn.textContent = "+ Watchlist";
  btn.classList.remove("added");

  let logoHtml = profile.logo ? "<img src='" + escHtml(profile.logo) + "' class='stock-logo'>" : "";
  let changeAmt = price - prevClose;
  let changeSign = changeAmt >= 0 ? "+" : "";
  let changeColor = changeAmt >= 0 ? "#128257" : "#dc2626";
  let changeArrow = changeAmt >= 0 ? "▲" : "▼";
  let changePill = prevClose > 0
    ? "<span class='price-change-pill' style='background:" + (changeAmt >= 0 ? "rgba(18,130,87,0.12)" : "rgba(220,38,38,0.12)") + ";color:" + changeColor + ";'>" +
      changeArrow + " " + changeSign + fmt$(Math.abs(changeAmt)) + " (" + changeSign + changePct.toFixed(2) + "%)" +
      "</span>"
    : "";
  let priceEl = document.getElementById("stock-name");
  if (priceEl) priceEl._rawPrice = price;
  document.getElementById("stock-name").innerHTML =
    "<div class='stock-hero'>" +
      "<div class='stock-hero-left'>" +
        logoHtml +
        "<div class='stock-hero-identity'>" +
          "<div class='stock-header-ticker'>" + escHtml(ticker) + "</div>" +
          "<div class='stock-header-fullname'>" + escHtml(companyName) + "</div>" +
        "</div>" +
      "</div>" +
      "<div class='stock-hero-right'>" +
        "<div class='stock-header-price' id='stock-price'>" +
          fmt$(price) + (_currency !== 'USD' ? "<span class='stock-currency-label'>" + _currency + "</span>" : "") +
        "</div>" +
        (changePill ? "<div class='stock-hero-change'>" + changePill + "</div>" : "") +
      "</div>" +
    "</div>";

  let _tier = getScoreTier(totalScore);
  let scoreColor = _tier.color;
  let scoreLabel = _tier.label;
  document.getElementById("health-score").innerHTML =
    "<div class='score-badge' style='border-color:" + scoreColor + ";'>" +
      "<div class='score-badge-num' style='color:" + scoreColor + ";'>" + totalScore + "</div>" +
      "<div class='score-badge-label'>/ 100</div>" +
      "<div class='score-badge-tag' style='color:" + scoreColor + ";'>" + scoreLabel + "</div>" +
    "</div>" +
    (!isEtf ? buildSignalChips(pe, margin, growth, beta, rsi, ma50, price) : "");


  // Risk profile bar (between signal and action buttons)
  let riskBar = document.getElementById("risk-profile-bar");
  if (riskBar) {
    let warning = getRiskProfileWarning(beta, totalScore);
    if (warning) {
      riskBar.innerHTML = warning;
      riskBar.style.display = "block";
    } else {
      riskBar.style.display = "none";
    }
  }

  // Collect earnings for KEY STATS
  let nextEarningsDate = earningsData && earningsData.earningsCalendar && earningsData.earningsCalendar.length > 0
    ? earningsData.earningsCalendar[0].date : null;
  let lastEarnings = Array.isArray(pastEarnings) && pastEarnings.length > 0 ? pastEarnings[0] : null;

  let rangeEl = document.getElementById("week-range-bar");
  if (rangeEl) rangeEl.style.display = "none";

  let pctFrom52High = week52High > 0 ? (((price - week52High) / week52High) * 100).toFixed(1) : null;


  document.getElementById("explanation-simple").innerHTML = "";

  var detailsBtn = document.getElementById("show-details-btn");
  if (detailsBtn) { detailsBtn.innerHTML = "Full Analysis <span style='float:right;'>▾</span>"; detailsBtn.style.display = "block"; }
  var ddSection = document.getElementById("deep-dive-section");
  if (ddSection) ddSection.style.display = "none";

  document.getElementById("explanation").style.display = "none";

  let _divYield = metrics['dividendYieldIndicatedAnnual'] || 0;
  window._currentDivYield = _divYield;

  if (isEtf) {
    // ── ETF score breakdown — only fund-relevant factors ────────────────────
    document.getElementById("explanation").innerHTML =
(function() {
  let factors = [
    { label: "Price Movement", value: (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "%", score: breakdown.price, what: "Today " + (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "% change. " + (changePct > 1 ? "Positive momentum — the fund is moving up." : changePct < -1 ? "The fund is under selling pressure today." : "Low movement — quiet day for this fund."), verdict: changePct > 1 ? "Moving up today" : changePct < -1 ? "Dropping today" : "No significant movement" },
    { label: "52wk Position", value: pctFrom52High !== null ? Math.abs(pctFrom52High) + "% from high" : "—", score: breakdown.position, what: pctFrom52High !== null ? "Fund is " + Math.abs(pctFrom52High) + "% " + (parseFloat(pctFrom52High) < 0 ? "below" : "near") + " its yearly high ($" + week52High.toFixed(2) + "). " + (breakdown.position >= 7 ? "Near yearly high — strong momentum." : breakdown.position >= 4 ? "Pulled back but in normal range." : "Well below yearly high — weakness signal.") : "No yearly high data.", verdict: breakdown.position >= 7 ? "Near yearly high" : breakdown.position >= 4 ? "Pullback from high" : "Far from yearly high" },
    { label: "Volatility (Beta)", value: beta > 0 ? beta.toFixed(2) : "—", score: breakdown.beta, what: beta > 0 ? "Beta " + beta.toFixed(2) + " — if the market moves 10%, this ETF typically moves " + (beta * 10).toFixed(1) + "%. " + (beta < 0.8 ? "Defensive fund — less volatile than the market." : beta < 1.2 ? "Tracks the market closely." : "More volatile than the market — higher risk.") : "No beta data.", verdict: beta < 0.8 ? "Defensive — low volatility" : beta < 1.2 ? "Tracks market" : "Higher volatility than market" },
    { label: "Distribution Yield", value: _divYield > 0 ? _divYield.toFixed(2) + "%" : "None", score: breakdown.div, what: _divYield > 0 ? "This ETF distributes " + _divYield.toFixed(2) + "% annually from dividends or interest of its holdings. " + (_divYield > 3 ? "High yield — significant income component." : "Moderate income on top of price return.") : "This ETF does not pay distributions — all return comes from price appreciation.", verdict: _divYield > 3 ? "High yield — income focused" : _divYield > 0 ? "Pays distributions" : "Growth-only — no distributions" },
    { label: "RSI", value: rsi !== null ? rsi + "" : "—", score: breakdown.rsi, what: rsi !== null ? "RSI " + rsi + "/100. " + (rsi < 30 ? "Oversold — the fund has fallen sharply and could bounce." : rsi > 70 ? "Overbought — the fund has rallied hard and could pull back." : "Neutral zone — no extreme signal.") : "Not enough data.", verdict: rsi !== null && rsi < 30 ? "Oversold — possible bounce" : rsi !== null && rsi > 70 ? "Overbought — possible pullback" : "Neutral zone" },
    { label: "Moving Average", value: ma50 !== null ? (price > ma50 ? "↑ above" : "↓ below") + " $" + ma50.toFixed(2) : "—", score: breakdown.ma, what: ma50 !== null ? "50-day avg $" + ma50.toFixed(2) + ", current $" + price.toFixed(2) + ". " + (price > ma50 ? "Trading above its average — uptrend intact." : "Below its average — downtrend signal. Caution.") : "Not enough data.", verdict: (ma50 !== null && price > ma50) ? "Uptrend — above average" : "Downtrend — below average" },
    { label: "News Sentiment", value: null, score: breakdown.news, what: "Analysis of recent headlines about this fund. " + (breakdown.news >= 7 ? "Mostly positive coverage." : breakdown.news >= 4 ? "Mixed coverage — typical for broad-market ETFs." : "Recent negative news — may be impacting the fund."), verdict: breakdown.news >= 7 ? "Positive news" : breakdown.news >= 4 ? "Mixed news" : "Negative news" },
  ];
  factors.sort(function(a, b) { return b.score - a.score; });
  return factors.map(function(f) { return scoreBar(f.label, f.score, { what: f.what, verdict: f.verdict, value: f.value }); }).join("");
})() + getScoreHistoryHtml(ticker, totalScore);

  } else {
    // ── Stock score breakdown ────────────────────────────────────────────────
    document.getElementById("explanation").innerHTML =
(function() {
  let factors = [
    { label: "Price Movement", value: (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "%", score: breakdown.price, what: "Today " + (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "% change. " + (changePct > 1 ? "Moving up more than 1% today is a positive momentum signal." : changePct < -1 ? "Dropping more than 1% today indicates selling pressure." : "Less than 1% movement means low activity today."), verdict: changePct > 1 ? "Moving up today" : changePct < -1 ? "Dropping today" : "No significant movement" },
    { label: "52wk Position", value: pctFrom52High !== null ? Math.abs(pctFrom52High) + "% from high" : "—", score: breakdown.position, what: pctFrom52High !== null ? "Stock is " + Math.abs(pctFrom52High) + "% " + (parseFloat(pctFrom52High) < 0 ? "below" : "near") + " its yearly high ($" + week52High.toFixed(2) + "). " + (breakdown.position >= 7 ? "Being near the yearly high indicates strong momentum." : breakdown.position >= 4 ? "Pulled back from high but still in normal range." : "Far from yearly high — could be opportunity or warning sign.") : "No yearly high data.", verdict: breakdown.position >= 7 ? "Near yearly high" : breakdown.position >= 4 ? "Pullback from high" : "Far from yearly high" },
    { label: "P/E Ratio", value: pe > 0 ? pe.toFixed(1) + "x" : "—", score: breakdown.pe, what: pe > 0 ? "You pay $" + pe.toFixed(1) + " for every $1 the company earns. " + (pe < 20 ? "A low P/E means the stock is cheap relative to earnings." : pe < 35 ? "Reasonable P/E for a quality company." : "High P/E means investors expect a lot of future growth.") : "No P/E data available.", verdict: pe > 0 && pe < 20 ? "Attractive price vs earnings" : pe > 0 && pe < 35 ? "Fair price" : pe > 35 ? "High price — elevated expectations" : "No data" },
    { label: "Risk (Beta)", value: beta > 0 ? beta.toFixed(2) : "—", score: breakdown.beta, what: beta > 0 ? "Beta " + beta.toFixed(2) + " — if market moves 10%, this stock typically moves " + (beta * 10).toFixed(1) + "%. " + (beta < 1 ? "Less volatile than the market." : beta < 1.5 ? "Similar volatility to the market." : "More volatile than market.") : "No beta data.", verdict: beta < 1 ? "Less risky than market" : beta < 1.5 ? "Similar risk to market" : "More risky than market" },
    { label: "Profit Margin", value: margin !== 0 ? margin.toFixed(1) + "%" : "—", score: breakdown.margin, what: margin !== 0 ? "Company keeps " + margin.toFixed(1) + "% of every dollar earned as profit. " + (margin > 25 ? "Exceptional — very few companies achieve this." : margin > 10 ? "Healthy margin. The company is efficient and profitable." : margin > 0 ? "Thin margin — vulnerable to unexpected costs." : "The company is currently losing money.") : "No margin data.", verdict: margin > 25 ? "Exceptional profitability" : margin > 10 ? "Healthy margin" : margin > 0 ? "Thin margin" : "Current losses" },
    { label: "Revenue Growth", value: growth !== 0 ? (growth > 0 ? "+" : "") + growth.toFixed(1) + "%" : "—", score: breakdown.growth, what: growth !== 0 ? "Revenue grew " + growth.toFixed(1) + "% vs last year. " + (growth > 15 ? "Fast growth — company is expanding quickly." : growth > 0 ? "Steady growth. Company continues to expand." : "Revenue is falling — important warning sign.") : "No growth data.", verdict: growth > 15 ? "Accelerated growth" : growth > 0 ? "Steady growth" : "Revenue falling" },
    { label: "Debt Level", value: null, score: breakdown.debt, what: "Measures how much debt the company has relative to its assets. " + (breakdown.debt >= 7 ? "Low debt — financially solid." : breakdown.debt >= 4 ? "Manageable debt." : "High debt — could be a problem if interest rates rise."), verdict: breakdown.debt >= 7 ? "Low debt — solid company" : breakdown.debt >= 4 ? "Manageable debt" : "High debt — caution" },
    { label: "RSI", value: rsi !== null ? rsi + "" : "—", score: breakdown.rsi, what: rsi !== null ? "RSI " + rsi + "/100. " + (rsi < 30 ? "Oversold zone — stock has fallen a lot and could bounce." : rsi > 70 ? "Overbought zone — stock has risen a lot and could correct." : "Neutral zone — no extreme signal.") : "Not enough data.", verdict: rsi !== null && rsi < 30 ? "Oversold — possible bounce" : rsi !== null && rsi > 70 ? "Overbought — possible correction" : "Neutral zone" },
    { label: "Moving Average", value: ma50 !== null ? (price > ma50 ? "↑ above" : "↓ below") + " $" + ma50.toFixed(2) : "—", score: breakdown.ma, what: ma50 !== null ? "50-day avg $" + ma50.toFixed(2) + ", current $" + price.toFixed(2) + ". " + (price > ma50 ? "Above the average — uptrend." : "Below the average — downtrend. Caution.") : "Not enough data.", verdict: (ma50 !== null && price > ma50) || (ma20 !== null && price > ma20) ? "Uptrend — above average" : "Downtrend — below average" },
    { label: "News Sentiment", value: null, score: breakdown.news, what: "Analysis of recent headlines. " + (breakdown.news >= 7 ? "Mostly positive news." : breakdown.news >= 4 ? "Mixed news — normal for most companies." : "Recent negative news — may be affecting price."), verdict: breakdown.news >= 7 ? "Positive news" : breakdown.news >= 4 ? "Mixed news" : "Negative news" },
    { label: "ROE", value: roe !== 0 ? roe.toFixed(1) + "%" : "—", score: breakdown.roe, what: roe !== 0 ? "Return on Equity: " + roe.toFixed(1) + "%. For every $100 shareholders invested, the company generates $" + roe.toFixed(1) + " in profit. " + (roe > 15 ? "Excellent — management generating strong returns." : roe > 10 ? "Healthy — good use of shareholder capital." : roe > 0 ? "Below average — room for improvement." : "Negative — losing shareholder money.") : "No ROE data available.", verdict: roe > 15 ? "Excellent returns on equity" : roe > 10 ? "Healthy returns on equity" : roe > 0 ? "Below average returns" : "Negative returns on equity" },
    { label: "Current Ratio", value: currentRatio !== 0 ? currentRatio.toFixed(2) + "x" : "—", score: breakdown.currentRatio, what: currentRatio !== 0 ? "Current ratio of " + currentRatio.toFixed(2) + ". " + (currentRatio > 2 ? "Very healthy — can easily cover short-term liabilities." : currentRatio > 1 ? "Adequate — can cover current liabilities." : "Warning — may struggle to pay short-term obligations.") : "No current ratio data.", verdict: currentRatio > 2 ? "Very healthy — easily covers bills" : currentRatio > 1 ? "Adequate — covers current bills" : "Warning — may struggle with bills" },
    { label: "Interest Coverage", value: interestCoverage !== 0 ? interestCoverage.toFixed(1) + "x" : "—", score: breakdown.interest, what: interestCoverage !== 0 ? "Covers interest " + interestCoverage.toFixed(1) + "x. " + (interestCoverage > 5 ? "Very safe — earnings far exceed debt payments." : interestCoverage > 3 ? "Adequate — can cover interest payments." : interestCoverage > 1 ? "Tight — barely covering interest. Risky if revenue drops." : "Danger — cannot cover interest payments.") : "No interest coverage data.", verdict: interestCoverage > 5 ? "Very safe — earnings far exceed debt" : interestCoverage > 3 ? "Adequate — covers interest payments" : "Tight or dangerous — debt risk" },
    (function() {
      var z = breakdown.altmanZ;
      var zone = z === null ? "N/A" : z >= 3 ? "Safe Zone" : z >= 1.81 ? "Grey Zone" : "Distress Zone";
      var zVal = z !== null ? z.toFixed(2) : "—";
      var what = z === null
        ? "Not enough balance sheet data to compute the Altman Z-Score for this stock."
        : "Altman Z-Score: " + zVal + " (" + zone + "). " +
          (z >= 3 ? "Score above 3 = financially safe. Low bankruptcy risk." :
           z >= 1.81 ? "Score between 1.81–2.99 = grey zone. Some financial stress signals." :
           "Score below 1.81 = distress zone. Elevated bankruptcy risk.");
      return { label: "Altman Z-Score", value: zVal, score: breakdown.altman, what: what, verdict: zone };
    })(),
  ];
  factors.sort(function(a, b) { return b.score - a.score; });
  return factors.map(function(f) { return scoreBar(f.label, f.score, { what: f.what, verdict: f.verdict, value: f.value }); }).join("");
})() +
    getScoreHistoryHtml(ticker, totalScore) +
    getSectorContext(industry, pe, margin, growth, beta);

  // Save factor bars HTML so quiz unlock can restore it without re-fetching
  window._lastFactorBarsHTML = (document.getElementById('explanation') || {}).innerHTML || '';
  window._lastPillarsResult = result.pillars || null;

  // All tiers see factors; Tier 2+ users who completed the quiz also see pillars + D2
  (function() {
    var expEl = document.getElementById('explanation');
    if (!expEl) return;
    var tier = getUserLevel().tier;
    if (tier >= 2 && hasCompletedQuizFor(ticker)) {
      if (result.pillars) {
        var ps = buildPillarSummary(result.pillars);
        var heading = "<div class='pillar-section-label'>4 PILLARS</div>";
        var factorHeading = "<div class='pillar-section-label' style='margin-top:20px;'>14 FACTORS</div>";
        expEl.innerHTML = heading + ps + factorHeading + expEl.innerHTML;
      }
      // Auto-open deep-dive so pillars + D2 are immediately visible for returning users
      var ddSection = document.getElementById('deep-dive-section');
      if (ddSection) ddSection.style.display = 'block';
      expEl.style.display = 'block';
      var detailsBtn = document.getElementById('show-details-btn');
      if (detailsBtn) detailsBtn.innerHTML = "Full Analysis <span style='float:right;'>▴</span>";
      showDecisionPoint2(companyName);
    }
  })();
  }

  showDecisionPoint1(companyName);
  initStockChat(ticker, companyName, totalScore, changePct, pe, margin, growth, beta, rsi, price);
  let chatEl = document.getElementById('ai-chat');
  if (chatEl) { chatEl.style.display = 'none'; document.getElementById('ai-chat-messages').innerHTML = ''; document.getElementById('ai-chat-suggestions').style.display = 'flex'; var sc = document.getElementById('ai-scenarios'); if (sc) sc.style.display = 'none'; }
  getAIExplanation(ticker, companyName, totalScore, changePct, pe, margin, growth, beta, rsi, ma50, price, topHeadline, roe, currentRatio, interestCoverage);
  loadChart(prices, dates, volumes || [], data.ohlc || [], prevClose, dayHigh, dayLow, week52High);

  if (isEtf) {
    renderEtfAbout(profile, etfProfile);
    renderEtfStats(metrics, etfProfile, _divYield);
    renderEtfHoldings(etfHoldings);
    document.getElementById('earnings-card').style.display = 'none';
    document.getElementById('dividend-card').style.display = 'none';
    document.getElementById('quiz-cta') && (document.getElementById('quiz-cta').style.display = 'none');
  } else {
    renderCompanyAbout(profile, _divYield);
    var zScore = calcAltmanZ(metrics);
    if (getUserLevel().tier >= 3) {
      renderFundamentals({ price, changePct, prevClose, dayHigh, dayLow, week52High, week52Low, pe, beta, margin, growth, roe, marketCap: profile.marketCapitalization, dividend: _divYield, nextEarningsDate, lastEarnings, zScore });
    } else {
      var fcEl = document.getElementById('fundamentals-card');
      if (fcEl) fcEl.innerHTML = '<h2>KEY STATS</h2>' + buildLockedCard('Analyst', 150, 'P/E ratio, beta, profit margins, market cap, dividend yield and more');
    }
    renderEarningsCard(nextEarningsDate, lastEarnings, companyName);
    document.getElementById('etf-holdings-card').style.display = 'none';
    renderQuizCTA(ticker, companyName, pe, beta, margin, growth, rsi, totalScore, currentRatio);
    // Fetch dividend details for dividend-paying stocks (non-blocking)
    if (_divYield > 0) {
      loadDividendCard(ticker);
    } else {
      document.getElementById('dividend-card').style.display = 'none';
    }
  }

  renderScoreExplainer(totalScore);
  renderNewsSection(news, ticker, companyName);

  if (_showFirstPortfolioBanner) {
    _showFirstPortfolioBanner = false;
    showFirstPortfolioBanner(companyName);
  }
}

function renderQuizCTA(ticker, companyName, pe, beta, margin, growth, rsi, totalScore, currentRatio) {
  var el = document.getElementById('quiz-cta');
  if (!el) return;
  // Only show if there are enough data points to build questions
  var qs = buildStockQuiz(ticker, companyName, pe, beta, margin, growth, rsi, totalScore, currentRatio);
  if (qs.length === 0) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML =
    '<div class="quiz-cta-inner">' +
      '<div class="quiz-cta-left">' +
        '<span class="quiz-cta-icon"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span>' +
        '<div>' +
          '<div class="quiz-cta-title">Test your knowledge</div>' +
          '<div class="quiz-cta-sub">Ready? Answer ' + qs.length + ' quick questions about ' + companyName + '.</div>' +
        '</div>' +
      '</div>' +
      '<button class="quiz-cta-btn" onclick="showStockQuiz(\'' + ticker + '\',\'' + companyName.replace(/'/g, "\\'") + '\',' + pe + ',' + beta + ',' + margin + ',' + growth + ',' + (rsi === null ? 'null' : rsi) + ',' + totalScore + ',' + currentRatio + ')">Start Quiz →</button>' +
    '</div>';
}

function renderCompanyAbout(profile, dividend) {
  let el = document.getElementById('company-about');
  if (!el) return;
  let industry = profile.finnhubIndustry || '';
  let country = profile.country || '';
  let website = profile.weburl || '';
  let ipo = profile.ipo ? profile.ipo.split('-')[0] : '';
  let mktCap = profile.marketCapitalization;
  let capSize = mktCap >= 200000 ? 'Mega Cap' : mktCap >= 10000 ? 'Large Cap' : mktCap >= 2000 ? 'Mid Cap' : mktCap >= 300 ? 'Small Cap' : 'Micro Cap';
  let capDesc = mktCap >= 10000 ? 'Large, established company' : mktCap >= 2000 ? 'Mid-size company' : 'Smaller, higher-risk company';

  let items = [];
  if (industry) items.push({ label: 'Industry', value: escHtml(industry) });
  if (country) items.push({ label: 'Country', value: escHtml(country) });
  if (ipo) items.push({ label: 'Public Since', value: escHtml(ipo) });
  if (mktCap > 0) items.push({ label: 'Size', value: capSize + ' — ' + capDesc });
  let divValue = dividend > 0 ? dividend.toFixed(2) + '% per year' : 'No dividend';
  let divColor = dividend > 0 ? 'var(--text)' : 'var(--text-muted)';
  items.push({ label: 'Dividend', value: "<span style='color:" + divColor + ";'>" + divValue + "</span>" });
  if (website) items.push({ label: 'Website', value: "<a href='" + escHtml(website) + "' target='_blank' rel='noopener' style='color:var(--accent-blue);text-decoration:none;'>" + escHtml(website.replace(/^https?:\/\//, '').replace(/\/$/, '')) + "</a>" });

  if (items.length === 0) { el.style.display = 'none'; return; }

  let descHtml = '';
  if (profile.description) {
    descHtml = '<p class="company-description">' + escHtml(profile.description) + '</p>';
  }

  el.innerHTML = '<h2>ABOUT</h2>' + descHtml + '<div class="about-grid">' +
    items.map(function(i) {
      return "<div class='about-item'><div class='about-label'>" + i.label + "</div><div class='about-value'>" + i.value + "</div></div>";
    }).join('') + '</div>';
  el.style.display = 'block';
}

// ── ETF-specific render functions ──────────────────────────────────────────

function renderEtfAbout(profile, etfProfile) {
  let el = document.getElementById('company-about');
  if (!el) return;

  let items = [];
  let benchmark = etfProfile.benchmark || etfProfile.index || '';
  let inception  = etfProfile.inceptionDate || (profile.ipo ? profile.ipo.split('-')[0] : '');
  let website    = profile.weburl || '';
  let country    = profile.country || 'US';

  if (benchmark)  items.push({ label: 'Tracks',        value: escHtml(benchmark) });
  if (inception)  items.push({ label: 'Inception',      value: escHtml(inception) });
  if (country)    items.push({ label: 'Listed',         value: escHtml(country) });
  if (website)    items.push({ label: 'Website', value: "<a href='" + escHtml(website) + "' target='_blank' rel='noopener' style='color:var(--accent-blue);text-decoration:none;'>" + escHtml(website.replace(/^https?:\/\//, '').replace(/\/$/, '')) + "</a>" });

  let descHtml = '';
  let desc = etfProfile.description || profile.description || '';
  if (desc) descHtml = '<p class="company-description">' + escHtml(desc) + '</p>';

  el.innerHTML = '<h2>ABOUT THIS ETF</h2>' + descHtml +
    (items.length ? '<div class="about-grid">' + items.map(function(i) {
      return "<div class='about-item'><div class='about-label'>" + i.label + "</div><div class='about-value'>" + i.value + "</div></div>";
    }).join('') + '</div>' : '');
  el.style.display = 'block';
}

function renderEtfStats(metrics, etfProfile, divYield) {
  let el = document.getElementById('fundamentals-card');
  if (!el) return;

  // Expense ratio — Finnhub returns it as a decimal (0.0945 = 0.0945%), multiply by 100
  let rawExp = etfProfile.expenseRatio || etfProfile.expense_ratio || null;
  let expStr = rawExp != null
    ? (rawExp < 1 ? (rawExp * 100).toFixed(2) : rawExp.toFixed(2)) + '%'
    : '—';

  // AUM — Finnhub returns in millions
  let aum = etfProfile.aum || etfProfile.totalAssets || 0;
  let aumStr = aum > 0
    ? (aum >= 1000000 ? '$' + (aum / 1000000).toFixed(2) + 'T'
      : aum >= 1000   ? '$' + (aum / 1000).toFixed(1) + 'B'
      :                 '$' + aum.toFixed(0) + 'M')
    : '—';

  let beta   = metrics['beta']           || 0;
  let high52 = metrics['52WeekHigh']     || 0;
  let low52  = metrics['52WeekLow']      || 0;
  let nav    = etfProfile.nav            || 0;

  let items = [
    { label: 'Expense Ratio', value: expStr },
    { label: 'Fund Size (AUM)', value: aumStr },
    { label: 'Dist. Yield', value: divYield > 0 ? divYield.toFixed(2) + '%' : 'None' },
    { label: 'Beta', value: beta > 0 ? beta.toFixed(2) : '—' },
    { label: '52-Wk High', value: high52 > 0 ? '$' + high52.toFixed(2) : '—' },
    { label: '52-Wk Low',  value: low52  > 0 ? '$' + low52.toFixed(2)  : '—' },
    { label: 'NAV', value: nav > 0 ? '$' + nav.toFixed(2) : '—' },
  ];

  el.innerHTML = '<h2>ETF STATS</h2><div class="fundamentals-grid">' +
    items.map(function(i) {
      return "<div class='fund-item'><div class='fund-label'>" + i.label + "</div><div class='fund-value'>" + i.value + "</div></div>";
    }).join('') + '</div>';
  el.style.display = 'block';
}

function renderEtfHoldings(etfHoldings) {
  let el = document.getElementById('etf-holdings-card');
  if (!el) return;

  let holdings = (etfHoldings.holdings || []).slice(0, 10);
  if (holdings.length === 0) { el.style.display = 'none'; return; }

  el.innerHTML = '<h2>TOP HOLDINGS</h2>' +
    '<div class="etf-holdings-list">' +
    holdings.map(function(h, i) {
      let pct = h.percent != null ? h.percent : (h.weight != null ? h.weight : null);
      let pctStr = pct != null ? pct.toFixed(2) + '%' : '—';
      let barW   = pct != null ? Math.min(100, pct * 5) : 0; // scale bar: ~20% fills full bar
      return '<div class="etf-holding-row" onclick="quickSearch(\'' + escHtml(h.symbol || '') + '\')">' +
        '<span class="etf-holding-rank">' + (i + 1) + '</span>' +
        '<span class="etf-holding-ticker">' + escHtml(h.symbol || '—') + '</span>' +
        '<span class="etf-holding-name">' + escHtml(h.name || '') + '</span>' +
        '<div class="etf-holding-right">' +
          '<div class="etf-holding-bar-wrap"><div class="etf-holding-bar" style="width:' + barW + '%"></div></div>' +
          '<span class="etf-holding-pct">' + pctStr + '</span>' +
        '</div>' +
      '</div>';
    }).join('') +
    '</div>';
  el.style.display = 'block';
}

function calcAltmanZ(m) {
  // Altman Z-Score (public company model): Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 1.0*X5
  // Using per-share ratios from Finnhub to approximate the balance sheet ratios
  var bvps  = m['bookValuePerShareAnnual'] || 0;   // proxy for total assets per share
  var rev   = m['revenuePerShareAnnual']   || 0;
  var eps   = m['epsAnnual'] || m['epsTTM'] || 0;
  var cr    = m['currentRatioAnnual'] || m['currentRatioQuarterly'] || 0;
  var dte   = m['totalDebt/totalEquityAnnual'] || 0; // D/E ratio
  if (bvps <= 0) return null; // can't compute

  // X1: Working Capital / Total Assets ≈ (CR-1)/(CR + dte) where dte proxies liabilities share
  var x1 = cr > 0 ? Math.max(-1, Math.min(1, (cr - 1) / (cr + Math.max(dte, 0.01)))) : 0;
  // X2: Retained Earnings / Total Assets ≈ (bvps - equity paid in) / bvps — use roe×bvps/earnings as proxy
  //     Simplified: use cumulative ROE proxy = eps / bvps (earnings yield on book)
  var x2 = bvps > 0 ? Math.max(-1, Math.min(2, eps / bvps)) : 0;
  // X3: EBIT / Total Assets ≈ (netMargin × revenuePerShare) / bvps
  var netMargin = m['netProfitMarginTTM'] || 0;
  var ebitProxy = rev * (netMargin / 100) / bvps;
  var x3 = Math.max(-2, Math.min(3, ebitProxy));
  // X4: Market Cap / Total Liabilities ≈ marketCap / (marketCap × dte/(1+dte))
  //     = (1+dte)/dte when dte>0
  var x4 = dte > 0 ? Math.min(10, (1 + dte) / dte) : 5;
  // X5: Revenue / Total Assets ≈ revenuePerShare / bookValuePerShare
  var x5 = Math.max(0, Math.min(5, rev / bvps));

  var z = 1.2*x1 + 1.4*x2 + 3.3*x3 + 0.6*x4 + 1.0*x5;
  return parseFloat(z.toFixed(2));
}

function renderFundamentals(f) {
  let el = document.getElementById('fundamentals-card');
  if (!el) return;
  let mktCap = f.marketCap > 0
    ? (f.marketCap >= 1000000 ? '$' + (f.marketCap / 1000000).toFixed(2) + 'T'
      : f.marketCap >= 1000 ? '$' + (f.marketCap / 1000).toFixed(1) + 'B'
      : '$' + f.marketCap.toFixed(0) + 'M')
    : '—';
  let divYield = f.dividend > 0 ? f.dividend.toFixed(2) + '%' : 'None';

  // Earnings values
  let nextEarningsVal = '—';
  if (f.nextEarningsDate) {
    let d = new Date(f.nextEarningsDate + "T12:00:00");
    nextEarningsVal = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  let lastEarningsVal = '—';
  if (f.lastEarnings && f.lastEarnings.actual != null) {
    let beat = f.lastEarnings.estimate != null ? (f.lastEarnings.actual >= f.lastEarnings.estimate ? "Beat" : "Missed") : null;
    let beatColor = beat === "Beat" ? "#128257" : "#dc2626";
    lastEarningsVal = "$" + f.lastEarnings.actual.toFixed(2) +
      (beat ? " <span style='color:" + beatColor + ";font-weight:700;font-size:11px;'>" + beat + "</span>" : "");
  }

  // Altman Z-Score display
  var zVal = '—', zColor = 'var(--text)', zLabel = '';
  if (f.zScore !== null && f.zScore !== undefined) {
    zVal = f.zScore.toFixed(2);
    if (f.zScore >= 3)      { zColor = '#128257'; zLabel = 'Safe'; }
    else if (f.zScore >= 1.81) { zColor = '#e07510'; zLabel = 'Grey Zone'; }
    else                    { zColor = '#dc2626'; zLabel = 'Distress'; }
    zVal = '<span style="color:' + zColor + ';font-weight:700;">' + zVal + '</span><span style="font-size:11px;color:' + zColor + ';margin-left:4px;">(' + zLabel + ')</span>';
  }

  let items = [
    { label: 'Market Cap',     value: mktCap },
    { label: 'P/E Ratio',      value: f.pe > 0 ? f.pe.toFixed(1) : '—' },
    { label: 'Dividend Yield', value: divYield },
    { label: 'Beta',           value: f.beta > 0 ? f.beta.toFixed(2) : '—' },
    { label: 'Profit Margin',  value: f.margin !== 0 ? f.margin.toFixed(1) + '%' : '—' },
    { label: 'Rev. Growth',    value: f.growth !== 0 ? (f.growth > 0 ? '+' : '') + f.growth.toFixed(1) + '%' : '—' },
    { label: 'Altman Z-Score', value: zVal },
    { label: 'Next Earnings',  value: nextEarningsVal },
    { label: 'Last EPS',       value: lastEarningsVal },
  ];
  el.innerHTML = '<h2>KEY STATS</h2><div class="fundamentals-grid">' +
    items.map(function(i) {
      let hasTermLink = !!_termMap[i.label];
      let labelHtml = hasTermLink
        ? "<span class='term-link' onclick=\"openTerm('" + i.label.replace(/'/g, "\\'") + "')\" title='Learn more'>" + i.label + "</span>"
        : i.label;
      return "<div class='fund-item'><div class='fund-label'>" + labelHtml + "</div><div class='fund-value'>" + i.value + "</div></div>";
    }).join('') + '</div>';
  el.style.display = 'block';
}

function loadDividendCard(ticker) {
  var el = document.getElementById('dividend-card');
  if (!el) return;
  fetch(finnhubUrl('/api/v1/stock/dividend2', { symbol: ticker }))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var divs = (data.data || []).filter(function(d) { return d.exDate; });
      if (divs.length === 0) { el.style.display = 'none'; return; }
      // Sort descending by exDate
      divs.sort(function(a, b) { return b.exDate > a.exDate ? 1 : -1; });
      renderDividendCard(divs, el);
    })
    .catch(function() { el.style.display = 'none'; });
}

function renderDividendCard(divs, el) {
  var latest = divs[0];
  var exDate  = latest.exDate  ? new Date(latest.exDate  + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  var payDate = latest.payDate ? new Date(latest.payDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  var amount  = latest.amount  ? '$' + parseFloat(latest.amount).toFixed(4) + ' / share' : '—';
  var freq    = latest.frequency || '';
  var freqMap = { annual: 'Annual', 'semi-annual': 'Semi-Annual', quarterly: 'Quarterly', monthly: 'Monthly' };
  var freqStr = freqMap[freq.toLowerCase()] || freq || '—';

  // Calculate annual run-rate from recent dividends
  var recentYear = divs.filter(function(d) {
    return d.exDate && d.exDate >= new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
  });
  var annualAmt = recentYear.reduce(function(sum, d) { return sum + (parseFloat(d.amount) || 0); }, 0);

  // Is next ex-date in the future?
  var nextExEl = '';
  var futureDiv = divs.find(function(d) { return d.exDate && d.exDate > new Date().toISOString().split('T')[0]; });
  if (futureDiv) {
    var daysTo = Math.round((new Date(futureDiv.exDate + 'T12:00:00') - new Date()) / 86400000);
    var urgColor = daysTo <= 7 ? '#e07510' : 'var(--text-muted)';
    nextExEl = '<div class="div-next-ex">Next ex-date: <strong>' +
      new Date(futureDiv.exDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      '</strong> <span style="color:' + urgColor + ';font-size:11px;">(' + (daysTo === 0 ? 'Today' : daysTo === 1 ? 'Tomorrow' : 'In ' + daysTo + 'd') + ')</span>' +
      '<div class="div-next-ex-tip">Own shares before this date to receive the dividend</div>' +
      '</div>';
  }

  var items = [
    { label: 'Last Ex-Date',  value: exDate },
    { label: 'Payment Date',  value: payDate },
    { label: 'Per Share',     value: amount },
    { label: 'Frequency',     value: freqStr },
    { label: 'Annual (est.)', value: annualAmt > 0 ? '$' + annualAmt.toFixed(2) + ' / share' : '—' },
  ];

  el.innerHTML = '<h2>DIVIDEND</h2>' +
    nextExEl +
    '<div class="fundamentals-grid">' +
    items.map(function(i) {
      return "<div class='fund-item'><div class='fund-label'>" + i.label + "</div><div class='fund-value'>" + i.value + "</div></div>";
    }).join('') + '</div>';
  el.style.display = 'block';
}

function renderEarningsCard(nextEarningsDate, lastEarnings, companyName) {
  var el = document.getElementById('earnings-card');
  if (!el) return;
  if (!nextEarningsDate) { el.style.display = 'none'; return; }

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var eDate = new Date(nextEarningsDate + 'T12:00:00');
  var daysUntil = Math.round((eDate - today) / 86400000);

  var dateStr = eDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  var urgencyColor, countdownText, urgencyBg;
  if (daysUntil <= 0) {
    urgencyColor = '#dc2626'; countdownText = 'Today'; urgencyBg = 'rgba(220,38,38,0.08)';
  } else if (daysUntil === 1) {
    urgencyColor = '#dc2626'; countdownText = 'Tomorrow'; urgencyBg = 'rgba(220,38,38,0.08)';
  } else if (daysUntil <= 7) {
    urgencyColor = '#e07510'; countdownText = 'In ' + daysUntil + ' days'; urgencyBg = 'rgba(224,117,16,0.08)';
  } else if (daysUntil <= 30) {
    urgencyColor = 'var(--accent-blue)'; countdownText = 'In ' + daysUntil + ' days'; urgencyBg = 'rgba(14,165,233,0.07)';
  } else {
    urgencyColor = 'var(--text-muted)'; countdownText = 'In ' + daysUntil + ' days'; urgencyBg = 'var(--surface2)';
  }

  var lastHtml = '';
  if (lastEarnings && lastEarnings.actual != null) {
    var beat = lastEarnings.estimate != null
      ? (lastEarnings.actual >= lastEarnings.estimate ? 'Beat' : 'Missed')
      : null;
    var beatColor = beat === 'Beat' ? '#128257' : '#dc2626';
    lastHtml = '<div class="earnings-last">' +
      '<span class="earnings-last-label">Last quarter:</span> ' +
      '<span class="earnings-last-val">$' + lastEarnings.actual.toFixed(2) + ' EPS</span>' +
      (beat ? ' <span class="earnings-badge" style="color:' + beatColor + ';border-color:' + beatColor + ';">' + beat + ' estimate</span>' : '') +
    '</div>';
  }

  el.innerHTML =
    '<div class="earnings-card-inner" style="background:' + urgencyBg + ';border-color:' + urgencyColor + ';">' +
      '<div class="earnings-header">' +
        '<span class="earnings-label">NEXT EARNINGS</span>' +
        '<span class="earnings-countdown" style="color:' + urgencyColor + ';">' + countdownText + '</span>' +
      '</div>' +
      '<div class="earnings-date">' + dateStr + '</div>' +
      '<div class="earnings-explainer">This is when ' + escHtml(companyName) + ' will report its quarterly results. ' +
        'Stock prices often move <strong>5–15% in a single day</strong> around earnings — ' +
        (daysUntil <= 7 ? 'this is coming up very soon.' : 'worth keeping an eye on.') +
      '</div>' +
      lastHtml +
    '</div>';
  el.style.display = 'block';
}

// ── STOCK QUIZ ─────────────────────────────────────────────────────────────
function buildStockQuiz(ticker, companyName, pe, beta, margin, growth, rsi, totalScore, currentRatio) {
  var questions = [];

  if (pe > 0) {
    var peLevel = pe < 15 ? 'Low' : pe < 30 ? 'Average' : 'High';
    var peWrong = pe < 15 ? ['Average', 'High'] : pe < 30 ? ['Low', 'High'] : ['Low', 'Average'];
    questions.push({
      q: companyName + ' has a P/E ratio of ' + pe.toFixed(1) + '. How does that compare to a typical stock?',
      options: shuffle([peLevel, peWrong[0], peWrong[1]]),
      answer: peLevel,
      explain: pe < 15
        ? 'A P/E below 15 is considered low — you\'re paying less per dollar of earnings. This can mean the stock is cheap, or that growth is slow.'
        : pe < 30
        ? 'A P/E between 15–30 is in the normal range for most quality companies. Not cheap, not expensive.'
        : 'A P/E above 30 is high — investors expect strong future growth. If that growth doesn\'t come, the stock can fall sharply.',
      term: 'P/E Ratio'
    });
  }

  if (beta > 0) {
    var betaLevel = beta < 0.8 ? 'Less volatile than the market' : beta < 1.3 ? 'About as volatile as the market' : 'More volatile than the market';
    var betaWrong = beta < 0.8
      ? ['About as volatile as the market', 'More volatile than the market']
      : beta < 1.3
      ? ['Less volatile than the market', 'More volatile than the market']
      : ['Less volatile than the market', 'About as volatile as the market'];
    questions.push({
      q: companyName + ' has a beta of ' + beta.toFixed(2) + '. What does that tell you?',
      options: shuffle([betaLevel, betaWrong[0], betaWrong[1]]),
      answer: betaLevel,
      explain: 'Beta measures how much a stock moves vs the market. Beta 1.0 = moves with market. Below 1 = calmer. Above 1.5 = bigger swings both ways.',
      term: 'Beta'
    });
  }

  if (rsi !== null) {
    var rsiZone = rsi < 30 ? 'Oversold — possible bounce coming' : rsi > 70 ? 'Overbought — could correct soon' : 'Neutral — no extreme signal';
    var rsiWrong = rsi < 30
      ? ['Overbought — could correct soon', 'Neutral — no extreme signal']
      : rsi > 70
      ? ['Oversold — possible bounce coming', 'Neutral — no extreme signal']
      : ['Oversold — possible bounce coming', 'Overbought — could correct soon'];
    questions.push({
      q: companyName + '\'s RSI is ' + rsi + '. What zone does that put it in?',
      options: shuffle([rsiZone, rsiWrong[0], rsiWrong[1]]),
      answer: rsiZone,
      explain: 'RSI runs 0–100. Below 30 = oversold (stock may have fallen too far, could bounce). Above 70 = overbought (stock may have risen too fast). 30–70 = neutral.',
      term: 'RSI'
    });
  }

  if (margin !== 0) {
    var marginLevel = margin > 20 ? 'Excellent' : margin > 10 ? 'Healthy' : margin > 0 ? 'Thin' : 'Negative';
    var marginWrong = margin > 20 ? ['Healthy', 'Thin'] : margin > 10 ? ['Excellent', 'Thin'] : margin > 0 ? ['Healthy', 'Excellent'] : ['Thin', 'Healthy'];
    questions.push({
      q: companyName + ' keeps ' + margin.toFixed(1) + '% of every dollar as profit. How would you describe that margin?',
      options: shuffle([marginLevel, marginWrong[0], marginWrong[1]]),
      answer: marginLevel,
      explain: 'Profit margin above 20% is exceptional (most software companies). 10–20% is healthy. Under 5% is thin — the company is vulnerable to cost increases.',
      term: 'Profit Margin'
    });
  }

  if (totalScore > 0) {
    var scoreRange = totalScore >= 70 ? 'Strong — fundamentals look solid' : totalScore >= 50 ? 'Watch & Wait — some risks present' : 'Risky — multiple weak factors';
    var scoreWrong = totalScore >= 70
      ? ['Watch & Wait — some risks present', 'Risky — multiple weak factors']
      : totalScore >= 50
      ? ['Strong — fundamentals look solid', 'Risky — multiple weak factors']
      : ['Strong — fundamentals look solid', 'Watch & Wait — some risks present'];
    questions.push({
      q: companyName + ' scores ' + totalScore + '/100. What signal does StockIQ give it?',
      options: shuffle([scoreRange, scoreWrong[0], scoreWrong[1]]),
      answer: scoreRange,
      explain: 'Scores 85–100 = Exceptional. 70–84 = Strong. 55–69 = Watch. 40–54 = Weak. Below 40 = Risky.',
      term: null
    });
  }

  return questions.slice(0, 3); // max 3 questions
}

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

var _quizState = { questions: [], current: 0, score: 0 };

function showStockQuiz(ticker, companyName, pe, beta, margin, growth, rsi, totalScore, currentRatio) {
  var qs = buildStockQuiz(ticker, companyName, pe, beta, margin, growth, rsi, totalScore, currentRatio);
  if (qs.length === 0) return;
  _quizState = { questions: qs, current: 0, score: 0 };
  var overlay = document.getElementById('stock-quiz-overlay');
  if (overlay) overlay.style.display = 'flex';
  renderQuizQuestion();
}

function renderQuizQuestion() {
  var body = document.getElementById('stock-quiz-body');
  if (!body) return;
  var state = _quizState;
  var q = state.questions[state.current];
  var total = state.questions.length;

  body.innerHTML =
    '<div class="quiz-progress">' +
      '<div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:' + (state.current / total * 100) + '%"></div></div>' +
      '<span class="quiz-progress-text">Question ' + (state.current + 1) + ' of ' + total + '</span>' +
    '</div>' +
    '<div class="quiz-question">' + q.q + '</div>' +
    '<div class="quiz-options">' +
    q.options.map(function(opt) {
      return '<button class="quiz-option" onclick="answerQuiz(\'' + opt.replace(/'/g, "\\'") + '\')">' + opt + '</button>';
    }).join('') +
    '</div>';
}

function answerQuiz(chosen) {
  var state = _quizState;
  var q = state.questions[state.current];
  var correct = chosen === q.answer;
  if (correct) { state.score++; addXP(15); } // +15 XP for correct quiz answer

  var body = document.getElementById('stock-quiz-body');
  var optBtns = body.querySelectorAll('.quiz-option');
  optBtns.forEach(function(btn) {
    btn.disabled = true;
    if (btn.textContent === q.answer) btn.classList.add('correct');
    else if (btn.textContent === chosen && !correct) btn.classList.add('wrong');
  });

  var feedback = document.createElement('div');
  feedback.className = 'quiz-feedback ' + (correct ? 'correct' : 'wrong');
  feedback.innerHTML =
    '<div class="quiz-feedback-icon">' + (correct ? '✓ Correct!' : '✗ Not quite') + '</div>' +
    '<div class="quiz-feedback-explain">' + q.explain + '</div>' +
    (q.term ? '<button class="quiz-learn-btn" onclick="openTerm(\'' + q.term + '\')">Learn more about ' + q.term + ' →</button>' : '') +
    '<button class="quiz-next-btn" onclick="nextQuizQuestion()">' + (state.current + 1 < state.questions.length ? 'Next question →' : 'See results →') + '</button>';
  body.appendChild(feedback);
}

function nextQuizQuestion() {
  var state = _quizState;
  state.current++;
  if (state.current >= state.questions.length) {
    showQuizResults();
  } else {
    renderQuizQuestion();
  }
}

function showQuizResults() {
  var state = _quizState;
  var body = document.getElementById('stock-quiz-body');
  var pct = Math.round((state.score / state.questions.length) * 100);
  var msg = pct === 100 ? 'Perfect score! You\'re learning fast.' : pct >= 66 ? 'Good work! Keep analyzing stocks to sharpen your knowledge.' : 'Keep going — every stock you analyze teaches you something new.';
  var icon = pct === 100
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>'
    : pct >= 66
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
  body.innerHTML =
    '<div class="quiz-results">' +
      '<div class="quiz-results-icon">' + icon + '</div>' +
      '<div class="quiz-results-score">' + state.score + ' / ' + state.questions.length + '</div>' +
      '<div class="quiz-results-msg">' + msg + '</div>' +
      '<button class="quiz-next-btn" onclick="closeStockQuiz()">Done</button>' +
    '</div>';
  // Mark this stock's quiz as done and unlock the breakdown
  if (currentTicker) {
    markQuizCompletedFor(currentTicker);
    _unlockBreakdownAfterQuiz();
  }
  // Update streak/achievement for completing a quiz
  var quizCount = parseInt(localStorage.getItem('quizzes-completed') || '0') + 1;
  localStorage.setItem('quizzes-completed', quizCount);
}

function closeStockQuiz() {
  var overlay = document.getElementById('stock-quiz-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── DAILY TIP ──────────────────────────────────────────────────────────────
var DAILY_TIPS = [
  { term: 'P/E Ratio',          tip: 'The P/E ratio tells you how much investors pay for every $1 a company earns. A P/E of 20 means you pay $20 for $1 of profit. Lower can mean cheaper — but also less growth expected.' },
  { term: 'Beta',               tip: 'Beta measures how much a stock moves compared to the market. A beta of 1.5 means if the market drops 10%, this stock typically drops 15%. Higher beta = more risk and more reward.' },
  { term: 'Dividend',           tip: 'A dividend is cash a company pays you just for owning its stock — usually every quarter. If Apple pays a 0.5% dividend and you own $10,000 in stock, you get $50/year without selling anything.' },
  { term: 'Market Cap',         tip: 'Market cap = share price × number of shares. It tells you the total value of a company. Apple is a mega-cap ($3T+). A small-cap company might be worth $500M. Bigger isn\'t always better.' },
  { term: 'RSI',                tip: 'RSI (Relative Strength Index) measures momentum on a 0-100 scale. Below 30 means the stock may be oversold and due for a bounce. Above 70 means it may be overbought and due for a pullback.' },
  { term: 'Moving Average',     tip: 'A moving average smooths out daily price swings to show the trend. If a stock is above its 50-day average, it\'s in an uptrend. Below = downtrend. Traders use this as a buy/sell signal.' },
  { term: 'Profit Margin',      tip: 'Profit margin = how many cents of profit a company keeps per dollar of sales. A 20% margin means for every $100 in revenue, $20 is profit. Software companies often have 30%+ margins.' },
  { term: 'Revenue Growth',     tip: 'Revenue growth shows if a company is selling more over time. 15%+ growth is fast. Negative growth is a warning sign. Growth companies often trade at high P/E ratios because investors expect future profits.' },
  { term: 'ROE',                tip: 'Return on Equity shows how efficiently a company uses shareholder money to generate profit. ROE of 20% means for every $100 investors put in, the company generates $20 in profit. Warren Buffett loves high ROE.' },
  { term: 'Diversification',    tip: 'Owning stocks in different sectors reduces risk. If you own 10 tech stocks, a bad tech week hurts everything. But if you also own healthcare and energy, those may hold up while tech falls.' },
  { term: 'Sector Rotation',    tip: 'As the economy changes, investors move money between sectors. When interest rates rise, money often flows from tech (hurt by high rates) into financials (banks earn more on loans).' },
  { term: 'EPS',                tip: 'EPS (Earnings Per Share) = total profit divided by shares outstanding. If a company earns $1B and has 500M shares, EPS is $2. When EPS grows quarter over quarter, it\'s a positive sign.' },
  { term: 'DCA',                tip: 'Dollar-cost averaging means investing a fixed amount regularly (e.g. $100/month) regardless of price. You buy more shares when prices are low and fewer when high — reducing the impact of volatility.' },
  { term: 'Free Cash Flow',     tip: 'Free cash flow is the actual cash a company generates after paying for operations and investments. It\'s harder to fake than reported earnings. Companies with strong FCF can pay dividends, buy back stock, or invest in growth.' },
  { term: 'Interest Coverage',  tip: 'Interest coverage ratio = earnings divided by interest payments. A ratio of 5x means the company earns 5x what it owes in interest. Below 1.5x is dangerous — the company may struggle to pay its debt.' },
];

// ── ONBOARDING ─────────────────────────────────────────────────────────────

function initOnboarding() {
  if (localStorage.getItem('onboarding-done') || localStorage.getItem('tour-done')) return;
  var overlay = document.getElementById('welcome-overlay');
  if (overlay) overlay.style.display = 'flex';
  setTimeout(function() {
    var input = document.getElementById('onboarding-input');
    if (input) input.focus();
  }, 300);
}

function onboardingSearch() {
  var val = (document.getElementById('onboarding-input').value || '').trim();
  if (!val) { showToast('Type a ticker or company name first!'); return; }
  dismissOnboarding();
  var mainInput = document.getElementById('stock-input');
  if (mainInput) mainInput.value = val;
  searchStock();
}

function setOnboardingTicker(ticker) {
  var input = document.getElementById('onboarding-input');
  if (input) { input.value = ticker; input.focus(); }
}

function dismissOnboarding() {
  var overlay = document.getElementById('welcome-overlay');
  if (overlay) {
    overlay.classList.add('onboarding-exit');
    setTimeout(function() { overlay.style.display = 'none'; overlay.classList.remove('onboarding-exit'); }, 300);
  }
  localStorage.setItem('onboarding-done', '1');
}

function pickOnboardingStock(ticker) {
  localStorage.setItem('tour-done', '1');
  var overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.style.display = 'none';
  showTab('analyze');
  var mainInput = document.getElementById('stock-input');
  if (mainInput) mainInput.value = ticker;
  _showFirstPortfolioBanner = true;
  searchStock();
}

function showFirstPortfolioBanner(name) {
  if (localStorage.getItem('first-portfolio-done')) return;
  var el = document.getElementById('first-portfolio-banner');
  var nameEl = document.getElementById('fpb-company');
  if (!el) return;
  if (nameEl) nameEl.textContent = name;
  el.style.display = 'flex';
}

function dismissFirstPortfolioBanner() {
  var el = document.getElementById('first-portfolio-banner');
  if (el) el.style.display = 'none';
}

// ── QUICK TICKERS ──────────────────────────────────────────────────────────

function showQuickTickers() {
  var results = document.getElementById('results-section');
  var loading = document.getElementById('loading');
  if (results && results.style.display !== 'none') return; // already have results
  if (loading && loading.style.display !== 'none') return;
  var el = document.getElementById('quick-tickers');
  if (el) el.style.display = 'flex';
  // Restore screener if it was hidden (user tapped search to do a new lookup)
  var sp = document.getElementById('screener-panel');
  if (sp) sp.style.display = 'block';
}

function hideQuickTickers() {
  var el = document.getElementById('quick-tickers');
  if (el) el.style.display = 'none';
}

function pickQuickTicker(ticker) {
  var input = document.getElementById('stock-input');
  if (input) input.value = ticker;
  hideQuickTickers();
  searchStock();
}

// ── COACH MARK ─────────────────────────────────────────────────────────────

function maybeShowCoachMark() {
  if (localStorage.getItem('coach-mark-seen')) return;
  var scoreEl = document.getElementById('health-score');
  if (!scoreEl) return;
  var cm = document.getElementById('coach-mark');
  if (!cm) return;
  cm.style.display = 'block';
  // Position below the health score
  var rect = scoreEl.getBoundingClientRect();
  cm.style.top = (rect.bottom + window.scrollY + 12) + 'px';
  cm.style.left = Math.max(12, rect.left + window.scrollX) + 'px';
}

function dismissCoachMark() {
  var cm = document.getElementById('coach-mark');
  if (cm) cm.style.display = 'none';
  localStorage.setItem('coach-mark-seen', '1');
}

function renderDailyTip() {
  var el = document.getElementById('daily-tip');
  if (!el) return;
  var dayIndex = Math.floor(Date.now() / 86400000);
  var dismissed = localStorage.getItem('tip-dismissed-' + dayIndex);
  if (dismissed) { el.style.display = 'none'; return; }
  var tip = DAILY_TIPS[dayIndex % DAILY_TIPS.length];
  el.innerHTML =
    '<div class="daily-tip-inner">' +
      '<div class="daily-tip-left">' +
        '<span class="daily-tip-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg></span>' +
        '<div>' +
          '<div class="daily-tip-label">DID YOU KNOW?</div>' +
          '<div class="daily-tip-term">' + tip.term + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="daily-tip-close" onclick="dismissDailyTip(' + dayIndex + ')" title="Dismiss">✕</button>' +
    '</div>' +
    '<div class="daily-tip-text">' + tip.tip + '</div>' +
    '<button class="daily-tip-learn" onclick="openTerm(\'' + tip.term + '\')">Learn more about ' + tip.term + ' →</button>';
  el.style.display = 'block';
}

function dismissDailyTip(dayIndex) {
  localStorage.setItem('tip-dismissed-' + dayIndex, '1');
  var el = document.getElementById('daily-tip');
  if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.2s'; setTimeout(function() { el.style.display = 'none'; }, 200); }
}

// ── SCORE EXPLAINER ────────────────────────────────────────────────────────
function renderScoreExplainer(score) {
  var el = document.getElementById('score-explainer-card');
  if (!el) return;
  var ranges = [
    { min: 85, max: 100, color: '#0a6642', label: 'Exceptional', desc: 'Top-tier fundamentals across nearly every pillar. Very few stocks reach this level.' },
    { min: 70, max: 84,  color: '#128257', label: 'Strong',      desc: 'Solid business quality and safety. Well-run company with manageable risk.' },
    { min: 55, max: 69,  color: '#c17d08', label: 'Watch',       desc: 'Some positives, but notable concerns. Worth monitoring before acting.' },
    { min: 40, max: 54,  color: '#c4430f', label: 'Weak',        desc: 'Multiple problem areas. Needs significant improvement before showing strength.' },
    { min: 0,  max: 39,  color: '#dc2626', label: 'Risky',       desc: 'Major red flags across pillars. High risk — research very carefully.' },
  ];
  var current = ranges.find(function(r) { return score >= r.min && score <= r.max; });

  el.innerHTML =
    '<p class="score-inline-desc">' + current.desc + '</p>' +
    '<div class="score-explainer-trigger" onclick="toggleScoreExplainer()">' +
      '<span class="score-explainer-q">See 13-factor breakdown</span>' +
      '<span class="score-explainer-chevron" id="score-explainer-chevron">▾</span>' +
    '</div>' +
    '<div class="score-explainer-body" id="score-explainer-body" style="display:none;">' +
      ranges.map(function(r) {
        var isActive = r.label === current.label;
        return '<div class="score-explainer-range' + (isActive ? ' active' : '') + '" style="' + (isActive ? 'border-color:' + r.color + ';background:' + r.color + '18;' : '') + '">' +
          '<span class="score-range-band" style="color:' + r.color + ';">' + r.min + (r.max === 100 ? '–100' : '–' + r.max) + '</span>' +
          '<span class="score-range-label" style="color:' + r.color + ';font-weight:700;">' + r.label + '</span>' +
          '<span class="score-range-desc">' + r.desc + '</span>' +
        '</div>';
      }).join('') +
      '<p class="score-explainer-note">Scroll down to see the 13 factors that make up this score.</p>' +
    '</div>' +
    (function() {
      var analyzed = parseInt(localStorage.getItem('total-analyzed') || '0');
      return analyzed <= 5 ? '<p class="score-first-nudge">New to these scores? Tap the question above to learn what each range means, then scroll down for the full breakdown.</p>' : '';
    })();
  el.style.display = 'block';
}

function toggleScoreExplainer() {
  var body = document.getElementById('score-explainer-body');
  var chevron = document.getElementById('score-explainer-chevron');
  if (!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.textContent = isOpen ? '▾' : '▴';
}

// ── CONTEXTUAL TERMS ───────────────────────────────────────────────────────
function renderContextualTerms(pe, beta, margin, growth, rsi, ma50, currentRatio, interestCoverage) {
  var el = document.getElementById('contextual-terms');
  if (!el) return;
  var terms = [];
  if (pe > 0) terms.push('P/E Ratio');
  if (beta > 0) terms.push('Beta');
  if (margin !== 0) terms.push('Profit Margin');
  if (growth !== 0) terms.push('Revenue Growth');
  if (rsi !== null) terms.push('RSI');
  if (ma50 !== null) terms.push('Moving Average');
  if (currentRatio > 0) terms.push('Current Ratio');
  if (interestCoverage > 0) terms.push('Interest Coverage');
  terms.push('Altman Z-Score');
  // Pick 4 most relevant
  terms = terms.slice(0, 4);
  if (terms.length === 0) { el.style.display = 'none'; return; }
  el.innerHTML =
    '<div class="ctx-terms-label">Based on this result, learn about:</div>' +
    '<div class="ctx-terms-chips">' +
    terms.map(function(t) {
      return '<button class="ctx-term-chip" onclick="openTerm(\'' + t.replace(/'/g, "\\'") + '\')">' + t + ' →</button>';
    }).join('') +
    '</div>';
  el.style.display = 'block';
}

function renderNewsSection(news, ticker, companyName) {
  let section = document.getElementById('news-section');
  let list = document.getElementById('news-list');
  if (!section || !list) return;
  if (!news || news.length === 0) { section.style.display = 'none'; return; }
  let relevant = news.filter(function(a) {
    return a.headline.toLowerCase().includes(ticker.toLowerCase()) ||
           a.headline.toLowerCase().includes(companyName.toLowerCase().split(' ')[0]);
  });
  let articles = (relevant.length > 0 ? relevant : news).slice(0, 5);
  list.innerHTML = articles.map(function(a) {
    let date = a.datetime ? new Date(a.datetime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    let source = escHtml(a.source || '');
    let url = a.url || '#';
    return "<a class='news-item' href='" + escHtml(url) + "' target='_blank' rel='noopener'>" +
      "<div class='news-headline'>" + escHtml(a.headline) + "</div>" +
      "<div class='news-meta'>" + (source ? source + ' · ' : '') + date + "</div>" +
    "</a>";
  }).join('');
  section.style.display = 'block';
}

var _WHY_EXPLANATIONS = {
  "P/E Ratio": "The Price-to-Earnings ratio tells you how much investors are paying per dollar of profit. A P/E of 25 means you're paying $25 for every $1 the company earns annually. <span class='score-why-deep'>Context matters here: a P/E of 30 is cheap for a software company growing 40% per year, but expensive for a slow-growth retailer. Compare against the sector average, not just an abstract number. High P/E = high expectations baked in, so any miss on earnings hits harder. Negative P/E means the company is currently unprofitable — not automatically bad if they're investing heavily in growth (Amazon was unprofitable for years).</span>",

  "Profit Margin": "Profit margin is the percentage of revenue the company keeps as profit after all costs. A 20% margin means for every $100 in sales, $20 flows to the bottom line. <span class='score-why-deep'>Software companies often run 25–40% margins because their product costs almost nothing to replicate. Retailers like Walmart run 2–3% because they have massive operating costs. So \"good\" is entirely sector-dependent. What you really want to watch: is the margin expanding or shrinking over time? A business compressing margins while growing revenue fast can still be fine — but shrinking margins with flat growth is a warning sign.</span>",

  "Revenue Growth": "Revenue growth measures how fast the company's sales are expanding year-over-year. It's the top line — before any costs are taken out. <span class='score-why-deep'>Growth is the engine of future value. A company growing revenue 20%+ annually is compounding its business base, which can justify a high P/E today. But growth alone isn't enough — it needs to eventually convert to profit. Watch for the combination: strong growth + expanding margins = compounding value. Declining revenue is a serious flag, especially if the company carries debt, because the math on debt repayment stops working fast.</span>",

  "Risk (Beta)": "Beta measures how much a stock moves relative to the overall market (S&P 500 = 1.0). Beta 1.5 means when the market drops 10%, this stock typically drops 15%. <span class='score-why-deep'>Beta is a double-edged sword: high-beta stocks amplify your gains in bull markets but amplify losses in downturns. Conservative investors prefer beta under 1.0 — utilities, consumer staples, healthcare tend to sit here. Aggressive investors or traders seek high beta for bigger moves. Important caveat: beta is calculated from historical price data and can change. A stock with low beta can suddenly become volatile if the business fundamentally shifts.</span>",

  "RSI": "RSI (Relative Strength Index) is a momentum indicator from 0–100 measuring how fast and how much a stock has moved recently. Above 70 = overbought. Below 30 = oversold. <span class='score-why-deep'>RSI doesn't tell you what a stock is worth — it tells you how stretched the recent move is. An RSI of 80 doesn't mean \"sell immediately\" but it does mean the stock has run hard and a pause or pullback is statistically more likely. Conversely, RSI under 30 can signal a capitulation bottom — fear-driven selling that's created an opportunity. Most useful as one signal among many, not in isolation. RSI works better in range-bound markets than in strong trending ones.</span>",

  "Moving Average": "A moving average smooths out daily price noise to reveal the underlying trend. The 50-day average is one of the most-watched levels on Wall Street — institutions buy and sell around it. <span class='score-why-deep'>When a stock is above its 50-day average, it's in an uptrend by definition — buyers are in control. Below it, sellers have the edge. The 200-day average is an even longer-term trend signal. The \"golden cross\" (50-day crossing above 200-day) is a classic bullish signal; the \"death cross\" is the opposite. These aren't magic — they work because enough traders watch them that they become self-fulfilling at key levels.</span>",

  "News Sentiment": "This scores recent headlines and news coverage around the stock, from strongly negative to strongly positive. <span class='score-why-deep'>News sentiment moves prices in the short term, sometimes dramatically. An earnings beat with positive guidance can send a stock up 10–20% overnight. But sentiment is also the most noise-heavy signal here — a negative headline about a competitor, a CEO quote taken out of context, or general market fear can all drag sentiment without changing the underlying business at all. Use this as a short-term awareness signal, not a fundamental judgment. If sentiment is negative but fundamentals are strong, that's often where long-term opportunity lives.</span>",

  "ROE": "Return on Equity measures how efficiently management is generating profit from shareholders' money. ROE of 20% means for every $100 of equity in the business, they're generating $20 in profit. <span class='score-why-deep'>Warren Buffett considers ROE one of the most important metrics — he looks for companies consistently generating 15%+ ROE without taking on excessive debt. The trap: ROE can look artificially high if a company uses a lot of debt (since debt reduces equity in the denominator). Always pair ROE with the debt level. A company with 40% ROE and no debt is exceptional. A company with 40% ROE and massive leverage is a different animal entirely.</span>",

  "Debt Level": "Measures how much debt the company carries relative to its assets or earnings. High debt amplifies both gains and risk — it's leverage in both directions. <span class='score-why-deep'>Debt isn't inherently bad. A company borrowing cheaply to expand into high-return opportunities is smart capital allocation. The danger zone is high debt + falling revenue + rising interest rates — a combination that can turn a business problem into an existential crisis fast. Key ratio to watch: interest coverage (how many times earnings cover interest payments). Below 3x is where it starts getting uncomfortable. Below 1x means they can't cover their interest from operations alone.</span>",

  "Current Ratio": "Current ratio compares what a company owns in the short term (current assets) vs. what it owes in the short term (current liabilities). A ratio above 1.0 means it can cover its near-term obligations. <span class='score-why-deep'>Think of it as a liquidity stress test for the next 12 months. A ratio of 2.0+ is very healthy — plenty of buffer. Below 1.0 is a yellow flag: the company would need to generate cash quickly or find financing to meet its obligations if things slowed down. That said, some excellent companies run low current ratios intentionally (Amazon, for example) because they collect cash from customers before paying suppliers — a powerful business model advantage.</span>",

  "Interest Coverage": "Interest coverage shows how many times a company's operating earnings cover its interest payments. A ratio of 5x means it earns 5 times what it pays in interest — comfortable. <span class='score-why-deep'>This is the debt reality check. A company might look fine on paper but if it's barely covering interest payments, any revenue softness creates a cash crunch. Below 3x, investors start getting nervous. Below 1.5x, credit rating agencies start paying attention. During the 2008 and 2020 crises, companies with strong interest coverage survived; those with weak coverage either diluted shareholders massively or went bankrupt. It's one of the clearest early warning signals of financial fragility.</span>",

  "52wk Position": "Shows where the stock sits relative to its 52-week high — the highest price it's traded at over the past year. <span class='score-why-deep'>Being near the 52-week high is generally bullish — it means buyers keep showing up and the stock keeps getting bid higher. Being far below it could mean opportunity (the business hasn't changed but fear drove the price down) or it could mean a fundamental deterioration (the market repriced it lower for good reason). This signal works best alongside the fundamentals: a stock 40% below its high with strong earnings growth is very different from one 40% below its high with declining revenue.</span>",

  "Price Movement": "Today's price change as a percentage, reflecting buying and selling pressure in the current session. <span class='score-why-deep'>Single-day moves are mostly noise unless accompanied by high volume or a specific catalyst (earnings, news, analyst upgrade). A stock up 5% on 3x normal volume on a good earnings report is meaningful. A stock up 1.2% on a quiet day is essentially random. Where single-day moves matter most: they can trigger stop-losses and momentum strategies, which can then cascade into bigger moves than the original catalyst warranted. Don't make long-term decisions based on a one-day swing.</span>",

  "Altman Z-Score": "The Altman Z-Score is a formula created by NYU professor Edward Altman in 1968 to predict the likelihood a company goes bankrupt within two years. It combines five financial ratios into a single number. <span class='score-why-deep'>The three zones: <strong>Safe Zone (Z ≥ 3.0)</strong> — the company's finances look solid, bankruptcy is unlikely. <strong>Grey Zone (1.81–2.99)</strong> — some stress signals, outcome uncertain. <strong>Distress Zone (below 1.81)</strong> — elevated bankruptcy risk, proceed with caution. The five components are: working capital efficiency, retained earnings accumulation, operating profitability, equity vs. liabilities buffer, and asset turnover. Originally built for manufacturing companies, it's less precise for financial firms, startups, or asset-light tech businesses — but still a useful early warning signal. A score trending downward over several quarters is more concerning than a single data point. Pair it with interest coverage and debt levels for the full picture.</span>"
};

// ── ACTIVE LEARNING SYSTEM ────────────────────────────────────────────────
var _d1Answer = null;
var _d2Answer = null;

var _DP_LABELS = { yes: 'Yes, looks good', no: 'No, I\'d skip', maybe: 'Not sure yet' };
var _DP2_LABELS = { yes: 'Yes, I would', no: 'No, I wouldn\'t', maybe: 'Still not sure' };

var _DP_COMPARISON = {
  'yes-yes':     'You stayed confident throughout. You saw the big picture and the details confirmed it.',
  'no-no':       'Your skepticism held after digging deeper. Disciplined — the numbers backed your instinct.',
  'maybe-yes':   'The details convinced you. That\'s analysis working exactly as it should.',
  'maybe-no':    'The data made you more cautious. Good — that\'s what the breakdown is for.',
  'yes-no':      'You changed your mind after seeing the numbers. That\'s exactly how good investors think — data over gut.',
  'no-yes':      'The data changed your view from skeptical to interested. Worth asking yourself what turned you around.',
  'yes-maybe':   'Still uncertain after seeing the details? Healthy skepticism. Keep it on your watchlist.',
  'no-maybe':    'The details softened your initial No — worth keeping an eye on.',
  'maybe-maybe': 'Still undecided. Sometimes that\'s the right call — more time or data might help.'
};

function showDecisionPoint1(name) {
  _d1Answer = null;
  _d2Answer = null;
  var el = document.getElementById('decision-point-1');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML =
    '<div class="dp-card" id="dp1-card">' +
      '<div class="dp-eyebrow">First impression</div>' +
      '<div class="dp-question">Based on what you\'ve read, would you invest in ' + escHtml(name) + '?</div>' +
      '<div class="dp-btns">' +
        '<button class="dp-btn" onclick="answerDecisionPoint1(\'yes\')">Yes, looks good</button>' +
        '<button class="dp-btn" onclick="answerDecisionPoint1(\'no\')">No, I\'d skip</button>' +
        '<button class="dp-btn" onclick="answerDecisionPoint1(\'maybe\')">Not sure yet</button>' +
      '</div>' +
    '</div>';
}

function answerDecisionPoint1(choice) {
  _d1Answer = choice;
  var el = document.getElementById('decision-point-1');
  if (!el) return;
  el.innerHTML =
    '<div class="dp-answered">' +
      '<span class="dp-answered-label">First impression</span>' +
      '<span class="dp-answered-choice">' + escHtml(_DP_LABELS[choice]) + '</span>' +
      '<span class="dp-answered-hint">Scroll down to see the full analysis — then revisit your answer.</span>' +
    '</div>';
}

function showDecisionPoint2(name) {
  var el = document.getElementById('decision-point-2');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML =
    '<div class="dp-card dp2-card" id="dp2-card">' +
      '<div class="dp-eyebrow">After reading the details</div>' +
      '<div class="dp-question">Would you invest in ' + escHtml(name) + '?</div>' +
      '<div class="dp-btns">' +
        '<button class="dp-btn" onclick="answerDecisionPoint2(\'yes\')">Yes, I would</button>' +
        '<button class="dp-btn" onclick="answerDecisionPoint2(\'no\')">No, I wouldn\'t</button>' +
        '<button class="dp-btn" onclick="answerDecisionPoint2(\'maybe\')">Still not sure</button>' +
      '</div>' +
    '</div>';
}

function answerDecisionPoint2(choice) {
  _d2Answer = choice;
  var el = document.getElementById('decision-point-2');
  if (!el) return;
  var comparisonHtml = '';
  if (_d1Answer) {
    var key = _d1Answer + '-' + choice;
    var msg = _DP_COMPARISON[key] || '';
    var changed = _d1Answer !== choice;
    comparisonHtml =
      '<div class="dp-comparison ' + (changed ? 'dp-changed' : 'dp-consistent') + '">' +
        '<div class="dp-comparison-label">' + (changed ? 'Your view changed' : 'Consistent view') + '</div>' +
        '<div class="dp-comparison-track">' +
          '<span class="dp-track-item">' + escHtml(_DP_LABELS[_d1Answer]) + '</span>' +
          '<span class="dp-track-arrow">→</span>' +
          '<span class="dp-track-item dp-track-final">' + escHtml(_DP2_LABELS[choice]) + '</span>' +
        '</div>' +
        '<div class="dp-comparison-msg">' + escHtml(msg) + '</div>' +
      '</div>';
  }
  el.innerHTML =
    '<div class="dp-answered">' +
      '<span class="dp-answered-label">After the details</span>' +
      '<span class="dp-answered-choice">' + escHtml(_DP2_LABELS[choice]) + '</span>' +
    '</div>' +
    comparisonHtml;
}

function answerFactorQ(btn, score) {
  var container = btn.closest('.factor-micro-q');
  if (!container || container.classList.contains('fq-done')) return;
  container.classList.add('fq-done');
  var correctText = score >= 7 ? 'Stronger' : score <= 3 ? 'Weaker' : 'Neutral';
  var chosen = btn.textContent.trim();
  var isCorrect = chosen === correctText;
  container.querySelectorAll('.fq-btn').forEach(function(b) {
    b.disabled = true;
    if (b.textContent.trim() === correctText) b.classList.add('fq-correct');
    else if (b === btn && !isCorrect) b.classList.add('fq-wrong');
  });
  var fb = document.createElement('div');
  fb.className = 'fq-feedback ' + (isCorrect ? 'fq-fb-correct' : 'fq-fb-wrong');
  fb.textContent = isCorrect
    ? 'Correct — StockIQ scores this ' + score + '/10, a ' + (score >= 7 ? 'positive' : score >= 4 ? 'mixed' : 'negative') + ' signal.'
    : 'StockIQ scores this ' + score + '/10 — a ' + correctText.toLowerCase() + ' signal. ' + (score >= 7 ? 'This factor is working in the stock\'s favor.' : score <= 3 ? 'This is dragging the score down.' : 'This factor is neither helping nor hurting much.');
  container.appendChild(fb);
}
// ── END ACTIVE LEARNING ────────────────────────────────────────────────────

function toggleScoreWhy(btn) {
  var item = btn.closest('.score-item');
  if (!item) return;
  var panel = item.querySelector('.score-why');
  if (!panel) return;
  var isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  btn.classList.toggle('open', !isOpen);
  btn.textContent = isOpen ? 'Why?' : 'Close';
}

function scoreBar(label, score, tooltip) {
  let color = score >= 7 ? "#128257" : score >= 4 ? "#e07510" : "#dc2626";
  let verdictClass = score >= 7 ? "good" : score >= 4 ? "mid" : "bad";
  let verdictText = score >= 7 ? "Strong" : score >= 4 ? "Average" : "Weak";
  let width = (score / 10) * 100;
  let deepExp = _WHY_EXPLANATIONS[label] || '';
  let panelContent = deepExp || (tooltip ? tooltip.what : '');
  let userTier = getUserLevel().tier;
  let showWhy = userTier >= 2;
  var microQHtml = showWhy ? "<div class='factor-micro-q'>" +
    "<div class='factor-micro-prompt'>Stronger or weaker signal for this stock?</div>" +
    "<div class='factor-micro-btns'>" +
      "<button class='fq-btn' onclick='answerFactorQ(this," + score + ")'>Stronger</button>" +
      "<button class='fq-btn' onclick='answerFactorQ(this," + score + ")'>Neutral</button>" +
      "<button class='fq-btn' onclick='answerFactorQ(this," + score + ")'>Weaker</button>" +
    "</div>" +
  "</div>" : "";
  let whatHtml = (showWhy && panelContent) ? "<div class='score-why'>" + panelContent + microQHtml + "</div>" : "";
  let verdictHtml = tooltip ? "<span class='score-verdict " + verdictClass + "'>" + verdictText + " — " + tooltip.verdict + "</span>" : "";
  let whyBtn = showWhy ? "<button class='score-why-btn' onclick='toggleScoreWhy(this)'>Why?</button>" : "";
  let valueHtml = (tooltip && tooltip.value && tooltip.value !== '—') ? "<span class='score-item-value'>" + tooltip.value + "</span>" : "";
  let dataAttr = "data-factor='" + label.replace(/'/g, '') + "'";
  return "<div class='score-item' " + dataAttr + ">" +
    "<div class='score-item-header'>" +
      "<div style='display:flex;align-items:center;gap:8px;min-width:0;'>" +
        "<span class='score-item-name'>" + label + "</span>" +
        valueHtml +
      "</div>" +
      "<div style='display:flex;align-items:center;gap:8px;flex-shrink:0;'>" +
        whyBtn +
        "<span class='score-item-num' style='color:" + color + ";'>" + score + "/10</span>" +
      "</div>" +
    "</div>" +
    "<div class='score-bar-wrap'>" +
      "<div class='score-bar-fill' style='width:" + width + "%;background:" + color + ";'></div>" +
    "</div>" +
    verdictHtml + whatHtml +
  "</div>";
}

function updateTechnicalFactors(prices, price) {
  if (!prices || prices.length < 15) return;
  let rsi = prices.length > 14 ? calculateRSI(prices, 14) : null;
  let ma50 = prices.length >= 50 ? calculateMA(prices, 50) : null;
  let ma20 = prices.length >= 20 ? calculateMA(prices, 20) : null;

  let rsiWhat = rsi !== null
    ? "RSI " + rsi + "/100. " + (rsi < 30 ? "Oversold zone — stock has fallen a lot and could bounce." : rsi > 70 ? "Overbought zone — stock has risen a lot and could correct." : "Neutral zone — no extreme signal.")
    : "Not enough data.";
  let rsiVerdict = rsi !== null && rsi < 30 ? "Oversold — possible bounce" : rsi !== null && rsi > 70 ? "Overbought — possible correction" : "Neutral zone";
  let rsiScore = rsi !== null ? (rsi < 30 ? 7 : rsi > 70 ? 5 : 6) : 5;

  let maWhat = ma50 !== null
    ? "50-day avg $" + ma50.toFixed(2) + ", current $" + price.toFixed(2) + ". " + (price > ma50 ? "Above the average — uptrend." : "Below the average — downtrend. Caution.")
    : ma20 !== null
    ? "20-day avg $" + ma20.toFixed(2) + ", current $" + price.toFixed(2) + ". " + (price > ma20 ? "Above the average — uptrend." : "Below the average — downtrend.")
    : "Not enough data.";
  let ma = ma50 || ma20;
  let maVerdict = ma !== null && price > ma ? "Uptrend — above average" : "Downtrend — below average";
  let maScore = ma !== null ? (price > ma ? 7 : 3) : 4;

  let explanation = document.getElementById("explanation");
  if (!explanation) return;

  let rsiEl = explanation.querySelector("[data-factor='RSI']");
  if (rsiEl) rsiEl.outerHTML = scoreBar("RSI", rsiScore, { what: rsiWhat, verdict: rsiVerdict });

  let maEl = explanation.querySelector("[data-factor='Moving Average']");
  if (maEl) maEl.outerHTML = scoreBar("Moving Average", maScore, { what: maWhat, verdict: maVerdict });

  // Re-sort all factor cards by score (best → worst) after updating RSI/MA in DOM
  let items = Array.from(explanation.querySelectorAll(".score-item"));
  if (items.length > 1) {
    let parent = items[0].parentNode;
    items.sort(function(a, b) {
      let aScore = parseFloat((a.querySelector(".score-item-num") || {}).textContent) || 0;
      let bScore = parseFloat((b.querySelector(".score-item-num") || {}).textContent) || 0;
      return bScore - aScore;
    });
    items.forEach(function(el) { parent.appendChild(el); });
  }
}

function loadChart(prices, dates, volumes, ohlc, prevClose, dayHigh, dayLow, week52High) {
  if (!prices || prices.length === 0) {
    document.getElementById("chart-section").style.display = "none";
    return;
  }
  document.getElementById("chart-section").style.display = "block";
  _chartMode = 'line'; // reset to line on new stock
  document.querySelectorAll('.chart-type-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === 'line'); });

  allChartPrices   = prices;
  allChartDates    = dates;
  allChartVolumes  = volumes || [];
  allChartOHLC     = ohlc || [];
  chartPrevClose   = prevClose || 0;
  chartDayHigh     = dayHigh || 0;
  chartDayLow      = dayLow || 0;
  chartWeek52High  = week52High || 0;

  let statsEl = document.getElementById("chart-stats");
  if (statsEl) {
    statsEl.innerHTML =
      "<div class='chart-stat'><div class='chart-stat-label'>Prev Close</div><div class='chart-stat-value'>" + (prevClose > 0 ? "$" + prevClose.toFixed(2) : "—") + "</div></div>" +
      "<div class='chart-stat'><div class='chart-stat-label'>Day's Range</div><div class='chart-stat-value'>" + (dayLow > 0 && dayHigh > 0 ? "$" + dayLow.toFixed(2) + " – $" + dayHigh.toFixed(2) : "—") + "</div></div>" +
      "<div class='chart-stat'><div class='chart-stat-label'>52-Wk High</div><div class='chart-stat-value'>" + (week52High > 0 ? "$" + week52High.toFixed(2) : "—") + "</div></div>";
  }

  setChartRange('1M');
}

function setChartRange(range) {
  document.querySelectorAll('.range-btn').forEach(function(b) { b.classList.remove('active'); });
  let btn = document.querySelector('.range-btn[data-range="' + range + '"]');
  if (btn) btn.classList.add('active');
  // Trading-day counts (≈ 5/wk): 1W=5, 1M=21, 3M=63, 6M=126, 1Y=252
  let countMap = { '1W': 5, '1M': 21, '3M': 63, '6M': 126, '1Y': 252 };
  let count = countMap[range] || allChartPrices.length;
  let prices  = allChartPrices.slice(-count);
  let dates   = allChartDates.slice(-count);
  let volumes = allChartVolumes.slice(-count);
  let ohlc    = allChartOHLC.slice(-count);
  _chartOHLCSlice = ohlc;
  renderPriceChart(prices, dates, volumes, ohlc);
  renderChartInsight(prices, range);
}

function toggleChartMode(mode) {
  _chartMode = mode;
  document.querySelectorAll('.chart-type-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === mode); });
  let active = document.querySelector('.range-btn.active');
  setChartRange(active ? active.dataset.range : '1M');
}

function renderChartInsight(prices, range) {
  let el = document.getElementById('chart-insight');
  if (!el || prices.length < 2) { if (el) el.innerHTML = ''; return; }

  let first = prices[0];
  let last  = prices[prices.length - 1];
  let changePct = ((last - first) / first) * 100;
  let rangeLabel = range === '1W' ? 'this week' : range === '1M' ? 'this month' : range === '3M' ? 'over 3 months' : range === '6M' ? 'over 6 months' : range === '1Y' ? 'over the past year' : 'all time';
  let isUp = changePct >= 0;

  // Trend
  let trendColor = isUp ? 'var(--win)' : 'var(--loss)';
  let trendArrow = isUp ? '▲' : '▼';
  let trendText  = trendArrow + ' ' + Math.abs(changePct).toFixed(1) + '% ' + rangeLabel +
    (isUp ? ' — price has been climbing' : ' — price has been falling');

  // Position vs 52-week high
  let vsHigh = '';
  if (chartWeek52High > 0) {
    let pctBelow = ((chartWeek52High - last) / chartWeek52High) * 100;
    if (pctBelow < 3) {
      vsHigh = 'Trading near its 52-week high — the stock is at a strong level';
    } else if (pctBelow < 15) {
      vsHigh = Math.round(pctBelow) + '% below its 52-week high — still in solid range';
    } else {
      vsHigh = Math.round(pctBelow) + '% below its 52-week high — well off peak levels';
    }
  }

  // Volatility — average daily swing
  let swings = [];
  for (let i = 1; i < prices.length; i++) {
    swings.push(Math.abs((prices[i] - prices[i-1]) / prices[i-1]) * 100);
  }
  let avgSwing = swings.reduce(function(a, b) { return a + b; }, 0) / swings.length;
  let volText = avgSwing < 1
    ? 'Low volatility — the price has been steady and predictable'
    : avgSwing < 2.5
    ? 'Moderate volatility — some daily swings, normal for stocks'
    : 'High volatility — large daily moves, this stock can swing hard';

  let items = [
    '<div class="chart-insight-item" style="color:' + trendColor + ';">' + escHtml(trendText) + '</div>',
    vsHigh ? '<div class="chart-insight-item">' + escHtml(vsHigh) + '</div>' : '',
    '<div class="chart-insight-item">' + escHtml(volText) + '</div>'
  ].filter(Boolean).join('');

  el.innerHTML = '<div class="chart-insight-box">' + items + '</div>';
}

function renderPriceChart(prices, dates, volumes, ohlc) {
  if (_chartMode === 'candle' && ohlc && ohlc.length > 0) {
    renderCandlestickChart(ohlc, dates, volumes);
    return;
  }
  if (chartInstance) chartInstance.destroy();

  var activeRange = (document.querySelector('.range-btn.active') || {}).dataset && document.querySelector('.range-btn.active').dataset.range || '1M';
  var labels = dates.map(function(d) { return formatChartDate(d, activeRange); });
  var theme = getChartTheme();

  var isUp = prices.length > 0 && prices[prices.length - 1] >= prices[0];
  var lineColor = isUp ? '#128257' : '#dc2626';
  var maxVol = volumes.length > 0 ? Math.max.apply(null, volumes) : 1;

  var canvas = document.getElementById('priceChart');
  var ctx = canvas.getContext('2d');
  var gradientFill = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 240);
  gradientFill.addColorStop(0, isUp ? 'rgba(18,130,87,0.18)' : 'rgba(220,38,38,0.18)');
  gradientFill.addColorStop(1, isUp ? 'rgba(18,130,87,0.00)' : 'rgba(220,38,38,0.00)');

  var datasets = [
    {
      type: 'line',
      label: 'Price',
      data: prices,
      borderColor: lineColor,
      backgroundColor: gradientFill,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: lineColor,
      tension: 0.2,
      fill: true,
      yAxisID: 'yPrice',
      order: 1
    },
    {
      type: 'bar',
      label: 'Volume',
      data: volumes,
      backgroundColor: theme.volume,
      borderWidth: 0,
      yAxisID: 'yVolume',
      order: 3
    }
  ];

  if (chartPrevClose > 0) {
    datasets.push({
      type: 'line',
      label: 'Prev Close',
      data: prices.map(function() { return chartPrevClose; }),
      borderColor: 'rgba(224,117,16,0.55)',
      borderWidth: 1,
      borderDash: [5, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      yAxisID: 'yPrice',
      order: 0
    });
  }

  chartInstance = new Chart(ctx, {
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          titleColor: theme.tooltipTitle,
          bodyColor: theme.tooltipBody,
          padding: 12,
          callbacks: {
            title: function(items) { return items[0].label; },
            label: function(ctx) {
              if (ctx.dataset.label === 'Price')  return '  Price: $' + ctx.parsed.y.toFixed(2);
              if (ctx.dataset.label === 'Volume') return '  Vol: ' + (ctx.parsed.y >= 1e6 ? (ctx.parsed.y / 1e6).toFixed(1) + 'M' : (ctx.parsed.y / 1e3).toFixed(0) + 'K');
              return null;
            }
          }
        }
      },
      scales: {
        yPrice: {
          type: 'linear',
          position: 'left',
          ticks: { color: theme.tick, callback: function(v) { return '$' + v.toLocaleString(); } },
          grid: { color: theme.grid }
        },
        yVolume: { type: 'linear', position: 'right', display: false, max: maxVol * 6 },
        x: {
          ticks: { color: theme.tick, maxTicksLimit: activeRange === '1Y' || activeRange === 'MAX' ? 10 : 8 },
          grid: { display: false }
        }
      }
    }
  });
}

function renderCandlestickChart(ohlcData, dates, volumes) {
  if (chartInstance) chartInstance.destroy();
  _chartOHLCSlice = ohlcData;

  var activeRange = (document.querySelector('.range-btn.active') || {}).dataset && document.querySelector('.range-btn.active').dataset.range || '1M';
  var theme = getChartTheme();
  var labels = dates.map(function(d) { return formatChartDate(d, activeRange); });

  var bodyData = ohlcData.map(function(d) {
    return [Math.min(d.o, d.c), Math.max(d.o, d.c)];
  });
  var colors = ohlcData.map(function(d) {
    return d.c >= d.o ? 'rgba(18,130,87,0.9)' : 'rgba(220,38,38,0.9)';
  });
  var maxVol = volumes.length > 0 ? Math.max.apply(null, volumes) : 1;

  // Clamp y-axis to actual price range so candle bodies are visible
  var allLows  = ohlcData.map(function(d) { return d.l; });
  var allHighs = ohlcData.map(function(d) { return d.h; });
  var priceMin = Math.min.apply(null, allLows);
  var priceMax = Math.max.apply(null, allHighs);
  var pricePad = (priceMax - priceMin) * 0.08;
  var yMin = priceMin - pricePad;
  var yMax = priceMax + pricePad;

  var wickPlugin = {
    id: 'wickPlugin',
    afterDatasetsDraw: function(chart) {
      var ctx = chart.ctx;
      var meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;
      ctx.save();
      meta.data.forEach(function(bar, i) {
        var d = ohlcData[i];
        if (!d) return;
        var x = bar.x;
        var yHigh = chart.scales.yPrice.getPixelForValue(d.h);
        var yLow  = chart.scales.yPrice.getPixelForValue(d.l);
        var yBodyTop    = Math.min(bar.y, bar.base);
        var yBodyBottom = Math.max(bar.y, bar.base);
        ctx.strokeStyle = d.c >= d.o ? '#128257' : '#dc2626';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, yHigh); ctx.lineTo(x, yBodyTop); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, yBodyBottom); ctx.lineTo(x, yLow); ctx.stroke();
      });
      ctx.restore();
    }
  };

  chartInstance = new Chart(document.getElementById("priceChart").getContext("2d"), {
    plugins: [wickPlugin],
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar', label: 'OHLC',
          data: bodyData,
          backgroundColor: colors, borderColor: colors,
          borderWidth: 0, borderSkipped: false,
          yAxisID: 'yPrice', barPercentage: 0.6, categoryPercentage: 0.8, order: 1
        },
        {
          type: 'bar', label: 'Volume',
          data: volumes,
          backgroundColor: theme.volume,
          borderWidth: 0, yAxisID: 'yVolume', order: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltipBg, borderColor: theme.tooltipBorder, borderWidth: 1,
          titleColor: theme.tooltipTitle, bodyColor: theme.tooltipBody, padding: 12,
          callbacks: {
            title: function(items) { return items[0].label; },
            label: function(ctx) {
              if (ctx.dataset.label === 'Volume') {
                var v = ctx.parsed.y;
                return '  Vol: ' + (v >= 1e6 ? (v/1e6).toFixed(1)+'M' : (v/1e3).toFixed(0)+'K');
              }
              var d = ohlcData[ctx.dataIndex];
              if (!d) return null;
              return ['  O: $'+d.o.toFixed(2),'  H: $'+d.h.toFixed(2),'  L: $'+d.l.toFixed(2),'  C: $'+d.c.toFixed(2)];
            }
          }
        }
      },
      scales: {
        yPrice: {
          type: 'linear', position: 'left',
          min: yMin, max: yMax,
          ticks: { color: theme.tick, callback: function(v) { return '$' + v.toLocaleString(); } },
          grid: { color: theme.grid }
        },
        yVolume: { type: 'linear', position: 'right', display: false, max: maxVol * 6 },
        x: { ticks: { color: theme.tick, maxTicksLimit: activeRange === '1Y' || activeRange === 'MAX' ? 10 : 8 }, grid: { display: false } }
      }
    }
  });
}

function getAIExplanation(ticker, companyName, totalScore, changePct, pe, margin, growth, beta, rsi, ma50, price, topHeadline, roe, currentRatio, interestCoverage) {
  let aiBox = document.getElementById("ai-explanation");
  let aiText = document.getElementById("ai-text");
  if (!aiBox || !aiText) return;
  aiBox.style.display = "block";
  aiText.textContent = "Analyzing " + companyName + "...";

  let profileContext = userProfile ? "The reader is a " + userProfile.type + " investor with a " + userProfile.horizon + " time horizon and a goal to " + userProfile.goal + ". Tailor your explanation to their level. " : "";

  let prompt = "You are StockIQ. Explain this stock to someone who has never invested before. Write exactly 3 short sentences — no more. Sentence 1: what this company does and how healthy it looks overall, based on the score. Sentence 2: one specific thing that stands out in the numbers, explained in plain everyday words — if a number comes up, say what it means in simple terms. Sentence 3: one thing worth keeping an eye on. Rules: no financial jargon at all. If you must use a term like P/E or beta, explain it in the same breath (e.g. 'P/E ratio — basically how expensive the stock is'). Write like you're texting a curious friend, not writing a report. Never say buy, sell, invest, or recommend. " +
    profileContext +
    "Data — Company: " + companyName + " (" + ticker + "). Score: " + totalScore + "/100. Today: " + (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "%. Price: $" + price.toFixed(2) + ". " +
    (pe > 0 ? "P/E: " + pe.toFixed(1) + ". " : "") +
    (margin !== 0 ? "Profit margin: " + margin.toFixed(1) + "%. " : "") +
    (growth !== 0 ? "Revenue growth: " + growth.toFixed(1) + "%. " : "") +
    (beta > 0 ? "Beta: " + beta.toFixed(2) + ". " : "") +
    (roe !== 0 ? "ROE: " + roe.toFixed(1) + "%. " : "") +
    (currentRatio !== 0 ? "Current ratio: " + currentRatio.toFixed(2) + ". " : "") +
    (interestCoverage !== 0 ? "Interest coverage: " + interestCoverage.toFixed(1) + "x. " : "") +
    (rsi !== null ? "RSI: " + rsi + ". " : "") +
    (ma50 !== null ? "50-day MA: $" + ma50.toFixed(2) + ". " : "") +
    "Latest headline: \"" + topHeadline + "\". Overall signal: " + (totalScore >= 65 ? "Strong" : totalScore >= 50 ? "Watch" : "Risky") + ".";

  anthropicFetch({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 220,
      messages: [{ role: "user", content: prompt }]
    })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.content && data.content[0] && data.content[0].text) {
      aiText.innerHTML = parseMarkdown(data.content[0].text) +
        '<p class="ai-chat-nudge" onclick="document.getElementById(\'ai-chat\').scrollIntoView({behavior:\'smooth\'})">Have a question about this? Ask StockIQ below ↓</p>';
      let chatEl = document.getElementById('ai-chat');
      if (chatEl) chatEl.style.display = 'block';
    } else {
      aiText.textContent = "Analysis unavailable right now.";
    }
  })
  .catch(function() { aiText.textContent = "Analysis unavailable right now."; });
}

function getSectorContext(industry, pe, margin, growth, beta) {
  let sector = null;
  let keys = Object.keys(sectorAverages);
  for (let i = 0; i < keys.length; i++) {
    if (industry.toLowerCase().includes(keys[i].toLowerCase()) ||
        keys[i].toLowerCase().includes(industry.toLowerCase())) {
      sector = keys[i];
      break;
    }
  }
  if (!sector) return "";
  let avg = sectorAverages[sector];
  let rows = "";

  if (pe > 0 && avg.pe) {
    let diff = (((pe - avg.pe) / avg.pe) * 100).toFixed(0);
    let color = diff > 20 ? "#dc2626" : diff > 0 ? "#e07510" : "#128257";
    rows += "<div class='sector-row'><span class='sector-label'>P/E Ratio</span><span class='sector-val'>" + pe.toFixed(1) + "</span><span class='sector-vs'>vs avg " + avg.pe + "</span><span class='sector-verdict' style='color:" + color + ";'>" + Math.abs(diff) + "% " + (diff > 0 ? "more expensive" : "cheaper") + " than peers</span></div>";
  }
  if (margin !== 0 && avg.margin) {
    let diff = (margin - avg.margin).toFixed(1);
    let color = diff >= 0 ? "#128257" : "#dc2626";
    rows += "<div class='sector-row'><span class='sector-label'>Profit Margin</span><span class='sector-val'>" + margin.toFixed(1) + "%</span><span class='sector-vs'>vs avg " + avg.margin + "%</span><span class='sector-verdict' style='color:" + color + ";'>" + Math.abs(diff) + "% " + (diff >= 0 ? "above" : "below") + " average</span></div>";
  }
  if (growth !== 0 && avg.growth) {
    let diff = (growth - avg.growth).toFixed(1);
    let color = diff >= 0 ? "#128257" : "#dc2626";
    rows += "<div class='sector-row'><span class='sector-label'>Revenue Growth</span><span class='sector-val'>" + growth.toFixed(1) + "%</span><span class='sector-vs'>vs avg " + avg.growth + "%</span><span class='sector-verdict' style='color:" + color + ";'>Growing " + Math.abs(diff) + "% " + (diff >= 0 ? "faster than" : "slower than") + " peers</span></div>";
  }
  if (beta > 0 && avg.beta) {
    let diff = (beta - avg.beta).toFixed(2);
    let color = diff <= 0 ? "#128257" : "#e07510";
    rows += "<div class='sector-row'><span class='sector-label'>Risk (Beta)</span><span class='sector-val'>" + beta.toFixed(2) + "</span><span class='sector-vs'>vs avg " + avg.beta + "</span><span class='sector-verdict' style='color:" + color + ";'>" + Math.abs(diff) + " " + (diff <= 0 ? "less volatile" : "more volatile") + " than peers</span></div>";
  }
  if (!rows) return "";
  return "<br><details class='sector-details'><summary class='sector-summary'>Compare to " + sector + " sector ▾</summary><div class='sector-rows'>" + rows + "</div></details>";
}

function getRiskProfileWarning(beta, totalScore) {
  if (!userProfile) return "";

  // Classify the stock itself
  let stockLabel, stockColor;
  if (totalScore >= 70 && beta <= 1.2) {
    stockLabel = "Defensive Growth"; stockColor = "#128257";
  } else if (totalScore >= 65) {
    stockLabel = "Aggressive Growth"; stockColor = "#0ea5e9";
  } else if (totalScore >= 50) {
    stockLabel = "Moderate"; stockColor = "#e07510";
  } else if (totalScore >= 35) {
    stockLabel = "Speculative"; stockColor = "#c4430f";
  } else {
    stockLabel = "High Risk"; stockColor = "#dc2626";
  }

  // How it fits the user's profile
  let warning = "", isAlert = false;
  if (userProfile.type === "Conservative") {
    if (totalScore >= 65 && beta <= 1.0) {
      warning = "Good fit — strong fundamentals and low volatility match your Conservative style.";
    } else if (totalScore >= 50 && beta <= 1.2) {
      warning = "Acceptable for your Conservative profile — but monitor the volatility closely.";
    } else {
      warning = "Outside your Conservative comfort zone — this stock carries more risk than recommended.";
      isAlert = true;
    }
  } else if (userProfile.type === "Aggressive") {
    if (totalScore >= 70) {
      warning = "Strong pick for your Aggressive profile — solid signals across the board.";
    } else if (totalScore >= 50) {
      warning = "Acceptable for your Aggressive profile — mixed signals, understand the risks first.";
    } else {
      warning = "Weak signals even for an Aggressive investor — dig into why before going further.";
      isAlert = true;
    }
  } else { // Balanced
    if (totalScore >= 65 && beta <= 1.5) {
      warning = "Good fit for your Balanced profile — solid score with manageable risk.";
    } else if (totalScore >= 50) {
      warning = "Within range for your Balanced profile — moderate risk, keep position sizing in check.";
    } else if (totalScore >= 35) {
      warning = "Below your Balanced comfort zone — higher risk than typical for your profile.";
      isAlert = true;
    } else {
      warning = "Well outside your Balanced range — very weak signals and elevated risk.";
      isAlert = true;
    }
  }

  let cssClass = isAlert ? "risk-warning" : "risk-match";
  return "<div class='" + cssClass + "'>" +
    "<div class='risk-profile-header'>" +
      "<span class='risk-profile-tag'>" + _profileIcon(userProfile.type) + " " + userProfile.type.toUpperCase() + "</span>" +
      "<span class='risk-stock-tag' style='color:" + stockColor + ";'>" + stockLabel + "</span>" +
    "</div>" +
    "<div class='risk-warning-text'>" + warning + "</div>" +
    "</div>";
}

function toggleDetails() {
  let section = document.getElementById("deep-dive-section");
  let explanation = document.getElementById("explanation");
  let btn = document.getElementById("show-details-btn");
  if (!section || !btn) return;
  let isOpen = section.style.display !== "none";
  if (!isOpen) {
    section.style.display = "block";
    if (explanation) explanation.style.display = "block";
    btn.innerHTML = "Full Analysis <span style='float:right;'>▴</span>";
  } else {
    section.style.display = "none";
    btn.innerHTML = "Full Analysis <span style='float:right;'>▾</span>";
  }
}

function selectCurrency(currency, el) {
  // Highlight selected button
  document.querySelectorAll('.ob-currency-btn').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
  quizAnswers.step1 = currency;
  // Apply immediately so budget labels update
  setCurrency(currency);
  setTimeout(function() {
    document.getElementById('step-1').style.display = 'none';
    document.getElementById('step-2').style.display = 'block';
    document.getElementById('dot-2').classList.add('active');
    _updateBudgetLabels();
  }, 350);
}

function _updateBudgetLabels() {
  // Update currency symbol shown next to input
  var prefix = document.getElementById('quiz-budget-prefix');
  if (prefix) prefix.textContent = _currency === 'MXN' ? 'MX$' : '$';
  var input = document.getElementById('quiz-budget-input');
  if (input) input.value = '';
  var btn = document.getElementById('quiz-budget-btn');
  if (btn) btn.disabled = true;
  var hint = document.getElementById('quiz-budget-hint');
  if (hint) { hint.textContent = 'Minimum ' + (_currency === 'MXN' ? 'MX$1,000' : '$100'); hint.style.color = 'var(--text-muted)'; }
}

function quizBudgetInput(input) {
  var val = parseFloat(input.value);
  var minAmt = _currency === 'MXN' ? 1000 : 100;
  var btn = document.getElementById('quiz-budget-btn');
  var hint = document.getElementById('quiz-budget-hint');
  if (!val || val <= 0) {
    if (btn) btn.disabled = true;
    if (hint) { hint.textContent = 'Minimum ' + (_currency === 'MXN' ? 'MX$1,000' : '$100'); hint.style.color = 'var(--text-muted)'; }
    return;
  }
  if (val < minAmt) {
    if (btn) btn.disabled = true;
    if (hint) { hint.textContent = 'Minimum is ' + (_currency === 'MXN' ? 'MX$1,000' : '$100'); hint.style.color = '#ef4444'; }
    return;
  }
  if (btn) btn.disabled = false;
  var formatted = (_currency === 'MXN' ? 'MX$' : '$') +
    val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (hint) { hint.textContent = formatted; hint.style.color = 'var(--accent-green)'; }
}

function submitBudget() {
  var input = document.getElementById('quiz-budget-input');
  var val = parseFloat(input ? input.value : 0);
  if (!val || val <= 0) return;
  quizAnswers.step5 = val;
  document.getElementById('step-5').style.display = 'none';
  showQuizResult();
}

function openRiskQuiz() {
  // Reset quiz state
  quizAnswers = {};
  ['step-1','step-2','step-3','step-4','step-5'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.style.display = id === 'step-1' ? 'block' : 'none'; }
  });
  var resultEl = document.getElementById('step-result');
  if (resultEl) resultEl.style.display = 'none';
  ['dot-1','dot-2','dot-3','dot-4','dot-5'].forEach(function(id, i) {
    var el = document.getElementById(id);
    if (el) { el.classList[i === 0 ? 'add' : 'remove']('active'); }
  });
  document.querySelectorAll('.ob-currency-btn').forEach(function(b) { b.classList.remove('active'); });
  var preselect = _currency === 'MXN' ? document.getElementById('quiz-mxn-btn') : document.getElementById('quiz-usd-btn');
  if (preselect) preselect.classList.add('active');
  _updateBudgetLabels();
  document.getElementById('quiz-overlay').style.display = 'flex';
}

function selectOption(step, value, el) {
  let options = el.parentElement.querySelectorAll(".quiz-option");
  options.forEach(function(o) { o.classList.remove("selected"); });
  el.classList.add("selected");
  quizAnswers["step" + step] = value;
  setTimeout(function() {
    if (step === 2) {
      document.getElementById("step-2").style.display = "none";
      document.getElementById("step-3").style.display = "block";
      document.getElementById("dot-3").classList.add("active");
    } else if (step === 3) {
      document.getElementById("step-3").style.display = "none";
      document.getElementById("step-4").style.display = "block";
      document.getElementById("dot-4").classList.add("active");
    } else if (step === 4) {
      document.getElementById("step-4").style.display = "none";
      document.getElementById("step-5").style.display = "block";
      document.getElementById("dot-5").classList.add("active");
    } else {
      document.getElementById("step-5").style.display = "none";
      showQuizResult();
    }
  }, 400);
}

function showQuizResult() {
  let risk = quizAnswers.step3;
  let horizon = quizAnswers.step2;
  let goal = quizAnswers.step4;
  // step5 value is in user's currency — convert to USD for portfolio math
  let budgetRaw = quizAnswers.step5 || (_currency === 'MXN' ? 50000 : 2500);
  let budget = (_currency === 'MXN' && _fxRate > 1) ? budgetRaw / _fxRate : budgetRaw;
  let profile = {};
  if (risk === "low" || goal === "preserve") {
    profile = { type: "Conservative", desc: "You prefer stable, lower risk investments. StockIQ will warn you about high volatility stocks.", maxBeta: 1.0, minScore: 55 };
  } else if (risk === "high" && horizon === "long") {
    profile = { type: "Aggressive", desc: "You're comfortable with big swings for bigger rewards. StockIQ will highlight high growth opportunities.", maxBeta: 2.5, minScore: 40 };
  } else {
    profile = { type: "Balanced", desc: "You want a mix of growth and stability. StockIQ will help you find stocks with solid fundamentals.", maxBeta: 1.5, minScore: 50 };
  }
  profile.icon = _profileIcon(profile.type);
  profile.horizon = horizon;
  profile.goal = goal;
  profile.budget = budget;
  document.getElementById("quiz-icon").innerHTML = profile.icon;
  document.getElementById("quiz-result-title").textContent = profile.type + " Investor";
  document.getElementById("quiz-result-desc").textContent = profile.desc;
  var learnNote = document.getElementById('quiz-learn-note');
  if (learnNote) {
    if (goal === 'learn') {
      learnNote.textContent = "Since your goal is to learn, we've set up a Demo Portfolio and will guide you toward beginner-friendly features as you explore.";
      learnNote.style.display = 'block';
    } else {
      learnNote.style.display = 'none';
    }
  }
  document.getElementById("step-result").style.display = "block";
  userProfile = profile;
}

function _regenerateDemoPortfolio() {
  let all = getAllPortfolios();
  Object.keys(all).forEach(function(id) { if (all[id].isDemo) delete all[id]; });
  savePortfolios(all);
  let activeId = getActiveId();
  if (!all[activeId]) {
    let remaining = Object.keys(all);
    if (remaining.length > 0) localStorage.setItem('activePortfolioId', remaining[0]);
  }
  createDemoPortfolio(userProfile.type, userProfile.budget);
}

function finishQuiz() {
  let isRetake = !!localStorage.getItem('userProfile');
  localStorage.setItem("userProfile", JSON.stringify(userProfile));
  saveToFirestore({ userProfile: userProfile });
  // On retake, offer to regenerate the Recommended Portfolio
  if (isRetake) {
    let hasDemo = Object.values(getAllPortfolios()).some(function(p) { return p.isDemo; });
    if (hasDemo) {
      // Custom modal instead of confirm() which breaks on iOS
      let overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:24px;';
      let card = document.createElement('div');
      card.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px 24px;max-width:320px;width:100%;text-align:center;';
      let title = document.createElement('div');
      title.style.cssText = 'font-size:16px;font-weight:700;color:var(--text);margin-bottom:8px;';
      title.textContent = 'Update Recommended Portfolio?';
      let desc = document.createElement('div');
      desc.style.cssText = 'font-size:13px;color:var(--text-muted);margin-bottom:24px;';
      desc.textContent = 'Regenerate your Recommended Portfolio for your new ' + userProfile.type + ' profile?';
      let btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';
      let skipBtn = document.createElement('button');
      skipBtn.textContent = 'Keep existing';
      skipBtn.style.cssText = 'flex:1;background:var(--surface2);color:var(--text);border:1px solid var(--border);';
      let regenBtn = document.createElement('button');
      regenBtn.textContent = 'Regenerate';
      regenBtn.style.cssText = 'flex:1;';
      btnRow.appendChild(skipBtn);
      btnRow.appendChild(regenBtn);
      card.appendChild(title); card.appendChild(desc); card.appendChild(btnRow);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      skipBtn.addEventListener('click', function() { overlay.remove(); _finishQuizUI(); });
      regenBtn.addEventListener('click', function() { overlay.remove(); _regenerateDemoPortfolio(); _finishQuizUI(); });
      return;
    }
  } else {
    migrateToMultiPortfolio([], [], []);  // ensure structure exists first
    createDemoPortfolio(userProfile.type, userProfile.budget);
  }
  _finishQuizUI();
}

function _finishQuizUI() {
  document.getElementById("quiz-overlay").style.display = "none";
  updateRiskBadge();
  renderProfile();
  if (localStorage.getItem('tour-done')) return;
  let nameEl = document.getElementById("onboarding-profile-name");
  if (nameEl) nameEl.innerHTML = userProfile.icon + " " + userProfile.type;
  document.getElementById("onboarding-overlay").style.display = "flex";
  _obStep = 0;
  document.querySelectorAll('.onboarding-card').forEach(function(c, i) { c.classList.toggle('active', i === 0); });
  document.querySelectorAll('.ob-dot').forEach(function(d, i) { d.classList.toggle('active', i === 0); });
  var savedCur = localStorage.getItem('currency') || 'USD';
  var usdBtn = document.getElementById('ob-usd');
  var mxnBtn = document.getElementById('ob-mxn');
  if (usdBtn) usdBtn.classList.toggle('active', savedCur === 'USD');
  if (mxnBtn) mxnBtn.classList.toggle('active', savedCur === 'MXN');
  let prevBtn = document.getElementById('onboarding-prev');
  if (prevBtn) prevBtn.style.visibility = 'hidden';
  let nextBtn = document.getElementById('onboarding-next');
  if (nextBtn) { nextBtn.textContent = 'Next →'; nextBtn.onclick = function() { onboardingStep(1); }; }
}

let _obStep = 0;
const _obTotal = 3;

function obSetCurrency(code) {
  _currency = code;
  localStorage.setItem('currency', code);
  // Update button highlights
  document.getElementById('ob-usd').classList.toggle('active', code === 'USD');
  document.getElementById('ob-mxn').classList.toggle('active', code === 'MXN');
  // Apply rate — fetch if MXN, instant if USD
  if (code === 'MXN') {
    fetchFxRate(function() {
      var btn = document.getElementById('currency-toggle');
      if (btn) btn.textContent = 'MX$';
    });
  } else {
    _fxRate = 1; _fxSym = '$';
    var btn = document.getElementById('currency-toggle');
    if (btn) btn.textContent = 'USD';
  }
}

function onboardingStep(dir) {
  let cards = document.querySelectorAll('.onboarding-card');
  let dots  = document.querySelectorAll('.ob-dot');
  cards[_obStep].classList.remove('active');
  dots[_obStep].classList.remove('active');
  _obStep = Math.max(0, Math.min(_obTotal - 1, _obStep + dir));
  cards[_obStep].classList.add('active');
  dots[_obStep].classList.add('active');
  let prevBtn = document.getElementById('onboarding-prev');
  let nextBtn = document.getElementById('onboarding-next');
  if (prevBtn) prevBtn.style.visibility = _obStep === 0 ? 'hidden' : 'visible';
  if (nextBtn) nextBtn.textContent = _obStep === _obTotal - 1 ? "Browse on my own →" : 'Next →';
  if (_obStep === _obTotal - 1 && dir > 0) {
    // Auto-advance to finish on second tap of last step's Next
    nextBtn.onclick = function() { finishOnboarding(); nextBtn.onclick = function() { onboardingStep(1); }; };
  }
}

function finishOnboarding() {
  _obStep = 0;
  localStorage.setItem('tour-done', '1');
  document.getElementById("onboarding-overlay").style.display = "none";
  showTab('analyze');
  if (!localStorage.getItem('screener-auto-done')) {
    var prof = JSON.parse(localStorage.getItem('userProfile') || 'null');
    if (prof) {
      var q = prof.goal === 'learn' ? 'well-known companies with strong fundamentals'
            : prof.type === 'Aggressive' ? 'fast growing stocks'
            : prof.type === 'Conservative' ? 'safe dividend stocks'
            : 'well-known companies with strong fundamentals';
      localStorage.setItem('screener-auto-done', '1');
      var noteEl = document.getElementById('screener-profile-note');
      if (noteEl) { noteEl.textContent = 'Based on your profile, here are some stocks worth exploring first.'; noteEl.style.display = 'block'; }
      setTimeout(function() { setScreenerQueryChip(q); }, 500);
    }
  }
}

function updateRiskBadge() {
  if (!userProfile) return;
  let badge = document.getElementById("risk-badge");
  if (badge) badge.innerHTML = _profileIcon(userProfile.type) + " " + userProfile.type;
}

function quickAddToPortfolio() {
  if (!currentTicker) return;
  showTab('portfolio');
  openAddStockForm();
  document.getElementById('port-ticker').value = currentTicker;
  // Use the same price source as the portfolio renderer so cost basis = current price = 0 G/L on add
  getSharedPrices([currentTicker], 60000).then(function(m) {
    var price = (m[currentTicker] || {}).price;
    if (price) document.getElementById('port-price').value = price.toFixed(2);
  });
  document.getElementById('port-shares').focus();
}

// ── COMPARE ──────────────────────────────────────────────────
var _compareData = null;

function openCompare() {
  var sec = document.getElementById('compare-section');
  if (sec) { sec.style.display = 'block'; document.getElementById('compare-input').focus(); }
}
function closeCompare() {
  var sec = document.getElementById('compare-section');
  if (sec) sec.style.display = 'none';
  document.getElementById('compare-result').style.display = 'none';
  document.getElementById('compare-result').innerHTML = '';
  document.getElementById('compare-input').value = '';
  hideCompareDropdown();
}

var _compareTimer = null;
function onCompareInput() {
  var q = (document.getElementById('compare-input').value || '').trim();
  var dd = document.getElementById('compare-dropdown');
  clearTimeout(_compareTimer);
  if (q.length < 2) { if (dd) dd.style.display = 'none'; return; }
  _compareTimer = setTimeout(function() {
    fetch(finnhubUrl('/api/v1/search', { q: q }))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var items = (data.result || []).filter(function(i) { return i.type === 'Common Stock' || i.type === 'ETP'; }).slice(0, 6);
        if (!dd) return;
        if (items.length === 0) { dd.style.display = 'none'; return; }
        dd.innerHTML = items.map(function(item) {
          return '<div class="autocomplete-item" onmousedown="selectCompareAutocomplete(\'' + escHtml(item.symbol) + '\')">' +
            '<span class="autocomplete-ticker">' + escHtml(item.symbol) + '</span>' +
            '<span class="autocomplete-name">' + escHtml(item.description) + '</span>' +
          '</div>';
        }).join('');
        dd.style.display = 'block';
      }).catch(function() { if (dd) dd.style.display = 'none'; });
  }, 220);
}

function selectCompareAutocomplete(symbol) {
  var input = document.getElementById('compare-input');
  if (input) input.value = symbol;
  hideCompareDropdown();
  runCompare();
}

function hideCompareDropdown() {
  var dd = document.getElementById('compare-dropdown');
  if (dd) dd.style.display = 'none';
}

function runCompare() {
  var ticker2 = (document.getElementById('compare-input').value || '').trim().toUpperCase();
  if (!ticker2 || !currentTicker) return;
  if (ticker2 === currentTicker) { showToast("Pick a different stock to compare!"); return; }

  var loadEl = document.getElementById('compare-loading');
  var resultEl = document.getElementById('compare-result');
  loadEl.style.display = 'block';
  resultEl.style.display = 'none';

  var today = new Date();
  var from = new Date(today); from.setDate(today.getDate() - 30);
  function fetchStock(t) {
    return Promise.all([
      fetch(finnhubUrl('/api/v1/quote', {symbol: t})).then(function(r){return r.json();}),
      fetch(finnhubUrl('/api/v1/stock/metric', {symbol: t, metric: 'all'})).then(function(r){return r.json();}),
      fetch(finnhubUrl('/api/v1/stock/profile2', {symbol: t})).then(function(r){return r.json();}),
      fetch(finnhubUrl('/api/v1/stock/candle', {symbol: t, resolution: 'D', from: Math.floor(from.getTime()/1000), to: Math.floor(today.getTime()/1000)})).then(function(r){return r.json();}).catch(function(){return {};})
    ]).then(function(res) {
      var q = res[0], m = res[1].metric || {}, p = res[2], candles = res[3];
      var prices = (candles.c && Array.isArray(candles.c)) ? candles.c : [];
      var rsi = prices.length > 14 ? calculateRSI(prices, 14) : null;
      var ma50 = prices.length >= 50 ? calculateMA(prices, 50) : null;
      var ma20 = prices.length >= 20 ? calculateMA(prices, 20) : null;
      var ma = ma50 || ma20;
      var pe = m['peBasicExclExtraTTM'] || 0;
      var beta = m['beta'] || 0;
      var margin = m['netProfitMarginTTM'] || 0;
      var growth = m['revenueGrowthTTMYoy'] || 0;
      var roe = m['roeAnnual'] || m['roeTTM'] || 0;
      var week52High = m['52WeekHigh'] || 0;
      var score = calcQuickScore(pe, beta, margin, growth, q.dp || 0, q.c || 0, week52High);
      return {
        ticker: t, name: p.name || t, logo: p.logo || '',
        price: q.c || 0, changePct: q.dp || 0,
        pe: pe, beta: beta, margin: margin, growth: growth,
        roe: roe, rsi: rsi, ma: ma, price_vs_ma: ma ? (q.c > ma ? 'above' : 'below') : null,
        week52High: week52High, score: score
      };
    });
  }

  fetchStock(ticker2).then(function(d2) {
    loadEl.style.display = 'none';
    var m = window._currentMetrics || {};
    var ma = m.ma50 || m.ma20;
    var d1 = {
      ticker: currentTicker, name: currentName, score: currentScore,
      price: m.price || 0, changePct: m.changePct || 0,
      pe: m.pe || 0, beta: m.beta || 0, margin: m.margin || 0,
      growth: m.growth || 0, roe: m.roe || 0, rsi: m.rsi || null,
      ma: ma || null, price_vs_ma: ma ? (m.price > ma ? 'above' : 'below') : null,
      week52High: m.week52High || 0
    };
    renderCompare(d1, d2);
  }).catch(function() {
    loadEl.style.display = 'none';
    showToast('Could not load data for ' + ticker2);
  });
}

function _cmpStockHeader(d) {
  var logoHtml = d.logo
    ? "<img src='" + escHtml(d.logo) + "' class='cmp-logo' onerror=\"this.style.display='none'\">"
    : "<div class='cmp-logo cmp-logo-placeholder'>" + escHtml(d.ticker.slice(0,2)) + "</div>";
  var changeColor = (d.changePct || 0) >= 0 ? '#128257' : '#dc2626';
  var changeStr = d.changePct != null ? ((d.changePct >= 0 ? '+' : '') + d.changePct.toFixed(2) + '%') : '';
  return "<div class='cmp-col-header'>" +
    logoHtml +
    "<div class='cmp-col-header-info'>" +
      "<div class='cmp-col-ticker'>" + escHtml(d.ticker) + "</div>" +
      "<div class='cmp-col-name'>" + escHtml(d.name || '') + "</div>" +
      (d.price ? "<div class='cmp-col-price'>" + fmt$(d.price) + " <span style='color:" + changeColor + ";font-size:11px;'>" + changeStr + "</span></div>" : "") +
    "</div>" +
  "</div>";
}

function renderCompare(d1, d2) {
  var resultEl = document.getElementById('compare-result');

  var rows = [
    { label: 'StockIQ Score', v1: d1.score + '/100',                            v2: d2.score + '/100',                            better: d1.score > d2.score ? 1 : d2.score > d1.score ? 2 : 0 },
    { label: 'P/E Ratio',     v1: d1.pe > 0 ? d1.pe.toFixed(1) + 'x' : '—',    v2: d2.pe > 0 ? d2.pe.toFixed(1) + 'x' : '—',    better: (d1.pe > 0 && d2.pe > 0) ? (d1.pe < d2.pe ? 1 : d2.pe < d1.pe ? 2 : 0) : 0 },
    { label: 'Profit Margin', v1: d1.margin ? d1.margin.toFixed(1) + '%' : '—', v2: d2.margin ? d2.margin.toFixed(1) + '%' : '—', better: d1.margin > d2.margin ? 1 : d2.margin > d1.margin ? 2 : 0 },
    { label: 'Rev. Growth',   v1: d1.growth ? (d1.growth > 0 ? '+' : '') + d1.growth.toFixed(1) + '%' : '—', v2: d2.growth ? (d2.growth > 0 ? '+' : '') + d2.growth.toFixed(1) + '%' : '—', better: d1.growth > d2.growth ? 1 : d2.growth > d1.growth ? 2 : 0 },
    { label: 'Beta (Risk)',   v1: d1.beta ? d1.beta.toFixed(2) : '—',           v2: d2.beta ? d2.beta.toFixed(2) : '—',           better: (d1.beta > 0 && d2.beta > 0) ? (d1.beta < d2.beta ? 1 : d2.beta < d1.beta ? 2 : 0) : 0 },
    { label: 'ROE',           v1: d1.roe ? d1.roe.toFixed(1) + '%' : '—',       v2: d2.roe ? d2.roe.toFixed(1) + '%' : '—',       better: d1.roe > d2.roe ? 1 : d2.roe > d1.roe ? 2 : 0 },
    { label: 'RSI',           v1: d1.rsi != null ? d1.rsi + '' : '—',           v2: d2.rsi != null ? d2.rsi + '' : '—',           better: 0 },
    { label: 'vs 50-day MA',  v1: d1.price_vs_ma || '—',                        v2: d2.price_vs_ma || '—',                        better: (d1.price_vs_ma === 'above' && d2.price_vs_ma !== 'above') ? 1 : (d2.price_vs_ma === 'above' && d1.price_vs_ma !== 'above') ? 2 : 0 },
  ];

  // Tally wins
  var wins1 = rows.filter(function(r) { return r.better === 1; }).length;
  var wins2 = rows.filter(function(r) { return r.better === 2; }).length;

  var html =
    "<div class='cmp-heroes'>" +
      _cmpStockHeader(d1) +
      "<div class='cmp-vs'>VS</div>" +
      _cmpStockHeader(d2) +
    "</div>" +
    "<div class='cmp-wins-bar'>" +
      "<span class='cmp-wins " + (wins1 >= wins2 ? 'cmp-wins-lead' : '') + "'>" + wins1 + " wins</span>" +
      "<span class='cmp-wins-label'>out of " + rows.filter(function(r){return r.better!==0;}).length + " metrics</span>" +
      "<span class='cmp-wins " + (wins2 >= wins1 ? 'cmp-wins-lead' : '') + "'>" + wins2 + " wins</span>" +
    "</div>" +
    "<div class='cmp-table'>" +
    "<div class='cmp-header'>" +
      "<div class='cmp-metric-col'></div>" +
      "<div class='cmp-stock-col'>" + escHtml(d1.ticker) + "</div>" +
      "<div class='cmp-stock-col'>" + escHtml(d2.ticker) + "</div>" +
    "</div>" +
    rows.map(function(r) {
      var c1 = r.better === 1 ? ' cmp-win' : '';
      var c2 = r.better === 2 ? ' cmp-win' : '';
      return "<div class='cmp-row'>" +
        "<div class='cmp-metric-col'>" + r.label + "</div>" +
        "<div class='cmp-stock-col" + c1 + "'>" + r.v1 + (r.better === 1 ? " <span class='cmp-badge'>✓</span>" : "") + "</div>" +
        "<div class='cmp-stock-col" + c2 + "'>" + r.v2 + (r.better === 2 ? " <span class='cmp-badge'>✓</span>" : "") + "</div>" +
      "</div>";
    }).join('') +
    "</div>" +
    "<p class='cmp-note'>✓ = stronger value. Lower P/E and Beta are better; higher is better for all others.</p>";

  resultEl.innerHTML = html;
  resultEl.style.display = 'block';
}
// ── END COMPARE ───────────────────────────────────────────────

function addToWatchlist() {
  if (!currentTicker) return;
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  if (watchlist.find(function(i) { return i.ticker === currentTicker; })) {
    showToast(currentTicker + " is already in your watchlist!");
    return;
  }
  watchlist.push({ ticker: currentTicker, name: currentName, score: currentScore });
  localStorage.setItem("watchlist", JSON.stringify(watchlist));
  saveToFirestore({ watchlist: watchlist });
  let btn = document.getElementById("watchlist-btn");
  btn.textContent = "✓ Added";
  btn.classList.add("added");
  renderWatchlist();
  loadMarketOverview();
}

let _removedWlItem = null;
let _wlFirestoreTimer = null;
function removeFromWatchlist(ticker) {
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  _removedWlItem = watchlist.find(function(i) { return i.ticker === ticker; }) || null;
  let newWatchlist = watchlist.filter(function(i) { return i.ticker !== ticker; });
  localStorage.setItem("watchlist", JSON.stringify(newWatchlist));
  renderWatchlist();
  loadMarketOverview();
  clearTimeout(_wlFirestoreTimer);
  _wlFirestoreTimer = setTimeout(function() {
    saveToFirestore({ watchlist: newWatchlist });
    _removedWlItem = null;
  }, 3600);
  showUndoToast('Removed ' + ticker + ' from Watchlist', function() {
    clearTimeout(_wlFirestoreTimer);
    if (!_removedWlItem) return;
    var restored = JSON.parse(localStorage.getItem("watchlist") || "[]");
    restored.push(_removedWlItem);
    _removedWlItem = null;
    localStorage.setItem("watchlist", JSON.stringify(restored));
    saveToFirestore({ watchlist: restored });
    renderWatchlist();
    loadMarketOverview();
    showToast('Restored to Watchlist');
  });
}

function setWlSort(sort) {
  wlSort = sort;
  renderWatchlist();
}

var _wlActiveTab = 'list';

function switchWlTab(tab) {
  _wlActiveTab = tab;
  document.getElementById('wl-subtab-list').classList.toggle('active', tab === 'list');
  document.getElementById('wl-subtab-news').classList.toggle('active', tab === 'news');
  var watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
  var items = document.getElementById('watchlist-items');
  var sortBar = document.getElementById('wl-sort-bar');
  var newsSection = document.getElementById('wl-news-section');
  var empty = document.getElementById('watchlist-empty');
  if (tab === 'list') {
    if (items) items.style.display = '';
    if (sortBar) sortBar.style.display = '';
    if (newsSection) newsSection.style.display = 'none';
    if (watchlist.length === 0 && empty) empty.style.display = 'flex';
  } else {
    if (items) items.style.display = 'none';
    if (sortBar) sortBar.style.display = 'none';
    if (empty) empty.style.display = 'none';
    if (newsSection) newsSection.style.display = 'block';
    if (watchlist.length === 0) {
      document.getElementById('wl-news-list').innerHTML = '';
      document.getElementById('wl-news-empty').style.display = 'block';
    } else {
      loadWatchlistNews(watchlist.map(function(w) { return w.ticker; }));
    }
  }
}

function _wlNewsTimeAgo(ts) {
  var diff = Math.floor((Date.now() - ts * 1000) / 1000);
  if (diff < 3600)  return Math.max(1, Math.floor(diff / 60)) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 172800) return 'Yesterday';
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function _wlGetLogo(ticker) {
  return localStorage.getItem('wl-logo-' + ticker) || '';
}

function _wlFetchLogos(tickers, cb) {
  var missing = tickers.filter(function(t) { return !localStorage.getItem('wl-logo-' + t); });
  if (missing.length === 0) { cb(); return; }
  var promises = missing.map(function(t) {
    return fetch(finnhubUrl('/api/v1/stock/profile2', {symbol: t}))
      .then(function(r) { return r.json(); })
      .then(function(p) { if (p && p.logo) localStorage.setItem('wl-logo-' + t, p.logo); })
      .catch(function() {});
  });
  Promise.all(promises).then(cb);
}

function loadWatchlistNews(tickers) {
  var list = document.getElementById('wl-news-list');
  var emptyEl = document.getElementById('wl-news-empty');
  if (!list || !tickers || tickers.length === 0) return;

  var cacheKey = 'wl-news-cache-' + tickers.slice().sort().join(',');
  var cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      var p = JSON.parse(cached);
      if (Date.now() - p.ts < 1800000) {
        _wlFetchLogos(tickers, function() { renderWatchlistNews(p.articles); });
        return;
      }
    } catch(e) {}
  }

  // Show skeleton while loading
  if (emptyEl) emptyEl.style.display = 'none';
  list.innerHTML = [0,1,2,3,4].map(function() {
    return "<div class='wl-news-skeleton'>" +
      "<div class='wl-skel-thumb'></div>" +
      "<div class='wl-skel-body'>" +
        "<div class='wl-skel-line short'></div>" +
        "<div class='wl-skel-line medium'></div>" +
        "<div class='wl-skel-line short'></div>" +
      "</div>" +
    "</div>";
  }).join('');

  var today = new Date();
  var from = new Date(today); from.setDate(today.getDate() - 7);
  var toStr = today.toISOString().split('T')[0];
  var fromStr = from.toISOString().split('T')[0];

  var limit = tickers.slice(0, 5);
  var newsPromises = limit.map(function(t) {
    return fetch(finnhubUrl('/api/v1/company-news', {symbol: t, from: fromStr, to: toStr}))
      .then(function(r) { return r.json(); })
      .then(function(news) {
        return (Array.isArray(news) ? news : []).slice(0, 8).map(function(a) {
          return Object.assign({}, a, { _ticker: t });
        });
      })
      .catch(function() { return []; });
  });

  Promise.all(newsPromises).then(function(results) {
    var all = [].concat.apply([], results);
    var seen = {};
    var unique = all.filter(function(a) {
      if (seen[a.headline]) return false;
      seen[a.headline] = true;
      return true;
    }).sort(function(a, b) { return b.datetime - a.datetime; }).slice(0, 20);
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), articles: unique }));
    _wlFetchLogos(limit, function() { renderWatchlistNews(unique); });
  });
}

function renderWatchlistNews(articles) {
  var list = document.getElementById('wl-news-list');
  var emptyEl = document.getElementById('wl-news-empty');
  if (!list) return;
  if (!articles || articles.length === 0) {
    list.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  list.innerHTML = articles.map(function(a) {
    var timeStr = a.datetime ? _wlNewsTimeAgo(a.datetime) : '';
    var source = escHtml(a.source || '');
    var url = a.url || '#';
    var logo = _wlGetLogo(a._ticker || '');
    var imgHtml = logo
      ? "<img class='wl-news-thumb' src='" + escHtml(logo) + "' alt='" + escHtml(a._ticker || '') + "' loading='lazy' onerror=\"this.style.display='none'\">"
      : "<div class='wl-news-thumb wl-news-thumb-placeholder'><span>" + escHtml(a._ticker || '') + "</span></div>";
    return "<a class='wl-news-item' href='" + escHtml(url) + "' target='_blank' rel='noopener'>" +
      imgHtml +
      "<div class='wl-news-body'>" +
        "<div class='wl-news-top-row'>" +
          "<span class='wl-news-ticker'>" + escHtml(a._ticker || '') + "</span>" +
          (source ? "<span class='wl-news-source'>" + source + "</span>" : '') +
        "</div>" +
        "<div class='news-headline'>" + escHtml(a.headline) + "</div>" +
        "<div class='news-meta'>" + timeStr + "</div>" +
      "</div>" +
    "</a>";
  }).join('');
}

function renderWatchlist() {
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  let empty = document.getElementById("watchlist-empty");
  let items = document.getElementById("watchlist-items");
  if (watchlist.length === 0) { empty.style.display = "flex"; items.innerHTML = ""; document.getElementById('wl-news-section').style.display = 'none'; return; }
  empty.style.display = "none";
  // News loads on demand when user switches to news sub-tab
  document.getElementById('wl-news-section').style.display = 'none';

  // Sort bar
  let sortBar = document.getElementById('wl-sort-bar');
  if (!sortBar) {
    let section = document.getElementById('watchlist-section');
    sortBar = document.createElement('div');
    sortBar.id = 'wl-sort-bar';
    section.insertBefore(sortBar, items);
  }
  sortBar.innerHTML = '<span class="wl-sort-label">Sort:</span>' +
    ['score','change','ticker'].map(function(s) {
      let label = s === 'score' ? 'Score' : s === 'change' ? 'Change %' : 'Ticker A–Z';
      return "<button class='wl-sort-btn" + (wlSort === s ? ' active' : '') + "' onclick='setWlSort(\"" + s + "\")'>" + label + "</button>";
    }).join('');

  // Render immediately with loading placeholders for prices
  function buildRow(item, price, changePct) {
    let scoreColor = item.score >= 65 ? "#128257" : item.score >= 50 ? "#e07510" : "#dc2626";
    let signal = item.score >= 65 ? "Strong" : item.score >= 50 ? "Watch" : "Risky";
    let priceHtml = price == null
      ? "<span class='wl-price'>—</span>"
      : "<span class='wl-price'>" + fmt$(price) + "</span><span class='wl-change' style='color:" + (changePct >= 0 ? "#128257" : "#dc2626") + ";'>" + (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "%</span>";
    let hist = buildScoreHistoryBars(item.ticker, item.score);
    let histDrawer = hist.bars
      ? "<div class='wl-history-drawer' id='wl-hist-" + item.ticker + "' style='display:none;'>" +
          "<div style='padding:10px 0 4px;'>" + hist.trend + "</div>" +
          hist.bars +
        "</div>"
      : "";
    let histToggle = hist.bars
      ? "<button class='wl-hist-toggle' onclick='event.stopPropagation();toggleWlHistory(\"" + item.ticker + "\")' id='wl-hist-btn-" + item.ticker + "'>History ▾</button>"
      : "";
    let alerts = JSON.parse(localStorage.getItem('price-alerts') || '{}');
    let alertTarget = alerts[item.ticker];
    let _bellSvg = "<svg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' style='vertical-align:-2px;margin-right:3px'><path d='M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9'/><path d='M13.73 21a2 2 0 0 1-3.46 0'/></svg>";
    let alertHtml = alertTarget
      ? "<span class='wl-alert-tag' onclick='event.stopPropagation();removeAlert(\"" + item.ticker + "\")' title='Remove alert'>" + _bellSvg + "$" + alertTarget.toFixed(2) + " ✕</span>"
      : "<button class='wl-alert-btn' onclick='event.stopPropagation();openAlertInput(\"" + item.ticker + "\"," + (price || 0) + ")'>" + _bellSvg + "Alert</button>";
    return "<div class='watchlist-item'>" +
      "<div class='wl-main-row'>" +
        "<div onclick='loadFromWatchlist(\"" + item.ticker + "\")' style='flex:1;cursor:pointer;min-width:0;'>" +
          "<div class='watchlist-ticker'>" + escHtml(item.ticker) + "</div>" +
          "<div class='watchlist-name'>" + escHtml(item.name || "") + "</div>" +
        "</div>" +
        "<div class='wl-price-block'>" + priceHtml + "</div>" +
        "<button class='watchlist-remove' onclick='event.stopPropagation();removeFromWatchlist(\"" + item.ticker + "\")'>✕</button>" +
      "</div>" +
      "<div class='wl-action-row'>" +
        "<div class='wl-score-block'>" +
          "<div class='watchlist-score' style='color:" + scoreColor + ";'>" + signal + " · " + item.score + "/100</div>" +
          (hist.trend ? "<div class='wl-score-trend'>" + hist.trend + "</div>" : "") +
        "</div>" +
        "<div class='wl-action-btns'>" +
          histToggle +
          alertHtml +
          "<button class='wl-add-port-btn' onclick='event.stopPropagation();addWatchlistToPortfolio(\"" + escHtml(item.ticker) + "\"," + (price || 0) + ")' title='Add to Portfolio'>+ Portfolio</button>" +
        "</div>" +
      "</div>" +
      "<div id='alert-container-" + item.ticker + "'></div>" +
      histDrawer +
    "</div>";
  }

  // Show skeletons first (sorted by score as default)
  let initSorted = watchlist.slice();
  if (wlSort === 'score') initSorted.sort(function(a, b) { return (b.score || 0) - (a.score || 0); });
  else if (wlSort === 'ticker') initSorted.sort(function(a, b) { return a.ticker.localeCompare(b.ticker); });
  items.innerHTML = initSorted.map(function(item) { return buildRow(item, null, 0); }).join("");

  // Fetch live quotes via shared cache
  var wlSymbols = watchlist.map(function(item) { return item.ticker; });
  getSharedPrices(wlSymbols, 60000).then(function(priceMap) {
    var quotes = watchlist.map(function(item) {
      var p = priceMap[item.ticker] || {};
      return { ticker: item.ticker, price: p.price || null, changePct: p.changePct || 0, prevClose: p.prevClose || 0 };
    });
    let quoteMap = {};
    quotes.forEach(function(q) { quoteMap[q.ticker] = q; });
    checkPriceAlerts(quoteMap);
    let sorted = watchlist.slice();
    if (wlSort === 'score') sorted.sort(function(a, b) { return (b.score || 0) - (a.score || 0); });
    else if (wlSort === 'change') sorted.sort(function(a, b) { let qa = quoteMap[a.ticker] || {}; let qb = quoteMap[b.ticker] || {}; return (qb.changePct || 0) - (qa.changePct || 0); });
    else if (wlSort === 'ticker') sorted.sort(function(a, b) { return a.ticker.localeCompare(b.ticker); });
    items.innerHTML = sorted.map(function(item) {
      let q = quoteMap[item.ticker] || { price: null, changePct: 0 };
      return buildRow(item, q.price, q.changePct);
    }).join("");

    // Auto-save score history for watchlist items once per day
    var todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    watchlist.forEach(function(item) {
      if (!item.score) return;
      var hist = JSON.parse(localStorage.getItem('history_score_' + item.ticker) || '[]');
      if (hist.length === 0 || hist[hist.length - 1].date !== todayLabel) {
        saveScoreHistory(item.ticker, item.score);
      }
    });
  });
}

// ── Price alerts ────────────────────────────────────────────

function setAlert(ticker, price, currentPrice) {
  let alerts = JSON.parse(localStorage.getItem('price-alerts') || '{}');
  alerts[ticker] = parseFloat(price);
  localStorage.setItem('price-alerts', JSON.stringify(alerts));
  saveToFirestore({ priceAlerts: alerts });
  let dir = parseFloat(price) >= currentPrice ? '↑ above' : '↓ below';
  showToast('Alert set: notify when ' + ticker + ' goes ' + dir + ' $' + parseFloat(price).toFixed(2));
  if (window.Notification && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  renderWatchlist();
  // Also refresh portfolio rows if the alert was set from a portfolio stock
  if (portfolioStockData && portfolioStockData.length) renderPortfolioRows(portfolioStockData);
}

function removeAlert(ticker) {
  let alerts = JSON.parse(localStorage.getItem('price-alerts') || '{}');
  delete alerts[ticker];
  localStorage.setItem('price-alerts', JSON.stringify(alerts));
  replaceInFirestore({ priceAlerts: alerts });
  renderWatchlist();
}

function removePortAlert(ticker) {
  let alerts = JSON.parse(localStorage.getItem('price-alerts') || '{}');
  delete alerts[ticker];
  localStorage.setItem('price-alerts', JSON.stringify(alerts));
  replaceInFirestore({ priceAlerts: alerts });
  if (portfolioStockData && portfolioStockData.length) renderPortfolioRows(portfolioStockData);
}

function checkPriceAlerts(quoteMap) {
  let alerts = JSON.parse(localStorage.getItem('price-alerts') || '{}');
  let fired = JSON.parse(localStorage.getItem('alerts-fired') || '{}');
  let today = new Date().toDateString();
  Object.keys(alerts).forEach(function(ticker) {
    let target = alerts[ticker];
    let q = quoteMap[ticker];
    if (!q || !q.price) return;
    let fireKey = ticker + '_' + target + '_' + today;
    if (fired[fireKey]) return; // already notified today
    let hit = false;
    if (target >= q.prevClose && q.price >= target) hit = true;   // crossed up
    if (target <= q.prevClose && q.price <= target) hit = true;   // crossed down
    if (hit) {
      fired[fireKey] = true;
      localStorage.setItem('alerts-fired', JSON.stringify(fired));
      showToast('Alert: ' + ticker + ' hit your $' + target.toFixed(2) + ' target — now $' + q.price.toFixed(2));
      // Try browser notification if permitted
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('StockIQ Alert', { body: ticker + ' hit $' + target.toFixed(2) + ' — now $' + q.price.toFixed(2) });
      }
    }
  });
}

function openAlertInput(ticker, currentPrice) {
  let existing = document.getElementById('alert-input-' + ticker);
  if (existing) { existing.remove(); return; }
  let container = document.getElementById('alert-container-' + ticker);
  if (!container) return;
  let div = document.createElement('div');
  div.id = 'alert-input-' + ticker;
  div.className = 'alert-input-wrap';
  div.innerHTML =
    '<div class="alert-range-hint" id="alert-range-' + ticker + '">Loading 52-week range…</div>' +
    '<div class="alert-input-row">' +
      '<input type="number" id="alert-val-' + ticker + '" placeholder="Target $" step="0.01" value="' + (currentPrice > 0 ? currentPrice.toFixed(2) : '') + '">' +
      '<button onclick="setAlert(\'' + ticker + '\',document.getElementById(\'alert-val-' + ticker + '\').value,' + currentPrice + ')" class="alert-set-btn">Set Alert</button>' +
      '<button onclick="document.getElementById(\'alert-input-' + ticker + '\').remove()" class="alert-cancel-btn">✕</button>' +
    '</div>';
  container.appendChild(div);
  document.getElementById('alert-val-' + ticker).focus();
  // Fetch 52-week range from Finnhub metrics
  fetch(finnhubUrl('/api/v1/stock/metric', {symbol: ticker, metric: 'all'}))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      let m = data.metric || {};
      let lo = m['52WeekLow'], hi = m['52WeekHigh'];
      let hint = document.getElementById('alert-range-' + ticker);
      if (!hint) return;
      if (lo && hi) {
        let pct = currentPrice > 0 ? Math.round(((currentPrice - lo) / (hi - lo)) * 100) : null;
        hint.innerHTML =
          '52-week range: <strong>$' + lo.toFixed(2) + '</strong> — <strong>$' + hi.toFixed(2) + '</strong>' +
          (currentPrice > 0 ? ' · Current <strong>$' + currentPrice.toFixed(2) + '</strong> (' + pct + '% of range)' : '');
        var midpoint = Math.round((lo + hi) / 2 * 100) / 100;
        var nearHigh = Math.round(hi * 0.97 * 100) / 100;
        var chipsDiv = document.createElement('div');
        chipsDiv.className = 'alert-chips';
        chipsDiv.innerHTML =
          '<button class="alert-chip" onclick="document.getElementById(\'alert-val-' + ticker + '\').value=\'' + midpoint.toFixed(2) + '\'">📉 $' + midpoint.toFixed(2) + ' — if it dips below the year\'s midpoint</button>' +
          '<button class="alert-chip" onclick="document.getElementById(\'alert-val-' + ticker + '\').value=\'' + nearHigh.toFixed(2) + '\'">📈 $' + nearHigh.toFixed(2) + ' — if it nears its yearly high</button>';
        var inputRowEl = hint.parentNode && hint.parentNode.querySelector('.alert-input-row');
        if (inputRowEl) hint.parentNode.insertBefore(chipsDiv, inputRowEl);
      } else {
        hint.textContent = 'Range data unavailable. Check the Analyze tab for more context.';
      }
    })
    .catch(function() {
      let hint = document.getElementById('alert-range-' + ticker);
      if (hint) hint.textContent = 'Could not load range data.';
    });
}

// ── END price alerts ─────────────────────────────────────────

function toggleWlHistory(ticker) {
  let drawer = document.getElementById('wl-hist-' + ticker);
  let btn = document.getElementById('wl-hist-btn-' + ticker);
  if (!drawer) return;
  let open = drawer.style.display !== 'none';
  drawer.style.display = open ? 'none' : 'block';
  if (btn) btn.textContent = open ? 'History ▾' : 'History ▴';
}

function toggleAddStockForm() {
  var body = document.getElementById('add-form-body');
  var btn = document.getElementById('add-stock-toggle');
  if (!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (btn) btn.textContent = open ? '+ Add Stock' : '− Close';
  if (!open) {
    var dateEl = document.getElementById('port-date');
    if (dateEl && !dateEl.value) prefillTodayDate();
    _refreshVaultBalance(); // show current vault balance when form opens
  }
}

function openAddStockForm() {
  var body = document.getElementById('add-form-body');
  var btn = document.getElementById('add-stock-toggle');
  if (body && body.style.display === 'none') {
    body.style.display = 'block';
    if (btn) btn.textContent = '− Close form';
  }
}

function addWatchlistToPortfolio(ticker, price) {
  showTab('portfolio');
  openAddStockForm();
  document.getElementById('port-ticker').value = ticker;
  if (price > 0) document.getElementById('port-price').value = price.toFixed(2);
  document.getElementById('port-shares').focus();
}

function loadFromWatchlist(ticker) {
  showTab('analyze');
  document.getElementById("stock-input").value = ticker;
  searchStock();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

var TRENDING_POOL = [
  // Technology
  {symbol:'AAPL',name:'Apple'},{symbol:'MSFT',name:'Microsoft'},{symbol:'NVDA',name:'NVIDIA'},
  {symbol:'GOOGL',name:'Alphabet'},{symbol:'META',name:'Meta'},{symbol:'AMZN',name:'Amazon'},
  {symbol:'AMD',name:'AMD'},{symbol:'INTC',name:'Intel'},{symbol:'ORCL',name:'Oracle'},
  {symbol:'CRM',name:'Salesforce'},{symbol:'AVGO',name:'Broadcom'},{symbol:'TSLA',name:'Tesla'},
  {symbol:'NFLX',name:'Netflix'},{symbol:'ADBE',name:'Adobe'},{symbol:'QCOM',name:'Qualcomm'},
  // Healthcare
  {symbol:'JNJ',name:'Johnson & Johnson'},{symbol:'UNH',name:'UnitedHealth'},{symbol:'LLY',name:'Eli Lilly'},
  {symbol:'PFE',name:'Pfizer'},{symbol:'ABBV',name:'AbbVie'},{symbol:'MRK',name:'Merck'},
  {symbol:'TMO',name:'Thermo Fisher'},{symbol:'AMGN',name:'Amgen'},{symbol:'GILD',name:'Gilead'},
  {symbol:'CVS',name:'CVS Health'},
  // Financials
  {symbol:'JPM',name:'JPMorgan'},{symbol:'BAC',name:'Bank of America'},{symbol:'WFC',name:'Wells Fargo'},
  {symbol:'GS',name:'Goldman Sachs'},{symbol:'MS',name:'Morgan Stanley'},{symbol:'BLK',name:'BlackRock'},
  {symbol:'AXP',name:'Amex'},{symbol:'V',name:'Visa'},{symbol:'MA',name:'Mastercard'},
  // Energy
  {symbol:'XOM',name:'ExxonMobil'},{symbol:'CVX',name:'Chevron'},{symbol:'COP',name:'ConocoPhillips'},
  {symbol:'OXY',name:'Occidental'},{symbol:'SLB',name:'SLB'},{symbol:'EOG',name:'EOG Resources'},
  {symbol:'MPC',name:'Marathon Petroleum'},{symbol:'HAL',name:'Halliburton'},
  // Consumer
  {symbol:'HD',name:'Home Depot'},{symbol:'MCD',name:"McDonald's"},{symbol:'NKE',name:'Nike'},
  {symbol:'SBUX',name:'Starbucks'},{symbol:'TGT',name:'Target'},{symbol:'LOW',name:"Lowe's"},
  {symbol:'CMG',name:'Chipotle'},{symbol:'BKNG',name:'Booking Holdings'},
  {symbol:'GM',name:'General Motors'},{symbol:'F',name:'Ford'},
  // Industrials
  {symbol:'CAT',name:'Caterpillar'},{symbol:'RTX',name:'RTX'},{symbol:'HON',name:'Honeywell'},
  {symbol:'UPS',name:'UPS'},{symbol:'BA',name:'Boeing'},{symbol:'GE',name:'GE Aerospace'},
  {symbol:'LMT',name:'Lockheed Martin'},{symbol:'FDX',name:'FedEx'},
  // Other
  {symbol:'NEE',name:'NextEra Energy'},{symbol:'DIS',name:'Disney'},
  {symbol:'KO',name:'Coca-Cola'},{symbol:'PEP',name:'PepsiCo'},
  {symbol:'WMT',name:'Walmart'},{symbol:'COST',name:'Costco'},
  {symbol:'PLD',name:'Prologis'},{symbol:'AMT',name:'American Tower'},
];

function _seededShuffle(arr, seed) {
  var result = arr.slice();
  for (var i = result.length - 1; i > 0; i--) {
    seed = ((seed * 1664525) + 1013904223) & 0x7fffffff;
    var j = seed % (i + 1);
    var tmp = result[i]; result[i] = result[j]; result[j] = tmp;
  }
  return result;
}

function loadTrendingTickers(forceRefresh) {
  var dayIndex = Math.floor(Date.now() / 86400000);
  var cacheKey = 'trending-cache-' + dayIndex;
  var tickers = _seededShuffle(TRENDING_POOL, dayIndex).slice(0, 15);

  let list = document.getElementById('trending-list');
  if (!list) return;

  // Check cache (5 min TTL within the same day) — skip if forcing refresh
  if (!forceRefresh) {
    let cached = localStorage.getItem(cacheKey);
    if (cached) {
      let parsed = JSON.parse(cached);
      if (Date.now() - parsed.ts < 300000) { allTrendingData = parsed.data; renderTrending(parsed.data); return; }
    }
  }

  list.innerHTML = '<div class="trending-loading">Fetching prices...</div>';

  var symbols = tickers.map(function(t) { return t.symbol; });
  getSharedPrices(symbols, 60000).then(function(priceMap) { // 1 min TTL for trending
    var valid = tickers.map(function(t) {
      var q = priceMap[t.symbol];
      if (!q || !q.price) return null;
      return { symbol: t.symbol, name: t.name, price: q.price, change: q.change || 0, changePct: q.changePct || 0 };
    }).filter(function(r) { return r && r.price > 0; });
    valid.sort(function(a, b) { return Math.abs(b.changePct) - Math.abs(a.changePct); });
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: valid }));
    allTrendingData = valid;
    renderTrending(valid);
  });
}

let currentTrendingFilter = 'all';
let allTrendingData = [];

// ── STOCK SCREENER ─────────────────────────────────────────────────────────

var SCREENER_POOL = [
  // Technology (21) — software, semiconductors, hardware, cloud, cybersecurity
  {symbol:'AAPL',name:'Apple',sector:'Technology'},
  {symbol:'MSFT',name:'Microsoft',sector:'Technology'},
  {symbol:'NVDA',name:'NVIDIA',sector:'Technology'},
  {symbol:'GOOGL',name:'Alphabet (Google)',sector:'Technology'},
  {symbol:'META',name:'Meta (Facebook)',sector:'Technology'},
  {symbol:'AMD',name:'AMD',sector:'Technology'},
  {symbol:'INTC',name:'Intel',sector:'Technology'},
  {symbol:'ORCL',name:'Oracle',sector:'Technology'},
  {symbol:'CRM',name:'Salesforce',sector:'Technology'},
  {symbol:'AVGO',name:'Broadcom',sector:'Technology'},
  {symbol:'ADBE',name:'Adobe',sector:'Technology'},
  {symbol:'QCOM',name:'Qualcomm',sector:'Technology'},
  {symbol:'SHOP',name:'Shopify',sector:'Technology'},
  {symbol:'SNOW',name:'Snowflake',sector:'Technology'},
  {symbol:'NOW',name:'ServiceNow',sector:'Technology'},
  {symbol:'PANW',name:'Palo Alto Networks',sector:'Technology'},
  {symbol:'CRWD',name:'CrowdStrike',sector:'Technology'},
  {symbol:'MU',name:'Micron',sector:'Technology'},
  {symbol:'AMAT',name:'Applied Materials',sector:'Technology'},
  {symbol:'PLTR',name:'Palantir',sector:'Technology'},
  {symbol:'ARM',name:'ARM Holdings',sector:'Technology'},
  // Healthcare (20) — pharma, biotech, medical devices, health insurance
  {symbol:'JNJ',name:'Johnson & Johnson',sector:'Healthcare'},
  {symbol:'UNH',name:'UnitedHealth',sector:'Healthcare'},
  {symbol:'LLY',name:'Eli Lilly',sector:'Healthcare'},
  {symbol:'PFE',name:'Pfizer',sector:'Healthcare'},
  {symbol:'ABBV',name:'AbbVie',sector:'Healthcare'},
  {symbol:'MRK',name:'Merck',sector:'Healthcare'},
  {symbol:'TMO',name:'Thermo Fisher',sector:'Healthcare'},
  {symbol:'AMGN',name:'Amgen',sector:'Healthcare'},
  {symbol:'GILD',name:'Gilead Sciences',sector:'Healthcare'},
  {symbol:'CVS',name:'CVS Health',sector:'Healthcare'},
  {symbol:'BMY',name:'Bristol-Myers Squibb',sector:'Healthcare'},
  {symbol:'ISRG',name:'Intuitive Surgical',sector:'Healthcare'},
  {symbol:'MDT',name:'Medtronic',sector:'Healthcare'},
  {symbol:'SYK',name:'Stryker',sector:'Healthcare'},
  {symbol:'REGN',name:'Regeneron',sector:'Healthcare'},
  {symbol:'VRTX',name:'Vertex Pharma',sector:'Healthcare'},
  {symbol:'ZBH',name:'Zimmer Biomet',sector:'Healthcare'},
  {symbol:'HCA',name:'HCA Healthcare',sector:'Healthcare'},
  {symbol:'CI',name:'Cigna',sector:'Healthcare'},
  {symbol:'BIIB',name:'Biogen',sector:'Healthcare'},
  // Financials (20) — banks, insurance, payments, asset managers
  {symbol:'JPM',name:'JPMorgan Chase',sector:'Financials'},
  {symbol:'BAC',name:'Bank of America',sector:'Financials'},
  {symbol:'WFC',name:'Wells Fargo',sector:'Financials'},
  {symbol:'GS',name:'Goldman Sachs',sector:'Financials'},
  {symbol:'MS',name:'Morgan Stanley',sector:'Financials'},
  {symbol:'BLK',name:'BlackRock',sector:'Financials'},
  {symbol:'AXP',name:'American Express',sector:'Financials'},
  {symbol:'V',name:'Visa',sector:'Financials'},
  {symbol:'MA',name:'Mastercard',sector:'Financials'},
  {symbol:'C',name:'Citigroup',sector:'Financials'},
  {symbol:'USB',name:'U.S. Bancorp',sector:'Financials'},
  {symbol:'PGR',name:'Progressive',sector:'Financials'},
  {symbol:'CB',name:'Chubb',sector:'Financials'},
  {symbol:'ICE',name:'Intercontinental Exchange',sector:'Financials'},
  {symbol:'CME',name:'CME Group',sector:'Financials'},
  {symbol:'SCHW',name:'Charles Schwab',sector:'Financials'},
  {symbol:'COF',name:'Capital One',sector:'Financials'},
  {symbol:'AFL',name:'Aflac',sector:'Financials'},
  {symbol:'MET',name:'MetLife',sector:'Financials'},
  {symbol:'PRU',name:'Prudential',sector:'Financials'},
  // Energy (15) — oil, gas, pipelines, refiners, services
  {symbol:'XOM',name:'ExxonMobil',sector:'Energy'},
  {symbol:'CVX',name:'Chevron',sector:'Energy'},
  {symbol:'COP',name:'ConocoPhillips',sector:'Energy'},
  {symbol:'OXY',name:'Occidental',sector:'Energy'},
  {symbol:'SLB',name:'SLB',sector:'Energy'},
  {symbol:'EOG',name:'EOG Resources',sector:'Energy'},
  {symbol:'MPC',name:'Marathon Petroleum',sector:'Energy'},
  {symbol:'HAL',name:'Halliburton',sector:'Energy'},
  {symbol:'PSX',name:'Phillips 66',sector:'Energy'},
  {symbol:'VLO',name:'Valero Energy',sector:'Energy'},
  {symbol:'WMB',name:'Williams Companies',sector:'Energy'},
  {symbol:'KMI',name:'Kinder Morgan',sector:'Energy'},
  {symbol:'DVN',name:'Devon Energy',sector:'Energy'},
  {symbol:'FANG',name:'Diamondback Energy',sector:'Energy'},
  {symbol:'BKR',name:'Baker Hughes',sector:'Energy'},
  // Consumer (24) — retail, food, autos, travel, entertainment, e-commerce
  {symbol:'AMZN',name:'Amazon',sector:'Consumer'},
  {symbol:'TSLA',name:'Tesla',sector:'Consumer'},
  {symbol:'NFLX',name:'Netflix',sector:'Consumer'},
  {symbol:'UBER',name:'Uber',sector:'Consumer'},
  {symbol:'HD',name:'Home Depot',sector:'Consumer'},
  {symbol:'MCD',name:"McDonald's",sector:'Consumer'},
  {symbol:'NKE',name:'Nike',sector:'Consumer'},
  {symbol:'SBUX',name:'Starbucks',sector:'Consumer'},
  {symbol:'TGT',name:'Target',sector:'Consumer'},
  {symbol:'LOW',name:"Lowe's",sector:'Consumer'},
  {symbol:'CMG',name:'Chipotle',sector:'Consumer'},
  {symbol:'BKNG',name:'Booking Holdings',sector:'Consumer'},
  {symbol:'GM',name:'General Motors',sector:'Consumer'},
  {symbol:'F',name:'Ford',sector:'Consumer'},
  {symbol:'WMT',name:'Walmart',sector:'Consumer'},
  {symbol:'COST',name:'Costco',sector:'Consumer'},
  {symbol:'KO',name:'Coca-Cola',sector:'Consumer'},
  {symbol:'PEP',name:'PepsiCo',sector:'Consumer'},
  {symbol:'DIS',name:'Disney',sector:'Consumer'},
  {symbol:'ABNB',name:'Airbnb',sector:'Consumer'},
  {symbol:'LYFT',name:'Lyft',sector:'Consumer'},
  {symbol:'DASH',name:'DoorDash',sector:'Consumer'},
  {symbol:'YUM',name:'Yum! Brands',sector:'Consumer'},
  {symbol:'MAR',name:'Marriott',sector:'Consumer'},
  // Industrials (15) — aerospace, defense, logistics, machinery, railroads
  {symbol:'CAT',name:'Caterpillar',sector:'Industrials'},
  {symbol:'RTX',name:'RTX',sector:'Industrials'},
  {symbol:'HON',name:'Honeywell',sector:'Industrials'},
  {symbol:'UPS',name:'UPS',sector:'Industrials'},
  {symbol:'BA',name:'Boeing',sector:'Industrials'},
  {symbol:'GE',name:'GE Aerospace',sector:'Industrials'},
  {symbol:'LMT',name:'Lockheed Martin',sector:'Industrials'},
  {symbol:'FDX',name:'FedEx',sector:'Industrials'},
  {symbol:'DE',name:'John Deere',sector:'Industrials'},
  {symbol:'MMM',name:'3M',sector:'Industrials'},
  {symbol:'EMR',name:'Emerson Electric',sector:'Industrials'},
  {symbol:'ETN',name:'Eaton',sector:'Industrials'},
  {symbol:'NOC',name:'Northrop Grumman',sector:'Industrials'},
  {symbol:'GD',name:'General Dynamics',sector:'Industrials'},
  {symbol:'CSX',name:'CSX',sector:'Industrials'},
  // Real Estate (10) — REITs: warehouses, towers, malls, data centers, apartments
  {symbol:'PLD',name:'Prologis',sector:'Real Estate'},
  {symbol:'AMT',name:'American Tower',sector:'Real Estate'},
  {symbol:'EQIX',name:'Equinix',sector:'Real Estate'},
  {symbol:'CCI',name:'Crown Castle',sector:'Real Estate'},
  {symbol:'SPG',name:'Simon Property',sector:'Real Estate'},
  {symbol:'O',name:'Realty Income',sector:'Real Estate'},
  {symbol:'WELL',name:'Welltower',sector:'Real Estate'},
  {symbol:'DLR',name:'Digital Realty',sector:'Real Estate'},
  {symbol:'AVB',name:'AvalonBay',sector:'Real Estate'},
  {symbol:'EQR',name:'Equity Residential',sector:'Real Estate'},
  // Utilities (10) — electric, gas, water utilities
  {symbol:'NEE',name:'NextEra Energy',sector:'Utilities'},
  {symbol:'DUK',name:'Duke Energy',sector:'Utilities'},
  {symbol:'SO',name:'Southern Company',sector:'Utilities'},
  {symbol:'D',name:'Dominion Energy',sector:'Utilities'},
  {symbol:'AEP',name:'American Electric Power',sector:'Utilities'},
  {symbol:'EXC',name:'Exelon',sector:'Utilities'},
  {symbol:'XEL',name:'Xcel Energy',sector:'Utilities'},
  {symbol:'SRE',name:'Sempra',sector:'Utilities'},
  {symbol:'WEC',name:'WEC Energy',sector:'Utilities'},
  {symbol:'ES',name:'Eversource',sector:'Utilities'},
];

var _screenerOpen = false;
var _screenerData = [];
var _screenerLoaded = false;
var _screenerGoal = null;
var _screenerRenderToken = 0;
var _screenerQuery = null; // active natural-language query filters


var SCREENER_GOALS = [
  {
    id: 'safe',
    label: 'Safe & Stable',
    desc: 'Companies that move less than the market and have solid fundamentals.',
    learn: { term: 'Beta', explain: 'Beta measures how much a stock swings compared to the market. Beta below 1.0 means it moves less — useful if you want to sleep at night. A beta of 0.5 means if the market drops 10%, this stock typically drops only 5%.' },
    filter: function(s) { return s.beta > 0 && s.beta < 1.2; },
    sort: function(a, b) { return a.beta - b.beta; },
    reason: function(s) { return 'Beta ' + s.beta.toFixed(2) + ' — moves ' + Math.round((1 - s.beta) * 100) + '% less than the market'; }
  },
  {
    id: 'growth',
    label: 'High Growth',
    desc: 'Companies growing revenue fast — expanding their business quickly.',
    learn: { term: 'Revenue Growth', explain: 'Revenue growth shows how much more a company is selling compared to last year. Above 10% is considered strong. Above 20% is exceptional — the company is expanding fast. Growth stocks often have higher valuations because investors expect future profits.' },
    filter: function(s) { return s.growth > 5; },
    sort: function(a, b) { return b.growth - a.growth; },
    reason: function(s) { return 'Revenue grew ' + s.growth.toFixed(1) + '% vs last year'; }
  },
  {
    id: 'value',
    label: 'Good Value',
    desc: 'Stocks priced cheap relative to what the company actually earns.',
    learn: { term: 'P/E Ratio', explain: 'The P/E ratio tells you how much you pay for every $1 of profit. A P/E of 15 means you pay $15 for $1 of earnings — considered cheap. A P/E of 50 means you\'re paying a premium expecting big future growth. Lower P/E can mean better value, but always check why it\'s low.' },
    filter: function(s) { return s.pe > 0 && s.pe < 25; },
    sort: function(a, b) { return a.pe - b.pe; },
    reason: function(s) { return 'P/E of ' + s.pe.toFixed(1) + ' — you pay $' + s.pe.toFixed(0) + ' for every $1 of earnings'; }
  },
  {
    id: 'profitable',
    label: 'Very Profitable',
    desc: 'Companies that keep a large portion of every dollar they earn.',
    learn: { term: 'Profit Margin', explain: 'Profit margin is how many cents a company keeps from every dollar of revenue. A 25% margin means for every $100 in sales, $25 is profit. High margins mean the company has pricing power and is hard to compete with. Most retail companies have thin margins (2–5%). Software companies often exceed 20–30%.' },
    filter: function(s) { return s.margin > 10; },
    sort: function(a, b) { return b.margin - a.margin; },
    reason: function(s) { return 'Keeps ' + s.margin.toFixed(1) + '% of every dollar as profit'; }
  },
  {
    id: 'gaining',
    label: 'Top Movers',
    desc: 'Stocks with the biggest price moves — leaders and laggards from the latest session.',
    learn: { term: 'Price Movement', explain: 'A stock moving up more than 1% in a single day often signals buying momentum — investors are excited. This could be due to good earnings, an analyst upgrade, or broader market optimism. But remember: short-term price moves don\'t always reflect long-term value.' },
    filter: function(s) { return s.changePct !== 0; },
    sort: function(a, b) { return b.changePct - a.changePct; },
    reason: function(s) { return (s.changePct >= 0 ? '+' : '') + s.changePct.toFixed(2) + '% today'; },
    skipScoreFilter: true
  },
  {
    id: 'dividend',
    label: 'Pays Dividends',
    desc: 'Companies that pay you cash just for owning their stock — no selling required.',
    learn: { term: 'Dividend', explain: 'A dividend is a cash payment a company sends to shareholders, usually every quarter. If a company pays a 3% dividend yield and you own $10,000 of its stock, you receive $300/year automatically. Dividends are common in mature, profitable companies like Coca-Cola or JPMorgan. They reward you for holding, not just for the stock going up.' },
    filter: function(s) { return s.dividend > 0; },
    sort: function(a, b) { return b.dividend - a.dividend; },
    reason: function(s) { return s.dividend.toFixed(2) + '% dividend yield — pays you to hold it'; }
  },
  {
    id: 'low52',
    label: 'Near 52-Week Low',
    desc: 'Stocks trading far below their yearly high — potential value or a warning sign.',
    learn: { term: '52-Week Range', explain: 'The 52-week range shows the lowest and highest price a stock has traded at over the past year. A stock near its 52-week low has fallen significantly — sometimes because the business is struggling, sometimes because the whole market sold off unfairly. Learning to tell the difference is one of the most valuable skills in investing.' },
    filter: function(s) { return s.price > 0 && s.week52High > 0 && (s.price / s.week52High) < 0.85; },
    sort: function(a, b) { return (a.price / a.week52High) - (b.price / b.week52High); },
    reason: function(s) { return Math.round((1 - s.price / s.week52High) * 100) + '% below its 52-week high of $' + s.week52High.toFixed(0); },
    skipScoreFilter: true
  },
  {
    id: 'moat',
    label: 'Strong Moat',
    desc: 'Companies so dominant in their industry that competitors struggle to beat them.',
    learn: { term: 'Profit Margin', explain: 'A "moat" is Warren Buffett\'s term for a durable competitive advantage — something that protects a company from competition. High profit margins are one of the strongest signals of a moat: if a company keeps 25%+ of every dollar it earns, it means customers can\'t easily switch to a cheaper alternative. Think Apple, Visa, or Google.' },
    filter: function(s) { return s.margin > 15 && s.score >= 50; },
    sort: function(a, b) { return b.margin - a.margin; },
    reason: function(s) { return s.margin.toFixed(1) + '% profit margin — hard to compete with'; }
  },
  {
    id: 'contrarian',
    label: 'Contrarian Picks',
    desc: 'Lower-scored stocks with one strong signal — the kind of hidden opportunity most investors overlook.',
    learn: { term: 'Market Sentiment', explain: 'Contrarian investing means going against the crowd. When a stock\'s score is low and sentiment is negative, most investors avoid it — but that\'s sometimes exactly when the best opportunities appear. A company with falling stock price but still growing revenue may just be going through a rough patch, not a permanent decline. Warren Buffett built his fortune being greedy when others were fearful.' },
    filter: function(s) { return s.score < 55 && (s.growth > 5 || s.dividend > 1 || (s.week52High > 0 && (s.price / s.week52High) < 0.75)); },
    sort: function(a, b) { return b.growth - a.growth; },
    reason: function(s) {
      if (s.growth > 5) return 'Revenue still growing ' + s.growth.toFixed(1) + '% despite low score — could be temporary weakness';
      if (s.dividend > 1) return s.dividend.toFixed(2) + '% dividend — getting paid while you wait for recovery';
      return Math.round((1 - s.price / s.week52High) * 100) + '% below 52-week high — deeply discounted';
    },
    skipScoreFilter: true
  },
];

function initScreener() {
  renderScreenerGoals();
  if (!_screenerLoaded) loadScreener();
}

function toggleScreener() {
  var body = document.getElementById('screener-body');
  var toggle = document.getElementById('screener-toggle');
  var chevron = document.getElementById('screener-chevron');
  if (!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (toggle) toggle.setAttribute('aria-expanded', String(!isOpen));
  if (chevron) chevron.textContent = isOpen ? '▾' : '▴';
  localStorage.setItem('screener-open', isOpen ? '0' : '1');
}

function restoreScreenerState() {
  if (localStorage.getItem('screener-open') === '1') {
    var body = document.getElementById('screener-body');
    var toggle = document.getElementById('screener-toggle');
    var chevron = document.getElementById('screener-chevron');
    if (body) body.style.display = 'block';
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (chevron) chevron.textContent = '▴';
  }
}

function onScreenerQueryInput() {
  var val = document.getElementById('screener-query-input').value.trim();
  if (!val && _screenerQuery) {
    clearScreenerQuery();
  }
}

function setScreenerQueryChip(text) {
  var input = document.getElementById('screener-query-input');
  if (input) input.value = text;
  // ensure screener body is open so results are visible
  var body = document.getElementById('screener-body');
  var toggle = document.getElementById('screener-toggle');
  var chevron = document.getElementById('screener-chevron');
  if (body && body.style.display === 'none') {
    body.style.display = 'block';
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (chevron) chevron.textContent = '▴';
    localStorage.setItem('screener-open', '1');
  }
  searchScreener();
}

// Parse natural language query → filter spec
function parseScreenerNL(text) {
  var q = text.toLowerCase();
  var f = {};

  // Price ceiling
  var m = q.match(/under\s*\$?\s*(\d+(?:\.\d+)?)|below\s*\$?\s*(\d+(?:\.\d+)?)|less than\s*\$?\s*(\d+(?:\.\d+)?)/);
  if (m) f.maxPrice = parseFloat(m[1] || m[2] || m[3]);
  // Price floor
  m = q.match(/over\s*\$?\s*(\d+(?:\.\d+)?)|above\s*\$?\s*(\d+(?:\.\d+)?)|more than\s*\$?\s*(\d+(?:\.\d+)?)/);
  if (m) f.minPrice = parseFloat(m[1] || m[2] || m[3]);
  // "cheap" without explicit number
  if (!f.maxPrice && /\bcheap\b/.test(q)) f.maxPrice = 30;

  // Score / potential
  if (/big potential|high potential|top rated|strong signal|best score/.test(q)) f.minScore = 65;
  else if (/good potential|decent|moderate/.test(q)) f.minScore = 55;

  // Growth
  if (/fast.grow|high.grow|grow.fast|growth stock/.test(q)) f.minGrowth = 10;

  // Dividend / income
  if (/dividend|income|yield|pays/.test(q)) f.minDividend = 1.0;

  // Safety
  if (/\bsafe\b|low.risk|stable|conservative/.test(q)) f.maxBeta = 1.0;
  if (/high.risk|aggressive|volatile|specul/.test(q)) f.minBeta = 1.3;

  // Profitability
  if (/profitable|profit|margin/.test(q)) f.minMargin = 10;

  // Undervalued
  if (/undervalued|value stock|low p[\/.e]|cheap pe/.test(q)) { f.maxPE = 20; f.minPE = 1; }

  // Sector
  var sectors = [
    [/\btech\b|technology|software|semiconductor/, 'Technology'],
    [/health|pharma|medical|biotech/, 'Healthcare'],
    [/financ|bank|insur/, 'Financials'],
    [/energy|oil\b|gas\b|petro/, 'Energy'],
    [/consumer|retail/, 'Consumer'],
    [/industri|manufactur/, 'Industrials'],
    [/real estate|reit/, 'Real Estate'],
    [/utilit/, 'Utilities'],
  ];
  sectors.forEach(function(pair) {
    if (pair[0].test(q)) f.sector = pair[1];
  });

  return f;
}

function searchScreener() {
  // auto-open screener body if collapsed
  var body = document.getElementById('screener-body');
  var toggle = document.getElementById('screener-toggle');
  var chevron = document.getElementById('screener-chevron');
  if (body && body.style.display === 'none') {
    body.style.display = 'block';
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (chevron) chevron.textContent = '▴';
    localStorage.setItem('screener-open', '1');
  }
  var input = document.getElementById('screener-query-input');
  var text = input ? input.value.trim() : '';
  if (!text) {
    clearScreenerQuery();
    return;
  }
  _screenerQuery = parseScreenerNL(text);
  _screenerQuery._raw = text;
  // Deactivate goal chips — query mode takes over
  _screenerGoal = null;
  renderScreenerGoals();
  var learnEl = document.getElementById('screener-learn-box');
  if (learnEl) learnEl.style.display = 'none';
  if (!_screenerLoaded) {
    // data still loading — it will call renderScreenerResults when ready
    return;
  }
  renderScreenerResults();
}

function clearScreenerQuery() {
  _screenerQuery = null;
  var input = document.getElementById('screener-query-input');
  if (input) input.value = '';
  renderScreenerResults();
}

var _GOAL_TIERS = {
  safe: 0, dividend: 0, growth: 0,
  value: 1, profitable: 1, gaining: 1, low52: 1, moat: 1,
  contrarian: 2
};
var _TIER_LABELS = ['Start here', 'Explore more', 'Advanced'];

function renderScreenerGoals() {
  var el = document.getElementById('screener-goals');
  if (!el) return;
  var tiers = [[], [], []];
  SCREENER_GOALS.forEach(function(g) {
    var t = _GOAL_TIERS[g.id] !== undefined ? _GOAL_TIERS[g.id] : 1;
    tiers[t].push(g);
  });
  el.innerHTML = tiers.map(function(goals, ti) {
    if (goals.length === 0) return '';
    return '<div class="screener-tier">' +
      '<div class="screener-tier-label">' + _TIER_LABELS[ti] + '</div>' +
      '<div class="screener-goals-row">' +
      goals.map(function(g) {
        return '<button class="screener-goal-btn' + (_screenerGoal === g.id ? ' active' : '') + '" onclick="selectScreenerGoal(\'' + g.id + '\')">' +
          g.label + '</button>';
      }).join('') +
      '</div></div>';
  }).join('');
}

function selectScreenerGoal(id) {
  _screenerGoal = _screenerGoal === id ? null : id;
  renderScreenerGoals();
  // Show learn box
  var learnEl = document.getElementById('screener-learn-box');
  if (!learnEl) return;
  if (!_screenerGoal) { learnEl.style.display = 'none'; renderScreenerResults(); return; }
  var goal = SCREENER_GOALS.find(function(g) { return g.id === id; });
  if (!goal) return;
  learnEl.style.display = 'block';
  learnEl.innerHTML =
    '<div class="screener-learn-inner">' +
      '<div class="screener-learn-top">' +
        '<div class="screener-learn-desc">' + goal.desc + '</div>' +
      '</div>' +
      '<div class="screener-learn-concept">' +
        '<span class="screener-learn-key">Key concept:</span> ' +
        '<strong>' + goal.learn.term + '</strong> — ' + goal.learn.explain +
        '<button class="screener-learn-link" onclick="openTerm(\'' + goal.learn.term + '\')">Full definition →</button>' +
      '</div>' +
    '</div>';
  renderScreenerResults();
}

function loadScreener() {
  var statusEl  = document.getElementById('screener-status');
  var resultsEl = document.getElementById('screener-results');
  if (!statusEl || !resultsEl) return;

  statusEl.innerHTML = '<div class="screener-loading">Finding best matches…</div>';

  // Load fundamentals — shared Firestore cache first (24h TTL), then Finnhub
  // Shared cache means only ONE user per day ever hits Finnhub for fundamentals
  function loadAllFundamentals() {
    return db.collection('sharedCache').doc('fundamentals').get()
      .then(function(doc) {
        if (doc.exists) {
          var fund = doc.data();
          if (fund.ts && (Date.now() - fund.ts < 86400000) && fund.data) {
            // Only use cache if we have real data for most stocks (not just zeros)
            var validCount = Object.keys(fund.data).filter(function(k) {
              var d = fund.data[k];
              return d && (d.beta > 0 || d.margin !== 0 || d.growth !== 0 || d.week52High > 0);
            }).length;
            if (validCount >= 80) return fund.data;
          }
        }
        return null;
      })
      .catch(function() { return null; })
      .then(function(cached) {
        if (cached) return cached;

        // Fetch from Finnhub — 1100ms stagger to stay within 60 calls/min rate limit
        // First user pays the cost; result saved to shared cache so no one else has to
        statusEl.innerHTML = '<div class="screener-loading">Loading company data for the first time — takes about 2 min, then stays fast for everyone.</div>';
        var fundMap = {};
        var delay = 0;
        var loaded = 0;
        var promises = SCREENER_POOL.map(function(stock) {
          var d = delay; delay += 1100;
          return new Promise(function(resolve) {
            setTimeout(function() {
              fetch(finnhubUrl('/api/v1/stock/metric', {symbol: stock.symbol, metric: 'all'}))
                .then(function(r) { return r.json(); })
                .then(function(m) {
                  var metrics = m.metric || {};
                  var beta = metrics['beta'] || 0;
                  var margin = metrics['netProfitMarginTTM'] || 0;
                  var growth = metrics['revenueGrowthTTMYoy'] || 0;
                  var pe = metrics['peBasicExclExtraTTM'] || metrics['peTTM'] || 0;
                  var dividend = metrics['dividendYieldIndicatedAnnual'] || 0;
                  var week52High = metrics['52WeekHigh'] || 0;
                  // Only save real data — skip if everything is zero (rate-limited response)
                  if (beta > 0 || margin !== 0 || growth !== 0 || week52High > 0) {
                    fundMap[stock.symbol] = { pe: pe, beta: beta, margin: margin, growth: growth, dividend: dividend, week52High: week52High };
                  }
                  loaded++;
                  if (statusEl) statusEl.innerHTML = '<div class="screener-loading">Loading fundamentals… ' + loaded + '/' + SCREENER_POOL.length + '</div>';
                })
                .catch(function() {}) // skip failed fetches — don't cache zeros
                .then(resolve);
            }, d);
          });
        });

        return Promise.all(promises).then(function() {
          db.collection('sharedCache').doc('fundamentals').set({ ts: Date.now(), data: fundMap }).catch(function() {});
          return fundMap;
        });
      });
  }

  // Fetch prices via shared Firestore cache (2min TTL) — saves Finnhub calls for all users
  loadAllFundamentals().then(function(fundMap) {
    // Build screener data with price=0 first so filtering works on fundamentals
    var lastKnown = JSON.parse(localStorage.getItem('screener-changepct-last') || '{}');
    var results = SCREENER_POOL.map(function(stock) {
      var f = fundMap[stock.symbol] || { pe:0, beta:0, margin:0, growth:0, dividend:0, week52High:0 };
      var changePct = lastKnown[stock.symbol] || 0;
      var score  = calcQuickScore(f.pe, f.beta, f.margin, f.growth, changePct, 0, f.week52High);
      var signal = score >= 65 ? 'Strong' : score >= 50 ? 'Watch' : 'Risky';
      return { symbol: stock.symbol, name: stock.name, sector: stock.sector, price: 0, changePct: changePct, score: score, signal: signal, pe: f.pe, beta: f.beta, margin: f.margin, growth: f.growth, dividend: f.dividend, week52High: f.week52High };
    });
    _screenerData = results;
    _screenerLoaded = true;
    if (statusEl) statusEl.innerHTML = '';
    renderScreenerResults(); // renders immediately; prices fetched per visible set inside renderScreenerResults
  }).catch(function() {
    if (statusEl) statusEl.innerHTML = '<div class="screener-loading">Could not load data. Check your connection.</div>';
  });
}

function calcQuickScore(pe, beta, margin, growth, changePct, price, high52) {
  var score = 50;
  if (pe > 0 && pe < 20) score += 8;
  else if (pe > 0 && pe < 35) score += 4;
  else if (pe > 35) score -= 4;
  if (beta > 0 && beta < 1) score += 6;
  else if (beta >= 1 && beta < 1.5) score += 3;
  else if (beta >= 1.5) score -= 3;
  if (margin > 20) score += 10;
  else if (margin > 10) score += 6;
  else if (margin > 0) score += 2;
  else if (margin < 0) score -= 8;
  if (growth > 15) score += 8;
  else if (growth > 0) score += 4;
  else score -= 4;
  if (changePct > 1) score += 3;
  else if (changePct < -2) score -= 3;
  if (price > 0 && high52 > 0) {
    var pct = price / high52;
    if (pct > 0.9) score += 5;
    else if (pct > 0.75) score += 2;
    else score -= 3;
  }
  return Math.max(10, Math.min(100, Math.round(score)));
}

// Build a human-readable reason string for a query-mode result
function _queryReason(s, f) {
  // Plain-English label
  var labels = [];
  if (f.maxBeta <= 1.0 && f.minDividend > 0) labels.push('Stable dividend payer with low price swings');
  else if (f.maxBeta <= 1.0) labels.push('Moves less than the market — lower volatility');
  else if (f.minDividend > 0) labels.push('Pays regular cash dividends just for owning it');
  if (f.minGrowth > 0) labels.push('Revenue growing fast');
  if (f.minMargin > 0) labels.push('Keeps a large share of every dollar it earns');
  if (f.maxPE > 0 && f.maxPE < 30) labels.push('Priced at reasonable value relative to earnings');
  if (f.minScore >= 65) labels.push('Strong fundamentals across most factors');
  var label = labels.length > 0 ? labels.join(' · ') : (s.score >= 65 ? 'Strong fundamentals overall' : 'Matches your search');
  // Raw numbers
  var nums = [];
  if (f.maxBeta <= 1.0 && s.beta > 0) nums.push('Beta ' + s.beta.toFixed(2));
  if (f.minDividend > 0) nums.push('Dividend ' + s.dividend.toFixed(2) + '%');
  if (f.minGrowth > 0) nums.push('Growth ' + s.growth.toFixed(1) + '%');
  if (f.minMargin > 0) nums.push('Margin ' + s.margin.toFixed(1) + '%');
  if (f.maxPE > 0 && s.pe > 0) nums.push('P/E ' + s.pe.toFixed(1));
  nums.push('Score ' + s.score + '/100');
  return '<span class="screener-reason-label">' + label + '</span>' +
         '<span class="screener-reason-meta">' + nums.join(' · ') + '</span>';
}

function renderScreenerResults() {
  var el = document.getElementById('screener-results');
  if (!el) return;
  if (!_screenerLoaded) return; // still loading

  // ── Query mode ────────────────────────────────────────────────────────────
  if (_screenerQuery) {
    var f = _screenerQuery;
    // Show active query badge above results
    var activeEl = document.getElementById('screener-query-active');
    if (!activeEl) {
      activeEl = document.createElement('div');
      activeEl.id = 'screener-query-active';
      el.parentNode.insertBefore(activeEl, el);
    }
    activeEl.style.display = 'flex';
    activeEl.innerHTML =
      '<span class="sq-label">Search:</span> ' + escHtml(f._raw) +
      '<button class="sq-clear" onclick="clearScreenerQuery()" title="Clear search">✕</button>';

    var data = _screenerData.filter(function(s) {
      if (f.maxPrice > 0 && s.price > 0 && s.price > f.maxPrice) return false;
      if (f.minPrice > 0 && s.price > 0 && s.price < f.minPrice) return false;
      if (f.minScore > 0 && s.score < f.minScore) return false;
      if (f.minGrowth > 0 && s.growth < f.minGrowth) return false;
      if (f.minDividend > 0 && s.dividend < f.minDividend) return false;
      if (f.maxBeta > 0 && s.beta > 0 && s.beta > f.maxBeta) return false;
      if (f.minBeta > 0 && s.beta > 0 && s.beta < f.minBeta) return false;
      if (f.minMargin > 0 && s.margin < f.minMargin) return false;
      if (f.maxPE > 0 && s.pe > 0 && s.pe > f.maxPE) return false;
      if (f.minPE > 0 && s.pe > 0 && s.pe < f.minPE) return false;
      if (f.sector && s.sector.toLowerCase().indexOf(f.sector.toLowerCase()) === -1) return false;
      return true;
    }).sort(function(a, b) { return b.score - a.score; }).slice(0, 12);

    // If price filter but prices not loaded yet, show a note
    var priceFilterActive = (f.maxPrice > 0 || f.minPrice > 0);
    var noPricesYet = priceFilterActive && _screenerData.every(function(s) { return s.price === 0; });

    if (data.length === 0 && !noPricesYet) {
      el.innerHTML = '<div class="screener-empty">No stocks matched "' + escHtml(f._raw) + '" — try adjusting your criteria or use a goal chip below.</div>';
    } else {
      var note = (noPricesYet) ? '<div class="screener-loading">Prices loading — results may update shortly.</div>' : '';
      el.innerHTML = note +
        '<div class="screener-count">Top ' + data.length + ' match' + (data.length === 1 ? '' : 'es') + ' for your search</div>' +
        '<div class="screener-cards">' +
        data.map(function(s) {
          var up = s.changePct >= 0;
          var scoreColor = s.score >= 65 ? 'var(--accent-green)' : s.score >= 50 ? 'var(--accent-gold)' : 'var(--loss)';
          var changeColor = up ? 'var(--accent-green)' : 'var(--loss)';
          return '<div class="screener-card" onclick="quickSearch(\'' + escHtml(s.symbol) + '\')">' +
            '<div class="screener-card-top">' +
              '<div class="screener-card-left">' +
                '<div class="screener-card-ticker">' + escHtml(s.symbol) + '</div>' +
                '<div class="screener-card-name">' + escHtml(s.name) + '</div>' +
              '</div>' +
              '<div class="screener-card-right">' +
                '<div class="screener-card-price" id="sc-price-' + s.symbol + '">' + (s.price > 0 ? '$' + s.price.toFixed(2) : '<span style="color:#64748b">Loading…</span>') + '</div>' +
                '<div class="screener-card-change" id="sc-change-' + s.symbol + '" style="color:' + changeColor + ';">' + (s.price > 0 ? (up ? '+' : '') + s.changePct.toFixed(2) + '%' : '') + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="screener-card-reason">' + _queryReason(s, f) + '</div>' +
            '<div class="screener-card-bottom">' +
              '<span class="screener-card-score" style="color:' + scoreColor + ';">' + s.score + '/100 · ' + s.signal + '</span>' +
              '<span class="screener-card-sector">' + escHtml(s.sector) + '</span>' +
            '</div>' +
          '</div>';
        }).join('') +
        '</div>';
    }

    // Fetch prices for visible stocks
    var token = ++_screenerRenderToken;
    var syms = data.map(function(s) { return s.symbol; });
    getSharedPrices(syms, 120000).then(function(priceMap) {
      if (token !== _screenerRenderToken) return;
      var needRerender = false;
      syms.forEach(function(sym) {
        var qr = priceMap[sym] || {};
        if (!qr.price) return;
        var idx = _screenerData.findIndex(function(s) { return s.symbol === sym; });
        if (idx >= 0) {
          var s = _screenerData[idx];
          var wasZero = s.price === 0;
          var score = calcQuickScore(s.pe, s.beta, s.margin, s.growth, qr.changePct || 0, qr.price, s.week52High);
          _screenerData[idx] = Object.assign({}, s, { price: qr.price, changePct: qr.changePct || 0, score: score, signal: score >= 65 ? 'Strong' : score >= 50 ? 'Watch' : 'Risky' });
          if (wasZero && priceFilterActive) needRerender = true;
        }
        var priceEl = document.getElementById('sc-price-' + sym);
        var changeEl = document.getElementById('sc-change-' + sym);
        if (priceEl) priceEl.textContent = '$' + qr.price.toFixed(2);
        if (changeEl) {
          var up2 = (qr.changePct || 0) >= 0;
          changeEl.textContent = (up2 ? '+' : '') + (qr.changePct || 0).toFixed(2) + '%';
          changeEl.style.color = up2 ? 'var(--accent-green)' : 'var(--loss)';
        }
      });
      // If price filter was active and prices just loaded, re-render to apply it properly
      if (needRerender && token === _screenerRenderToken) renderScreenerResults();
    });
    return;
  }

  // ── Goal mode ─────────────────────────────────────────────────────────────
  var activeEl2 = document.getElementById('screener-query-active');
  if (activeEl2) activeEl2.style.display = 'none';

  if (!_screenerGoal) { el.innerHTML = ''; return; }

  var goal = SCREENER_GOALS.find(function(g) { return g.id === _screenerGoal; });
  if (!goal) return;

  var data2 = _screenerData.filter(function(s) {
    if (!goal.filter(s)) return false;
    if (!goal.skipScoreFilter && s.score < 45) return false;
    return true;
  }).sort(goal.sort).slice(0, 10);

  if (data2.length === 0) {
    var msg = 'No stocks matched right now — market conditions change daily. Try another goal.';
    el.innerHTML = '<div class="screener-empty">' + msg + '</div>';
    return;
  }

  el.innerHTML =
    '<div class="screener-count">Top ' + data2.length + ' match' + (data2.length === 1 ? '' : 'es') + '</div>' +
    '<div class="screener-cards">' +
    data2.map(function(s) {
      var up = s.changePct >= 0;
      var scoreColor = s.score >= 65 ? 'var(--accent-green)' : s.score >= 50 ? 'var(--accent-gold)' : 'var(--loss)';
      var changeColor = up ? 'var(--accent-green)' : 'var(--loss)';
      var reason = goal.reason(s);
      return '<div class="screener-card" onclick="quickSearch(\'' + escHtml(s.symbol) + '\')">' +
        '<div class="screener-card-top">' +
          '<div class="screener-card-left">' +
            '<div class="screener-card-ticker">' + escHtml(s.symbol) + '</div>' +
            '<div class="screener-card-name">' + escHtml(s.name) + '</div>' +
          '</div>' +
          '<div class="screener-card-right">' +
            '<div class="screener-card-price" id="sc-price-' + s.symbol + '">' + (s.price > 0 ? '$' + s.price.toFixed(2) : '<span style="color:#64748b">Loading…</span>') + '</div>' +
            '<div class="screener-card-change" id="sc-change-' + s.symbol + '" style="color:' + changeColor + ';">' + (s.price > 0 ? (up ? '+' : '') + s.changePct.toFixed(2) + '%' : '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="screener-card-reason">' + reason + '</div>' +
        '<div class="screener-card-bottom">' +
          '<span class="screener-card-score" style="color:' + scoreColor + ';">' + s.score + '/100 · ' + s.signal + '</span>' +
          (goal.id === 'contrarian' ? '<span class="screener-card-contrarian">Contrarian</span>' : '<span class="screener-card-sector">' + escHtml(s.sector) + '</span>') +
        '</div>' +
      '</div>';
    }).join('') +
    '</div>';

  // Fetch prices for just the visible stocks, update in-place
  var token2 = ++_screenerRenderToken;
  var visibleSymbols2 = data2.map(function(s) { return s.symbol; });
  getSharedPrices(visibleSymbols2, 120000).then(function(priceMap) {
    if (token2 !== _screenerRenderToken) return;
    visibleSymbols2.forEach(function(sym) {
      var qv = priceMap[sym] || {};
      if (!qv.price) return;
      var idx = _screenerData.findIndex(function(s) { return s.symbol === sym; });
      if (idx >= 0) {
        var s = _screenerData[idx];
        var score = calcQuickScore(s.pe, s.beta, s.margin, s.growth, qv.changePct || 0, qv.price, s.week52High);
        _screenerData[idx] = Object.assign({}, s, { price: qv.price, changePct: qv.changePct || 0, score: score, signal: score >= 65 ? 'Strong' : score >= 50 ? 'Watch' : 'Risky' });
      }
      var priceEl = document.getElementById('sc-price-' + sym);
      var changeEl = document.getElementById('sc-change-' + sym);
      if (priceEl) priceEl.textContent = '$' + qv.price.toFixed(2);
      if (changeEl) {
        var up = (qv.changePct || 0) >= 0;
        changeEl.textContent = (up ? '+' : '') + (qv.changePct || 0).toFixed(2) + '%';
        changeEl.style.color = up ? 'var(--accent-green)' : 'var(--loss)';
      }
    });
  });
}

function setTrendingFilter(filter) {
  currentTrendingFilter = filter;
  document.querySelectorAll('.trend-filter-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  let filtered = allTrendingData;
  if (filter === 'gainers') filtered = allTrendingData.filter(function(r) { return r.changePct > 0; });
  if (filter === 'losers')  filtered = allTrendingData.filter(function(r) { return r.changePct < 0; });
  renderTrending(filtered);
}

function renderTrending(data) {
  let list = document.getElementById('trending-list');
  if (!list) return;
  let prefix = currentTrendingFilter === 'losers'
    ? '<p class="trending-edu-note">A stock falling today isn\'t always a bad sign — tap one to understand why before drawing conclusions.</p>'
    : '';
  if (data.length === 0) { list.innerHTML = prefix + '<div class="trending-loading">No matches.</div>'; return; }
  list.innerHTML = prefix + data.map(function(r) {
    let up = r.changePct >= 0;
    let color = up ? '#128257' : '#dc2626';
    let sign = up ? '+' : '';
    let initials = r.symbol.substring(0, 2).toUpperCase();
    let bigMover = Math.abs(r.changePct) > 5;
    return "<div class='trending-row' onclick='quickSearch(\"" + escHtml(r.symbol) + "\")'>" +
      "<div class='trending-avatar'>" + initials + "</div>" +
      "<div class='trending-left'>" +
        "<div class='trending-symbol'>" + escHtml(r.symbol) + "</div>" +
        "<div class='trending-name'>" + escHtml(r.name) + (bigMover ? "<span class='trending-big-mover'>Big mover — check news</span>" : "") + "</div>" +
      "</div>" +
      "<div class='trending-right'>" +
        "<div class='trending-price'>" + fmt$(r.price) + "</div>" +
        "<div class='trending-change' style='color:" + color + ";'>" + sign + r.changePct.toFixed(2) + "%</div>" +
      "</div>" +
    "</div>";
  }).join('');
}

function _updateTickerEl(selector, text, color) {
  document.querySelectorAll(selector).forEach(function(el) {
    el.textContent = text;
    if (color) el.style.color = color;
  });
}

function _rebuildTickerClone() {
  let tickerContent = document.getElementById("ticker-content");
  let track = tickerContent && tickerContent.parentNode;
  if (!track) return;
  let old = document.getElementById("ticker-clone");
  if (old) old.remove();
  let clone = tickerContent.cloneNode(true);
  clone.id = "ticker-clone";
  clone.setAttribute("aria-hidden", "true");
  track.appendChild(clone);
}

function updateMarketStatus() {
  var dot  = document.querySelector('.ms-dot');
  var txt  = document.getElementById('market-status-text');
  if (!dot || !txt) return;

  // Get current time in US Eastern (handles EST/EDT automatically)
  var now   = new Date();
  var etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  var et    = new Date(etStr);
  var day   = et.getDay();            // 0=Sun … 6=Sat
  var mins  = et.getHours() * 60 + et.getMinutes();

  var weekday   = day >= 1 && day <= 5;
  var open      = weekday && mins >= 570  && mins < 960;   // 9:30–16:00
  var preMarket = weekday && mins >= 240  && mins < 570;   // 4:00–9:30
  var afterHrs  = weekday && mins >= 960  && mins < 1200;  // 16:00–20:00

  if (open) {
    dot.className = 'ms-dot open';
    txt.className = 'open';
    txt.textContent = 'Market Open';
  } else if (preMarket) {
    dot.className = 'ms-dot pre';
    txt.className = 'pre';
    txt.textContent = 'Pre-Market';
  } else if (afterHrs) {
    dot.className = 'ms-dot after';
    txt.className = 'after';
    txt.textContent = 'After Hours';
  } else {
    dot.className = 'ms-dot closed';
    txt.className = '';
    txt.textContent = 'Market Closed';
  }
}

function loadMarketOverview() {
  let indices = [
    { ticker: "SPY", priceKey: "sp500-price", changeKey: "sp500-change" },
    { ticker: "QQQ", priceKey: "nasdaq-price", changeKey: "nasdaq-change" },
    { ticker: "DIA", priceKey: "dow-price", changeKey: "dow-change" },
    { ticker: "GLD", priceKey: "btc-price", changeKey: "btc-change" }
  ];

  // Inject watchlist items into the original content div first
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  let tickerContent = document.getElementById("ticker-content");
  if (tickerContent) {
    tickerContent.querySelectorAll(".wl-bar-item, .wl-bar-divider").forEach(function(el) { el.remove(); });
    watchlist.forEach(function(item) {
      let safeT = escHtml(JSON.stringify(item.ticker));
      let divider = document.createElement("div");
      divider.className = "market-divider wl-bar-divider";
      tickerContent.appendChild(divider);
      let node = document.createElement("div");
      node.className = "market-item wl-bar-item";
      node.setAttribute("onclick", "quickSearch(" + safeT + ")");
      node.innerHTML =
        "<span class='market-name'>" + escHtml(item.ticker) + "</span>" +
        "<span class='market-price' data-wlprice='" + escHtml(item.ticker) + "'>—</span>" +
        "<span class='market-change' data-wlchange='" + escHtml(item.ticker) + "'>—</span>";
      tickerContent.appendChild(node);
    });
  }

  // Clone content now (both copies get "—" placeholders; prices update both via querySelectorAll)
  _rebuildTickerClone();

  // Fetch index + watchlist prices via shared cache
  var allTickerBarSymbols = indices.map(function(idx) { return idx.ticker; }).concat(watchlist.map(function(item) { return item.ticker; }));
  getSharedPrices(allTickerBarSymbols, 60000).then(function(priceMap) {
    indices.forEach(function(index) {
      var data = priceMap[index.ticker] || {};
      var price = data.price, changePct = data.changePct;
      if (!price) return;
      var priceStr = fmt$(price);
      var arrow = changePct >= 0 ? "▲" : "▼";
      var sign = changePct >= 0 ? "+" : "";
      var changeStr = arrow + " " + sign + changePct.toFixed(2) + "%";
      var changeColor = changePct >= 0 ? "#128257" : "#dc2626";
      _updateTickerEl('[data-mid="' + index.priceKey + '"]', priceStr, null);
      _updateTickerEl('[data-mid="' + index.changeKey + '"]', changeStr, changeColor);
    });
    watchlist.forEach(function(item) {
      var data = priceMap[item.ticker] || {};
      var price = data.price, changePct = data.changePct;
      if (!price) return;
      var priceStr = fmt$(price);
      var arrow = changePct >= 0 ? "▲" : "▼";
      var sign = changePct >= 0 ? "+" : "";
      var changeStr = arrow + " " + sign + changePct.toFixed(2) + "%";
      var changeColor = changePct >= 0 ? "#128257" : "#dc2626";
      _updateTickerEl('[data-wlprice="' + item.ticker + '"]', priceStr, null);
      _updateTickerEl('[data-wlchange="' + item.ticker + '"]', changeStr, changeColor);
    });
  });
}

var SECTOR_TICKERS = {
  'Technology':  [{t:'AAPL',n:'Apple'},{t:'MSFT',n:'Microsoft'},{t:'NVDA',n:'NVIDIA'},{t:'GOOGL',n:'Alphabet'},{t:'META',n:'Meta'},{t:'AVGO',n:'Broadcom'},{t:'ORCL',n:'Oracle'},{t:'CRM',n:'Salesforce'},{t:'AMD',n:'AMD'},{t:'INTC',n:'Intel'}],
  'Healthcare':  [{t:'JNJ',n:'Johnson & Johnson'},{t:'UNH',n:'UnitedHealth'},{t:'LLY',n:'Eli Lilly'},{t:'PFE',n:'Pfizer'},{t:'ABBV',n:'AbbVie'},{t:'MRK',n:'Merck'},{t:'TMO',n:'Thermo Fisher'},{t:'ABT',n:'Abbott'},{t:'DHR',n:'Danaher'},{t:'AMGN',n:'Amgen'}],
  'Financials':  [{t:'BRK.B',n:'Berkshire Hathaway'},{t:'JPM',n:'JPMorgan Chase'},{t:'BAC',n:'Bank of America'},{t:'WFC',n:'Wells Fargo'},{t:'GS',n:'Goldman Sachs'},{t:'MS',n:'Morgan Stanley'},{t:'BLK',n:'BlackRock'},{t:'AXP',n:'American Express'},{t:'C',n:'Citigroup'},{t:'SCHW',n:'Charles Schwab'}],
  'Energy':      [{t:'XOM',n:'ExxonMobil'},{t:'CVX',n:'Chevron'},{t:'COP',n:'ConocoPhillips'},{t:'SLB',n:'SLB'},{t:'EOG',n:'EOG Resources'},{t:'MPC',n:'Marathon Petroleum'},{t:'PSX',n:'Phillips 66'},{t:'OXY',n:'Occidental'},{t:'VLO',n:'Valero Energy'},{t:'HAL',n:'Halliburton'}],
  'Consumer':    [{t:'AMZN',n:'Amazon'},{t:'TSLA',n:'Tesla'},{t:'HD',n:'Home Depot'},{t:'MCD',n:"McDonald's"},{t:'NKE',n:'Nike'},{t:'SBUX',n:'Starbucks'},{t:'TGT',n:'Target'},{t:'LOW',n:"Lowe's"},{t:'BKNG',n:'Booking Holdings'},{t:'CMG',n:'Chipotle'}],
  'Industrials': [{t:'CAT',n:'Caterpillar'},{t:'RTX',n:'RTX Corp'},{t:'HON',n:'Honeywell'},{t:'UPS',n:'UPS'},{t:'BA',n:'Boeing'},{t:'GE',n:'GE Aerospace'},{t:'LMT',n:'Lockheed Martin'},{t:'DE',n:'John Deere'},{t:'MMM',n:'3M'},{t:'FDX',n:'FedEx'}],
  'Real Estate': [{t:'PLD',n:'Prologis'},{t:'AMT',n:'American Tower'},{t:'EQIX',n:'Equinix'},{t:'SPG',n:'Simon Property'},{t:'O',n:'Realty Income'},{t:'WELL',n:'Welltower'},{t:'DLR',n:'Digital Realty'},{t:'PSA',n:'Public Storage'},{t:'EXR',n:'Extra Space Storage'},{t:'AVB',n:'AvalonBay'}],
  'Utilities':   [{t:'NEE',n:'NextEra Energy'},{t:'SO',n:'Southern Company'},{t:'DUK',n:'Duke Energy'},{t:'AEP',n:'AEP'},{t:'SRE',n:'Sempra'},{t:'D',n:'Dominion Energy'},{t:'PCG',n:'PG&E'},{t:'EXC',n:'Exelon'},{t:'XEL',n:'Xcel Energy'},{t:'ED',n:'Consolidated Edison'}],
};

var SECTOR_META = {
  'Technology': {
    etf: 'XLK',
    sp500Count: '~65',
    description: 'The Technology sector includes companies that design and manufacture electronics, software, semiconductors, and IT services. It is the largest sector in the S&P 500 by market cap and is driven by innovation, R&D spending, and global adoption of digital products and cloud infrastructure.',
    characteristics: 'High growth, higher valuations (P/E), sensitive to interest rates — rising rates compress future earnings multiples. Tends to lead the market in bull runs.',
    examples: 'Apple, Microsoft, NVIDIA, Alphabet, Meta',
    cyclicality: 'Mixed — software is defensive; hardware is cyclical',
  },
  'Healthcare': {
    etf: 'XLV',
    sp500Count: '~60',
    description: 'The Healthcare sector covers companies involved in medical devices, pharmaceuticals, biotech, health insurance, and hospital systems. Demand for healthcare is largely independent of the economic cycle, making it one of the most defensive sectors.',
    characteristics: 'Defensive and recession-resistant. Driven by aging demographics, drug pipelines, and FDA approval cycles. Biotech is high-risk/high-reward within the sector.',
    examples: 'Johnson & Johnson, UnitedHealth, Eli Lilly, Pfizer, Merck',
    cyclicality: 'Defensive — people need healthcare regardless of the economy',
  },
  'Financials': {
    etf: 'XLF',
    sp500Count: '~70',
    description: 'The Financials sector includes banks, insurance companies, asset managers, and payment networks. It is closely tied to interest rates — banks earn more when rates are high. It also acts as a barometer for overall economic health.',
    characteristics: 'Highly sensitive to interest rates and credit cycles. Benefits from rising rates (wider net interest margins). Vulnerable in recessions due to loan defaults.',
    examples: 'JPMorgan Chase, Berkshire Hathaway, Goldman Sachs, Visa, BlackRock',
    cyclicality: 'Cyclical — closely tied to economic and rate cycles',
  },
  'Energy': {
    etf: 'XLE',
    sp500Count: '~25',
    description: 'The Energy sector includes oil & gas exploration, production, refining, and services. Its performance is tightly linked to global commodity prices — especially crude oil and natural gas — which are driven by supply/demand, geopolitics, and OPEC decisions.',
    characteristics: 'Highly cyclical and commodity-driven. Strong cash flow generators when oil prices are high. Increasingly impacted by the energy transition and ESG investing trends.',
    examples: 'ExxonMobil, Chevron, ConocoPhillips, EOG Resources, SLB',
    cyclicality: 'Cyclical — moves with oil prices and global demand',
  },
  'Consumer': {
    etf: 'XLY',
    sp500Count: '~55',
    description: 'The Consumer Discretionary sector covers goods and services people buy when they have extra money — retail, restaurants, autos, travel, and e-commerce. It includes some of the largest companies in the world by market cap and is highly sensitive to consumer confidence and spending.',
    characteristics: 'Very cyclical — thrives in economic expansions, suffers in downturns as consumers cut discretionary spending. Amazon and Tesla dominate the sector weighting.',
    examples: 'Amazon, Tesla, Home Depot, McDonald\'s, Nike',
    cyclicality: 'Cyclical — tied to consumer confidence and disposable income',
  },
  'Industrials': {
    etf: 'XLI',
    sp500Count: '~75',
    description: 'The Industrials sector includes aerospace & defense, machinery, transportation, construction, and conglomerates. It is the most diverse sector in the S&P 500 and serves as a proxy for overall economic activity — when factories build and goods are shipped, the economy is growing.',
    characteristics: 'Cyclical, tracks GDP growth. Defense subsector is more defensive due to government contracts. Supply chain disruptions and commodity costs are key risks.',
    examples: 'Caterpillar, Boeing, Honeywell, UPS, Lockheed Martin',
    cyclicality: 'Cyclical — tracks manufacturing and economic activity',
  },
  'Real Estate': {
    etf: 'XLRE',
    sp500Count: '~30',
    description: 'The Real Estate sector is dominated by Real Estate Investment Trusts (REITs) — companies that own income-producing properties like offices, data centers, warehouses, and apartments. REITs are required to distribute at least 90% of taxable income as dividends, making them popular income investments.',
    characteristics: 'Sensitive to interest rates — rising rates increase borrowing costs and make dividend yields less attractive vs bonds. Provides income and inflation protection. Subsectors include industrial REITs (data centers, logistics) and residential REITs.',
    examples: 'Prologis, American Tower, Equinix, Simon Property, Realty Income',
    cyclicality: 'Interest rate sensitive — inversely correlated with rate hikes',
  },
  'Utilities': {
    etf: 'XLU',
    sp500Count: '~30',
    description: 'The Utilities sector includes electric, gas, and water companies that operate as regulated monopolies. They provide essential services with predictable, regulated revenue. Known for high, stable dividends and low growth — the classic "safe haven" in market downturns.',
    characteristics: 'Highly defensive and income-focused. Sensitive to interest rates — when rates rise, utility dividends become less attractive vs bonds. Benefiting from the AI data center energy boom.',
    examples: 'NextEra Energy, Southern Company, Duke Energy, Sempra, Dominion Energy',
    cyclicality: 'Defensive — essential services, stable cash flows',
  },
};

function renderSectorAbout(name, changePct) {
  var el = document.getElementById('sector-about');
  if (!el) return;
  var m = SECTOR_META[name];
  if (!m) { el.style.display = 'none'; return; }

  var up = changePct >= 0;
  var color = changePct === 0 ? 'var(--text-muted)' : (up ? 'var(--accent-green, #128257)' : '#dc2626');
  var sign = up ? '+' : '';
  var perfText = changePct !== 0 ? "<span style='color:" + color + ";font-weight:600;'>" + sign + changePct.toFixed(2) + "% today</span>" : '<span style="color:var(--text-muted);">Market closed</span>';

  var items = [
    { label: 'Benchmark ETF', value: m.etf },
    { label: 'S&P 500 Companies', value: m.sp500Count },
    { label: 'Today\'s Performance', value: perfText },
    { label: 'Cyclicality', value: m.cyclicality },
  ];

  el.innerHTML =
    '<h2>ABOUT THIS SECTOR</h2>' +
    '<p class="company-description">' + m.description + '</p>' +
    '<p class="company-description" style="margin-top:8px;"><strong style="color:var(--text);">Key traits:</strong> ' + m.characteristics + '</p>' +
    '<div class="about-grid" style="margin-top:14px;">' +
    items.map(function(i) {
      return "<div class='about-item'><div class='about-label'>" + i.label + "</div><div class='about-value'>" + i.value + "</div></div>";
    }).join('') +
    '</div>';
  el.style.display = 'block';
}

var _sectorPanelState = {};

function showSectorStocks(name) {
  // Save current visibility state of main sections
  ['search-section','results-section','chart-section','news-section'].forEach(function(id) {
    var el = document.getElementById(id);
    _sectorPanelState[id] = el ? el.style.display : '';
    if (el) el.style.display = 'none';
  });

  // Highlight active sector row
  document.querySelectorAll('.sector-row').forEach(function(r) {
    r.classList.toggle('sector-row-active', r.dataset.sector === name);
  });

  var panel = document.getElementById('sector-stocks-panel');
  panel.style.display = 'block';
  document.getElementById('sector-stocks-title').textContent = name;

  // Render about using cached sector changePct if available
  var cachedSectors = localStorage.getItem('sectors-cache');
  var sectorChangePct = 0;
  if (cachedSectors) {
    try {
      var parsed = JSON.parse(cachedSectors);
      var match = (parsed.data || []).find(function(s) { return s.name === name; });
      if (match) sectorChangePct = match.changePct || 0;
    } catch(e) {}
  }
  renderSectorAbout(name, sectorChangePct);

  var tickers = SECTOR_TICKERS[name] || [];
  var list = document.getElementById('sector-stocks-list');
  list.innerHTML = tickers.map(function(s) {
    return '<div class="sector-stock-row" data-ticker="' + s.t + '">' +
      '<div class="sector-stock-left">' +
        '<span class="sector-stock-ticker">' + s.t + '</span>' +
        '<span class="sector-stock-name">' + s.n + '</span>' +
      '</div>' +
      '<div class="sector-stock-right">' +
        '<span class="sector-stock-price">—</span>' +
        '<span class="sector-stock-chg">—</span>' +
        '<button class="sector-stock-btn" onclick="closeSectorPanel(false);quickSearch(\'' + s.t + '\')">Analyze →</button>' +
      '</div>' +
    '</div>';
  }).join('');

  // Fetch quotes via shared cache
  var symbols = tickers.map(function(s) { return s.t; });
  getSharedPrices(symbols, 60000).then(function(priceMap) {
    tickers.forEach(function(s) {
      var q = priceMap[s.t] || {};
      var row = list.querySelector('[data-ticker="' + s.t + '"]');
      if (!row) return;
      var price = q.price || 0;
      var dp = q.changePct || 0;
      var up = dp >= 0;
      var color = up ? 'var(--accent-green, #128257)' : '#dc2626';
      row.querySelector('.sector-stock-price').textContent = price > 0 ? fmt$(price) : '—';
      var chgEl = row.querySelector('.sector-stock-chg');
      chgEl.textContent = price > 0 ? (up ? '+' : '') + dp.toFixed(2) + '%' : '—';
      chgEl.style.color = price > 0 ? color : '';
    });
  });
}

function closeSectorPanel(goBack) {
  document.getElementById('sector-stocks-panel').style.display = 'none';
  document.querySelectorAll('.sector-row').forEach(function(r) { r.classList.remove('sector-row-active'); });
  if (goBack) {
    Object.keys(_sectorPanelState).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = _sectorPanelState[id];
    });
  } else {
    var s = document.getElementById('search-section');
    if (s) s.style.display = '';
  }
  _sectorPanelState = {};
}

function loadSectors() {
  let sectors = [
    { name: 'Technology',    etf: 'XLK' },
    { name: 'Healthcare',    etf: 'XLV' },
    { name: 'Financials',    etf: 'XLF' },
    { name: 'Energy',        etf: 'XLE' },
    { name: 'Consumer',      etf: 'XLY' },
    { name: 'Industrials',   etf: 'XLI' },
    { name: 'Real Estate',   etf: 'XLRE' },
    { name: 'Utilities',     etf: 'XLU' },
  ];
  let cached = localStorage.getItem('sectors-cache');
  if (cached) {
    let p = JSON.parse(cached);
    if (Date.now() - p.ts < 300000) { renderSectors(p.data); return; }
  }
  var etfSymbols = sectors.map(function(s) { return s.etf; });
  getSharedPrices(etfSymbols, 300000).then(function(priceMap) { // 5 min TTL for sectors
    var valid = sectors.map(function(s) {
      var q = priceMap[s.etf] || {};
      return { name: s.name, etf: s.etf, changePct: q.changePct || 0, marketOpen: q.price > 0 };
    }).filter(function(r) { return r !== null; });
    valid.sort(function(a, b) { return b.changePct - a.changePct; });
    localStorage.setItem('sectors-cache', JSON.stringify({ ts: Date.now(), data: valid }));
    renderSectors(valid);
  });
}

function renderSectors(data) {
  let el = document.getElementById('sector-list');
  if (!el) return;
  let allZero = data.every(function(s) { return s.changePct === 0; });
  let maxAbs = Math.max.apply(null, data.map(function(s) { return Math.abs(s.changePct); })) || 1;
  let html = data.map(function(s) {
    let up = s.changePct >= 0;
    let color = allZero ? 'var(--text-muted)' : (up ? '#128257' : '#dc2626');
    let sign = up ? '+' : '';
    let barWidth = allZero ? 50 : Math.round((Math.abs(s.changePct) / maxAbs) * 100);
    let changeLabel = allZero ? '—' : sign + s.changePct.toFixed(2) + '%';
    return '<div class="sector-row" data-sector="' + s.name + '" onclick="showSectorStocks(\'' + s.name + '\')" title="Browse ' + s.name + ' stocks">' +
      '<span class="sector-name">' + s.name + '</span>' +
      '<div class="sector-bar-wrap"><div class="sector-bar-fill" style="width:' + barWidth + '%;background:' + color + ';"></div></div>' +
      '<span class="sector-change" style="color:' + color + ';">' + changeLabel + '</span>' +
    '</div>';
  }).join('');
  if (allZero) html += '<div style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:8px;">Market closed</div>';
  el.innerHTML = html;
}

function quickSearch(ticker) {
  document.getElementById("stock-input").value = ticker;
  searchStock();
}

function shareStockAnalysis() {
  if (!currentTicker) return;
  let url = window.location.origin + window.location.pathname + '?ticker=' + encodeURIComponent(currentTicker);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function() {
      showToast('Link copied! Share ' + currentTicker + ' analysis with anyone.');
    }).catch(function() { fallbackCopy(url); });
  } else {
    fallbackCopy(url);
  }
}

function fallbackCopy(text) {
  let ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('Link copied!');
}

function handleUrlParams() {
  let params = new URLSearchParams(window.location.search);
  let ticker = params.get('ticker');
  if (ticker) {
    document.getElementById('stock-input').value = ticker.toUpperCase();
    searchStock();
  }
}

function toggleDictionary() {
  var drawer = document.getElementById("dict-drawer");
  var overlay = document.getElementById("dict-overlay");
  drawer.classList.toggle("open");
  overlay.classList.toggle("open");
  // Clear search when closing
  if (!drawer.classList.contains("open")) {
    var s = document.getElementById("dict-search");
    if (s) { s.value = ""; filterDictTerms(""); }
  }
}

function filterDictTerms(query) {
  var q = query.trim().toLowerCase();
  var items = document.querySelectorAll("#dict-list .dict-item");
  var categories = document.querySelectorAll("#dict-list .dict-category");
  var noResults = document.getElementById("dict-no-results");
  var visible = 0;

  if (!q) {
    items.forEach(function(el) { el.style.display = ""; });
    categories.forEach(function(el) { el.style.display = ""; });
    if (noResults) noResults.style.display = "none";
    return;
  }

  // Hide all categories first, show only those with matching items
  var visibleCategories = new Set();
  items.forEach(function(el) {
    var termEl = el.querySelector(".dict-term");
    var defEl  = el.querySelector(".dict-def");
    var text = ((termEl ? termEl.textContent : "") + " " + (defEl ? defEl.textContent : "")).toLowerCase();
    if (text.includes(q)) {
      el.style.display = "";
      visible++;
      // Find preceding category
      var prev = el.previousElementSibling;
      while (prev) {
        if (prev.classList.contains("dict-category")) { visibleCategories.add(prev); break; }
        prev = prev.previousElementSibling;
      }
    } else {
      el.style.display = "none";
    }
  });
  categories.forEach(function(el) {
    el.style.display = visibleCategories.has(el) ? "" : "none";
  });
  if (noResults) noResults.style.display = visible === 0 ? "block" : "none";
}

// Map from display label → the term string used in toggleDef / dict-item onclick
var _termMap = {
  // Score factors
  'P/E Ratio':          'P/E Ratio',
  'Razón P/U':          'P/E Ratio',
  'Risk (Beta)':        'Beta',
  'Riesgo (Beta)':      'Beta',
  'Beta':               'Beta',
  'Profit Margin':      'Profit Margin',
  'Margen Neto':        'Profit Margin',
  'Revenue Growth':     'Revenue Growth',
  'Crecimiento':        'Revenue Growth',
  'ROE':                'ROE',
  'Current Ratio':      'Current Ratio',
  'Razón Corriente':    'Current Ratio',
  'Interest Coverage':  'Interest Coverage',
  'Cobertura Int.':     'Interest Coverage',
  'RSI':                'RSI',
  'Moving Average':     'Moving Average',
  'Media Móvil':        'Moving Average',
  'Debt Level':         'Debt to Equity',
  'Nivel de Deuda':     'Debt to Equity',
  '52wk Position':      '52-Week High and Low',
  'Posición 52s':       '52-Week High and Low',
  'News Sentiment':     'Market Sentiment',
  'Noticias':           'Market Sentiment',
  'Price Movement':     'Volume',
  'Movimiento':         'Volume',
  // Fundamentals card
  'Market Cap':         'Market Cap',
  'Cap. Mercado':       'Market Cap',
  'Dividend Yield':     'Dividend',
  'Dividendo':          'Dividend',
  'Profit Margin':      'Profit Margin',
  'Rev. Growth':        'Revenue Growth',
  'Crec. Ingresos':     'Revenue Growth',
  'Next Earnings':      'Earnings Report',
  'Last EPS':           'EPS',
  'Últ. UPA':           'EPS',
  // Cap sizes
  'Large Cap':          'Market Cap Size',
  'Mid Cap':            'Market Cap Size',
  'Small Cap':          'Market Cap Size',
  'Micro Cap':          'Market Cap Size',
  'Market Cap Size':    'Market Cap Size',
  // TAM
  'TAM':                'TAM',
  'Total Addressable Market': 'TAM'
};

function openTerm(label) {
  var termKey = _termMap[label] || label;
  // Open the drawer
  var drawer = document.getElementById("dict-drawer");
  var overlay = document.getElementById("dict-overlay");
  if (!drawer.classList.contains("open")) {
    drawer.classList.add("open");
    overlay.classList.add("open");
  }
  // Find the matching dict-item by its onclick attribute containing the term key
  var items = document.querySelectorAll("#dict-list .dict-item");
  var found = null;
  items.forEach(function(item) {
    var attr = item.getAttribute("onclick") || "";
    if (attr.indexOf("'" + termKey + "'") !== -1 || attr.indexOf('"' + termKey + '"') !== -1) {
      found = item;
    }
  });
  if (!found) {
    // Fallback: partial match
    items.forEach(function(item) {
      if (!found) {
        var termEl = item.querySelector(".dict-term");
        if (termEl && termEl.textContent.toLowerCase().indexOf(termKey.toLowerCase()) !== -1) {
          found = item;
        }
      }
    });
  }
  if (found) {
    // Expand it if not already open
    if (!found.classList.contains("open")) {
      found.click();
    }
    // Scroll to it after a brief delay for the animation
    setTimeout(function() {
      found.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }
}

function toggleDef(item, term) {
  item.classList.toggle("open");
  if (!item.classList.contains("open") || !term) return;
  trackTermViewed(term);
  let aiBox = item.querySelector(".dict-ai-box");
  if (!aiBox || aiBox.dataset.loaded === "1") return;
  aiBox.style.display = "block";
  aiBox.textContent = "Getting AI explanation...";
  let profileCtx = userProfile ? "The reader is a " + userProfile.type + " investor with a " + userProfile.horizon + " time horizon. " : "";
  let stockCtx = currentName ? "They just looked at " + currentName + ". " : "";
  let prompt = "You are StockIQ. Explain \"" + term + "\" in 2-3 sentences for a first-time investor aged 18-25. " +
    profileCtx + stockCtx + "Plain English only. No bullet points. Make it feel relatable.";
  anthropicFetch({ model: "claude-haiku-4-5-20251001", max_tokens: 150, messages: [{ role: "user", content: prompt }] })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.content && data.content[0] && data.content[0].text) {
      aiBox.textContent = data.content[0].text;
      aiBox.dataset.loaded = "1";
    } else {
      aiBox.style.display = "none";
    }
  })
  .catch(function() { aiBox.style.display = "none"; });
}

// ── Multi-portfolio accessors ──────────────────────────────

function getAllPortfolios() {
  return JSON.parse(localStorage.getItem('portfolios') || '{}');
}

function getActiveId() {
  return localStorage.getItem('activePortfolioId') || '';
}

function getActivePortfolio() {
  let all = getAllPortfolios();
  let id = getActiveId();
  return (id && all[id]) ? all[id] : null;
}

function savePortfolios(all) {
  localStorage.setItem('portfolios', JSON.stringify(all));
  saveToFirestore({ portfolios: all, activePortfolioId: getActiveId() });
}

function migrateToMultiPortfolio(legacyStocks, legacyClosed, legacyHistory) {
  // Already migrated
  if (localStorage.getItem('portfolios')) return;
  let stocks = legacyStocks ? migratePortfolio(legacyStocks) : [];
  let closed = legacyClosed || [];
  let history = legacyHistory || [];
  let id = 'port_' + Date.now();
  let all = {};
  all[id] = { name: 'My Portfolio', isDemo: false, stocks: stocks, closedPositions: closed, valueHistory: history };
  localStorage.setItem('portfolios', JSON.stringify(all));
  localStorage.setItem('activePortfolioId', id);
  // Clean up old keys
  localStorage.removeItem('portfolio');
  localStorage.removeItem('closed-positions');
  localStorage.removeItem('portfolio-value-history');
}

function createPortfolio(name, isDemo, stocks) {
  let all = getAllPortfolios();
  let id = 'port_' + Date.now();
  all[id] = { name: name, isDemo: isDemo || false, stocks: stocks || [], closedPositions: [], valueHistory: [] };
  localStorage.setItem('portfolios', JSON.stringify(all));
  localStorage.setItem('activePortfolioId', id);
  saveToFirestore({ portfolios: all, activePortfolioId: id });
  return id;
}

function confirmDeletePortfolio(id) {
  let all = getAllPortfolios();
  let port = all[id];
  if (!port) return;
  let isLast = Object.keys(all).length <= 1;

  let overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:24px;';

  let card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px 24px;max-width:320px;width:100%;text-align:center;';

  let title = document.createElement('div');
  title.style.cssText = 'font-size:16px;font-weight:700;color:var(--text);margin-bottom:8px;';
  title.textContent = 'Delete Portfolio?';

  let desc = document.createElement('div');
  desc.style.cssText = 'font-size:13px;color:var(--text-muted);margin-bottom:24px;';
  desc.innerHTML = isLast
    ? 'This will delete <strong>' + escHtml(port.name) + '</strong> and replace it with a blank portfolio.'
    : 'This will permanently delete <strong>' + escHtml(port.name) + '</strong> and all its holdings. This cannot be undone.';

  let btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';

  let cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'flex:1;background:var(--surface2);color:var(--text);border:1px solid var(--border);';

  let deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.style.cssText = 'flex:1;background:#ef4444;color:white;border:none;';

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(deleteBtn);
  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  cancelBtn.addEventListener('click', function() { overlay.remove(); });
  deleteBtn.addEventListener('click', function() { overlay.remove(); deletePortfolio(id); });
}

function deletePortfolio(id) {
  let all = getAllPortfolios();
  delete all[id];
  let newActive;
  if (Object.keys(all).length === 0) {
    // Last portfolio deleted — auto-create a blank one so user is never stuck
    newActive = 'port_' + Date.now();
    all[newActive] = { name: 'My Portfolio', isDemo: false, stocks: [], closedPositions: [], valueHistory: [] };
  } else {
    newActive = Object.keys(all)[0];
  }
  localStorage.setItem('portfolios', JSON.stringify(all));
  localStorage.setItem('activePortfolioId', newActive);
  // Must use update() not set+merge — merge never removes deleted map keys in Firestore
  replaceInFirestore({ portfolios: all, activePortfolioId: newActive });
  renderPortfolioTabs();
  renderPortfolio();
}

function promptRenamePortfolio(id) {
  let all = getAllPortfolios();
  let port = all[id];
  if (!port) return;

  let overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:24px;';

  let card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px 24px;max-width:320px;width:100%;';

  let input = document.createElement('input');
  input.id = '_rename-input';
  input.type = 'text';
  input.value = port.name;
  input.style.cssText = 'width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:14px;margin-bottom:16px;box-sizing:border-box;';

  let titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:16px;font-weight:700;color:var(--text);margin-bottom:16px;';
  titleEl.textContent = 'Rename Portfolio';

  let btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;';

  let cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'flex:1;background:var(--surface2);color:var(--text);border:1px solid var(--border);';

  let saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = 'flex:1;';

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);
  card.appendChild(titleEl);
  card.appendChild(input);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  setTimeout(function() { input.focus(); input.select(); }, 50);

  cancelBtn.addEventListener('click', function() { overlay.remove(); });
  saveBtn.addEventListener('click', function() {
    let v = input.value.trim();
    overlay.remove();
    if (v) renamePortfolio(id, v);
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { let v = input.value.trim(); overlay.remove(); if (v) renamePortfolio(id, v); }
    if (e.key === 'Escape') { overlay.remove(); }
  });
}

function renamePortfolio(id, name) {
  if (!name || !name.trim()) return;
  let all = getAllPortfolios();
  if (!all[id]) return;
  all[id].name = name.trim();
  savePortfolios(all);
  renderPortfolioTabs();
}

function setActivePortfolio(id) {
  localStorage.setItem('activePortfolioId', id);
  saveToFirestore({ activePortfolioId: id });
  _spyBenchmark = null;
  if (holdingsChartInstance) { holdingsChartInstance.destroy(); holdingsChartInstance = null; }
  // Reset AI section — it belongs to the previous portfolio
  let aiSection = document.getElementById('port-ai-section');
  if (aiSection) aiSection.style.display = 'none';
  let portAiBtn = document.getElementById('port-ai-btn');
  if (portAiBtn) { portAiBtn.style.display = 'none'; portAiBtn.disabled = false; portAiBtn.textContent = 'Analyze My Portfolio with AI'; }
  renderPortfolioTabs();
  renderPortfolio();
}

function promptNewPortfolio() {
  let overlay = document.createElement('div');
  overlay.id = 'new-port-choice-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML =
    '<div style="background:var(--surface);border-radius:16px;padding:28px 24px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.4);">' +
      '<div style="font-size:18px;font-weight:700;margin-bottom:6px;">New Portfolio</div>' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">How do you want to start?</div>' +
      '<button onclick="closeNewPortChoice();openPortfolioWizard();" style="width:100%;padding:14px 16px;border-radius:12px;border:none;background:var(--accent-blue);color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px;text-align:left;">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:6px;opacity:0.9"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Build with guidance' +
        '<div style="font-size:11px;font-weight:400;opacity:0.85;margin-top:2px;">Answer 6 questions — we pick the stocks for you</div>' +
      '</button>' +
      '<button onclick="closeNewPortChoice();promptPaperPortfolio();" style="width:100%;padding:14px 16px;border-radius:12px;border:none;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px;text-align:left;">' +
        '🎮 Paper Trading' +
        '<div style="font-size:11px;font-weight:400;opacity:0.85;margin-top:2px;">Practice with virtual money — no real money at risk</div>' +
      '</button>' +
      '<button onclick="closeNewPortChoice();promptBlankPortfolio();" style="width:100%;padding:14px 16px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:14px;font-weight:600;cursor:pointer;text-align:left;">' +
        'Start blank' +
        '<div style="font-size:11px;font-weight:400;color:var(--text-muted);margin-top:2px;">Add real stocks manually yourself</div>' +
      '</button>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeNewPortChoice(); });
  document.body.appendChild(overlay);
}

function promptPaperPortfolio() {
  let overlay = document.createElement('div');
  overlay.id = 'paper-setup-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML =
    '<div style="background:var(--surface);border-radius:16px;padding:28px 24px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.4);">' +
      '<div style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">🎮 Paper Trading</div>' +
      '<div style="font-size:18px;font-weight:700;margin-bottom:6px;">Set up your virtual account</div>' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">Choose a starting balance. All trades use virtual money — nothing real is at risk.</div>' +
      '<div style="display:flex;align-items:center;border:2px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:8px;" id="paper-amount-wrap">' +
        '<span style="padding:12px 14px;font-size:16px;font-weight:700;color:var(--text-muted);background:var(--surface2);border-right:1px solid var(--border);font-family:var(--mono);flex-shrink:0;" id="paper-prefix">' + (_currency === 'MXN' ? 'MX$' : '$') + '</span>' +
        '<input id="paper-balance-input" type="number" inputmode="numeric" placeholder="' + (_currency === 'MXN' ? '100,000' : '10,000') + '" style="flex:1;border:none;background:none;outline:none;font-size:22px;font-weight:700;color:var(--text);padding:12px 14px;font-family:var(--mono);" oninput="paperBalanceInput(this)">' +
      '</div>' +
      '<div id="paper-balance-hint" style="font-size:12px;color:var(--text-muted);min-height:18px;margin-bottom:16px;"></div>' +
      '<input id="paper-name-input" placeholder="Portfolio name (e.g. My Practice)" style="width:100%;margin-bottom:14px;padding:11px 14px;border-radius:10px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13px;outline:none;">' +
      '<button id="paper-create-btn" onclick="createPaperPortfolio()" disabled style="width:100%;padding:13px;border-radius:10px;border:none;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-size:14px;font-weight:700;cursor:pointer;opacity:0.4;">Start Paper Trading →</button>' +
      '<button onclick="document.getElementById(\'paper-setup-overlay\').remove();" style="width:100%;padding:8px;margin-top:8px;border:none;background:none;color:var(--text-muted);font-size:13px;cursor:pointer;">Cancel</button>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  // Pre-fill a sensible default name
  document.getElementById('paper-name-input').value = 'Paper Trading';
}

function paperBalanceInput(input) {
  var val = parseFloat(input.value);
  var minAmt = _currency === 'MXN' ? 1000 : 100;
  var wrap = document.getElementById('paper-amount-wrap');
  var hint = document.getElementById('paper-balance-hint');
  var btn  = document.getElementById('paper-create-btn');
  if (!val || val < minAmt) {
    if (wrap) wrap.style.borderColor = val > 0 ? '#ef4444' : 'var(--border)';
    if (hint) { hint.textContent = val > 0 ? 'Minimum ' + (_currency === 'MXN' ? 'MX$1,000' : '$100') : ''; hint.style.color = '#ef4444'; }
    if (btn)  btn.style.opacity = '0.4', btn.disabled = true;
  } else {
    if (wrap) wrap.style.borderColor = '#7c3aed';
    var fmt = (_currency === 'MXN' ? 'MX$' : '$') + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (hint) { hint.textContent = fmt + ' virtual starting balance'; hint.style.color = '#7c3aed'; }
    if (btn)  btn.style.opacity = '1', btn.disabled = false;
  }
}

function createPaperPortfolio() {
  var balanceRaw = parseFloat(document.getElementById('paper-balance-input').value);
  var minAmt = _currency === 'MXN' ? 1000 : 100;
  if (!balanceRaw || balanceRaw < minAmt) { showToast('Enter a valid balance'); return; }
  // Store in USD internally
  var balanceUSD = (_currency === 'MXN' && _fxRate > 1) ? balanceRaw / _fxRate : balanceRaw;
  var name = (document.getElementById('paper-name-input').value || '').trim() || 'Paper Trading';
  var overlay = document.getElementById('paper-setup-overlay');
  if (overlay) overlay.remove();

  var all = getAllPortfolios();
  var id = 'port_' + Date.now();
  all[id] = { name: name, isPaper: true, isDemo: false, paperBalance: balanceUSD, startingBalance: balanceUSD, stocks: [], closedPositions: [], valueHistory: [] };
  localStorage.setItem('portfolios', JSON.stringify(all));
  localStorage.setItem('activePortfolioId', id);
  saveToFirestore({ portfolios: all, activePortfolioId: id });
  renderPortfolioTabs();
  renderPortfolio();
  showToast('🎮 Paper portfolio created with ' + (_currency === 'MXN' ? 'MX$' : '$') + Math.round(balanceRaw).toLocaleString('en-US') + ' virtual balance');
}

function closeNewPortChoice() {
  let el = document.getElementById('new-port-choice-overlay');
  if (el) el.remove();
}

function promptBlankPortfolio() {
  let name = prompt('Portfolio name:');
  if (!name || !name.trim()) return;
  createPortfolio(name.trim(), false, []);
  renderPortfolioTabs();
  renderPortfolio();
}

// ── Portfolio Wizard ─────────────────────────────────────────

var _wizardAnswers = {};

var WIZARD_QUESTIONS = [
  {
    id: 'currency',
    q: 'Which currency do you invest in?',
    sub: 'This sets how prices and amounts are shown throughout the app.',
    type: 'currency'
  },
  {
    id: 'goal',
    q: "What's your main goal?",
    sub: 'Pick the one that fits best.',
    options: [
      { value: 'growth',     label: 'Grow my money',        desc: 'I want it to increase in value over time' },
      { value: 'income',     label: 'Get regular income',   desc: 'I want dividends — cash paid to me regularly' },
      { value: 'safe',       label: 'Keep it safe',         desc: 'Slow and steady, I don\'t want big swings' }
    ]
  },
  {
    id: 'horizon',
    q: 'How long can you leave the money invested?',
    sub: 'Longer time = more flexibility to ride out bad days.',
    options: [
      { value: 'short',  label: 'Less than 2 years',  desc: 'I might need it soon' },
      { value: 'mid',    label: '2–5 years',           desc: 'Medium term plan' },
      { value: 'long',   label: '5+ years',            desc: 'Long-term, I\'m patient' }
    ]
  },
  {
    id: 'risk',
    q: 'Your portfolio drops 20% in a month. What do you do?',
    sub: 'Be honest — this helps us match your real comfort level.',
    options: [
      { value: 'low',    label: 'Sell everything',        desc: 'I can\'t handle big losses' },
      { value: 'mid',    label: 'Hold and wait',          desc: 'I\'d be nervous but stay in' },
      { value: 'high',   label: 'Buy more — it\'s a deal', desc: 'Drops are opportunities for me' }
    ]
  },
  {
    id: 'sector',
    q: 'Which sectors excite you?',
    sub: 'Pick one or more — we\'ll include stocks from each. Skip to let us decide.',
    type: 'multi',
    options: [
      { value: 'Technology',  label: '💻 Technology',  desc: 'Software, chips, AI, cloud' },
      { value: 'Healthcare',  label: '🏥 Healthcare',  desc: 'Pharma, biotech, medical devices' },
      { value: 'Consumer',    label: '🛍️ Consumer',    desc: 'Retail, food, travel, entertainment' },
      { value: 'Financials',  label: '🏦 Financials',  desc: 'Banks, insurance, payments' },
      { value: 'Energy',      label: '⚡ Energy',       desc: 'Oil, gas, renewables' },
      { value: 'Industrials', label: '🏭 Industrials', desc: 'Aerospace, defense, manufacturing' },
    ]
  },
  {
    id: 'budget',
    get q() { return 'How much are you starting with?' + (_currency === 'MXN' ? ' (MXN)' : ' (USD)'); },
    sub: 'We\'ll split it evenly across your 5 stocks.',
    type: 'number'
  }
];

function openPortfolioWizard() {
  _wizardAnswers = {};
  _renderWizardStep(0);
}

function _renderWizardStep(step) {
  let existing = document.getElementById('wizard-overlay');
  if (existing) existing.remove();

  let q = WIZARD_QUESTIONS[step];
  let total = WIZARD_QUESTIONS.length;
  let progress = Math.round(((step) / total) * 100);

  let overlay = document.createElement('div');
  overlay.id = 'wizard-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';

  let optionsHtml = '';
  if (q.type === 'currency') {
    var usdActive = (_wizardAnswers.currency || _currency) !== 'MXN';
    var mxnActive = !usdActive;
    optionsHtml =
      '<div style="display:flex;gap:10px;margin:8px 0 24px;">' +
        '<button id="wiz-usd-btn" onclick="_wizardPickCurrency(\'USD\',' + step + ')" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 10px;border-radius:12px;border:2px solid ' + (usdActive ? 'var(--accent-blue)' : 'var(--border)') + ';background:' + (usdActive ? 'rgba(59,130,246,0.08)' : 'var(--surface)') + ';cursor:pointer;">' +
          '<span style="font-size:22px;font-weight:700;color:var(--text);font-family:var(--mono);">$</span>' +
          '<span style="font-size:12px;color:var(--text-muted);">US Dollar</span>' +
          '<span style="font-size:11px;font-weight:700;color:var(--accent-blue);letter-spacing:0.05em;">USD</span>' +
        '</button>' +
        '<button id="wiz-mxn-btn" onclick="_wizardPickCurrency(\'MXN\',' + step + ')" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 10px;border-radius:12px;border:2px solid ' + (mxnActive ? 'var(--accent-blue)' : 'var(--border)') + ';background:' + (mxnActive ? 'rgba(59,130,246,0.08)' : 'var(--surface)') + ';cursor:pointer;">' +
          '<span style="font-size:22px;font-weight:700;color:var(--text);font-family:var(--mono);">$</span>' +
          '<span style="font-size:12px;color:var(--text-muted);">Mexican Peso</span>' +
          '<span style="font-size:11px;font-weight:700;color:var(--accent-blue);letter-spacing:0.05em;">MXN</span>' +
        '</button>' +
      '</div>';
  } else if (q.type === 'number') {
    var minAmt = _currency === 'MXN' ? 1000 : 100;
    var placeholder = _currency === 'MXN' ? 'ej. 20,000' : 'e.g. 1,000';
    var minLabel = _currency === 'MXN' ? 'Mínimo MX$1,000' : 'Minimum $100';
    optionsHtml =
      '<div style="margin:8px 0 24px;">' +
        '<div style="display:flex;align-items:center;border:2px solid var(--border);border-radius:10px;overflow:hidden;transition:border-color 0.15s;" id="wizard-budget-wrap">' +
          '<span style="padding:12px 14px;font-size:16px;font-weight:700;color:var(--text-muted);background:var(--surface2);border-right:1px solid var(--border);font-family:var(--mono);flex-shrink:0;">' + (_currency === 'MXN' ? 'MX$' : '$') + '</span>' +
          '<input id="wizard-budget" type="number" min="' + minAmt + '" inputmode="numeric" placeholder="' + placeholder + '" oninput="_wizardBudgetInput(this)" style="background:none;border:none;outline:none;font-size:22px;font-weight:700;color:var(--text);width:100%;padding:12px 14px;font-family:var(--mono);">' +
        '</div>' +
        '<div id="wizard-budget-hint" style="font-size:12px;margin-top:8px;min-height:18px;color:var(--text-muted);">' + minLabel + ' · We use fractional shares so any amount works</div>' +
      '</div>';
  } else if (q.type === 'multi') {
    var selected = _wizardAnswers[q.id] || [];
    optionsHtml =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 16px;">' +
      q.options.map(function(opt) {
        var isOn = selected.indexOf(opt.value) !== -1;
        return '<button onclick="_wizardToggleMulti(\'' + q.id + '\',\'' + opt.value + '\',' + step + ')" ' +
          'style="padding:10px 12px;border-radius:10px;border:2px solid ' + (isOn ? 'var(--accent-blue)' : 'var(--border)') + ';' +
          'background:' + (isOn ? 'rgba(59,130,246,0.1)' : 'transparent') + ';' +
          'color:var(--text);cursor:pointer;text-align:left;position:relative;">' +
          (isOn ? '<span style="position:absolute;top:7px;right:9px;font-size:11px;color:var(--accent-blue);">✓</span>' : '') +
          '<div style="font-size:13px;font-weight:600;">' + opt.label + '</div>' +
          '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">' + opt.desc + '</div>' +
        '</button>';
      }).join('') +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-muted);margin-bottom:16px;">' +
        (selected.length === 0 ? 'Nothing selected — we\'ll pick the best stocks across all sectors.' :
         selected.length + ' sector' + (selected.length > 1 ? 's' : '') + ' selected') +
      '</div>';
  } else {
    optionsHtml = '<div style="display:flex;flex-direction:column;gap:8px;margin:8px 0 24px;">' +
      q.options.map(function(opt) {
        let selected = _wizardAnswers[q.id] === opt.value;
        return '<button onclick="_wizardSelect(\'' + q.id + '\',\'' + opt.value + '\',' + step + ')" ' +
          'style="padding:12px 14px;border-radius:10px;border:1px solid ' + (selected ? 'var(--accent-blue)' : 'var(--border)') + ';' +
          'background:' + (selected ? 'rgba(59,130,246,0.08)' : 'transparent') + ';' +
          'color:var(--text);cursor:pointer;text-align:left;">' +
          '<div style="font-size:13px;font-weight:600;">' + opt.label + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + opt.desc + '</div>' +
        '</button>';
      }).join('') +
    '</div>';
  }

  let isLast = step === total - 1;
  // Currency step auto-advances on click — no Next button needed
  let hideProceed = q.type === 'currency';
  let canProceed = q.type === 'number'
    ? (!!_wizardAnswers.budget && _wizardAnswers.budget >= ((_currency === 'MXN' ? 1000 : 100) / (_fxRate || 1)))
    : q.type === 'currency' ? !!_wizardAnswers.currency
    : q.type === 'multi' ? true   // sector is optional
    : !!_wizardAnswers[q.id];

  overlay.innerHTML =
    '<div style="background:var(--surface);border-radius:16px;padding:28px 24px;max-width:400px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.4);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Step ' + (step+1) + ' of ' + total + '</div>' +
        '<button onclick="document.getElementById(\'wizard-overlay\').remove();" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;line-height:1;">✕</button>' +
      '</div>' +
      '<div style="height:4px;background:var(--border);border-radius:4px;margin-bottom:20px;">' +
        '<div style="height:4px;background:var(--accent-blue);border-radius:4px;width:' + progress + '%;transition:width 0.3s;"></div>' +
      '</div>' +
      '<div style="font-size:18px;font-weight:700;margin-bottom:4px;">' + q.q + '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">' + q.sub + '</div>' +
      optionsHtml +
      '<div style="display:flex;gap:10px;">' +
        (step > 0 ? '<button onclick="_wizardStep(' + (step-1) + ')" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:14px;font-weight:600;cursor:pointer;">← Back</button>' : '') +
        (!hideProceed ? '<button id="wizard-next-btn" onclick="' + (isLast ? '_wizardFinish()' : '_wizardNext(' + step + ')') + '" ' +
          'style="flex:2;padding:12px;border-radius:10px;border:none;background:var(--accent-blue);color:#fff;font-size:14px;font-weight:600;cursor:pointer;' + (canProceed ? '' : 'opacity:0.4;') + '">' +
          (isLast ? 'Build my portfolio →' : 'Next →') +
        '</button>' : '') +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  if (q.type === 'number' && _wizardAnswers.budget) {
    document.getElementById('wizard-budget').value = _wizardAnswers.budget;
  }
}

function _wizardToggleMulti(qid, value, step) {
  var arr = _wizardAnswers[qid] ? _wizardAnswers[qid].slice() : [];
  var idx = arr.indexOf(value);
  if (idx === -1) { arr.push(value); } else { arr.splice(idx, 1); }
  _wizardAnswers[qid] = arr;
  _renderWizardStep(step);
}

function _wizardPickCurrency(currency, step) {
  _wizardAnswers.currency = currency;
  setCurrency(currency);
  // Re-render with selection highlighted, then auto-advance after brief delay
  _renderWizardStep(step);
  setTimeout(function() { _renderWizardStep(step + 1); }, 350);
}

function _wizardBudgetInput(input) {
  var val = parseFloat(input.value);
  var minAmt = _currency === 'MXN' ? 1000 : 100;
  var wrap = document.getElementById('wizard-budget-wrap');
  var hint = document.getElementById('wizard-budget-hint');
  var nextBtn = document.getElementById('wizard-next-btn');
  if (!val || val < minAmt) {
    if (wrap) wrap.style.borderColor = val > 0 ? '#ef4444' : 'var(--border)';
    if (hint) hint.innerHTML = val > 0
      ? '<span style="color:#ef4444;">Minimum is ' + (_currency === 'MXN' ? 'MX$1,000' : '$100') + '</span>'
      : (_currency === 'MXN' ? 'Mínimo MX$1,000' : 'Minimum $100') + ' · We use fractional shares so any amount works';
    if (nextBtn) nextBtn.style.opacity = '0.4';
  } else {
    if (wrap) wrap.style.borderColor = 'var(--accent-green)';
    var formatted = (_currency === 'MXN' ? 'MX$' : '$') +
      val.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (hint) hint.innerHTML = '<span style="color:var(--accent-green);font-weight:600;">' + formatted + '</span> · We use fractional shares so any amount works';
    if (nextBtn) nextBtn.style.opacity = '1';
  }
}

function _wizardSelect(qid, value, step) {
  _wizardAnswers[qid] = value;
  _renderWizardStep(step); // re-render to show selection
}

function _wizardStep(step) {
  _renderWizardStep(step);
}

function _wizardNext(step) {
  let q = WIZARD_QUESTIONS[step];
  if (q.type === 'currency') {
    if (!_wizardAnswers.currency) { showToast('Please pick a currency'); return; }
    _renderWizardStep(step + 1); return;
  }
  if (q.type === 'multi') {
    _renderWizardStep(step + 1); return;
  }
  if (q.type === 'number') {
    _wizardFinish(); return;
  }
  if (!_wizardAnswers[q.id]) { showToast('Please pick an option'); return; }
  _renderWizardStep(step + 1);
}

function _wizardFinish() {
  let budget = parseFloat(document.getElementById('wizard-budget').value);
  let minAmt = _currency === 'MXN' ? 1000 : 100;
  if (!budget || budget < minAmt) {
    showToast('Minimum is ' + (_currency === 'MXN' ? 'MX$1,000' : '$100'));
    return;
  }
  // Always store budget in USD for stock allocation calculations
  var budgetUSD = _currency === 'MXN' && _fxRate > 1 ? budget / _fxRate : budget;
  _wizardAnswers.budget = budgetUSD;

  // Map answers to profile
  let goalScore    = { growth: 2, income: 0, safe: -2 }[_wizardAnswers.goal] || 0;
  let horizonScore = { short: -2, mid: 0, long: 2 }[_wizardAnswers.horizon] || 0;
  let riskScore    = { low: -2, mid: 0, high: 2 }[_wizardAnswers.risk] || 0;
  let total = goalScore + horizonScore + riskScore;
  let profile = total >= 3 ? 'Aggressive' : total <= -2 ? 'Conservative' : 'Balanced';

  document.getElementById('wizard-overlay').remove();
  _buildWizardPortfolio(profile, _wizardAnswers.budget, _wizardAnswers.sector);
}

function _buildWizardPortfolio(profile, budget, preferredSector) {
  // Show loading overlay
  let overlay = document.createElement('div');
  overlay.id = 'wizard-loading-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML =
    '<div style="background:var(--surface);border-radius:16px;padding:32px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.4);">' +
      '<div style="margin-bottom:16px;color:var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></div>' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:6px;">Building your portfolio…</div>' +
      '<div style="font-size:13px;color:var(--text-muted);">Fetching live prices and scores for the best matches</div>' +
    '</div>';
  document.body.appendChild(overlay);

  // Extended pool weighted by sector preference
  let poolByProfile = {
    Aggressive:   ['NVDA','TSLA','META','AMZN','PLTR','CRWD','AMD','SHOP','HOOD','NET',
                   'SNOW','NOW','PANW','APP','UBER','NFLX','COIN','RBLX','SOFI','ARM'],
    Balanced:     ['AAPL','MSFT','GOOGL','JPM','V','MA','UNH','HD','LLY','ABBV',
                   'MCD','COST','TXN','PEP','TMO','AMGN','BLK','AXP','AVGO','CRM'],
    Conservative: ['KO','PG','JNJ','VZ','MO','PM','CL','SO','DUK','NEE',
                   'WEC','XEL','O','D','AEP','EXC','ED','PFE','MRK','ABT']
  };
  let sectorMap = {
    Technology:  ['AAPL','MSFT','NVDA','GOOGL','META','AMD','AVGO','CRM','ADBE','QCOM','NOW','PANW','CRWD','PLTR','ARM','SNOW'],
    Healthcare:  ['JNJ','UNH','LLY','PFE','ABBV','MRK','TMO','AMGN','GILD','BMY','ISRG','MDT','REGN','VRTX','HCA'],
    Consumer:    ['AMZN','TSLA','NFLX','UBER','HD','MCD','NKE','SBUX','WMT','COST','KO','PEP','DIS','BKNG','CMG'],
    Financials:  ['JPM','BAC','WFC','GS','MS','BLK','AXP','V','MA','C','SCHW','COF','PGR','ICE','CME']
  };

  let basePool = poolByProfile[profile] || poolByProfile['Balanced'];
  // If sector preferences, interleave stocks from each selected sector at the front
  let pool = basePool.slice();
  var sectors = Array.isArray(preferredSector) ? preferredSector : (preferredSector && preferredSector !== 'none' ? [preferredSector] : []);
  if (sectors.length > 0) {
    var sectorStocks = [];
    sectors.forEach(function(s) {
      if (sectorMap[s]) {
        sectorMap[s].forEach(function(t) { if (sectorStocks.indexOf(t) === -1) sectorStocks.push(t); });
      }
    });
    sectorStocks = sectorStocks.filter(function(t) { return pool.indexOf(t) === -1; });
    pool = sectorStocks.concat(pool);
  }
  pool = pool.slice(0, 25); // cap at 25 to keep fetch time reasonable

  let criteria = {
    Aggressive:   { minBeta: 0.8, maxBeta: 99, minScore: 48 },
    Balanced:     { minBeta: 0.4, maxBeta: 1.8, minScore: 50 },
    Conservative: { minBeta: 0.0, maxBeta: 1.2, minScore: 46 }
  };
  let c = criteria[profile];
  let today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Fetch quotes + metrics for candidates
  var candidateSymbols = pool;
  getSharedPrices(candidateSymbols, 120000).then(function(priceMap) {
    var metricPromises = pool.map(function(ticker, idx) {
      return new Promise(function(resolve) { setTimeout(resolve, idx * 150); })
        .then(function() {
          return fetch(finnhubUrl('/api/v1/stock/metric', {symbol: ticker, metric: 'all'}))
            .then(function(r) { return r.json(); })
            .catch(function() { return {}; });
        })
        .then(function(data) {
          var m = data.metric || {};
          var q = priceMap[ticker] || {};
          var price = q.price || 0;
          if (!price) return null;
          var beta = m['beta'] || 1;
          if (beta < c.minBeta || beta > c.maxBeta) return null;
          var scored = calculateScore(q.changePct || 0, m['52WeekHigh'] || 0, price, m['peBasicExclExtraTTM'] || 0, m, 5, null, null);
          if (scored.total < c.minScore) return null;
          var margin = m['netProfitMarginTTM'] || 0;
          var growth = m['revenueGrowthTTMYoy'] || 0;
          return { ticker: ticker, price: price, score: scored.total, beta: beta, margin: margin, growth: growth };
        })
        .catch(function() { return null; });
    });

    Promise.all(metricPromises).then(function(results) {
      var valid = results.filter(function(r) { return r !== null; });
      valid.sort(function(a, b) { return b.score - a.score; });

      // Try to include at least 1-2 from preferred sector
      var top5 = valid.slice(0, 5);
      if (top5.length < 3) {
        // Fallback defaults — fetch live prices first
        var fallbackTickers = ['AAPL', 'MSFT', 'JPM', 'V', 'KO'];
        getSharedPrices(fallbackTickers, 120000).then(function(pm) {
          top5 = fallbackTickers.map(function(t, i) {
            return { ticker: t, price: (pm[t] || {}).price || 0, score: [70, 70, 65, 65, 60][i] };
          });
          document.getElementById('wizard-loading-overlay').remove();
          _showWizardPreview(top5, budget, profile, today);
        });
        return;
      }

      document.getElementById('wizard-loading-overlay').remove();
      _showWizardPreview(top5, budget, profile, today);
    });
  });
}

var _wizardFinalPicks = [];
var _wizardFinalBudget = 0;

function _showWizardPreview(picks, budget, profile, today) {
  _wizardFinalPicks = picks;
  _wizardFinalBudget = budget;

  var profileDesc = {
    Aggressive:   'High Growth',
    Balanced:     'Balanced',
    Conservative: 'Conservative'
  }[profile] || 'Balanced';

  var profileColor = {
    Aggressive: '#f59e0b',
    Balanced:   '#3b82f6',
    Conservative: '#128257'
  }[profile] || '#3b82f6';

  var perStock = budget / picks.length;

  // Fetch stock names from screener pool or fallback
  var nameMap = {};
  SCREENER_POOL.forEach(function(s) { nameMap[s.symbol] = s.name; });

  var overlay = document.createElement('div');
  overlay.id = 'wizard-preview-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:flex-end;justify-content:center;padding:0;';

  var picksHtml = picks.map(function(p) {
    var name = nameMap[p.ticker] || p.ticker;
    var shares = p.price > 0 ? (perStock / p.price).toFixed(2) : '—';
    var scoreColor = p.score >= 65 ? '#128257' : p.score >= 50 ? '#c17d08' : '#dc2626';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">' +
      '<div>' +
        '<div style="font-size:14px;font-weight:700;">' + p.ticker + ' <span style="font-size:12px;font-weight:400;color:var(--text-muted);">· ' + escHtml(name) + '</span></div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + (p.price > 0 ? shares + ' shares @ $' + p.price.toFixed(2) : 'Price loading…') + '</div>' +
      '</div>' +
      '<span style="font-size:11px;font-weight:600;color:' + scoreColor + ';background:' + scoreColor + '22;padding:3px 8px;border-radius:8px;">' + p.score + '/100</span>' +
    '</div>';
  }).join('');

  overlay.innerHTML =
    '<div style="background:var(--surface);border-radius:20px 20px 0 0;padding:28px 24px 32px;max-width:480px;width:100%;box-shadow:0 -8px 32px rgba(0,0,0,0.4);max-height:90vh;overflow-y:auto;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
        '<div style="font-size:18px;font-weight:700;">Your portfolio preview</div>' +
        '<button onclick="document.getElementById(\'wizard-preview-overlay\').remove();" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">✕</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">' +
        '<span style="font-size:12px;font-weight:600;color:' + profileColor + ';background:' + profileColor + '22;padding:4px 10px;border-radius:20px;">' + profileDesc + ' profile</span>' +
        '<span style="font-size:12px;color:var(--text-muted);">$' + budget.toLocaleString() + ' · 5 stocks</span>' +
      '</div>' +
      picksHtml +
      '<div style="font-size:11px;color:var(--text-muted);margin:14px 0 20px;">Prices are live. Shares are fractional — most brokers support this.</div>' +
      '<button onclick="_wizardCreatePortfolio(\'' + profile + '\',\'' + today + '\')" style="width:100%;padding:14px;border-radius:12px;border:none;background:var(--accent-blue);color:#fff;font-size:15px;font-weight:700;cursor:pointer;">Create this portfolio</button>' +
      '<button onclick="document.getElementById(\'wizard-preview-overlay\').remove();" style="width:100%;padding:12px;border-radius:12px;border:none;background:transparent;color:var(--text-muted);font-size:13px;cursor:pointer;margin-top:8px;">Start over</button>' +
    '</div>';

  document.body.appendChild(overlay);
}

function _wizardCreatePortfolio(profile, today) {
  var budget = _wizardFinalBudget;
  var picks = _wizardFinalPicks;
  var perStock = budget / picks.length;

  var stocks = picks.map(function(p) {
    var shares = p.price > 0 ? Math.max(0.01, parseFloat((perStock / p.price).toFixed(2))) : 1;
    var price = p.price > 0 ? parseFloat(p.price.toFixed(2)) : perStock;
    return { ticker: p.ticker, lots: [{ shares: shares, price: price, date: today }] };
  });

  var name = profile + ' Portfolio';
  createPortfolio(name, true, stocks);
  document.getElementById('wizard-preview-overlay').remove();
  renderPortfolioTabs();
  renderPortfolio();
  showToast('Portfolio created — ' + picks.map(function(p) { return p.ticker; }).join(', '));
}

function openPortfolioMenu(id) {
  // Remove any existing menu
  let existing = document.getElementById('port-tab-menu-popup');
  if (existing) { existing.remove(); return; }
  let all = getAllPortfolios();
  let port = all[id];
  if (!port) return;
  let menu = document.createElement('div');
  menu.id = 'port-tab-menu-popup';
  menu.className = 'port-tab-menu-popup';
  menu.innerHTML =
    '<button onclick="document.getElementById(\'port-tab-menu-popup\').remove();promptRenamePortfolio(\'' + id + '\');">Rename</button>' +
    '<button onclick="document.getElementById(\'port-tab-menu-popup\').remove();confirmDeletePortfolio(\'' + id + '\');" style="color:#ef4444;">Delete</button>';
  let btn = document.getElementById('port-menu-btn-' + id);
  if (btn) { btn.parentNode.appendChild(menu); }
  else { document.getElementById('portfolio-tabs-bar').appendChild(menu); }
  // Close on outside click
  setTimeout(function() {
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', handler); }
    });
  }, 0);
}

function renderPortfolioTabs() {
  let bar = document.getElementById('portfolio-tabs-bar');
  if (!bar) return;
  let all = getAllPortfolios();
  let activeId = getActiveId();
  let tabs = Object.keys(all).map(function(id) {
    let p = all[id];
    let isActive = id === activeId;
    let demoTag = p.isDemo ? '<span class="port-tab-demo-tag">&#9679;</span>' : '';
    let paperTag = p.isPaper ? '<span class="port-tab-paper-tag">&#127918;</span>' : '';
    return '<button class="port-tab' + (isActive ? ' active' : '') + '" onclick="setActivePortfolio(\'' + id + '\')">' +
      demoTag + paperTag + escHtml(p.name) +
      (isActive ? '<span class="port-tab-menu-btn" id="port-menu-btn-' + id + '" onclick="event.stopPropagation();openPortfolioMenu(\'' + id + '\')">···</span>' : '') +
    '</button>';
  }).join('');
  bar.innerHTML = tabs + '<button class="port-tab-add" onclick="promptNewPortfolio()" title="New portfolio">+</button>';
}

// Pool of candidates per profile — scored live, top 5 selected
let CANDIDATE_POOL = {
  Aggressive: ['NVDA','TSLA','META','AMZN','PLTR','CRWD','AMD','SHOP','COIN','MSTR',
               'RBLX','HOOD','SOFI','RIVN','LCID','APP','DKNG','ROKU','NET','SNOW'],
  Balanced:   ['AAPL','MSFT','GOOGL','JPM','V','MA','UNH','HD','BRK.B','LLY',
               'ABBV','MCD','COST','TXN','ACN','PEP','TMO','AMGN','IBM','INTC'],
  Conservative:['KO','PG','JNJ','VZ','T','MO','PM','CL','GIS','K',
                'SO','DUK','ED','D','NEE','WEC','XEL','O','SCHD','VYM']
};

function createDemoPortfolio(profileType, budget) {
  let alreadyHasDemo = Object.values(getAllPortfolios()).some(function(p) { return p.isDemo; });
  if (alreadyHasDemo) return;
  let pool = CANDIDATE_POOL[profileType] || CANDIDATE_POOL['Balanced'];
  let b = budget || 2500;
  let today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Score criteria per profile
  let criteria = {
    Aggressive:   { minBeta: 1.0, maxBeta: 99,  minScore: 50 },
    Balanced:     { minBeta: 0.5, maxBeta: 1.6,  minScore: 52 },
    Conservative: { minBeta: 0.0, maxBeta: 1.1,  minScore: 48 }
  };
  let c = criteria[profileType] || criteria['Balanced'];

  showToast('Building your Recommended Portfolio…');

  // Fetch quote + metrics for all candidates in parallel (staggered)
  Promise.all(pool.map(function(ticker, idx) {
    return new Promise(function(resolve) { setTimeout(resolve, idx * 80); })
      .then(function() {
        return Promise.all([
          fetch(finnhubUrl('/api/v1/quote', {symbol: ticker})).then(function(r) { return r.json(); }).catch(function() { return {}; }),
          fetch(finnhubUrl('/api/v1/stock/metric', {symbol: ticker, metric: 'all'})).then(function(r) { return r.json(); }).catch(function() { return {}; })
        ]);
      })
      .then(function(results) {
        let q = results[0], m = results[1].metric || {};
        let price = q.c || 0;
        if (!price) return null;
        let beta = m['beta'] || 1;
        if (beta < c.minBeta || beta > c.maxBeta) return null;
        // Quick score using available data (no RSI/MA50 needed for selection)
        let scored = calculateScore(q.dp || 0, m['52WeekHigh'] || 0, price, m['peBasicExclExtraTTM'] || 0, m, 5, null, null);
        if (scored.total < c.minScore) return null;
        return { ticker: ticker, price: price, score: scored.total, beta: beta };
      })
      .catch(function() { return null; });
  })).then(function(results) {
    let valid = results.filter(function(r) { return r !== null; });
    // Sort by score descending, pick top 5
    valid.sort(function(a, b) { return b.score - a.score; });
    let top5 = valid.slice(0, 5);

    let buildPortfolio = function(finalTop5) {
      let perStock = b / finalTop5.length;
      let stocks = finalTop5.map(function(s) {
        let shares = s.price > 0 ? Math.max(0.01, parseFloat((perStock / s.price).toFixed(2))) : 1;
        return { ticker: s.ticker, lots: [{ shares: shares, price: parseFloat(s.price.toFixed(2)), date: today }] };
      });
      createPortfolio('Recommended Portfolio', true, stocks);
      showToast('Recommended Portfolio ready — ' + finalTop5.map(function(s) { return s.ticker; }).join(', '));
    };

    if (top5.length === 0) {
      // Fallback: fetch live prices for default balanced stocks
      let fallbackTickers = ['AAPL', 'MSFT', 'JPM', 'V', 'KO'];
      Promise.all(fallbackTickers.map(function(ticker, idx) {
        return new Promise(function(resolve) { setTimeout(resolve, idx * 120); })
          .then(function() {
            return fetch(finnhubUrl('/api/v1/quote', {symbol: ticker})).then(function(r) { return r.json(); }).catch(function() { return {}; });
          })
          .then(function(q) { return { ticker: ticker, price: q.c || 0, score: 0, beta: 1 }; });
      })).then(buildPortfolio);
    } else {
      buildPortfolio(top5);
    }
  });
}

// ── END multi-portfolio accessors ──────────────────────────

// Migrate old single-lot format to multi-lot format
function migratePortfolio(portfolio) {
  return portfolio.map(function(item) {
    if (!item.lots) {
      return { ticker: item.ticker, lots: [{ shares: item.shares, price: item.buyPrice, date: item.buyDate || '' }] };
    }
    return item;
  });
}

function addToPortfolio() {
  // Thesis is mandatory
  var thesis = getSelectedThesis();
  if (!thesis) {
    var sel = document.getElementById('thesis-selector');
    if (sel) { sel.classList.add('thesis-required'); setTimeout(function() { sel.classList.remove('thesis-required'); }, 700); }
    showToast('Pick a reason before adding');
    return;
  }

  var ticker = document.getElementById('port-ticker').value.trim().toUpperCase();
  var shares = parseFloat(document.getElementById('port-shares').value);
  var buyPrice = parseFloat(document.getElementById('port-price').value);
  if (!ticker || !shares || !buyPrice) { showToast('Please fill in all fields!'); return; }

  // Check if thesis conflicts with the stock's actual data
  var mismatch = checkThesisMismatch(ticker, thesis);
  if (mismatch) {
    showThesisChallenge(mismatch);
    return;
  }

  _doAddToPortfolio();
}

function _doAddToPortfolio() {
  var thesis = getSelectedThesis();
  var reasoning = (document.getElementById('thesis-reasoning-input') || {}).value || '';
  dismissThesisChallenge();

  let ticker = document.getElementById('port-ticker').value.trim().toUpperCase();
  let shares = parseFloat(document.getElementById('port-shares').value);
  let buyPrice = parseFloat(document.getElementById('port-price').value);
  let dateVal = document.getElementById('port-date').value;
  let buyDate = dateVal ? new Date(dateVal + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!ticker || !shares || !buyPrice) { showToast('Please fill in all fields!'); return; }
  let all = getAllPortfolios();
  let id = getActiveId();
  if (!all[id]) return;

  // Paper trading: validate + deduct from virtual balance
  if (all[id].isPaper) {
    let rate = (typeof _fxRate !== 'undefined' ? _fxRate : 1);
    let costUSD = shares * buyPrice;
    let balUSD = all[id].paperBalance || 0;
    if (costUSD > balUSD + 0.01) {
      let balDisplay = _currency === 'MXN' ? 'MX$' + Math.round(balUSD * rate).toLocaleString('en-US') : '$' + Math.round(balUSD).toLocaleString('en-US');
      showToast('Insufficient virtual balance (' + balDisplay + ' remaining)');
      return;
    }
    all[id].paperBalance = Math.max(0, balUSD - costUSD);
  }

  let lot = { shares, price: buyPrice, date: buyDate, thesis: thesis };
  if (reasoning) lot.reasoning = reasoning;

  let portfolio = migratePortfolio(all[id].stocks || []);
  let existing = portfolio.find(function(i) { return i.ticker === ticker; });
  if (existing) {
    existing.lots.push(lot);
    showToast('Added new lot to ' + ticker);
  } else {
    portfolio.push({ ticker, lots: [lot] });
  }
  all[id].stocks = portfolio;
  savePortfolios(all);
  _spyBenchmark = null;
  document.getElementById('port-ticker').value = '';
  document.getElementById('port-shares').value = '';
  document.getElementById('port-price').value = '';
  document.getElementById('port-date').value = '';
  clearThesisSelection();
  addXP(5); // +5 XP for adding to portfolio
  // IQ Vault — deduct purchase cost (price is in USD, convert to MXN)
  var _vRate = (typeof _fxRate !== 'undefined' && _fxRate > 1) ? _fxRate : 17.5;
  vaultDebit(shares * buyPrice * _vRate, ticker, shares, buyPrice);
  if (!localStorage.getItem('first-portfolio-done')) {
    localStorage.setItem('first-portfolio-done', '1');
    dismissFirstPortfolioBanner();
    showToast('Your portfolio has started!');
  }
  renderPortfolio();
}

function removeFromPortfolio(ticker) {
  let all = getAllPortfolios();
  let id = getActiveId();
  if (!all[id]) return;
  all[id].stocks = migratePortfolio(all[id].stocks || []).filter(function(i) { return i.ticker !== ticker; });
  savePortfolios(all);
  renderPortfolio();
}

function removeLotFromPortfolio(ticker, lotIndex) {
  let all = getAllPortfolios();
  let id = getActiveId();
  if (!all[id]) return;
  let portfolio = migratePortfolio(all[id].stocks || []);
  let item = portfolio.find(function(i) { return i.ticker === ticker; });
  if (!item) return;
  item.lots.splice(lotIndex, 1);
  if (item.lots.length === 0) portfolio = portfolio.filter(function(i) { return i.ticker !== ticker; });
  all[id].stocks = portfolio;
  savePortfolios(all);
  renderPortfolio();
}

function maybeShowPaperTradingNudge() {
  var el = document.getElementById('paper-trading-nudge');
  if (!el) return;
  if (localStorage.getItem('paper-nudge-done')) { el.style.display = 'none'; return; }
  var profile = JSON.parse(localStorage.getItem('userProfile') || 'null');
  if (!profile || profile.goal !== 'learn') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML =
    '<div class="paper-nudge-inner">' +
      '<button class="paper-nudge-close" onclick="localStorage.setItem(\'paper-nudge-done\',\'1\');document.getElementById(\'paper-trading-nudge\').style.display=\'none\'">✕</button>' +
      '<div class="paper-nudge-title">Ready to practice for real?</div>' +
      '<p class="paper-nudge-desc">Paper Trading lets you buy and sell stocks with virtual money — no risk, real market prices.</p>' +
      '<button class="paper-nudge-btn" onclick="localStorage.setItem(\'paper-nudge-done\',\'1\');document.getElementById(\'paper-trading-nudge\').style.display=\'none\';promptPaperPortfolio()">Try Paper Trading →</button>' +
    '</div>';
}

function renderPortfolio() {
  maybeShowPaperTradingNudge();
  renderPortfolioTabs();
  let active = getActivePortfolio();
  let portfolio = active ? migratePortfolio(active.stocks || []) : [];
  let empty = document.getElementById('portfolio-empty');
  let list = document.getElementById('portfolio-list');
  let summary = document.getElementById('portfolio-summary');
  if (portfolio.length === 0) {
    empty.style.display = 'flex'; list.innerHTML = ''; summary.style.display = 'none';
    var psBar = document.getElementById('port-summary-bar');
    if (psBar) psBar.style.display = 'none';
    if (portfolioChartInstance) { portfolioChartInstance.destroy(); portfolioChartInstance = null; }
    let chartSection = document.getElementById('portfolio-chart-section');
    if (chartSection) chartSection.style.display = 'none';
    let portAiBtn = document.getElementById('port-ai-btn');
    if (portAiBtn) portAiBtn.style.display = 'none';
    let exportBtn = document.getElementById('port-export-btn');
    if (exportBtn) exportBtn.style.display = 'none';
    let winnersCard = document.getElementById('port-winners-card');
    if (winnersCard) winnersCard.style.display = 'none';
    var earningsCalEl = document.getElementById('port-earnings-calendar');
    if (earningsCalEl) earningsCalEl.style.display = 'none';
    let searchWrap = document.getElementById('port-search-wrap');
    if (searchWrap) searchWrap.style.display = 'none';
    portfolioStockData = [];
    return;
  }
  empty.style.display = 'none';
  summary.style.display = 'block';
  let totalValue = 0, totalCost = 0, totalDayChange = 0;
  let scores = [], stockData = [], failedTickers = [];
  // Pre-compute lot totals so we can use them in the price callback
  let lotTotals = portfolio.map(function(item) {
    let totalShares = item.lots.reduce(function(sum, l) { return sum + l.shares; }, 0);
    let totalLotCost = item.lots.reduce(function(sum, l) { return sum + l.shares * l.price; }, 0);
    let avgPrice = totalShares > 0 ? totalLotCost / totalShares : 0;
    return { totalShares: totalShares, totalLotCost: totalLotCost, avgPrice: avgPrice };
  });
  var portSymbols = portfolio.map(function(item) { return item.ticker; });
  getSharedPrices(portSymbols, 60000).then(function(priceMap) {
    portfolio.forEach(function(item, idx) {
      var lt = lotTotals[idx];
      var q = priceMap[item.ticker] || {};
      var currentPrice = q.price || lt.avgPrice;
      var value = currentPrice * lt.totalShares;
      var cost = lt.totalLotCost;
      var gain = value - cost;
      var gainPct = cost > 0 ? ((gain / cost) * 100) : 0;
      // q.change is Finnhub's q.d (dollar change). Fall back to calculating from changePct if missing.
      var dayChangePer = q.change || (q.changePct && currentPrice > 0 ? (q.changePct / 100) * (currentPrice / (1 + q.changePct / 100)) : 0);
      var dayChangeAmt = dayChangePer * lt.totalShares;
      totalValue += value; totalCost += cost; totalDayChange += dayChangeAmt;
      var histScore = JSON.parse(localStorage.getItem('history_score_' + item.ticker) || '[]');
      var score = histScore.length > 0 ? histScore[histScore.length - 1].score : null;
      if (score) scores.push(score);
      if (!q.price) failedTickers.push(item.ticker);
      stockData.push({ ticker: item.ticker, lots: item.lots, shares: lt.totalShares, buyPrice: lt.avgPrice, currentPrice: currentPrice, value: value, cost: cost, gain: gain, gainPct: gainPct, dayChangeAmt: dayChangeAmt, score: score });
    });
  }).then(function() {
    let totalGain = totalValue - totalCost;
    let totalGainPct = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
    let avgScore = scores.length > 0 ? Math.round(scores.reduce(function(a, b) { return a + b; }, 0) / scores.length) : null;
    let gainColor = totalGain >= 0 ? '#128257' : '#dc2626';
    let dayColor = totalDayChange >= 0 ? '#128257' : '#dc2626';

    // Summary bar
    var psBar = document.getElementById('port-summary-bar');
    if (psBar) {
      psBar.style.display = 'flex';
      var psInvested = document.getElementById('psb-invested');
      var psMktval  = document.getElementById('psb-mktval');
      var psGain    = document.getElementById('psb-gain');
      var psGainPct = document.getElementById('psb-gain-pct');
      if (psInvested) psInvested.textContent = fmt$(totalCost);
      if (psMktval)   psMktval.textContent   = fmt$(totalValue);
      if (psGain)   { psGain.textContent = fmtSigned$(totalGain); psGain.style.color = gainColor; }
      if (psGainPct){ psGainPct.textContent = (totalGainPct >= 0 ? '+' : '') + totalGainPct.toFixed(2) + '%'; psGainPct.style.color = gainColor; }
    }

    document.getElementById('port-total-value').textContent = fmt$(totalValue);
    let costEl = document.getElementById('port-total-cost');
    if (costEl) costEl.textContent = 'Cost ' + fmt$(totalCost);
    document.getElementById('port-total-gain').textContent = fmtSigned$(totalGain);
    document.getElementById('port-total-gain').style.color = gainColor;
    document.getElementById('port-total-pct').textContent = (totalGainPct >= 0 ? '+' : '') + totalGainPct.toFixed(2) + '% vs cost';
    let prevValue = totalValue - totalDayChange;
    let totalDayChangePct = prevValue > 0 ? (totalDayChange / prevValue) * 100 : 0;
    let todayChangeEl = document.getElementById('port-today-change');
    let todayPctEl = document.getElementById('port-today-pct');
    if (todayChangeEl) { todayChangeEl.textContent = fmtSigned$(totalDayChange); todayChangeEl.style.color = dayColor; }
    if (todayPctEl) { todayPctEl.textContent = (totalDayChangePct >= 0 ? '+' : '') + totalDayChangePct.toFixed(2) + '% vs yesterday'; todayPctEl.style.color = dayColor; }
    // Realized G/L from closed positions
    let closed = active ? (active.closedPositions || []) : [];
    let totalRealized = closed.reduce(function(sum, c) { return sum + (c.realizedGain || 0); }, 0);
    let realizedEl = document.getElementById('port-realized-gain');
    let realizedCard = document.getElementById('port-realized-card');
    if (realizedEl) {
      realizedEl.textContent = fmtSigned$(totalRealized);
      realizedEl.style.color = totalRealized >= 0 ? '#128257' : '#dc2626';
    }
    if (realizedCard) { realizedCard.classList.remove('metric-up','metric-down'); realizedCard.classList.add(totalRealized >= 0 ? 'metric-up' : 'metric-down'); }
    let gainCard = document.getElementById('port-gain-card');
    let todayCard = document.getElementById('port-today-card');
    if (gainCard) { gainCard.classList.remove('metric-up','metric-down'); gainCard.classList.add(totalGain >= 0 ? 'metric-up' : 'metric-down'); }
    if (todayCard) { todayCard.classList.remove('metric-up','metric-down'); todayCard.classList.add(totalDayChange >= 0 ? 'metric-up' : 'metric-down'); }
    document.getElementById('port-avg-score').textContent = avgScore ? avgScore + '/100' : '—';
    let sorted = stockData.slice().sort(function(a, b) { return b.gainPct - a.gainPct; });
    let best = sorted[0], worst = sorted[sorted.length - 1];
    let winnersCard = document.getElementById('port-winners-card');
    if (winnersCard) winnersCard.style.display = stockData.length > 0 ? 'grid' : 'none';
    if (best && worst) {
      document.getElementById('port-best-ticker').textContent = best.ticker;
      document.getElementById('port-best-gain').textContent = fmtSigned$(best.gain) + ' · ' + (best.gainPct >= 0 ? '+' : '') + best.gainPct.toFixed(1) + '%';
      document.getElementById('port-best-gain').style.color = best.gain >= 0 ? '#128257' : '#dc2626';
      document.getElementById('port-worst-ticker').textContent = worst.ticker;
      document.getElementById('port-worst-gain').textContent = fmtSigned$(worst.gain) + ' · ' + (worst.gainPct >= 0 ? '+' : '') + worst.gainPct.toFixed(1) + '%';
      document.getElementById('port-worst-gain').style.color = worst.gain >= 0 ? '#128257' : '#dc2626';
    }
    if (failedTickers.length > 0) {
      showToast('Prices unavailable for ' + failedTickers.join(', ') + ' — showing cost basis instead.');
    }
    portfolioStockData = stockData;
    // Check price alerts for portfolio stocks
    var portQuoteMap = {};
    stockData.forEach(function(s) { portQuoteMap[s.ticker] = { price: s.currentPrice, changePct: s.dayChangePct || 0, prevClose: s.currentPrice - (s.dayChangeAmt || 0) }; });
    checkPriceAlerts(portQuoteMap);
    renderPortfolioEarningsCalendar(portfolio.map(function(s) { return s.ticker; }));
    let searchWrap = document.getElementById('port-search-wrap');
    if (searchWrap) searchWrap.style.display = 'block';
    renderPortfolioRows(stockData);
    renderClosedPositions();
    fetchMissingPortfolioScores(stockData);

    if (totalValue > 0) savePortfolioValueHistory(totalValue);
    // Update weekly challenge leaderboard entry (throttled — only if portfolio has challenge)
    if (active && active.challengeId) updateChallengeEntry(totalValue, totalCost, avgScore, stockData);
    renderPortfolioChart(stockData, totalValue);
    renderHoldingsChart();
    renderSectorAllocation(stockData, totalValue);
    let portAiBtn = document.getElementById('port-ai-btn');
    if (portAiBtn) portAiBtn.style.display = 'block';
    let exportBtn = document.getElementById('port-export-btn');
    if (exportBtn) exportBtn.style.display = 'block';

    // Fractional shares note for Recommended Portfolio
    let demoNote = document.getElementById('port-demo-note');
    if (active && active.isDemo) {
      if (!demoNote) {
        demoNote = document.createElement('div');
        demoNote.id = 'port-demo-note';
        demoNote.className = 'port-demo-note';
        demoNote.innerHTML = 'This is a simulated portfolio using fractional shares. Most modern brokers (Robinhood, Fidelity, Schwab) support fractional investing.';
        let listEl = document.getElementById('portfolio-list');
        if (listEl) listEl.parentNode.insertBefore(demoNote, listEl);
      }
      demoNote.style.display = 'block';
    } else if (demoNote) {
      demoNote.style.display = 'none';
    }

    // Paper trading banner
    let paperBanner = document.getElementById('port-paper-banner');
    if (active && active.isPaper) {
      let balUSD = active.paperBalance || 0;
      let startUSD = active.startingBalance || balUSD;
      // totalValue is in USD (raw Finnhub prices × shares) — no conversion needed
      let rate = (typeof _fxRate !== 'undefined' ? _fxRate : 1);
      let netUSD = totalValue + balUSD - startUSD;
      let netPct = startUSD > 0 ? (netUSD / startUSD) * 100 : 0;
      let netColor = netUSD >= 0 ? '#a855f7' : '#dc2626';
      let balDisplay = _currency === 'MXN' ? 'MX$' + Math.round(balUSD * rate).toLocaleString('en-US') : '$' + Math.round(balUSD).toLocaleString('en-US');
      let startDisplay = _currency === 'MXN' ? 'MX$' + Math.round(startUSD * rate).toLocaleString('en-US') : '$' + Math.round(startUSD).toLocaleString('en-US');
      if (!paperBanner) {
        paperBanner = document.createElement('div');
        paperBanner.id = 'port-paper-banner';
        paperBanner.className = 'port-paper-banner';
        let listEl = document.getElementById('portfolio-list');
        if (listEl) listEl.parentNode.insertBefore(paperBanner, listEl);
      }
      paperBanner.innerHTML =
        '<span class="paper-banner-icon">&#127918;</span>' +
        '<span class="paper-banner-label">Paper Trading</span>' +
        '<span class="paper-banner-sep">·</span>' +
        '<span class="paper-banner-stat">Cash <strong>' + balDisplay + '</strong></span>' +
        '<span class="paper-banner-sep">·</span>' +
        '<span class="paper-banner-stat">Started with <strong>' + startDisplay + '</strong></span>' +
        '<span class="paper-banner-sep">·</span>' +
        '<span class="paper-banner-net" style="color:' + netColor + ';">' + (netUSD >= 0 ? '+' : '') + netPct.toFixed(2) + '% overall</span>';
      paperBanner.style.display = 'flex';
    } else if (paperBanner) {
      paperBanner.style.display = 'none';
    }

    // S&P 500 benchmark
    fetchSpyBenchmark(portfolio, function(bench) {
      let benchEl = document.getElementById('port-benchmark');
      if (!benchEl) return;
      if (!bench) { benchEl.style.display = 'none'; return; }
      let youVsSpy = totalGainPct - bench.spyReturn;
      let vsColor = youVsSpy >= 0 ? '#128257' : '#dc2626';
      let vsText = youVsSpy >= 0 ? '↑ Beating the market' : '↓ Behind the market';
      let youColor = totalGainPct >= 0 ? '#128257' : '#dc2626';
      let spyColor = bench.spyReturn >= 0 ? '#128257' : '#dc2626';
      benchEl.innerHTML =
        '<span class="port-bench-label">vs S&P 500 since ' + bench.since + '</span>' +
        '<span class="port-bench-stat" style="color:' + youColor + ';">You ' + (totalGainPct >= 0 ? '+' : '') + totalGainPct.toFixed(1) + '%</span>' +
        '<span class="port-bench-sep">·</span>' +
        '<span class="port-bench-stat" style="color:' + spyColor + ';">SPY ' + (bench.spyReturn >= 0 ? '+' : '') + bench.spyReturn.toFixed(1) + '%</span>' +
        '<span class="port-bench-vs" style="color:' + vsColor + ';">' + vsText + '</span>';
      benchEl.style.display = 'flex';
    });
  });
}

// Parse "Apr 22, 2026" or "Apr 22" style dates (toLocaleDateString output is not ISO-safe)
function _parseLotDate(str) {
  if (!str) return null;
  // Replace "Apr 22, 2026" → use built-in parser with explicit comma handling
  var d = new Date(str);
  if (!isNaN(d)) return d;
  // Try prefixing year if missing: "Apr 22" → "Apr 22, <current year>"
  d = new Date(str + ', ' + new Date().getFullYear());
  return isNaN(d) ? null : d;
}

function fetchSpyBenchmark(portfolio, callback) {
  if (_spyBenchmark !== null) { callback(_spyBenchmark || null); return; }
  // Find earliest lot date across all stocks
  let earliest = null;
  portfolio.forEach(function(item) {
    (item.lots || []).forEach(function(lot) {
      let d = _parseLotDate(lot.date);
      if (d && (!earliest || d < earliest)) earliest = d;
    });
  });
  if (!earliest) { _spyBenchmark = false; callback(null); return; }
  let fromDate = earliest.toISOString().split('T')[0];
  // Use a 14-day window to handle weekends/holidays/recent dates with no candle yet
  let toDate = new Date(earliest.getTime() + 14 * 86400000).toISOString().split('T')[0];
  Promise.all([
    getSharedPrices(['SPY'], 300000).then(function(m) { return { c: (m['SPY']||{}).price || 0 }; }).catch(function() { return {}; }),
    fetch(polygonUrl('/v2/aggs/ticker/SPY/range/1/day/' + fromDate + '/' + toDate, { adjusted: 'true', limit: '10' })).then(function(r) { return r.json(); }).catch(function() { return {}; })
  ]).then(function(results) {
    let currentSPY = results[0].c || 0;
    let hist = results[1];
    let startSPY = (hist.results && hist.results.length > 0) ? hist.results[0].c : 0;
    if (!currentSPY || !startSPY) { _spyBenchmark = false; callback(null); return; }
    let spyReturn = ((currentSPY - startSPY) / startSPY) * 100;
    let since = earliest.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    _spyBenchmark = { spyReturn: spyReturn, since: since };
    callback(_spyBenchmark);
  }).catch(function() { _spyBenchmark = false; callback(null); });
}

function portSignal(score, ticker) {
  if (!score) return '<span style="color:#64748b;font-size:11px;">—</span>';
  let cls = score >= 65 ? 'buy' : score >= 50 ? 'hold' : 'sell';
  let txt = score >= 65 ? 'Strong' : score >= 50 ? 'Watch' : 'Risky';
  let pill = '<span class="signal-pill ' + cls + '">' + txt + '</span>';
  if (ticker) {
    let h = buildScoreHistoryBars(ticker, score);
    if (h.trend) pill += '<div class="port-score-trend">' + h.trend + '</div>';
  }
  return pill;
}

function fetchMissingPortfolioScores(stockData) {
  let missing = stockData.filter(function(s) { return !s.score; });
  missing.forEach(function(s, i) {
    setTimeout(function() {
      fetch(finnhubUrl('/api/v1/stock/metric', {symbol: s.ticker, metric: 'all'}))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          let m = data.metric || {};
          let pe = m['peNormalizedAnnual'] || m['peTTM'] || 0;
          let week52High = m['52WeekHigh'] || 0;
          let changePct = s.currentPrice > 0 && s.buyPrice > 0
            ? ((s.currentPrice - s.buyPrice) / s.buyPrice) * 100 : 0;
          let result = calculateScore(changePct, week52High, s.currentPrice, pe, m, 5, null, null);
          let score = result.total;
          saveScoreHistory(s.ticker, score);
          // Update the signal pill in the DOM without re-rendering the whole list
          let el = document.getElementById('port-signal-' + s.ticker);
          if (el) el.innerHTML = portSignal(score, s.ticker);
        })
        .catch(function() {});
    }, 400 * (i + 1)); // stagger 400ms per ticker
  });
}

function openSellModal(ticker, currentPrice, totalShares) {
  // Remove any existing modal
  let existing = document.getElementById('sell-modal-' + ticker);
  if (existing) { existing.remove(); return; }

  let wrapper = document.querySelector('.port-stock-wrapper[data-ticker="' + ticker + '"]');
  if (!wrapper) return;

  let modal = document.createElement('div');
  modal.id = 'sell-modal-' + ticker;
  modal.className = 'sell-modal';
  let tickerJ = escHtml(JSON.stringify(ticker));
  modal.innerHTML =
    '<div class="sell-modal-title">Sell ' + ticker + '</div>' +
    '<div class="sell-modal-row">' +
      '<div class="sell-modal-field">' +
        '<label>Shares to sell</label>' +
        '<input type="number" id="sell-shares-' + ticker + '" placeholder="e.g. 5" max="' + totalShares + '" step="any">' +
      '</div>' +
      '<div class="sell-modal-field">' +
        '<label>Sell price <span style="font-size:10px;color:var(--text-muted);font-weight:400;">USD</span></label>' +
        '<input type="number" id="sell-price-' + ticker + '" placeholder="' + currentPrice.toFixed(2) + '" value="' + currentPrice.toFixed(2) + '" step="any">' +
      '</div>' +
    '</div>' +
    '<div id="sell-preview-' + ticker + '" class="sell-preview"></div>' +
    (_vault ? '<div class="vault-in-sell">IQ Vault: <strong>' + _fmtVault(_vault.balance) + '</strong></div>' : '') +
    '<div class="sell-modal-actions">' +
      '<button class="sell-confirm-btn" onclick="confirmSell(' + tickerJ + ',' + totalShares + ')">Confirm Sale</button>' +
      '<button class="sell-all-btn" onclick="sellAll(' + tickerJ + ',' + totalShares + ',' + currentPrice + ')">Sell All</button>' +
      '<button class="sell-cancel-btn" onclick="document.getElementById(\'sell-modal-' + ticker + '\').remove()">Cancel</button>' +
    '</div>';

  wrapper.appendChild(modal);

  // Live preview — uses FIFO to match what confirmSell will actually record
  function updatePreview() {
    let sh = parseFloat(document.getElementById('sell-shares-' + ticker).value) || 0;
    let sp = parseFloat(document.getElementById('sell-price-' + ticker).value) || 0;
    let preview = document.getElementById('sell-preview-' + ticker);
    if (!sh || !sp) { preview.innerHTML = ''; return; }
    let active = getActivePortfolio();
    let portfolio = active ? migratePortfolio(active.stocks || []) : [];
    let item = portfolio.find(function(i) { return i.ticker === ticker; });
    if (!item) return;
    let totalSh = item.lots.reduce(function(sum, l) { return sum + l.shares; }, 0);
    // FIFO preview — same logic as confirmSell
    let sharesToSell = sh;
    let realizedGain = 0;
    let weightedCost = 0;
    let lots = item.lots.slice();
    for (let i = 0; i < lots.length && sharesToSell > 0; i++) {
      let lotSell = Math.min(lots[i].shares, sharesToSell);
      realizedGain += (sp - lots[i].price) * lotSell;
      weightedCost += lots[i].price * lotSell;
      sharesToSell -= lotSell;
    }
    let avgCostSold = sh > 0 ? weightedCost / sh : 0;
    let realizedPct = avgCostSold > 0 ? ((sp - avgCostSold) / avgCostSold * 100) : 0;
    let color = realizedGain >= 0 ? '#128257' : '#dc2626';
    let remaining = totalSh - sh;
    let proceeds = sh * sp;
    preview.innerHTML =
      '<div style="color:var(--text-muted);font-size:12px;margin-bottom:4px;">You\'ll receive: <strong style="color:var(--text);">' + fmt$(proceeds) + '</strong></div>' +
      '<span style="color:' + color + ';font-weight:600;">' +
        fmtSigned$(realizedGain) + ' (' + (realizedPct >= 0 ? '+' : '') + realizedPct.toFixed(1) + '%)</span>' +
      '<span style="color:var(--text-muted);margin-left:10px;">' + (remaining > 0 ? remaining.toFixed(remaining % 1 === 0 ? 0 : 2) + ' shares remaining' : 'Full position closed') + '</span>';
  }
  document.getElementById('sell-shares-' + ticker).addEventListener('input', updatePreview);
  document.getElementById('sell-price-' + ticker).addEventListener('input', updatePreview);
  updatePreview();
}

function sellAll(ticker, totalShares, currentPrice) {
  let sharesInput = document.getElementById('sell-shares-' + ticker);
  let priceInput  = document.getElementById('sell-price-' + ticker);
  if (!sharesInput || !priceInput) return;
  // Pre-fill the full quantity and current price, then confirm immediately
  sharesInput.value = totalShares;
  if (!parseFloat(priceInput.value)) priceInput.value = currentPrice.toFixed(2);
  confirmSell(ticker, totalShares);
}

function confirmSell(ticker, totalShares) {
  let sh = parseFloat(document.getElementById('sell-shares-' + ticker).value);
  let sp = parseFloat(document.getElementById('sell-price-' + ticker).value);
  if (!sh || sh <= 0) { showToast('Enter shares to sell'); return; }
  if (!sp || sp <= 0) { showToast('Enter sell price'); return; }
  if (sh > totalShares) { showToast('You only have ' + totalShares + ' shares'); return; }

  let all = getAllPortfolios();
  let id = getActiveId();
  if (!all[id]) return;
  let portfolio = migratePortfolio(all[id].stocks || []);
  let item = portfolio.find(function(i) { return i.ticker === ticker; });
  if (!item) return;

  // Compute realized gain (FIFO — sell from oldest lot first)
  let sharesToSell = sh;
  let realizedGain = 0;
  let weightedCost = 0;
  let lots = item.lots.slice();
  for (let i = 0; i < lots.length && sharesToSell > 0; i++) {
    let lotSell = Math.min(lots[i].shares, sharesToSell);
    realizedGain += (sp - lots[i].price) * lotSell;
    weightedCost += lots[i].price * lotSell;
    lots[i].shares -= lotSell;
    sharesToSell -= lotSell;
  }
  item.lots = lots.filter(function(l) { return l.shares > 0; });
  let avgCostSold = sh > 0 ? weightedCost / sh : 0;

  let closed = all[id].closedPositions || [];
  closed.push({
    ticker,
    sharesSold: sh,
    sellPrice: sp,
    avgCost: parseFloat(avgCostSold.toFixed(2)),
    realizedGain: parseFloat(realizedGain.toFixed(2)),
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  });
  all[id].closedPositions = closed;

  // Paper trading: return proceeds to virtual balance
  // sp is stored in USD (Finnhub prices), so no FX conversion needed
  if (all[id].isPaper) {
    let proceedsUSD = sh * sp;
    all[id].paperBalance = (all[id].paperBalance || 0) + proceedsUSD;
  }

  if (item.lots.length === 0) {
    portfolio = portfolio.filter(function(i) { return i.ticker !== ticker; });
    let proceeds = sh * sp;
    showToast(ticker + ' fully sold · received ' + fmt$(proceeds) + ' · ' + fmtSigned$(realizedGain) + ' realized');
  } else {
    showToast('Sold ' + sh + ' shares of ' + ticker + ' — ' + fmtSigned$(realizedGain) + ' realized');
  }

  all[id].stocks = portfolio;
  savePortfolios(all);
  // IQ Vault — return sale proceeds (price is in USD, convert to MXN)
  var _vRate = (typeof _fxRate !== 'undefined' && _fxRate > 1) ? _fxRate : 17.5;
  vaultCredit(sh * sp * _vRate, ticker, sh, sp);
  renderPortfolio();
  renderClosedPositions();
}

function renderClosedPositions() {
  let active = getActivePortfolio();
  let closed = active ? (active.closedPositions || []) : [];
  let el = document.getElementById('closed-positions-section');
  if (!el) return;
  if (closed.length === 0) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  let totalRealized = closed.reduce(function(sum, c) { return sum + c.realizedGain; }, 0);
  let totalColor = totalRealized >= 0 ? '#128257' : '#dc2626';
  let listEl = document.getElementById('closed-positions-list');
  let totalEl = document.getElementById('closed-positions-total');
  if (listEl) {
    listEl.innerHTML = closed.slice().reverse().map(function(c) {
      let gc = c.realizedGain >= 0 ? '#128257' : '#dc2626';
      return '<div class="closed-row">' +
        '<div class="closed-row-left">' +
          '<div class="closed-row-ticker">' + escHtml(c.ticker) + '</div>' +
          '<div class="closed-row-detail">' + c.sharesSold + ' shares · bought ' + (c.avgCost ? fmt$(c.avgCost) : '—') + ' → sold ' + fmt$(c.sellPrice) + ' · ' + escHtml(c.date) + '</div>' +
        '</div>' +
        '<div class="closed-row-gain" style="color:' + gc + ';">' + fmtSigned$(c.realizedGain) + '</div>' +
      '</div>';
    }).join('');
  }
  if (totalEl) {
    totalEl.innerHTML = 'Total Realized: <span style="color:' + totalColor + ';">' + fmtSigned$(totalRealized) + '</span>';
  }
}

function togglePortLots(ticker) {
  let el = document.getElementById('lots-' + ticker);
  let btn = document.getElementById('lots-btn-' + ticker);
  if (!el) return;
  let isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.textContent = isOpen ? '▾' : '▴';
}

var _portEarningsCache = {}; // ticker → { date, ts }

function togglePortEarnings() {
  var el = document.getElementById('port-earnings-calendar');
  var list = document.getElementById('port-earnings-list');
  var chevron = document.getElementById('port-earnings-chevron');
  if (!el || !list) return;
  var open = list.style.display !== 'none';
  list.style.display = open ? 'none' : 'flex';
  if (chevron) chevron.textContent = open ? '▾' : '▴';
  el._earningsOpen = !open;
}

function renderPortfolioEarningsCalendar(tickers) {
  var el = document.getElementById('port-earnings-calendar');
  if (!el || !tickers || tickers.length === 0) return;

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var toDate = new Date(today); toDate.setDate(today.getDate() + 45);
  var fromStr = today.toISOString().split('T')[0];
  var toStr = toDate.toISOString().split('T')[0];

  // Use cached results if fresh (< 4h)
  var now = Date.now();
  var allCached = tickers.every(function(t) {
    return _portEarningsCache[t] && (now - _portEarningsCache[t].ts < 14400000);
  });

  function renderCalendar() {
    var upcoming = [];
    tickers.forEach(function(t) {
      var d = _portEarningsCache[t];
      if (!d || !d.date) return;
      var earningsDate = new Date(d.date + 'T00:00:00');
      var daysAway = Math.round((earningsDate - today) / 86400000);
      if (daysAway >= 0 && daysAway <= 45) {
        upcoming.push({ ticker: t, date: d.date, daysAway: daysAway });
      }
    });

    if (upcoming.length === 0) { el.style.display = 'none'; return; }
    upcoming.sort(function(a, b) { return a.daysAway - b.daysAway; });

    // Soonest event — shown in the collapsed header
    var soonest = upcoming[0];
    var soonestColor = soonest.daysAway === 0 ? '#dc2626' : soonest.daysAway <= 7 ? '#e07510' : 'var(--text-muted)';
    var soonestText = soonest.daysAway === 0 ? 'Today' : soonest.daysAway === 1 ? 'Tomorrow' : 'In ' + soonest.daysAway + 'd';

    // Preserve open/closed state across re-renders
    var wasOpen = el._earningsOpen || false;

    el.innerHTML =
      '<div class="port-earnings-header" onclick="togglePortEarnings()">' +
        '<span class="port-earnings-title">UPCOMING EARNINGS</span>' +
        '<span class="port-earnings-preview">' +
          '<span style="font-family:var(--mono);font-weight:700;color:var(--text);font-size:12px;">' + escHtml(soonest.ticker) + '</span>' +
          ' <span style="color:' + soonestColor + ';font-size:11px;font-weight:600;">' + soonestText + '</span>' +
          (upcoming.length > 1 ? ' <span style="color:var(--text-muted);font-size:11px;">+' + (upcoming.length - 1) + ' more</span>' : '') +
        '</span>' +
        '<span class="port-earnings-chevron" id="port-earnings-chevron">' + (wasOpen ? '▴' : '▾') + '</span>' +
      '</div>' +
      '<div class="port-earnings-list" id="port-earnings-list" style="display:' + (wasOpen ? 'flex' : 'none') + ';">' +
      upcoming.map(function(e) {
        var urgColor = e.daysAway === 0 ? '#dc2626' : e.daysAway <= 7 ? '#e07510' : 'var(--text-muted)';
        var countText = e.daysAway === 0 ? 'Today' : e.daysAway === 1 ? 'Tomorrow' : 'In ' + e.daysAway + 'd';
        var dateStr = new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return '<div class="port-earnings-row" onclick="quickSearch(\'' + escHtml(e.ticker) + '\')">' +
          '<span class="port-earnings-ticker">' + escHtml(e.ticker) + '</span>' +
          '<span class="port-earnings-date">' + dateStr + '</span>' +
          '<span class="port-earnings-count" style="color:' + urgColor + ';">' + countText + '</span>' +
        '</div>';
      }).join('') +
      '</div>';
    el.style.display = 'block';
  }

  if (allCached) { renderCalendar(); return; }

  // Fetch in parallel — one call per ticker (Finnhub calendar endpoint)
  var fetches = tickers.map(function(ticker) {
    if (_portEarningsCache[ticker] && (now - _portEarningsCache[ticker].ts < 14400000)) {
      return Promise.resolve();
    }
    return fetch(finnhubUrl('/api/v1/calendar/earnings', { symbol: ticker, from: fromStr, to: toStr }))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var cal = data.earningsCalendar || [];
        var next = cal.length > 0 ? cal[0].date : null;
        _portEarningsCache[ticker] = { date: next, ts: Date.now() };
      })
      .catch(function() {
        _portEarningsCache[ticker] = { date: null, ts: Date.now() };
      });
  });

  Promise.all(fetches).then(renderCalendar);
}

function renderPortfolioRows(data) {
  let list = document.getElementById('portfolio-list');
  if (!list) return;
  if (data.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:24px 0;font-size:13px;color:var(--text-muted);">No stocks match your search.</div>';
    return;
  }
  list.innerHTML = '<div class="port-stock-header"><div>Stock</div><div>Mkt Value</div><div class="hide-mobile">Cost</div><div class="hide-mobile">Unrealized G/L</div><div class="hide-mobile">Day Change</div><div>Signal</div></div>' +
    data.map(function(s) {
      let gc = s.gain >= 0 ? '#128257' : '#dc2626';
      let dc = s.dayChangeAmt >= 0 ? '#128257' : '#dc2626';
      let hasMultiple = s.lots && s.lots.length > 1;
      let lotsHtml = '';
      if (s.lots) {
        let note = getStockNote(s.ticker);
        let lotsRowsHtml = s.lots.map(function(lot, i) {
          let lotCost = lot.shares * lot.price;
          let lotValue = s.currentPrice * lot.shares;
          let lotGain = lotValue - lotCost;
          let lotGainPct = lotCost > 0 ? ((lotGain / lotCost) * 100) : 0;
          let lotGc = lotGain >= 0 ? '#128257' : '#dc2626';
          return '<div class="port-lot-row">' +
            '<div class="port-lot-info">' +
              '<span class="port-lot-num">Lot ' + (i + 1) + '</span>' +
              '<span>' + lot.shares + ' shares @ ' + fmt$(lot.price) + (lot.date ? ' · ' + lot.date : '') + '</span>' +
              (lot.thesis ? '<span class="port-thesis-badge thesis-' + lot.thesis + '" style="margin-left:6px;">' + (_THESIS_LABELS[lot.thesis] || lot.thesis) + '</span>' : '') +
            '</div>' +
            '<div class="port-lot-gain" style="color:' + lotGc + ';">' + fmtSigned$(lotGain) + ' (' + (lotGainPct >= 0 ? '+' : '') + lotGainPct.toFixed(1) + '%)</div>' +
            (hasMultiple ? '<button onclick="event.stopPropagation();removeLotFromPortfolio(' + escHtml(JSON.stringify(s.ticker)) + ',' + i + ')" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:13px;padding:2px 6px;flex-shrink:0;">✕</button>' : '') +
          '</div>';
        }).join('');
        var portAlerts = JSON.parse(localStorage.getItem('price-alerts') || '{}');
        var portAlertTarget = portAlerts[s.ticker];
        var _bellSvgP = "<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' style='vertical-align:-2px;margin-right:3px'><path d='M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9'/><path d='M13.73 21a2 2 0 0 1-3.46 0'/></svg>";
        var portAlertHtml = portAlertTarget
          ? '<span class="wl-alert-tag" onclick="event.stopPropagation();removePortAlert(\'' + escHtml(s.ticker) + '\')" title="Remove alert">' + _bellSvgP + '$' + portAlertTarget.toFixed(2) + ' ✕</span>'
          : '<button class="wl-alert-btn" onclick="event.stopPropagation();openAlertInput(\'' + escHtml(s.ticker) + '\',' + s.currentPrice + ')">' + _bellSvgP + 'Alert</button>';
        lotsHtml = '<div id="lots-' + s.ticker + '" class="port-lots-drawer" style="display:none;">' +
          lotsRowsHtml +
          '<div class="port-note-row">' +
            '<textarea id="note-input-' + s.ticker + '" class="port-note-input" placeholder="Why did you buy this? Notes…" oninput="saveStockNote(' + escHtml(JSON.stringify(s.ticker)) + ',this.value)">' + escHtml(note) + '</textarea>' +
          '</div>' +
          '<div id="alert-container-' + s.ticker + '"></div>' +
          '<div style="padding:6px 12px 4px;display:flex;align-items:center;justify-content:space-between;">' +
            portAlertHtml +
            '<button onclick="event.stopPropagation();removeFromPortfolio(' + escHtml(JSON.stringify(s.ticker)) + ')" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:11px;padding:0;">Remove from portfolio</button>' +
          '</div>' +
        '</div>';
      }
      return '<div class="port-stock-wrapper" data-ticker="' + s.ticker + '">' +
        '<div class="port-stock-row" onclick="openStockFromPortfolio(' + escHtml(JSON.stringify(s.ticker)) + ')">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<button id="lots-btn-' + s.ticker + '" onclick="event.stopPropagation();togglePortLots(' + escHtml(JSON.stringify(s.ticker)) + ')" class="port-lots-toggle">▾</button>' +
            '<div>' +
              '<div style="font-weight:600;font-size:14px;">' + s.ticker + '</div>' +
              '<div style="font-size:11px;color:#64748b;">' + s.shares.toFixed(s.shares % 1 === 0 ? 0 : 2) + ' shares · avg ' + fmt$(s.buyPrice) + (hasMultiple ? ' · ' + s.lots.length + ' lots' : (s.lots && s.lots[0] && s.lots[0].date ? ' · ' + s.lots[0].date : '')) + '</div>' +
              '<div style="font-size:11px;margin-top:2px;"><span style="color:var(--text-muted);">now ' + fmt$(s.currentPrice) + '</span> <span style="color:' + dc + ';">' + fmtSigned$(s.dayChangeAmt) + ' today</span></div>' +
              (function() {
                var thesis = s.lots && s.lots[s.lots.length - 1] && s.lots[s.lots.length - 1].thesis;
                return thesis ? '<span class="port-thesis-badge thesis-' + thesis + '">' + (_THESIS_LABELS[thesis] || thesis) + '</span>' : '';
              })() +
            '</div>' +
          '</div>' +
          '<div><div>' + fmt$(s.value) + '</div></div>' +
          '<div class="hide-mobile" style="color:var(--text-muted);font-size:13px;">' + fmt$(s.cost) + '</div>' +
          '<div class="hide-mobile" style="color:' + gc + ';">' + fmtSigned$(s.gain) + '<br><span style="font-size:11px;">' + (s.gainPct >= 0 ? '+' : '') + s.gainPct.toFixed(1) + '%</span></div>' +
          '<div class="hide-mobile" style="color:' + dc + ';">' + fmtSigned$(s.dayChangeAmt) + '<br><span style="font-size:11px;color:' + dc + ';">' + (s.dayChangeAmt >= 0 ? '+' : '') + (s.currentPrice > 0 ? ((s.dayChangeAmt / (s.value - s.dayChangeAmt)) * 100).toFixed(2) : '0.00') + '%</span></div>' +
          '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;"><span id="port-signal-' + s.ticker + '">' + portSignal(s.score, s.ticker) + '</span>' +
            '<button onclick="event.stopPropagation();openSellModal(' + escHtml(JSON.stringify(s.ticker)) + ',' + s.currentPrice + ',' + s.shares + ')" class="sell-btn">Sell</button>' +
          '</div>' +
        '</div>' +
        lotsHtml +
      '</div>';
    }).join('');
}

function filterPortfolioList() {
  let q = (document.getElementById('port-search-input').value || '').trim().toLowerCase();
  let filtered = q ? portfolioStockData.filter(function(s) { return s.ticker.toLowerCase().includes(q); }) : portfolioStockData;
  renderPortfolioRows(filtered);
}

function openStockFromPortfolio(ticker) {
  document.getElementById('stock-input').value = ticker;
  showTab('analyze');
  searchStock();
}

function savePortfolioValueHistory(value) {
  let all = getAllPortfolios();
  let id = getActiveId();
  if (!all[id]) return;
  let history = all[id].valueHistory || [];
  let today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (history.length > 0 && history[history.length - 1].date === today) {
    history[history.length - 1].value = parseFloat(value.toFixed(2));
  } else {
    history.push({ date: today, value: parseFloat(value.toFixed(2)) });
  }
  if (history.length > 60) history = history.slice(-60);
  all[id].valueHistory = history;
  savePortfolios(all);
}

function switchPortfolioChart(view) {
  document.querySelectorAll('.port-chart-btn').forEach(function(b) { b.classList.remove('active'); });
  var btn = document.querySelector('.port-chart-btn[data-view="' + view + '"]');
  if (btn) btn.classList.add('active');
  document.getElementById('portfolio-pie-view').style.display     = view === 'pie'     ? 'block' : 'none';
  document.getElementById('portfolio-sectors-view').style.display = view === 'sectors' ? 'block' : 'none';
}

function switchHoldingsView(view) {
  document.querySelectorAll('.hs-view-btn').forEach(function(b) { b.classList.remove('active'); });
  var btn = document.querySelector('.hs-view-btn[data-view="' + view + '"]');
  if (btn) btn.classList.add('active');
  var valueView  = document.getElementById('holdings-value-view');
  var returnView = document.getElementById('holdings-return-view');
  if (valueView)  valueView.style.display  = view === 'value'  ? 'block' : 'none';
  if (returnView) returnView.style.display = view === 'return' ? 'block' : 'none';
  if (view === 'return') renderPortfolioLineChart();
}

// Build reverse ticker→sector lookup from SECTOR_TICKERS
var _tickerSectorMap = (function() {
  var map = {};
  Object.keys(SECTOR_TICKERS).forEach(function(sector) {
    SECTOR_TICKERS[sector].forEach(function(s) { map[s.t] = sector; });
  });
  return map;
})();

var SECTOR_COLORS = {
  'Technology':  '#6366f1',
  'Healthcare':  '#10b981',
  'Financials':  '#f59e0b',
  'Energy':      '#ef4444',
  'Consumer':    '#ec4899',
  'Industrials': '#8b5cf6',
  'Real Estate': '#14b8a6',
  'Utilities':   '#64748b',
  'Other':       '#94a3b8',
};

function renderSectorAllocation(stockData, totalValue) {
  var el = document.getElementById('portfolio-sectors-bars');
  if (!el || totalValue <= 0) return;

  // Group by sector
  var sectorMap = {};
  stockData.forEach(function(s) {
    var sector = _tickerSectorMap[s.ticker] || 'Other';
    if (!sectorMap[sector]) sectorMap[sector] = { value: 0, tickers: [] };
    sectorMap[sector].value += s.value;
    sectorMap[sector].tickers.push(s.ticker);
  });

  var sectors = Object.keys(sectorMap).map(function(name) {
    return { name: name, value: sectorMap[name].value, tickers: sectorMap[name].tickers, pct: (sectorMap[name].value / totalValue) * 100 };
  }).sort(function(a, b) { return b.pct - a.pct; });

  var maxPct = sectors[0] ? sectors[0].pct : 1;

  // Diversification grade
  var numSectors = sectors.length;
  var topPct = sectors[0] ? sectors[0].pct : 0;
  var numHoldings = stockData.length;
  var grade, gradeColor, gradeNote;
  if (numSectors >= 4 && topPct < 50 && numHoldings >= 5) {
    grade = 'A'; gradeColor = '#128257';
    gradeNote = 'Well diversified — spread across ' + numSectors + ' sectors.';
  } else if (numSectors >= 3 && topPct < 65) {
    grade = 'B'; gradeColor = '#128257';
    gradeNote = 'Decent spread. Consider adding stocks from other sectors.';
  } else if (numSectors >= 2 && topPct < 80) {
    grade = 'C'; gradeColor = '#e07510';
    gradeNote = 'Moderate concentration. A bad week in ' + sectors[0].name + ' could hurt significantly.';
  } else {
    grade = 'D'; gradeColor = '#dc2626';
    gradeNote = 'High concentration in ' + sectors[0].name + '. Consider diversifying.';
  }

  el.innerHTML =
    '<div class="divers-grade-row">' +
      '<div class="divers-grade-badge" style="color:' + gradeColor + ';border-color:' + gradeColor + ';">' + grade + '</div>' +
      '<div class="divers-grade-info">' +
        '<div class="divers-grade-title">Diversification Grade</div>' +
        '<div class="divers-grade-note">' + gradeNote + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="sector-alloc-explainer">How your money is spread across sectors. Owning stocks in different sectors reduces risk — if one sector has a bad day, others may hold up.</div>' +
    sectors.map(function(s) {
      var color = SECTOR_COLORS[s.name] || SECTOR_COLORS['Other'];
      var barWidth = (s.pct / maxPct) * 100;
      var warning = s.pct > 60 ? ' <span class="sector-alloc-warn">High concentration</span>' : '';
      return '<div class="sector-alloc-row">' +
        '<div class="sector-alloc-meta">' +
          '<span class="sector-alloc-name">' + s.name + warning + '</span>' +
          '<span class="sector-alloc-tickers">' + s.tickers.join(', ') + '</span>' +
        '</div>' +
        '<div class="sector-alloc-bar-wrap">' +
          '<div class="sector-alloc-bar-fill" style="width:' + barWidth + '%;background:' + color + ';"></div>' +
        '</div>' +
        '<span class="sector-alloc-pct">' + s.pct.toFixed(1) + '%</span>' +
      '</div>';
    }).join('');
}

// ── Holdings Summary Chart ────────────────────────────
let holdingsChartInstance = null;
let hsCurrentRange = '6M';

function setHsRange(range) {
  hsCurrentRange = range;
  document.querySelectorAll('.hs-range-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.range === range);
  });
  renderHoldingsChart();
}

function renderHoldingsChart() {
  let active = getActivePortfolio();
  let history = active ? (active.valueHistory || []) : [];
  let canvas = document.getElementById('holdingsChart');
  let emptyEl = document.getElementById('holdings-chart-empty');
  if (!canvas) return;

  // Filter by range
  let now = new Date();
  let filtered = history;
  let days = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
  if (days[hsCurrentRange]) {
    let cutoff = new Date(now.getTime() - days[hsCurrentRange] * 86400000);
    filtered = history.filter(function(h) { return new Date(h.date) >= cutoff; });
    if (filtered.length === 0) filtered = history;
  }

  if (filtered.length < 2) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  // Convert to % return from first point in range
  let base = filtered[0].value;
  let labels = filtered.map(function(h) { return h.date; });
  let pcts = filtered.map(function(h) { return base > 0 ? ((h.value - base) / base * 100) : 0; });
  // Color based on whether the line ends above or below where it started in this view
  let isUp = pcts[pcts.length - 1] >= 0;
  let lineColor = isUp ? '#128257' : '#dc2626';
  let fillColor = isUp ? 'rgba(18,130,87,0.08)' : 'rgba(220,38,38,0.08)';

  if (holdingsChartInstance) holdingsChartInstance.destroy();
  holdingsChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: pcts,
        borderColor: lineColor,
        backgroundColor: fillColor,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) { return (ctx.parsed.y >= 0 ? '+' : '') + ctx.parsed.y.toFixed(2) + '%'; }
          }
        }
      },
      scales: {
        x: { display: false },
        y: {
          grid: { color: 'rgba(148,163,184,0.1)' },
          ticks: {
            font: { size: 10 },
            callback: function(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
          }
        }
      }
    }
  });
}

// ── Tooltip for Holdings Summary ─────────────────────
let _hsTipOpen = false;
function showHsTip(event, type) {
  event.stopPropagation();
  let popup = document.getElementById('hs-tooltip-popup');
  if (!popup) return;
  let tips = {
    day: '<strong>Day Change</strong><br>How much your portfolio gained or lost compared to <em>yesterday\'s closing prices</em>. Positive means the market moved in your favour today.',
    unrealized: '<strong>Unrealized G/L</strong><br>The gain or loss on stocks you <em>still own</em>, compared to what you paid. It\'s "unrealized" because you haven\'t sold yet — it could still go up or down.',
    realized: '<strong>Realized G/L</strong><br>Profit or loss from stocks you have <em>already sold</em>. This is locked in and won\'t change with the market.',
    score: '<strong>Avg Score</strong><br>The average StockIQ health score across your holdings (0–100). 65+ = Strong, 50–64 = Watch, below 50 = Risky.'
  };
  popup.innerHTML = tips[type] || '';
  let rect = event.target.getBoundingClientRect();
  popup.style.display = 'block';
  popup.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
  popup.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
  if (!_hsTipOpen) {
    _hsTipOpen = true;
    setTimeout(function() {
      document.addEventListener('click', function close() {
        popup.style.display = 'none';
        _hsTipOpen = false;
        document.removeEventListener('click', close);
      });
    }, 10);
  }
}

// ── AI Portfolio Explainer ─────────────────────────────
function explainPortfolio() {
  let active = getActivePortfolio();
  if (!active) return;
  let gainEl = document.getElementById('port-total-gain');
  let dayEl = document.getElementById('port-today-change');
  let realizedEl = document.getElementById('port-realized-gain');
  let scoreEl = document.getElementById('port-avg-score');
  let costEl = document.getElementById('port-total-cost');
  let stocks = active.stocks || [];
  let closed = active.closedPositions || [];

  // Build context string
  let stockList = stocks.map(function(s) {
    let sh = (s.lots || []).reduce(function(a, l) { return a + l.shares; }, 0);
    let cost = (s.lots || []).reduce(function(a, l) { return a + l.shares * l.price; }, 0);
    let avg = sh > 0 ? cost / sh : 0;
    return s.ticker + ' (' + sh.toFixed(2) + ' shares, avg $' + avg.toFixed(2) + ')';
  }).join(', ');

  let prompt = 'You are a friendly financial educator helping a beginner understand their portfolio.\n\n' +
    'Portfolio snapshot:\n' +
    '- Market Value: ' + (gainEl ? document.getElementById('port-total-value').textContent : '$?') + '\n' +
    '- Cost Basis: ' + (costEl ? costEl.textContent : '?') + '\n' +
    '- Unrealized G/L: ' + (gainEl ? gainEl.textContent + ' ' + document.getElementById('port-total-pct').textContent : '?') + '\n' +
    '- Day Change: ' + (dayEl ? dayEl.textContent + ' ' + document.getElementById('port-today-pct').textContent : '?') + '\n' +
    '- Realized G/L: ' + (realizedEl ? realizedEl.textContent : '?') + '\n' +
    '- Avg Score: ' + (scoreEl ? scoreEl.textContent : '?') + '\n' +
    '- Holdings: ' + (stockList || 'none') + '\n' +
    '- Closed positions: ' + closed.length + '\n\n' +
    'In plain English (3–5 short paragraphs), explain what each of these numbers means for THIS specific portfolio. ' +
    'Start with what Market Value vs Cost Basis means, then Unrealized G/L, then Day Change, then Realized G/L, then the score. ' +
    'Be encouraging, educational, and concise. Do not give investment advice.';

  // Show modal with loading state
  let existing = document.getElementById('holdings-explain-modal');
  if (existing) existing.remove();
  let modal = document.createElement('div');
  modal.id = 'holdings-explain-modal';
  modal.innerHTML =
    '<div class="holdings-explain-content">' +
      '<button class="holdings-explain-close" onclick="document.getElementById(\'holdings-explain-modal\').remove()">✕</button>' +
      '<h3>Understanding Your Portfolio</h3>' +
      '<div id="holdings-explain-body" style="color:var(--text-muted);font-size:13px;">Generating explanation…</div>' +
    '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

  // Call Anthropic API
  anthropicFetch({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    let text = data.content && data.content[0] ? data.content[0].text : 'Could not generate explanation.';
    let bodyEl = document.getElementById('holdings-explain-body');
    if (bodyEl) bodyEl.innerHTML = parseMarkdown(text);
  })
  .catch(function() {
    let bodyEl = document.getElementById('holdings-explain-body');
    if (bodyEl) bodyEl.textContent = 'Could not generate explanation. Check your connection and try again.';
  });
}

function renderPortfolioLineChart() {
  let active = getActivePortfolio();
  let history = active ? (active.valueHistory || []) : [];
  let emptyEl = document.getElementById('portfolio-line-empty');
  let canvas  = document.getElementById('portfolioLineChart');

  if (history.length < 2) {
    canvas.style.display = 'none';
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = history.length === 0
        ? '<strong>Chart coming soon</strong><br>StockIQ will record your first snapshot when you open the Portfolio tab. Come back each day — your chart builds one point at a time.'
        : '<strong>First snapshot saved!</strong> (' + history[0].date + ')<br>Come back tomorrow and your portfolio chart will start building. Each visit adds a new data point.';
    }
    return;
  }
  canvas.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  // Convert to % return from first point
  let base = history[0].value;
  let labels = history.map(function(h) { return h.date; });
  let pcts   = history.map(function(h) { return base > 0 ? parseFloat(((h.value - base) / base * 100).toFixed(2)) : 0; });
  let isUp   = pcts[pcts.length - 1] >= 0;
  let lineColor = isUp ? '#128257' : '#dc2626';
  let fillColor = isUp ? 'rgba(18,130,87,0.06)' : 'rgba(220,38,38,0.06)';

  function buildChart(spyPcts) {
    if (portfolioLineChartInstance) portfolioLineChartInstance.destroy();
    let datasets = [{
      label: 'Portfolio',
      data: pcts,
      borderColor: lineColor,
      backgroundColor: fillColor,
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: true
    }];
    if (spyPcts && spyPcts.length === pcts.length) {
      datasets.push({
        label: 'S&P 500',
        data: spyPcts,
        borderColor: 'rgba(148,163,184,0.7)',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: false
      });
    }
    portfolioLineChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#ffffff',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            titleColor: '#1a202c',
            bodyColor: '#64748b',
            padding: 12,
            callbacks: {
              label: function(ctx) {
                let sign = ctx.parsed.y >= 0 ? '+' : '';
                return '  ' + ctx.dataset.label + ': ' + sign + ctx.parsed.y.toFixed(2) + '%';
              }
            }
          }
        },
        scales: {
          y: {
            ticks: { color: '#64748b', callback: function(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; } },
            grid: { color: '#e2e8f0' }
          },
          x: { ticks: { color: '#64748b' }, grid: { display: false } }
        }
      }
    });
  }

  // Fetch SPY candles for the same time window as valueHistory
  // Use extra buffer days so weekends/holidays don't leave us with empty results
  var extraDays = Math.max(history.length + 10, 20);
  var fromDate = new Date(Date.now() - extraDays * 86400000);
  var fromStr = fromDate.toISOString().split('T')[0];
  var toStr   = new Date().toISOString().split('T')[0];
  fetch(polygonUrl('/v2/aggs/ticker/SPY/range/1/day/' + fromStr + '/' + toStr, { adjusted: 'true', limit: '120' }))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.results || data.results.length < 2) { buildChart(null); return; }
      var spyResults = data.results;
      var spyBase = spyResults[0].c;
      // Map SPY trading days onto portfolio history points via linear interpolation
      var n = history.length;
      var spyPcts = history.map(function(_, i) {
        var idx = n > 1 ? Math.round(i / (n - 1) * (spyResults.length - 1)) : 0;
        var spyVal = spyResults[Math.min(idx, spyResults.length - 1)].c;
        return parseFloat(((spyVal - spyBase) / spyBase * 100).toFixed(2));
      });
      buildChart(spyPcts);
    })
    .catch(function() { buildChart(null); });
}

function renderPortfolioChart(stockData, totalValue) {
  let section = document.getElementById('portfolio-chart-section');
  if (!section) return;

  let validStocks = stockData.filter(function(s) { return s.value > 0; });
  if (validStocks.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  let palette = ['#128257','#0ea5e9','#e07510','#dc2626','#a29bfe','#fd79a8','#55efc4','#fdcb6e'];
  let labels  = validStocks.map(function(s) { return s.ticker; });
  let values  = validStocks.map(function(s) { return s.value; });
  let colors  = validStocks.map(function(_, i) { return palette[i % palette.length]; });

  if (portfolioChartInstance) portfolioChartInstance.destroy();
  portfolioChartInstance = new Chart(document.getElementById('portfolioChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{ data: values, backgroundColor: colors, borderColor: '#f4f6f9', borderWidth: 3 }]
    },
    options: {
      responsive: true,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: '#e2e8f0',
          borderWidth: 1,
          titleColor: '#1a202c',
          bodyColor: '#64748b',
          padding: 10,
          callbacks: {
            label: function(ctx) {
              let pct = totalValue > 0 ? ((ctx.parsed / totalValue) * 100).toFixed(1) : 0;
              return '  $' + ctx.parsed.toFixed(2) + ' (' + pct + '%)';
            }
          }
        }
      }
    }
  });

  let legend = document.getElementById('portfolio-chart-legend');
  if (legend) {
    legend.innerHTML = validStocks.map(function(s, i) {
      let pct = totalValue > 0 ? ((s.value / totalValue) * 100).toFixed(1) : 0;
      return "<div class='port-legend-item'>" +
        "<div class='port-legend-dot' style='background:" + colors[i] + ";'></div>" +
        "<span class='port-legend-ticker'>" + s.ticker + "</span>" +
        "<span class='port-legend-pct'>" + pct + "%</span>" +
        "</div>";
    }).join('');
  }
}

function analyzePortfolioWithAI() {
  let active = getActivePortfolio();
  let portfolio = active ? migratePortfolio(active.stocks || []) : [];
  if (portfolio.length === 0) { showToast('Add stocks to your portfolio first!'); return; }
  if (!checkAnthropicRateLimit()) return;

  let section = document.getElementById('port-ai-section');
  let textEl  = document.getElementById('port-ai-text');
  let btn     = document.getElementById('port-ai-btn');
  section.style.display = 'block';
  textEl.textContent = 'Analyzing your portfolio...';
  btn.textContent = 'Analyzing...';
  btn.disabled = true;

  let holdingsSummary = portfolio.map(function(p) {
    let totalShares = p.lots.reduce(function(s, l) { return s + l.shares; }, 0);
    let totalCost   = p.lots.reduce(function(s, l) { return s + l.shares * l.price; }, 0);
    let avgPrice    = totalShares > 0 ? (totalCost / totalShares).toFixed(2) : 0;
    let histScore = JSON.parse(localStorage.getItem('history_score_' + p.ticker) || '[]');
    let score = histScore.length > 0 ? histScore[histScore.length - 1].score : null;
    return p.ticker + ' (' + totalShares + ' shares @ $' + avgPrice + (score ? ', score ' + score + '/100' : '') + ')';
  }).join('; ');

  let profileCtx = userProfile ? 'The reader is a ' + userProfile.type + ' investor with a ' + userProfile.horizon + ' time horizon and goal to ' + userProfile.goal + '. ' : '';
  let prompt = 'You are StockIQ, a plain-English financial education tool. Help this beginner understand what their portfolio actually looks like — not just listing numbers, but drawing real insights. Structure your response with these sections using bold headers: **Your Portfolio Snapshot**, **Diversification**, **What the Scores Tell Us**, **One Thing to Watch**. Under each header write 1-3 sentences in plain English. Be specific — reference the actual tickers and numbers. Point out any interesting patterns, concentrations, or contrasts between their holdings. Write like a knowledgeable friend who genuinely wants to help them learn. Never use the words buy, sell, invest, or recommend. Never give financial advice. ' +
    profileCtx +
    'Portfolio holdings: ' + holdingsSummary + '.';

  anthropicFetch({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.content && data.content[0] && data.content[0].text) {
      textEl.innerHTML = parseMarkdown(data.content[0].text);
      initPortfolioChat(holdingsSummary, profileCtx);
    } else {
      textEl.textContent = 'Analysis unavailable right now.';
    }
    btn.textContent = 'Refresh AI Insights';
    btn.disabled = false;
  })
  .catch(function() {
    textEl.textContent = 'Analysis unavailable right now.';
    btn.textContent = 'Refresh AI Insights';
    btn.disabled = false;
  });
}

let portfolioChatHistory = [];
let portfolioChatContext = '';
let portfolioStockData = [];

function initPortfolioChat(holdingsSummary, profileCtx) {
  portfolioChatHistory = [];
  portfolioChatContext = 'You are StockIQ, a financial education assistant. Help the user genuinely understand their portfolio — not just definitions, but real insight about what their holdings mean together. Write 3-4 sentences per answer. Be specific: reference actual tickers, numbers, patterns. Write like a knowledgeable friend. Never say buy, sell, invest, or recommend. If asked for direct advice, explain what the relevant concepts mean and what factors an informed person would consider. ' +
    profileCtx +
    'Their portfolio: ' + holdingsSummary + '.';
  let chatEl = document.getElementById('port-chat');
  let msgsEl = document.getElementById('port-chat-messages');
  if (chatEl) { chatEl.style.display = 'block'; }
  if (msgsEl) { msgsEl.innerHTML = ''; }
  let suggestEl = document.getElementById('port-chat-suggestions');
  if (suggestEl) suggestEl.style.display = 'flex';
}

function askPortfolioQuestion(question) {
  document.getElementById('port-chat-input').value = question;
  sendPortfolioQuestion();
}

function sendPortfolioQuestion() {
  let inputEl = document.getElementById('port-chat-input');
  let question = inputEl.value.trim();
  if (!question) return;
  inputEl.value = '';

  let msgsEl = document.getElementById('port-chat-messages');
  let suggestEl = document.getElementById('port-chat-suggestions');
  if (suggestEl) suggestEl.style.display = 'none';

  msgsEl.innerHTML += "<div class='chat-msg chat-msg-user'><div class='chat-bubble chat-bubble-user'>" + escHtml(question) + "</div></div>";

  let typingId = 'port-typing-' + Date.now();
  msgsEl.innerHTML += "<div class='chat-msg' id='" + typingId + "'><div class='chat-avatar'>AI</div><div class='chat-typing'><span></span><span></span><span></span></div></div>";
  requestAnimationFrame(function() { msgsEl.scrollTop = msgsEl.scrollHeight; });

  portfolioChatHistory.push({ role: 'user', content: question });
  if (!checkAnthropicRateLimit()) return;

  anthropicFetch({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: portfolioChatContext,
      messages: portfolioChatHistory
    })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    let typing = document.getElementById(typingId);
    if (typing) typing.remove();
    let reply = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : 'Sorry, I could not answer that right now.';
    portfolioChatHistory.push({ role: 'assistant', content: reply });
    msgsEl.innerHTML += "<div class='chat-msg'><div class='chat-avatar'>AI</div><div class='chat-bubble chat-bubble-ai'>" + parseMarkdown(reply) + "</div></div>";
    requestAnimationFrame(function() { msgsEl.scrollTop = msgsEl.scrollHeight; });
  })
  .catch(function() {
    let typing = document.getElementById(typingId);
    if (typing) typing.remove();
    msgsEl.innerHTML += "<div class='chat-msg'><div class='chat-avatar'>AI</div><div class='chat-bubble chat-bubble-ai'>Something went wrong. Try again.</div></div>";
  });
}

function updateStreak() {
  let today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  let streakData = JSON.parse(localStorage.getItem('streak') || '{"count":0,"lastDate":""}');
  let yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  let yesterdayStr = yesterday.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  if (streakData.lastDate === today) {
    return streakData.count;
  } else if (streakData.lastDate === yesterdayStr) {
    streakData.count += 1;
  } else {
    streakData.count = 1;
  }
  streakData.lastDate = today;
  localStorage.setItem('streak', JSON.stringify(streakData));
  saveToFirestore({ stats: { streak: streakData } });
  return streakData.count;
}

function getStreak() {
  return JSON.parse(localStorage.getItem('streak') || '{"count":0}').count;
}

// ── TIERED BADGE SYSTEM ───────────────────────────────────────────────────
// Bronze = first milestone | Silver = committed | Gold = elite
// Locked badges show only a padlock — surprise unlock

var BADGE_TIERS = {
  bronze: { label: 'Bronze', color: '#cd7f32', bg: 'rgba(205,127,50,0.12)', glow: 'rgba(205,127,50,0.3)' },
  silver: { label: 'Silver', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', glow: 'rgba(148,163,184,0.3)' },
  gold:   { label: 'Gold',   color: '#e07510', bg: 'rgba(224,117,16,0.12)',   glow: 'rgba(224,117,16,0.35)' }
};

var BADGE_DEFINITIONS = [
  // 🎓 Learning
  { id: 'analyst-bronze', group: 'analyst', tier: 'bronze', name: 'Analyst', desc: 'Analyzed your first stock',    icon: '🔍', check: function(s) { return s.analyzed >= 1; } },
  { id: 'analyst-silver', group: 'analyst', tier: 'silver', name: 'Analyst', desc: 'Analyzed 25 stocks',           icon: '🔍', check: function(s) { return s.analyzed >= 25; } },
  { id: 'analyst-gold',   group: 'analyst', tier: 'gold',   name: 'Analyst', desc: 'Analyzed 100 stocks',          icon: '🔍', check: function(s) { return s.analyzed >= 100; } },
  { id: 'scout-bronze',  group: 'scout', tier: 'bronze', name: 'Sector Scout', desc: 'Analyzed stocks in 3 sectors', icon: '🗺️', check: function(s) { return s.sectors >= 3; } },
  { id: 'scout-silver',  group: 'scout', tier: 'silver', name: 'Sector Scout', desc: 'Analyzed stocks in 6 sectors', icon: '🗺️', check: function(s) { return s.sectors >= 6; } },
  { id: 'scout-gold',    group: 'scout', tier: 'gold',   name: 'Sector Scout', desc: 'Analyzed all sectors',         icon: '🗺️', check: function(s) { return s.sectors >= 9; } },
  // 📈 Portfolio
  { id: 'builder-bronze', group: 'builder', tier: 'bronze', name: 'Builder', desc: 'Added your first stock',        icon: '🏗️', check: function(s) { return s.portfolioLen >= 1; } },
  { id: 'builder-silver', group: 'builder', tier: 'silver', name: 'Builder', desc: 'Portfolio of 5 stocks',         icon: '🏗️', check: function(s) { return s.portfolioLen >= 5; } },
  { id: 'builder-gold',   group: 'builder', tier: 'gold',   name: 'Builder', desc: 'Portfolio of 10 stocks',        icon: '🏗️', check: function(s) { return s.portfolioLen >= 10; } },
  { id: 'watchman-bronze', group: 'watchman', tier: 'bronze', name: 'Watchman', desc: 'Added to watchlist',          icon: '👁️', check: function(s) { return s.watchlistLen >= 1; } },
  { id: 'watchman-silver', group: 'watchman', tier: 'silver', name: 'Watchman', desc: '10 stocks on watchlist',      icon: '👁️', check: function(s) { return s.watchlistLen >= 10; } },
  { id: 'watchman-gold',   group: 'watchman', tier: 'gold',   name: 'Watchman', desc: '25 stocks on watchlist',      icon: '👁️', check: function(s) { return s.watchlistLen >= 25; } },
  // 🏆 Challenges
  { id: 'competitor-bronze', group: 'competitor', tier: 'bronze', name: 'Competitor', desc: 'Joined your first challenge', icon: '🏁', check: function(s) { return s.challengesJoined >= 1; } },
  { id: 'competitor-silver', group: 'competitor', tier: 'silver', name: 'Competitor', desc: 'Joined 5 challenges',         icon: '🏁', check: function(s) { return s.challengesJoined >= 5; } },
  { id: 'competitor-gold',   group: 'competitor', tier: 'gold',   name: 'Competitor', desc: 'Joined 15 challenges',        icon: '🏁', check: function(s) { return s.challengesJoined >= 15; } },
  { id: 'champion-bronze', group: 'champion', tier: 'bronze', name: 'Champion', desc: 'Won a challenge',        icon: '🏆', check: function(s) { return s.challengeWins >= 1; } },
  { id: 'champion-silver', group: 'champion', tier: 'silver', name: 'Champion', desc: 'Won 3 challenges',       icon: '🏆', check: function(s) { return s.challengeWins >= 3; } },
  { id: 'champion-gold',   group: 'champion', tier: 'gold',   name: 'Champion', desc: 'Won 5 challenges',       icon: '🏆', check: function(s) { return s.challengeWins >= 5; } },
  // 🔥 Consistency
  { id: 'streak-bronze', group: 'streak', tier: 'bronze', name: 'On Fire',  desc: '3-day streak',   icon: '🔥', check: function(s) { return s.streak >= 3; } },
  { id: 'streak-silver', group: 'streak', tier: 'silver', name: 'On Fire',  desc: '7-day streak',   icon: '🔥', check: function(s) { return s.streak >= 7; } },
  { id: 'streak-gold',   group: 'streak', tier: 'gold',   name: 'On Fire',  desc: '30-day streak',  icon: '🔥', check: function(s) { return s.streak >= 30; } },
  { id: 'dedicated-bronze', group: 'dedicated', tier: 'bronze', name: 'Dedicated', desc: 'Opened app 10 days',  icon: '📅', check: function(s) { return s.totalDays >= 10; } },
  { id: 'dedicated-silver', group: 'dedicated', tier: 'silver', name: 'Dedicated', desc: 'Opened app 30 days',  icon: '📅', check: function(s) { return s.totalDays >= 30; } },
  { id: 'dedicated-gold',   group: 'dedicated', tier: 'gold',   name: 'Dedicated', desc: 'Opened app 100 days', icon: '📅', check: function(s) { return s.totalDays >= 100; } },
];

function getBadgeStats() {
  var analyzed    = parseInt(localStorage.getItem('total-analyzed') || '0');
  var watchlist   = JSON.parse(localStorage.getItem('watchlist') || '[]');
  var active      = getActivePortfolio();
  var portfolioLen = active ? (active.stocks || []).length : 0;
  var streak      = getStreak();
  var totalDays   = parseInt(localStorage.getItem('total-days') || '0');
  var all         = getAllPortfolios();
  var challengesJoined = Object.values(all).filter(function(p) { return p.challengeId; }).length;
  // Sector count from analyzed history
  var sectorKeys  = Object.keys(localStorage).filter(function(k) { return k.startsWith('history_score_'); });
  var sectors     = parseInt(localStorage.getItem('sectors-analyzed') || '0');
  // Challenge wins from Firestore badges (loaded async separately)
  var challengeWins = parseInt(localStorage.getItem('challenge-wins') || '0');

  return { analyzed, watchlistLen: watchlist.length, portfolioLen, streak, totalDays, challengesJoined, sectors, challengeWins };
}

function renderBadges(analyzed, watchlistLen, portfolioLen, streak) {
  var stats = getBadgeStats();
  // Also load Firestore badges for challenge wins + special badges
  var uid = currentUid();
  if (uid) {
    db.collection('users').doc(uid).get().then(function(doc) {
      var data = doc.exists ? doc.data() : {};
      var firestoreBadges = data.badges || [];
      var wins = firestoreBadges.filter(function(b) { return b.id && b.id.startsWith('challenge-winner'); }).length;
      localStorage.setItem('challenge-wins', wins);
      _renderBadgeGrid(Object.assign(stats, { challengeWins: wins }), firestoreBadges);
    }).catch(function() { _renderBadgeGrid(stats, []); });
  } else {
    _renderBadgeGrid(stats, []);
  }
}

function _renderBadgeGrid(stats, firestoreBadges) {
  var grid = document.getElementById('badges-grid');
  if (!grid) return;

  var earned = BADGE_DEFINITIONS.filter(function(b) { return b.check(stats); });
  var earnedIds = earned.map(function(b) { return b.id; });
  // Add any Firestore-only badges (challenge winner, etc.)
  firestoreBadges.forEach(function(b) { if (!earnedIds.includes(b.id)) earnedIds.push(b.id); });

  var progressEl = document.getElementById('badges-progress');
  if (progressEl) progressEl.textContent = earnedIds.length + ' unlocked';

  // Group by group — show highest earned tier per group + locked slots
  var groups = {};
  BADGE_DEFINITIONS.forEach(function(b) {
    if (!groups[b.group]) groups[b.group] = [];
    groups[b.group].push(b);
  });

  var html = '';
  Object.values(groups).forEach(function(tiers) {
    var highestEarned = null;
    tiers.forEach(function(b) { if (earnedIds.includes(b.id)) highestEarned = b; });
    var nextLocked = tiers.find(function(b) { return !earnedIds.includes(b.id); });
    var display = highestEarned || nextLocked;
    if (!display) return;
    var isEarned = !!highestEarned;
    var t = BADGE_TIERS[display.tier];
    html += '<div class="badge-item' + (isEarned ? ' earned' : ' locked') + '" style="' +
      (isEarned ? 'border-color:' + t.color + ';background:' + t.bg + ';box-shadow:0 0 0 1px ' + t.glow + ';' : '') + '">' +
      (isEarned
        ? '<div class="badge-icon">' + display.icon + '</div>' +
          '<div class="badge-name">' + escHtml(display.name) + '</div>' +
          '<div class="badge-tier-label" style="color:' + t.color + ';">' + t.label + '</div>'
        : '<div class="badge-icon badge-icon-locked">🔒</div>' +
          '<div class="badge-name">???</div>') +
    '</div>';
  });

  // Append any Firestore-only special badges (challenge winner)
  firestoreBadges.filter(function(b) { return b.id && b.id.startsWith('challenge-winner'); }).forEach(function(b) {
    var t = BADGE_TIERS.gold;
    html += '<div class="badge-item earned" style="border-color:' + t.color + ';background:' + t.bg + ';box-shadow:0 0 0 1px ' + t.glow + ';">' +
      '<div class="badge-icon">🏆</div>' +
      '<div class="badge-name">Champion</div>' +
      '<div class="badge-tier-label" style="color:' + t.color + ';">Gold</div>' +
    '</div>';
  });

  grid.innerHTML = html;
}

var AVATAR_GRADIENTS = [
  { id: 'emerald',  label: 'Emerald',  g: 'linear-gradient(135deg,#059669,#10b981)' },
  { id: 'ocean',    label: 'Ocean',    g: 'linear-gradient(135deg,#0284c7,#38bdf8)' },
  { id: 'violet',   label: 'Violet',   g: 'linear-gradient(135deg,#7c3aed,#a78bfa)' },
  { id: 'rose',     label: 'Rose',     g: 'linear-gradient(135deg,#e11d48,#fb7185)' },
  { id: 'amber',    label: 'Amber',    g: 'linear-gradient(135deg,#e07510,#fbbf24)' },
  { id: 'indigo',   label: 'Indigo',   g: 'linear-gradient(135deg,#4338ca,#818cf8)' },
  { id: 'teal',     label: 'Teal',     g: 'linear-gradient(135deg,#0f766e,#2dd4bf)' },
  { id: 'crimson',  label: 'Crimson',  g: 'linear-gradient(135deg,#b91c1c,#f87171)' },
  { id: 'slate',    label: 'Slate',    g: 'linear-gradient(135deg,#334155,#64748b)' },
  { id: 'fuchsia',  label: 'Fuchsia',  g: 'linear-gradient(135deg,#a21caf,#e879f9)' },
  { id: 'lime',     label: 'Lime',     g: 'linear-gradient(135deg,#4d7c0f,#86efac)' },
  { id: 'copper',   label: 'Copper',   g: 'linear-gradient(135deg,#92400e,#fbbf24)' },
  { id: 'night',    label: 'Night',    g: 'linear-gradient(135deg,#1e1b4b,#4f46e5)' },
  { id: 'coral',    label: 'Coral',    g: 'linear-gradient(135deg,#c2410c,#fb923c)' },
  { id: 'pine',     label: 'Pine',     g: 'linear-gradient(135deg,#14532d,#4ade80)' },
  { id: 'sky',      label: 'Sky',      g: 'linear-gradient(135deg,#075985,#7dd3fc)' }
];

function getAvatarInitials(name) {
  let parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getGradientById(id) {
  var g = AVATAR_GRADIENTS.find(function(x) { return x.id === id; });
  return g ? g.g : AVATAR_GRADIENTS[0].g;
}

var _selectedAvatarSeed = null;

function renderAvatarPicker(currentSeed) {
  var picker = document.getElementById('avatar-picker');
  if (!picker) return;
  _selectedAvatarSeed = currentSeed || null;
  picker.innerHTML = AVATAR_GRADIENTS.map(function(av) {
    var selected = av.id === _selectedAvatarSeed;
    return '<button type="button" class="avatar-option' + (selected ? ' selected' : '') +
      '" onclick="selectAvatar(\'' + av.id + '\')" title="' + av.label +
      '" style="background:' + av.g + ';"></button>';
  }).join('');
}

function selectAvatar(id) {
  _selectedAvatarSeed = id;
  document.querySelectorAll('.avatar-option').forEach(function(btn) {
    btn.classList.toggle('selected', btn.title === AVATAR_GRADIENTS.find(function(x){ return x.id === id; }).label);
  });
}

function loadUserInfo() {
  let info = JSON.parse(localStorage.getItem('user-info') || '{}');
  let name     = info.name     || '';
  let username = info.username || '';
  let email    = info.email    || '';
  let seed     = info.avatarSeed || '';

  let avatar = document.getElementById('user-avatar');
  let nameEl = document.getElementById('user-name-display');
  let usernameEl = document.getElementById('user-username-display');
  let emailEl = document.getElementById('user-email-display');

  if (avatar) {
    avatar.innerHTML = name ? getAvatarInitials(name) : '?';
    avatar.style.background = seed ? getGradientById(seed) : 'linear-gradient(135deg,#059669,#10b981)';
    avatar.style.padding = '';
  }
  if (nameEl) nameEl.textContent = name || 'Set your name';
  if (usernameEl) usernameEl.textContent = username ? '@' + username.replace(/^@/, '') : '@username';
  if (emailEl) emailEl.textContent = email || 'Add your email';
}

function toggleEditProfile() {
  let card = document.getElementById('user-info-card');
  let form = document.getElementById('user-edit-form');
  let isEditing = form.style.display !== 'none';

  if (!isEditing) {
    let info = JSON.parse(localStorage.getItem('user-info') || '{}');
    document.getElementById('input-name').value     = info.name     || '';
    document.getElementById('input-username').value = info.username || '';
    document.getElementById('input-email').value    = info.email    || '';
    renderAvatarPicker(info.avatarSeed || null);
    card.style.display = 'none';
    form.style.display = 'block';
  } else {
    card.style.display = 'flex';
    form.style.display = 'none';
  }
}

function saveUserInfo() {
  let name       = document.getElementById('input-name').value.trim();
  let username   = document.getElementById('input-username').value.trim().replace(/^@/, '');
  let email      = document.getElementById('input-email').value.trim();
  let avatarSeed = _selectedAvatarSeed || (JSON.parse(localStorage.getItem('user-info') || '{}').avatarSeed) || '';
  localStorage.setItem('user-info', JSON.stringify({ name, username, email, avatarSeed }));
  saveToFirestore({ name, username, email, avatarSeed });
  loadUserInfo();
  toggleEditProfile();
  showToast('Profile saved');
}

// ── WEEKLY CHALLENGE + LEADERBOARD ───────────────────────────────────────────

var ADMIN_EMAIL = 'agomezvelasco23@gmail.com';
var _activeChallenges = []; // loaded from Firestore
var _isAdmin = false;

function isAdmin() {
  var u = auth.currentUser;
  return u && u.email === ADMIN_EMAIL;
}

function getDisplayName() {
  var info = JSON.parse(localStorage.getItem('user-info') || '{}');
  if (info.name) return info.name;
  var u = auth.currentUser;
  return u ? (u.displayName || u.email.split('@')[0]) : 'Investor';
}

function fmtChallengeDate(ts) {
  if (!ts) return '';
  var d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysLeftText(endTs) {
  if (!endTs) return '';
  var end = endTs.toDate ? endTs.toDate() : new Date(endTs);
  var ms = end - Date.now();
  var days = Math.ceil(ms / 86400000);
  if (days <= 0) return 'Ended';
  if (days === 1) return '1 day left';
  return days + ' days left';
}

// ── Load active challenges from Firestore ─────────────────────────────────
function loadActiveChallenges(callback) {
  db.collection('challenges')
    .where('status', '==', 'active')
    .get()
    .then(function(snap) {
      _activeChallenges = [];
      snap.forEach(function(doc) { _activeChallenges.push(Object.assign({ id: doc.id }, doc.data())); });
      _activeChallenges.sort(function(a, b) { return (b.startDate && b.startDate.seconds || 0) - (a.startDate && a.startDate.seconds || 0); });
      if (callback) callback(_activeChallenges);
    })
    .catch(function(e) { console.error('loadActiveChallenges error:', e); if (callback) callback([]); });
}

// ── Join a challenge (creates paper portfolio) ────────────────────────────
function joinChallenge(challengeId) {
  var challenge = _activeChallenges.find(function(c) { return c.id === challengeId; });
  if (!challenge) return;
  // Premium gate
  if (challenge.isPremium) {
    var uid = currentUid();
    if (!uid) { showToast('Sign in to join premium challenges.'); return; }
    db.collection('users').doc(uid).get().then(function(doc) {
      var data = doc.exists ? doc.data() : {};
      if (!data.isPremium) { showToast('This is a Premium challenge. Contact us to upgrade.'); return; }
      _doJoinChallenge(challengeId, challenge);
    }).catch(function() { showToast('Could not verify premium status. Try again.'); });
    return;
  }
  _doJoinChallenge(challengeId, challenge);
}

function _doJoinChallenge(challengeId, challenge) {
  var all = getAllPortfolios();
  var existing = Object.entries(all).find(function(e) { return e[1].challengeId === challengeId; });
  if (existing) {
    setActivePortfolio(existing[0]);
    showTab('portfolio');
    showToast('Switching to your challenge portfolio!');
    return;
  }
  var balance = challenge.startingBalance || 10000;
  var id = 'port_' + Date.now();
  all[id] = {
    name: challenge.title,
    isPaper: true, isDemo: false,
    challengeId: challengeId,
    challengeTier: challenge.tier || 'intermediate',
    balanceCurrency: challenge.balanceCurrency || 'USD',
    paperBalance: balance, startingBalance: balance,
    stocks: [], closedPositions: [], valueHistory: []
  };
  localStorage.setItem('portfolios', JSON.stringify(all));
  localStorage.setItem('activePortfolioId', id);
  saveToFirestore({ portfolios: all, activePortfolioId: id });
  _spyBenchmark = null;
  renderPortfolioTabs();
  showTab('portfolio');
  var sym = _currency === 'MXN' ? 'MX$' : '$';
  showToast('Challenge joined! Start with ' + sym + balance.toLocaleString('en-US') + ' virtual cash.');
}

// ── Update leaderboard entry in Firestore ─────────────────────────────────
function updateChallengeEntry(totalValueUSD, totalCostUSD, avgScore, stockData) {
  var uid = currentUid();
  if (!uid) return;
  var all = getAllPortfolios();
  var id = getActiveId();
  var p = all[id];
  if (!p || !p.challengeId) return;
  var challengeId = p.challengeId;
  var returnPct = totalCostUSD > 0 ? ((totalValueUSD - totalCostUSD) / totalCostUSD * 100) : 0;
  var scoreWeight = avgScore || 0;
  var rankScore = returnPct * ((scoreWeight > 0 ? scoreWeight : 50) / 100);
  var holdings = (stockData || []).map(function(s) {
    return { ticker: s.ticker, shares: parseFloat((s.shares || 0).toFixed(4)), currentValue: parseFloat((s.value || 0).toFixed(2)) };
  });
  db.collection('challenges').doc(challengeId).collection('entries').doc(uid).set({
    displayName: getDisplayName(),
    tier: p.challengeTier || 'intermediate',
    returnPct: parseFloat(returnPct.toFixed(3)),
    avgScore: scoreWeight,
    rankScore: parseFloat(rankScore.toFixed(4)),
    portfolioValue: parseFloat(totalValueUSD.toFixed(2)),
    cashBalance: parseFloat((p.paperBalance || 0).toFixed(2)),
    startingBalance: parseFloat((p.startingBalance || 10000).toFixed(2)),
    holdings: holdings,
    updatedAt: Date.now()
  }, { merge: true }).catch(function() {});
}

// ── Leaderboard per challenge ──────────────────────────────────────────────
function loadLeaderboard(challengeId, containerId) {
  var el = document.getElementById(containerId || 'leaderboard-body');
  if (!el) return;
  el.innerHTML = '<div class="lb-loading">Loading…</div>';
  db.collection('challenges').doc(challengeId).collection('entries')
    .orderBy('rankScore', 'desc')
    .limit(50)
    .get()
    .then(function(snap) {
      var entries = [];
      snap.forEach(function(doc) { entries.push(Object.assign({ uid: doc.id }, doc.data())); });
      renderLeaderboardEntries(entries, containerId || 'leaderboard-body', 'leaderboard-my-rank-' + challengeId);
    })
    .catch(function() {
      el.innerHTML = '<div class="lb-loading">Could not load leaderboard.</div>';
    });
}

function renderLeaderboardEntries(entries, bodyId, myRankId) {
  var el = document.getElementById(bodyId);
  var myRankEl = myRankId ? document.getElementById(myRankId) : null;
  var uid = currentUid();
  if (!el) return;
  if (entries.length === 0) {
    el.innerHTML = '<div class="lb-empty">No entries yet — be the first to join!</div>';
    if (myRankEl) myRankEl.style.display = 'none';
    return;
  }
  _profileLbEntries = entries;
  var medals = ['🥇', '🥈', '🥉'];
  var top10 = entries.slice(0, 10);
  var myIdx = entries.findIndex(function(e) { return e.uid === uid; });
  el.innerHTML = top10.map(function(e, i) {
    var isMe = e.uid === uid;
    var rank = medals[i] || ('#' + (i + 1));
    var sign = e.returnPct >= 0 ? '+' : '';
    var retColor = e.returnPct >= 0 ? '#128257' : '#dc2626';
    return '<div class="lb-row' + (isMe ? ' lb-row-me' : '') + '" data-idx="' + i + '" onclick="openPublicProfileModal(\'profile\',' + i + ')" style="cursor:pointer;">' +
      '<span class="lb-rank">' + rank + '</span>' +
      '<span class="lb-name">' + escHtml(e.displayName || 'Investor') + (isMe ? ' <span class="lb-you-badge">You</span>' : '') + '</span>' +
      '<span class="lb-score">' + (e.avgScore || '—') + '<span class="lb-score-label">/100</span></span>' +
      '<span class="lb-return" style="color:' + retColor + ';">' + sign + (e.returnPct || 0).toFixed(2) + '%</span>' +
    '</div>';
  }).join('');
  if (myRankEl) {
    if (myIdx >= 10) {
      var me = entries[myIdx];
      var sign = me.returnPct >= 0 ? '+' : '';
      myRankEl.style.display = 'flex';
      myRankEl.innerHTML = '<span class="lb-rank">#' + (myIdx + 1) + '</span>' +
        '<span class="lb-name">' + escHtml(me.displayName || 'You') + ' <span class="lb-you-badge">You</span></span>' +
        '<span class="lb-score">' + (me.avgScore || '—') + '<span class="lb-score-label">/100</span></span>' +
        '<span class="lb-return">' + sign + (me.returnPct || 0).toFixed(2) + '%</span>';
    } else {
      myRankEl.style.display = 'none';
    }
  }
}

// ── Render challenge cards ─────────────────────────────────────────────────
function renderChallengeSection() {
  var container = document.getElementById('challenge-header');
  if (!container) return;
  var all = getAllPortfolios();
  loadActiveChallenges(function(challenges) {
    if (challenges.length === 0) {
      container.innerHTML = '<div class="lb-empty" style="padding:20px 0;">No active challenges right now. Check back soon!</div>';
      // Still render leaderboard section empty
      var lbSection = document.getElementById('leaderboard-section');
      if (lbSection) lbSection.style.display = 'none';
      renderAdminPanel();
      return;
    }
    var lbSection = document.getElementById('leaderboard-section');
    if (lbSection) lbSection.style.display = 'block';

    var TIER_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
    var TIER_COLORS = { beginner: '#128257', intermediate: '#0284c7', advanced: '#7c3aed' };

    container.innerHTML = challenges.map(function(c) {
      var hasJoined = Object.values(all).some(function(p) { return p.challengeId === c.id; });
      var tier = c.tier || 'intermediate';
      var color = TIER_COLORS[tier] || '#0284c7';
      var balCur = c.balanceCurrency || 'USD';
      var sym = balCur === 'MXN' ? 'MX$' : '$';
      var balance = c.startingBalance || 10000;
      var balDisplay = sym + balance.toLocaleString('en-US') + ' ' + balCur;
      var prizeHtml = c.prizeDescription
        ? '<span class="challenge-prize-pill">Prize: ' + escHtml(c.prizeDescription) + '</span>'
        : '';
      return '<div class="challenge-card" style="border-color:' + color + '33;">' +
        '<div class="challenge-card-top">' +
          '<span class="challenge-tier-pill" style="background:' + color + '1a;color:' + color + ';">' + TIER_LABELS[tier] + '</span>' +
          '<span class="challenge-timer-pill">' + daysLeftText(c.endDate) + '</span>' +
        '</div>' +
        '<div class="challenge-title">' + escHtml(c.title) + '</div>' +
        '<div class="challenge-desc">' + escHtml(c.description) + '</div>' +
        '<div class="challenge-card-footer">' +
          '<span class="challenge-balance-pill">' + balDisplay + ' starting cash</span>' +
          prizeHtml +
          (c.endDate ? '<span class="challenge-date-pill">Ends ' + fmtChallengeDate(c.endDate) + '</span>' : '') +
        '</div>' +
        '<button class="challenge-join-btn' + (hasJoined ? ' joined' : '') + '" style="' + (hasJoined ? '' : 'background:' + color + ';') + '" onclick="joinChallenge(\'' + c.id + '\')">' +
          (hasJoined ? '▶ View Portfolio' : 'Join Challenge') +
        '</button>' +
      '</div>';
    }).join('');

    // Render leaderboard for the first active challenge
    var lbBodyEl = document.getElementById('leaderboard-body');
    var lbMyRankEl = document.getElementById('leaderboard-my-rank');
    if (lbMyRankEl) lbMyRankEl.id = 'leaderboard-my-rank-' + challenges[0].id;
    loadLeaderboard(challenges[0].id, 'leaderboard-body');

    renderAdminPanel();
  });
}

// ── ADMIN PANEL ───────────────────────────────────────────────────────────
function renderAdminPanel() {
  var el = document.getElementById('admin-panel');
  if (!el) return;
  if (!isAdmin()) { el.style.display = 'none'; return; }
  el.style.display = 'block';

  // Load all challenges (including drafts/ended) for admin
  db.collection('challenges').limit(20).get()
    .then(function(snap) {
      var all = [];
      snap.forEach(function(doc) { all.push(Object.assign({ id: doc.id }, doc.data())); });
      all.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      renderAdminChallengeList(all);
    }).catch(function(e) { console.error('renderAdminPanel error:', e); });
}

function renderAdminChallengeList(challenges) {
  var listEl = document.getElementById('admin-challenge-list');
  if (!listEl) return;
  if (challenges.length === 0) {
    listEl.innerHTML = '<div class="lb-empty">No challenges yet.</div>';
    return;
  }
  var STATUS_COLOR = { draft: '#64748b', active: '#128257', ended: '#dc2626' };
  listEl.innerHTML = challenges.map(function(c) {
    var color = STATUS_COLOR[c.status] || '#64748b';
    var startStr = c.startDate ? new Date(c.startDate.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    var endStr   = c.endDate   ? new Date(c.endDate.seconds   * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    var balCur   = c.balanceCurrency || 'USD';
    var balSym   = balCur === 'MXN' ? 'MX$' : '$';
    return '<div class="admin-challenge-row" id="admin-row-' + c.id + '">' +
      '<div class="admin-challenge-info">' +
        '<span class="admin-challenge-title">' + escHtml(c.title) + '</span>' +
        '<span class="admin-status-pill" style="color:' + color + ';border-color:' + color + '33;">' + (c.status || 'draft') + '</span>' +
        (c.tier ? '<span class="admin-tier-label">' + c.tier + '</span>' : '') +
        (startStr ? '<span class="admin-date-label">' + startStr + ' → ' + endStr + '</span>' : '') +
        '<span class="admin-date-label">' + balSym + (c.startingBalance || 0).toLocaleString('en-US') + ' ' + balCur + '</span>' +
      '</div>' +
      '<div class="admin-challenge-actions">' +
        (c.status === 'draft' ? '<button class="admin-btn admin-btn-edit" onclick="adminEditChallenge(\'' + c.id + '\')">Edit</button>' : '') +
        (c.status === 'draft' ? '<button class="admin-btn admin-btn-publish" onclick="adminPublishChallenge(\'' + c.id + '\')">Publish</button>' : '') +
        (c.status === 'active' ? '<button class="admin-btn admin-btn-results" onclick="adminToggleResults(\'' + c.id + '\')">Results</button>' : '') +
        (c.status === 'active' ? '<button class="admin-btn admin-btn-end" onclick="adminEndChallenge(\'' + c.id + '\')">End & Crown</button>' : '') +
        (c.status === 'ended' ? '<button class="admin-btn admin-btn-results" onclick="adminToggleResults(\'' + c.id + '\')">Results</button>' : '') +
        (c.status === 'ended' ? '<span class="admin-ended-label">' + (c.winnerName ? 'Winner: ' + escHtml(c.winnerName) : 'No winner') + '</span>' : '') +
        '<button class="admin-btn admin-btn-delete" onclick="adminDeleteChallenge(\'' + c.id + '\')">Delete</button>' +
      '</div>' +
      '<div class="admin-results-panel" id="admin-results-' + c.id + '" style="display:none;"></div>' +
    '</div>';
  }).join('');
}

function adminDeleteChallenge(id) {
  if (!isAdmin()) return;
  if (!confirm('Delete this challenge? This cannot be undone.')) return;
  db.collection('challenges').doc(id).delete()
    .then(function() { showToast('Challenge deleted.'); renderChallengeSection(); })
    .catch(function() { showToast('Error deleting challenge'); });
}

function adminToggleResults(id) {
  var panel = document.getElementById('admin-results-' + id);
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  panel.innerHTML = '<div class="lb-loading">Loading results…</div>';
  db.collection('challenges').doc(id).collection('entries')
    .orderBy('rankScore', 'desc').limit(50).get()
    .then(function(snap) {
      var entries = [];
      snap.forEach(function(doc) { entries.push(Object.assign({ uid: doc.id }, doc.data())); });
      if (entries.length === 0) { panel.innerHTML = '<div class="lb-empty">No entries yet.</div>'; return; }
      var medals = ['🥇', '🥈', '🥉'];
      panel.innerHTML =
        '<div class="admin-results-header">Results (' + entries.length + ' participants)</div>' +
        '<div class="lb-cols-header" style="margin-top:8px;">' +
          '<span class="lb-col-rank">Rank</span>' +
          '<span class="lb-col-name">Player</span>' +
          '<span class="lb-col-score">Score</span>' +
          '<span class="lb-col-return">Return</span>' +
        '</div>' +
        entries.map(function(e, i) {
          var sign = e.returnPct >= 0 ? '+' : '';
          var retColor = e.returnPct >= 0 ? '#128257' : '#dc2626';
          var rank = medals[i] || ('#' + (i + 1));
          var holdingsHtml = '';
          if (e.holdings && e.holdings.length > 0) {
            holdingsHtml = '<div class="admin-holdings-panel" id="admin-h-' + id + '-' + i + '" style="display:none;">' +
              '<div class="admin-holdings-row" style="font-weight:700;color:var(--text-muted);font-size:11px;"><span>Ticker</span><span>Shares</span><span>Value</span></div>' +
              e.holdings.map(function(h) {
                return '<div class="admin-holdings-row"><span>' + escHtml(h.ticker) + '</span><span>' + h.shares + '</span><span>$' + (h.currentValue || 0).toLocaleString('en-US') + '</span></div>';
              }).join('') +
            '</div>';
          }
          return '<div class="lb-row admin-result-row" onclick="adminToggleHoldings(\'admin-h-' + id + '-' + i + '\')" style="cursor:pointer;">' +
            '<span class="lb-rank">' + rank + '</span>' +
            '<span class="lb-name">' + escHtml(e.displayName || 'Investor') + (e.holdings && e.holdings.length ? ' <span class="admin-holdings-toggle">▾</span>' : '') + '</span>' +
            '<span class="lb-score">' + (e.avgScore || '—') + '<span class="lb-score-label">/100</span></span>' +
            '<span class="lb-return" style="color:' + retColor + ';">' + sign + (e.returnPct || 0).toFixed(2) + '%</span>' +
          '</div>' + holdingsHtml;
        }).join('');
    })
    .catch(function() { panel.innerHTML = '<div class="lb-empty">Could not load results.</div>'; });
}

function adminToggleHoldings(panelId) {
  var el = document.getElementById(panelId);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function adminEditChallenge(id) {
  if (!isAdmin()) return;
  db.collection('challenges').doc(id).get().then(function(doc) {
    if (!doc.exists) return;
    var c = doc.data();
    // Open the form and pre-fill
    var form = document.getElementById('admin-create-form');
    if (form) form.style.display = 'block';
    var set = function(elId, val) { var el = document.getElementById(elId); if (el) el.value = val || ''; };
    set('admin-new-title', c.title);
    set('admin-new-desc', c.description);
    set('admin-new-tier', c.tier || 'intermediate');
    set('admin-new-balance', c.startingBalance || 10000);
    set('admin-new-balance-currency', c.balanceCurrency || 'USD');
    set('admin-new-start', c.startDate ? new Date(c.startDate.seconds * 1000).toISOString().split('T')[0] : '');
    set('admin-new-end',   c.endDate   ? new Date(c.endDate.seconds   * 1000).toISOString().split('T')[0] : '');
    set('admin-new-prize-type', c.prizeType || '');
    set('admin-new-prize-value', c.prizeValue || '');
    set('admin-new-prize-desc', c.prizeDescription || '');
    set('admin-new-challenge-type', c.challengeType || 'Best Return');
    set('admin-new-win-factor', c.winFactor || 'return_pct');
    set('admin-new-rules', c.rules || '');
    var premEl = document.getElementById('admin-new-is-premium'); if (premEl) premEl.checked = !!(c.isPremium);
    // Change Save button to update instead of create
    var saveBtn = document.querySelector('#admin-create-form .admin-btn-save');
    if (saveBtn) {
      saveBtn.textContent = 'Save Changes';
      saveBtn.onclick = function() { adminUpdateChallenge(id); };
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }).catch(function() { showToast('Could not load challenge'); });
}

function adminUpdateChallenge(id) {
  if (!isAdmin()) return;
  var title       = (document.getElementById('admin-new-title') || {}).value || '';
  var description = (document.getElementById('admin-new-desc') || {}).value || '';
  var tier        = (document.getElementById('admin-new-tier') || {}).value || 'intermediate';
  var balance     = parseFloat((document.getElementById('admin-new-balance') || {}).value) || 10000;
  var balCurrency = (document.getElementById('admin-new-balance-currency') || {}).value || 'USD';
  var startStr    = (document.getElementById('admin-new-start') || {}).value || '';
  var endStr      = (document.getElementById('admin-new-end') || {}).value || '';
  var prizeType     = (document.getElementById('admin-new-prize-type') || {}).value || '';
  var prizeDesc     = (document.getElementById('admin-new-prize-desc') || {}).value || '';
  var prizeValue    = parseFloat((document.getElementById('admin-new-prize-value') || {}).value) || 0;
  var challengeType = (document.getElementById('admin-new-challenge-type') || {}).value || 'Best Return';
  var winFactor     = (document.getElementById('admin-new-win-factor') || {}).value || 'return_pct';
  var isPremium     = !!(document.getElementById('admin-new-is-premium') || {}).checked;
  var rules         = (document.getElementById('admin-new-rules') || {}).value || '';
  if (!title || !description || !startStr || !endStr) { showToast('Fill in all required fields'); return; }
  var update = {
    title: title.trim(), description: description.trim(), tier: tier,
    startingBalance: balance, balanceCurrency: balCurrency,
    startDate: firebase.firestore.Timestamp.fromDate(new Date(startStr)),
    endDate:   firebase.firestore.Timestamp.fromDate(new Date(endStr)),
    prizeType: prizeType, prizeDescription: prizeDesc, prizeValue: prizeValue,
    challengeType: challengeType, winFactor: winFactor, isPremium: isPremium, rules: rules.trim()
  };
  db.collection('challenges').doc(id).update(update)
    .then(function() {
      showToast('Challenge updated!');
      toggleAdminForm();
      // Reset save button back to create mode
      var saveBtn = document.querySelector('#admin-create-form .admin-btn-save');
      if (saveBtn) { saveBtn.textContent = 'Save as Draft'; saveBtn.onclick = adminCreateChallenge; }
      renderChallengeSection();
    })
    .catch(function(e) { showToast('Error: ' + e.message); });
}

function adminPublishChallenge(id) {
  if (!isAdmin()) return;
  db.collection('challenges').doc(id).update({ status: 'active' })
    .then(function() { showToast('Challenge published!'); renderChallengeSection(); })
    .catch(function() { showToast('Error publishing challenge'); });
}

function adminEndChallenge(id) {
  if (!isAdmin()) return;
  if (!confirm('End this challenge and crown the winner?')) return;
  // Get top entry
  db.collection('challenges').doc(id).collection('entries')
    .orderBy('rankScore', 'desc').limit(1).get()
    .then(function(snap) {
      var winner = null;
      snap.forEach(function(doc) { winner = Object.assign({ uid: doc.id }, doc.data()); });
      var update = { status: 'ended' };
      if (winner) {
        update.winnerUid = winner.uid;
        update.winnerName = winner.displayName || 'Unknown';
        // Award winner badge in their user doc
        db.collection('users').doc(winner.uid).set({
          badges: firebase.firestore.FieldValue.arrayUnion({
            id: 'challenge-winner-' + id,
            name: 'Challenge Winner',
            tier: 'gold',
            challengeId: id,
            earnedAt: Date.now()
          })
        }, { merge: true }).catch(function() {});
      }
      return db.collection('challenges').doc(id).update(update);
    })
    .then(function() { showToast('Challenge ended! Winner crowned.'); renderChallengeSection(); })
    .catch(function() { showToast('Error ending challenge'); });
}

function adminCreateChallenge() {
  if (!isAdmin()) return;
  var title       = (document.getElementById('admin-new-title') || {}).value || '';
  var description = (document.getElementById('admin-new-desc') || {}).value || '';
  var tier        = (document.getElementById('admin-new-tier') || {}).value || 'intermediate';
  var balance     = parseFloat((document.getElementById('admin-new-balance') || {}).value) || 10000;
  var balCurrency = (document.getElementById('admin-new-balance-currency') || {}).value || 'USD';
  var startStr    = (document.getElementById('admin-new-start') || {}).value || '';
  var endStr      = (document.getElementById('admin-new-end') || {}).value || '';
  var prizeType      = (document.getElementById('admin-new-prize-type') || {}).value || '';
  var prizeDesc      = (document.getElementById('admin-new-prize-desc') || {}).value || '';
  var prizeValue     = parseFloat((document.getElementById('admin-new-prize-value') || {}).value) || 0;
  var challengeType  = (document.getElementById('admin-new-challenge-type') || {}).value || 'Best Return';
  var winFactor      = (document.getElementById('admin-new-win-factor') || {}).value || 'return_pct';
  var isPremium      = !!(document.getElementById('admin-new-is-premium') || {}).checked;
  var rules          = (document.getElementById('admin-new-rules') || {}).value || '';

  if (!title || !description || !startStr || !endStr) { showToast('Fill in all required fields'); return; }

  var doc = {
    title: title.trim(),
    description: description.trim(),
    tier: tier,
    startingBalance: balance,
    balanceCurrency: balCurrency,
    startDate: firebase.firestore.Timestamp.fromDate(new Date(startStr)),
    endDate: firebase.firestore.Timestamp.fromDate(new Date(endStr)),
    challengeType: challengeType,
    winFactor: winFactor,
    isPremium: isPremium,
    rules: rules.trim(),
    status: 'draft',
    createdAt: Date.now()
  };
  if (prizeType) {
    doc.prizeType = prizeType;
    doc.prizeDescription = prizeDesc;
    doc.prizeValue = prizeValue;
    doc.prizeCurrency = _currency;
  }

  db.collection('challenges').add(doc)
    .then(function() {
      showToast('Challenge saved as draft!');
      // Clear form
      ['admin-new-title','admin-new-desc','admin-new-start','admin-new-end','admin-new-prize-desc','admin-new-prize-value','admin-new-rules'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
      });
      var premEl = document.getElementById('admin-new-is-premium'); if (premEl) premEl.checked = false;
      renderChallengeSection();
    })
    .catch(function(e) { showToast('Error: ' + e.message); });
}

function toggleAdminForm() {
  var form = document.getElementById('admin-create-form');
  if (!form) return;
  var isHiding = form.style.display !== 'none';
  form.style.display = isHiding ? 'none' : 'block';
  if (isHiding) {
    // Reset save button back to create mode when closing
    var saveBtn = document.querySelector('#admin-create-form .admin-btn-save');
    if (saveBtn) { saveBtn.textContent = 'Save as Draft'; saveBtn.onclick = adminCreateChallenge; }
  }
}

// ── Analyze tab challenge banner ───────────────────────────────────────────
var _miniLbEntries = [];

function renderAnalyzeChallengeBanner() {
  var bannerEl = document.getElementById('analyze-challenge-banner');
  var lbEl = document.getElementById('analyze-challenge-leaderboard');
  if (!bannerEl || !lbEl) return;
  var all = getAllPortfolios();
  if (_activeChallenges && _activeChallenges.length > 0) {
    _renderAnalyzeChallengeBannerUI(bannerEl, lbEl, all);
  } else {
    loadActiveChallenges(function() { _renderAnalyzeChallengeBannerUI(bannerEl, lbEl, all); });
  }
}

function _renderAnalyzeChallengeBannerUI(bannerEl, lbEl, all) {
  var sidebar = document.getElementById('analyze-challenge-sidebar');
  var layout = document.getElementById('analyze-layout');
  var isMobile = window.innerWidth <= 1100;
  if (!_activeChallenges || _activeChallenges.length === 0) {
    // Show placeholder so the sidebar column still looks intentional (desktop only)
    if (sidebar && !isMobile) {
      sidebar.style.display = 'flex';
      bannerEl.innerHTML =
        '<div class="challenge-no-active">' +
          '<div class="challenge-no-active-icon">🏆</div>' +
          '<div class="challenge-no-active-title">No Active Challenge</div>' +
          '<div class="challenge-no-active-desc">Challenges let you compete with other investors using paper trading. Check back soon for the next one.</div>' +
        '</div>';
      lbEl.innerHTML = '';
    }
    if (layout && !isMobile) layout.classList.add('has-challenge-sidebar');
    return;
  }
  if (sidebar && !isMobile) sidebar.style.display = 'flex';
  if (layout && !isMobile) layout.classList.add('has-challenge-sidebar');
  var c = _activeChallenges[0];
  var hasJoined = Object.values(all).some(function(p) { return p.challengeId === c.id; });
  var daysLeft = daysLeftText(c.endDate);
  var typeText = c.challengeType ? escHtml(c.challengeType) : '';
  var prizeText = c.prizeDescription ? 'Prize: ' + escHtml(c.prizeDescription) : '';
  var premiumBadge = c.isPremium ? '<span class="challenge-premium-pill">Premium</span>' : '';
  var actionHtml = hasJoined
    ? '<span id="analyze-banner-rank" class="challenge-banner-rank"></span><button class="challenge-banner-btn challenge-banner-btn-view" onclick="showTab(\'profile\')">View Rank</button>'
    : '<button class="challenge-banner-btn" onclick="joinChallenge(\'' + c.id + '\')">Join Challenge</button>';
  bannerEl.innerHTML =
    '<div class="challenge-banner">' +
      '<div class="challenge-banner-left">' +
        '<div class="challenge-banner-title">' + escHtml(c.title) + premiumBadge + '</div>' +
        '<div class="challenge-banner-meta">' +
          (typeText ? '<span class="challenge-banner-type">' + typeText + '</span>' : '') +
          (prizeText ? '<span class="challenge-banner-prize">' + prizeText + '</span>' : '') +
          (daysLeft ? '<span class="challenge-banner-timer">' + daysLeft + '</span>' : '') +
          (c.rules ? '<span class="challenge-banner-timer">' + escHtml(c.rules) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="challenge-banner-right">' + actionHtml + '</div>' +
    '</div>';
  lbEl.innerHTML = '<div class="challenge-mini-lb-loading">Loading leaderboard…</div>';
  _renderMiniLeaderboard(c.id, lbEl);
}

function _renderMiniLeaderboard(challengeId, containerEl) {
  var uid = currentUid();
  db.collection('challenges').doc(challengeId).collection('entries')
    .orderBy('rankScore', 'desc').limit(50).get()
    .then(function(snap) {
      _miniLbEntries = [];
      snap.forEach(function(doc) { _miniLbEntries.push(Object.assign({ uid: doc.id }, doc.data())); });
      if (_miniLbEntries.length === 0) { containerEl.innerHTML = '<div class="lb-empty" style="padding:12px 0;">No entries yet — be the first to join!</div>'; return; }
      var top3 = _miniLbEntries.slice(0, 3);
      var medals = ['🥇','🥈','🥉'];
      var myIdx = _miniLbEntries.findIndex(function(e) { return e.uid === uid; });
      var rowsHtml = top3.map(function(e, i) {
        var isMe = e.uid === uid;
        var sign = e.returnPct >= 0 ? '+' : '';
        var retColor = e.returnPct >= 0 ? '#128257' : '#dc2626';
        return '<div class="lb-row' + (isMe ? ' lb-row-me' : '') + '" data-source="mini" data-idx="' + i + '" onclick="openPublicProfileModal(\'mini\',' + i + ')" style="cursor:pointer;">' +
          '<span class="lb-rank">' + medals[i] + '</span>' +
          '<span class="lb-name">' + escHtml(e.displayName || 'Investor') + (isMe ? ' <span class="lb-you-badge">You</span>' : '') + '</span>' +
          '<span class="lb-score">' + (e.avgScore || '—') + '<span class="lb-score-label">/100</span></span>' +
          '<span class="lb-return" style="color:' + retColor + ';">' + sign + (e.returnPct || 0).toFixed(2) + '%</span>' +
        '</div>';
      }).join('');
      var myRowHtml = '';
      if (myIdx >= 3) {
        var me = _miniLbEntries[myIdx];
        var sign = me.returnPct >= 0 ? '+' : '';
        myRowHtml = '<div class="lb-row lb-row-me">' +
          '<span class="lb-rank">#' + (myIdx + 1) + '</span>' +
          '<span class="lb-name">' + escHtml(me.displayName || 'You') + ' <span class="lb-you-badge">You</span></span>' +
          '<span class="lb-score">' + (me.avgScore || '—') + '<span class="lb-score-label">/100</span></span>' +
          '<span class="lb-return">' + sign + (me.returnPct || 0).toFixed(2) + '%</span>' +
        '</div>';
      }
      containerEl.innerHTML =
        '<div class="challenge-mini-lb-header">Top Performers</div>' +
        '<div class="lb-cols-header"><span class="lb-col-rank">Rank</span><span class="lb-col-name">Player</span><span class="lb-col-score">Avg Score</span><span class="lb-col-return">Return</span></div>' +
        rowsHtml + myRowHtml;
      // Update banner rank if joined
      if (myIdx >= 0) {
        var rankEl = document.getElementById('analyze-banner-rank');
        if (rankEl) rankEl.textContent = '#' + (myIdx + 1) + ' · ';
      }
    })
    .catch(function() { containerEl.innerHTML = '<div class="lb-empty">Could not load leaderboard.</div>'; });
}

// ── Public profile modal ───────────────────────────────────────────────────
var _profileLbEntries = [];

function openPublicProfileModal(source, idx) {
  var entry = source === 'mini' ? _miniLbEntries[idx] : _profileLbEntries[idx];
  if (!entry) return;
  var existing = document.getElementById('public-profile-overlay');
  if (existing) existing.remove();
  var name = entry.displayName || 'Investor';
  var initials = name.split(' ').map(function(w) { return w[0] || ''; }).join('').toUpperCase().slice(0, 2) || '?';
  var hue = (name.charCodeAt(0) * 37 + ((name.charCodeAt(1) || 0) * 13)) % 360;
  var avatarStyle = 'background:linear-gradient(135deg,hsl(' + hue + ',65%,55%),hsl(' + ((hue + 40) % 360) + ',75%,45%));';
  var sign = entry.returnPct >= 0 ? '+' : '';
  var retColor = entry.returnPct >= 0 ? '#128257' : '#dc2626';
  var overlay = document.createElement('div');
  overlay.id = 'public-profile-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.innerHTML =
    '<div class="public-profile-modal">' +
      '<button class="public-profile-close" onclick="document.getElementById(\'public-profile-overlay\').remove()">✕</button>' +
      '<div class="public-profile-avatar" style="' + avatarStyle + '">' + escHtml(initials) + '</div>' +
      '<div class="public-profile-name">' + escHtml(name) + '</div>' +
      '<div class="public-profile-stats">' +
        '<div class="public-profile-stat"><span class="public-profile-stat-val" style="color:' + retColor + ';">' + sign + (entry.returnPct || 0).toFixed(2) + '%</span><span class="public-profile-stat-label">Return</span></div>' +
        '<div class="public-profile-stat"><span class="public-profile-stat-val">' + (entry.avgScore || '—') + '</span><span class="public-profile-stat-label">Avg Score</span></div>' +
        '<div class="public-profile-stat"><span class="public-profile-stat-val">' + (entry.portfolioValue ? '$' + parseFloat(entry.portfolioValue).toLocaleString('en-US', {maximumFractionDigits:0}) : '—') + '</span><span class="public-profile-stat-label">Portfolio</span></div>' +
      '</div>' +
      '<div id="public-profile-badges-' + entry.uid + '" class="public-profile-badges"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  // Async load badges
  if (entry.uid) {
    db.collection('users').doc(entry.uid).get().then(function(doc) {
      var badgesEl = document.getElementById('public-profile-badges-' + entry.uid);
      if (!badgesEl || !doc.exists) return;
      var data = doc.data();
      var badges = data.badges || [];
      if (badges.length === 0) return;
      badgesEl.innerHTML = badges.slice(0, 8).map(function(b) {
        return '<span class="public-profile-badge" title="' + escHtml(b.name || '') + '">' + (b.icon || '🏅') + '</span>';
      }).join('');
    }).catch(function() {});
  }
}

// ── PRIZE CLAIM ───────────────────────────────────────────────────────────
var _claimChallengeId = null;
var _claimPrizeType = null;

function openPrizeClaimForm(challengeId, prizeType) {
  _claimChallengeId = challengeId;
  _claimPrizeType = prizeType || 'cash';
  var overlay = document.createElement('div');
  overlay.id = 'prize-claim-overlay';
  overlay.className = 'modal-overlay';
  var cashFields = '<div class="claim-field"><label>PayPal Email</label><input id="claim-paypal" type="email" placeholder="your@paypal.com"></div>';
  var physicalFields =
    '<div class="claim-field"><label>Shipping Address</label><input id="claim-address" placeholder="Street address"></div>' +
    '<div class="claim-field-row">' +
      '<input id="claim-city" placeholder="City">' +
      '<input id="claim-state" placeholder="State">' +
      '<input id="claim-zip" placeholder="ZIP">' +
    '</div>' +
    '<div class="claim-field"><input id="claim-country" placeholder="Country"></div>' +
    '<div class="claim-field"><label>Phone</label><input id="claim-phone" type="tel" placeholder="+1 555 000 0000"></div>';
  var fields = (_claimPrizeType === 'physical') ? physicalFields : cashFields;

  overlay.innerHTML =
    '<div class="claim-modal">' +
      '<div class="claim-modal-title">Claim Your Prize</div>' +
      '<div class="claim-modal-sub">Fill in your details and we\'ll reach out within 3 business days.</div>' +
      '<div class="claim-field"><label>Full Name</label><input id="claim-name" placeholder="Your full name"></div>' +
      '<div class="claim-field"><label>Email</label><input id="claim-email" type="email" placeholder="your@email.com"></div>' +
      fields +
      '<div class="claim-modal-actions">' +
        '<button class="claim-submit-btn" onclick="submitPrizeClaim()">Submit Claim</button>' +
        '<button class="claim-cancel-btn" onclick="document.getElementById(\'prize-claim-overlay\').remove()">Cancel</button>' +
      '</div>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // Pre-fill from profile
  var info = JSON.parse(localStorage.getItem('user-info') || '{}');
  var nameEl = document.getElementById('claim-name');
  var emailEl = document.getElementById('claim-email');
  if (nameEl && info.name) nameEl.value = info.name;
  if (emailEl && info.email) emailEl.value = info.email;
}

function submitPrizeClaim() {
  var name  = (document.getElementById('claim-name') || {}).value || '';
  var email = (document.getElementById('claim-email') || {}).value || '';
  if (!name || !email) { showToast('Please fill in name and email'); return; }

  var details = {};
  if (_claimPrizeType === 'physical') {
    details.address = (document.getElementById('claim-address') || {}).value || '';
    details.city    = (document.getElementById('claim-city') || {}).value || '';
    details.state   = (document.getElementById('claim-state') || {}).value || '';
    details.zip     = (document.getElementById('claim-zip') || {}).value || '';
    details.country = (document.getElementById('claim-country') || {}).value || '';
    details.phone   = (document.getElementById('claim-phone') || {}).value || '';
  } else {
    details.paypal  = (document.getElementById('claim-paypal') || {}).value || '';
  }

  var uid = currentUid();
  var html =
    '<h2>Prize Claim — StockIQ</h2>' +
    '<p><strong>Challenge:</strong> ' + (_claimChallengeId || '') + '</p>' +
    '<p><strong>Prize Type:</strong> ' + (_claimPrizeType || '') + '</p>' +
    '<p><strong>Name:</strong> ' + escHtml(name) + '</p>' +
    '<p><strong>Email:</strong> ' + escHtml(email) + '</p>' +
    '<p><strong>UID:</strong> ' + (uid || 'unknown') + '</p>' +
    Object.entries(details).map(function(kv) { return '<p><strong>' + kv[0] + ':</strong> ' + escHtml(kv[1]) + '</p>'; }).join('') +
    '<p><em>Submitted: ' + new Date().toLocaleString() + '</em></p>';

  fetch('/.netlify/functions/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'agomezvelasco23@gmail.com', subject: 'Prize Claim — ' + (name) + ' — StockIQ', html: html })
  }).then(function() {
    showToast('Claim submitted! We\'ll contact you within 3 business days.');
    var overlay = document.getElementById('prize-claim-overlay');
    if (overlay) overlay.remove();
  }).catch(function() {
    showToast('Submitted! We\'ll be in touch soon.');
    var overlay = document.getElementById('prize-claim-overlay');
    if (overlay) overlay.remove();
  });
}

function renderBrokerSection() {
  var el = document.getElementById('profile-broker-section');
  if (!el) return;
  var brokers = userProfile && (userProfile.type === 'Aggressive' || userProfile.goal === 'learn')
    ? [
        { name: 'Robinhood', desc: 'Simple to start, commission-free, fractional shares', url: '#' },
        { name: 'Webull', desc: 'More data and tools, still commission-free', url: '#' },
        { name: 'Fidelity', desc: 'Trusted, full-featured, excellent research', url: '#' }
      ]
    : [
        { name: 'Fidelity', desc: 'Low fees, trusted institution, excellent long-term tools', url: '#' },
        { name: 'Charles Schwab', desc: 'No minimums, strong research, great for beginners', url: '#' },
        { name: 'Vanguard', desc: 'Built for long-term, low-cost index investing', url: '#' }
      ];
  el.innerHTML =
    '<div class="broker-section">' +
      '<h2>READY TO INVEST FOR REAL?</h2>' +
      '<p class="broker-section-desc">StockIQ is for education. When you\'re ready to buy actual stocks, here are brokers worth looking at' + (userProfile ? ' for a ' + userProfile.type + ' investor' : '') + '.</p>' +
      '<div class="broker-list">' +
      brokers.map(function(b) {
        return '<div class="broker-item">' +
          '<div class="broker-item-name">' + b.name + '</div>' +
          '<div class="broker-item-desc">' + b.desc + '</div>' +
        '</div>';
      }).join('') +
      '</div>' +
      '<p class="broker-disclaimer">StockIQ has no affiliation with any broker. Always do your own research.</p>' +
    '</div>';
}

// ── IQ VAULT ─────────────────────────────────────────────────────────────────
// Virtual bank — starts at MX$50,000. Debited on buy, credited on sell.
// Tracks net worth history. Reset costs 100 XP and adds a Bankrupt badge.

var _vault = null;
var VAULT_START = 50000; // MXN

function _vaultLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function _fmtVault(n) {
  var abs = Math.abs(Math.round(n));
  return (n < 0 ? '-' : '') + 'MX$' + abs.toLocaleString('en-US');
}

function _saveVault() {
  if (!_vault) return;
  if (_vault.transactions.length > 150) _vault.transactions = _vault.transactions.slice(-150);
  if (_vault.netWorthHistory.length > 120) _vault.netWorthHistory = _vault.netWorthHistory.slice(-120);
  saveToFirestore({ vault: _vault });
}

function initVaultFromData(data) {
  if (data && data.vault) {
    _vault = data.vault;
  } else {
    _vault = {
      balance: VAULT_START,
      transactions: [],
      netWorthHistory: [{ date: _vaultLabel(), value: VAULT_START, ts: Date.now() }],
      bankruptCount: 0,
      createdAt: Date.now()
    };
    _saveVault();
  }
  _refreshVaultBalance();
}

function _vaultRecordNetWorth() {
  if (!_vault) return;
  var label = _vaultLabel();
  var hist = _vault.netWorthHistory;
  if (hist.length > 0 && hist[hist.length - 1].date === label) {
    hist[hist.length - 1].value = _vault.balance;
    hist[hist.length - 1].ts = Date.now();
  } else {
    hist.push({ date: label, value: _vault.balance, ts: Date.now() });
  }
}

function vaultDebit(amountMXN, ticker, shares, priceUSD) {
  if (!_vault) return;
  _vault.balance -= amountMXN;
  _vault.transactions.push({
    type: 'buy', ticker: ticker, shares: shares, priceUSD: priceUSD,
    amountMXN: Math.round(amountMXN), date: _vaultLabel(), ts: Date.now()
  });
  _vaultRecordNetWorth();
  _saveVault();
  _refreshVaultBalance();
}

function vaultCredit(amountMXN, ticker, shares, priceUSD) {
  if (!_vault) return;
  _vault.balance += amountMXN;
  _vault.transactions.push({
    type: 'sell', ticker: ticker, shares: shares, priceUSD: priceUSD,
    amountMXN: Math.round(amountMXN), date: _vaultLabel(), ts: Date.now()
  });
  _vaultRecordNetWorth();
  _saveVault();
  _refreshVaultBalance();
}

function _refreshVaultBalance() {
  var el = document.getElementById('vault-balance');
  if (el && _vault) el.textContent = _fmtVault(_vault.balance);
  var el2 = document.getElementById('vault-balance-form');
  if (el2 && _vault) el2.textContent = _fmtVault(_vault.balance);
  var row = document.getElementById('vault-in-form');
  if (row) row.style.display = _vault ? 'flex' : 'none';
}

function resetVault() {
  if (!_vault) return;
  var modal = document.getElementById('vault-reset-confirm');
  if (modal) modal.style.display = 'flex';
}

function confirmVaultReset() {
  if (!_vault) return;
  _vault.balance = VAULT_START;
  _vault.bankruptCount = (_vault.bankruptCount || 0) + 1;
  _vault.transactions.push({ type: 'reset', date: _vaultLabel(), ts: Date.now() });
  _vaultRecordNetWorth();
  _saveVault();
  addXP(-100);
  var modal = document.getElementById('vault-reset-confirm');
  if (modal) modal.style.display = 'none';
  showToast('Vault reset · Bankrupt badge added · −100 XP');
  renderVault();
}

function renderVault() {
  var section = document.getElementById('vault-section');
  if (!section) return;
  section.style.display = 'block';
  if (!_vault) {
    var balEl = document.getElementById('vault-balance');
    if (balEl) balEl.textContent = 'Loading…';
    return;
  }

  _refreshVaultBalance();

  // P&L vs starting balance
  var diff = _vault.balance - VAULT_START;
  var pct = (diff / VAULT_START * 100);
  var changeEl = document.getElementById('vault-change');
  if (changeEl) {
    if (diff === 0) {
      changeEl.innerHTML = '<span style="color:var(--text-muted);">Starting balance</span>';
    } else {
      var color = diff > 0 ? '#128257' : '#dc2626';
      var sign = diff > 0 ? '+' : '';
      changeEl.innerHTML =
        '<span style="color:' + color + ';">' + sign + _fmtVault(diff) +
        ' (' + sign + pct.toFixed(1) + '%)</span>' +
        '<span style="color:var(--text-muted);"> vs MX$50,000 start</span>';
    }
  }

  // Bankrupt badge
  var badge = document.getElementById('vault-bankrupt-badge');
  if (badge) {
    var bc = _vault.bankruptCount || 0;
    badge.style.display = bc > 0 ? 'inline-flex' : 'none';
    badge.textContent = 'Bankrupt' + (bc > 1 ? ' \xd7' + bc : '');
  }

  _renderVaultChart();
  _renderVaultTransactions();
}

function _renderVaultChart() {
  var wrap = document.getElementById('vault-chart-wrap');
  var canvas = document.getElementById('vault-chart');
  if (!wrap || !canvas || !_vault) return;
  var hist = _vault.netWorthHistory || [];
  if (hist.length < 2) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  if (window._vaultChart) { window._vaultChart.destroy(); window._vaultChart = null; }

  var labels = hist.map(function(h) { return h.date; });
  var values = hist.map(function(h) { return h.value; });
  var isUp = values[values.length - 1] >= VAULT_START;
  var lineColor = isUp ? '#128257' : '#dc2626';
  var theme = (typeof getChartTheme === 'function') ? getChartTheme() : { muted: '#64748b', gridLine: 'rgba(100,116,139,0.15)' };

  window._vaultChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        borderColor: lineColor,
        borderWidth: 2.5,
        fill: true,
        backgroundColor: isUp ? 'rgba(18,130,87,0.07)' : 'rgba(220,38,38,0.07)',
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function(ctx) { return _fmtVault(ctx.raw); } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: theme.muted, font: { size: 10 }, maxRotation: 0, maxTicksLimit: 6 } },
        y: {
          grid: { color: theme.gridLine },
          ticks: {
            color: theme.muted, font: { size: 10 },
            callback: function(v) { return 'MX$' + (Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)); }
          }
        }
      }
    }
  });
}

function _renderVaultTransactions() {
  var el = document.getElementById('vault-transactions');
  if (!el || !_vault) return;
  var txns = (_vault.transactions || []).slice().reverse().slice(0, 40);
  if (txns.length === 0) {
    el.innerHTML = '<div class="vault-txn-empty">No transactions yet. Add your first stock to the portfolio.</div>';
    return;
  }
  el.innerHTML = txns.map(function(t) {
    if (t.type === 'reset') {
      return '<div class="vault-txn-reset-row">' +
        '<div class="vault-txn-left"><div class="vault-txn-desc">Vault Reset</div><div class="vault-txn-date">' + escHtml(t.date || '') + '</div></div>' +
        '<div class="vault-txn-reset-amt">Restarted at MX$50,000</div>' +
      '</div>';
    }
    var isBuy = t.type === 'buy';
    var amtStr = (isBuy ? '−' : '+') + _fmtVault(t.amountMXN || 0);
    var shares = typeof t.shares !== 'undefined' ? t.shares : '?';
    var desc = isBuy
      ? 'Bought ' + shares + ' \xd7 ' + escHtml(t.ticker || '') + ' @ $' + (+(t.priceUSD || 0)).toFixed(2)
      : 'Sold ' + shares + ' \xd7 ' + escHtml(t.ticker || '') + ' @ $' + (+(t.priceUSD || 0)).toFixed(2);
    return '<div class="vault-txn">' +
      '<div class="vault-txn-dot ' + (isBuy ? 'vault-txn-dot-buy' : 'vault-txn-dot-sell') + '"></div>' +
      '<div class="vault-txn-left"><div class="vault-txn-desc">' + desc + '</div><div class="vault-txn-date">' + escHtml(t.date || '') + '</div></div>' +
      '<div class="vault-txn-amt ' + (isBuy ? 'vault-txn-debit' : 'vault-txn-credit') + '">' + amtStr + '</div>' +
    '</div>';
  }).join('');
}
// ─────────────────────────────────────────────────────────────────────────────

function renderProfile() {
  loadUserInfo();
  if (userProfile) {
    document.getElementById('profile-icon-display').innerHTML = _profileIcon(userProfile.type);
    document.getElementById('profile-type-display').textContent = userProfile.type + ' Investor';
    document.getElementById('profile-desc-display').textContent = userProfile.desc;
    document.getElementById('profile-quiz-btn').textContent = 'Retake Quiz';
    document.getElementById('profile-quiz-btn').classList.add('retake-mode');
  } else {
    document.getElementById('profile-quiz-btn').textContent = 'Take Risk Quiz';
    document.getElementById('profile-quiz-btn').classList.remove('retake-mode');
  }
  let watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
  let active = getActivePortfolio();
  let portCount = active ? (active.stocks || []).length : 0;
  let analyzed  = parseInt(localStorage.getItem('total-analyzed') || '0');
  let streak    = getStreak();
  document.getElementById('stat-analyzed').textContent  = analyzed;
  document.getElementById('stat-watchlist').textContent = watchlist.length;
  document.getElementById('stat-portfolio').textContent = portCount;
  document.getElementById('stat-streak').textContent    = streak;
  renderBadges(analyzed, watchlist.length, portCount, streak);
  renderChallengeSection();
  renderBrokerSection();
  renderVault();
}

let stockChatHistory = [];
let stockChatContext = '';

function initStockChat(ticker, companyName, totalScore, changePct, pe, margin, growth, beta, rsi, price) {
  stockChatHistory = [];
  let profileCtx = userProfile ? 'The user is a ' + userProfile.type + ' investor with a ' + userProfile.horizon + ' horizon and goal to ' + userProfile.goal + '. Tailor explanations to their level. ' : '';
  stockChatContext = 'You are StockIQ, a financial education assistant talking to someone who has never invested before. Answer in 2-3 short sentences maximum. Use everyday language — zero financial jargon. If you must use a term like P/E or beta, explain it in the same sentence in plain words. Be specific: use the actual numbers from the stock data and say what they mean in simple terms. Write like you are texting a curious friend, not writing a report. Never say buy, sell, invest, or recommend. If asked for a direct recommendation, explain what the numbers mean and let the user draw their own conclusion. ' +
    profileCtx +
    'Stock: ' + companyName + ' (' + ticker + '), score ' + totalScore + '/100, ' +
    'today ' + (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%, price $' + price.toFixed(2) + ', ' +
    (pe > 0 ? 'P/E ' + pe.toFixed(1) + ', ' : '') +
    (margin !== 0 ? 'profit margin ' + margin.toFixed(1) + '%, ' : '') +
    (growth !== 0 ? 'revenue growth ' + growth.toFixed(1) + '%, ' : '') +
    (beta > 0 ? 'beta ' + beta.toFixed(2) + ', ' : '') +
    (rsi !== null ? 'RSI ' + rsi + ', ' : '') +
    'signal: ' + (totalScore >= 65 ? 'Strong' : totalScore >= 50 ? 'Watch' : 'Risky') + '.';
}

function askStockQuestion(question) {
  document.getElementById('ai-chat-input').value = question;
  sendStockQuestion();
}

function askScenario(type) {
  var name = currentName || currentTicker || 'this stock';
  var q = {
    rates:     'If the Federal Reserve significantly raises interest rates, what happens to ' + name + ' specifically? Consider its valuation, debt levels, and sector sensitivity.',
    recession: 'If the US enters a recession, how would ' + name + ' be affected? Think about its revenue stability, profit margins, and how cyclical its business is.',
    inflation: 'If inflation stays elevated for the next year, what is the impact on ' + name + '? Consider its pricing power, cost structure, and margins.',
    dollar:    'If the US dollar strengthens significantly against other currencies, what does that mean for ' + name + '? Think about international revenue exposure and competitiveness.',
    bear:      'What is the bear case for ' + name + ' right now? What are the biggest risks and scenarios where things could go wrong for this company?'
  }[type];
  if (q) askStockQuestion(q);
}

function sendStockQuestion() {
  let input = document.getElementById('ai-chat-input');
  let question = input.value.trim();
  if (!question || !currentTicker) return;
  input.value = '';
  addXP(5); // +5 XP for asking AI a question

  let messages = document.getElementById('ai-chat-messages');
  let suggestions = document.getElementById('ai-chat-suggestions');
  if (suggestions) suggestions.style.display = 'none';

  // Add user bubble
  messages.innerHTML += "<div class='chat-msg chat-msg-user'>" +
    "<div class='chat-bubble chat-bubble-user'>" + escHtml(question) + "</div>" +
    "<div class='chat-avatar' style='font-size:9px;font-weight:700;color:var(--text-muted);'>You</div>" +
    "</div>";

  // Add typing indicator
  let typingId = 'typing-' + Date.now();
  messages.innerHTML += "<div class='chat-msg' id='" + typingId + "'>" +
    "<div class='chat-avatar' style='font-size:10px;font-weight:700;color:var(--accent-green);'>AI</div>" +
    "<div class='chat-typing'><span></span><span></span><span></span></div>" +
    "</div>";
  requestAnimationFrame(function() { messages.scrollTop = messages.scrollHeight; });

  stockChatHistory.push({ role: 'user', content: question });

  if (!checkAnthropicRateLimit()) return;

  anthropicFetch({ model: 'claude-haiku-4-5-20251001', max_tokens: 180, system: stockChatContext, messages: stockChatHistory })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    let typing = document.getElementById(typingId);
    if (typing) typing.remove();
    let reply = (data.content && data.content[0] && data.content[0].text)
      ? data.content[0].text
      : 'Sorry, I couldn\'t answer that right now.';
    stockChatHistory.push({ role: 'assistant', content: reply });
    messages.innerHTML += "<div class='chat-msg'>" +
      "<div class='chat-avatar' style='font-size:10px;font-weight:700;color:var(--accent-green);'>AI</div>" +
      "<div class='chat-bubble chat-bubble-ai'>" + parseMarkdown(reply) + "</div>" +
      "</div>";
    requestAnimationFrame(function() { messages.scrollTop = messages.scrollHeight; });
    var scenariosEl = document.getElementById('ai-scenarios');
    if (scenariosEl && scenariosEl.style.display === 'none') scenariosEl.style.display = 'block';
  })
  .catch(function() {
    let typing = document.getElementById(typingId);
    if (typing) typing.remove();
    messages.innerHTML += "<div class='chat-msg'>" +
      "<div class='chat-avatar' style='font-size:10px;font-weight:700;color:var(--accent-green);'>AI</div>" +
      "<div class='chat-bubble chat-bubble-ai'>Couldn't reach AI right now. Try again.</div>" +
      "</div>";
  });
}

function toggleLanguage() {
  // Spanish coming soon
  showToast("Spanish version coming soon!");
}

// ── AUTH ──
function showLogin() {
  document.getElementById('auth-signup').style.display = 'none';
  document.getElementById('auth-login').style.display = 'flex';
}

function showSignUp() {
  document.getElementById('auth-login').style.display = 'none';
  document.getElementById('auth-signup').style.display = 'flex';
}

function showLogin() {
  document.getElementById('auth-signup').style.display = 'none';
  document.getElementById('auth-login').style.display = 'flex';
}

function submitSignUp() {
  let name     = document.getElementById('auth-name').value.trim();
  let email    = document.getElementById('auth-email').value.trim();
  let password = document.getElementById('auth-password').value;
  if (!name)     { showToast('Please enter your name.'); return; }
  if (!email || !email.includes('@')) { showToast('Please enter a valid email.'); return; }
  if (password.length < 6) { showToast('Password must be at least 6 characters.'); return; }

  let btn = document.querySelector('#auth-signup button');
  if (btn) btn.textContent = 'Creating account…';

  auth.createUserWithEmailAndPassword(email, password)
    .then(function() {
      let username = name.split(' ')[0].toLowerCase();
      return saveToFirestore({
        name: name,
        username: username,
        email: email,
        createdAt: Date.now()
      });
    })
    .then(function() {
      document.getElementById('auth-overlay').style.display = 'none';
      if (!userProfile) {
        openRiskQuiz();
      }
    })
    .catch(function(err) {
      if (btn) btn.textContent = 'Create Account';
      let msg = err.code === 'auth/email-already-in-use'
        ? 'An account with this email already exists. Log in instead.'
        : err.message;
      showToast(msg);
    });
}

function submitLogin() {
  let email    = document.getElementById('login-email').value.trim();
  let password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('Please fill in all fields.'); return; }

  let btn = document.querySelector('#auth-login button');
  if (btn) btn.textContent = 'Logging in…';

  auth.signInWithEmailAndPassword(email, password)
    .then(function() {
      document.getElementById('auth-overlay').style.display = 'none';
    })
    .catch(function() {
      if (btn) btn.textContent = 'Log In';
      showToast('Email or password incorrect.');
    });
}

// ── Notes per stock ──────────────────────────────────────────

function saveStockNote(ticker, note) {
  let notes = JSON.parse(localStorage.getItem('stock-notes') || '{}');
  if (note.trim()) {
    notes[ticker] = note.trim();
    saveToFirestore({ stockNotes: notes });
  } else {
    delete notes[ticker];
    replaceInFirestore({ stockNotes: notes });
  }
  localStorage.setItem('stock-notes', JSON.stringify(notes));
}

function getStockNote(ticker) {
  let notes = JSON.parse(localStorage.getItem('stock-notes') || '{}');
  return notes[ticker] || '';
}


// ── Export portfolio CSV ─────────────────────────────────────
// Format matches Yahoo Finance portfolio import:
// Symbol, Current Price, Date, Time, Change, Open, High, Low, Volume,
// Trade Date, Purchase Price, Quantity, Commission, High Limit, Low Limit, Comment

function exportPortfolioCSV() {
  let active = getActivePortfolio();
  if (!active) { showToast('Nothing to export'); return; }

  let stocks = migratePortfolio(active.stocks || []);
  if (stocks.length === 0) { showToast('Nothing to export'); return; }

  // Yahoo Finance requires all fields quoted, fractional shares rounded,
  // and Trade Date in MM/DD/YYYY format
  function q(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }

  function toYahooDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d)) return '';
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return mm + '/' + dd + '/' + d.getFullYear();
  }

  let header = 'Symbol,Current Price,Date,Time,Change,Open,High,Low,Volume,Trade Date,Purchase Price,Quantity,Commission,High Limit,Low Limit,Comment';
  let rows = [header];

  stocks.forEach(function(item) {
    item.lots.forEach(function(lot) {
      // Yahoo Finance does not support fractional shares — round to nearest whole share
      // If less than 1 share, use 1 as minimum so the row isn't rejected
      var qty = Math.max(1, Math.round(lot.shares));
      rows.push([
        q(item.ticker),
        q(''),
        q(''),
        q(''),
        q(''),
        q(''),
        q(''),
        q(''),
        q(''),
        q(toYahooDate(lot.date)),
        q(lot.price.toFixed(2)),
        q(qty),
        q('0'),
        q(''),
        q(''),
        q('')
      ].join(','));
    });
  });

  let blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (active.name || 'portfolio').replace(/\s+/g, '_') + '_yahoo.csv';
  a.click();
  showToast('Exported — import in Yahoo Finance under Portfolios → Import');
}

// ── Remove account ───────────────────────────────────────────

function removeAccount() {
  // iOS-safe modal — no confirm()
  var overlay = document.createElement('div');
  overlay.id = '_del-account-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML =
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;max-width:360px;width:100%;">' +
      '<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:8px;">Delete Account</div>' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;line-height:1.5;">This will permanently delete your account, all portfolios, watchlist, and data. <strong style="color:#dc2626;">This cannot be undone.</strong></div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Type <strong>DELETE</strong> to confirm:</div>' +
      '<input id="_del-account-input" type="text" placeholder="DELETE" autocomplete="off" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 12px;font-size:14px;color:var(--text);outline:none;box-sizing:border-box;margin-bottom:14px;">' +
      '<div style="display:flex;gap:10px;">' +
        '<button id="_del-account-cancel" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:13px;font-weight:600;color:var(--text);cursor:pointer;">Cancel</button>' +
        '<button id="_del-account-confirm" style="flex:1;background:#dc2626;border:none;border-radius:10px;padding:10px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;opacity:0.4;" disabled>Delete Forever</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var input   = document.getElementById('_del-account-input');
  var confirm = document.getElementById('_del-account-confirm');
  var cancel  = document.getElementById('_del-account-cancel');

  function close() { overlay.remove(); }

  input.addEventListener('input', function() {
    var ok = input.value.trim() === 'DELETE';
    confirm.disabled = !ok;
    confirm.style.opacity = ok ? '1' : '0.4';
  });
  cancel.addEventListener('click', close);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
  confirm.addEventListener('click', function() {
    if (input.value.trim() !== 'DELETE') return;
    close();
    var user = auth.currentUser;
    if (!user) return;
    userRef().delete().then(function() {
      return user.delete();
    }).then(function() {
      localStorage.clear();
      location.reload();
    }).catch(function(err) {
      if (err.code === 'auth/requires-recent-login') {
        showToast('For security, please log out and log back in first, then try again.');
      } else {
        showToast('Could not delete account: ' + err.message);
      }
    });
  });

  setTimeout(function() { input.focus(); }, 50);
}

// ── Spend limits (Anthropic API rate limiting) ───────────────

function checkAnthropicRateLimit() {
  let key = 'anthropic-calls';
  let data = JSON.parse(localStorage.getItem(key) || '{"count":0,"date":""}');
  let today = new Date().toDateString();
  if (data.date !== today) data = { count: 0, date: today };
  if (data.count >= 20) {
    showToast("Daily AI limit reached (20 calls). Resets tomorrow.");
    return false;
  }
  data.count++;
  localStorage.setItem(key, JSON.stringify(data));
  return true;
}

// ── END spend limits ─────────────────────────────────────────

function logout() {
  unsubscribeFirestore();
  auth.signOut().then(function() {
    userProfile = null;
    location.reload();
  });
}

function resetPassword() {
  let email = document.getElementById('login-email').value.trim();
  if (!email) { showToast('Enter your email address first.'); return; }
  auth.sendPasswordResetEmail(email).then(function() {
    showToast('Password reset email sent!');
  }).catch(function() {
    showToast('Could not send reset email. Check the address.');
  });
}

// ── INIT — Firebase auth state drives everything ──
// ── App loading screen helpers ────────────────────────
function hideAppLoading() {
  let el = document.getElementById('app-loading');
  if (!el) return;
  el.classList.add('hidden');
  setTimeout(function() { el.style.display = 'none'; }, 320);
}

let _appInitialized = false;

// Fast path: returning users see the app immediately from localStorage,
// before Firebase auth even resolves. onAuthStateChanged syncs in background.
(function() {
  let cachedUserInfo = localStorage.getItem('user-info');
  let cachedProfile  = localStorage.getItem('userProfile');
  if (!cachedUserInfo || !cachedProfile) return;
  try {
    userProfile = JSON.parse(cachedProfile);
    if (userProfile) userProfile.icon = _profileIcon(userProfile.type);
    _initApp();
  } catch(e) {}
})();

function _initApp() {
  if (_appInitialized) return;
  _appInitialized = true;
  document.getElementById('auth-overlay').style.display = 'none';
  if (userProfile) {
    document.getElementById('quiz-overlay').style.display = 'none';
    updateRiskBadge();
  } else {
    openRiskQuiz();
  }
  updateStreak();
  updateMarketStatus();
  loadMarketOverview();
  loadTrendingTickers();
  loadSectors();
  renderDailyTip();
  initOnboarding();
  setInterval(function() { loadTrendingTickers(true); }, 60000);
  setInterval(function() { loadSectors(); }, 300000);
  renderWatchlist();
  renderSearchHistory();
  showTab('analyze');
  initTheme();
  initCurrency();
  handleUrlParams();
  initScreener();
  restoreScreenerState();
  _appReady = true;
  refreshXPProgress();
  hideAppLoading();
}

// If Firebase auth never fires within 5s, show retry
let _authTimeout = setTimeout(function() {
  let msgEl = document.getElementById('app-loading-msg');
  let retryEl = document.getElementById('app-loading-retry');
  if (msgEl) msgEl.textContent = 'Taking longer than expected…';
  if (retryEl) retryEl.style.display = 'block';
}, 10000);

auth.onAuthStateChanged(function(user) {
  clearTimeout(_authTimeout);
  if (!user) {
    hideAppLoading();
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('quiz-overlay').style.display = 'none';
    return;
  }

  // Always sync from Firestore — source of truth, keeps devices in sync
  loadFirestoreUserData(function(data) {
    if (data.name) {
      localStorage.setItem('user-info', JSON.stringify({
        name: data.name,
        username: data.username || data.name.split(' ')[0].toLowerCase(),
        email: data.email || user.email,
        avatarSeed: data.avatarSeed || ''
      }));
    } else {
      let name = user.displayName || user.email.split('@')[0];
      localStorage.setItem('user-info', JSON.stringify({ name: name, username: name, email: user.email }));
      saveToFirestore({ name: name, username: name, email: user.email, createdAt: Date.now() });
    }

    if (data.userProfile) {
      userProfile = data.userProfile;
      localStorage.setItem('userProfile', JSON.stringify(userProfile));
    } else {
      userProfile = JSON.parse(localStorage.getItem('userProfile') || 'null');
    }
    if (userProfile) userProfile.icon = _profileIcon(userProfile.type);

    if (data.portfolios) {
      localStorage.setItem('portfolios', JSON.stringify(data.portfolios));
      localStorage.setItem('activePortfolioId', data.activePortfolioId || Object.keys(data.portfolios)[0]);
    } else if (!localStorage.getItem('portfolios')) {
      let legacyHistory = data.portfolioValueHistory || [];
      migrateToMultiPortfolio(data.portfolio || [], data.closedPositions || [], legacyHistory);
    }

    if (data.watchlist) localStorage.setItem('watchlist', JSON.stringify(data.watchlist));
    if (data.priceAlerts) localStorage.setItem('price-alerts', JSON.stringify(data.priceAlerts));
    if (data.stockNotes) localStorage.setItem('stock-notes', JSON.stringify(data.stockNotes));

    if (data.scoreHistory) {
      Object.keys(data.scoreHistory).forEach(function(t) {
        localStorage.setItem('history_score_' + t, JSON.stringify(data.scoreHistory[t]));
      });
    }

    if (data.stats) {
      if (data.stats.analyzed) localStorage.setItem('total-analyzed', data.stats.analyzed);
      if (data.stats.streak) localStorage.setItem('streak', JSON.stringify(data.stats.streak));
    }

    if (data.xp !== undefined) {
      _userXP = data.xp;
      if (_appInitialized) refreshXPProgress();
    }

    // IQ Vault — initialize or restore from Firestore
    initVaultFromData(data);

    if (!_appInitialized) {
      // First visit or no cached data — full init now
      _initApp();
    } else {
      // Background sync done — quietly refresh data-driven sections
      renderWatchlist();
      if (typeof renderPortfolio === 'function') renderPortfolio();
      if (typeof renderVault === 'function') renderVault();
      updateRiskBadge();
      updateStreak();
    }
  });
})();

// ── LEARN TAB — daily lessons, mastery tracker ────────────────────────

var DAILY_LESSONS = [
  {
    id: 'what-is-a-stock',
    title: "You already own stocks — you just don't know it yet",
    concept: 'What Is a Stock?',
    duration: '2 min',
    relatedTicker: 'AAPL',
    story: [
      "Every time you use an iPhone, drink a Coca-Cola, or order from Amazon, you're interacting with a public company. A public company is one that has sold pieces of itself to anyone who wants to buy. Those pieces are called stocks — or shares.",
      "When you buy one share of Apple, you literally own a tiny fraction of every iPhone factory, every App Store dollar, every Mac sold worldwide. You're not lending them money — you own a slice of the business.",
      "This matters because as the business grows and earns more money, your slice becomes more valuable. People who bought Apple in 2010 at around $10 per share (adjusted for splits) now have shares worth $200+. The business got bigger, and so did their slice."
    ],
    insight: "A stock is ownership, not a bet. When you buy stock, you become a co-owner of that company's future.",
    quiz: [
      {
        question: 'What does buying a share of a company actually mean?',
        options: ["You're lending the company money", "You own a small piece of the company", "You're guaranteed a fixed return each year"],
        correct: 1,
        explanation: "Buying a share makes you a part-owner, not a lender. Bonds are how you lend money to a company. Stocks make you an owner — your return depends on how well the business does."
      },
      {
        question: "Apple's profits doubled this year. You own one share of Apple. What most likely happens to your investment?",
        options: ["Nothing — individual shareholders don't benefit from company profits", "Your share becomes more valuable as the business you own a piece of grows", "Apple owes you a refund for past losses"],
        correct: 1,
        explanation: "That's the core of stock ownership — your slice of the business becomes more valuable as the business itself grows. When Apple earns more, shareholders benefit directly."
      },
      {
        question: "A company sells shares of itself to the public. Why would it do this?",
        options: ["To give money away to strangers", "To raise capital from many investors in exchange for ownership stakes in the business", "To avoid paying taxes"],
        correct: 1,
        explanation: "When a company 'goes public,' it sells pieces of itself to raise money for growth — factories, hiring, new products. In return, buyers become co-owners who benefit if the business succeeds."
      }
    ]
  },
  {
    id: 'compounding',
    title: "Compounding: the math that makes patient investors rich",
    concept: 'Compounding',
    duration: '3 min',
    relatedTicker: 'MSFT',
    story: [
      "Here's a math trick most people learn too late. If you invest $10,000 today at 10% annual returns — and never add another peso — you don't end up with $20,000 after 20 years. You end up with $67,000. After 30 years? $174,000. You added nothing. The money just kept earning returns on its own returns.",
      "That's compounding. And it's weird because the first years feel slow. Years 1–10 take you from $10,000 to $26,000. Years 20–30 take you from $67,000 to $174,000. The last decade generates more than the entire first two combined. The math rewards patience above almost anything else.",
      "The brutal implication: starting 10 years earlier matters more than investing three times as much later. A 25-year-old who starts investing beats the 35-year-old who waits — even if the 35-year-old contributes more every month. Time is the one thing money genuinely can't buy."
    ],
    insight: "Compounding is earning returns on your returns. The earlier you start, the more time your money has to multiply. Rule of 72: divide 72 by your annual return to find how many years to double your money.",
    quiz: [
      {
        question: "Using the Rule of 72, how many years does it take to double your money at 9% annual returns?",
        options: ['About 4 years', 'About 8 years', 'About 18 years'],
        correct: 1,
        explanation: "Rule of 72: 72 ÷ 9 = 8 years. At 9% annual growth, your money doubles every 8 years. A $10,000 investment grows to $20,000 in 8 years, $40,000 in 16, $80,000 in 24 — just from compounding."
      },
      {
        question: "Ana starts investing $5,000 at age 25. Carlos starts at age 35. Both invest the same amount, earn 8%, and stop at 65. Who ends up with more?",
        options: ['Carlos — he invested smarter and later', 'Ana — 10 more years of compounding creates a gap money alone cannot close', 'They end up with the same amount'],
        correct: 1,
        explanation: "Ana's 40 years at 8% grows $5,000 to roughly $108,000. Carlos's 30 years reaches about $50,000. The 10-year head start more than doubles the outcome — compounding is exponential, not linear."
      },
      {
        question: "Your investment returns 6% per year. Using the Rule of 72, how many years until it quadruples (doubles twice)?",
        options: ['12 years', '24 years', '36 years'],
        correct: 1,
        explanation: "72 ÷ 6 = 12 years to double once. To quadruple, you need two doublings: 12 + 12 = 24 years. Each doubling takes the same time — which is why starting early has such an outsized effect."
      }
    ]
  },
  {
    id: 'inflation',
    title: "Your money is shrinking right now — even in a savings account",
    concept: 'Inflation',
    duration: '2 min',
    relatedTicker: 'KO',
    story: [
      "In 2014, a cup of coffee cost about 25 pesos at a typical café. By 2024, the same cup costs 55 pesos or more. The coffee didn't change. Your money did. That's inflation: the slow, steady increase in prices that means your money buys less over time.",
      "If inflation runs at 4% per year — close to Mexico's long-term average — $100,000 pesos today will have the purchasing power of only $67,000 pesos in 10 years. You didn't spend it. It didn't disappear. But it quietly lost a third of its value.",
      "A savings account paying 2% while inflation runs 4% is actually losing money in real terms. This is the core reason people invest: not to get rich overnight, but to at least keep pace with — and ideally beat — the rising cost of everything."
    ],
    insight: "Inflation erodes the purchasing power of cash over time. Stocks have historically averaged 7–10% annual returns — well above long-term inflation — which is why investing is the standard tool for protecting purchasing power.",
    quiz: [
      {
        question: "Inflation is 5% this year. Your savings account pays 2%. After one year, your money has...",
        options: ["Grown in real value", "Lost purchasing power", "Stayed exactly the same"],
        correct: 1,
        explanation: "Even though your account balance went up 2%, the things you want to buy got 5% more expensive. In real terms, your money lost 3% of its purchasing power. Beating inflation is the first job of any investment."
      },
      {
        question: "Why have stocks historically been the preferred tool for fighting inflation?",
        options: ['Stocks are risk-free', 'Stocks have averaged 7–10% annual returns, well above long-term inflation', 'The government guarantees stocks beat inflation'],
        correct: 1,
        explanation: "Stocks represent ownership of businesses that can raise prices, expand, and grow earnings over time. Their returns have historically outpaced inflation significantly. Cash in low-yield accounts cannot keep up."
      },
      {
        question: "If inflation runs at 4% per year, roughly how long until your cash loses half its purchasing power?",
        options: ['About 10 years', 'About 18 years', 'Never — your cash amount stays the same'],
        correct: 1,
        explanation: "Rule of 72 applied to inflation: 72 ÷ 4% = 18 years for purchasing power to halve. Your balance doesn't shrink — but what it buys does. This is the silent cost of holding too much cash long-term."
      }
    ]
  },
  {
    id: 'market-cap',
    title: "Market cap: the real price of a company",
    concept: 'Market Cap',
    duration: '2 min',
    relatedTicker: 'NVDA',
    story: [
      "A stock price alone is almost meaningless for comparing companies. Apple at $200 per share and a small company at $200 per share are not equally valuable. The metric that matters for comparison is market capitalization.",
      "Market cap = stock price × total shares outstanding. Apple at $200/share × 15 billion shares = $3 trillion market cap. A small company at $200/share × 1 million shares = $200 million market cap. Same stock price, 15,000x difference in actual size.",
      "Categories: Mega cap ($200B+) — household names like Apple, Microsoft. Large cap ($10B–$200B). Mid cap ($2B–$10B). Small cap (under $2B) — historically higher risk but higher potential reward."
    ],
    insight: "Market cap = Price × Shares. It's the total value the market assigns to a company. Always use market cap — not stock price alone — to compare company sizes and understand what you're actually buying.",
    quiz: [
      {
        question: 'Stock A: $5/share × 1 billion shares. Stock B: $500/share × 1 million shares. Which is bigger by market cap?',
        options: ['Stock A — $5 billion market cap', 'Stock B — $500 million market cap', "They're equal"],
        correct: 0,
        explanation: "Stock A: $5 × 1B = $5B. Stock B: $500 × 1M = $500M. Stock A is 10x larger despite a much lower share price. Market cap is what matters, not share price alone."
      },
      {
        question: 'A company has 10 million shares. Today\'s stock price is $30. What is the market cap?',
        options: ['$30 million', '$300 million', '$3 billion'],
        correct: 1,
        explanation: "Market cap = shares × price = 10 million × $30 = $300 million. This is the total price tag the market assigns to the entire company."
      },
      {
        question: "A company's stock price drops 20%, but no new shares are issued or retired. What happens to its market cap?",
        options: ["Nothing — market cap only changes when shares are issued", "It drops 20% as well — price and market cap move proportionally", "Market cap increases because shares are now cheaper to buy"],
        correct: 1,
        explanation: "Market cap = shares × price. If shares are unchanged but price drops 20%, market cap drops 20% too. A falling market cap means investors collectively value the company less."
      }
    ]
  },
  {
    id: 'sp500',
    title: 'The S&P 500: the scorecard of the American economy',
    concept: 'Market Indices',
    duration: '2 min',
    relatedTicker: 'SPY',
    story: [
      "When people say 'the market went up 1% today,' they almost always mean the S&P 500 went up 1%. The S&P 500 is an index — a curated list of 500 large American companies weighted by market cap. Apple, Microsoft, Amazon, NVIDIA, and Berkshire Hathaway are among the largest.",
      "It's not 500 random companies. A committee selects them based on size, trading volume, and financial health. Companies get added when they grow large enough and removed when they shrink or go bankrupt. Tesla was added in 2020.",
      "If you own stocks, your portfolio's performance is almost always measured against the S&P 500. A 12% portfolio return sounds great — unless the S&P 500 returned 20% that same year."
    ],
    insight: "The S&P 500 tracks 500 large US companies weighted by market cap — the standard benchmark for US stock market performance. The Dow Jones tracks only 30 companies; the NASDAQ focuses on technology.",
    quiz: [
      {
        question: 'Your portfolio returned 8% this year. The S&P 500 returned 15%. What does this mean?',
        options: ['You lost money this year', 'You made money but underperformed the market benchmark', 'Your portfolio is perfectly positioned'],
        correct: 1,
        explanation: "8% is a positive return — you made money. But relative to the benchmark, you underperformed by 7%. Professionals are judged not just by absolute return, but by how they performed vs. the market."
      },
      {
        question: "The S&P 500 is weighted by market cap. What does this mean in practice?",
        options: ['All 500 companies have equal influence', 'Larger companies like Apple have far more influence on the index than smaller ones', 'Only the top 10 companies actually matter'],
        correct: 1,
        explanation: "Market cap weighting means Apple (3T+) has far more influence on the S&P 500 than a $10B company. This better reflects the actual economic weight of each company in the US economy."
      },
      {
        question: "The Dow Jones tracks 30 companies. The S&P 500 tracks 500. Which is the more widely used benchmark for the overall US stock market?",
        options: ['The Dow — 30 iconic companies is enough', 'The S&P 500 — 500 companies across all major sectors gives broader, more representative coverage', 'Both are equally representative'],
        correct: 1,
        explanation: "The S&P 500 is the standard benchmark because its breadth across 500 companies and all major industries gives a more complete picture of US market performance than 30 blue chips alone."
      }
    ]
  },
  {
    id: 'risk-tolerance',
    title: 'Risk tolerance: know yourself before you know any stock',
    concept: 'Risk Tolerance',
    duration: '3 min',
    relatedTicker: 'TSLA',
    story: [
      "Two investors both see their portfolio drop 30% in a bear market. Investor A stays calm, buys more of their best positions at lower prices, and does nothing else. Investor B panics, sells everything, locks in the loss, and swears off stocks forever. Same market, completely different outcomes.",
      "Risk tolerance has two components: capacity (how much loss can your financial situation handle?) and temperament (how much loss can your emotional state handle?). Both matter — and they're often different numbers for the same person.",
      "Most investors overestimate their risk tolerance in bull markets and discover their real tolerance only during bear markets. The best investors are honest about this before they invest, not after."
    ],
    insight: "Risk tolerance = how much loss you can handle without making bad decisions. Financial capacity (income, timeline, obligations) and emotional temperament both matter. Know yours before you build a portfolio.",
    quiz: [
      {
        question: "A 22-year-old with stable income, no debt, and won't need the money for 20 years — what risk profile fits them?",
        options: ["Conservative — they're young and inexperienced", "Aggressive — high capacity and long time horizon absorb volatility", "Depends only on their feelings about loss"],
        correct: 1,
        explanation: "Young investors with stable income and long time horizons have high capacity for risk — short-term crashes are recoverable over 20 years. Their financial situation supports more aggressive positioning."
      },
      {
        question: "Why do most investors only discover their real risk tolerance during a bear market?",
        options: ['Because bear markets are when the stock market stops working correctly', 'Gains feel comfortable — only watching real losses reveals whether you can stay calm and not panic-sell', 'Bear markets are too rare to matter for most investors'],
        correct: 1,
        explanation: "It's easy to say you're comfortable with risk when your portfolio is up. Real risk tolerance is revealed when you're watching savings drop 30% — that's when emotion overrides plans, which is why honest self-assessment before investing matters."
      },
      {
        question: "You need the money in 2 years for a house purchase. What risk level is appropriate?",
        options: ['Aggressive — 2 years is long enough to recover', 'Conservative — a short time horizon means little time to recover from a loss', 'High-beta stocks to maximize gains before purchase'],
        correct: 1,
        explanation: "If you need the money in 2 years, a bear market could permanently damage your buying power. Short time horizons demand conservative positioning — there's no time to wait for recovery."
      }
    ]
  },
  {
    id: 'diversification',
    title: "Diversification: the only free lunch in investing",
    concept: 'Diversification',
    duration: '2 min',
    relatedTicker: 'SPY',
    story: [
      "Nobel Prize winner Harry Markowitz called diversification 'the only free lunch in investing.' If you put all your money in one stock and it drops 50%, your portfolio drops 50%. But if you spread across 10 different stocks in different industries, a 50% drop in one only costs you 5% of your total portfolio.",
      "The magic: diversification reduces risk without necessarily reducing your expected return. Two stocks that tend to move in opposite directions offset each other's volatility — their average return stays similar, but the ride is smoother.",
      "Over-diversification is real too. Owning 200 individual stocks means your portfolio basically becomes the market. Most professional investors find 20–30 stocks across different sectors gives meaningful diversification without becoming unmanageable."
    ],
    insight: "Diversification reduces risk by spreading investments across companies, sectors, and asset types. 15–25 stocks in different sectors eliminates most single-stock risk — and the next lesson shows the easiest way to achieve this automatically.",
    quiz: [
      {
        question: 'You have $10,000. Which approach is better diversified?',
        options: ["$10,000 in one tech stock you believe in strongly", "$3,000 tech, $3,000 healthcare, $2,000 consumer goods, $2,000 international", "Both are equally good"],
        correct: 1,
        explanation: "Spreading across sectors reduces the impact of any single stock or sector crashing. If tech collapses, healthcare and consumer goods holdings are likely unaffected. Diversification is the simplest risk management tool available."
      },
      {
        question: "You own 30 different airline stocks. Why is this NOT true diversification?",
        options: ['30 is too few stocks', 'All airlines move with the same factors — fuel prices, travel demand, recessions — they rise and fall together', 'Airlines are a safe industry to concentrate in'],
        correct: 1,
        explanation: "True diversification means owning investments that don't all move together. Airlines are correlated — the same economic events hit them simultaneously. Real diversification spreads across uncorrelated industries."
      },
      {
        question: "After how many uncorrelated stocks does adding more provide little additional risk reduction?",
        options: ['5–10 stocks', '15–25 stocks across different sectors', '100+ stocks — more is always better'],
        correct: 1,
        explanation: "Research shows 15–25 uncorrelated stocks eliminate most single-stock risk. Beyond ~25, additional diversification delivers diminishing returns — your portfolio essentially becomes the market without the simplicity of an index fund."
      }
    ]
  },
  {
    id: 'index-funds',
    title: "One purchase. 500 companies. The investment most experts recommend for beginners.",
    concept: 'Index Funds & ETFs',
    duration: '3 min',
    relatedTicker: 'SPY',
    story: [
      "Here's the uncomfortable truth: most professional fund managers — people whose entire job is picking stocks — fail to beat the S&P 500 over 10+ years. Not because they're bad at their jobs. Because markets are that efficient, and fees erode whatever small edges they find.",
      "So what's the simple alternative? Own everything. An index fund automatically buys every stock in an index. One purchase of an S&P 500 ETF gives you proportional ownership of all 500 companies — Apple, Microsoft, Amazon, NVIDIA, and 496 more. If one collapses, 499 others cushion the fall.",
      "SPY and VOO are the two most popular S&P 500 ETFs, each charging about 0.03% per year — nearly free. Warren Buffett is so convinced by this approach that his will instructs 90% of his estate to go into a low-cost S&P 500 index fund. If it's good enough for Buffett's family, it's worth understanding for yours."
    ],
    insight: "Index funds and ETFs give you instant diversification across hundreds of companies with one purchase. Low-cost, simple, and historically difficult even for professionals to beat. A strong starting point for any beginner.",
    quiz: [
      {
        question: "An ETF that tracks the S&P 500 gives you exposure to...",
        options: ["One company's stock", "A basket of 500 large US company stocks", "Only technology companies"],
        correct: 1,
        explanation: "An S&P 500 ETF holds proportional shares in all 500 companies in the index. One purchase instantly diversifies you across technology, healthcare, consumer goods, finance, and more."
      },
      {
        question: "Research shows most professional stock-pickers underperform the S&P 500 over 10+ years. Why?",
        options: ['Professional investors are inexperienced', 'Fees, trading costs, and the difficulty of consistently outpicking a market that reflects all public information', 'The S&P 500 is artificially inflated'],
        correct: 1,
        explanation: "Even skilled professionals face compounding headwinds: management fees (often 1%+), trading costs, and the near-impossibility of consistently beating a market that already reflects all available information. Most fail to clear these hurdles over a decade."
      },
      {
        question: "An S&P 500 ETF charges 0.03% per year. An actively managed fund charges 1.2%. On $10,000 over 30 years at 8% returns, the fee difference costs you approximately...",
        options: ['About $300 total', 'About $8,000 or more', 'Both are essentially the same'],
        correct: 1,
        explanation: "Fees compound against you just like returns compound for you. Over 30 years, the 1.17% annual difference on $10,000 growing at 8% costs roughly $8,000–$10,000 in foregone wealth. This is why Warren Buffett publicly recommends low-cost index funds for most investors."
      }
    ]
  },
  {
    id: 'bull-bear',
    title: 'Bull vs. bear: what markets feel like from the inside',
    concept: 'Market Cycles',
    duration: '2 min',
    relatedTicker: 'SPY',
    story: [
      "In March 2020, the stock market crashed 34% in 33 days. The news was apocalyptic. People were selling everything. Then — while the world still felt like it was ending — markets reversed and hit all-time highs by August. If you sold in March, you locked in the loss. If you stayed, you recovered everything and then some.",
      "Two words describe these extremes. A bull market: prices rise 20%+ from a recent low — optimism is high, growth feels inevitable, everyone looks smart. A bear market: a 20%+ drop from a recent high — headlines are terrible, losses feel permanent, panic sets in. Both happen on a predictable long-term cycle, even when neither feels predictable in the moment.",
      "Since 1928, the S&P 500 has gone through 26 bear markets. The average bear lasted about 10 months and dropped 36%. The average bull that followed lasted years and recovered all of it — then kept going. The math is clear. The hard part is your emotions while you're in the middle of the fall."
    ],
    insight: "Bull market = 20%+ gains. Bear market = 20%+ losses. The cycle repeats. Long-term investors who stay invested through bear markets capture the bull markets that always follow.",
    quiz: [
      {
        question: 'The market drops 25% over 8 months. This is best described as...',
        options: ['A market correction (10–20% drop)', 'A bear market (20%+ drop)', 'A recession (economic contraction)'],
        correct: 1,
        explanation: "A bear market is a 20%+ decline from recent highs. A correction is 10–20%. A recession is an economic concept (two quarters of negative GDP growth) — related to, but separate from, a bear market."
      },
      {
        question: "Since 1928, every bear market has eventually been followed by a full recovery and new highs. What does this suggest for long-term investors?",
        options: ['Sell everything during bear markets to avoid losses', 'Staying invested through the full cycle captures the recovery — selling locks in the loss', 'Bear markets are unpredictable and unavoidable so investing is too risky'],
        correct: 1,
        explanation: "The S&P 500 has averaged ~10% annual returns over the long term despite 26 bear markets. Each recovery brought new highs. Staying invested captured the full cycle — selling during a bear locks in losses and misses the rebound."
      },
      {
        question: "During a severe bear market, you see your portfolio down 35%. The historically best — but psychologically hardest — action is...",
        options: ['Sell everything and wait for the bottom to be confirmed', 'Stay invested or keep buying — trying to time the recovery means missing the fastest days', 'Move everything into gold or cash'],
        correct: 1,
        explanation: "Studies show investors who try to time the market typically miss the best days of recovery, which often cluster right after the worst days. Staying invested through the full cycle produces the best outcomes for most long-term investors."
      }
    ]
  },
  {
    id: 'dca',
    title: "Dollar-cost averaging: why timing the market usually fails",
    concept: 'Dollar-Cost Averaging',
    duration: '3 min',
    relatedTicker: 'AMZN',
    story: [
      "Every investor wants to buy at the bottom and sell at the top. The problem: nobody consistently knows when those moments are — not even the professionals. Research shows most active fund managers underperform simple index funds over 10-year periods.",
      "Dollar-cost averaging (DCA) is the alternative. Instead of picking the perfect moment, you invest a fixed amount at regular intervals. When prices are high, your fixed amount buys fewer shares. When prices are low, it buys more. Your average cost ends up lower than if you'd tried to time it.",
      "Most beginner investors who paused to 'wait for the right moment' ended up waiting forever and missing years of growth. The market doesn't wait for your comfort level."
    ],
    insight: "Dollar-cost averaging = invest a fixed amount regularly, regardless of price. It removes timing risk, lowers your average cost over time, and removes the emotional burden of trying to predict the market.",
    quiz: [
      {
        question: 'You invest $500/month. Month 1: shares cost $50 (buy 10). Month 2: shares cost $25 (buy 20). What is your average cost per share?',
        options: ['$37.50', '$33.33', '$25.00'],
        correct: 1,
        explanation: "You spent $1,000 total and own 30 shares. Average cost = $1,000 ÷ 30 = $33.33. Notice it's below the $37.50 simple average — DCA naturally lowers your average cost when prices fluctuate."
      },
      {
        question: "You planned to invest $1,000 this month but the market just dropped 20%. The DCA approach says...",
        options: ["Wait — don't buy a falling market", "Invest as planned — you're now buying 20% more shares than last month's price", "Double your investment to take advantage of the dip"],
        correct: 1,
        explanation: "DCA means investing regardless of price direction. A market drop isn't a reason to pause — it means your fixed amount buys MORE shares at a lower price. This is how DCA naturally lowers your average cost over time."
      },
      {
        question: "Why is DCA particularly powerful for investors who want to avoid emotional decision-making?",
        options: ["It doesn't work with volatile markets", "The automatic schedule removes the need to predict market timing, which most people fail at anyway", "It guarantees a profit every month"],
        correct: 1,
        explanation: "DCA's main psychological value: you never have to decide 'is today a good day to invest?' The decision is already made. This removes the paralysis that causes many investors to wait forever for a 'perfect moment' — which rarely comes."
      }
    ]
  },
  {
    id: 'pe-ratio',
    title: "What Warren Buffett saw in Coca-Cola's P/E that others missed",
    concept: 'P/E Ratio',
    duration: '3 min',
    relatedTicker: 'AAPL',
    story: [
      "In 1988, Warren Buffett bought $1 billion worth of Coca-Cola stock. Wall Street thought he was overpaying. The P/E ratio — price divided by earnings — was around 14, which seemed high for a 'boring' beverage company.",
      "But Buffett saw something else. He looked at Coca-Cola's brand, its global distribution, and its ability to raise prices every year without losing customers. He calculated that earnings would keep growing, making the current P/E look cheap in hindsight.",
      "By 2000, Coca-Cola's value — including dividends reinvested — had grown roughly 8 to 10 times. Understanding what P/E meant helped Buffett see value where others saw an overpriced soft drink company."
    ],
    insight: "P/E ratio tells you how much the market pays for $1 of a company's profit. A P/E of 20 means investors pay $20 for each $1 of earnings. Compare it to the industry average to judge if it's expensive or cheap.",
    quiz: [
      {
        question: 'A stock has a P/E of 30. This means investors are paying...',
        options: ["$30 in dividends per share per year", "$30 for every $1 of company earnings", "30% more than the stock is worth"],
        correct: 1,
        explanation: "P/E = Price ÷ Earnings per share. A P/E of 30 means you pay $30 for each $1 the company earns annually. Whether that's expensive depends on the company's growth rate and industry."
      },
      {
        question: "A company earns $4 per share and the stock trades at $60. What is the P/E ratio?",
        options: ['15', '24', '240'],
        correct: 0,
        explanation: "P/E = Stock Price ÷ Earnings Per Share = $60 ÷ $4 = 15. This company trades at 15 times its annual earnings. Whether that's cheap or expensive depends on its growth rate and what peers trade at."
      },
      {
        question: "Stock A has P/E 8. Stock B has P/E 45. Which is definitely the better buy?",
        options: ['Stock A — lower P/E always means cheaper and safer', 'Neither is definitively better — you need growth rates and industry context', 'Stock B — higher P/E means the market sees more value'],
        correct: 1,
        explanation: "A low P/E might mean cheap — or it might mean slow/declining growth. A high P/E might mean overvalued — or justified by strong future growth. P/E only makes sense compared to the company's growth rate and its industry peers."
      }
    ]
  },
  {
    id: 'revenue-growth',
    title: 'Revenue growth: the number that separates thriving from surviving',
    concept: 'Revenue Growth',
    duration: '2 min',
    relatedTicker: 'NVDA',
    story: [
      "Picture a taco stand. Last year you sold 1,000 tacos at 50 pesos each — 50,000 pesos in revenue. This year you sold 1,200. Revenue grew 20%. Simple enough. Now scale this to a company doing billions — the math is identical, but the implications are enormous.",
      "Revenue is the top line: total money coming in before any costs. Revenue growth tells you if that number is expanding or contracting. A company growing 20% year over year is winning — more customers, higher prices, or both. A company with negative revenue is losing ground, and you need to understand why before the stock price reflects it.",
      "Context matters as much as the number itself. A startup at 10% annual revenue growth is probably struggling — early-stage companies should grow 50–100%. Amazon at 10% on $600 billion in revenue is extraordinary. The real question is always: how fast should this company be growing given its size and stage?"
    ],
    insight: "Revenue growth shows if a business is actually expanding. Above 10% is generally healthy. Above 20% is fast growth. Negative revenue growth is a serious warning sign that needs explanation.",
    quiz: [
      {
        question: 'Company A earned $100M last year. This year they earned $120M. What is their revenue growth rate?',
        options: ['12%', '20%', '120%'],
        correct: 1,
        explanation: "Revenue growth = (New − Old) ÷ Old = ($120M − $100M) ÷ $100M = 20%. The company grew revenue by 20% year over year."
      },
      {
        question: "Two companies both grow revenue 15% this year: Amazon (massive) and a small startup. Who is performing better relative to expectations?",
        options: ['Amazon — bigger company means more impressive growth', 'The startup — 15% is the bare minimum for a small company', 'Context matters — Amazon growing 15% on $600B is remarkable; a startup at 15% might be underperforming for its stage'],
        correct: 2,
        explanation: "Growth rates must be evaluated relative to company size and stage. Amazon growing 15% on hundreds of billions in revenue is extraordinary. A startup growing 15% may actually be too slow for its early stage — context is everything."
      },
      {
        question: "A company grew revenue 30% annually for 3 years. This year it grew only 12%. What should you investigate?",
        options: ['12% is bad — sell immediately', 'Any growth is positive — 12% is still growing so nothing to worry about', 'Is this deceleration temporary (macro headwinds) or structural (competition, market saturation)?'],
        correct: 2,
        explanation: "A sharp deceleration from 30% to 12% warrants deeper analysis. It could be macro headwinds, increasing competition, or early signs of market saturation. Strong investors don't just look at the number — they ask why it changed."
      }
    ]
  },
  {
    id: 'profit-margin',
    title: 'Profit margin: the difference between a great business and a good one',
    concept: 'Profit Margin',
    duration: '3 min',
    relatedTicker: 'AAPL',
    story: [
      "Two companies both earn $1 billion in revenue. Company A keeps $300 million as profit. Company B keeps $30 million. Same revenue, 10x difference in profit. Why? Profit margin.",
      "Microsoft has a profit margin above 35% — for every $100 it earns, it keeps $35. Grocery stores like Walmart operate on margins under 3%. They sell enormous volume but keep almost nothing per dollar. Apple sits around 25%, with a mix of hardware and high-margin software.",
      "High margins generally mean the company has pricing power — customers pay a premium without shopping around. Low margins mean the business must execute perfectly to stay profitable and has little room for error."
    ],
    insight: "Profit margin = profit ÷ revenue. It tells you how much of every peso of sales the company actually keeps. 20%+ is excellent. 5–10% is average for most industries. Negative margin means the company is currently losing money.",
    quiz: [
      {
        question: 'A company earns $500M in revenue and keeps $75M as profit. What is its profit margin?',
        options: ['7.5%', '15%', '75%'],
        correct: 1,
        explanation: "Profit margin = $75M ÷ $500M = 15%. For every $100 in revenue, the company keeps $15 as profit. That's a solid margin for most industries."
      },
      {
        question: "Microsoft has 35% profit margin. Walmart has 2.5%. Walmart earns far more total revenue. Which is the better business?",
        options: ['Walmart — it earns more total dollars', 'Microsoft — high margins always mean a superior business model', 'Both models work differently — margin tells you how efficiently each revenue dollar converts to profit, not which is better'],
        correct: 2,
        explanation: "High margin doesn't automatically mean better. Walmart's volume model makes it enormously profitable in total dollars. Microsoft's 35% margin means each revenue dollar is far more valuable. Different models, each valid — margin tells you the efficiency story, not the whole story."
      },
      {
        question: "A company has 5% profit margin. A direct competitor does the same work with 20% margin. What does this difference likely indicate?",
        options: ['The competitor is cheating customers', 'The competitor has stronger pricing power, lower costs, or a more efficient business model', 'The company with 5% margin will catch up automatically'],
        correct: 1,
        explanation: "A 4× difference in margin usually means one company has stronger pricing power or lower operating costs — a structural advantage called a 'moat' that's often difficult for competitors to replicate."
      }
    ]
  },
  {
    id: 'roe',
    title: "ROE: the number Warren Buffett checks before anything else",
    concept: 'ROE',
    duration: '3 min',
    relatedTicker: 'AAPL',
    story: [
      "Here's a question every smart investor asks before buying a stock: if I give this company a dollar, how many cents does it actually make me? That's what Return on Equity measures. ROE is the most direct test of how well a business uses its shareholders' money.",
      "An ROE of 20% means for every $100 shareholders have invested, the company earned $20 in profit. Excellent. An ROE of 5% is weak — the company is barely squeezing value from the capital it has. Apple's ROE has exceeded 100% for years — because decades of share buybacks shrank the equity base so much that even large profits produce an extraordinary ratio.",
      "Warren Buffett says he looks for companies with consistently high ROE because it signals a genuine competitive advantage — a 'moat.' A business that earns 25% ROE year after year funds its own growth from profits. It doesn't need to keep issuing new shares (which dilutes your ownership). A great business, he says, takes care of itself."
    ],
    insight: "ROE = Net Income ÷ Shareholder Equity. It measures how efficiently management uses investor money. Above 15% is good. Above 20% is excellent. Buffett rarely buys companies with consistent ROE below 15%.",
    quiz: [
      {
        question: 'A company has $100M in shareholder equity and earns $25M in profit. What is ROE?',
        options: ['4%', '25%', '75%'],
        correct: 1,
        explanation: "ROE = $25M ÷ $100M = 25%. For every $100 shareholders invested, the company earned $25 in profit. That's an excellent ROE by any standard."
      },
      {
        question: "Apple's ROE has exceeded 100% for several years. How is this mathematically possible?",
        options: ["Apple is reporting inflated profits", "Apple's massive share buybacks have reduced shareholder equity so much that the ratio exceeds 100%", "ROE above 100% is impossible"],
        correct: 1,
        explanation: "Apple has spent hundreds of billions buying back its own shares, which shrinks shareholder equity on the balance sheet. With a very small equity denominator, even large profits produce ROE above 100%. It signals exceptional capital efficiency."
      },
      {
        question: "Two companies in the same industry: Company A has ROE 8%, Company B has ROE 22%. All else equal, which shows better management efficiency?",
        options: ['Company A — lower is safer and more conservative', 'Company B — higher ROE means more profit per dollar of shareholder capital', "They're the same — ROE doesn't measure efficiency"],
        correct: 1,
        explanation: "ROE directly measures how well management converts shareholder investment into profit. In the same industry, Company B at 22% vs Company A at 8% is nearly 3× more efficient at turning equity into profit — a significant competitive advantage."
      }
    ]
  },
  {
    id: 'dividend',
    title: 'Dividends: getting paid just for showing up',
    concept: 'Dividend Yield',
    duration: '2 min',
    relatedTicker: 'KO',
    story: [
      "You own 100 shares of Coca-Cola. You haven't done anything. You haven't sold. You didn't even check the app. Then one day, 186 pesos shows up in your account — just because you own shares you already had. That's a dividend: a slice of the company's profits paid directly to you, every quarter.",
      "The dividend yield tells you how much you earn per dollar invested. A 4% yield means every $10,000 you put in pays you $400 per year — before any price gains on the stock itself. Historically, reinvested dividends have accounted for roughly half of total stock market returns. Most beginners ignore this.",
      "Not every company pays dividends. Young, growing companies like Amazon put every peso back into expansion — more warehouses, more engineers, faster growth. Mature companies like Coca-Cola or AT&T have fewer places to invest aggressively, so they return cash to you instead. Neither approach is better. It depends on whether you want income now or growth later."
    ],
    insight: "Dividend yield = Annual Dividend ÷ Stock Price. A 3–5% yield is healthy for income investing. Very high yields (8%+) can signal the stock price has collapsed — always check if the dividend is sustainable before assuming it's a bargain.",
    quiz: [
      {
        question: 'A stock trades at $50 and pays $2 per share per year. What is the dividend yield?',
        options: ['2%', '4%', '25%'],
        correct: 1,
        explanation: "Dividend yield = $2 ÷ $50 = 4%. For every $100 invested, you receive $4 annually in dividends — on top of any price appreciation."
      },
      {
        question: "A company's dividend yield was 3% last month. Today it's 8% — but the company announced no dividend increase. What most likely happened?",
        options: ['The company tripled its dividend quietly', 'The stock price likely collapsed, making the same dividend a higher percentage of the new lower price', "Dividend yield doesn't change unless the company changes the dividend"],
        correct: 1,
        explanation: "Yield = dividend ÷ price. If the dividend stays constant but the stock price drops sharply, yield rises automatically. A 'high yield' that appeared from a price collapse is called a yield trap — always investigate why the price fell before assuming it's a bargain."
      },
      {
        question: "You receive $4/year per share in dividends. The stock price also appreciates 7% per year. What is your total annual return?",
        options: ['7% — only price changes count as returns', '4% — only dividends count as returns', 'Total return includes both — dividend income plus price appreciation'],
        correct: 2,
        explanation: "Total return = dividend income + price appreciation. A stock paying 4% dividends while growing 7% in price delivers ~11% total return. Both components are real wealth creation — many beginners miss this when focusing only on the price chart."
      }
    ]
  },
  {
    id: 'debt-ratio',
    title: 'Debt: when borrowing is smart and when it is dangerous',
    concept: 'Debt Ratio',
    duration: '3 min',
    relatedTicker: 'T',
    story: [
      "All companies borrow money. That's not inherently bad — if you can borrow at 4% interest and invest it at 15% returns, debt is your friend. The question is how much is too much.",
      "The debt-to-equity ratio compares how much a company has borrowed to how much shareholders actually own. A ratio of 0.5 means for every $1 of equity, there's $0.50 of debt — manageable. A ratio of 3.0 means debt is 3× equity — aggressive.",
      "Debt becomes dangerous when revenue drops. During the 2008 financial crisis, many companies with very high debt ratios went bankrupt when revenue fell just 20–30% — because interest payments don't stop even when business slows."
    ],
    insight: "High debt amplifies both gains and losses. Under 1.0 debt-to-equity is generally safe. Above 2.0 raises questions. Always check if the company's earnings comfortably cover its interest payments.",
    quiz: [
      {
        question: 'A company has $400M in total debt and $200M in shareholder equity. What is the debt-to-equity ratio?',
        options: ['0.5', '2.0', '4.0'],
        correct: 1,
        explanation: "Debt-to-equity = $400M ÷ $200M = 2.0. For every $1 of equity, there's $2 of debt. On the higher end — not necessarily dangerous depending on industry, but worth investigating further."
      },
      {
        question: "Two companies both have 2.0 debt-to-equity. Company A is a utility with stable regulated revenue. Company B is a startup with unpredictable income. Which faces more risk?",
        options: ['Company A — utilities always struggle with debt', 'Company B — unpredictable revenue makes debt payments harder to cover consistently', 'They face exactly the same risk — same D/E, same risk'],
        correct: 1,
        explanation: "Debt risk is about ability to pay, not just the ratio. A utility with stable cash flows can service 2.0 D/E comfortably. A startup with volatile revenue faces genuine distress risk at the same number. Always assess debt relative to cash flow stability."
      },
      {
        question: "A company took on heavy debt to expand aggressively. Revenue is growing 25% annually and interest coverage is strong. This debt is...",
        options: ['Always dangerous regardless of context', 'Potentially smart — borrowing cheaply to fund high-return growth is good capital allocation', 'Irrelevant — only equity matters to investors'],
        correct: 1,
        explanation: "Borrowing at 5% to generate 25% revenue growth is excellent capital allocation. The danger emerges when revenue drops or interest rates rise. Strong interest coverage and growing revenue make debt manageable — even beneficial."
      }
    ]
  },
  {
    id: 'current-ratio',
    title: "Current ratio: can the company pay its bills next month?",
    concept: 'Current Ratio',
    duration: '2 min',
    relatedTicker: 'AAPL',
    story: [
      "Imagine running a business. You have $100,000 in your bank account and $80,000 in bills due this month. You're fine. Now imagine you have $100,000 in money customers owe you but won't pay for 90 days, and $120,000 in bills due this month. You're in trouble — even though you're technically owed more than you owe.",
      "The current ratio measures exactly this for companies. It divides current assets (cash and things that convert to cash within a year) by current liabilities (bills due within a year).",
      "A ratio of 1.5 means for every $1 of short-term bills, the company has $1.50 to cover them. Below 1.0 is a red flag. Between 1.5–2.0 is healthy. Very high ratios (5+) may mean the company is sitting on too much idle cash it could be using better."
    ],
    insight: "Current ratio = Current Assets ÷ Current Liabilities. It measures short-term financial health. Below 1.0 is dangerous. 1.5–2.0 is healthy. Shows if the company can cover its bills without selling long-term assets.",
    quiz: [
      {
        question: 'A company has $300M in current assets and $150M in current liabilities. What is the current ratio?',
        options: ['0.5', '1.5', '2.0'],
        correct: 2,
        explanation: "Current ratio = $300M ÷ $150M = 2.0. The company has $2 in short-term assets for every $1 of short-term debt — a solid position."
      },
      {
        question: "Why is a current ratio of 0.8 considered a warning sign?",
        options: ["It means the company isn't profitable", "It means short-term liabilities exceed short-term assets — the company may struggle to cover upcoming bills", "A current ratio below 1.0 is illegal"],
        correct: 1,
        explanation: "Current ratio below 1.0 means the company owes more in the near term than it has available to pay. This creates liquidity risk — it may need to borrow, sell assets, or restructure to meet upcoming obligations."
      },
      {
        question: "A grocery chain has a current ratio of 0.6, but pays suppliers in 30 days and collects cash immediately from customers. Is this necessarily a red flag?",
        options: ['Yes — any ratio below 1.0 is dangerous regardless of business model', "No — grocery chains collect cash before paying suppliers, so low current ratios are normal for the model", 'Current ratio only applies to manufacturing companies'],
        correct: 1,
        explanation: "Context matters. Grocery stores collect cash immediately but pay suppliers on 30–60 day terms — they naturally run low current ratios. It's a feature of their business cycle, not a weakness. Always interpret financial ratios within industry norms."
      }
    ]
  },
  {
    id: '52-week',
    title: 'The 52-week range: price context you actually need',
    concept: '52-Week Range',
    duration: '2 min',
    relatedTicker: 'TSLA',
    story: [
      "Without context, a stock price tells you almost nothing. $50 per share — is that cheap or expensive? You can't know without knowing where it's been. The 52-week high and low give you that context.",
      "If a stock's 52-week range is $40–$120 and it's currently trading at $45, that's important: it was worth $120 less than a year ago, and now it's near its yearly low. That could mean opportunity (market panic) or disaster (the business actually deteriorated).",
      "Investor Peter Lynch looked for strong companies trading near their 52-week lows — cases where the market had repriced them below their fundamental value. A low price is only a bargain if the business itself hasn't changed."
    ],
    insight: "52-week position tells you where the stock sits relative to its recent history. Near the high = strong momentum. Near the low = either opportunity or deterioration — check the fundamentals to decide which.",
    quiz: [
      {
        question: "A stock's 52-week range is $30–$90. It currently trades at $32. What should you do first?",
        options: ["Buy immediately — it's near the yearly low", "Avoid it — it's clearly a bad stock", "Check the fundamentals to understand why it fell so much"],
        correct: 2,
        explanation: "A price near the 52-week low doesn't automatically make it cheap. Investigate: has the business changed? Did earnings collapse? Is it a market overreaction? Context is everything."
      },
      {
        question: "A stock hits a new 52-week high. What does this tell you?",
        options: ['The stock is guaranteed to keep rising', 'The stock has strong recent momentum — but fundamentals still need to justify the price', 'The stock is definitely overvalued and you should sell'],
        correct: 1,
        explanation: "A new 52-week high shows strong positive momentum — investors are more confident than they've been all year. But momentum alone isn't a reason to buy. The underlying business needs to justify the new price level."
      },
      {
        question: "Why did Peter Lynch specifically look for strong companies near their 52-week LOWS?",
        options: ['Because all stocks near their low are guaranteed to recover', 'Strong companies temporarily repriced near lows — due to market overreaction — can offer the best value opportunities', '52-week lows signal stocks headed to zero'],
        correct: 1,
        explanation: "Lynch's insight: the market sometimes overreacts to bad news, sending strong businesses to unreasonably low prices. A good company near its 52-week low — for temporary rather than structural reasons — can be a significant value opportunity. The skill is distinguishing the two."
      }
    ]
  },
  {
    id: 'altman-z',
    title: 'The bankruptcy detector: how to spot trouble before it hits',
    concept: 'Altman Z-Score',
    duration: '3 min',
    relatedTicker: 'AAPL',
    story: [
      "In 1968, NYU professor Edward Altman created a formula that predicts whether a company is headed toward bankruptcy. Using just 5 financial ratios, he could predict corporate bankruptcy up to 2 years in advance with over 70% accuracy for public companies.",
      "The formula combines measures of working capital, profitability, leverage, and asset efficiency into a single number. For most publicly traded companies: above 3.0 means safe zone. Between 1.8 and 3.0 is the gray area. Below 1.8 is the danger zone.",
      "Altman tested it on companies that later went bankrupt, and it correctly flagged most of them years before the collapse. Companies like Enron and Lehman Brothers had declining Z-Scores long before they failed — the warning was visible for those who looked."
    ],
    insight: "Altman Z-Score above 3.0 = financially safe zone. Between 1.8–3.0 = watch carefully. Below 1.8 = elevated financial distress risk. StockIQ uses Z-Score as one of the 14 factors in the stock health score.",
    quiz: [
      {
        question: 'A company has an Altman Z-Score of 1.4. What does this indicate?',
        options: ['The company is extremely profitable', 'The company is in the safe zone financially', 'The company shows elevated financial distress risk'],
        correct: 2,
        explanation: "A Z-Score below 1.8 puts a company in the distress zone — elevated risk of financial difficulty. It doesn't guarantee bankruptcy, but it's a serious warning that deserves deeper investigation."
      },
      {
        question: "Enron and Lehman Brothers both had declining Z-Scores years before their collapses. What does this illustrate?",
        options: ['Z-Score is not useful for real investment analysis', 'Financial ratios can signal deterioration years before a crisis becomes visible in headlines', 'Their collapses were completely unpredictable'],
        correct: 1,
        explanation: "Enron's Z-Score had been deteriorating for years before the scandal broke publicly. Investors who tracked quantitative signals had early warning. This is exactly what systematic financial analysis is designed to catch — patterns that precede visible problems."
      },
      {
        question: "The Altman Z-Score was originally built for public manufacturing companies in 1968. Why is this limitation important to know?",
        options: ["It means the Z-Score is completely useless today", "Applying it to banks, startups, or service companies may produce misleading results — different business models have different financial structures", "1968 financial data is identical to today's"],
        correct: 1,
        explanation: "The original model uses financial ratios from manufacturing balance sheets. Banks hold massive debt by design. Tech companies have minimal physical assets. Applying a 1968 manufacturing formula to a 2024 SaaS startup without adjustment can produce a misleading Z-Score."
      }
    ]
  },
  {
    id: 'earnings-reports',
    title: "Earnings day: why a great company's stock can drop 10% overnight",
    concept: 'Earnings Reports',
    duration: '2 min',
    relatedTicker: 'MSFT',
    story: [
      "In early 2023, Meta announced its best earnings in years — profits up, revenue growing, everything looked great. The stock jumped 23% in one day. A few weeks later, Amazon reported similarly strong results. Its stock fell 5%. Same type of good news, opposite reactions. How?",
      "Expectations. Markets don't reward good results — they reward results that are better than what was already expected. Before each earnings report, Wall Street analysts publish predictions. The stock price already reflects those predictions. Beat them and the stock jumps. Miss them and it falls — even if profits actually grew.",
      "Four times a year, every public company publishes an earnings report: revenue, profits, and guidance for next quarter. That forward guidance — management's forecast — is often what moves the stock most. A company can have a perfect quarter and still drop if next quarter's guidance disappoints. Earnings season is where expectations meet reality, and the gap between them is what matters."
    ],
    insight: "Earnings reports are quarterly profit disclosures every public company must file. Stock prices react to whether results beat or miss analyst expectations — not just whether profits were up or down in absolute terms.",
    quiz: [
      {
        question: "A company expected to earn $2.00 per share instead earns $1.85. What likely happens?",
        options: ["Stock price rises — they still made money", "Stock price likely drops — they missed expectations", "Nothing changes — the market only cares about annual results"],
        correct: 1,
        explanation: "The market prices in expected results in advance. When reality comes in below those expectations — even if the company was still profitable — disappointment often drives the stock down. This is an earnings 'miss.'"
      },
      {
        question: "A company announces 25% profit growth. The stock drops 12%. What most likely happened?",
        options: ['The market made a mistake — 25% profit growth should always be rewarded', 'Analysts had expected 35%+ growth — the 25% result was a miss against high expectations', 'Earnings never actually affect stock prices'],
        correct: 1,
        explanation: "The market prices forward expectations, not past results. If analysts expected 35% and the company delivered 25%, that's a 'miss' — even though profit grew. Expectations, not absolute numbers, move stock prices."
      },
      {
        question: "On an earnings call, what does 'guidance' refer to?",
        options: ["The advice management gives individual investors about buying the stock", "Management's official forecast for the company's performance in coming quarters", "A legal warning that the stock might lose value"],
        correct: 1,
        explanation: "Guidance is management's own projection for future revenue, earnings, and growth. It's often the most watched part of an earnings call — investors aren't just judging what happened, they're re-evaluating what will happen. Strong guidance can move stock prices more than the current quarter's results."
      }
    ]
  },
  {
    id: 'beta',
    title: 'Beta: why some stocks keep you up at night',
    concept: 'Beta',
    duration: '2 min',
    relatedTicker: 'TSLA',
    story: [
      "Tesla and Johnson & Johnson are both in the S&P 500. When the market drops 10%, TSLA might drop 20%. JNJ might drop 4%. When the market rises 10%, TSLA could jump 20% while JNJ barely moves. They're both stocks — but they behave completely differently. That difference is measured by Beta.",
      "Beta of 1.0 means the stock tracks the market exactly. Beta of 2.0 means it moves twice as much — double the gains in bull markets, double the losses in bear markets. Beta of 0.5 means it moves half as much. Utility and healthcare companies tend toward 0.5. High-growth tech can hit 2.0 or above.",
      "There's no universally 'right' beta — only the beta that fits your situation. Money you won't touch for 10 years? High beta could work in your favor. Savings you might need in 2 years? High beta is real risk you can't afford. Knowing a stock's beta before you buy it is knowing what kind of ride you're signing up for."
    ],
    insight: "Beta measures how much a stock swings vs. the overall market. Below 1.0 = calmer than the market. Above 1.0 = more volatile. Know your beta before you sleep on your portfolio.",
    quiz: [
      {
        question: 'The market drops 10% in a day. A stock with Beta of 1.5 would drop approximately...',
        options: ['5%', '10%', '15%'],
        correct: 2,
        explanation: "Beta 1.5 means the stock moves 1.5x the market. Market drops 10% → this stock typically drops ~15%. The same applies upward — it gains more when markets rise too."
      },
      {
        question: "Utility companies often have Beta around 0.4. What does this mean for investors?",
        options: ['Utility stocks are very risky investments', 'They move far less than the overall market — lower upside but cushioned during market crashes', 'Beta of 0.4 signals the company is in financial distress'],
        correct: 1,
        explanation: "A Beta of 0.4 means the stock typically moves 40% as much as the market. In a 10% market drop, it might fall only 4%. This predictability makes low-beta stocks attractive for risk-averse investors or those nearing retirement."
      },
      {
        question: "An investor holds a high-beta portfolio and earns 40% during a bull market. In the next bear market, the portfolio drops 45%. What should they have understood about beta?",
        options: ['Beta only matters in bear markets — ignore it during bull runs', 'Beta works both ways — the amplification that boosted gains also amplifies losses', 'High-beta portfolios automatically recover faster after crashes'],
        correct: 1,
        explanation: "Beta is symmetric. A 2.0 Beta stock that doubles your gains in a bull market also doubles your losses in a bear market. Investors who chase high-beta returns in good times are often unprepared for the magnitude of losses when the cycle reverses."
      }
    ]
  },
  {
    id: 'rsi',
    title: 'RSI: when a stock moves too far too fast',
    concept: 'RSI',
    duration: '3 min',
    relatedTicker: 'NVDA',
    story: [
      "In late 2021, NVIDIA's stock had been climbing fast — very fast. Its RSI hit 82, signaling that buyers had been pushing the price up harder than usual for weeks. Three months later, the stock had dropped 40%. RSI didn't predict the crash, but it had been waving a yellow flag the whole time.",
      "RSI — Relative Strength Index — is a 0-to-100 score measuring how fast and how hard a stock has been moving recently. Think of it as a momentum speedometer, not a valuation tool. Above 70: the stock has risen quickly and may be getting ahead of itself — possibly overbought. Below 30: sellers may have pushed it down too fast — possibly oversold, with a bounce likely.",
      "The key word is 'possibly.' RSI is a caution signal, not a countdown timer. Strong stocks in genuine uptrends can hold above 70 for months — overbought can become more overbought. RSI tells you about speed and momentum. Whether the company is actually worth owning at this price still requires checking the fundamentals."
    ],
    insight: "RSI between 30–70 = normal range. Above 70 = potentially overbought (rose too fast). Below 30 = potentially oversold (fell too fast). Use alongside fundamentals, not as a standalone signal.",
    quiz: [
      {
        question: 'A stock has an RSI of 78. What does this most likely indicate?',
        options: ['The stock is undervalued and a great buy', 'The stock may have risen too fast and could be overbought', 'The stock is about to go bankrupt'],
        correct: 1,
        explanation: "RSI above 70 suggests the stock has risen quickly and may be overbought. It's a caution signal, not a guarantee of decline. Always check the underlying fundamentals too."
      },
      {
        question: "RSI falls to 22. What does this suggest — and what should you do?",
        options: ['Buy immediately — below 30 is always a guaranteed buy signal', 'The stock may be oversold, but check fundamentals first — a deteriorating business can have low RSI for good reason', 'The company is about to go bankrupt'],
        correct: 1,
        explanation: "RSI below 30 signals oversold conditions — sellers may have pushed the price down faster than fundamentals justify. But 'potential rebound' isn't 'guaranteed.' A stock can be cheap AND still declining. RSI tells you about momentum, not business quality."
      },
      {
        question: "A strong stock has had RSI above 75 for three months straight. What does this mean?",
        options: ['The stock must crash soon — RSI cannot stay this high', 'Strong persistent buying pressure — RSI can stay elevated for extended periods during genuine uptrends', 'RSI is broken if it stays above 70 that long'],
        correct: 1,
        explanation: "RSI doesn't reset on a schedule. During strong uptrends in quality companies, RSI can remain elevated for months. This is why traders say 'overbought can become more overbought.' RSI is a caution signal, not a countdown timer."
      }
    ]
  },
  {
    id: 'moving-average',
    title: 'Moving average: how to spot trends hiding in the noise',
    concept: 'Moving Average',
    duration: '2 min',
    relatedTicker: 'SPY',
    story: [
      "Tesla's daily price chart looks like a seismograph during an earthquake — constant spikes up, spikes down, noise in every direction. If you stare at daily prices, you can't tell if the stock is actually going anywhere. That's the problem moving averages solve: they filter the noise to show you the underlying direction.",
      "A 50-day moving average is simply the average closing price of the last 50 trading days, updated every day. When today's price is above that average, the stock is trending upward. When it dips below, momentum has shifted. It's like blurring a noisy image until the shape becomes clear.",
      "Traders watch two key crossovers. The 'golden cross' — the 50-day moving average rises above the 200-day — is historically seen as bullish. The 'death cross' — 50-day falls below 200-day — as bearish. These don't guarantee anything on their own, but millions of traders act on them, which makes them matter enough to understand."
    ],
    insight: "Moving average smooths daily price noise to show the trend. Price above 50-day MA = short-term uptrend. Price below = downtrend. Simple, but useful as one signal among many.",
    quiz: [
      {
        question: "A stock's current price is $85. Its 50-day moving average is $72. What does this suggest?",
        options: ["The stock is in a short-term downtrend", "The stock is trading above its recent average — showing upward momentum", "The stock is overpriced by exactly $13"],
        correct: 1,
        explanation: "When price ($85) is above the 50-day MA ($72), the stock is trending upward relative to the last 50 days. A momentum signal — not a buy signal on its own, but a positive indicator."
      },
      {
        question: "The 50-day moving average crosses ABOVE the 200-day moving average. Traders call this a 'golden cross.' What does it signal?",
        options: ['The stock is about to crash', 'Short-term momentum has turned positive relative to the longer-term trend — often viewed as a bullish signal', 'The company is being acquired'],
        correct: 1,
        explanation: "A golden cross (50-day crossing above 200-day) suggests short-term momentum is catching up with and surpassing the longer-term trend. Many technical analysts view this as bullish — though always combine with fundamental analysis before acting."
      },
      {
        question: "Why does a moving average always lag behind the current price by definition?",
        options: ['Moving averages are computed incorrectly by data providers', 'They average past prices — by definition they can only reflect history, not predict what happens next', 'Moving averages move in the opposite direction to price'],
        correct: 1,
        explanation: "A 50-day moving average is the average of the LAST 50 days. It can only tell you about the past trend — not the next move. This is the core limitation of all technical indicators: they describe history. The future depends on what happens next."
      }
    ]
  }
];

var _currentLesson = null;
var _currentQuizIndex = 0;

function getCompletedLessons() {
  return JSON.parse(localStorage.getItem('completed-lessons') || '[]');
}

function getNextLesson() {
  var completed = getCompletedLessons();
  for (var i = 0; i < DAILY_LESSONS.length; i++) {
    if (!completed.includes(DAILY_LESSONS[i].id)) return DAILY_LESSONS[i];
  }
  return DAILY_LESSONS[0];
}

function isLessonUnlocked(index) {
  if (index === 0) return true;
  return getCompletedLessons().includes(DAILY_LESSONS[index - 1].id);
}

// kept for backward compat (xp, challenges etc.)
function getDailyLesson() { return getNextLesson(); }

function isLessonDoneToday() {
  return localStorage.getItem('lesson-done-date') === new Date().toDateString();
}

function trackTermViewed(term) {
  if (!term) return;
  var seen = JSON.parse(localStorage.getItem('seen-terms') || '[]');
  if (!seen.includes(term)) {
    seen.push(term);
    localStorage.setItem('seen-terms', JSON.stringify(seen));
  }
}

function renderLearnTab() {
  var lesson = getNextLesson();
  var completed = getCompletedLessons();
  var seenTerms = JSON.parse(localStorage.getItem('seen-terms') || '[]');
  var total = DAILY_LESSONS.length;
  var allDone = completed.length >= total;

  var dailyEl = document.getElementById('learn-daily-section');
  if (dailyEl) {
    var isDone = allDone;
    dailyEl.innerHTML =
      '<div class="learn-section-label">' + (allDone ? 'ALL LESSONS COMPLETE' : 'NEXT LESSON') + '</div>' +
      '<div class="daily-lesson-card' + (isDone ? ' done' : '') + '"' + (isDone ? '' : ' onclick="openLesson(getNextLesson())" style="cursor:pointer;"') + '>' +
        '<div class="daily-lesson-top">' +
          '<span class="daily-lesson-concept">' + escHtml(lesson.concept) + '</span>' +
          '<span class="daily-lesson-duration">' + escHtml(lesson.duration) + '</span>' +
        '</div>' +
        '<div class="daily-lesson-title">' + escHtml(lesson.title) + '</div>' +
        (isDone
          ? '<div class="daily-lesson-done"><span class="lesson-done-badge">✓ All ' + total + ' lessons completed</span></div>'
          : '<button class="daily-lesson-btn" onclick="openLesson(getNextLesson())">Start Lesson →</button>'
        ) +
      '</div>';
  }

  var masteryEl = document.getElementById('learn-mastery-section');
  if (masteryEl) {
    var pct = Math.round((completed.length / total) * 100);
    masteryEl.innerHTML =
      '<div class="learn-section-label">YOUR PROGRESS</div>' +
      '<div class="mastery-stats">' +
        '<div class="mastery-count">' + completed.length + '<span> / ' + total + ' lessons</span></div>' +
        '<div class="mastery-terms-stat">' + seenTerms.length + ' glossary terms explored</div>' +
      '</div>' +
      '<div class="mastery-bar-wrap"><div class="mastery-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="mastery-chips">' +
        DAILY_LESSONS.map(function(l) {
          var done = completed.includes(l.id);
          return '<span class="mastery-chip' + (done ? ' done' : '') + '">' + (done ? '✓ ' : '') + escHtml(l.concept) + '</span>';
        }).join('') +
      '</div>';
  }

  var allEl = document.getElementById('learn-all-section');
  if (allEl) {
    allEl.innerHTML =
      '<div class="learn-section-label">ALL LESSONS</div>' +
      '<div class="lesson-grid">' +
        DAILY_LESSONS.map(function(l, i) {
          var done = completed.includes(l.id);
          var unlocked = isLessonUnlocked(i);
          var isNext = !allDone && l.id === lesson.id;
          var clickAttr = unlocked ? ' onclick="openLesson(DAILY_LESSONS[' + i + '])" style="cursor:pointer;"' : '';
          return '<div class="lesson-grid-card' + (done ? ' done' : '') + (isNext ? ' today' : '') + (!unlocked ? ' locked' : '') + '"' + clickAttr + '>' +
            '<div class="lesson-grid-top">' +
              '<span class="lesson-grid-concept">' + escHtml(l.concept) + '</span>' +
              (done ? '<span class="lesson-grid-check">✓</span>' : (isNext ? '<span class="lesson-grid-today">Next</span>' : (!unlocked ? '<span class="lesson-grid-lock">🔒</span>' : '<span class="lesson-grid-dur">' + escHtml(l.duration) + '</span>'))) +
            '</div>' +
            '<div class="lesson-grid-title">' + escHtml(l.title) + '</div>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  var glossaryEl = document.getElementById('learn-glossary-cta');
  if (glossaryEl) {
    glossaryEl.innerHTML =
      '<div class="learn-section-label">GLOSSARY</div>' +
      '<button class="learn-glossary-btn" onclick="toggleDictionary()">Browse 50+ financial terms →</button>';
  }
}

function _renderQuizQuestion(lesson, idx) {
  var q = lesson.quiz[idx];
  var total = lesson.quiz.length;
  return '<div class="lesson-quiz" id="lesson-quiz-inner">' +
    '<div class="lesson-quiz-progress">Question ' + (idx + 1) + ' of ' + total + '</div>' +
    '<div class="lesson-quiz-q">' + escHtml(q.question) + '</div>' +
    '<div class="lesson-quiz-options">' +
      q.options.map(function(opt, i) {
        return '<button class="lesson-quiz-opt" data-idx="' + i + '" onclick="answerLesson(' + i + ')">' + escHtml(opt) + '</button>';
      }).join('') +
    '</div>' +
  '</div>';
}

function openLesson(lesson) {
  if (!lesson) return;
  _currentLesson = lesson;
  _currentQuizIndex = 0;
  var existing = document.getElementById('lesson-modal-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'lesson-modal-overlay';
  overlay.innerHTML =
    '<div id="lesson-modal">' +
      '<div id="lesson-modal-header">' +
        '<button class="lesson-back-btn" onclick="document.getElementById(\'lesson-modal-overlay\').remove()">&#8592;</button>' +
        '<div class="lesson-header-meta">' +
          '<span class="lesson-header-concept">' + escHtml(lesson.concept) + '</span>' +
          '<span class="lesson-header-duration">' + escHtml(lesson.duration) + '</span>' +
        '</div>' +
      '</div>' +
      '<div id="lesson-modal-body">' +
        '<h2 class="lesson-title">' + escHtml(lesson.title) + '</h2>' +
        '<div class="lesson-story">' +
          lesson.story.map(function(p) { return '<p>' + escHtml(p) + '</p>'; }).join('') +
        '</div>' +
        '<div class="lesson-insight">' +
          '<div class="lesson-insight-label">Key takeaway</div>' +
          '<div class="lesson-insight-text">' + escHtml(lesson.insight) + '</div>' +
        '</div>' +
        _renderQuizQuestion(lesson, 0) +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
}

function answerLesson(chosen) {
  if (!_currentLesson) return;
  var q = _currentLesson.quiz[_currentQuizIndex];
  var correct = q.correct;
  var isRight = chosen === correct;
  var isLast = _currentQuizIndex === _currentLesson.quiz.length - 1;

  document.querySelectorAll('.lesson-quiz-opt').forEach(function(btn, i) {
    btn.disabled = true;
    if (i === correct) btn.classList.add('correct');
    else if (i === chosen && !isRight) btn.classList.add('wrong');
  });

  var quizEl = document.getElementById('lesson-quiz-inner');
  if (!quizEl) return;
  var resultEl = document.createElement('div');
  resultEl.className = 'lesson-quiz-result ' + (isRight ? 'right' : 'wrong');
  resultEl.innerHTML =
    '<div class="lesson-quiz-result-icon">' + (isRight ? '✓' : '→') + '</div>' +
    '<div class="lesson-quiz-result-label">' + (isRight ? 'Correct!' : 'Not quite —') + '</div>' +
    '<div class="lesson-quiz-result-exp">' + escHtml(q.explanation) + '</div>' +
    (isLast
      ? '<button class="lesson-complete-btn" onclick="showLessonCompletion()">See your result →</button>'
      : '<button class="lesson-complete-btn" onclick="nextLessonQuestion()">Next question →</button>'
    );
  quizEl.appendChild(resultEl);
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function nextLessonQuestion() {
  if (!_currentLesson) return;
  _currentQuizIndex++;
  var body = document.getElementById('lesson-modal-body');
  if (!body) return;
  var oldQuiz = document.getElementById('lesson-quiz-inner');
  if (oldQuiz) oldQuiz.remove();
  var newQuizHtml = _renderQuizQuestion(_currentLesson, _currentQuizIndex);
  var tmp = document.createElement('div');
  tmp.innerHTML = newQuizHtml;
  var newQuiz = tmp.firstChild;
  newQuiz.style.opacity = '0';
  newQuiz.style.transform = 'translateY(12px)';
  body.appendChild(newQuiz);
  requestAnimationFrame(function() {
    newQuiz.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    newQuiz.style.opacity = '1';
    newQuiz.style.transform = 'translateY(0)';
  });
  newQuiz.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showLessonCompletion() {
  var body = document.getElementById('lesson-modal-body');
  if (!body || !_currentLesson) return;
  var oldQuiz = document.getElementById('lesson-quiz-inner');
  if (oldQuiz) oldQuiz.remove();

  var ticker = _currentLesson.relatedTicker;
  var completionEl = document.createElement('div');
  completionEl.id = 'lesson-completion-section';
  completionEl.style.cssText = 'opacity:0;transform:translateY(12px);transition:opacity 0.25s ease,transform 0.25s ease;';
  completionEl.innerHTML =
    '<div class="lesson-completion-wrap">' +
      '<div class="lesson-completion-icon">✓</div>' +
      '<div class="lesson-completion-title">Quiz complete</div>' +
      '<div class="lesson-completion-sub">You\'ve finished all 3 questions on ' + escHtml(_currentLesson.concept) + '.</div>' +
      (ticker
        ? '<button class="lesson-see-stock-btn" onclick="goToStockFromLesson(\'' + escHtml(ticker) + '\')">See ' + escHtml(ticker) + ' in StockIQ →</button>'
        : '') +
      '<button class="lesson-complete-btn" onclick="completeLesson(\'' + escHtml(_currentLesson.id) + '\')">Complete lesson →</button>' +
    '</div>';
  body.appendChild(completionEl);
  requestAnimationFrame(function() {
    completionEl.style.opacity = '1';
    completionEl.style.transform = 'translateY(0)';
  });
  completionEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function goToStockFromLesson(ticker) {
  var overlay = document.getElementById('lesson-modal-overlay');
  if (overlay) overlay.remove();
  showTab('analyze');
  quickSearch(ticker);
}

function completeLesson(lessonId) {
  var completed = getCompletedLessons();
  if (!completed.includes(lessonId)) {
    completed.push(lessonId);
    localStorage.setItem('completed-lessons', JSON.stringify(completed));
  }
  localStorage.setItem('lesson-done-date', new Date().toDateString());
  _currentQuizIndex = 0;
  var overlay = document.getElementById('lesson-modal-overlay');
  if (overlay) overlay.remove();
  renderLearnTab();
  showLearnSnackbar('✓ Lesson complete — ' + completed.length + ' of ' + DAILY_LESSONS.length + ' concepts learned');
}

function showLearnSnackbar(msg) {
  var s = document.createElement('div');
  s.className = 'learn-snackbar';
  s.textContent = msg;
  document.body.appendChild(s);
  setTimeout(function() { s.classList.add('visible'); }, 50);
  setTimeout(function() { s.classList.remove('visible'); setTimeout(function() { s.remove(); }, 300); }, 3000);
}
// ── Dark mode ────────────────────────────────────────────────
function toggleDarkMode() {
  let isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  let next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  let btn = document.getElementById('dark-mode-toggle');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

function initTheme() {
  let saved = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', saved);
  let btn = document.getElementById('dark-mode-toggle');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';

  // Follow system changes live, but only if the user hasn't manually picked a theme
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
    if (localStorage.getItem('theme')) return; // user has a manual preference — don't override
    let theme = e.matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    let b = document.getElementById('dark-mode-toggle');
    if (b) b.textContent = theme === 'dark' ? '☀️' : '🌙';
  });
}
// ── END dark mode ────────────────────────────────────────────

let _toastTimer = null;
function showToast(msg) {
  let el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { el.classList.remove("show"); }, 3000);
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

let finnhubKey   = window.FINNHUB_KEY;
let polygonKey   = window.POLYGON_KEY;
let anthropicKey = window.ANTHROPIC_KEY;
let cache = {};
let chartInstance = null;
let currentTicker = null;
let currentScore = null;
let currentName = null;
let userProfile = null;
let quizAnswers = {};
let portfolioChartInstance = null;
let portfolioLineChartInstance = null;
let allChartPrices = [];
let allChartDates = [];
let allChartVolumes = [];
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
}

let _autocompleteTimer = null;

function onSearchInput() {
  let query = document.getElementById('stock-input').value.trim();
  let dropdown = document.getElementById('search-dropdown');
  clearTimeout(_autocompleteTimer);
  if (query.length < 2) { dropdown.style.display = 'none'; return; }
  _autocompleteTimer = setTimeout(function() {
    fetch('https://finnhub.io/api/v1/search?q=' + encodeURIComponent(query) + '&token=' + finnhubKey)
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
  let dropdown = document.getElementById('port-ticker-dropdown');
  clearTimeout(_portAutocompleteTimer);
  if (query.length < 2) { dropdown.style.display = 'none'; return; }
  _portAutocompleteTimer = setTimeout(function() {
    fetch('https://finnhub.io/api/v1/search?q=' + encodeURIComponent(query) + '&token=' + finnhubKey)
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
    fetch('https://api.polygon.io/v1/open-close/' + ticker + '/' + dateStr + '?adjusted=true&apiKey=' + polygonKey)
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
  let loadingEl = document.getElementById('port-price-loading');
  let priceEl = document.getElementById('port-price');
  priceEl.value = '';
  if (loadingEl) loadingEl.style.display = 'inline';
  fetch('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(ticker) + '&token=' + finnhubKey)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (data && data.c) priceEl.value = data.c.toFixed(2);
    })
    .catch(function() { if (loadingEl) loadingEl.style.display = 'none'; });
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

  document.getElementById("loading").style.display = "block";
  let loadingTickerEl = document.getElementById("loading-ticker");
  if (loadingTickerEl) loadingTickerEl.textContent = query;
  document.getElementById("stock-name").innerHTML = "";
  document.getElementById("health-score").innerHTML = "";
  document.getElementById("signal").textContent = "Finding stock...";
  document.getElementById("signal").style.color = "#6b8fa6";
  document.getElementById("signal").style.background = "none";
  document.getElementById("signal").style.border = "none";
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

  if (cache[query]) { displayData(cache[query]); return; }

  fetch("https://finnhub.io/api/v1/search?q=" + query + "&token=" + finnhubKey)
    .then(function(r) { return r.json(); })
    .then(function(searchData) {
      let ticker = query;
      if (searchData.result && searchData.result.length > 0) ticker = searchData.result[0].symbol;

      let today = new Date();
      let toDate = today.toISOString().split("T")[0];
      let fromDate90 = new Date(today); fromDate90.setDate(today.getDate() - 90);
      let fromDate90Str = fromDate90.toISOString().split("T")[0];
      let fromDate30 = new Date(today); fromDate30.setDate(today.getDate() - 30);
      let fromDate30Str = fromDate30.toISOString().split("T")[0];

      let _cachedRaw = localStorage.getItem("poly_" + ticker);
      let _cachedEntry = _cachedRaw ? JSON.parse(_cachedRaw) : null;
      let _cacheValid = _cachedEntry && _cachedEntry.ts && (Date.now() - _cachedEntry.ts < 86400000);
      let historyPromise = _cacheValid
        ? Promise.resolve(_cachedEntry.data)
        : fetch("https://api.polygon.io/v2/aggs/ticker/" + ticker + "/range/1/day/" + fromDate90Str + "/" + toDate + "?apiKey=" + polygonKey).then(function(r) { return r.json(); });

      let earningsFrom = toDate;
      let earningsTo = new Date(today); earningsTo.setDate(today.getDate() + 90);
      let earningsToStr = earningsTo.toISOString().split("T")[0];

      // Load core data first (no chart) — show results immediately
      Promise.all([
        fetch("https://finnhub.io/api/v1/quote?symbol=" + ticker + "&token=" + finnhubKey).then(function(r) { return r.json(); }),
        fetch("https://finnhub.io/api/v1/stock/profile2?symbol=" + ticker + "&token=" + finnhubKey).then(function(r) { return r.json(); }),
        fetch("https://finnhub.io/api/v1/company-news?symbol=" + ticker + "&from=" + fromDate30Str + "&to=" + toDate + "&token=" + finnhubKey).then(function(r) { return r.json(); }),
        fetch("https://finnhub.io/api/v1/stock/metric?symbol=" + ticker + "&metric=all&token=" + finnhubKey).then(function(r) { return r.json(); }),
        fetch("https://finnhub.io/api/v1/calendar/earnings?symbol=" + ticker + "&from=" + earningsFrom + "&to=" + earningsToStr + "&token=" + finnhubKey).then(function(r) { return r.json(); }).catch(function() { return {}; }),
        fetch("https://finnhub.io/api/v1/stock/earnings?symbol=" + ticker + "&limit=1&token=" + finnhubKey).then(function(r) { return r.json(); }).catch(function() { return []; }),
        fetch("https://api.polygon.io/v3/reference/tickers/" + ticker + "?apiKey=" + polygonKey).then(function(r) { return r.json(); }).catch(function() { return {}; })
      ]).then(function(results) {
        let quote      = results[0];
        let profile    = results[1];
        let news       = results[2];
        let metrics    = results[3].metric || {};
        let earningsData = results[4];
        let pastEarnings = results[5];
        let tickerDetails = results[6].results || {};
        if (tickerDetails.description) profile.description = tickerDetails.description;

        // Unsupported ticker — no price and no company name means Finnhub doesn't cover it
        if (!quote.c && !profile.name) {
          document.getElementById("loading").style.display = "none";
          let isMXq = ticker.endsWith('.MX');
          showToast("\"" + ticker + "\" isn't supported." + (isMXq ? " Try the full ticker, e.g. AMXL.MX" : " StockIQ covers US-listed stocks and major Mexican tickers (.MX)."));
          return;
        }

        let data = { ticker, quote, profile, news, metrics, prices: [], dates: [], volumes: [], earningsData, pastEarnings };
        cache[query] = data;
        displayData(data);

        // Load chart separately — doesn't block the main results
        historyPromise.then(function(history) {
          let prices = [], dates = [], volumes = [];
          if (history.results && history.results.length > 0) {
            localStorage.setItem("poly_" + ticker, JSON.stringify({ ts: Date.now(), data: history }));
            history.results.forEach(function(bar) {
              dates.push(new Date(bar.t).toISOString().split("T")[0]);
              prices.push(bar.c);
              volumes.push(bar.v || 0);
            });
          }
          cache[query].prices  = prices;
          cache[query].dates   = dates;
          cache[query].volumes = volumes;
          let q = cache[query].quote || {};
          loadChart(prices, dates, volumes, q.pc || 0, q.h || 0, q.l || 0, metrics['52WeekHigh'] || 0);
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
  let margin = metrics["netProfitMarginTTM"] || 0;
  let marginScore = margin > 25 ? 10 : margin > 15 ? 8 : margin > 5 ? 6 : margin > 0 ? 4 : margin > -20 ? 2 : margin > -50 ? 1 : 0;
  let growth = metrics["revenueGrowthTTMYoy"] || 0;
  let growthScore = growth > 20 ? 10 : growth > 10 ? 8 : growth > 0 ? 6 : growth > -10 ? 3 : growth > -25 ? 2 : 1;
  let dte = metrics["totalDebt/totalEquityAnnual"] || 0;
  let debtScore = dte < 0.3 ? 10 : dte < 0.6 ? 8 : dte < 1 ? 6 : dte < 2 ? 3 : 1;
  let rsiScore = rsi === null ? 5 : rsi < 30 ? 9 : rsi < 45 ? 7 : rsi < 55 ? 5 : rsi < 70 ? 4 : 1;
  let maScore = 5;
  if (ma50 !== null) {
    let p = ((price - ma50) / ma50) * 100;
    maScore = p > 5 ? 8 : p > 0 ? 7 : p > -5 ? 4 : 2;
  }

  let roe = metrics["roeAnnual"] || metrics["roeTTM"] || 0;
  let roeScore = roe > 20 ? 10 : roe > 15 ? 8 : roe > 10 ? 7 : roe > 5 ? 5 : roe > 0 ? 3 : 1;

  let currentRatio = metrics["currentRatioAnnual"] || metrics["currentRatioQuarterly"] || 0;
  let currentRatioScore = currentRatio > 3 ? 8 : currentRatio > 2 ? 9 : currentRatio > 1.5 ? 8 : currentRatio > 1 ? 6 : currentRatio > 0.5 ? 3 : 1;

  let interestCoverage = metrics["netInterestCoverageAnnual"] || 0;
  let interestScore = interestCoverage > 10 ? 10 : interestCoverage > 5 ? 8 : interestCoverage > 3 ? 6 : interestCoverage > 1 ? 4 : interestCoverage > 0 ? 2 : 1;

  let total =
    priceScore        * 0.12 +
    positionScore     * 0.08 +
    peScore           * 0.08 +
    betaScore         * 0.04 +
    marginScore       * 0.16 +
    growthScore       * 0.12 +
    debtScore         * 0.04 +
    rsiScore          * 0.08 +
    maScore           * 0.04 +
    qualScore         * 0.04 +
    roeScore          * 0.08 +
    currentRatioScore * 0.06 +
    interestScore     * 0.06;

  return {
    total: Math.min(100, Math.max(0, Math.round(total * 10))),
    breakdown: {
      price: priceScore, position: positionScore, pe: peScore, beta: betaScore,
      margin: marginScore, growth: growthScore, debt: debtScore, rsi: rsiScore,
      ma: maScore, news: qualScore, roe: roeScore,
      currentRatio: currentRatioScore, interest: interestScore
    }
  };
}

function buildScoreExplainer(_bd, pe, margin, growth, beta, rsi, _ma50) {
  let lines = [];

  // Profit margin
  if (margin > 20) lines.push({ icon: "↑", color: "#16a34a", text: "Strong profit margins (" + margin.toFixed(1) + "%) — keeps more of every dollar earned" });
  else if (margin > 5) lines.push({ icon: "→", color: "#d97706", text: "Moderate profit margins (" + margin.toFixed(1) + "%) — decent but room to improve" });
  else if (margin < 0) lines.push({ icon: "↓", color: "#dc2626", text: "Negative profit margins (" + margin.toFixed(1) + "%) — currently losing money" });
  else lines.push({ icon: "→", color: "#d97706", text: "Thin profit margins (" + margin.toFixed(1) + "%) — not much profit per dollar of sales" });

  // Revenue growth
  if (growth > 15) lines.push({ icon: "↑", color: "#16a34a", text: "Strong revenue growth (+" + growth.toFixed(1) + "% YoY) — business is expanding fast" });
  else if (growth > 0) lines.push({ icon: "→", color: "#d97706", text: "Moderate revenue growth (+" + growth.toFixed(1) + "% YoY) — steady but not explosive" });
  else lines.push({ icon: "↓", color: "#dc2626", text: "Revenue shrinking (" + growth.toFixed(1) + "% YoY) — sales are declining" });

  // P/E ratio
  if (pe > 0 && pe < 15) lines.push({ icon: "↑", color: "#16a34a", text: "Low P/E ratio (" + pe.toFixed(1) + ") — may be undervalued relative to earnings" });
  else if (pe > 0 && pe < 30) lines.push({ icon: "→", color: "#d97706", text: "Average P/E ratio (" + pe.toFixed(1) + ") — fairly priced for current earnings" });
  else if (pe > 30) lines.push({ icon: "↓", color: "#dc2626", text: "High P/E ratio (" + pe.toFixed(1) + ") — priced for high future growth, adds risk" });
  else if (pe < 0) lines.push({ icon: "↓", color: "#dc2626", text: "Negative P/E — company is currently unprofitable" });

  // RSI
  if (rsi !== null) {
    if (rsi < 30) lines.push({ icon: "↑", color: "#16a34a", text: "RSI " + rsi + " — oversold, possible rebound ahead" });
    else if (rsi > 70) lines.push({ icon: "↓", color: "#dc2626", text: "RSI " + rsi + " — overbought, may pull back soon" });
    else lines.push({ icon: "→", color: "#64748b", text: "RSI " + rsi + " — neutral momentum, no extreme signals" });
  }

  // Beta (risk)
  if (beta < 1) lines.push({ icon: "↑", color: "#16a34a", text: "Low beta (" + beta.toFixed(2) + ") — less volatile than the market" });
  else if (beta < 1.5) lines.push({ icon: "→", color: "#d97706", text: "Beta " + beta.toFixed(2) + " — moves similarly to the overall market" });
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

function saveScoreHistory(ticker, score) {
  let key = "history_score_" + ticker;
  let history = JSON.parse(localStorage.getItem(key) || "[]");
  let today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (history.length > 0 && history[history.length - 1].date === today) {
    history[history.length - 1].score = score;
  } else {
    history.push({ date: today, score: score });
  }
  if (history.length > 10) history = history.slice(-10);
  localStorage.setItem(key, JSON.stringify(history));
  return history;
}

function buildScoreHistoryBars(ticker, currentScore) {
  let key = "history_score_" + ticker;
  let history = JSON.parse(localStorage.getItem(key) || "[]");
  if (history.length < 2) return { trend: "", bars: "" };
  let prev = history[history.length - 2];
  let diff = currentScore - prev.score;
  let arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
  let color = diff > 0 ? "#16a34a" : diff < 0 ? "#dc2626" : "#64748b";
  let label = diff > 0 ? "improving" : diff < 0 ? "declining" : "unchanged";
  let bars = history.map(function(h) {
    let barColor = h.score >= 65 ? "#16a34a" : h.score >= 50 ? "#d97706" : "#dc2626";
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
          "<span><span style='color:#16a34a;font-weight:700;'>■</span> Strong 65+</span>" +
          "<span><span style='color:#d97706;font-weight:700;'>■</span> Watch 50–64</span>" +
          "<span><span style='color:#dc2626;font-weight:700;'>■</span> Risky &lt;50</span>" +
          "</div>"
  };
}

function getScoreHistoryHtml(ticker, currentScore) {
  let h = buildScoreHistoryBars(ticker, currentScore);
  if (!h.bars) return "";
  return "<br><br><strong>Score History:</strong><br>" + h.trend + h.bars;
}

function displayData(data) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("results-section").style.display = "flex";

  let { ticker, quote, profile, news, metrics, prices, dates, volumes, earningsData, pastEarnings } = data;
  let price = quote.c, changePct = quote.dp, prevClose = quote.pc, dayHigh = quote.h, dayLow = quote.l;
  let companyName = profile.name || ticker;
  let isMX = ticker.endsWith('.MX');
  let currSym = isMX ? 'MX$' : '$';
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

  let result = calculateScore(changePct, week52High, price, pe, metrics, qualScore, rsi, ma50);
  let totalScore = result.total;
  let breakdown = result.breakdown;

  saveScoreHistory(ticker, totalScore);
  let analyzed = parseInt(localStorage.getItem('total-analyzed') || '0');
  analyzed += 1;
  localStorage.setItem('total-analyzed', analyzed);
  saveToFirestore({ stats: { analyzed: analyzed } });

  currentTicker = ticker;
  currentScore = totalScore;
  currentName = companyName;
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
  let changeColor = changeAmt >= 0 ? "#16a34a" : "#dc2626";
  let changeArrow = changeAmt >= 0 ? "▲" : "▼";
  let changePill = prevClose > 0
    ? "<span class='price-change-pill' style='background:" + (changeAmt >= 0 ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)") + ";color:" + changeColor + ";'>" +
      changeArrow + " " + changeSign + currSym + Math.abs(changeAmt).toFixed(2) + " (" + changeSign + changePct.toFixed(2) + "%)" +
      "</span>"
    : "";
  document.getElementById("stock-name").innerHTML =
    "<div class='stock-header-row'>" +
      logoHtml +
      "<div class='stock-header-meta'>" +
        "<div class='stock-header-ticker'>" + escHtml(ticker) + " · <span class='stock-header-fullname'>" + escHtml(companyName) + "</span></div>" +
      "</div>" +
    "</div>" +
    "<div class='stock-header-price'>" +
      currSym + price.toFixed(2) + (isMX ? "<span class='stock-currency-label'>MXN</span>" : "") +
      changePill +
    "</div>";

  let scoreColor = totalScore >= 65 ? "#16a34a" : totalScore >= 50 ? "#d97706" : "#dc2626";
  let scoreLabel = totalScore >= 65 ? "Strong" : totalScore >= 50 ? "Watch" : "Risky";
  document.getElementById("health-score").innerHTML =
    "<div class='score-badge' style='border-color:" + scoreColor + ";'>" +
      "<div class='score-badge-num' style='color:" + scoreColor + ";'>" + totalScore + "</div>" +
      "<div class='score-badge-label'>/ 100</div>" +
      "<div class='score-badge-tag' style='color:" + scoreColor + ";'>" + scoreLabel + "</div>" +
    "</div>" +
    buildScoreExplainer(breakdown, pe, margin, growth, beta, rsi, ma50);

  let signalEl = document.getElementById("signal");
  if (totalScore >= 65) {
    signalEl.textContent = "Strong Opportunity — fundamentals look solid";
    signalEl.style.color = "#16a34a";
    signalEl.style.background = "rgba(22,163,74,0.1)";
    signalEl.style.border = "1px solid rgba(22,163,74,0.2)";
  } else if (totalScore >= 50) {
    signalEl.textContent = "Watch & Wait — some positives, some risks";
    signalEl.style.color = "#d97706";
    signalEl.style.background = "rgba(217,119,6,0.1)";
    signalEl.style.border = "1px solid rgba(217,119,6,0.2)";
  } else {
    signalEl.textContent = "High Risk — proceed with caution";
    signalEl.style.color = "#dc2626";
    signalEl.style.background = "rgba(220,38,38,0.1)";
    signalEl.style.border = "1px solid rgba(220,38,38,0.2)";
  }


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

  document.getElementById("show-details-btn").style.display = "block";
  document.getElementById("show-details-btn").textContent = "Show Full Analysis";

  document.getElementById("explanation").innerHTML =
    "" +
(function() {
  let factors = [
    { label: "Price Movement", score: breakdown.price, what: "Today " + (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "% change. " + (changePct > 1 ? "Moving up more than 1% today is a positive momentum signal." : changePct < -1 ? "Dropping more than 1% today indicates selling pressure." : "Less than 1% movement means low activity today."), verdict: changePct > 1 ? "Moving up today" : changePct < -1 ? "Dropping today" : "No significant movement" },
    { label: "52wk Position", score: breakdown.position, what: pctFrom52High !== null ? "Stock is " + Math.abs(pctFrom52High) + "% " + (parseFloat(pctFrom52High) < 0 ? "below" : "near") + " its yearly high ($" + week52High.toFixed(2) + "). " + (breakdown.position >= 7 ? "Being near the yearly high indicates strong momentum." : breakdown.position >= 4 ? "Pulled back from high but still in normal range." : "Far from yearly high — could be opportunity or warning sign.") : "No yearly high data.", verdict: breakdown.position >= 7 ? "Near yearly high" : breakdown.position >= 4 ? "Pullback from high" : "Far from yearly high" },
    { label: "P/E Ratio", score: breakdown.pe, what: pe > 0 ? "You pay $" + pe.toFixed(1) + " for every $1 the company earns. " + (pe < 20 ? "A low P/E means the stock is cheap relative to earnings." : pe < 35 ? "Reasonable P/E for a quality company." : "High P/E means investors expect a lot of future growth.") : "No P/E data available.", verdict: pe > 0 && pe < 20 ? "Attractive price vs earnings" : pe > 0 && pe < 35 ? "Fair price" : pe > 35 ? "High price — elevated expectations" : "No data" },
    { label: "Risk (Beta)", score: breakdown.beta, what: beta > 0 ? "Beta " + beta.toFixed(2) + " — if market moves 10%, this stock typically moves " + (beta * 10).toFixed(1) + "%. " + (beta < 1 ? "Less volatile than the market." : beta < 1.5 ? "Similar volatility to the market." : "More volatile than market.") : "No beta data.", verdict: beta < 1 ? "Less risky than market" : beta < 1.5 ? "Similar risk to market" : "More risky than market" },
    { label: "Profit Margin", score: breakdown.margin, what: margin !== 0 ? "Company keeps " + margin.toFixed(1) + "% of every dollar earned as profit. " + (margin > 25 ? "Exceptional — very few companies achieve this." : margin > 10 ? "Healthy margin. The company is efficient and profitable." : margin > 0 ? "Thin margin — vulnerable to unexpected costs." : "The company is currently losing money.") : "No margin data.", verdict: margin > 25 ? "Exceptional profitability" : margin > 10 ? "Healthy margin" : margin > 0 ? "Thin margin" : "Current losses" },
    { label: "Revenue Growth", score: breakdown.growth, what: growth !== 0 ? "Revenue grew " + growth.toFixed(1) + "% vs last year. " + (growth > 15 ? "Fast growth — company is expanding quickly." : growth > 0 ? "Steady growth. Company continues to expand." : "Revenue is falling — important warning sign.") : "No growth data.", verdict: growth > 15 ? "Accelerated growth" : growth > 0 ? "Steady growth" : "Revenue falling" },
    { label: "Debt Level", score: breakdown.debt, what: "Measures how much debt the company has relative to its assets. " + (breakdown.debt >= 7 ? "Low debt — financially solid." : breakdown.debt >= 4 ? "Manageable debt." : "High debt — could be a problem if interest rates rise."), verdict: breakdown.debt >= 7 ? "Low debt — solid company" : breakdown.debt >= 4 ? "Manageable debt" : "High debt — caution" },
    { label: "RSI", score: breakdown.rsi, what: rsi !== null ? "RSI " + rsi + "/100. " + (rsi < 30 ? "Oversold zone — stock has fallen a lot and could bounce." : rsi > 70 ? "Overbought zone — stock has risen a lot and could correct." : "Neutral zone — no extreme signal.") : "Not enough data.", verdict: rsi !== null && rsi < 30 ? "Oversold — possible bounce" : rsi !== null && rsi > 70 ? "Overbought — possible correction" : "Neutral zone" },
    { label: "Moving Average", score: breakdown.ma, what: ma50 !== null ? "50-day avg $" + ma50.toFixed(2) + ", current $" + price.toFixed(2) + ". " + (price > ma50 ? "Above the average — uptrend." : "Below the average — downtrend. Caution.") : "Not enough data.", verdict: (ma50 !== null && price > ma50) || (ma20 !== null && price > ma20) ? "Uptrend — above average" : "Downtrend — below average" },
    { label: "News Sentiment", score: breakdown.news, what: "Analysis of recent headlines. " + (breakdown.news >= 7 ? "Mostly positive news." : breakdown.news >= 4 ? "Mixed news — normal for most companies." : "Recent negative news — may be affecting price."), verdict: breakdown.news >= 7 ? "Positive news" : breakdown.news >= 4 ? "Mixed news" : "Negative news" },
    { label: "ROE", score: breakdown.roe, what: roe !== 0 ? "Return on Equity: " + roe.toFixed(1) + "%. For every $100 shareholders invested, the company generates $" + roe.toFixed(1) + " in profit. " + (roe > 15 ? "Excellent — management generating strong returns." : roe > 10 ? "Healthy — good use of shareholder capital." : roe > 0 ? "Below average — room for improvement." : "Negative — losing shareholder money.") : "No ROE data available.", verdict: roe > 15 ? "Excellent returns on equity" : roe > 10 ? "Healthy returns on equity" : roe > 0 ? "Below average returns" : "Negative returns on equity" },
    { label: "Current Ratio", score: breakdown.currentRatio, what: currentRatio !== 0 ? "Current ratio of " + currentRatio.toFixed(2) + ". " + (currentRatio > 2 ? "Very healthy — can easily cover short-term liabilities." : currentRatio > 1 ? "Adequate — can cover current liabilities." : "Warning — may struggle to pay short-term obligations.") : "No current ratio data.", verdict: currentRatio > 2 ? "Very healthy — easily covers bills" : currentRatio > 1 ? "Adequate — covers current bills" : "Warning — may struggle with bills" },
    { label: "Interest Coverage", score: breakdown.interest, what: interestCoverage !== 0 ? "Covers interest " + interestCoverage.toFixed(1) + "x. " + (interestCoverage > 5 ? "Very safe — earnings far exceed debt payments." : interestCoverage > 3 ? "Adequate — can cover interest payments." : interestCoverage > 1 ? "Tight — barely covering interest. Risky if revenue drops." : "Danger — cannot cover interest payments.") : "No interest coverage data.", verdict: interestCoverage > 5 ? "Very safe — earnings far exceed debt" : interestCoverage > 3 ? "Adequate — covers interest payments" : "Tight or dangerous — debt risk" },
  ];

  factors.sort(function(a, b) { return b.score - a.score; });
  return factors.map(function(f) { return scoreBar(f.label, f.score, { what: f.what, verdict: f.verdict }); }).join("");
})() +



    getScoreHistoryHtml(ticker, totalScore) +
    getSectorContext(industry, pe, margin, growth, beta);

  initStockChat(ticker, companyName, totalScore, changePct, pe, margin, growth, beta, rsi, price);
  let chatEl = document.getElementById('ai-chat');
  if (chatEl) { chatEl.style.display = 'none'; document.getElementById('ai-chat-messages').innerHTML = ''; document.getElementById('ai-chat-suggestions').style.display = 'flex'; }
  getAIExplanation(ticker, companyName, totalScore, changePct, pe, margin, growth, beta, rsi, ma50, price, topHeadline, roe, currentRatio, interestCoverage);
  loadChart(prices, dates, volumes || [], prevClose, dayHigh, dayLow, week52High);
  renderCompanyAbout(profile, metrics['dividendYieldIndicatedAnnual'] || 0);
  renderFundamentals({ price, changePct, prevClose, dayHigh, dayLow, week52High, week52Low, pe, beta, margin, growth, roe, marketCap: profile.marketCapitalization, dividend: metrics['dividendYieldIndicatedAnnual'], nextEarningsDate, lastEarnings });
  renderEarningsCard(nextEarningsDate, lastEarnings, companyName);
  renderScoreExplainer(totalScore);
  renderContextualTerms(pe, beta, margin, growth, rsi, ma50, currentRatio, interestCoverage);
  renderNewsSection(news, ticker, companyName);
  setTimeout(function() {
    showStockQuiz(ticker, companyName, pe, beta, margin, growth, rsi, totalScore, currentRatio);
  }, 1200);
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

function renderFundamentals(f) {
  let el = document.getElementById('fundamentals-card');
  if (!el) return;
  let mktCap = f.marketCap > 0 ? (f.marketCap >= 1000 ? '$' + (f.marketCap / 1000).toFixed(2) + 'T' : '$' + f.marketCap.toFixed(1) + 'B') : '—';
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
    let beatColor = beat === "Beat" ? "#16a34a" : "#dc2626";
    lastEarningsVal = "$" + f.lastEarnings.actual.toFixed(2) +
      (beat ? " <span style='color:" + beatColor + ";font-weight:700;font-size:11px;'>" + beat + "</span>" : "");
  }

  let items = [
    { label: 'Market Cap',     value: mktCap },
    { label: 'P/E Ratio',      value: f.pe > 0 ? f.pe.toFixed(1) : '—' },
    { label: 'Dividend Yield', value: divYield },
    { label: 'Beta',           value: f.beta > 0 ? f.beta.toFixed(2) : '—' },
    { label: 'Profit Margin',  value: f.margin !== 0 ? f.margin.toFixed(1) + '%' : '—' },
    { label: 'Rev. Growth',    value: f.growth !== 0 ? (f.growth > 0 ? '+' : '') + f.growth.toFixed(1) + '%' : '—' },
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
    urgencyColor = '#d97706'; countdownText = 'In ' + daysUntil + ' days'; urgencyBg = 'rgba(217,119,6,0.08)';
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
    var beatColor = beat === 'Beat' ? '#16a34a' : '#dc2626';
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
      explain: 'Scores 70+ = Strong (solid fundamentals across most factors). 50–69 = Watch (mixed signals). Below 50 = Risky (multiple weak areas).',
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
  if (correct) state.score++;

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
  var emoji = pct === 100 ? '🏆' : pct >= 66 ? '👍' : '📚';
  body.innerHTML =
    '<div class="quiz-results">' +
      '<div class="quiz-results-emoji">' + emoji + '</div>' +
      '<div class="quiz-results-score">' + state.score + ' / ' + state.questions.length + '</div>' +
      '<div class="quiz-results-msg">' + msg + '</div>' +
      '<button class="quiz-next-btn" onclick="closeStockQuiz()">Done</button>' +
    '</div>';
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
  { term: 'P/E Ratio',          emoji: '📊', tip: 'The P/E ratio tells you how much investors pay for every $1 a company earns. A P/E of 20 means you pay $20 for $1 of profit. Lower can mean cheaper — but also less growth expected.' },
  { term: 'Beta',               emoji: '📈', tip: 'Beta measures how much a stock moves compared to the market. A beta of 1.5 means if the market drops 10%, this stock typically drops 15%. Higher beta = more risk and more reward.' },
  { term: 'Dividend',           emoji: '💰', tip: 'A dividend is cash a company pays you just for owning its stock — usually every quarter. If Apple pays a 0.5% dividend and you own $10,000 in stock, you get $50/year without selling anything.' },
  { term: 'Market Cap',         emoji: '🏢', tip: 'Market cap = share price × number of shares. It tells you the total value of a company. Apple is a mega-cap ($3T+). A small-cap company might be worth $500M. Bigger isn\'t always better.' },
  { term: 'RSI',                emoji: '⚡', tip: 'RSI (Relative Strength Index) measures momentum on a 0-100 scale. Below 30 means the stock may be oversold and due for a bounce. Above 70 means it may be overbought and due for a pullback.' },
  { term: 'Moving Average',     emoji: '📉', tip: 'A moving average smooths out daily price swings to show the trend. If a stock is above its 50-day average, it\'s in an uptrend. Below = downtrend. Traders use this as a buy/sell signal.' },
  { term: 'Profit Margin',      emoji: '💡', tip: 'Profit margin = how many cents of profit a company keeps per dollar of sales. A 20% margin means for every $100 in revenue, $20 is profit. Software companies often have 30%+ margins.' },
  { term: 'Revenue Growth',     emoji: '🚀', tip: 'Revenue growth shows if a company is selling more over time. 15%+ growth is fast. Negative growth is a warning sign. Growth companies often trade at high P/E ratios because investors expect future profits.' },
  { term: 'ROE',                emoji: '🏆', tip: 'Return on Equity shows how efficiently a company uses shareholder money to generate profit. ROE of 20% means for every $100 investors put in, the company generates $20 in profit. Warren Buffett loves high ROE.' },
  { term: 'Diversification',    emoji: '🌍', tip: 'Owning stocks in different sectors reduces risk. If you own 10 tech stocks, a bad tech week hurts everything. But if you also own healthcare and energy, those may hold up while tech falls.' },
  { term: 'Sector Rotation',    emoji: '🔄', tip: 'As the economy changes, investors move money between sectors. When interest rates rise, money often flows from tech (hurt by high rates) into financials (banks earn more on loans).' },
  { term: 'EPS',                emoji: '📋', tip: 'EPS (Earnings Per Share) = total profit divided by shares outstanding. If a company earns $1B and has 500M shares, EPS is $2. When EPS grows quarter over quarter, it\'s a positive sign.' },
  { term: 'DCA',                emoji: '📅', tip: 'Dollar-cost averaging means investing a fixed amount regularly (e.g. $100/month) regardless of price. You buy more shares when prices are low and fewer when high — reducing the impact of volatility.' },
  { term: 'Free Cash Flow',     emoji: '💸', tip: 'Free cash flow is the actual cash a company generates after paying for operations and investments. It\'s harder to fake than reported earnings. Companies with strong FCF can pay dividends, buy back stock, or invest in growth.' },
  { term: 'Interest Coverage',  emoji: '🛡️', tip: 'Interest coverage ratio = earnings divided by interest payments. A ratio of 5x means the company earns 5x what it owes in interest. Below 1.5x is dangerous — the company may struggle to pay its debt.' },
];

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
        '<span class="daily-tip-emoji">' + tip.emoji + '</span>' +
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
    { min: 70, max: 100, color: '#16a34a', label: 'Strong', desc: 'Fundamentals look solid across most factors.' },
    { min: 50, max: 69,  color: '#d97706', label: 'Watch',  desc: 'Some positives, but notable risks. Monitor closely.' },
    { min: 0,  max: 49,  color: '#dc2626', label: 'Risky',  desc: 'Multiple weak factors. High risk — proceed carefully.' },
  ];
  var current = ranges.find(function(r) { return score >= r.min && score <= r.max; });

  el.innerHTML =
    '<div class="score-explainer-trigger" onclick="toggleScoreExplainer()">' +
      '<span class="score-explainer-q">What does ' + score + '/100 mean?</span>' +
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
    '</div>';
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

function scoreBar(label, score, tooltip) {
  let color = score >= 7 ? "#16a34a" : score >= 4 ? "#d97706" : "#dc2626";
  let verdictClass = score >= 7 ? "good" : score >= 4 ? "mid" : "bad";
  let verdictText = score >= 7 ? "Strong" : score >= 4 ? "Average" : "Weak";
  let width = (score / 10) * 100;
  let whatHtml = tooltip ? "<div class='score-why'>" + tooltip.what + "</div>" : "";
  let verdictHtml = tooltip ? "<span class='score-verdict " + verdictClass + "'>" + verdictText + " — " + tooltip.verdict + "</span>" : "";
  let dataAttr = "data-factor='" + label.replace(/'/g, '') + "'";
  return "<div class='score-item' " + dataAttr + ">" +
    "<div class='score-item-header'>" +
      "<span class='score-item-name term-link' onclick=\"event.stopPropagation();openTerm('" + label.replace(/'/g, "\\'") + "')\" title='Learn more'>" + label + "</span>" +
      "<span class='score-item-num' style='color:" + color + ";'>" + score + "/10</span>" +
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

function loadChart(prices, dates, volumes, prevClose, dayHigh, dayLow, week52High) {
  if (!prices || prices.length === 0) {
    document.getElementById("chart-section").style.display = "none";
    return;
  }
  document.getElementById("chart-section").style.display = "block";

  allChartPrices   = prices;
  allChartDates    = dates;
  allChartVolumes  = volumes || [];
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

  let count = range === '1W' ? 7 : range === '1M' ? 30 : allChartPrices.length;
  let prices  = allChartPrices.slice(-count);
  let dates   = allChartDates.slice(-count);
  let volumes = allChartVolumes.slice(-count);
  renderPriceChart(prices, dates, volumes);
  renderChartInsight(prices, range);
}

function renderChartInsight(prices, range) {
  let el = document.getElementById('chart-insight');
  if (!el || prices.length < 2) { if (el) el.innerHTML = ''; return; }

  let first = prices[0];
  let last  = prices[prices.length - 1];
  let changePct = ((last - first) / first) * 100;
  let rangeLabel = range === '1W' ? 'this week' : range === '1M' ? 'this month' : 'over 3 months';
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

function renderPriceChart(prices, dates, volumes) {
  if (chartInstance) chartInstance.destroy();

  let labels = dates.map(function(d) {
    let dt = new Date(d + "T12:00:00");
    return (dt.getMonth() + 1) + "/" + dt.getDate();
  });

  let isUp = prices.length > 0 && prices[prices.length - 1] >= prices[0];
  let lineColor  = isUp ? "#16a34a" : "#dc2626";
  let fillColor  = isUp ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.06)";
  let maxVol = volumes.length > 0 ? Math.max.apply(null, volumes) : 1;

  let datasets = [
    {
      type: "line",
      label: "Price",
      data: prices,
      borderColor: lineColor,
      backgroundColor: fillColor,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: lineColor,
      tension: 0.2,
      fill: true,
      yAxisID: "yPrice",
      order: 1
    },
    {
      type: "bar",
      label: "Volume",
      data: volumes,
      backgroundColor: "rgba(14,165,233,0.12)",
      borderWidth: 0,
      yAxisID: "yVolume",
      order: 3
    }
  ];

  if (chartPrevClose > 0) {
    datasets.push({
      type: "line",
      label: "Prev Close",
      data: prices.map(function() { return chartPrevClose; }),
      borderColor: "rgba(217,119,6,0.55)",
      borderWidth: 1,
      borderDash: [5, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      yAxisID: "yPrice",
      order: 0
    });
  }

  chartInstance = new Chart(document.getElementById("priceChart").getContext("2d"), {
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#ffffff",
          borderColor: "#e2e8f0",
          borderWidth: 1,
          titleColor: "#1a202c",
          bodyColor: "#64748b",
          padding: 12,
          callbacks: {
            title: function(items) { return items[0].label; },
            label: function(ctx) {
              if (ctx.dataset.label === "Price")  return "  Price: $" + ctx.parsed.y.toFixed(2);
              if (ctx.dataset.label === "Volume") return "  Volume: " + (ctx.parsed.y >= 1e6 ? (ctx.parsed.y / 1e6).toFixed(1) + "M" : (ctx.parsed.y / 1e3).toFixed(0) + "K");
              return null;
            }
          }
        }
      },
      scales: {
        yPrice: {
          type: "linear",
          position: "left",
          ticks: { color: "#64748b", callback: function(v) { return "$" + v.toLocaleString(); } },
          grid: { color: "#e2e8f0" }
        },
        yVolume: {
          type: "linear",
          position: "right",
          display: false,
          max: maxVol * 6
        },
        x: {
          ticks: { color: "#64748b", maxTicksLimit: 8 },
          grid: { display: false }
        }
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

  let prompt = "You are StockIQ, a plain-English financial education tool. Your job is to help beginners genuinely understand what this company's data means — not just list numbers, but connect the dots between them. Write 4-5 sentences. Do the following: (1) Summarize what the score and overall picture says about the company's health. (2) Point out 1-2 interesting patterns or tensions in the data — for example if growth is high but margins are thin, or if the stock is volatile but fundamentals are strong. (3) Explain what the most recent news might mean for the company's story. (4) Mention one thing a beginner should pay attention to going forward. Write in a warm, curious tone — like a knowledgeable friend, not a textbook. Never use the words buy, sell, invest, or recommend. Never give financial advice. Focus entirely on helping the user understand and learn. " +
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

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.content && data.content[0] && data.content[0].text) {
      aiText.innerHTML = parseMarkdown(data.content[0].text);
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
    let color = diff > 20 ? "#dc2626" : diff > 0 ? "#d97706" : "#16a34a";
    rows += "<div class='sector-row'><span class='sector-label'>P/E Ratio</span><span class='sector-val'>" + pe.toFixed(1) + "</span><span class='sector-vs'>vs avg " + avg.pe + "</span><span class='sector-verdict' style='color:" + color + ";'>" + Math.abs(diff) + "% " + (diff > 0 ? "more expensive" : "cheaper") + " than peers</span></div>";
  }
  if (margin !== 0 && avg.margin) {
    let diff = (margin - avg.margin).toFixed(1);
    let color = diff >= 0 ? "#16a34a" : "#dc2626";
    rows += "<div class='sector-row'><span class='sector-label'>Profit Margin</span><span class='sector-val'>" + margin.toFixed(1) + "%</span><span class='sector-vs'>vs avg " + avg.margin + "%</span><span class='sector-verdict' style='color:" + color + ";'>" + Math.abs(diff) + "% " + (diff >= 0 ? "above" : "below") + " average</span></div>";
  }
  if (growth !== 0 && avg.growth) {
    let diff = (growth - avg.growth).toFixed(1);
    let color = diff >= 0 ? "#16a34a" : "#dc2626";
    rows += "<div class='sector-row'><span class='sector-label'>Revenue Growth</span><span class='sector-val'>" + growth.toFixed(1) + "%</span><span class='sector-vs'>vs avg " + avg.growth + "%</span><span class='sector-verdict' style='color:" + color + ";'>Growing " + Math.abs(diff) + "% " + (diff >= 0 ? "faster than" : "slower than") + " peers</span></div>";
  }
  if (beta > 0 && avg.beta) {
    let diff = (beta - avg.beta).toFixed(2);
    let color = diff <= 0 ? "#16a34a" : "#d97706";
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
    stockLabel = "Defensive Growth"; stockColor = "#16a34a";
  } else if (totalScore >= 65) {
    stockLabel = "Aggressive Growth"; stockColor = "#0ea5e9";
  } else if (totalScore >= 50) {
    stockLabel = "Moderate"; stockColor = "#d97706";
  } else if (totalScore >= 35) {
    stockLabel = "Speculative"; stockColor = "#f97316";
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
    "<span class='risk-profile-tag'>" + userProfile.icon + " " + userProfile.type + "</span>" +
    "<span class='risk-stock-tag' style='background:rgba(0,0,0,0.06);color:" + stockColor + ";border-radius:20px;font-size:11px;font-weight:600;padding:3px 10px;margin-right:8px;'>" + stockLabel + "</span>" +
    warning +
    "</div>";
}

function toggleDetails() {
  let details = document.getElementById("explanation");
  let btn = document.getElementById("show-details-btn");
  if (!details || !btn) return;
  if (details.style.display === "none") {
    details.style.display = "block";
    btn.textContent = "Hide Full Analysis";
  } else {
    details.style.display = "none";
    btn.textContent = "Show Full Analysis";
  }
}

function selectOption(step, value, el) {
  let options = el.parentElement.querySelectorAll(".quiz-option");
  options.forEach(function(o) { o.classList.remove("selected"); });
  el.classList.add("selected");
  quizAnswers["step" + step] = value;
  setTimeout(function() {
    if (step === 1) {
      document.getElementById("step-1").style.display = "none";
      document.getElementById("step-2").style.display = "block";
      document.getElementById("dot-2").classList.add("active");
    } else if (step === 2) {
      document.getElementById("step-2").style.display = "none";
      document.getElementById("step-3").style.display = "block";
      document.getElementById("dot-3").classList.add("active");
    } else if (step === 3) {
      document.getElementById("step-3").style.display = "none";
      document.getElementById("step-4").style.display = "block";
      document.getElementById("dot-4").classList.add("active");
    } else {
      document.getElementById("step-4").style.display = "none";
      showQuizResult();
    }
  }, 400);
}

function showQuizResult() {
  let risk = quizAnswers.step2;
  let horizon = quizAnswers.step1;
  let goal = quizAnswers.step3;
  let budget = quizAnswers.step4 || 2500;
  let profile = {};
  if (risk === "low" || goal === "preserve") {
    profile = { type: "Conservative", icon: "🛡️", desc: "You prefer stable, lower risk investments. StockIQ will warn you about high volatility stocks.", maxBeta: 1.0, minScore: 55 };
  } else if (risk === "high" && horizon === "long") {
    profile = { type: "Aggressive", icon: "🚀", desc: "You're comfortable with big swings for bigger rewards. StockIQ will highlight high growth opportunities.", maxBeta: 2.5, minScore: 40 };
  } else {
    profile = { type: "Balanced", icon: "⚖️", desc: "You want a mix of growth and stability. StockIQ will help you find stocks with solid fundamentals.", maxBeta: 1.5, minScore: 50 };
  }
  profile.horizon = horizon;
  profile.goal = goal;
  profile.budget = budget;
  document.getElementById("quiz-icon").textContent = profile.icon;
  document.getElementById("quiz-result-title").textContent = profile.type + " Investor";
  document.getElementById("quiz-result-desc").textContent = profile.desc;
  document.getElementById("step-result").style.display = "block";
  userProfile = profile;
}

function finishQuiz() {
  let isRetake = !!localStorage.getItem('userProfile');
  localStorage.setItem("userProfile", JSON.stringify(userProfile));
  saveToFirestore({ userProfile: userProfile });
  // On retake, offer to regenerate the Recommended Portfolio
  if (isRetake) {
    let hasDemo = Object.values(getAllPortfolios()).some(function(p) { return p.isDemo; });
    if (hasDemo && confirm('Regenerate your Recommended Portfolio for your new ' + userProfile.type + ' profile?')) {
      // Delete existing demo portfolio then create new one
      let all = getAllPortfolios();
      Object.keys(all).forEach(function(id) { if (all[id].isDemo) delete all[id]; });
      savePortfolios(all);
      // Reset activeId if it was the deleted demo
      let activeId = getActiveId();
      if (!all[activeId]) {
        let remaining = Object.keys(all);
        if (remaining.length > 0) localStorage.setItem('activePortfolioId', remaining[0]);
      }
      createDemoPortfolio(userProfile.type, userProfile.budget);
    }
  } else {
    migrateToMultiPortfolio([], [], []);  // ensure structure exists first
    createDemoPortfolio(userProfile.type, userProfile.budget);
  }
  document.getElementById("quiz-overlay").style.display = "none";
  updateRiskBadge();
  let nameEl = document.getElementById("onboarding-profile-name");
  if (nameEl) nameEl.textContent = userProfile.icon + " " + userProfile.type;
  document.getElementById("onboarding-overlay").style.display = "flex";
  // Reset card state
  _obStep = 0;
  document.querySelectorAll('.onboarding-card').forEach(function(c, i) { c.classList.toggle('active', i === 0); });
  document.querySelectorAll('.ob-dot').forEach(function(d, i) { d.classList.toggle('active', i === 0); });
  let prevBtn = document.getElementById('onboarding-prev');
  if (prevBtn) prevBtn.style.visibility = 'hidden';
  let nextBtn = document.getElementById('onboarding-next');
  if (nextBtn) { nextBtn.textContent = 'Next →'; nextBtn.onclick = function() { onboardingStep(1); }; }
}

let _obStep = 0;
const _obTotal = 5;

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
  if (nextBtn) nextBtn.textContent = _obStep === _obTotal - 1 ? "Let's Go →" : 'Next →';
  if (_obStep === _obTotal - 1 && dir > 0) {
    // Auto-advance to finish on second tap of last step's Next
    nextBtn.onclick = function() { finishOnboarding(); nextBtn.onclick = function() { onboardingStep(1); }; };
  }
}

function finishOnboarding() {
  _obStep = 0;
  document.getElementById("onboarding-overlay").style.display = "none";
  showTab('analyze');
}

function updateRiskBadge() {
  if (!userProfile) return;
  let badge = document.getElementById("risk-badge");
  if (badge) badge.textContent = userProfile.icon + " " + userProfile.type;
}

function quickAddToPortfolio() {
  if (!currentTicker) return;
  showTab('portfolio');
  document.getElementById('port-ticker').value = currentTicker;
  fetch('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(currentTicker) + '&token=' + finnhubKey)
    .then(function(r) { return r.json(); })
    .then(function(q) { if (q.c) document.getElementById('port-price').value = q.c.toFixed(2); });
  document.getElementById('port-shares').focus();
}

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

function removeFromWatchlist(ticker) {
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]").filter(function(i) { return i.ticker !== ticker; });
  localStorage.setItem("watchlist", JSON.stringify(watchlist));
  saveToFirestore({ watchlist: watchlist });
  renderWatchlist();
  loadMarketOverview();
}

function setWlSort(sort) {
  wlSort = sort;
  renderWatchlist();
}

function loadWatchlistNews(tickers) {
  var section = document.getElementById('wl-news-section');
  var list = document.getElementById('wl-news-list');
  if (!section || !list || !tickers || tickers.length === 0) return;

  var cacheKey = 'wl-news-cache-' + tickers.slice().sort().join(',');
  var cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      var p = JSON.parse(cached);
      if (Date.now() - p.ts < 1800000) { renderWatchlistNews(p.articles); return; }
    } catch(e) {}
  }

  var today = new Date();
  var from = new Date(today); from.setDate(today.getDate() - 7);
  var toStr = today.toISOString().split('T')[0];
  var fromStr = from.toISOString().split('T')[0];

  // Fetch news for up to 5 tickers, merge and deduplicate
  var limit = tickers.slice(0, 5);
  var promises = limit.map(function(t) {
    return fetch('https://finnhub.io/api/v1/company-news?symbol=' + t + '&from=' + fromStr + '&to=' + toStr + '&token=' + finnhubKey)
      .then(function(r) { return r.json(); })
      .then(function(news) {
        return (Array.isArray(news) ? news : []).slice(0, 5).map(function(a) {
          return Object.assign({}, a, { _ticker: t });
        });
      })
      .catch(function() { return []; });
  });

  Promise.all(promises).then(function(results) {
    var all = [].concat.apply([], results);
    // Deduplicate by headline, sort by date desc
    var seen = {};
    var unique = all.filter(function(a) {
      if (seen[a.headline]) return false;
      seen[a.headline] = true;
      return true;
    }).sort(function(a, b) { return b.datetime - a.datetime; }).slice(0, 12);
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), articles: unique }));
    renderWatchlistNews(unique);
  });
}

function renderWatchlistNews(articles) {
  var section = document.getElementById('wl-news-section');
  var list = document.getElementById('wl-news-list');
  if (!section || !list) return;
  if (!articles || articles.length === 0) { section.style.display = 'none'; return; }
  list.innerHTML = articles.map(function(a) {
    var date = a.datetime ? new Date(a.datetime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    var source = escHtml(a.source || '');
    var url = a.url || '#';
    return "<a class='news-item wl-news-item' href='" + escHtml(url) + "' target='_blank' rel='noopener'>" +
      "<span class='wl-news-ticker'>" + escHtml(a._ticker || '') + "</span>" +
      "<div class='wl-news-right'>" +
        "<div class='news-headline'>" + escHtml(a.headline) + "</div>" +
        "<div class='news-meta'>" + (source ? source + ' · ' : '') + date + "</div>" +
      "</div>" +
    "</a>";
  }).join('');
  section.style.display = 'block';
}

function renderWatchlist() {
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  let empty = document.getElementById("watchlist-empty");
  let items = document.getElementById("watchlist-items");
  if (watchlist.length === 0) { empty.style.display = "flex"; items.innerHTML = ""; document.getElementById('wl-news-section').style.display = 'none'; return; }
  empty.style.display = "none";
  loadWatchlistNews(watchlist.map(function(w) { return w.ticker; }));

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
    let scoreColor = item.score >= 65 ? "#16a34a" : item.score >= 50 ? "#d97706" : "#dc2626";
    let signal = item.score >= 65 ? "Strong" : item.score >= 50 ? "Watch" : "Risky";
    let priceHtml = price == null
      ? "<span class='wl-price'>—</span>"
      : "<span class='wl-price'>$" + price.toFixed(2) + "</span><span class='wl-change' style='color:" + (changePct >= 0 ? "#16a34a" : "#dc2626") + ";'>" + (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "%</span>";
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
    let alertHtml = alertTarget
      ? "<span class='wl-alert-tag' onclick='event.stopPropagation();removeAlert(\"" + item.ticker + "\")' title='Remove alert'>🔔 $" + alertTarget.toFixed(2) + " ✕</span>"
      : "<button class='wl-alert-btn' onclick='event.stopPropagation();openAlertInput(\"" + item.ticker + "\"," + (price || 0) + ")'>🔔 Alert</button>";
    return "<div class='watchlist-item'>" +
      "<div class='wl-main-row'>" +
        "<div onclick='loadFromWatchlist(\"" + item.ticker + "\")' style='flex:1;cursor:pointer;'>" +
          "<div class='watchlist-ticker'>" + escHtml(item.ticker) + "</div>" +
          "<div class='watchlist-name'>" + escHtml(item.name || "") + "</div>" +
        "</div>" +
        "<div class='wl-price-block'>" + priceHtml + "</div>" +
        "<div style='display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;'>" +
          "<div class='watchlist-score' style='color:" + scoreColor + ";'>" + signal + " · " + item.score + "/100</div>" +
          histToggle +
          alertHtml +
          "<button class='wl-add-port-btn' onclick='event.stopPropagation();addWatchlistToPortfolio(\"" + escHtml(item.ticker) + "\"," + (price || 0) + ")' title='Add to Portfolio'>+ Portfolio</button>" +
          "<button class='watchlist-remove' onclick='event.stopPropagation();removeFromWatchlist(\"" + item.ticker + "\")'>✕</button>" +
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

  // Fetch live quotes in parallel
  Promise.all(watchlist.map(function(item) {
    return fetch('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(item.ticker) + '&token=' + finnhubKey)
      .then(function(r) { return r.json(); })
      .then(function(q) { return { ticker: item.ticker, price: q.c || null, changePct: q.dp || 0, prevClose: q.pc || 0 }; })
      .catch(function() { return { ticker: item.ticker, price: null, changePct: 0, prevClose: 0 }; });
  })).then(function(quotes) {
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
  });
}

// ── Price alerts ────────────────────────────────────────────

function setAlert(ticker, price, currentPrice) {
  let alerts = JSON.parse(localStorage.getItem('price-alerts') || '{}');
  alerts[ticker] = parseFloat(price);
  localStorage.setItem('price-alerts', JSON.stringify(alerts));
  saveToFirestore({ priceAlerts: alerts });
  let dir = price >= currentPrice ? '↑ above' : '↓ below';
  showToast('Alert set: notify when ' + ticker + ' goes ' + dir + ' $' + parseFloat(price).toFixed(2));
  if (window.Notification && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  renderWatchlist();
}

function removeAlert(ticker) {
  let alerts = JSON.parse(localStorage.getItem('price-alerts') || '{}');
  delete alerts[ticker];
  localStorage.setItem('price-alerts', JSON.stringify(alerts));
  saveToFirestore({ priceAlerts: alerts });
  renderWatchlist();
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
      showToast('🔔 ' + ticker + ' hit your $' + target.toFixed(2) + ' alert — now $' + q.price.toFixed(2));
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
  fetch('https://finnhub.io/api/v1/stock/metric?symbol=' + encodeURIComponent(ticker) + '&metric=all&token=' + finnhubKey)
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

function addWatchlistToPortfolio(ticker, price) {
  showTab('portfolio');
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

  // Stagger requests 200ms apart to avoid rate limit
  let delay = 0;
  let promises = tickers.map(function(t) {
    let d = delay;
    delay += 200;
    return new Promise(function(resolve) {
      setTimeout(function() {
        fetch('https://finnhub.io/api/v1/quote?symbol=' + t.symbol + '&token=' + finnhubKey)
          .then(function(r) { return r.json(); })
          .then(function(q) {
            let price = q.c > 0 ? q.c : q.pc;
            resolve({ symbol: t.symbol, name: t.name, price: price, change: q.d || 0, changePct: q.dp || 0 });
          })
          .catch(function() { resolve(null); });
      }, d);
    });
  });

  Promise.all(promises).then(function(results) {
    let valid = results.filter(function(r) { return r && r.price > 0; });
    valid.sort(function(a, b) { return Math.abs(b.changePct) - Math.abs(a.changePct); });
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: valid }));
    allTrendingData = valid;
    renderTrending(valid);
  });
}

let currentTrendingFilter = 'all';
let allTrendingData = [];

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
  if (data.length === 0) { list.innerHTML = '<div class="trending-loading">No matches.</div>'; return; }
  list.innerHTML = data.map(function(r) {
    let up = r.changePct >= 0;
    let color = up ? '#16a34a' : '#dc2626';
    let sign = up ? '+' : '';
    let initials = r.symbol.substring(0, 2).toUpperCase();
    return "<div class='trending-row' onclick='quickSearch(\"" + escHtml(r.symbol) + "\")'>" +
      "<div class='trending-avatar'>" + initials + "</div>" +
      "<div class='trending-left'>" +
        "<div class='trending-symbol'>" + escHtml(r.symbol) + "</div>" +
        "<div class='trending-name'>" + escHtml(r.name) + "</div>" +
      "</div>" +
      "<div class='trending-right'>" +
        "<div class='trending-price'>$" + r.price.toFixed(2) + "</div>" +
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

  // Fetch index prices — update ALL matching elements (original + clone)
  indices.forEach(function(index) {
    fetch("https://finnhub.io/api/v1/quote?symbol=" + index.ticker + "&token=" + finnhubKey)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        let price = data.c;
        let changePct = data.dp;
        if (!price) return;
        let priceStr = "$" + price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        let arrow = changePct >= 0 ? "▲" : "▼";
        let sign = changePct >= 0 ? "+" : "";
        let changeStr = arrow + " " + sign + changePct.toFixed(2) + "%";
        let changeColor = changePct >= 0 ? "#16a34a" : "#dc2626";
        _updateTickerEl('[data-mid="' + index.priceKey + '"]', priceStr, null);
        _updateTickerEl('[data-mid="' + index.changeKey + '"]', changeStr, changeColor);
      })
      .catch(function() {});
  });

  // Fetch watchlist prices — staggered, update ALL matching elements (original + clone)
  watchlist.forEach(function(item, i) {
    setTimeout(function() {
      fetch("https://finnhub.io/api/v1/quote?symbol=" + encodeURIComponent(item.ticker) + "&token=" + finnhubKey)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          let price = data.c;
          let changePct = data.dp;
          if (!price) return;
          let priceStr = "$" + price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          let arrow = changePct >= 0 ? "▲" : "▼";
          let sign = changePct >= 0 ? "+" : "";
          let changeStr = arrow + " " + sign + changePct.toFixed(2) + "%";
          let changeColor = changePct >= 0 ? "#16a34a" : "#dc2626";
          _updateTickerEl('[data-wlprice="' + item.ticker + '"]', priceStr, null);
          _updateTickerEl('[data-wlchange="' + item.ticker + '"]', changeStr, changeColor);
        })
        .catch(function() {});
    }, 200 * (i + 1));
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
  var color = changePct === 0 ? 'var(--text-muted)' : (up ? 'var(--accent-green, #16a34a)' : '#dc2626');
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

  // Fetch quotes staggered
  var delay = 0;
  tickers.forEach(function(s) {
    var d = delay; delay += 120;
    setTimeout(function() {
      fetch('https://finnhub.io/api/v1/quote?symbol=' + s.t + '&token=' + finnhubKey)
        .then(function(r) { return r.json(); })
        .then(function(q) {
          var row = list.querySelector('[data-ticker="' + s.t + '"]');
          if (!row) return;
          var price = q.c || 0;
          var dp = q.dp || 0;
          var up = dp >= 0;
          var color = up ? 'var(--accent-green, #16a34a)' : '#dc2626';
          row.querySelector('.sector-stock-price').textContent = price > 0 ? '$' + price.toFixed(2) : '—';
          var chgEl = row.querySelector('.sector-stock-chg');
          chgEl.textContent = price > 0 ? (up ? '+' : '') + dp.toFixed(2) + '%' : '—';
          chgEl.style.color = price > 0 ? color : '';
        })
        .catch(function() {});
    }, d);
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
  let delay = 0;
  let promises = sectors.map(function(s) {
    let d = delay; delay += 150;
    return new Promise(function(resolve) {
      setTimeout(function() {
        fetch('https://finnhub.io/api/v1/quote?symbol=' + s.etf + '&token=' + finnhubKey)
          .then(function(r) { return r.json(); })
          .then(function(q) { resolve({ name: s.name, etf: s.etf, changePct: q.dp || 0, marketOpen: q.c > 0 }); })
          .catch(function() { resolve(null); });
      }, d);
    });
  });
  Promise.all(promises).then(function(results) {
    let valid = results.filter(function(r) { return r !== null; });
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
    let color = allZero ? 'var(--text-muted)' : (up ? '#16a34a' : '#dc2626');
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
  'Últ. UPA':           'EPS'
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
  let aiBox = item.querySelector(".dict-ai-box");
  if (!aiBox || aiBox.dataset.loaded === "1") return;
  aiBox.style.display = "block";
  aiBox.textContent = "Getting AI explanation...";
  let profileCtx = userProfile ? "The reader is a " + userProfile.type + " investor with a " + userProfile.horizon + " time horizon. " : "";
  let stockCtx = currentName ? "They just looked at " + currentName + ". " : "";
  let prompt = "You are StockIQ. Explain \"" + term + "\" in 2-3 sentences for a first-time investor aged 18-25. " +
    profileCtx + stockCtx + "Plain English only. No bullet points. Make it feel relatable.";
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 150, messages: [{ role: "user", content: prompt }] })
  })
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

function deletePortfolio(id) {
  let all = getAllPortfolios();
  if (Object.keys(all).length <= 1) { showToast("Can't delete your only portfolio"); return; }
  delete all[id];
  let newActive = Object.keys(all)[0];
  localStorage.setItem('portfolios', JSON.stringify(all));
  localStorage.setItem('activePortfolioId', newActive);
  saveToFirestore({ portfolios: all, activePortfolioId: newActive });
  renderPortfolioTabs();
  renderPortfolio();
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
  // Reset AI section — it belongs to the previous portfolio
  let aiSection = document.getElementById('port-ai-section');
  if (aiSection) aiSection.style.display = 'none';
  let portAiBtn = document.getElementById('port-ai-btn');
  if (portAiBtn) { portAiBtn.style.display = 'none'; portAiBtn.disabled = false; portAiBtn.textContent = 'Analyze My Portfolio with AI'; }
  renderPortfolioTabs();
  renderPortfolio();
}

function promptNewPortfolio() {
  let name = prompt('Portfolio name:');
  if (!name || !name.trim()) return;
  createPortfolio(name.trim(), false, []);
  renderPortfolioTabs();
  renderPortfolio();
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
    '<button onclick="document.getElementById(\'port-tab-menu-popup\').remove();let n=prompt(\'Rename:\',\'' + escHtml(port.name) + '\');if(n)renamePortfolio(\'' + id + '\',n);">Rename</button>' +
    '<button onclick="document.getElementById(\'port-tab-menu-popup\').remove();if(confirm(\'Delete \\\'' + escHtml(port.name) + '\\\'?\'))deletePortfolio(\'' + id + '\');" style="color:#ef4444;">Delete</button>';
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
    let demoTag = p.isDemo ? '<span class="port-tab-demo-tag">✦</span>' : '';
    return '<button class="port-tab' + (isActive ? ' active' : '') + '" onclick="setActivePortfolio(\'' + id + '\')">' +
      demoTag + escHtml(p.name) +
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
          fetch('https://finnhub.io/api/v1/quote?symbol=' + ticker + '&token=' + finnhubKey).then(function(r) { return r.json(); }).catch(function() { return {}; }),
          fetch('https://finnhub.io/api/v1/stock/metric?symbol=' + ticker + '&metric=all&token=' + finnhubKey).then(function(r) { return r.json(); }).catch(function() { return {}; })
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
            return fetch('https://finnhub.io/api/v1/quote?symbol=' + ticker + '&token=' + finnhubKey).then(function(r) { return r.json(); }).catch(function() { return {}; });
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
  let ticker = document.getElementById('port-ticker').value.trim().toUpperCase();
  let shares = parseFloat(document.getElementById('port-shares').value);
  let buyPrice = parseFloat(document.getElementById('port-price').value);
  let dateVal = document.getElementById('port-date').value;
  let buyDate = dateVal ? new Date(dateVal + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!ticker || !shares || !buyPrice) { showToast('Please fill in all fields!'); return; }
  let all = getAllPortfolios();
  let id = getActiveId();
  if (!all[id]) return;
  let portfolio = migratePortfolio(all[id].stocks || []);
  let existing = portfolio.find(function(i) { return i.ticker === ticker; });
  if (existing) {
    existing.lots.push({ shares, price: buyPrice, date: buyDate });
    showToast('Added new lot to ' + ticker);
  } else {
    portfolio.push({ ticker, lots: [{ shares, price: buyPrice, date: buyDate }] });
  }
  all[id].stocks = portfolio;
  savePortfolios(all);
  document.getElementById('port-ticker').value = '';
  document.getElementById('port-shares').value = '';
  document.getElementById('port-price').value = '';
  document.getElementById('port-date').value = '';
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

function renderPortfolio() {
  renderPortfolioTabs();
  let active = getActivePortfolio();
  let portfolio = active ? migratePortfolio(active.stocks || []) : [];
  let empty = document.getElementById('portfolio-empty');
  let list = document.getElementById('portfolio-list');
  let summary = document.getElementById('portfolio-summary');
  if (portfolio.length === 0) {
    empty.style.display = 'flex'; list.innerHTML = ''; summary.style.display = 'none';
    if (portfolioChartInstance) { portfolioChartInstance.destroy(); portfolioChartInstance = null; }
    let chartSection = document.getElementById('portfolio-chart-section');
    if (chartSection) chartSection.style.display = 'none';
    let portAiBtn = document.getElementById('port-ai-btn');
    if (portAiBtn) portAiBtn.style.display = 'none';
    let exportBtn = document.getElementById('port-export-btn');
    if (exportBtn) exportBtn.style.display = 'none';
    let winnersCard = document.getElementById('port-winners-card');
    if (winnersCard) winnersCard.style.display = 'none';
    let searchWrap = document.getElementById('port-search-wrap');
    if (searchWrap) searchWrap.style.display = 'none';
    portfolioStockData = [];
    return;
  }
  empty.style.display = 'none';
  summary.style.display = 'block';
  let totalValue = 0, totalCost = 0, totalDayChange = 0;
  let scores = [], fetchPromises = [], stockData = [], failedTickers = [];
  portfolio.forEach(function(item, idx) {
    // Compute totals across all lots
    let totalShares = item.lots.reduce(function(sum, l) { return sum + l.shares; }, 0);
    let totalLotCost = item.lots.reduce(function(sum, l) { return sum + l.shares * l.price; }, 0);
    let avgPrice = totalShares > 0 ? totalLotCost / totalShares : 0;
    // Stagger requests 120ms apart to avoid Finnhub rate limiting
    let p = new Promise(function(resolve) { setTimeout(resolve, idx * 120); })
      .then(function() { return fetch('https://finnhub.io/api/v1/quote?symbol=' + item.ticker + '&token=' + finnhubKey); })
      .then(function(r) { return r.json(); })
      .then(function(q) {
        let currentPrice = q.c || avgPrice; // fall back to buy price if rate-limited
        let dayChange = q.dp || 0;
        let value = currentPrice * totalShares;
        let cost = totalLotCost;
        let gain = value - cost;
        let gainPct = cost > 0 ? ((gain / cost) * 100) : 0;
        let dayChangeAmt = (currentPrice * (dayChange / 100)) * totalShares;
        totalValue += value; totalCost += cost; totalDayChange += dayChangeAmt;
        let histScore = JSON.parse(localStorage.getItem('history_score_' + item.ticker) || '[]');
        let score = histScore.length > 0 ? histScore[histScore.length - 1].score : null;
        if (score) scores.push(score);
        stockData.push({ ticker: item.ticker, lots: item.lots, shares: totalShares, buyPrice: avgPrice, currentPrice, value, cost, gain, gainPct, dayChangeAmt, score });
      })
      .catch(function() {
        failedTickers.push(item.ticker);
        stockData.push({ ticker: item.ticker, lots: item.lots, shares: totalShares, buyPrice: avgPrice, currentPrice: avgPrice, value: totalLotCost, cost: totalLotCost, gain: 0, gainPct: 0, dayChangeAmt: 0, score: null });
      });
    fetchPromises.push(p);
  });
  Promise.all(fetchPromises).then(function() {
    let totalGain = totalValue - totalCost;
    let totalGainPct = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
    let avgScore = scores.length > 0 ? Math.round(scores.reduce(function(a, b) { return a + b; }, 0) / scores.length) : null;
    let gainColor = totalGain >= 0 ? '#16a34a' : '#dc2626';
    let dayColor = totalDayChange >= 0 ? '#16a34a' : '#dc2626';
    document.getElementById('port-total-value').textContent = '$' + totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let fmt = function(n) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    document.getElementById('port-total-gain').textContent = (totalGain >= 0 ? '+$' : '-$') + fmt(Math.abs(totalGain));
    document.getElementById('port-total-gain').style.color = gainColor;
    document.getElementById('port-total-pct').textContent = (totalGainPct >= 0 ? '+' : '') + totalGainPct.toFixed(2) + '% since purchase';
    let prevValue = totalValue - totalDayChange;
    let totalDayChangePct = prevValue > 0 ? (totalDayChange / prevValue) * 100 : 0;
    document.getElementById('port-today-change').textContent = (totalDayChange >= 0 ? '+$' : '-$') + fmt(Math.abs(totalDayChange));
    document.getElementById('port-today-change').style.color = dayColor;
    let todayPctEl = document.getElementById('port-today-pct');
    if (todayPctEl) { todayPctEl.textContent = (totalDayChangePct >= 0 ? '+' : '') + totalDayChangePct.toFixed(2) + '% today'; todayPctEl.style.color = dayColor; }
    let gainCard = document.getElementById('port-gain-card');
    let todayCard = document.getElementById('port-today-card');
    if (gainCard) { gainCard.classList.remove('metric-up','metric-down'); gainCard.classList.add(totalGain >= 0 ? 'metric-up' : 'metric-down'); }
    if (todayCard) { todayCard.classList.remove('metric-up','metric-down'); todayCard.classList.add(totalDayChange >= 0 ? 'metric-up' : 'metric-down'); }
    document.getElementById('port-avg-score').textContent = avgScore ? avgScore + '/100' : '—';
    let sorted = stockData.slice().sort(function(a, b) { return b.gainPct - a.gainPct; });
    let best = sorted[0], worst = sorted[sorted.length - 1];
    let winnersCard = document.getElementById('port-winners-card');
    if (winnersCard) winnersCard.style.display = 'grid';
    document.getElementById('port-best-ticker').textContent = best.ticker;
    document.getElementById('port-best-gain').textContent = (best.gain >= 0 ? '+' : '') + '$' + best.gain.toFixed(2) + ' · ' + (best.gainPct >= 0 ? '+' : '') + best.gainPct.toFixed(1) + '%';
    document.getElementById('port-best-gain').style.color = best.gain >= 0 ? '#16a34a' : '#dc2626';
    document.getElementById('port-worst-ticker').textContent = worst.ticker;
    document.getElementById('port-worst-gain').textContent = (worst.gain >= 0 ? '+' : '') + '$' + worst.gain.toFixed(2) + ' · ' + (worst.gainPct >= 0 ? '+' : '') + worst.gainPct.toFixed(1) + '%';
    document.getElementById('port-worst-gain').style.color = worst.gain >= 0 ? '#16a34a' : '#dc2626';
    if (failedTickers.length > 0) {
      showToast('Prices unavailable for ' + failedTickers.join(', ') + ' — showing cost basis instead.');
    }
    portfolioStockData = stockData;
    let searchWrap = document.getElementById('port-search-wrap');
    if (searchWrap) searchWrap.style.display = 'block';
    renderPortfolioRows(stockData);
    renderClosedPositions();

    if (totalValue > 0) savePortfolioValueHistory(totalValue);
    renderPortfolioChart(stockData, totalValue);
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
        demoNote.innerHTML = '✦ This is a simulated portfolio using fractional shares. Most modern brokers (Robinhood, Fidelity, Schwab) support fractional investing.';
        let listEl = document.getElementById('portfolio-list');
        if (listEl) listEl.parentNode.insertBefore(demoNote, listEl);
      }
      demoNote.style.display = 'block';
    } else if (demoNote) {
      demoNote.style.display = 'none';
    }

    // S&P 500 benchmark
    fetchSpyBenchmark(portfolio, function(bench) {
      let benchEl = document.getElementById('port-benchmark');
      if (!benchEl) return;
      if (!bench) { benchEl.style.display = 'none'; return; }
      let youVsSpy = totalGainPct - bench.spyReturn;
      let vsColor = youVsSpy >= 0 ? '#16a34a' : '#dc2626';
      let vsText = youVsSpy >= 0 ? '↑ Beating the market' : '↓ Behind the market';
      let youColor = totalGainPct >= 0 ? '#16a34a' : '#dc2626';
      let spyColor = bench.spyReturn >= 0 ? '#16a34a' : '#dc2626';
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

function fetchSpyBenchmark(portfolio, callback) {
  if (_spyBenchmark !== null) { callback(_spyBenchmark || null); return; }
  // Find earliest lot date across all stocks
  let earliest = null;
  portfolio.forEach(function(item) {
    (item.lots || []).forEach(function(lot) {
      if (lot.date) {
        let d = new Date(lot.date);
        if (!isNaN(d) && (!earliest || d < earliest)) earliest = d;
      }
    });
  });
  if (!earliest) { _spyBenchmark = false; callback(null); return; }
  let fromDate = earliest.toISOString().split('T')[0];
  // Use a 7-day window to handle weekends/holidays
  let toDate = new Date(earliest.getTime() + 7 * 86400000).toISOString().split('T')[0];
  Promise.all([
    fetch('https://finnhub.io/api/v1/quote?symbol=SPY&token=' + finnhubKey).then(function(r) { return r.json(); }).catch(function() { return {}; }),
    fetch('https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/' + fromDate + '/' + toDate + '?apiKey=' + polygonKey).then(function(r) { return r.json(); }).catch(function() { return {}; })
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

function portSignal(score) {
  if (!score) return '<span style="color:#64748b;font-size:11px;">—</span>';
  let cls = score >= 65 ? 'buy' : score >= 50 ? 'hold' : 'sell';
  let txt = score >= 65 ? 'Strong' : score >= 50 ? 'Watch' : 'Risky';
  return '<span class="signal-pill ' + cls + '">' + txt + '</span>';
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
  modal.innerHTML =
    '<div class="sell-modal-title">Sell ' + ticker + '</div>' +
    '<div class="sell-modal-row">' +
      '<div class="sell-modal-field">' +
        '<label>Shares to sell</label>' +
        '<input type="number" id="sell-shares-' + ticker + '" placeholder="e.g. 5" max="' + totalShares + '" step="any">' +
      '</div>' +
      '<div class="sell-modal-field">' +
        '<label>Sell price $</label>' +
        '<input type="number" id="sell-price-' + ticker + '" placeholder="' + currentPrice.toFixed(2) + '" value="' + currentPrice.toFixed(2) + '" step="any">' +
      '</div>' +
    '</div>' +
    '<div id="sell-preview-' + ticker + '" class="sell-preview"></div>' +
    '<div class="sell-modal-actions">' +
      '<button class="sell-confirm-btn" onclick="confirmSell(' + escHtml(JSON.stringify(ticker)) + ',' + totalShares + ')">Confirm Sale</button>' +
      '<button class="sell-cancel-btn" onclick="document.getElementById(\'sell-modal-' + ticker + '\').remove()">Cancel</button>' +
    '</div>';

  wrapper.appendChild(modal);

  // Live preview
  function updatePreview() {
    let sh = parseFloat(document.getElementById('sell-shares-' + ticker).value) || 0;
    let sp = parseFloat(document.getElementById('sell-price-' + ticker).value) || 0;
    let preview = document.getElementById('sell-preview-' + ticker);
    if (!sh || !sp) { preview.innerHTML = ''; return; }
    let active = getActivePortfolio();
    let portfolio = active ? migratePortfolio(active.stocks || []) : [];
    let item = portfolio.find(function(i) { return i.ticker === ticker; });
    if (!item) return;
    let totalCost = item.lots.reduce(function(sum, l) { return sum + l.shares * l.price; }, 0);
    let totalSh = item.lots.reduce(function(sum, l) { return sum + l.shares; }, 0);
    let avgCost = totalSh > 0 ? totalCost / totalSh : 0;
    let realizedGain = (sp - avgCost) * sh;
    let realizedPct = avgCost > 0 ? ((sp - avgCost) / avgCost * 100) : 0;
    let color = realizedGain >= 0 ? '#16a34a' : '#dc2626';
    let remaining = totalSh - sh;
    preview.innerHTML = '<span style="color:' + color + ';font-weight:600;">' +
      (realizedGain >= 0 ? '+' : '') + '$' + realizedGain.toFixed(2) + ' (' + (realizedPct >= 0 ? '+' : '') + realizedPct.toFixed(1) + '%)</span>' +
      '<span style="color:var(--text-muted);margin-left:10px;">' + (remaining > 0 ? remaining.toFixed(remaining % 1 === 0 ? 0 : 2) + ' shares remaining' : 'Full position closed') + '</span>';
  }
  document.getElementById('sell-shares-' + ticker).addEventListener('input', updatePreview);
  document.getElementById('sell-price-' + ticker).addEventListener('input', updatePreview);
  updatePreview();
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

  if (item.lots.length === 0) {
    portfolio = portfolio.filter(function(i) { return i.ticker !== ticker; });
    showToast(ticker + ' fully sold — ' + (realizedGain >= 0 ? '+' : '') + '$' + realizedGain.toFixed(2) + ' realized');
  } else {
    showToast('Sold ' + sh + ' shares of ' + ticker + ' — ' + (realizedGain >= 0 ? '+' : '') + '$' + realizedGain.toFixed(2) + ' realized');
  }

  all[id].stocks = portfolio;
  savePortfolios(all);
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
  let totalColor = totalRealized >= 0 ? '#16a34a' : '#dc2626';
  let listEl = document.getElementById('closed-positions-list');
  let totalEl = document.getElementById('closed-positions-total');
  if (listEl) {
    listEl.innerHTML = closed.slice().reverse().map(function(c) {
      let gc = c.realizedGain >= 0 ? '#16a34a' : '#dc2626';
      return '<div class="closed-row">' +
        '<div class="closed-row-left">' +
          '<div class="closed-row-ticker">' + escHtml(c.ticker) + '</div>' +
          '<div class="closed-row-detail">' + c.sharesSold + ' shares · bought $' + (c.avgCost ? c.avgCost.toFixed(2) : '—') + ' → sold $' + c.sellPrice.toFixed(2) + ' · ' + escHtml(c.date) + '</div>' +
        '</div>' +
        '<div class="closed-row-gain" style="color:' + gc + ';">' + (c.realizedGain >= 0 ? '+' : '') + '$' + c.realizedGain.toFixed(2) + '</div>' +
      '</div>';
    }).join('');
  }
  if (totalEl) {
    totalEl.innerHTML = 'Total Realized: <span style="color:' + totalColor + ';">' + (totalRealized >= 0 ? '+' : '') + '$' + totalRealized.toFixed(2) + '</span>';
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

function renderPortfolioRows(data) {
  let list = document.getElementById('portfolio-list');
  if (!list) return;
  if (data.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:24px 0;font-size:13px;color:var(--text-muted);">No stocks match your search.</div>';
    return;
  }
  list.innerHTML = '<div class="port-stock-header"><div>Stock</div><div>Value</div><div class="hide-mobile">Gain/Loss</div><div class="hide-mobile">Today</div><div>Signal</div></div>' +
    data.map(function(s) {
      let gc = s.gain >= 0 ? '#16a34a' : '#dc2626';
      let dc = s.dayChangeAmt >= 0 ? '#16a34a' : '#dc2626';
      let hasMultiple = s.lots && s.lots.length > 1;
      let lotsHtml = '';
      if (s.lots && s.lots.length > 0) {
        let note = getStockNote(s.ticker);
        lotsHtml = '<div id="lots-' + s.ticker + '" class="port-lots-drawer" style="display:none;">' +
          s.lots.map(function(lot, i) {
            let lotCost = lot.shares * lot.price;
            let lotValue = s.currentPrice * lot.shares;
            let lotGain = lotValue - lotCost;
            let lotGainPct = lotCost > 0 ? ((lotGain / lotCost) * 100) : 0;
            let lotGc = lotGain >= 0 ? '#16a34a' : '#dc2626';
            return '<div class="port-lot-row">' +
              '<div class="port-lot-info">' +
                '<span class="port-lot-num">Lot ' + (i + 1) + '</span>' +
                '<span>' + lot.shares + ' shares @ $' + lot.price.toFixed(2) + (lot.date ? ' · ' + lot.date : '') + '</span>' +
              '</div>' +
              '<div class="port-lot-gain" style="color:' + lotGc + ';">' + (lotGain >= 0 ? '+' : '') + '$' + lotGain.toFixed(2) + ' (' + (lotGainPct >= 0 ? '+' : '') + lotGainPct.toFixed(1) + '%)</div>' +
              '<button onclick="event.stopPropagation();removeLotFromPortfolio(' + escHtml(JSON.stringify(s.ticker)) + ',' + i + ')" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:13px;padding:2px 6px;flex-shrink:0;">✕</button>' +
            '</div>';
          }).join('') +
          '<div class="port-note-row">' +
            '<textarea id="note-input-' + s.ticker + '" class="port-note-input" placeholder="Why did you buy this? Notes…" oninput="saveStockNote(' + escHtml(JSON.stringify(s.ticker)) + ',this.value)">' + escHtml(note) + '</textarea>' +
          '</div>' +
        '</div>';
      }
      return '<div class="port-stock-wrapper" data-ticker="' + s.ticker + '">' +
        '<div class="port-stock-row" onclick="openStockFromPortfolio(' + escHtml(JSON.stringify(s.ticker)) + ')">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            (hasMultiple ? '<button id="lots-btn-' + s.ticker + '" onclick="event.stopPropagation();togglePortLots(' + escHtml(JSON.stringify(s.ticker)) + ')" class="port-lots-toggle">▾</button>' : '') +
            '<div>' +
              '<div style="font-weight:600;font-size:14px;">' + s.ticker + '</div>' +
              '<div style="font-size:11px;color:#64748b;">' + s.shares.toFixed(s.shares % 1 === 0 ? 0 : 2) + ' shares · avg $' + s.buyPrice.toFixed(2) + (hasMultiple ? ' · ' + s.lots.length + ' lots' : '') + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">now $' + s.currentPrice.toFixed(2) + '</div>' +
            '</div>' +
          '</div>' +
          '<div>$' + s.value.toFixed(2) + '</div>' +
          '<div class="hide-mobile" style="color:' + gc + ';">' + (s.gain >= 0 ? '+' : '') + '$' + s.gain.toFixed(2) + '<br><span style="font-size:11px;">' + (s.gainPct >= 0 ? '+' : '') + s.gainPct.toFixed(1) + '%</span></div>' +
          '<div class="hide-mobile" style="color:' + dc + ';">' + (s.dayChangeAmt >= 0 ? '+' : '') + '$' + s.dayChangeAmt.toFixed(2) + '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;">' + portSignal(s.score) +
            '<button onclick="event.stopPropagation();openSellModal(' + escHtml(JSON.stringify(s.ticker)) + ',' + s.currentPrice + ',' + s.shares + ')" class="sell-btn">Sell</button>' +
            '<button onclick="event.stopPropagation();removeFromPortfolio(' + escHtml(JSON.stringify(s.ticker)) + ')" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;padding:0;">✕</button>' +
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
  document.querySelector('.port-chart-btn[data-view="' + view + '"]').classList.add('active');
  document.getElementById('portfolio-pie-view').style.display     = view === 'pie'     ? 'block' : 'none';
  document.getElementById('portfolio-line-view').style.display    = view === 'line'    ? 'block' : 'none';
  document.getElementById('portfolio-sectors-view').style.display = view === 'sectors' ? 'block' : 'none';
  if (view === 'line') renderPortfolioLineChart();
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
    grade = 'A'; gradeColor = '#16a34a';
    gradeNote = 'Well diversified — spread across ' + numSectors + ' sectors.';
  } else if (numSectors >= 3 && topPct < 65) {
    grade = 'B'; gradeColor = '#16a34a';
    gradeNote = 'Decent spread. Consider adding stocks from other sectors.';
  } else if (numSectors >= 2 && topPct < 80) {
    grade = 'C'; gradeColor = '#d97706';
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

  let labels = history.map(function(h) { return h.date; });
  let values = history.map(function(h) { return h.value; });
  let isUp   = values[values.length - 1] >= values[0];
  let lineColor = isUp ? '#16a34a' : '#dc2626';
  let fillColor = isUp ? 'rgba(22,163,74,0.06)' : 'rgba(220,38,38,0.06)';

  if (portfolioLineChartInstance) portfolioLineChartInstance.destroy();
  portfolioLineChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Portfolio Value',
        data: values,
        borderColor: lineColor,
        backgroundColor: fillColor,
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: lineColor,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: true
      }]
    },
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
            label: function(ctx) { return '  Value: $' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
          }
        }
      },
      scales: {
        y: {
          ticks: { color: '#64748b', callback: function(v) { return '$' + v.toLocaleString(); } },
          grid: { color: '#e2e8f0' }
        },
        x: {
          ticks: { color: '#64748b' },
          grid: { display: false }
        }
      }
    }
  });
}

function renderPortfolioChart(stockData, totalValue) {
  let section = document.getElementById('portfolio-chart-section');
  if (!section) return;

  let validStocks = stockData.filter(function(s) { return s.value > 0; });
  if (validStocks.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  let palette = ['#16a34a','#0ea5e9','#d97706','#dc2626','#a29bfe','#fd79a8','#55efc4','#fdcb6e'];
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

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })
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

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: portfolioChatContext,
      messages: portfolioChatHistory
    })
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

function renderBadges(analyzed, watchlistLen, portfolioLen, streak) {
  let allBadges = [
    { icon: '🔍', name: 'First Look',   desc: 'Analyze your first stock',    earned: analyzed >= 1 },
    { icon: '📊', name: 'Deep Dive',    desc: 'Analyze 10 stocks',            earned: analyzed >= 10 },
    { icon: '🏆', name: 'Stock Guru',   desc: 'Analyze 50 stocks',            earned: analyzed >= 50 },
    { icon: '👀', name: 'Watchman',     desc: 'Add a stock to your watchlist', earned: watchlistLen >= 1 },
    { icon: '💼', name: 'Investor',     desc: 'Add a stock to your portfolio', earned: portfolioLen >= 1 },
    { icon: '🌍', name: 'Diversified',  desc: 'Hold 5+ stocks in portfolio',   earned: portfolioLen >= 5 },
    { icon: '🔥', name: '3-Day Streak', desc: 'Use the app 3 days in a row',   earned: streak >= 3 },
    { icon: '⚡', name: 'Consistent',   desc: 'Use the app 7 days in a row',   earned: streak >= 7 },
    { icon: '💎', name: 'Dedicated',    desc: 'Use the app 30 days in a row',  earned: streak >= 30 },
  ];
  let grid = document.getElementById('badges-grid');
  if (!grid) return;
  let earnedCount = allBadges.filter(function(b) { return b.earned; }).length;
  let progressEl = document.getElementById('badges-progress');
  if (progressEl) progressEl.textContent = earnedCount + ' of ' + allBadges.length + ' earned';
  grid.innerHTML = allBadges.map(function(b) {
    return "<div class='badge-item " + (b.earned ? 'earned' : 'locked') + "'>" +
      "<div class='badge-icon'>" + b.icon + "</div>" +
      "<div class='badge-name'>" + b.name + "</div>" +
      "<div class='badge-desc'>" + b.desc + "</div>" +
      "</div>";
  }).join('');
}

function getAvatarInitials(name) {
  let parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function loadUserInfo() {
  let info = JSON.parse(localStorage.getItem('user-info') || '{}');
  let name     = info.name     || '';
  let username = info.username || '';
  let email    = info.email    || '';

  let avatar = document.getElementById('user-avatar');
  let nameEl = document.getElementById('user-name-display');
  let usernameEl = document.getElementById('user-username-display');
  let emailEl = document.getElementById('user-email-display');

  if (avatar) avatar.textContent = name ? getAvatarInitials(name) : '?';
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
    card.style.display = 'none';
    form.style.display = 'block';
  } else {
    card.style.display = 'flex';
    form.style.display = 'none';
  }
}

function saveUserInfo() {
  let name     = document.getElementById('input-name').value.trim();
  let username = document.getElementById('input-username').value.trim().replace(/^@/, '');
  let email    = document.getElementById('input-email').value.trim();
  localStorage.setItem('user-info', JSON.stringify({ name, username, email }));
  saveToFirestore({ name, username, email });
  loadUserInfo();
  toggleEditProfile();
  showToast('Profile saved');
}

function renderProfile() {
  loadUserInfo();
  if (userProfile) {
    document.getElementById('profile-icon-display').textContent = userProfile.icon;
    document.getElementById('profile-type-display').textContent = userProfile.type + ' Investor';
    document.getElementById('profile-desc-display').textContent = userProfile.desc;
    document.getElementById('profile-quiz-btn').textContent = 'Retake Quiz';
  } else {
    document.getElementById('profile-quiz-btn').textContent = 'Take Risk Quiz';
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
}

let stockChatHistory = [];
let stockChatContext = '';

function initStockChat(ticker, companyName, totalScore, changePct, pe, margin, growth, beta, rsi, price) {
  stockChatHistory = [];
  let profileCtx = userProfile ? 'The user is a ' + userProfile.type + ' investor with a ' + userProfile.horizon + ' horizon and goal to ' + userProfile.goal + '. Tailor explanations to their level. ' : '';
  stockChatContext = 'You are StockIQ, a financial education assistant. Help the user genuinely understand this company and its data — not just define terms, but make real connections and give meaningful insight. Keep answers to 3-4 sentences. Write like a knowledgeable friend: warm, clear, specific. Use the actual numbers when relevant. Never say buy, sell, invest, or recommend. If asked for a direct recommendation, redirect to explaining what the data means and what factors matter. ' +
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

function sendStockQuestion() {
  let input = document.getElementById('ai-chat-input');
  let question = input.value.trim();
  if (!question || !currentTicker) return;
  input.value = '';

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
  let messagesPayload = [{ role: 'user', content: stockChatContext }].concat(
    stockChatHistory.length === 1
      ? stockChatHistory
      : [{ role: 'assistant', content: 'Got it, I have the context.' }].concat(stockChatHistory)
  );

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: messagesPayload })
  })
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
        document.getElementById('quiz-overlay').style.display = 'flex';
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
  if (note.trim()) { notes[ticker] = note.trim(); } else { delete notes[ticker]; }
  localStorage.setItem('stock-notes', JSON.stringify(notes));
  saveToFirestore({ stockNotes: notes });
}

function getStockNote(ticker) {
  let notes = JSON.parse(localStorage.getItem('stock-notes') || '{}');
  return notes[ticker] || '';
}


// ── Export portfolio CSV ─────────────────────────────────────

function exportPortfolioCSV() {
  let active = getActivePortfolio();
  if (!active) { showToast('Nothing to export'); return; }
  let rows = ['Section,Ticker,Shares,Avg Cost,Lot #,Lot Shares,Lot Price,Lot Date,Sell Price,Realized Gain'];
  // Open positions
  let stocks = migratePortfolio(active.stocks || []);
  stocks.forEach(function(item) {
    let totalShares = item.lots.reduce(function(s, l) { return s + l.shares; }, 0);
    let totalCost   = item.lots.reduce(function(s, l) { return s + l.shares * l.price; }, 0);
    let avg = totalShares > 0 ? (totalCost / totalShares).toFixed(2) : 0;
    item.lots.forEach(function(lot, i) {
      rows.push(['Open', item.ticker, totalShares, avg, i + 1, lot.shares, lot.price.toFixed(2), lot.date || '', '', ''].join(','));
    });
  });
  // Closed positions
  let closed = active.closedPositions || [];
  closed.forEach(function(c) {
    rows.push(['Closed', c.ticker, c.sharesSold, '', '', c.sharesSold, c.avgCost ? c.avgCost.toFixed(2) : '', c.date || '', c.sellPrice.toFixed(2), c.realizedGain.toFixed(2)].join(','));
  });
  if (rows.length === 1) { showToast('Nothing to export'); return; }
  let blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (active.name || 'portfolio').replace(/\s+/g, '_') + '.csv';
  a.click();
}

// ── Remove account ───────────────────────────────────────────

function removeAccount() {
  if (!confirm('Delete your account and all data permanently? This cannot be undone.')) return;
  let user = auth.currentUser;
  if (!user) return;
  // Delete Firestore document first, then delete auth account
  userRef().delete().then(function() {
    return user.delete();
  }).then(function() {
    localStorage.clear();
    location.reload();
  }).catch(function(err) {
    if (err.code === 'auth/requires-recent-login') {
      showToast('Please log out and log back in, then try again.');
    } else {
      showToast('Could not delete account: ' + err.message);
    }
  });
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
auth.onAuthStateChanged(function(user) {
  if (!user) {
    // Not logged in
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('quiz-overlay').style.display = 'none';
    return;
  }

  // Logged in — load user data from Firestore
  loadFirestoreUserData(function(data) {
    // Restore profile info
    if (data.name) {
      localStorage.setItem('user-info', JSON.stringify({
        name: data.name,
        username: data.username || data.name.split(' ')[0].toLowerCase(),
        email: data.email || user.email
      }));
    } else {
      // First time — set basics from auth
      let name = user.displayName || user.email.split('@')[0];
      localStorage.setItem('user-info', JSON.stringify({ name: name, username: name, email: user.email }));
      saveToFirestore({ name: name, username: name, email: user.email, createdAt: Date.now() });
    }

    // Restore risk profile
    if (data.userProfile) {
      userProfile = data.userProfile;
      localStorage.setItem('userProfile', JSON.stringify(userProfile));
    } else {
      userProfile = JSON.parse(localStorage.getItem('userProfile') || 'null');
    }

    // Restore portfolios — only use Firestore if localStorage has nothing
    // (localStorage is source of truth; Firestore is backup for new devices)
    let localPortfolios = localStorage.getItem('portfolios');
    if (!localPortfolios) {
      if (data.portfolios) {
        localStorage.setItem('portfolios', JSON.stringify(data.portfolios));
        localStorage.setItem('activePortfolioId', data.activePortfolioId || Object.keys(data.portfolios)[0]);
      } else {
        // Legacy Firestore data — migrate to multi-portfolio format
        let legacyHistory = data.portfolioValueHistory || [];
        migrateToMultiPortfolio(data.portfolio || [], data.closedPositions || [], legacyHistory);
      }
    } else if (!localStorage.getItem('activePortfolioId') && data.activePortfolioId) {
      localStorage.setItem('activePortfolioId', data.activePortfolioId);
    }

    // Restore watchlist
    if (data.watchlist) {
      localStorage.setItem('watchlist', JSON.stringify(data.watchlist));
    }

    // Restore price alerts and stock notes
    if (data.priceAlerts) localStorage.setItem('price-alerts', JSON.stringify(data.priceAlerts));
    if (data.stockNotes) localStorage.setItem('stock-notes', JSON.stringify(data.stockNotes));

    // Restore stats
    if (data.stats) {
      if (data.stats.analyzed) localStorage.setItem('total-analyzed', data.stats.analyzed);
      if (data.stats.streak) localStorage.setItem('streak', JSON.stringify(data.stats.streak));
    }

    document.getElementById('auth-overlay').style.display = 'none';

    if (!userProfile) {
      document.getElementById('quiz-overlay').style.display = 'flex';
    } else {
      document.getElementById('quiz-overlay').style.display = 'none';
      updateRiskBadge();
    }

    updateStreak();
    loadMarketOverview();
    loadTrendingTickers();
    loadSectors();
    renderDailyTip();
    setInterval(function() { loadTrendingTickers(true); }, 60000);
    setInterval(function() { loadSectors(); }, 300000);
    renderWatchlist();
    renderSearchHistory();
    showTab('analyze');
    initTheme();
    handleUrlParams();
  });
});
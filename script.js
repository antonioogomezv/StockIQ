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
    }).join('');
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
  let aboutCard = document.getElementById('company-about');
  if (aboutCard) aboutCard.style.display = 'none';
  let fundCard = document.getElementById('fundamentals-card');
  if (fundCard) fundCard.style.display = 'none';
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

function getScoreHistoryHtml(ticker, currentScore) {
  let key = "history_score_" + ticker;
  let history = JSON.parse(localStorage.getItem(key) || "[]");
  if (history.length < 2) return "";
  let prev = history[history.length - 2];
  let diff = currentScore - prev.score;
  let arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
  let color = diff > 0 ? "#16a34a" : diff < 0 ? "#dc2626" : "#64748b";
  let label = diff > 0 ? "improving" : diff < 0 ? "declining" : "unchanged";
  let historyBars = history.map(function(h) {
    let barColor = h.score >= 65 ? "#16a34a" : h.score >= 50 ? "#d97706" : "#dc2626";
    let height = Math.max(20, (h.score / 100) * 60);
    return "<div style='display:flex;flex-direction:column;align-items:center;gap:4px;'>" +
      "<div style='font-size:10px;color:#64748b;'>" + h.score + "</div>" +
      "<div style='width:20px;height:" + height + "px;background:" + barColor + ";border-radius:4px;opacity:0.8;'></div>" +
      "<div style='font-size:9px;color:#64748b;'>" + h.date + "</div>" +
      "</div>";
  }).join("");
  return "<br><br><strong>Score History:</strong>" +
    "<br><span style='color:" + color + ";font-weight:600;'>" + arrow + " " + Math.abs(diff) + " points since " + prev.date + " — " + label + "</span>" +
    "<div style='display:flex;align-items:flex-end;gap:8px;margin-top:12px;padding:12px;background:var(--surface2);border-radius:10px;'>" +
    historyBars + "</div>";
}

function displayData(data) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("results-section").style.display = "flex";

  let { ticker, quote, profile, news, metrics, prices, dates, volumes, earningsData, pastEarnings } = data;
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

  let result = calculateScore(changePct, week52High, price, pe, metrics, qualScore, rsi, ma50);
  let totalScore = result.total;
  let breakdown = result.breakdown;

  saveScoreHistory(ticker, totalScore);
  let analyzed = parseInt(localStorage.getItem('total-analyzed') || '0');
  localStorage.setItem('total-analyzed', analyzed + 1);

  currentTicker = ticker;
  currentScore = totalScore;
  currentName = companyName;
  saveSearchHistory(ticker, companyName);

  document.getElementById("action-btns").style.display = "flex";
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
      changeArrow + " " + changeSign + "$" + Math.abs(changeAmt).toFixed(2) + " (" + changeSign + changePct.toFixed(2) + "%)" +
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
      "$" + price.toFixed(2) +
      changePill +
    "</div>";

  let scoreColor = totalScore >= 65 ? "#16a34a" : totalScore >= 50 ? "#d97706" : "#dc2626";
  let scoreLabel = totalScore >= 65 ? "Strong" : totalScore >= 50 ? "Watch" : "Risky";
  document.getElementById("health-score").innerHTML =
    "<div class='score-badge' style='border-color:" + scoreColor + ";'>" +
      "<div class='score-badge-num' style='color:" + scoreColor + ";'>" + totalScore + "</div>" +
      "<div class='score-badge-label'>/ 100</div>" +
      "<div class='score-badge-tag' style='color:" + scoreColor + ";'>" + scoreLabel + "</div>" +
    "</div>";

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
    "<strong>Score Breakdown (13 Factors):</strong>" +
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
  renderNewsSection(news, ticker, companyName);
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
      return "<div class='fund-item'><div class='fund-label'>" + i.label + "</div><div class='fund-value'>" + i.value + "</div></div>";
    }).join('') + '</div>';
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
      "<span class='score-item-name'>" + label + "</span>" +
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
  let context = "<br><br><strong>Sector Comparison (" + sector + "):</strong><br>";

  if (pe > 0 && avg.pe) {
    let diff = (((pe - avg.pe) / avg.pe) * 100).toFixed(0);
    let color = diff > 20 ? "#dc2626" : diff > 0 ? "#d97706" : "#16a34a";
    context += "<span style='color:#64748b;font-size:12px;'>P/E Ratio: </span><span style='font-size:12px;'>" + pe.toFixed(1) + "</span><span style='color:#64748b;font-size:12px;'> vs sector avg " + avg.pe + " — </span><span style='color:" + color + ";font-size:12px;font-weight:600;'>" + Math.abs(diff) + "% " + (diff > 0 ? "more expensive" : "cheaper") + " than peers</span><br>";
  }
  if (margin !== 0 && avg.margin) {
    let diff = (margin - avg.margin).toFixed(1);
    let color = diff >= 0 ? "#16a34a" : "#dc2626";
    context += "<span style='color:#64748b;font-size:12px;'>Profit Margin: </span><span style='font-size:12px;'>" + margin.toFixed(1) + "%</span><span style='color:#64748b;font-size:12px;'> vs sector avg " + avg.margin + "% — </span><span style='color:" + color + ";font-size:12px;font-weight:600;'>" + Math.abs(diff) + "% " + (diff >= 0 ? "above" : "below") + " average</span><br>";
  }
  if (growth !== 0 && avg.growth) {
    let diff = (growth - avg.growth).toFixed(1);
    let color = diff >= 0 ? "#16a34a" : "#dc2626";
    context += "<span style='color:#64748b;font-size:12px;'>Revenue Growth: </span><span style='font-size:12px;'>" + growth.toFixed(1) + "%</span><span style='color:#64748b;font-size:12px;'> vs sector avg " + avg.growth + "% — </span><span style='color:" + color + ";font-size:12px;font-weight:600;'>Growing " + Math.abs(diff) + "% " + (diff >= 0 ? "faster than" : "slower than") + " peers</span><br>";
  }
  if (beta > 0 && avg.beta) {
    let diff = (beta - avg.beta).toFixed(2);
    let color = diff <= 0 ? "#16a34a" : "#d97706";
    context += "<span style='color:#64748b;font-size:12px;'>Risk (Beta): </span><span style='font-size:12px;'>" + beta.toFixed(2) + "</span><span style='color:#64748b;font-size:12px;'> vs sector avg " + avg.beta + " — </span><span style='color:" + color + ";font-size:12px;font-weight:600;'>" + Math.abs(diff) + " " + (diff <= 0 ? "less volatile" : "more volatile") + " than peers</span><br>";
  }
  return context;
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
    } else {
      document.getElementById("step-3").style.display = "none";
      showQuizResult();
    }
  }, 400);
}

function showQuizResult() {
  let risk = quizAnswers.step2;
  let horizon = quizAnswers.step1;
  let goal = quizAnswers.step3;
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
  document.getElementById("quiz-icon").textContent = profile.icon;
  document.getElementById("quiz-result-title").textContent = profile.type + " Investor";
  document.getElementById("quiz-result-desc").textContent = profile.desc;
  document.getElementById("step-result").style.display = "block";
  userProfile = profile;
}

function finishQuiz() {
  localStorage.setItem("userProfile", JSON.stringify(userProfile));
  document.getElementById("quiz-overlay").style.display = "none";
  updateRiskBadge();
  let nameEl = document.getElementById("onboarding-profile-name");
  if (nameEl) nameEl.textContent = userProfile.icon + " " + userProfile.type;
  document.getElementById("onboarding-overlay").style.display = "flex";
}

function finishOnboarding() {
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
  let btn = document.getElementById("watchlist-btn");
  btn.textContent = "✓ Added";
  btn.classList.add("added");
  renderWatchlist();
}

function removeFromWatchlist(ticker) {
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]").filter(function(i) { return i.ticker !== ticker; });
  localStorage.setItem("watchlist", JSON.stringify(watchlist));
  renderWatchlist();
}

function renderWatchlist() {
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  let empty = document.getElementById("watchlist-empty");
  let items = document.getElementById("watchlist-items");
  if (watchlist.length === 0) { empty.style.display = "flex"; items.innerHTML = ""; return; }
  empty.style.display = "none";

  // Render immediately with loading placeholders for prices
  function buildRow(item, price, changePct) {
    let scoreColor = item.score >= 65 ? "#16a34a" : item.score >= 50 ? "#d97706" : "#dc2626";
    let signal = item.score >= 65 ? "Strong" : item.score >= 50 ? "Watch" : "Risky";
    let priceHtml = price == null
      ? "<span class='wl-price'>—</span>"
      : "<span class='wl-price'>$" + price.toFixed(2) + "</span><span class='wl-change' style='color:" + (changePct >= 0 ? "#16a34a" : "#dc2626") + ";'>" + (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "%</span>";
    return "<div class='watchlist-item'>" +
      "<div onclick='loadFromWatchlist(\"" + item.ticker + "\")' style='flex:1;cursor:pointer;'>" +
        "<div class='watchlist-ticker'>" + escHtml(item.ticker) + "</div>" +
        "<div class='watchlist-name'>" + escHtml(item.name || "") + "</div>" +
      "</div>" +
      "<div class='wl-price-block'>" + priceHtml + "</div>" +
      "<div style='display:flex;align-items:center;gap:8px;'>" +
        "<div class='watchlist-score' style='color:" + scoreColor + ";'>" + signal + " · " + item.score + "/100</div>" +
        "<button class='wl-add-port-btn' onclick='event.stopPropagation();addWatchlistToPortfolio(\"" + escHtml(item.ticker) + "\"," + (price || 0) + ")' title='Add to Portfolio'>+ Portfolio</button>" +
        "<button class='watchlist-remove' onclick='event.stopPropagation();removeFromWatchlist(\"" + item.ticker + "\")'>✕</button>" +
      "</div>" +
    "</div>";
  }

  // Show skeletons first
  items.innerHTML = watchlist.map(function(item) { return buildRow(item, null, 0); }).join("");

  // Fetch live quotes in parallel
  Promise.all(watchlist.map(function(item) {
    return fetch('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(item.ticker) + '&token=' + finnhubKey)
      .then(function(r) { return r.json(); })
      .then(function(q) { return { ticker: item.ticker, price: q.c || null, changePct: q.dp || 0 }; })
      .catch(function() { return { ticker: item.ticker, price: null, changePct: 0 }; });
  })).then(function(quotes) {
    let quoteMap = {};
    quotes.forEach(function(q) { quoteMap[q.ticker] = q; });
    items.innerHTML = watchlist.map(function(item) {
      let q = quoteMap[item.ticker] || { price: null, changePct: 0 };
      return buildRow(item, q.price, q.changePct);
    }).join("");
  });
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

function loadTrendingTickers(forceRefresh) {
  let tickers = [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'NVDA', name: 'NVIDIA Corp.' },
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corp.' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'JPM', name: 'JPMorgan Chase' },
  ];

  let list = document.getElementById('trending-list');
  if (!list) return;

  // Check cache (5 min TTL) — skip if forcing refresh
  if (!forceRefresh) {
    let cached = localStorage.getItem('trending-cache');
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
    localStorage.setItem('trending-cache', JSON.stringify({ ts: Date.now(), data: valid }));
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

function loadMarketOverview() {
  let indices = [
    { ticker: "SPY", priceId: "sp500-price", changeId: "sp500-change" },
    { ticker: "QQQ", priceId: "nasdaq-price", changeId: "nasdaq-change" },
    { ticker: "DIA", priceId: "dow-price", changeId: "dow-change" },
    { ticker: "GLD", priceId: "btc-price", changeId: "btc-change" }
  ];
  indices.forEach(function(index) {
    fetch("https://finnhub.io/api/v1/quote?symbol=" + index.ticker + "&token=" + finnhubKey)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        let price = data.c;
        let changePct = data.dp;
        if (!price) return;
        document.getElementById(index.priceId).textContent = "$" + price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        let arrow = changePct >= 0 ? "▲" : "▼";
        let sign = changePct >= 0 ? "+" : "";
        let changeEl = document.getElementById(index.changeId);
        changeEl.textContent = arrow + " " + sign + changePct.toFixed(2) + "%";
        changeEl.style.color = changePct >= 0 ? "#16a34a" : "#dc2626";
      })
      .catch(function() {});
  });
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
    return '<div class="sector-row">' +
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

function toggleDictionary() {
  document.getElementById("dict-drawer").classList.toggle("open");
  document.getElementById("dict-overlay").classList.toggle("open");
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

function addToPortfolio() {
  let ticker = document.getElementById('port-ticker').value.trim().toUpperCase();
  let shares = parseFloat(document.getElementById('port-shares').value);
  let buyPrice = parseFloat(document.getElementById('port-price').value);
  let dateVal = document.getElementById('port-date').value;
  let buyDate = dateVal ? new Date(dateVal + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!ticker || !shares || !buyPrice) { showToast('Please fill in all fields!'); return; }
  let portfolio = JSON.parse(localStorage.getItem('portfolio') || '[]');
  if (portfolio.find(function(i) { return i.ticker === ticker; })) { showToast(ticker + ' is already in your portfolio!'); return; }
  portfolio.push({ ticker, shares, buyPrice, buyDate });
  localStorage.setItem('portfolio', JSON.stringify(portfolio));
  document.getElementById('port-ticker').value = '';
  document.getElementById('port-shares').value = '';
  document.getElementById('port-price').value = '';
  document.getElementById('port-date').value = '';
  renderPortfolio();
}

function removeFromPortfolio(ticker) {
  let portfolio = JSON.parse(localStorage.getItem('portfolio') || '[]').filter(function(i) { return i.ticker !== ticker; });
  localStorage.setItem('portfolio', JSON.stringify(portfolio));
  renderPortfolio();
}

function renderPortfolio() {
  let portfolio = JSON.parse(localStorage.getItem('portfolio') || '[]');
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
  let scores = [], fetchPromises = [], stockData = [];
  portfolio.forEach(function(item) {
    let p = fetch('https://finnhub.io/api/v1/quote?symbol=' + item.ticker + '&token=' + finnhubKey)
      .then(function(r) { return r.json(); })
      .then(function(q) {
        let currentPrice = q.c || 0;
        let dayChange = q.dp || 0;
        let value = currentPrice * item.shares;
        let cost = item.buyPrice * item.shares;
        let gain = value - cost;
        let gainPct = cost > 0 ? ((gain / cost) * 100) : 0;
        let dayChangeAmt = (currentPrice * (dayChange / 100)) * item.shares;
        totalValue += value; totalCost += cost; totalDayChange += dayChangeAmt;
        let histScore = JSON.parse(localStorage.getItem('history_score_' + item.ticker) || '[]');
        let score = histScore.length > 0 ? histScore[histScore.length - 1].score : null;
        if (score) scores.push(score);
        stockData.push({ ticker: item.ticker, shares: item.shares, buyPrice: item.buyPrice, buyDate: item.buyDate || null, currentPrice, value, cost, gain, gainPct, dayChangeAmt, score });
      })
      .catch(function() {
        stockData.push({ ticker: item.ticker, shares: item.shares, buyPrice: item.buyPrice, buyDate: item.buyDate || null, currentPrice: 0, value: 0, cost: item.buyPrice * item.shares, gain: 0, gainPct: 0, dayChangeAmt: 0, score: null });
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
    document.getElementById('port-total-gain').textContent = (totalGain >= 0 ? '+' : '') + '$' + totalGain.toFixed(2);
    document.getElementById('port-total-gain').style.color = gainColor;
    document.getElementById('port-total-pct').textContent = (totalGainPct >= 0 ? '+' : '') + totalGainPct.toFixed(2) + '% since purchase';
    document.getElementById('port-today-change').textContent = (totalDayChange >= 0 ? '+' : '') + '$' + totalDayChange.toFixed(2);
    document.getElementById('port-today-change').style.color = dayColor;
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
    portfolioStockData = stockData;
    let searchWrap = document.getElementById('port-search-wrap');
    if (searchWrap) searchWrap.style.display = 'block';
    renderPortfolioRows(stockData);

    if (totalValue > 0) savePortfolioValueHistory(totalValue);
    renderPortfolioChart(stockData, totalValue);
    let portAiBtn = document.getElementById('port-ai-btn');
    if (portAiBtn) portAiBtn.style.display = 'block';
  });
}

function portSignal(score) {
  if (!score) return '<span style="color:#64748b;font-size:11px;">—</span>';
  let cls = score >= 65 ? 'buy' : score >= 50 ? 'hold' : 'sell';
  let txt = score >= 65 ? 'Strong' : score >= 50 ? 'Watch' : 'Risky';
  return '<span class="signal-pill ' + cls + '">' + txt + '</span>';
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
      return '<div class="port-stock-row" style="cursor:pointer;" onclick="openStockFromPortfolio(\'' + s.ticker + '\')">' +
        '<div><div style="font-weight:600;font-size:14px;">' + s.ticker + '</div><div style="font-size:11px;color:#64748b;">' + s.shares + ' shares · $' + s.buyPrice.toFixed(2) + (s.buyDate ? ' · ' + s.buyDate : '') + '</div></div>' +
        '<div>$' + s.value.toFixed(2) + '</div>' +
        '<div class="hide-mobile" style="color:' + gc + ';">' + (s.gain >= 0 ? '+' : '') + '$' + s.gain.toFixed(2) + '<br><span style="font-size:11px;">' + (s.gainPct >= 0 ? '+' : '') + s.gainPct.toFixed(1) + '%</span></div>' +
        '<div class="hide-mobile" style="color:' + dc + ';">' + (s.dayChangeAmt >= 0 ? '+' : '') + '$' + s.dayChangeAmt.toFixed(2) + '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;">' + portSignal(s.score) +
        '<button onclick="event.stopPropagation();removeFromPortfolio(\'' + s.ticker + '\')" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;padding:0;">✕</button></div>' +
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
  let history = JSON.parse(localStorage.getItem('portfolio-value-history') || '[]');
  let today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (history.length > 0 && history[history.length - 1].date === today) {
    history[history.length - 1].value = parseFloat(value.toFixed(2));
  } else {
    history.push({ date: today, value: parseFloat(value.toFixed(2)) });
  }
  if (history.length > 60) history = history.slice(-60);
  localStorage.setItem('portfolio-value-history', JSON.stringify(history));
}

function switchPortfolioChart(view) {
  document.querySelectorAll('.port-chart-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelector('.port-chart-btn[data-view="' + view + '"]').classList.add('active');
  document.getElementById('portfolio-pie-view').style.display  = view === 'pie'  ? 'block' : 'none';
  document.getElementById('portfolio-line-view').style.display = view === 'line' ? 'block' : 'none';
  if (view === 'line') renderPortfolioLineChart();
}

function renderPortfolioLineChart() {
  let history = JSON.parse(localStorage.getItem('portfolio-value-history') || '[]');
  let emptyEl = document.getElementById('portfolio-line-empty');
  let canvas  = document.getElementById('portfolioLineChart');

  if (history.length < 2) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
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
  let portfolio = JSON.parse(localStorage.getItem('portfolio') || '[]');
  if (portfolio.length === 0) { showToast('Add stocks to your portfolio first!'); return; }

  let section = document.getElementById('port-ai-section');
  let textEl  = document.getElementById('port-ai-text');
  let btn     = document.getElementById('port-ai-btn');
  section.style.display = 'block';
  textEl.textContent = 'Analyzing your portfolio...';
  btn.textContent = 'Analyzing...';
  btn.disabled = true;

  let holdingsSummary = portfolio.map(function(p) {
    let histScore = JSON.parse(localStorage.getItem('history_score_' + p.ticker) || '[]');
    let score = histScore.length > 0 ? histScore[histScore.length - 1].score : null;
    return p.ticker + ' (' + p.shares + ' shares @ $' + p.buyPrice + (score ? ', score ' + score + '/100' : '') + ')';
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
  msgsEl.scrollTop = msgsEl.scrollHeight;

  portfolioChatHistory.push({ role: 'user', content: question });

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
    msgsEl.scrollTop = msgsEl.scrollHeight;
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
  let portfolio = JSON.parse(localStorage.getItem('portfolio') || '[]');
  let analyzed  = parseInt(localStorage.getItem('total-analyzed') || '0');
  let streak    = getStreak();
  document.getElementById('stat-analyzed').textContent  = analyzed;
  document.getElementById('stat-watchlist').textContent = watchlist.length;
  document.getElementById('stat-portfolio').textContent = portfolio.length;
  document.getElementById('stat-streak').textContent    = streak;
  renderBadges(analyzed, watchlist.length, portfolio.length, streak);
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
  messages.scrollTop = messages.scrollHeight;

  stockChatHistory.push({ role: 'user', content: question });

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
    messages.scrollTop = messages.scrollHeight;
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

function submitSignUp() {
  let name     = document.getElementById('auth-name').value.trim();
  let email    = document.getElementById('auth-email').value.trim();
  let password = document.getElementById('auth-password').value;
  if (!name)     { showToast('Please enter your name.'); return; }
  if (!email || !email.includes('@')) { showToast('Please enter a valid email.'); return; }
  if (password.length < 6) { showToast('Password must be at least 6 characters.'); return; }

  // Check if email already registered
  let users = JSON.parse(localStorage.getItem('siq-users') || '[]');
  if (users.find(function(u) { return u.email === email; })) {
    showToast('An account with this email already exists. Log in instead.');
    showLogin();
    return;
  }

  // Save user (plain password — temporary until Firebase)
  users.push({ name, email, password });
  localStorage.setItem('siq-users', JSON.stringify(users));
  localStorage.setItem('siq-session', JSON.stringify({ name, email }));
  localStorage.setItem('user-info', JSON.stringify({ name, username: name.split(' ')[0].toLowerCase(), email }));

  document.getElementById('auth-overlay').style.display = 'none';
  // New user — show quiz
  if (!userProfile) {
    document.getElementById('quiz-overlay').style.display = 'flex';
  }
}

function submitLogin() {
  let email    = document.getElementById('login-email').value.trim();
  let password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('Please fill in all fields.'); return; }

  let users = JSON.parse(localStorage.getItem('siq-users') || '[]');
  let user = users.find(function(u) { return u.email === email && u.password === password; });
  if (!user) { showToast('Email or password incorrect.'); return; }

  localStorage.setItem('siq-session', JSON.stringify({ name: user.name, email: user.email }));
  localStorage.setItem('user-info', JSON.stringify({ name: user.name, username: user.name.split(' ')[0].toLowerCase(), email: user.email }));

  document.getElementById('auth-overlay').style.display = 'none';
  updateRiskBadge();
}

// ── INIT ──
userProfile = JSON.parse(localStorage.getItem("userProfile") || "null");
let siqSession = JSON.parse(localStorage.getItem('siq-session') || 'null');

if (!siqSession) {
  // Not logged in — show auth screen
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('quiz-overlay').style.display = 'none';
} else if (!userProfile) {
  // Logged in but no quiz yet
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('quiz-overlay').style.display = 'flex';
} else {
  // Fully set up
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('quiz-overlay').style.display = 'none';
  updateRiskBadge();
}

updateStreak();
loadMarketOverview();
loadTrendingTickers();
loadSectors();
setInterval(function() { loadTrendingTickers(true); }, 60000);
setInterval(function() { loadSectors(); }, 300000);
renderWatchlist();
renderSearchHistory();
showTab('analyze');
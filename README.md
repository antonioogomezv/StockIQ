# StockIQ

A beginner-friendly stock analysis PWA. Search any company, get an AI-powered score, track your portfolio, and learn financial terms in plain English.

## Features

- AI stock analysis with score out of 100
- Portfolio tracker with gain/loss, allocation chart, and AI insights
- Watchlist
- Trending tickers with Gainers/Losers filter
- Sector performance overview
- Financial terms dictionary with AI explanations
- Risk profile quiz
- Works offline (PWA)

## Setup

1. Clone the repo
2. Copy `config.example.js` to `config.js`
3. Fill in your API keys in `config.js`
4. Open `index.html` in a browser or serve with any static server

## API Keys Required

| Service | Purpose | Free tier |
|---------|---------|-----------|
| [Finnhub](https://finnhub.io) | Stock quotes, fundamentals, news | Yes |
| [Polygon.io](https://polygon.io) | Historical price data (charts) | Yes |
| [Anthropic](https://console.anthropic.com) | AI analysis and chat | Pay-as-you-go |

## Tech Stack

- Vanilla HTML / CSS / JavaScript — no framework
- Chart.js for price and portfolio charts
- Claude Haiku for AI features
- PWA with service worker for offline support

## Notes

- `config.js` is excluded from version control via `.gitignore` — never commit it
- All AI features are education-only, no financial advice

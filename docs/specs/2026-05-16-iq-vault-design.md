# IQ Vault — Design Spec
**Date:** 2026-05-16  
**Status:** Approved for implementation

---

## Overview

IQ Vault is a virtual bank built into StockIQ that makes every portfolio decision feel financially real. Every user starts with MX$50,000. Buying stocks costs money from the Vault. Selling returns it. The headline number is **net worth** — not just cash, but cash plus the current market value of all portfolio positions. This single number moves with the market every day, even when the user does nothing.

The goal: make the simulation emotionally meaningful so that users learn by feeling the consequences of their decisions, not just reading about them.

---

## Core Mechanic

### Net Worth Formula
```
Net Worth = Vault Cash + Sum(shares × current price × FX rate) for all portfolio positions
```

- Vault cash starts at MX$50,000
- Every stock purchase debits Vault cash by `shares × price × FX rate`
- Every sale credits Vault cash by `shares × sell price × FX rate`
- Net worth is recalculated on every app open using live prices

### Starting Balance
- **MX$50,000** fixed for all users — no choice, no tiers
- Fixed balance keeps the leaderboard fair and users comparable
- **MX$25,000 welcome bonus** added as a transaction when the user completes onboarding and their recommended portfolio is auto-built
- Effective starting net worth: **MX$75,000** (already partially deployed into their first portfolio)

### Data Stored in Firestore (`users/{uid}` → `vault` field)
```json
{
  "balance": 42300,
  "transactions": [
    { "type": "welcome_bonus", "amountMXN": 25000, "date": "May 16", "ts": 1234567890 },
    { "type": "buy", "ticker": "AAPL", "shares": 5, "priceUSD": 185.50, "amountMXN": 16254, "date": "May 16", "ts": 1234567891 },
    { "type": "sell", "ticker": "AAPL", "shares": 5, "priceUSD": 191.20, "amountMXN": 16749, "date": "May 17", "ts": 1234567892 }
  ],
  "netWorthHistory": [
    { "date": "May 16", "value": 75000, "ts": 1234567890 },
    { "date": "May 17", "value": 78400, "ts": 1234567893 }
  ],
  "peakNetWorth": 78400,
  "peakNetWorthDate": "May 17",
  "bankruptCount": 0,
  "lastResetAt": null,
  "createdAt": 1234567880
}
```

---

## Where It Appears

### 1. Profile Tab — Full Vault Section
The complete financial story. Appears as a card section in the Profile tab, positioned after the XP progress bar.

Contains:
- **Net worth headline** — big number, color-coded vs MX$50,000 start (green above, red below)
- **P&L line** — "+MX$28,400 (+37.9%) vs MX$50,000 start"
- **Bankrupt badge(s)** — red pill showing "Bankrupt ×2" if applicable
- **Net worth chart** — line chart over time (recorded on every app open)
- **Hall of Fame entry** — "Your peak: MX$112,400 · reached May 22" — persists forever
- **Transaction history** — last 40 transactions, newest first (buy/sell/reset/bonus)
- **Reset button** — with 30-day cooldown countdown when unavailable

### 2. Portfolio Tab — Summary Bar
One additional stat added to the existing `#port-summary-bar`:
- "Net Worth · MX$77,200" as a fourth tile alongside Invested / Market Value / Gain
- Updates when portfolio renders with fresh prices
- No new section — one number added to existing UI

### 3. Analyze Tab — Affordability Preview
A single line near the Add to Portfolio button when a user is viewing a stock:
- "5 shares = MX$12,750 · Vault after: MX$29,450"
- Updates live as the user changes share count in the form
- Only appears when the user has opened the add form
- Uses current stock price × FX rate for the calculation

---

## Net Worth Chart

- Recorded on **every app open** (not just on transactions)
- One entry per calendar day — same-day opens overwrite the previous entry
- Uses the net worth at the moment of app open (Vault cash + portfolio value at that moment)
- Minimum 2 data points required before the chart renders
- Line color: green if current net worth ≥ MX$50,000 (starting balance), red if below
- Chart is hidden until 2+ data points exist (shows "Open the app daily to build your chart" placeholder)

---

## Milestones

Milestone notifications fire **once per threshold per direction** — never repeat for the same crossing.

### Upward Milestones (toast + XP reward)
| Net Worth | Message | XP |
|---|---|---|
| MX$60,000 | "Up 20% — you're outperforming most beginners" | +10 XP |
| MX$75,000 | "Up 50% — your portfolio is working for you" | +15 XP |
| MX$100,000 | "Doubled your money — Hall of Fame territory" | +25 XP |

### Downward Milestones (warning only, no XP loss)
| Net Worth | Message |
|---|---|
| MX$40,000 | "Down 20% from your start. What's your next move?" |
| MX$25,000 | "Half your Vault is gone. This is what a real drawdown feels like." |
| MX$10,000 | "Critical. You have MX$10,000 left." |

Milestones are stored as a set of fired thresholds in `vault.milestonesFired` to prevent repeat firing.

---

## Hall of Fame

- Stored as `vault.peakNetWorth` and `vault.peakNetWorthDate`
- Updated on every net worth calculation — if current net worth > stored peak, update
- **Persists through resets** — going bankrupt never erases your peak
- Displayed in the Profile tab Vault section: "Your peak: MX$112,400 · May 22"
- Global leaderboard (future): ranked by all-time peak net worth, shown in Profile tab below personal entry

---

## Reset Mechanic

- **Cost:** 100 XP + one Bankrupt badge added to profile
- **Cooldown:** 30 days from last reset (`lastResetAt` timestamp in Firestore)
- **What resets:** Vault cash returns to MX$50,000. Portfolio positions are NOT cleared — user keeps their stocks but the cash reflects a fresh start.
- **What is preserved:** `peakNetWorth`, `peakNetWorthDate`, full `transactions` history, `bankruptCount`, `netWorthHistory`
- **Button state when on cooldown:** disabled, shows "Reset available in 18 days"
- **No repeat welcome bonus** on reset — MX$25,000 bonus is one-time only

### Bankrupt Badge Display
- Red pill on the Profile vault header: "Bankrupt" (first time), "Bankrupt ×2" (second), etc.
- Visible on the public Hall of Fame entry — serial bankruptcies are celebrated, not hidden

---

## Onboarding Integration

**Trigger:** User completes the risk quiz → investor profile is determined → recommended portfolio is auto-built with initial positions.

**Sequence:**
1. Risk quiz completes → profile saved
2. Recommended portfolio positions are calculated based on investor type
3. Each recommended position is "purchased" from the Vault (debit transactions recorded)
4. A `welcome_bonus` transaction of MX$25,000 is added to the Vault
5. User lands on their Portfolio tab seeing their first investments already in place
6. Net worth is MX$75,000 minus the cost of the recommended positions

**Effect:** The user's first session starts with the Vault already partially deployed. They feel invested from minute one.

---

## Day Trading

No restrictions. Users can buy and sell any stock any number of times per day. The simulation is a safe space to explore all strategies — day trading included. The educational value comes from seeing the results of decisions, not from limiting them.

---

## What's Already Built (v1)

The current implementation has:
- ✅ Vault cash tracking (debit on buy, credit on sell)
- ✅ Transaction history
- ✅ Net worth chart (transaction-triggered only)
- ✅ Reset button with 100 XP cost and Bankrupt badge
- ✅ Vault balance shown in sell modal and buy form
- ✅ Firestore persistence

**What this spec adds:**
- Net worth = cash + portfolio market value (not just cash)
- Chart recorded on every app open (not just transactions)
- Milestones (upward XP rewards + downward warnings)
- Hall of Fame (peak net worth, permanent)
- 30-day reset cooldown
- Portfolio tab net worth tile in summary bar
- Analyze tab affordability preview
- Onboarding welcome bonus (MX$25,000)

---

## Implementation Order

1. Net worth calculation (cash + portfolio value) — foundation everything else depends on
2. Chart recorded on app open
3. Portfolio tab net worth tile
4. Milestones system
5. Hall of Fame (peak tracking)
6. 30-day reset cooldown
7. Analyze tab affordability preview
8. Onboarding welcome bonus

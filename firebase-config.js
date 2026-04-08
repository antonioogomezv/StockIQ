// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAj55XTcs6vQp5_ix0JCW-TaaqbIQOVUTo",
  authDomain: "stockiq-656f7.firebaseapp.com",
  projectId: "stockiq-656f7",
  storageBucket: "stockiq-656f7.firebasestorage.app",
  messagingSenderId: "217995119686",
  appId: "1:217995119686:web:e013c2cec64af99fe2ce47"
};

firebase.initializeApp(firebaseConfig);
const db    = firebase.firestore();
const auth  = firebase.auth();

// ── Firestore helpers ──────────────────────────────
function currentUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}

function userRef() {
  let uid = currentUid();
  if (!uid) return null;
  return db.collection('users').doc(uid);
}

let _firestoreUnsub = null;

// Load user data once at login, then keep listening for real-time changes
function loadFirestoreUserData(callback) {
  let ref = userRef();
  if (!ref) { if (callback) callback({}); return; }

  // Unsubscribe any previous listener
  if (_firestoreUnsub) { _firestoreUnsub(); _firestoreUnsub = null; }

  let firstCall = true;
  let timer = setTimeout(function() {
    if (firstCall) { firstCall = false; if (callback) callback({}); }
  }, 4000);

  _firestoreUnsub = ref.onSnapshot(function(doc) {
    let data = doc.exists ? doc.data() : {};
    if (firstCall) {
      // First snapshot = initial load, pass to callback (replaces old ref.get)
      firstCall = false;
      clearTimeout(timer);
      if (callback) callback(data);
    } else {
      // Subsequent snapshots = change from another device — sync silently
      _applyFirestoreData(data);
    }
  }, function() {
    // Error handler
    if (firstCall) { firstCall = false; clearTimeout(timer); if (callback) callback({}); }
  });
}

// Apply incoming Firestore data to localStorage and re-render live sections
function _applyFirestoreData(data) {
  if (data.portfolios) {
    localStorage.setItem('portfolios', JSON.stringify(data.portfolios));
    if (data.activePortfolioId) localStorage.setItem('activePortfolioId', data.activePortfolioId);
    if (typeof renderPortfolio === 'function') renderPortfolio();
    if (typeof renderPortfolioTabs === 'function') renderPortfolioTabs();
  }
  if (data.watchlist) {
    localStorage.setItem('watchlist', JSON.stringify(data.watchlist));
    if (typeof renderWatchlist === 'function') renderWatchlist();
    if (typeof loadMarketOverview === 'function') loadMarketOverview();
  }
  if (data.priceAlerts) localStorage.setItem('price-alerts', JSON.stringify(data.priceAlerts));
  if (data.stockNotes) localStorage.setItem('stock-notes', JSON.stringify(data.stockNotes));
}

// Call this on sign-out to stop listening
function unsubscribeFirestore() {
  if (_firestoreUnsub) { _firestoreUnsub(); _firestoreUnsub = null; }
}

// Merge-save a field to the user document
function saveToFirestore(data) {
  let ref = userRef();
  if (!ref) return Promise.resolve();
  return ref.set(data, { merge: true });
}

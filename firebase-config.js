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

// Load all user data from Firestore into local variables
function loadFirestoreUserData(callback) {
  let ref = userRef();
  if (!ref) { if (callback) callback({}); return; }
  ref.get().then(function(doc) {
    if (callback) callback(doc.exists ? doc.data() : {});
  }).catch(function() { if (callback) callback({}); });
}

// Merge-save a field to the user document
function saveToFirestore(data) {
  let ref = userRef();
  if (!ref) return Promise.resolve();
  return ref.set(data, { merge: true });
}

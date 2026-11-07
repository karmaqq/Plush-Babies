/* ============================================================
   Plush Babies — Uygulama Ayarları ve Sabitler
   ============================================================ */

window.DZ = {
  appName: "Plush Babies",
  tagline: "Yumuşacık plush şamatası",

  PLUSH_MAX_LENGTH: 420,
  OF_MAX_LENGTH: 240,
  POF_MAX_LENGTH: 240,

  STORAGE_KEYS: {
    db: "plushbabies.db.v2",
    session: "plushbabies.session.v2",
    remember: "plushbabies.remember.v1"
  },

  /* ---------------------------------------------------------
     FIREBASE
     Tüm hesap girişleri Firebase Auth ile yapılır.
     enabled: true  -> Realtime Database + Auth (bulut modu)
     enabled: false -> yerel localStorage (yalnızca geliştirme)
     Store.js iki modu da destekler; API aynı kalır.
     --------------------------------------------------------- */
  firebase: {
    enabled: true,
    apiKey: "AIzaSyASdqgUHQlbKQgqRMgSwpitqD-3qiCo0Sk",
    authDomain: "post-eb8d1.firebaseapp.com",
    databaseURL: "https://post-eb8d1-default-rtdb.firebaseio.com",
    projectId: "post-eb8d1",
    storageBucket: "post-eb8d1.firebasestorage.app",
    messagingSenderId: "700730745002",
    appId: "1:700730745002:web:97885ced43ace8a6d530d3",
    measurementId: "G-WNGQH10302"
  },

  /* Mock veri üretim yardımcıları — uid üreticisi tahmin edilemez
     rastgelelik için crypto.getRandomValues kullanır (Math.random zayıf). */
  uid: function (prefix) {
    var rnd = "";
    try {
      var buf = new Uint32Array(4);
      (window.crypto || window.msCrypto).getRandomValues(buf);
      for (var i = 0; i < buf.length; i++) rnd += buf[i].toString(36);
    } catch (e) {
      rnd = Math.random().toString(36).slice(2, 10);
    }
    return prefix + rnd.slice(0, 6) + Date.now().toString(36).slice(-4);
  }
};

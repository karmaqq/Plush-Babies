/* ============================================================
   Plush Babies — Veri Katmanı (Store)
   ------------------------------------------------------------
   İKİ MOD:
   1) Yerel mod (config.firebase.enabled = false)
      Tam işlevsel MOCK backend (localStorage).
   2) Firebase modu (config.firebase.enabled = true)
      Realtime Database + Firebase Auth.
      Bellek içi cache, Firebase dinleyicileriyle senkronize
      tutulur. Yazma işlemleri optimistic'dir: önce cache'e
      uygulanır, ardından RTDB'ye yazılır.

   VERİ MODELİ (hiyerarşik — RTDB standardı):
   users/$uid/            → sahibine özel (yalnızca auth.uid === $uid)
     id, email
     pockets/$plushId: timestamp
   profiles/$uid/         → herkese okunabilir (public)
     id
     profile: { id, handle, name, bio, avatar, banner, joined, verified }
     following/$targetId: true
     followers/$uid: true
   plushes/$plushId/
     id
     meta: { authorId, createdAt }
     content: { text, image }
     interactions:
       likes/$uid: true
       ofs/$ofId/
         id
         meta: { authorId, createdAt }
         content: { text }
         interactions:
           likes/$uid: true
           pofs/$pofId/
             id
             meta: { authorId, createdAt }
             content: { text }
             interactions: { likes/$uid: true }

   Auth API'leri Promise döndürür; veri okuma API'leri senkron
   (cache üzerinden) çalışır — arayüz değişmez.
   ============================================================ */

(function () {
  var cfg = (window.DZ && DZ.firebase) || {};
  var isFB = !!(cfg.enabled && typeof firebase !== "undefined" && firebase.initializeApp);

  var KEY_DB = DZ.STORAGE_KEYS.db;
  var KEY_SESSION = DZ.STORAGE_KEYS.session;

  var db = { profiles: {}, plushes: {}, me: null, emails: {}, passwords: {} };
  var session = null; // { userId, ... }

  /* ---------------- Firebase modu ---------------- */
  var auth = null;
  var dbRef = null;
  var readyDone = false;
  var readyCbs = [];
  var fbAuthResolved = false;
  var fbProfilesLoaded = false;
  var fbPlushesLoaded = false;
  var fbMeLoaded = false;
  var mePrivCache = null; // users/$uid (id, email, pockets)
  var meUidRef = null;    // şu an dinlenen kullanıcının users/$uid yolu

  /* Tam kullanıcı objesinden public profil kopyası üretir.
     E-posta ve pockets asla public profiles altına yazılmaz. */
  function publicUser(u) {
    return {
      id: u.id,
      profile: {
        id: u.id,
        handle: u.profile.handle,
        name: u.profile.name,
        verified: !!u.profile.verified,
        bio: u.profile.bio || "",
        joined: u.profile.joined,
        avatar: u.profile.avatar || { color: "c0" },
        banner: u.profile.banner || null
      },
      following: u.following || {},
      followers: u.followers || {}
    };
  }

  /* Dinleyici hata callback'i: rules kaynaklı okuma reddi sessizce
     yutulmasın; konsola loglanır ve kullanıcıya toast ile bildirilir. */
  function onErr(err) {
    console.error("[store] listener error:", err && err.message ? err.message : err);
    DZ.ui && DZ.ui.toast && DZ.ui.toast("Canlı veri akışında sorun oluştu.", "err");
  }

  function fbSetup() {
    firebase.initializeApp(cfg);
    auth = firebase.auth();
    dbRef = firebase.database().ref();
    try { if (cfg.measurementId) firebase.analytics(); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }

    dbRef.child("profiles").on("value", function (snap) {
      db.profiles = snap.val() || {};
      normalizeProfiles();
      fbProfilesLoaded = true;
      rebuildMe();
      fbSyncCheck();
      notifySync();
    }, onErr);
    dbRef.child("plushes").on("value", function (snap) {
      db.plushes = snap.val() || {};
      fbPlushesLoaded = true;
      fbSyncCheck();
      notifySync();
    }, onErr);

    auth.onAuthStateChanged(function (user) {
      var uid = user ? user.uid : null;
      session = user ? { userId: uid } : null;
      fbAuthResolved = true;
      mePrivCache = null;
      /* Hesap değişirse eski kullanıcının dinleyicisini kaldır (karma veri riski) */
      if (meUidRef && meUidRef !== uid) { dbRef.child("users").child(meUidRef).off(); meUidRef = null; }
      if (user) {
        meUidRef = uid;
        /* RTDB'de auth kaydı varsa ama profili yoksa (bozuk/eksik veri)
           otomatik profil üretilir; böylece isAuthed her zaman çalışır. */
        dbRef.child("users").child(uid).on("value", function (snap) {
          mePrivCache = snap.val() || null;
          if (!Store.getUser(uid)) { fbEnsureUser(uid, user.email, user.displayName); return; }
          rebuildMe();
          fbSyncCheck();
        }, onErr);
      } else {
        db.me = null;
        fbMeLoaded = false;
      }
      fbSyncCheck();
      notifySync();
    });
  }

  /* Firebase veri değişiminde aktif görünümü yeniden çizen throttled
     resync bildirimi. 5 kullanıcılı küçük grupta tüm görünümü yeniden
     çizmek yeterli; scroll koruması app katmanında uygulanır (BUG-6).
     onSync aboneleri kalıcıdır: her bildirimde yeniden çağrılır. */
  var syncCbs = [];
  var syncTimer = null;
  function notifySync() {
    if (syncTimer) return;
    syncTimer = setTimeout(function () {
      syncTimer = null;
      syncCbs.slice().forEach(function (cb) { try { cb(); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ } });
    }, 150);
  }

  /* RTDB'den gelen profilleri normalize eder: Firebase boş nesneleri
     null'a çevirdiği için following/followers/avatar bozuk olabilir;
     ayrıca eksik profile alanlarına varsayılan atanır. */
  function normalizeProfiles() {
    var keys = Object.keys(db.profiles);
    for (var i = 0; i < keys.length; i++) {
      var u = db.profiles[keys[i]];
      if (!u || typeof u !== "object") { delete db.profiles[keys[i]]; continue; }
      if (!u.profile || typeof u.profile !== "object") {
        u.profile = {
          id: u.id || keys[i],
          handle: String(u.id || keys[i]).slice(0, 20),
          name: "Kullanıcı",
          verified: false,
          bio: "",
          joined: Date.now(),
          avatar: { color: "c0" },
          banner: null
        };
      }
      if (!u.following || typeof u.following !== "object") u.following = {};
      if (!u.followers || typeof u.followers !== "object") u.followers = {};
    }
  }

  /* Public profil + private hesap verisini tek obje olarak birleştirir. */
  function rebuildMe() {
    if (!session) return;
    var pub = db.profiles[session.userId];
    if (!pub) return;
    var priv = mePrivCache || {};
    db.me = Object.assign({}, pub, {
      email: priv.email || "",
      pockets: priv.pockets || {},
      following: pub.following || {},
      followers: pub.followers || {}
    });
    fbMeLoaded = true;
    fbSyncCheck();
  }

  function fbSyncCheck() {
    if (readyDone) return;
    var meOk = !session || fbMeLoaded || !!db.me;
    if (!(fbAuthResolved && fbProfilesLoaded && fbPlushesLoaded && meOk)) return;
    readyDone = true;
    var cbs = readyCbs;
    readyCbs = [];
    cbs.forEach(function (cb) { try { cb(); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ } });
  }

  function fbErrText(err) {
    var map = {
      "auth/email-already-in-use": "Bu e-posta zaten kayıtlı.",
      "auth/weak-password": "Şifre çok zayıf (en az 6 karakter).",
      "auth/invalid-email": "Geçerli bir e-posta girin.",
      "auth/invalid-credential": "E-posta veya şifre hatalı.",
      "auth/invalid-login-credentials": "E-posta veya şifre hatalı.",
      "auth/user-not-found": "Bu e-posta ile kayıtlı hesap bulunamadı.",
      "auth/wrong-password": "Şifre hatalı.",
      "auth/user-disabled": "Bu hesap devre dışı bırakılmış.",
      "auth/requires-recent-login": "Güvenlik için tekrar giriş yapman gerekiyor."
    };
    return map[err && err.code] || (err && err.message) || "Bir hata oluştu.";
  }

  /* ---------------- Yerel mod kalıcılığı ---------------- */
  function persist() {
    try { localStorage.setItem(KEY_DB, JSON.stringify(db)); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }
    try { localStorage.setItem(KEY_SESSION, JSON.stringify(session)); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY_DB); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }

    if (raw) {
      try { db = JSON.parse(raw); } catch (e) { db = { profiles: {}, plushes: {}, me: null, emails: {} }; }
    } else {
      db = { profiles: {}, plushes: {}, me: null, emails: {} };
    }
    if (!db.profiles) db.profiles = {};
    if (!db.plushes) db.plushes = {};
    if (!db.emails) db.emails = {};
    if (!db.passwords) db.passwords = {};

    var sess = null;
    try { sess = localStorage.getItem(KEY_SESSION); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }
    if (sess) { try { session = JSON.parse(sess); } catch (e) { session = null; } }

    if (session && db.me && db.me.id === session.userId) {
      db.me = Object.assign({}, db.profiles[session.userId] || {}, {
        email: db.me.email,
        pockets: db.me.pockets || {}
      });
    } else {
      session = null;
      db.me = null;
    }
  }

  /* ---------------- Yardımcılar ---------------- */
  function byTime(a, b) { return b.meta.createdAt - a.meta.createdAt; }

  /* Yerel mod şifre hash'i: düz metin şifre asla diskte saklanmaz.
     SubtleCrypto yoksa basit fallback kullanılır; her durumda değer
     session'a değil kalıcı db.passwords[uid] kaydına bağlıdır. */
  function hashPass(pass) {
    var text = String(pass || "");
    if (window.crypto && crypto.subtle) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (hash) {
        var hex = "";
        var bytes = new Uint8Array(hash);
        for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
        return hex;
      });
    }
    var h = 5381;
    for (var j = 0; j < text.length; j++) h = ((h << 5) + h + text.charCodeAt(j)) | 0;
    return Promise.resolve("h" + Math.abs(h).toString(36));
  }

  /* Bir plushun toplam aktivitesi: öf sayısı + tüm pöf sayısı */
  function plushActivity(p) {
    var ofs = p.interactions && p.interactions.ofs;
    if (!ofs) return 0;
    var keys = Object.keys(ofs);
    var n = keys.length;
    for (var i = 0; i < keys.length; i++) {
      var pofs = ofs[keys[i]].interactions && ofs[keys[i]].interactions.pofs;
      if (pofs) n += Object.keys(pofs).length;
    }
    return n;
  }
  function byActivityDesc(a, b) { return plushActivity(b) - plushActivity(a); }

  function meUser() { return db.me; }

  function mapIds(m) { return Object.keys(m || {}); }
  function mapLen(m) { return m ? Object.keys(m).length : 0; }

  /* Firebase Realtime Database boş nesneyi null'a çevirdiği için
     interactions alt dallarına güvenli erişim (yalnızca cache mutasyonu;
     RTDB yazımları ilgili child path'e yapılır). */
  function interOf(obj) { return obj.interactions || (obj.interactions = {}); }
  function ensureLikes(obj) { var i = interOf(obj); return i.likes || (i.likes = {}); }
  function ensureOfs(obj) { var i = interOf(obj); return i.ofs || (i.ofs = {}); }
  function ensurePofs(obj) { var i = interOf(obj); return i.pofs || (i.pofs = {}); }

  /* ---------------- Model üreticileri ---------------- */
  function newUser(uid, handle, name, email) {
    return {
      id: uid,
      email: email,
      profile: {
        id: uid, handle: handle, name: name, verified: false,
        bio: "", joined: Date.now(), avatar: { color: "c0" }, banner: null
      },
      following: {}, followers: {}, pockets: {}
    };
  }

  function newPlush(data, authorId) {
    return {
      id: DZ.uid("p_"),
      meta: { authorId: authorId, createdAt: Date.now() },
      content: { text: String(data.text || "").trim(), image: data.image || null },
      interactions: {}
    };
  }

  function newOf(text, authorId) {
    return {
      id: DZ.uid("of"),
      meta: { authorId: authorId, createdAt: Date.now() },
      content: { text: String(text).trim() },
      interactions: {}
    };
  }

  function newPof(text, authorId) {
    return {
      id: DZ.uid("pof"),
      meta: { authorId: authorId, createdAt: Date.now() },
      content: { text: String(text).trim() },
      interactions: {}
    };
  }

  /* ============================================================
     STORE API
     ============================================================ */
  var Store = {

    init: function () {
      if (isFB) {
        fbSetup();
      } else {
        load();
        if (!readyDone) {
          readyDone = true;
          var cbs = readyCbs;
          readyCbs = [];
          cbs.forEach(function (cb) { try { cb(); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ } });
        }
      }
    },

    ready: function (cb) {
      if (readyDone) { try { cb(); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ } return; }
      readyCbs.push(cb);
    },

    onSync: function (cb) { syncCbs.push(cb); },

    isFirebase: function () { return isFB; },

    /* ----- Oturum ----- */
    isAuthed: function () { return !!(session && db.me); },
    me: meUser,
    meId: function () { return session ? session.userId : null; },

    /* ----- Kullanıcılar (public profiller) ----- */
    getUsers: function () { return db.profiles; },
    usersList: function () { return Object.keys(db.profiles).map(function (k) { return db.profiles[k]; }); },
    getUser: function (id) { return db.profiles[id] || null; },
    getUserByHandle: function (handle) {
      var h = String(handle).toLowerCase().replace(/^@/, "");
      var keys = Object.keys(db.profiles);
      for (var i = 0; i < keys.length; i++) {
        var u = db.profiles[keys[i]];
        if (u && u.profile && u.profile.handle && u.profile.handle.toLowerCase() === h) return u;
      }
      return null;
    },
    searchUsers: function (q) {
      q = String(q || "").toLowerCase().trim();
      if (!q) return [];
      var out = [];
      var keys = Object.keys(db.profiles);
      for (var i = 0; i < keys.length; i++) {
        var u = db.profiles[keys[i]];
        if (!u || !u.profile) continue;
        if (u.profile.handle.toLowerCase().indexOf(q) > -1 || (u.profile.name || "").toLowerCase().indexOf(q) > -1) out.push(u);
      }
      return out;
    },

    /* ----- Plushlar ----- */
    getPlushes: function () { return db.plushes; },
    plushesList: function () { return Object.keys(db.plushes).map(function (k) { return db.plushes[k]; }).sort(byTime); },
    getPlush: function (id) { return db.plushes[id] || null; },
    getUserPlushes: function (uid) {
      var out = [];
      var keys = Object.keys(db.plushes);
      for (var i = 0; i < keys.length; i++) {
        if (db.plushes[keys[i]].meta.authorId === uid) out.push(db.plushes[keys[i]]);
      }
      return out.sort(byTime);
    },

    /* Şamata: takip ettiklerim + kendim ÖNDE, sonra tüm global plushlar.
       Tek akış — takip edilen arkadaşların plushları önceliklidir. */
    feedPlushes: function () {
      var me = meUser();
      var priority = [];
      var global = [];
      var keys = Object.keys(db.plushes);
      for (var i = 0; i < keys.length; i++) {
        var p = db.plushes[keys[i]];
        if (me && (p.meta.authorId === me.id || (me.following && me.following[p.meta.authorId]))) {
          priority.push(p);
        } else {
          global.push(p);
        }
      }
      priority.sort(byActivityDesc);
      global.sort(byActivityDesc);
      return priority.concat(global);
    },

    pocketsPlushes: function () {
      var me = meUser();
      if (!me) return [];
      var out = [];
      var keys = mapIds(me.pockets);
      for (var i = 0; i < keys.length; i++) {
        var p = db.plushes[keys[i]];
        if (p) out.push(p);
      }
      return out.sort(byTime);
    },

    /* ----- Plush yazma / silme ----- */
    createPlush: function (data) {
      var me = meUser();
      if (!me) return null;
      var p = newPlush(data, me.id);
      db.plushes[p.id] = p;
      if (isFB) {
        var payload = {
          id: p.id,
          meta: { authorId: p.meta.authorId, createdAt: Date.now() },
          content: p.content,
          interactions: {}
        };
        dbRef.child("plushes").child(p.id).set(payload).catch(function () {});
      } else persist();
      return p;
    },

    deletePlush: function (id) {
      var me = meUser();
      var p = db.plushes[id];
      if (!me || !p) return false;
      if (p.meta.authorId !== me.id) return false;
      delete db.plushes[id];
      if (isFB) dbRef.child("plushes").child(id).remove().catch(function () {});
      else persist();
      return true;
    },

    /* ----- Beğeni ----- */
    toggleLike: function (plushId) {
      var me = meUser();
      var p = db.plushes[plushId];
      if (!me || !p) return null;
      var likes = ensureLikes(p);
      var liked = !!likes[me.id];
      if (liked) delete likes[me.id];
      else likes[me.id] = true;
      if (isFB) {
        var ref = dbRef.child("plushes").child(plushId).child("interactions").child("likes").child(me.id);
        if (liked) ref.remove().catch(function () {}); else ref.set(true).catch(function () {});
      } else persist();
      return !liked;
    },

    togglePocket: function (plushId) {
      var me = meUser();
      var p = db.plushes[plushId];
      if (!me || !p) return null;
      var pockets = !!(me.pockets && me.pockets[plushId]);
      if (pockets) delete me.pockets[plushId];
      else me.pockets[plushId] = Date.now();
      if (isFB) {
        var ref = dbRef.child("users").child(me.id).child("pockets").child(plushId);
        if (pockets) ref.remove().catch(function () {}); else ref.set(Date.now()).catch(function () {});
      } else persist();
      return !pockets;
    },

    /* ----- Öfler ----- */
    addOf: function (plushId, text) {
      var me = meUser();
      var p = db.plushes[plushId];
      if (!me || !p) return null;
      var c = newOf(text, me.id);
      ensureOfs(p)[c.id] = c;
      if (isFB) {
        var payload = {
          id: c.id,
          meta: { authorId: c.meta.authorId, createdAt: Date.now() },
          content: c.content,
          interactions: {}
        };
        dbRef.child("plushes").child(plushId).child("interactions").child("ofs").child(c.id).set(payload).catch(function () {});
      } else persist();
      return c;
    },

    deleteOf: function (plushId, ofId) {
      var me = meUser();
      var p = db.plushes[plushId];
      if (!me || !p) return false;
      var ofs = ensureOfs(p);
      var c = ofs[ofId];
      if (!c || c.meta.authorId !== me.id) return false;
      delete ofs[ofId];
      if (isFB) dbRef.child("plushes").child(plushId).child("interactions").child("ofs").child(ofId).remove().catch(function () {});
      else persist();
      return true;
    },

    toggleOfLike: function (plushId, ofId) {
      var me = meUser();
      var p = db.plushes[plushId];
      if (!me || !p) return null;
      var c = ensureOfs(p)[ofId];
      if (!c) return null;
      var likes = ensureLikes(c);
      var liked = !!likes[me.id];
      if (liked) delete likes[me.id];
      else likes[me.id] = true;
      if (isFB) {
        var ref = dbRef.child("plushes").child(plushId).child("interactions").child("ofs").child(ofId).child("interactions").child("likes").child(me.id);
        if (liked) ref.remove().catch(function () {}); else ref.set(true).catch(function () {});
      } else persist();
      return !liked;
    },

    /* ----- Pöfler ----- */
    addPof: function (plushId, ofId, text) {
      var me = meUser();
      var p = db.plushes[plushId];
      if (!me || !p) return null;
      var c = ensureOfs(p)[ofId];
      if (!c) return null;
      var r = newPof(text, me.id);
      ensurePofs(c)[r.id] = r;
      if (isFB) {
        var payload = {
          id: r.id,
          meta: { authorId: r.meta.authorId, createdAt: Date.now() },
          content: r.content,
          interactions: {}
        };
        dbRef.child("plushes").child(plushId).child("interactions").child("ofs").child(ofId)
          .child("interactions").child("pofs").child(r.id).set(payload).catch(function () {});
      } else persist();
      return r;
    },

    togglePofLike: function (plushId, ofId, pofId) {
      var me = meUser();
      var p = db.plushes[plushId];
      if (!me || !p) return null;
      var c = ensureOfs(p)[ofId];
      if (!c) return null;
      var r = ensurePofs(c)[pofId];
      if (!r) return null;
      var likes = ensureLikes(r);
      var liked = !!likes[me.id];
      if (liked) delete likes[me.id];
      else likes[me.id] = true;
      if (isFB) {
        var ref = dbRef.child("plushes").child(plushId).child("interactions").child("ofs").child(ofId)
          .child("interactions").child("pofs").child(pofId).child("interactions").child("likes").child(me.id);
        if (liked) ref.remove().catch(function () {}); else ref.set(true).catch(function () {});
      } else persist();
      return !liked;
    },

    deletePof: function (plushId, ofId, pofId) {
      var me = meUser();
      var p = db.plushes[plushId];
      if (!me || !p) return false;
      var c = ensureOfs(p)[ofId];
      if (!c) return false;
      var pofs = ensurePofs(c);
      var r = pofs[pofId];
      if (!r || r.meta.authorId !== me.id) return false;
      delete pofs[pofId];
      if (isFB) {
        dbRef.child("plushes").child(plushId).child("interactions").child("ofs").child(ofId)
          .child("interactions").child("pofs").child(pofId).remove().catch(function () {});
      } else persist();
      return true;
    },

    /* ----- Takip ----- */
    toggleFollow: function (targetId) {
      var me = meUser();
      var target = db.profiles[targetId];
      if (!me || !target || targetId === me.id) return null;
      var following = !!me.following[targetId];
      if (following) {
        delete me.following[targetId];
        if (target.followers) delete target.followers[me.id];
      } else {
        me.following[targetId] = true;
        if (!target.followers) target.followers = {};
        target.followers[me.id] = true;
      }
      if (db.profiles[me.id]) db.profiles[me.id].following = me.following;
      if (isFB) {
        var myRef = dbRef.child("profiles").child(me.id).child("following").child(targetId);
        var tRef = dbRef.child("profiles").child(targetId).child("followers").child(me.id);
        if (following) { myRef.remove().catch(function () {}); tRef.remove().catch(function () {}); }
        else { myRef.set(true).catch(function () {}); tRef.set(true).catch(function () {}); }
      } else persist();
      return !following;
    },

    isFollowing: function (targetId) {
      var me = meUser();
      if (!me) return false;
      return !!(me.following && me.following[targetId]);
    },

    /* ----- Kimlik doğrulama (Promise döndürür) ----- */
    register: function (data) {
      var handle = String(data.handle || "").trim().replace(/^@/, "").toLowerCase();
      var name = String(data.name || "").trim();
      var email = String(data.email || "").trim().toLowerCase();
      var password = String(data.password || "");

      if (!name) return Promise.resolve({ error: "İsim boş olamaz." });
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle)) return Promise.resolve({ error: "Kullanıcı adı 3-20 karakter ve sadece harf/rakam/alt çizgi olmalı." });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Promise.resolve({ error: "Geçerli bir e-posta girin." });
      if (password.length < 6) return Promise.resolve({ error: "Şifre en az 6 karakter olmalı." });
      if (this.getUserByHandle(handle)) return Promise.resolve({ error: "Bu kullanıcı adı zaten alınmış." });

      if (isFB) {
        return auth.createUserWithEmailAndPassword(email, password)
          .then(function (cred) {
            var uid = cred.user.uid;
            var u = newUser(uid, handle, name, email);
            var pub = publicUser(u);
            db.profiles[uid] = pub;
            db.me = u;
            session = { userId: uid };
            /* Atomik multi-path yazım: profil + özel hesap + handle indeksi.
               handles/$handle doluysa tüm yazım reddedilir -> benzersizlik garantisi. */
            var updates = {};
            updates["users/" + uid] = { id: uid, email: email, pockets: {} };
            updates["profiles/" + uid] = pub;
            updates["handles/" + handle] = uid;
            return dbRef.update(updates).then(function () {
              return { ok: true, user: u };
            }).catch(function (err) {
              /* Yazım hatası: yarım kalmış Auth hesabını geri al. */
              try { if (auth.currentUser && auth.currentUser.uid === uid) auth.currentUser.delete().catch(function () {}); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }
              session = null;
              db.me = null;
              delete db.profiles[uid];
              return { error: fbErrText(err) };
            });
          })
          .catch(function (err) {
            if (err && err.code === "auth/email-already-in-use") return { error: "Bu e-posta zaten kayıtlı." };
            return { error: fbErrText(err) };
          });
      }

      var existing = Object.keys(db.emails).filter(function (uid) { return db.emails[uid] === email; });
      if (existing.length) return Promise.resolve({ error: "Bu e-posta zaten kayıtlı." });

      var uid = DZ.uid("u_");
      var u = newUser(uid, handle, name, email);
      db.profiles[uid] = publicUser(u);
      db.emails[uid] = email;
      db.me = u;
      session = { userId: uid };
      return hashPass(password).then(function (hash) {
        db.passwords[uid] = hash;
        persist();
        return { ok: true, user: u };
      });
    },

    login: function (email, password) {
      email = String(email || "").trim().toLowerCase();

      if (isFB) {
        return auth.signInWithEmailAndPassword(email, String(password))
          .then(function (cred) {
            return fbEnsureUser(cred.user.uid, cred.user.email, cred.user.displayName);
          })
          .catch(function (err) {
            if (err && (err.code === "auth/invalid-credential" || err.code === "auth/invalid-login-credentials" ||
                err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-email")) {
              return { error: "E-posta veya şifre hatalı." };
            }
            return { error: fbErrText(err) };
          });
      }

      var uid = Object.keys(db.emails).filter(function (k) { return db.emails[k] === email; })[0];
      var u = uid ? db.profiles[uid] : null;
      if (!u) return Promise.resolve({ error: "Bu e-posta ile kayıtlı hesap bulunamadı." });
      /* Şifre kontrolü oturuma değil KALICI db.passwords kaydına bağlı:
         oturum olmasa bile her zaman doğrulanır (auth bypass kapandı). */
      return hashPass(password).then(function (hash) {
        var stored = db.passwords[uid];
        if (!stored || stored !== hash) return { error: "Şifre hatalı." };
        db.me = Object.assign({}, u, { email: email, pockets: (db.me && db.me.id === uid) ? db.me.pockets : {} });
        session = { userId: uid, email: email };
        persist();
        return { ok: true, user: u };
      });
    },

    logout: function () {
      if (isFB) return auth.signOut().catch(function () {});
      session = null;
      db.me = null;
      try { localStorage.removeItem(KEY_SESSION); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }
      return Promise.resolve();
    },

    /* ----- Hesap yönetimi ----- */
    updateMe: function (data) {
      var me = meUser();
      if (!me) return null;
      var oldHandle = me.profile.handle;
      var prev = { name: me.profile.name, bio: me.profile.bio, avatar: me.profile.avatar, banner: me.profile.banner, handle: oldHandle };
      var rollback = function () {
        me.profile.name = prev.name; me.profile.bio = prev.bio;
        me.profile.avatar = prev.avatar; me.profile.banner = prev.banner;
        me.profile.handle = prev.handle;
      };

      if (data.name !== undefined) {
        var n = String(data.name).trim();
        if (n) me.profile.name = n;
      }
      if (data.bio !== undefined) me.profile.bio = String(data.bio).trim();
      if (data.avatar !== undefined) me.profile.avatar = data.avatar;
      if (data.banner !== undefined) me.profile.banner = data.banner;
      if (data.handle !== undefined) me.profile.handle = String(data.handle).trim().replace(/^@/, "").toLowerCase();
      db.profiles[me.id] = publicUser(me);

      if (isFB) {
        var upd = {};
        upd["profiles/" + me.id + "/profile"] = {
          id: me.id,
          name: me.profile.name,
          handle: me.profile.handle,
          bio: me.profile.bio,
          avatar: me.profile.avatar || {},
          banner: me.profile.banner || null
        };
        /* Handle değiştiyse: yeni handle indekslenir, eski kaldırılır.
           Tek multi-path update -> yeni handle doluysa tüm yazım (profil dahil)
           reddedilir ve cache geri alınır (race yok). */
        if (me.profile.handle !== oldHandle) {
          upd["handles/" + me.profile.handle] = me.id;
          upd["handles/" + oldHandle] = null;
        }
        dbRef.update(upd).catch(function () {
          rollback();
          db.profiles[me.id] = publicUser(me);
        });
      } else {
        persist();
      }
      return me;
    },

    changePassword: function (current, next) {
      if (String(next).length < 6) return Promise.resolve({ error: "Yeni şifre en az 6 karakter olmalı." });

      if (isFB) {
        var cu = auth.currentUser;
        if (!cu) return Promise.resolve({ error: "Oturum yok." });
        if (!cu.email) return Promise.resolve({ error: "E-posta bağlı olmayan hesaplarda şifre değiştirilemez." });
        var cred = firebase.auth.EmailAuthProvider.credential(cu.email, String(current));
        return cu.reauthenticateWithCredential(cred)
          .then(function () { return cu.updatePassword(String(next)); })
          .then(function () { return { ok: true }; })
          .catch(function (err) {
            if (err && (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential" || err.code === "auth/invalid-login-credentials")) {
              return { error: "Mevcut şifre yanlış." };
            }
            if (err && err.code === "auth/requires-recent-login") return { error: "Güvenlik için tekrar giriş yapmalısın." };
            return { error: fbErrText(err) };
          });
      }

      if (!session) return Promise.resolve({ error: "Oturum yok." });
      var uid = session.userId;
      var curHash = db.passwords[uid];
      return hashPass(current).then(function (ch) {
        if (curHash && curHash !== ch) return { error: "Mevcut şifre yanlış." };
        return hashPass(next).then(function (nh) {
          db.passwords[uid] = nh;
          persist();
          return { ok: true };
        });
      });
    },

    deleteAccount: function (password) {
      if (isFB) {
        var cu = auth.currentUser;
        if (!cu) return Promise.resolve({ error: "Oturum yok." });
        /* Firebase kural seti, kimlik silindikten sonra istemci tarafından
           özel verilerin temizlenmesine izin vermez. Bu nedenle önce veriyi
           temizleyip sonra Auth hesabını silmek gerekir; Auth silindikten sonra
           cleanup artık mümkün olmaz. */
        var step = Promise.resolve();
        if (cu.email) {
          step = cu.reauthenticateWithCredential(
            firebase.auth.EmailAuthProvider.credential(cu.email, String(password))
          );
        }
        return step
          .then(function () { var uid = cu.uid; return fbCleanupUser(uid).catch(function () {}); })
          .then(function () { return cu.delete(); })
          .then(function () {
            session = null;
            db.me = null;
            return { ok: true };
          })
          .catch(function (err) {
            if (err && (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential" || err.code === "auth/invalid-login-credentials")) {
              return { error: "Şifre yanlış." };
            }
            if (err && err.code === "auth/requires-recent-login") return { error: "Güvenlik için tekrar giriş yapmalısın." };
            return { error: fbErrText(err) };
          });
      }

      var me = meUser();
      if (!me) return Promise.resolve({ error: "Oturum yok." });
      return hashPass(password).then(function (ch) {
        var curHash = db.passwords[me.id];
        if (curHash && curHash !== ch) return { error: "Şifre yanlış." };
        return deleteLocalAccount(me);
      });
    }
  };

  /* Yerel mod hesap silme: profil, şifre, plushlar, etkileşimler ve takip
     kayıtları temizlenir. (Eski "db.me.pockets'tan sil" döngüsü anlamsızdı
     çünkü yerel modda pockets yalnızca db.me üzerinde tutulur — kaldırıldı.) */
  function deleteLocalAccount(me) {
    var meId = me.id;
    delete db.profiles[meId];
    delete db.emails[meId];
    delete db.passwords[meId];

    var pKeys = Object.keys(db.plushes);
    for (var i = 0; i < pKeys.length; i++) {
      var p = db.plushes[pKeys[i]];
      if (p.meta.authorId === meId) {
        delete db.plushes[p.id];
        continue;
      }
      delete ensureLikes(p)[meId];
      var cKeys = Object.keys(ensureOfs(p));
      for (var j = 0; j < cKeys.length; j++) {
        var c = ensureOfs(p)[cKeys[j]];
        if (c.meta.authorId === meId) { delete ensureOfs(p)[c.id]; continue; }
        delete ensureLikes(c)[meId];
        var rKeys = Object.keys(ensurePofs(c));
        for (var k = 0; k < rKeys.length; k++) {
          var r = ensurePofs(c)[rKeys[k]];
          if (r.meta.authorId === meId) { delete ensurePofs(c)[r.id]; continue; }
          delete ensureLikes(r)[meId];
        }
      }
    }

    var uKeys = Object.keys(db.profiles);
    for (var m = 0; m < uKeys.length; m++) {
      var u = db.profiles[uKeys[m]];
      delete u.following[meId];
      delete u.followers[meId];
    }

    session = null;
    db.me = null;
    try { localStorage.removeItem(KEY_SESSION); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }
    persist();
    return { ok: true };
  }

  /* Firebase hesap silmede referans temizliği (null yazım = silme)
     Rules gereği yalnızca silinen hesabın yazabileceği konumlar:
     kendi plushları, beğenileri, öfleri/pöfleri, takipçi kayıtları. */
  function fbCleanupUser(meId) {
    var writes = [
      dbRef.child("users").child(meId).remove(),
      dbRef.child("profiles").child(meId).remove()
    ];
    var meProfile = db.profiles[meId];
    if (meProfile && meProfile.profile && meProfile.profile.handle) {
      writes.push(dbRef.child("handles").child(meProfile.profile.handle).remove());
    }
    var keys = Object.keys(db.plushes);
    for (var i = 0; i < keys.length; i++) {
      var p = db.plushes[keys[i]];
      if (p.meta.authorId === meId) {
        writes.push(dbRef.child("plushes").child(p.id).remove());
        continue;
      }
      var upd = {};
      var plikes = ensureLikes(p);
      if (plikes[meId]) {
        delete plikes[meId];
        upd["interactions/likes/" + meId] = null;
      }
      var cKeys = Object.keys(ensureOfs(p));
      for (var j = 0; j < cKeys.length; j++) {
        var c = ensureOfs(p)[cKeys[j]];
        var base = "interactions/ofs/" + c.id;
        if (c.meta.authorId === meId) {
          delete ensureOfs(p)[c.id];
          upd[base] = null;
          continue;
        }
        var clikes = ensureLikes(c);
        if (clikes[meId]) {
          delete clikes[meId];
          upd[base + "/interactions/likes/" + meId] = null;
        }
        var rKeys = Object.keys(ensurePofs(c));
        for (var k = 0; k < rKeys.length; k++) {
          var r = ensurePofs(c)[rKeys[k]];
          var rbase = base + "/interactions/pofs/" + r.id;
          if (r.meta.authorId === meId) {
            delete ensurePofs(c)[r.id];
            upd[rbase] = null;
            continue;
          }
          var rlikes = ensureLikes(r);
          if (rlikes[meId]) {
            delete rlikes[meId];
            upd[rbase + "/interactions/likes/" + meId] = null;
          }
        }
      }
      if (Object.keys(upd).length) writes.push(dbRef.child("plushes").child(p.id).update(upd));
    }
    var uKeys = Object.keys(db.profiles);
    for (var m = 0; m < uKeys.length; m++) {
      var u = db.profiles[uKeys[m]];
      if (u.id === meId) continue;
      if (u.followers && u.followers[meId]) {
        delete u.followers[meId];
        writes.push(dbRef.child("profiles").child(u.id).child("followers").child(meId).remove());
      }
    }
    return Promise.all(writes.map(function (w) { return w.catch(function () {}); }));
  }

  /* Firebase Auth'ta kayıtlı kullanıcının public profilini garanti eder.
     Profil varsa oturumu kurar; yoksa (bozuk/eksik veri) otomatik
     profil oluşturup yazar. Böylece login sonrası isAuthed() her zaman true olur. */
  function fbEnsureUser(uid, email, displayName) {
    var existing = Store.getUser(uid);
    if (existing) {
      session = { userId: uid };
      return Promise.resolve({ ok: true, user: existing });
    }
    var base = String(email || "").split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "plush";
    base = base.slice(0, 20);
    var handle = base;
    var i = 1;
    while (Store.getUserByHandle(handle)) { handle = base + "_" + (i++); }
    var u = newUser(uid, handle, displayName || "Plush", email);
    var pub = publicUser(u);
    db.profiles[uid] = pub;
    db.me = u;
    var usersSet;
    if (mePrivCache) {
      usersSet = Promise.resolve();
    } else {
      /* users kaydı tamamen yok: set() yerine update() — alt ağaçlara
         (rooms/roomInvites/dms) dokunmaz; yalnız eksik alanlar tamamlanır. */
      var usersUpd = { id: uid, email: email || "" };
      if (!mePrivCache || !mePrivCache.pockets) usersUpd.pockets = {};
      usersSet = dbRef.child("users").child(uid).update(usersUpd);
    }
    return Promise.all([
      usersSet,
      /* Mevcut profili ezmemek için update(): yalnız id + profile yazılır;
         following/followers korunur. */
      dbRef.child("profiles").child(uid).update({ id: uid, profile: pub.profile }),
      /* İndeks yazımı çakışırsa sessizce geç; profil oluşturma asla engellenmez
         (getUserByHandle yine de db.profiles üzerinden çalışır). */
      dbRef.child("handles").child(handle).set(uid).catch(function () {})
    ]).then(function () {
      session = { userId: uid };
      return { ok: true, user: u };
    });
  }

  window.DZ.store = Store;
})();

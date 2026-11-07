/* ============================================================
   Plush Babies — Chat Katmanı (Odalar + DM)
   ------------------------------------------------------------
   Odalar: davet sistemiyle katılım; sahibi (owner) yöneticidir,
   üyeleri yönetir. Yalnızca metin odaları desteklenir (ses odaları
   kapatıldı).
   DM: deterministik dmId (dm_<küçükUid>_<büyükUid>) — aynı çift
   aynı konuşmayı paylaşır, mükerrer konuşma oluşmaz.
   Firebase modunda RTDB dinleyicileri cache'i senkron tutar;
   yerel modda localStorage (plushbabies.chat.<meId>).
   ============================================================ */

(function () {
  var store = window.DZ.store;
  var isFB = false;
  var dbRef = null;
  var auth = null;

  var cache = { rooms: {}, dms: {}, myRooms: {}, myInvites: {}, myDms: {}, publicRooms: {} };
  var PUBLIC_ROOMS = {};   // roomId -> true (keşfedilen public odalar)
  var roomIndexRef = null; // room_index dinleyicisi (kök)
  var typingTimers = {};   // scope:scopeId -> timeout
  var loadedFlags = { rooms: false, invites: false, dms: false, roomIndex: false }; // U5: ilk snapshot'lar geldi mi
  var cbs = [];
  var emitTimer = null;
  var roomListeners = {}; // roomId -> true
  var dmListeners = {};   // dmId -> true
  var myRefs = [];        // users/$uid altındaki refs (teardown için)

  function meId() { return store.meId(); }

  function chatKey() { return "plushbabies.chat." + (meId() || "anon"); }

  function emit() {
    if (emitTimer) return;
    emitTimer = setTimeout(function () {
      emitTimer = null;
      cbs.slice().forEach(function (cb) { try { cb(); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ } });
    }, 120);
  }

  function on(cb) { if (cb) cbs.push(cb); }

  /* ---------------- Yardımcılar ---------------- */
  function byTimeAsc(a, b) { return a.createdAt - b.createdAt; }
  function byTimeDesc(a, b) { return b.createdAt - a.createdAt; }

  /* Firebase hata mesajlarını anlaşılır Türkçeye çevirir + yol bilgisi */
  function trErr(err) {
    var msg = (err && err.message) ? String(err.message) : String(err || "Bilinmeyen hata");
    var lower = msg.toLowerCase();
    var path = "";
    var m = msg.match(/ at \/([\s\S]*)/);
    if (m) path = m[1].trim();
    var tur = msg;
    if (lower.indexOf("permission_denied") > -1 || lower.indexOf("permission denied") > -1) {
      tur = "İzin reddedildi — kurallar bu işlemi engelliyor.";
    } else if (lower.indexOf("validate") > -1) {
      tur = "Kural doğrulaması reddedildi (validate).";
    } else if (lower.indexOf("network") > -1 || lower.indexOf("unavailable") > -1 || lower.indexOf("offline") > -1) {
      tur = "Ağ hatası — Firebase'e bağlanılamıyor.";
    } else if (lower.indexOf("auth/") > -1 || lower.indexOf("unauthenticated") > -1 || lower.indexOf("not signed in") > -1) {
      tur = "Oturum sorunu — giriş yapman gerekiyor.";
    }
    if (path && lower.indexOf("permission") > -1) tur += " Yol: /" + path;
    return tur;
  }

  /* Başarısız Firebase işlemini konsola yazar ve kullanıcıya toast gösterir */
  function fail(fn, err) {
    console.error("[chat] " + fn + " failed:", err && err.stack ? err.stack : err);
    try { DZ.ui.toast(trErr(err), "err"); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }
  }

  /* Dinleyici hata callback'i: sessiz ölümü önler. Her 5 sn'de en fazla bir
     toast basılır (spam önleme); detay konsola yazılır. */
  var lastErrToastAt = 0;
  var lastListenerError = null;
  function onErr(fn, err) {
    lastListenerError = { at: Date.now(), tag: fn, message: err && err.message ? err.message : String(err) };
    console.error("[chat] listener " + fn + " error:", err && err.message ? err.message : err);
    try {
      var now = Date.now();
      if (now - lastErrToastAt > 5000) {
        lastErrToastAt = now;
        DZ.ui.toast("Bağlantı hatası — oda/mesaj verileri güncellenemiyor.", "err");
      }
    } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }
  }

  /* U5: son 30 sn içinde dinleyici hatası olduysa görünümler hata durumu gösterebilir. */
  function hasError() {
    return !!(lastListenerError && Date.now() - lastListenerError.at < 30000);
  }

  function dmIdFor(a, b) {
    var pair = [String(a), String(b)].sort();
    return "dm_" + pair[0] + "_" + pair[1];
  }

  function newMsg(uid, data) {
    return {
      id: DZ.uid("msg_"),
      authorId: uid,
      type: data.type || "text",
      text: String(data.text || "").trim(),
      mediaUrl: data.mediaUrl || null,
      mime: data.mime || null,
      createdAt: Date.now()
    };
  }

  /* RTDB payload: boş alanlar yazılmaz.
     T6: createdAt sunucu saatinden (ServerValue.TIMESTAMP) alınır — istemci
     saatiyle sıralama/okundu manipülasyonu engellenir. Cache'te yerel anlık
     sıralama için `msg.createdAt` (Date.now) korunur; server snapshot gelince
     gerçek zaman damgası cache'e işlenir. */
  function fbMsgPayload(msg) {
    var p = {
      id: msg.id,
      authorId: msg.authorId,
      type: msg.type,
      text: msg.text,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    if (msg.mediaUrl) p.mediaUrl = msg.mediaUrl;
    if (msg.mime) p.mime = msg.mime;
    return p;
  }

  /* ---------------- Yerel mod kalıcılığı ---------------- */
  function persist() {
    try { localStorage.setItem(chatKey(), JSON.stringify(cache)); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }
  }

  function loadLocal() {
    var raw = null;
    try { raw = localStorage.getItem(chatKey()); } catch (e) { /* Bilerek sessiz: hatada kesintisiz ilerle */ }
    if (raw) { try { cache = JSON.parse(raw); } catch (e) { resetCache(); } }
    if (!cache.rooms) cache.rooms = {};
    if (!cache.dms) cache.dms = {};
    if (!cache.myRooms) cache.myRooms = {};
    if (!cache.myInvites) cache.myInvites = {};
    if (!cache.myDms) cache.myDms = {};
    if (!cache.publicRooms) cache.publicRooms = {};
  }

  function resetCache() {
    cache = { rooms: {}, dms: {}, myRooms: {}, myInvites: {}, myDms: {}, publicRooms: {} };
  }

  /* ---------------- Firebase dinleyicileri ---------------- */
  function teardown() {
    loadedFlags = { rooms: false, invites: false, dms: false, roomIndex: false };
    if (roomIndexRef) { roomIndexRef.off(); roomIndexRef = null; }
    Object.keys(roomListeners).forEach(function (id) {
      if (roomListeners[id] && roomListeners[id].ref) roomListeners[id].ref.off();
      delete roomListeners[id];
    });
    Object.keys(dmListeners).forEach(function (id) {
      if (dmListeners[id] && dmListeners[id].ref) dmListeners[id].ref.off();
      delete dmListeners[id];
    });
    myRefs.forEach(function (r) { r.off(); });
    myRefs = [];
    /* C4: typing zamanlayıcılarını da temizle — kaynak sızıntısı önlenir. */
    Object.keys(typingTimers).forEach(function (k) { clearTimeout(typingTimers[k]); });
    typingTimers = {};
  }

  function bindUser(uid) {
    var rRooms = dbRef.child("users").child(uid).child("rooms");
    var rInv = dbRef.child("users").child(uid).child("roomInvites");
    var rDms = dbRef.child("users").child(uid).child("dms");

    rRooms.on("value", function (snap) {
      cache.myRooms = snap.val() || {};
      loadedFlags.rooms = true;
      syncRoomListeners();
      emit();
    }, function (err) { onErr("rooms", err); });
    rInv.on("value", function (snap) {
      cache.myInvites = snap.val() || {};
      loadedFlags.invites = true;
      syncRoomListeners();
      emit();
    }, function (err) { onErr("roomInvites", err); });
    rDms.on("value", function (snap) {
      /* P4 (kısmi): parent snapshot tüm DM subtree'sini indirir; mesajlar zaten
         child listener'lar tarafından cache.dms'e ayrıca yazılır. Yalnız meta
         alanlarını (otherUid/lastAt/lastMsgId/lastRead/otherRead) cache'te tutup
         messages'ı buraya kopyalamayarak çifte bellek kopyası önlenir. */
      var raw = snap.val() || {};
      var next = {};
      Object.keys(raw).forEach(function (id) {
        if (!raw[id]) return;
        var meta = {};
        Object.keys(raw[id]).forEach(function (k) {
          if (k !== "messages") meta[k] = raw[id][k];
        });
        next[id] = meta;
      });
      cache.myDms = next;
      loadedFlags.dms = true;
      syncDmListeners();
      emit();
    }, function (err) { onErr("dms", err); });
    roomIndexRef = dbRef.child("room_index");
    roomIndexRef.on("value", function (snap) {
      var idx = snap.val() || {};
      var next = {};
      Object.keys(idx).forEach(function (rid) {
        if (idx[rid] && idx[rid].privacy === "public") next[rid] = idx[rid];
      });
      cache.publicRooms = next;
      PUBLIC_ROOMS = {};
      Object.keys(next).forEach(function (rid) { PUBLIC_ROOMS[rid] = true; });
      loadedFlags.roomIndex = true;
      syncRoomListeners();
      emit();
    }, function (err) { onErr("room_index", err); });
    myRefs.push(rRooms, rInv, rDms);
  }

  function syncRoomListeners() {
    var want = {};
    Object.keys(cache.myRooms).forEach(function (id) { want[id] = true; });
    Object.keys(cache.myInvites).forEach(function (id) { want[id] = true; });
    Object.keys(cache.publicRooms || {}).forEach(function (id) { want[id] = true; });
    Object.keys(roomListeners).forEach(function (id) {
      if (!want[id]) {
        if (roomListeners[id] && roomListeners[id].ref) roomListeners[id].ref.off();
        delete roomListeners[id];
        delete cache.rooms[id];
      }
    });
    Object.keys(want).forEach(function (id) {
      if (roomListeners[id]) return;
      var ownerId = (cache.myRooms[id] && cache.myRooms[id].ownerId) ||
        (cache.myInvites[id] && cache.myInvites[id].ownerId) ||
        (cache.publicRooms[id] && cache.publicRooms[id].ownerId);
      if (!ownerId) return;
      var ref = dbRef.child("users").child(ownerId).child("rooms").child(id);
      ref.on("value", function (snap) {
        var v = snap.val();
        if (!v) { delete cache.rooms[id]; emit(); return; }
        var prev = cache.rooms[id];
        cache.rooms[id] = v;
        /* T3: server snapshot'ı cache'i tamamen replace ettiğinde, henüz server'a
           ulaşmamış yerel (optimistic) mesajlar korunur — geçici kaybolma flaşı önlenir. */
        if (prev && prev.messages) {
          if (!cache.rooms[id].messages) cache.rooms[id].messages = {};
          Object.keys(prev.messages).forEach(function (k) {
            if (cache.rooms[id].messages[k] == null) cache.rooms[id].messages[k] = prev.messages[k];
          });
        }
        emit();
      }, function (err) { onErr("room " + id, err); });
      roomListeners[id] = { ref: ref };
    });
  }

  function syncDmListeners() {
    var want = {};
    Object.keys(cache.myDms).forEach(function (id) { want[id] = true; });
    Object.keys(dmListeners).forEach(function (id) {
      if (!want[id]) {
        if (dmListeners[id] && dmListeners[id].ref) dmListeners[id].ref.off();
        delete dmListeners[id];
        delete cache.dms[id];
      }
    });
    Object.keys(want).forEach(function (id) {
      if (dmListeners[id]) return;
      var ref = dbRef.child("users").child(meId()).child("dms").child(id);
      ref.on("value", function (snap) {
        var v = snap.val();
        if (!v) { delete cache.dms[id]; emit(); return; }
        var prev = cache.dms[id];
        cache.dms[id] = v;
        /* T3: snapshot replace ederken yerel (optimistic) mesajları koru. */
        if (prev && prev.messages) {
          if (!cache.dms[id].messages) cache.dms[id].messages = {};
          Object.keys(prev.messages).forEach(function (k) {
            if (cache.dms[id].messages[k] == null) cache.dms[id].messages[k] = prev.messages[k];
          });
        }
        emit();
      }, function (err) { onErr("dm " + id, err); });
      dmListeners[id] = { ref: ref };
    });
  }

  /* ---------------- Oda API ---------------- */
  function createRoom(data, cb) {
    var me = store.me();
    if (!me) return null;
    var rid = DZ.uid("room_");
    var privacy = data.privacy === "private" ? "private" : "public";
    var joinedAt = Date.now();
    var room = {
      id: rid,
      meta: {
        name: String(data.name || "").trim().slice(0, 40),
        description: String(data.description || "").trim().slice(0, 160),
        type: "text",
        privacy: privacy,
        ownerId: me.id,
        createdAt: joinedAt
      },
      members: {},
      invites: {},
      messages: {}
    };
    room.members[me.id] = { role: "admin", joinedAt: joinedAt };

    if (isFB) {
      /* Oda, sahibinin (owner) kendi verisi altında yaşar:
         users/<ownerId>/rooms/<rid> = { ownerId, joinedAt, meta, members, messages, invites }
         Public odalar ayrıca room_index'e yazılır; tek update ile atomiktir. */
      cache.rooms[rid] = room;
      cache.myRooms[rid] = { ownerId: me.id, joinedAt: joinedAt };
      if (privacy === "public") {
        PUBLIC_ROOMS[rid] = true;
        cache.publicRooms[rid] = { ownerId: me.id, name: room.meta.name, type: room.meta.type, privacy: privacy, createdAt: joinedAt };
      }
      var upd = {};
      upd["users/" + me.id + "/rooms/" + rid] = {
        ownerId: me.id,
        joinedAt: joinedAt,
        meta: room.meta,
        members: {},
        messages: {},
        invites: {}
      };
      if (privacy === "public") {
        upd["room_index/" + rid] = { ownerId: me.id, name: room.meta.name, type: room.meta.type, privacy: privacy, createdAt: joinedAt };
      }
      dbRef.update(upd)
        .then(function () {
          /* K1 (ek): owner üyeliği oda oluştuktan SONRA ayrı update ile yazılır.
             members kuralları owner'ı root...meta/ownerId === auth.uid üzerinden
             doğrular; root yazım öncesini gördüğünden aynı update'te meta henüz
             yokken owner'ın admin üyelik yazımı reddediliyordu (public+private
             tüm odalar). İki adımlı yazımda meta mevcut → kural geçer. */
          dbRef.update({ ["users/" + me.id + "/rooms/" + rid + "/members/" + me.id]: { role: "admin", joinedAt: joinedAt } })
            .catch(function (err) { onErr("room owner membership", err); });
        })
        .catch(function (err) {
          delete cache.rooms[rid];
          delete cache.myRooms[rid];
          delete PUBLIC_ROOMS[rid];
          if (cache.publicRooms) delete cache.publicRooms[rid];
          fail("write", err);
        });
    } else {
      cache.rooms[rid] = room;
      cache.myRooms[rid] = true;
      if (privacy === "public") {
        PUBLIC_ROOMS[rid] = true;
        cache.publicRooms[rid] = { ownerId: me.id, name: room.meta.name, type: room.meta.type, privacy: privacy, createdAt: joinedAt };
      }
      persist();
    }
    emit();
    if (cb) cb(room);
    return room;
  }

  function inviteToRoom(roomId, targetId, cb) {
    var me = store.me();
    var room = cache.rooms[roomId];
    if (!me || !room) return false;
    if (room.meta.privacy === "public") return false;
    if (room.meta.ownerId !== me.id) return false;
    if (room.members && room.members[targetId]) return false;
    if (room.invites && room.invites[targetId]) return false;
    var ok = true;
    if (isFB) {
      var upd = {};
      upd["users/" + me.id + "/rooms/" + roomId + "/invites/" + targetId] = { inviterId: me.id, at: Date.now() };
      upd["users/" + targetId + "/roomInvites/" + roomId] = { roomId: roomId, at: Date.now(), ownerId: me.id };
      dbRef.update(upd)
        .then(function () {
          if (!cache.rooms[roomId].invites) cache.rooms[roomId].invites = {};
          cache.rooms[roomId].invites[targetId] = { inviterId: me.id, at: Date.now() };
          emit();
        })
        .catch(function (err) { ok = false; fail("write", err); });
    } else {
      if (!cache.rooms[roomId].invites) cache.rooms[roomId].invites = {};
      cache.rooms[roomId].invites[targetId] = { inviterId: me.id, at: Date.now() };
      persist();
    }
    emit();
    if (cb) cb(ok);
    return ok;
  }

  function cancelInvite(roomId, targetId, cb) {
    var me = store.me();
    var room = cache.rooms[roomId];
    if (!me || !room) return false;
    if (room.meta.ownerId !== me.id) return false;
    var ok = true;
    if (isFB) {
      var upd = {};
      upd["users/" + me.id + "/rooms/" + roomId + "/invites/" + targetId] = null;
      upd["users/" + targetId + "/roomInvites/" + roomId] = null;
      dbRef.update(upd).catch(function (err) { ok = false; fail("write", err); });
    } else {
      if (cache.rooms[roomId].invites) delete cache.rooms[roomId].invites[targetId];
      persist();
    }
    emit();
    if (cb) cb(ok);
    return ok;
  }

  /* Davet kabulü: üyelik, sahibin odasına yazılır; davet kayıtları temizlenir. */
  function acceptInvite(roomId, cb) {
    var me = store.me();
    if (!me) return false;
    var inv = cache.myInvites && cache.myInvites[roomId];
    if (!inv) return false;
    var ownerId = inv.ownerId;
    var ok = true;
    if (isFB) {
      var upd = {};
      upd["users/" + ownerId + "/rooms/" + roomId + "/members/" + me.id] = { role: "member", joinedAt: Date.now() };
      upd["users/" + me.id + "/rooms/" + roomId] = { ownerId: ownerId, joinedAt: Date.now() };
      upd["users/" + ownerId + "/rooms/" + roomId + "/invites/" + me.id] = null;
      upd["users/" + me.id + "/roomInvites/" + roomId] = null;
      dbRef.update(upd)
        .then(function () {
          cache.myRooms[roomId] = { ownerId: ownerId, joinedAt: Date.now() };
          delete cache.myInvites[roomId];
          if (cache.rooms[roomId]) {
            if (!cache.rooms[roomId].members) cache.rooms[roomId].members = {};
            cache.rooms[roomId].members[me.id] = { role: "member", joinedAt: Date.now() };
          }
          emit();
        })
        .catch(function (err) { ok = false; fail("write", err); });
    } else {
      if (!cache.rooms[roomId]) return false;
      if (!cache.rooms[roomId].members) cache.rooms[roomId].members = {};
      cache.rooms[roomId].members[me.id] = { role: "member", joinedAt: Date.now() };
      cache.myRooms[roomId] = { ownerId: ownerId, joinedAt: Date.now() };
      delete cache.myInvites[roomId];
      persist();
    }
    emit();
    if (cb) cb(ok);
    return ok;
  }

  function declineInvite(roomId, cb) {
    var me = store.me();
    if (!me) return false;
    var inv = cache.myInvites && cache.myInvites[roomId];
    var ownerId = inv && inv.ownerId;
    if (!ownerId && cache.rooms[roomId]) ownerId = cache.rooms[roomId].meta.ownerId;
    if (!ownerId && cache.publicRooms && cache.publicRooms[roomId]) ownerId = cache.publicRooms[roomId].ownerId;
    var ok = true;
    if (isFB) {
      var upd = {};
      if (ownerId) upd["users/" + ownerId + "/rooms/" + roomId + "/invites/" + me.id] = null;
      upd["users/" + me.id + "/roomInvites/" + roomId] = null;
      dbRef.update(upd).catch(function (err) { ok = false; fail("write", err); });
    } else {
      delete cache.myInvites[roomId];
      if (cache.rooms[roomId] && cache.rooms[roomId].invites) delete cache.rooms[roomId].invites[me.id];
      persist();
    }
    emit();
    if (cb) cb(ok);
    return ok;
  }

  function leaveRoom(roomId, cb) {
    var me = store.me();
    var room = cache.rooms[roomId];
    if (!me || !room) return false;
    if (room.meta.ownerId === me.id) return false;
    var ok = true;
    if (isFB) {
      var upd = {};
      upd["users/" + room.meta.ownerId + "/rooms/" + roomId + "/members/" + me.id] = null;
      upd["users/" + me.id + "/rooms/" + roomId] = null;
      dbRef.update(upd)
        .then(function () {
          if (cache.rooms[roomId] && cache.rooms[roomId].members) delete cache.rooms[roomId].members[me.id];
          delete cache.myRooms[roomId];
          emit();
        })
        .catch(function (err) { ok = false; fail("write", err); });
    } else {
      if (cache.rooms[roomId].members) delete cache.rooms[roomId].members[me.id];
      delete cache.myRooms[roomId];
      persist();
    }
    emit();
    if (cb) cb(ok);
    return ok;
  }

  function deleteRoom(roomId, cb) {
    var me = store.me();
    var room = cache.rooms[roomId];
    if (!me || !room) return false;
    if (room.meta.ownerId !== me.id) return false;
    var isPublic = room.meta.privacy === "public";
    var ok = true;
    if (isFB) {
      var upd = {};
      upd["users/" + me.id + "/rooms/" + roomId] = null;
      Object.keys(room.members || {}).forEach(function (uid) {
        upd["users/" + uid + "/rooms/" + roomId] = null;
      });
      Object.keys(room.invites || {}).forEach(function (uid) {
        upd["users/" + uid + "/roomInvites/" + roomId] = null;
      });
      if (isPublic) upd["room_index/" + roomId] = null;
      dbRef.update(upd)
        .then(function () {
          delete cache.rooms[roomId];
          delete cache.myRooms[roomId];
          delete cache.myInvites[roomId];
          delete PUBLIC_ROOMS[roomId];
          if (cache.publicRooms) delete cache.publicRooms[roomId];
          emit();
        })
        .catch(function (err) { ok = false; fail("write", err); });
    } else {
      delete cache.rooms[roomId];
      delete cache.myRooms[roomId];
      delete cache.myInvites[roomId];
      delete PUBLIC_ROOMS[roomId];
      if (cache.publicRooms) delete cache.publicRooms[roomId];
      persist();
    }
    emit();
    if (cb) cb(ok);
    return ok;
  }

  /* U10: oda ayarları — ad/açıklama/gizlilik. meta tam yazılır; public odaların
     room_index girdisi de güncellenir, private'a çevrilenlerin girdisi silinir. */
  function updateRoomMeta(roomId, data, cb) {
    var me = store.me();
    var room = cache.rooms[roomId];
    if (!me || !room) return false;
    if (room.meta.ownerId !== me.id) return false;
    var wasPublic = room.meta.privacy === "public";
    var meta = {
      name: String(data.name != null ? data.name : room.meta.name).trim().slice(0, 40),
      description: String(data.description != null ? data.description : (room.meta.description || "")).trim().slice(0, 160),
      type: room.meta.type === "voice" ? "voice" : "text",
      privacy: data.privacy === "private" ? "private" : "public",
      ownerId: room.meta.ownerId,
      createdAt: room.meta.createdAt
    };
    var nowPublic = meta.privacy === "public";
    if (wasPublic === nowPublic && meta.name === room.meta.name &&
        meta.description === room.meta.description && meta.privacy === room.meta.privacy) {
      if (cb) cb(true);
      return true;
    }
    var ok = true;
    var prevMeta = room.meta;
    var prevPub = cache.publicRooms && cache.publicRooms[roomId];
    if (isFB) {
      var upd = {};
      upd["users/" + me.id + "/rooms/" + roomId + "/meta"] = meta;
      if (nowPublic) {
        upd["room_index/" + roomId] = { ownerId: me.id, name: meta.name, type: meta.type, privacy: meta.privacy, createdAt: meta.createdAt };
      } else if (wasPublic) {
        upd["room_index/" + roomId] = null;
      }
      room.meta = meta;
      if (nowPublic) {
        PUBLIC_ROOMS[roomId] = true;
        if (!cache.publicRooms) cache.publicRooms = {};
        cache.publicRooms[roomId] = { ownerId: me.id, name: meta.name, type: meta.type, privacy: meta.privacy, createdAt: meta.createdAt };
      } else {
        delete PUBLIC_ROOMS[roomId];
        if (cache.publicRooms) delete cache.publicRooms[roomId];
      }
      emit();
      dbRef.update(upd)
        .then(function () { if (cb) cb(true); })
        .catch(function (err) {
          ok = false;
          room.meta = prevMeta;
          if (prevPub) cache.publicRooms[roomId] = prevPub; else if (cache.publicRooms) delete cache.publicRooms[roomId];
          if (wasPublic) PUBLIC_ROOMS[roomId] = true; else delete PUBLIC_ROOMS[roomId];
          emit();
          fail("write", err);
          if (cb) cb(false);
        });
    } else {
      room.meta = meta;
      if (nowPublic) {
        PUBLIC_ROOMS[roomId] = true;
        if (!cache.publicRooms) cache.publicRooms = {};
        cache.publicRooms[roomId] = { ownerId: me.id, name: meta.name, type: meta.type, privacy: meta.privacy, createdAt: meta.createdAt };
      } else {
        delete PUBLIC_ROOMS[roomId];
        if (cache.publicRooms) delete cache.publicRooms[roomId];
      }
      persist();
      emit();
      if (cb) cb(true);
    }
    return ok;
  }

  function setMemberRole(roomId, uid, role, cb) {
    var me = store.me();
    var room = cache.rooms[roomId];
    if (!me || !room) return false;
    if (room.meta.ownerId !== me.id) return false;
    if (!(room.members && room.members[uid])) return false;
    var ok = true;
    if (isFB) {
      dbRef.child("users").child(me.id).child("rooms").child(roomId).child("members").child(uid).update({ role: role })
        .catch(function (err) { ok = false; fail("write", err); });
    } else {
      cache.rooms[roomId].members[uid].role = role;
      persist();
    }
    emit();
    if (cb) cb(ok);
    return ok;
  }

  function removeMember(roomId, uid, cb) {
    var me = store.me();
    var room = cache.rooms[roomId];
    if (!me || !room) return false;
    if (room.meta.ownerId !== me.id) return false;
    if (uid === me.id) return false;
    var ok = true;
    if (isFB) {
      var upd = {};
      upd["users/" + me.id + "/rooms/" + roomId + "/members/" + uid] = null;
      upd["users/" + uid + "/rooms/" + roomId] = null;
      dbRef.update(upd)
        .then(function () {
          if (cache.rooms[roomId] && cache.rooms[roomId].members) delete cache.rooms[roomId].members[uid];
          emit();
        })
        .catch(function (err) { ok = false; fail("write", err); });
    } else {
      if (cache.rooms[roomId].members) delete cache.rooms[roomId].members[uid];
      persist();
    }
    emit();
    if (cb) cb(ok);
    return ok;
  }

  function sendRoomMessage(roomId, data, cb) {
    var me = store.me();
    var room = cache.rooms[roomId];
    if (!me || !room) return false;
    var msg = newMsg(me.id, data);
    var isMemberRoom = !!(room.members && room.members[me.id]);
    if (isFB) {
      if (!isMemberRoom && room.meta.privacy !== "public") return false;
      var msgUpd = {};
      msgUpd["users/" + room.meta.ownerId + "/rooms/" + roomId + "/messages/" + msg.id] = fbMsgPayload(msg);
      if (!cache.rooms[roomId].messages) cache.rooms[roomId].messages = {};
      cache.rooms[roomId].messages[msg.id] = msg;
      var undoMsg = function () {
        if (cache.rooms[roomId] && cache.rooms[roomId].messages) delete cache.rooms[roomId].messages[msg.id];
        emit();
      };
      var sendMsg = function () {
        dbRef.update(msgUpd)
          .then(function () { if (cb) cb(true); })
          .catch(function (err) { undoMsg(); fail("write", err); if (cb) cb(false); });
      };
      if (!isMemberRoom) {
        room.members[me.id] = { role: "member", joinedAt: Date.now() };
        cache.myRooms[roomId] = { ownerId: room.meta.ownerId, joinedAt: Date.now() };
        emit();
        /* root yazma öncesi durumu gösterdiğinden mesaj kuralındaki members kontrolü
           ancak join yazıldıktan SONRA geçer; join ve mesaj ayrı update'lerdir. */
        var joinUpd = {};
        joinUpd["users/" + room.meta.ownerId + "/rooms/" + roomId + "/members/" + me.id] = { role: "member", joinedAt: Date.now() };
        joinUpd["users/" + me.id + "/rooms/" + roomId] = { ownerId: room.meta.ownerId, joinedAt: Date.now() };
        dbRef.update(joinUpd)
          .then(sendMsg)
          .catch(function (err) {
            if (cache.rooms[roomId] && cache.rooms[roomId].members) delete cache.rooms[roomId].members[me.id];
            delete cache.myRooms[roomId];
            undoMsg();
            fail("write", err);
            if (cb) cb(false);
          });
      } else {
        emit();
        sendMsg();
      }
      return true;
    }
    if (!isMemberRoom) return false;
    if (!cache.rooms[roomId].messages) cache.rooms[roomId].messages = {};
    cache.rooms[roomId].messages[msg.id] = msg;
    persist();
    emit();
    if (cb) cb(true);
    return true;
  }

  function deleteRoomMessage(roomId, msgId, cb) {
    var me = store.me();
    var room = cache.rooms[roomId];
    if (!me || !room) return false;
    var m = room.messages && room.messages[msgId];
    if (!m) return false;
    var isAdmin = room.meta.ownerId === me.id ||
      (room.members && room.members[me.id] && room.members[me.id].role === "admin");
    if (m.authorId !== me.id && !isAdmin) return false;
    var ok = true;
    if (isFB) {
      dbRef.child("users").child(room.meta.ownerId).child("rooms").child(roomId)
        .child("messages").child(msgId).remove()
        .catch(function (err) { ok = false; fail("write", err); });
    } else {
      if (cache.rooms[roomId].messages) delete cache.rooms[roomId].messages[msgId];
      persist();
    }
    emit();
    if (cb) cb(ok);
    return ok;
  }

  /* ---------------- DM API ---------------- */
  function startDm(targetId, cb) {
    var me = store.me();
    if (!me || targetId === me.id) return null;
    var dmId = dmIdFor(me.id, targetId);
    var existing = cache.myDms[dmId];
    if (existing) { if (cb) cb(dmId, existing); return dmId; }
    if (isFB) {
      /* DM, her iki kullanıcının kendi altında bağımsız kopya olarak tutulur:
         update() yalnız otherUid alanını yazar; mevcut messages/lastAt/lastMsgId/
         lastRead/otherRead asla ezilmez (HIGH-09). Karşı tarafın kaydı, kendi kaydımız
         yazıldıktan SONRA yazılır (root yazma öncesi durumu gösterir).
         K10/T12: cache'e optimistik kayıt yazılır (render flaşı önlenir); zincir
         başarısız olursa cache geri alınır ve cb(dmId, ok) yalnız işlem bitince çağrılır. */
      var mineOnly = {};
      mineOnly["users/" + me.id + "/dms/" + dmId + "/otherUid"] = targetId;
      var optimistic = !cache.myDms[dmId];
      if (optimistic) {
        cache.myDms[dmId] = { lastAt: Date.now(), lastMsgId: "", otherUid: targetId };
        if (!cache.dms[dmId]) cache.dms[dmId] = { id: dmId, messages: {} };
      }
      emit();
      dbRef.update(mineOnly)
        .then(function () {
          var theirs = {};
          theirs["users/" + targetId + "/dms/" + dmId + "/otherUid"] = me.id;
          return dbRef.update(theirs);
        })
        .then(function () { if (cb) cb(dmId, true); })
        .catch(function (err) {
          if (optimistic) {
            delete cache.myDms[dmId];
            if (cache.dms[dmId] && (!cache.dms[dmId].messages || !Object.keys(cache.dms[dmId].messages).length)) delete cache.dms[dmId];
          }
          emit();
          fail("write", err);
          if (cb) cb(dmId, false);
        });
    } else {
      if (!cache.dms[dmId]) cache.dms[dmId] = { id: dmId, messages: {} };
      if (!cache.myDms[dmId]) cache.myDms[dmId] = { lastAt: Date.now(), lastMsgId: "", otherUid: targetId };
      persist();
      emit();
      if (cb) cb(dmId, true);
    }
    return dmId;
  }

  function sendDmMessage(dmId, data, cb) {
    var me = store.me();
    if (!me || !cache.myDms[dmId]) return false;
    var other = (cache.myDms[dmId] && cache.myDms[dmId].otherUid) ||
      (cache.dms[dmId] && cache.dms[dmId].otherUid);
    var msg = newMsg(me.id, data);
    if (isFB) {
      var payload = fbMsgPayload(msg);
      /* K11: kendi tarafı ile alıcının tarafı AYRI update'lerdir. Alıcı yazımı
         reddedilirse (ör. startDm yarım kalmışsa) kendi mesajımız düşmez; kullanıcı
         mesajını anında görür, teslim edilemediği toast ile bildirilir. */
      var mine = {};
      mine["users/" + me.id + "/dms/" + dmId + "/messages/" + msg.id] = payload;
      mine["users/" + me.id + "/dms/" + dmId + "/lastAt"] = Date.now();
      mine["users/" + me.id + "/dms/" + dmId + "/lastMsgId"] = msg.id;
      if (!cache.dms[dmId]) cache.dms[dmId] = {};
      if (!cache.dms[dmId].messages) cache.dms[dmId].messages = {};
      cache.dms[dmId].messages[msg.id] = msg;
      cache.myDms[dmId].lastAt = Date.now();
      cache.myDms[dmId].lastMsgId = msg.id;
      emit();
      dbRef.update(mine)
        .then(function () {
          if (!other) { if (cb) cb(true); return; }
          var theirs = {};
          theirs["users/" + other + "/dms/" + dmId + "/messages/" + msg.id] = payload;
          theirs["users/" + other + "/dms/" + dmId + "/lastAt"] = Date.now();
          theirs["users/" + other + "/dms/" + dmId + "/lastMsgId"] = msg.id;
          dbRef.update(theirs)
            .then(function () { if (cb) cb(true); })
            .catch(function (err) {
              fail("dm-deliver", err);
              if (cb) cb(true);
            });
        })
        .catch(function (err) {
          if (cache.dms[dmId] && cache.dms[dmId].messages) delete cache.dms[dmId].messages[msg.id];
          emit();
          fail("write", err);
          if (cb) cb(false);
        });
      return true;
    }
    if (!cache.dms[dmId]) return false;
    if (!cache.dms[dmId].messages) cache.dms[dmId].messages = {};
    cache.dms[dmId].messages[msg.id] = msg;
    cache.myDms[dmId].lastAt = Date.now();
    cache.myDms[dmId].lastMsgId = msg.id;
    persist();
    emit();
    if (cb) cb(true);
    return true;
  }

  function deleteDmMessage(dmId, msgId, cb) {
    var me = store.me();
    if (!me) return false;
    var dm = cache.dms[dmId];
    var m = dm && dm.messages && dm.messages[msgId];
    if (!m || m.authorId !== me.id) return false;
    var ok = true;
    if (isFB) {
      /* Silme yalnız kendi tarafından yapılır; karşı tarafın kopyası etkilenmez.
         T9: lastMsgId yanında lastAt da yeniden hesaplanır — DM listesi sıralaması
         bozulmaz; son mesaj kalmadıysa ikisi de sıfırlanır. */
      dbRef.child("users").child(me.id).child("dms").child(dmId).child("messages").child(msgId).remove()
        .then(function () {
          if (cache.dms[dmId] && cache.dms[dmId].messages) delete cache.dms[dmId].messages[msgId];
          var msgs = cache.dms[dmId] && cache.dms[dmId].messages || {};
          var keys = Object.keys(msgs);
          var last = null;
          keys.forEach(function (k) { if (!last || msgs[k].createdAt > last.createdAt) last = msgs[k]; });
          var upd = last
            ? { lastMsgId: last.id, lastAt: last.createdAt }
            : { lastMsgId: "", lastAt: 0 };
          dbRef.child("users").child(me.id).child("dms").child(dmId).update(upd)
            .catch(function (err) { console.warn("[chat] lastMsgId/lastAt update failed:", err && err.message ? err.message : err); });
          if (cache.myDms[dmId]) {
            cache.myDms[dmId].lastMsgId = upd.lastMsgId;
            cache.myDms[dmId].lastAt = upd.lastAt;
          }
          emit();
        })
        .catch(function (err) { ok = false; fail("write", err); });
    } else {
      if (cache.dms[dmId].messages) delete cache.dms[dmId].messages[msgId];
      persist();
    }
    emit();
    if (cb) cb(ok);
    return ok;
  }

  /* Okundu işaretleri */
  var warnedDmRead = false;
  function markDmRead(dmId) {
    var me = store.me();
    var meta = cache.myDms[dmId];
    if (!me || !meta || !meta.lastMsgId) return;
    if (meta.lastRead === meta.lastMsgId) return;
    meta.lastRead = meta.lastMsgId;
    if (isFB) {
      /* lastRead (kendi tarafımız) ve otherRead (karşı taraf) AYRI update'lerle
         yazılır (K11 deseni): multi-path atomik olduğundan otherRead reddi, kendi
         okundu işaretimizi de düşürürdü. otherRead reddi sessizce not edilir. */
      dbRef.update({ ["users/" + me.id + "/dms/" + dmId + "/lastRead"]: meta.lastMsgId })
        .catch(function (err) {
          console.warn("[chat] dm lastRead failed:", err && err.message ? err.message : err);
        });
      if (meta.otherUid) {
        dbRef.update({ ["users/" + meta.otherUid + "/dms/" + dmId + "/otherRead"]: meta.lastMsgId })
          .catch(function (err) {
            if (!warnedDmRead) {
              warnedDmRead = true;
              console.warn("[chat] dm otherRead ignored:", err && err.message ? err.message : err);
            }
          });
      }
    } else persist();
    emit();
  }

  function markRoomRead(roomId) {
    var me = store.me();
    var room = cache.rooms[roomId];
    if (!me || !room) return;
    var msgs = room.messages || {};
    var keys = Object.keys(msgs);
    if (!keys.length) return;
    var last = null;
    for (var i = 0; i < keys.length; i++) {
      if (!last || msgs[keys[i]].createdAt > last.createdAt) last = msgs[keys[i]];
    }
    var meMember = room.members && room.members[me.id];
    if (meMember && meMember.lastRead === last.id) return;
    if (isFB) {
      dbRef.child("users").child(room.meta.ownerId).child("rooms").child(roomId)
        .child("members").child(me.id).update({ lastRead: last.id })
        .catch(function (err) { onErr("room lastRead", err); });
    } else {
      if (cache.rooms[roomId].members) {
        if (!cache.rooms[roomId].members[me.id]) cache.rooms[roomId].members[me.id] = { role: "member", joinedAt: Date.now() };
        cache.rooms[roomId].members[me.id].lastRead = last.id;
      }
      persist();
    }
    emit();
  }

  /* Konuşmayı yalnız kendi tarafından siler; karşı tarafın kopyası korunur. */
  function deleteDm(dmId, cb) {
    var me = store.me();
    if (!me || !cache.myDms[dmId]) return false;
    var ok = true;
    if (isFB) {
      dbRef.child("users").child(me.id).child("dms").child(dmId).remove()
        .then(function () {
          delete cache.myDms[dmId];
          delete cache.dms[dmId];
          if (dmListeners[dmId] && dmListeners[dmId].ref) { dmListeners[dmId].ref.off(); delete dmListeners[dmId]; }
          emit();
          if (cb) cb(true);
        })
        .catch(function (err) { ok = false; fail("write", err); if (cb) cb(false); });
    } else {
      delete cache.myDms[dmId];
      delete cache.dms[dmId];
      persist();
      emit();
      if (cb) cb(true);
    }
    return ok;
  }

  /* ---------------- Yazıyor (typing) ---------------- */
  function setTyping(scope, scopeId) {
    if (!isFB || !store.me()) return;
    var key = scope + ":" + scopeId;
    /* K4: kural `hasChildren(['at']) && at.isNumber()` bekliyor — sayı değil nesne yazılır. */
    dbRef.child("typing").child(scope).child(scopeId).child(store.meId())
      .set({ at: firebase.database.ServerValue.TIMESTAMP })
      .catch(function (err) { console.warn("[chat] typing write failed:", err && err.message ? err.message : err); });
    if (typingTimers[key]) clearTimeout(typingTimers[key]);
    typingTimers[key] = setTimeout(function () {
      dbRef.child("typing").child(scope).child(scopeId).child(store.meId()).remove()
        .catch(function (err) { console.warn("[chat] typing clear failed:", err && err.message ? err.message : err); });
      delete typingTimers[key];
    }, 3000);
  }
  function clearTyping(scope, scopeId) {
    if (!isFB || !store.me()) return;
    var key = scope + ":" + scopeId;
    if (typingTimers[key]) clearTimeout(typingTimers[key]);
    dbRef.child("typing").child(scope).child(scopeId).child(store.meId()).remove()
      .catch(function (err) { console.warn("[chat] typing clear failed:", err && err.message ? err.message : err); });
  }

  /* ---------------- Okuma API ---------------- */
  function getRooms() {
    var me = store.me();
    if (!me) return [];
    var seen = {};
    Object.keys(cache.myRooms).forEach(function (id) { seen[id] = true; });
    Object.keys(cache.myInvites).forEach(function (id) { seen[id] = true; });
    Object.keys(cache.publicRooms || {}).forEach(function (id) { seen[id] = true; });
    return Object.keys(seen)
      .map(function (id) { return cache.rooms[id] || null; })
      .filter(Boolean)
      .sort(function (a, b) { return b.meta.createdAt - a.meta.createdAt; });
  }

  /* Public odaya açık katılım (davetsiz). Private odalar yalnız acceptInvite akışını kullanır. */
  function joinRoom(roomId, cb) {
    var me = store.me();
    var room = cache.rooms[roomId];
    if (!me || !room) return false;
    if (room.members && room.members[me.id]) return true;
    if (room.meta.privacy !== "public") return false;
    if (isFB) {
      var upd = {};
      upd["users/" + room.meta.ownerId + "/rooms/" + roomId + "/members/" + me.id] = { role: "member", joinedAt: Date.now() };
      upd["users/" + me.id + "/rooms/" + roomId] = { ownerId: room.meta.ownerId, joinedAt: Date.now() };
      dbRef.update(upd)
        .then(function () { cache.myRooms[roomId] = { ownerId: room.meta.ownerId, joinedAt: Date.now() }; emit(); if (cb) cb(true); })
        .catch(function (err) { fail("write", err); if (cb) cb(false); });
      return true;
    }
    if (!room.members) room.members = {};
    room.members[me.id] = { role: "member", joinedAt: Date.now() };
    cache.myRooms[roomId] = { ownerId: room.meta.ownerId, joinedAt: Date.now() };
    persist();
    emit();
    if (cb) cb(true);
    return true;
  }

  function getRoom(id) { return cache.rooms[id] || null; }

  function roomMessages(roomId) {
    var room = cache.rooms[roomId];
    var msgs = (room && room.messages) || {};
    return Object.keys(msgs).map(function (k) { return msgs[k]; }).sort(byTimeAsc);
  }

  function roomMembers(roomId) {
    var room = cache.rooms[roomId];
    if (!room) return [];
    var mem = room.members || {};
    var list = Object.keys(mem).map(function (uid) {
      return { uid: uid, role: mem[uid].role, joinedAt: mem[uid].joinedAt };
    });
    /* Owner'ın members kaydı iki adımlı yazımdan dolayı anlık boş kalabilir;
       owner her zaman üye olarak sayılır. */
    if (room.meta && room.meta.ownerId && !mem[room.meta.ownerId]) {
      list.push({ uid: room.meta.ownerId, role: "admin", joinedAt: room.meta.createdAt || 0 });
    }
    return list.sort(function (a, b) { return a.joinedAt - b.joinedAt; });
  }

  function roomInvites(roomId) {
    var room = cache.rooms[roomId];
    var inv = (room && room.invites) || {};
    return Object.keys(inv).map(function (uid) {
      return { uid: uid, inviterId: inv[uid].inviterId, at: inv[uid].at };
    });
  }

  function myInvites() {
    var me = store.me();
    if (!me) return [];
    return Object.keys(cache.myInvites).map(function (rid) {
      return { roomId: rid, at: cache.myInvites[rid].at, room: cache.rooms[rid] || null };
    });
  }

  function dmList() {
    var me = store.me();
    if (!me) return [];
    return Object.keys(cache.myDms)
      .map(function (dmId) {
        var m = cache.myDms[dmId] || {};
        return {
          dmId: dmId,
          otherUid: m.otherUid,
          lastAt: m.lastAt,
          lastMsgId: m.lastMsgId,
          lastRead: m.lastRead,
          otherRead: m.otherRead,
          unread: !!(m.lastMsgId && m.lastMsgId !== m.lastRead)
        };
      })
      .sort(function (a, b) { return (b.lastAt || 0) - (a.lastAt || 0); });
  }

  function getDm(dmId) { return cache.dms[dmId] || null; }

  function dmMessages(dmId) {
    var dm = cache.dms[dmId];
    var msgs = (dm && dm.messages) || {};
    return Object.keys(msgs).map(function (k) { return msgs[k]; }).sort(byTimeAsc);
  }

  function isOwner(roomId, uid) {
    var room = cache.rooms[roomId];
    return !!(room && room.meta && room.meta.ownerId === uid);
  }

  function isAdmin(roomId, uid) {
    var room = cache.rooms[roomId];
    return !!(room && room.members && room.members[uid] && room.members[uid].role === "admin");
  }

  function isMember(roomId, uid) {
    var room = cache.rooms[roomId];
    if (!room) return false;
    if (room.meta && room.meta.ownerId === uid) return true;
    return !!(room.members && room.members[uid]);
  }

  function unreadDmCount() {
    return dmList().filter(function (d) { return d.unread; }).length;
  }

  function pendingInviteCount() {
    return myInvites().length;
  }

  /* U5: tüm ilk snapshot'lar (rooms, invites, dms, room_index) geldi mi?
     Yerel modda veri anında hazırdır. */
  function isLoaded() {
    if (!isFB) return true;
    return loadedFlags.rooms && loadedFlags.invites && loadedFlags.dms && loadedFlags.roomIndex;
  }

  /* U5: kullanıcı "Yeniden Dene" dediğinde dinleyicileri sıfırlayıp yeniden bağlar. */
  function reload() {
    lastListenerError = null;
    if (!isFB) { loadLocal(); emit(); return; }
    teardown();
    resetCache();
    var u = firebase.auth().currentUser;
    if (u) bindUser(u.uid);
    emit();
  }

  /* ---------------- Başlangıç ---------------- */
  function init() {
    isFB = store.isFirebase();
    if (isFB) {
      dbRef = firebase.database().ref();
      auth = firebase.auth();
      auth.onAuthStateChanged(function (user) {
        teardown();
        resetCache();
        if (user) bindUser(user.uid);
        emit();
      });
    } else {
      loadLocal();
      emit();
    }
  }

  window.DZ.chat = {
    on: on,
    isFirebase: function () { return isFB; },

    createRoom: createRoom,
    inviteToRoom: inviteToRoom,
    cancelInvite: cancelInvite,
    acceptInvite: acceptInvite,
    declineInvite: declineInvite,
    leaveRoom: leaveRoom,
    deleteRoom: deleteRoom,
    updateRoomMeta: updateRoomMeta,
    joinRoom: joinRoom,
    setMemberRole: setMemberRole,
    removeMember: removeMember,
    sendRoomMessage: sendRoomMessage,
    deleteRoomMessage: deleteRoomMessage,

    startDm: startDm,
    sendDmMessage: sendDmMessage,
    deleteDmMessage: deleteDmMessage,
    deleteDm: deleteDm,

    markDmRead: markDmRead,
    markRoomRead: markRoomRead,

    setTyping: setTyping,
    clearTyping: clearTyping,

    getRooms: getRooms,
    getRoom: getRoom,
    roomMessages: roomMessages,
    roomMembers: roomMembers,
    roomInvites: roomInvites,
    myInvites: myInvites,
    dmList: dmList,
    getDm: getDm,
    dmMessages: dmMessages,

    isOwner: isOwner,
    isAdmin: isAdmin,
    isMember: isMember,
    unreadDmCount: unreadDmCount,
    pendingInviteCount: pendingInviteCount,
    isLoaded: isLoaded,
    hasError: hasError,

    init: init,
    reload: reload
  };
})();

/* ============================================================
   Plush Babies — Router (hash tabanlı SPA)
   Rotalar:
     #/auth            Giriş / Kayıt
     #/feed            Ana akış
     #/plush/:plushId    Plush detayı + öfler
     #/u/:handle       Profil (kaydedilenler: #/u/:handle/pockets)
     #/settings        Hesap ayarları
   ============================================================ */

(function () {
  var routes = {
    "auth": function (params) { DZ.app.renderAuth(); },
    "feed": function (params) { DZ.app.renderFeed(); },
    "plush": function (params) { DZ.app.renderPlush(params.id); },
    "rooms": function (params) { DZ.app.renderRooms(); },
    "dms": function (params) { DZ.app.renderRooms("dm"); },
    "room": function (params) { DZ.app.renderRoom(params.id); },
    "dm": function (params) { DZ.app.renderDm(params.id); },
    "u": function (params) {
      /* Başkasının pockets URL'i yanıltıcı boş durum göstermesin:
         temel profile yönlendir. Cep listesi yalnızca sahibine açıktır. */
      var me = DZ.store.me();
      if (params.sub === "pockets" && me && me.profile && params.handle !== me.profile.handle) {
        location.hash = "#/u/" + params.handle;
        return;
      }
      DZ.app.renderProfile(params.handle, params.sub);
    },
    "settings": function (params) { DZ.app.renderSettings(); }
  };

  function parse() {
    var hash = location.hash || "#/feed";
    var clean = hash.replace(/^#\/?/, "");
    var parts = clean.split("/").filter(Boolean);
    return {
      name: (parts[0] || "feed").toLowerCase(),
      params: {
        id: parts[1] || null,
        handle: parts[1] || null,
        sub: parts[2] || null
      },
      raw: parts
    };
  }

  function current() { return parse(); }

  function navigate(to) {
    if (location.hash === to) { scheduleRender(); return; }
    location.hash = to;
  }

  /* Aynı tick içindeki birden fazla render isteğini tek sefere indirir
     (hashchange + manuel çağrı çakışması → çift/üçlü render engellenir). */
  var renderPending = false;
  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    setTimeout(function () {
      renderPending = false;
      doRender();
    }, 0);
  }

  function render() { scheduleRender(); }

  /* Ayarlardan kaydedilmemiş değişiklikle ayrılma engeli:
     DZ.app.guardNavigation iki argüman (hedef hash) alır; true dönerse
     navigasyon iptal edilir ve kullanıcıya uyarı gösterilir. */
  var lastHash = location.hash || "#/feed";
  var guardReverting = false;
  function guardAndRender() {
    var nextHash = location.hash || "#/feed";
    if (guardReverting) { guardReverting = false; lastHash = nextHash; return; }
    if (lastHash !== null && nextHash !== lastHash && DZ.app && DZ.app.guardNavigation) {
      var blocked = DZ.app.guardNavigation(nextHash, lastHash);
      if (blocked) {
        guardReverting = true;
        location.hash = lastHash;
        return;
      }
    }
    lastHash = nextHash;
    scheduleRender();
  }

  /* Route bazlı scroll hafızası: detaya girip feed'e dönünce kaydırma
     konumu korunur (BUG-6). */
  var scrollMemory = {};
  var lastKey = null;

  function routeKey(route) {
    return route.name + ":" + (route.params.handle || route.params.id || "") + ":" + (route.params.sub || "");
  }

  function doRender() {
    var route = parse();
    var handler = routes[route.name] || routes["feed"];
    var auth = DZ.store.isAuthed();

    /* Render öncesi mevcut sayfanın scroll'unu sakla */
    if (lastKey && window.scrollY > 0) scrollMemory[lastKey] = window.scrollY;

    var key = routeKey(route);

    /* Korunan sayfalar */
    var guarded = ["feed", "settings", "plush", "u", "rooms", "dms", "room", "dm"];
    if (!auth && guarded.indexOf(route.name) > -1 && route.name !== "auth") {
      if (location.hash !== "#/auth") { location.hash = "#/auth"; scheduleRender(); }
      return;
    }
    if (auth && route.name === "auth") {
      if (location.hash !== "#/feed") { location.hash = "#/feed"; scheduleRender(); }
      return;
    }

    handler(route.params);
    DZ.app.markNav(route.name, route.params);

    if (route.name === "feed" && scrollMemory[key] !== undefined) {
      var restore = scrollMemory[key];
      requestAnimationFrame(function () { window.scrollTo(0, restore); });
    } else {
      window.scrollTo(0, 0);
    }
    lastKey = key;
  }

  window.addEventListener("hashchange", guardAndRender);

  window.DZ.router = {
    current: current,
    navigate: navigate,
    render: render,
    parse: parse
  };
})();

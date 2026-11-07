/* ============================================================
   Plush Babies — Uygulama Çekirdeği
   Görünümler: auth, feed, plush, profile, settings
   Olaylar: event delegation (tıklama, form, klavye)
   ============================================================ */

(function () {
  var store, ui, router;
  var chat = null;
  var IMG_MAX = 2 * 1024 * 1024;
  var VIDEO_MAX = 25 * 1024 * 1024;
  var frozenFeedOrder = null;

  function $ (sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function view() { return $("#view"); }

  /* Eski/bozuk veriye karşı güvenli erişim */
  function plushLikes(plush) { return (plush && plush.interactions && plush.interactions.likes) || {}; }
  function plushOfs(plush) { return (plush && plush.interactions && plush.interactions.ofs) || {}; }
  function ofLikes(of) { return (of && of.interactions && of.interactions.likes) || {}; }
  function ofPofs(of) { return (of && of.interactions && of.interactions.pofs) || {}; }
  function pofLikes(pof) { return (pof && pof.interactions && pof.interactions.likes) || {}; }

  /* ================= PLUSH KARTI ================= */
  function plushActionsHtml(plush) {
    var me = store.me();
    var likes = plushLikes(plush);
    var ofs = plushOfs(plush);
    var liked = me && !!likes[me.id];
    var pockets = me && !!(me.pockets && me.pockets[plush.id]);
    return (
      "<div class='plush-actions'>" +
        "<button class='act act-like" + (liked ? " on" : "") + "' data-action='like' data-id='" + ui.esc(plush.id) + "' aria-label='Beğen' title='Beğen'>" +
          ui.icon("heart") + "<span class='count act-count'>" + ui.num(Object.keys(likes).length) + "</span>" +
        "</button>" +
        "<button class='act act-of' data-action='open-plush' data-id='" + ui.esc(plush.id) + "' aria-label='Öfle' title='Öfler'>" +
          ui.icon("of") + "<span class='count act-count'>" + ui.num(Object.keys(ofs).length) + "</span>" +
        "</button>" +
        "<button class='act act-pocket" + (pockets ? " on" : "") + "' data-action='pocket' data-id='" + ui.esc(plush.id) + "' aria-label='Ceple' title='Ceple'>" +
          ui.icon("pocket") + "</button>" +
      "</div>"
    );
  }

  function plushCardHtml(plush, opts) {
    opts = opts || {};
    var author = store.getUser(plush.meta.authorId) || { profile: { name: "Silinmiş", handle: "silindi" } };
    var media = plush.content && plush.content.image
      ? "<a href='#/plush/" + ui.esc(plush.id) + "' data-action='open-plush' data-id='" + ui.esc(plush.id) + "' class='plush-media'><img src='" + ui.esc(plush.content.image) + "' alt='Plush görseli' loading='lazy'></a>"
      : "";
    var menuBtn = opts.noMenu ? "" :
      "<button class='icon-btn plush-menu' data-action='plush-menu' data-id='" + ui.esc(plush.id) + "' aria-label='Plush menüsü' title='Daha fazla'>" +
        ui.icon("dots") + "</button>";

    return (
      "<article class='plush' data-plush-id='" + ui.esc(plush.id) + "'>" +
        "<div class='plush-head'>" +
          "<a href='#/u/" + ui.esc(author.profile.handle) + "' class='plush-author' data-nav-user='" + ui.esc(author.id) + "'>" +
            ui.avatarHtml(author, "avatar-lg") +
            "<div class='plush-author-meta'>" +
              "<span class='plush-author-name'>" + ui.esc(author.profile.name) + ui.verifiedHtml(author) + "</span>" +
              "<span class='plush-author-handle'>@" + ui.esc(author.profile.handle) + "</span>" +
            "</div>" +
          "</a>" +
          "<a href='#/plush/" + ui.esc(plush.id) + "' class='plush-time' data-action='open-plush' data-id='" + ui.esc(plush.id) + "'>" + ui.esc(ui.timeAgo(plush.meta.createdAt)) + "</a>" +
          menuBtn +
        "</div>" +
        "<div class='plush-body' data-action='open-plush' data-id='" + ui.esc(plush.id) + "'>" + ui.esc(plush.content.text) + "</div>" +
        media +
        plushActionsHtml(plush) +
      "</article>"
    );
  }

  /* ================= YORUMLAR ================= */
  function pofItemHtml(plush, of, pof) {
    var author = store.getUser(pof.meta.authorId) || { profile: { name: "Silinmiş", handle: "silindi" } };
    var me = store.me();
    var likes = pofLikes(pof);
    var liked = me && !!likes[me.id];
    var canDel = me && pof.meta.authorId === me.id;
    return (
      "<div class='pof'>" +
        "<a href='#/u/" + ui.esc(author.profile.handle) + "' data-nav-user='" + ui.esc(author.id) + "'>" + ui.avatarHtml(author, "avatar-sm") + "</a>" +
        "<div class='pof-body'>" +
          "<div class='pof-head'>" +
            "<a href='#/u/" + ui.esc(author.profile.handle) + "' class='of-author' data-nav-user='" + ui.esc(author.id) + "'>" + ui.esc(author.profile.name) + ui.verifiedHtml(author) + "</a>" +
            "<span class='of-handle'>@" + ui.esc(author.profile.handle) + "</span>" +
            "<span class='of-time'>" + ui.esc(ui.timeAgo(pof.meta.createdAt)) + "</span>" +
          "</div>" +
          "<div class='pof-text'>" + ui.esc(pof.content.text) + "</div>" +
          "<div class='of-foot'>" +
            "<button class='pof-like" + (liked ? " on" : "") + "' data-action='pof-like' data-plush='" + ui.esc(plush.id) + "' data-of='" + ui.esc(of.id) + "' data-pof='" + ui.esc(pof.id) + "'>" +
              ui.icon("heart") + "<span>" + ui.num(Object.keys(likes).length) + "</span></button>" +
            (canDel
              ? "<button class='icon-btn item-menu' data-action='pof-menu' data-plush='" + ui.esc(plush.id) + "' data-of='" + ui.esc(of.id) + "' data-pof='" + ui.esc(pof.id) + "' aria-label='Pöf menüsü' title='Daha fazla'>" + ui.icon("dots") + "</button>"
              : "") +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function ofItemHtml(plush, of) {
    var author = store.getUser(of.meta.authorId) || { profile: { name: "Silinmiş", handle: "silindi" } };
    var me = store.me();
    var likes = ofLikes(of);
    var pofs = ofPofs(of);
    var liked = me && !!likes[me.id];
    var canDel = me && of.meta.authorId === me.id;
    var pofsHtml = Object.keys(pofs)
      .map(function (rid) { return pofs[rid]; })
      .sort(function (a, b) { return a.meta.createdAt - b.meta.createdAt; })
      .map(function (pof) { return pofItemHtml(plush, of, pof); })
      .join("");
    return (
      "<div class='of' data-of-id='" + ui.esc(of.id) + "'>" +
        "<a href='#/u/" + ui.esc(author.profile.handle) + "' data-nav-user='" + ui.esc(author.id) + "'>" + ui.avatarHtml(author, "avatar-md") + "</a>" +
        "<div class='of-body'>" +
          "<div class='of-head'>" +
            "<a href='#/u/" + ui.esc(author.profile.handle) + "' class='of-author' data-nav-user='" + ui.esc(author.id) + "'>" + ui.esc(author.profile.name) + ui.verifiedHtml(author) + "</a>" +
            "<span class='of-handle'>@" + ui.esc(author.profile.handle) + "</span>" +
            "<span class='of-time'>" + ui.esc(ui.timeAgo(of.meta.createdAt)) + "</span>" +
          "</div>" +
          "<div class='of-text'>" + ui.esc(of.content.text) + "</div>" +
          "<div class='of-foot'>" +
            "<button class='of-like" + (liked ? " on" : "") + "' data-action='of-like' data-plush='" + ui.esc(plush.id) + "' data-of='" + ui.esc(of.id) + "'>" +
              ui.icon("heart") + "<span>" + ui.num(Object.keys(likes).length) + "</span></button>" +
            "<button class='pof-toggle' data-action='pof-toggle' data-of='" + ui.esc(of.id) + "'>Pöfle</button>" +
            (canDel
              ? "<button class='icon-btn item-menu' data-action='of-menu' data-plush='" + ui.esc(plush.id) + "' data-of='" + ui.esc(of.id) + "' aria-label='Öf menüsü' title='Daha fazla'>" + ui.icon("dots") + "</button>"
              : "") +
          "</div>" +
          (pofsHtml ? "<div class='pofs' data-of-pofs='" + ui.esc(of.id) + "'>" + pofsHtml + "</div>" : "") +
          "<div class='pof-form hidden' data-pof-form='" + ui.esc(of.id) + "'>" +
            "<input type='text' maxlength='" + DZ.POF_MAX_LENGTH + "' placeholder='Pöf yaz…'>" +
            "<button class='btn btn-sm btn-soft' data-action='pof-submit' data-plush='" + ui.esc(plush.id) + "' data-of='" + ui.esc(of.id) + "'>" + ui.icon("send") + "</button>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function ofsListHtml(plush) {
    var ofs = plushOfs(plush);
    return Object.keys(ofs)
      .map(function (cid) { return ofs[cid]; })
      .sort(function (a, b) { return a.meta.createdAt - b.meta.createdAt; })
      .map(function (of) { return ofItemHtml(plush, of); })
      .join("");
  }

  /* ================= AKIŞ ================= */
  function composerHtml() {
    var me = store.me();
    return (
      "<div class='composer'>" +
        "<div class='composer-top'>" +
          "<a href='#/u/" + ui.esc(me.profile.handle) + "' data-nav-user='" + ui.esc(me.id) + "'>" + ui.avatarHtml(me, "avatar-lg") + "</a>" +
          "<div class='composer-body'>" +
            "<textarea class='composer-input' id='composerText' maxlength='" + DZ.PLUSH_MAX_LENGTH + "' placeholder='Ne plushlamak istersin?'></textarea>" +
            "<div class='composer-preview hidden' id='composerPreview'></div>" +
          "</div>" +
        "</div>" +
        "<div class='composer-foot'>" +
          "<div class='composer-count' id='composerCount'>0 / " + DZ.PLUSH_MAX_LENGTH + "</div>" +
          "<div style='display:flex;gap:12px'>" +
            "<label class='media-btn'>" + ui.icon("image") + "<span>Görsel</span><input type='file' accept='image/*' class='hidden' id='composerImg'></label>" +
            "<button class='btn btn-accent' id='btnComposerPlush'>Plushla</button>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function renderFeed() {
    var authed = store.isAuthed();
    if (!authed) { router.navigate("#/auth"); return; }

    var plushes = store.feedPlushes();
    if (frozenFeedOrder && frozenFeedOrder.length) {
      var known = plushes.filter(function (p) { return frozenFeedOrder.indexOf(p.id) > -1; });
      var fresh = plushes.filter(function (p) { return frozenFeedOrder.indexOf(p.id) === -1; });
      known.sort(function (a, b) { return frozenFeedOrder.indexOf(a.id) - frozenFeedOrder.indexOf(b.id); });
      plushes = fresh.concat(known);
    }
    frozenFeedOrder = plushes.map(function (p) { return p.id; });

    var list = plushes.length
      ? plushes.map(function (p) { return plushCardHtml(p); }).join("")
      : "<div class='empty-state'>" + ui.icon("home") + "<h3>Şamata henüz kıpırdamıyor</h3>" +
        "<p>İlk plushunu plushla ya da takip ettiklerinin şamatasına göz at.</p></div>";

    view().innerHTML =
      composerHtml() +
      "<div class='feed'>" + list + "</div>";

    bindComposer();
  }

  /* ================= PLUSH DETAYI ================= */
  function renderPlush(id) {
    var plush = store.getPlush(id);
    if (!plush) {
      view().innerHTML = "<div class='empty-state'>" + ui.icon("warn") + "<h3>Plush bulunamadı</h3><p>Bu plush silinmiş ya da hiç var olmamış.</p><a class='btn btn-accent' href='#/feed'>Şamataya dön</a></div>";
      return;
    }
    var author = store.getUser(plush.meta.authorId) || { profile: { name: "Silinmiş", handle: "silindi" } };
    var media = plush.content && plush.content.image
      ? "<div class='plush-media' data-action='open-image' data-id='" + ui.esc(plush.id) + "'><img src='" + ui.esc(plush.content.image) + "' alt='Plush görseli'></div>"
      : "";
    var menuBtn = "<button class='icon-btn plush-menu' data-action='plush-menu' data-id='" + ui.esc(plush.id) + "' aria-label='Plush menüsü' title='Daha fazla'>" + ui.icon("dots") + "</button>";

    view().innerHTML =
      "<a href='#/feed' class='back-link'>" + ui.icon("back") + "<span>Şamataya dön</span></a>" +
      "<article class='plush plush-detail' data-plush-id='" + ui.esc(plush.id) + "'>" +
        "<div class='plush-head'>" +
          "<a href='#/u/" + ui.esc(author.profile.handle) + "' class='plush-author' data-nav-user='" + ui.esc(author.id) + "'>" +
            ui.avatarHtml(author, "avatar-lg") +
            "<div class='plush-author-meta'>" +
              "<span class='plush-author-name'>" + ui.esc(author.profile.name) + ui.verifiedHtml(author) + "</span>" +
              "<span class='plush-author-handle'>@" + ui.esc(author.profile.handle) + "</span>" +
            "</div>" +
          "</a>" +
          "<span class='plush-time'>" + ui.esc(ui.timeAgo(plush.meta.createdAt)) + "</span>" +
          menuBtn +
        "</div>" +
        "<div class='plush-body'>" + ui.esc(plush.content.text) + "</div>" +
        media +
        plushActionsHtml(plush) +
        "<div class='ofs-section' id='ofsSection'>" +
          "<div class='ofs-head'><h3>Öfler (" + ui.num(Object.keys(plushOfs(plush)).length) + ")</h3></div>" +
          ofFormHtml(plush) +
          "<div class='of-list' id='ofList'>" + ofsListHtml(plush) + "</div>" +
        "</div>" +
      "</article>";
  }

  function ofFormHtml(plush) {
    var me = store.me();
    if (!me) return "";
    return (
      "<form class='of-form' data-form='of' data-of-form='" + ui.esc(plush.id) + "'>" +
        "<a href='#/u/" + ui.esc(me.profile.handle) + "' data-nav-user='" + ui.esc(me.id) + "'>" + ui.avatarHtml(me, "avatar-md") + "</a>" +
        "<textarea class='textarea' name='text' maxlength='" + DZ.OF_MAX_LENGTH + "' placeholder='Bir öf yaz…' required></textarea>" +
        "<button class='btn btn-accent' type='submit'>" + ui.icon("send") + "</button>" +
      "</form>"
    );
  }

  /* Pöf ekleme: tüm listeyi yeniden çizmeden yalnızca ilgili öfün pöf
     bölümüne ekler; açık form ve odak korunur (BUG-5). */
  function appendPof(plush, of, pof) {
    var box = document.querySelector("[data-of-pofs='" + of.id + "']");
    if (box) {
      box.insertAdjacentHTML("beforeend", pofItemHtml(plush, of, pof));
    } else {
      var form = document.querySelector("[data-pof-form='" + of.id + "']");
      var container = document.createElement("div");
      container.className = "pofs";
      container.setAttribute("data-of-pofs", of.id);
      container.innerHTML = pofItemHtml(plush, of, pof);
      if (form && form.parentNode) form.parentNode.insertBefore(container, form);
    }
  }

  function updateOfCount(plushId) {
    var head = $(".ofs-head h3");
    if (!head) return;
    var plush = store.getPlush(plushId);
    if (plush) head.textContent = "Öfler (" + Object.keys(plushOfs(plush)).length + ")";
  }

  /* ================= PROFİL ================= */
  function renderProfile(handle, tab) {
    var user = store.getUserByHandle(handle);
    if (!user) {
      view().innerHTML = "<div class='empty-state'>" + ui.icon("search") + "<h3>Vitrin bulunamadı</h3><p>Bu vitrin boş ya da hiç açılmamış.</p><a class='btn btn-accent' href='#/feed'>Şamataya dön</a></div>";
      return;
    }

    var me = store.me();
    var isMe = me && me.id === user.id;
    var following = store.isFollowing(user.id);
    tab = tab === "pockets" ? "pockets" : "plushes";

    var followBtn = isMe
      ? "<a class='btn btn-ghost' href='#/settings'>Vitrini düzenle</a>"
      : "<button class='btn " + (following ? "btn-ghost" : "btn-accent") + "' data-action='follow' data-id='" + ui.esc(user.id) + "'>" +
        (following ? "Takip Ediliyor" : "Takip Et") + "</button>";

    var messageBtn = isMe
      ? ""
      : "<button class='btn btn-soft' data-action='dm-user' data-id='" + ui.esc(user.id) + "' title='Mesaj Gönder'>" + ui.icon("send") + "<span>Mesaj Gönder</span></button>";

    var banner = user.profile.banner
      ? "<div class='profile-banner'><img src='" + ui.esc(user.profile.banner) + "' alt='Kapak görseli'></div>"
      : "<div class='profile-banner'></div>";

    var plushes = store.getUserPlushes(user.id);
    var pockets = isMe ? store.pocketsPlushes() : [];
    var list = tab === "pockets" ? pockets : plushes;

    var tabs = isMe
      ? "<div class='filter-tabs'>" +
          "<a href='#/u/" + ui.esc(user.profile.handle) + "' class='filter-tab" + (tab === "plushes" ? " active" : "") + "'>Plushlar</a>" +
          "<a href='#/u/" + ui.esc(user.profile.handle) + "/pockets' class='filter-tab" + (tab === "pockets" ? " active" : "") + "'>Cebe Atılanlar</a>" +
        "</div>"
      : "";

    var listHtml = list.length
      ? "<div class='profile-plushes'>" + list.map(function (p) { return plushCardHtml(p); }).join("") + "</div>"
      : (tab === "pockets"
        ? "<div class='empty-state'>" + ui.icon("pocket") + "<h3>Cebinde plush yok</h3><p>Beğendiğin plushları buradan tekrar bulabilirsin.</p></div>"
        : "<div class='empty-state'>" + ui.icon("home") + "<h3>Vitrin henüz boş</h3><p>" + ui.esc(user.profile.name) + " henüz hiçbir plush plushlamamış.</p></div>");

    view().innerHTML =
      "<section class='profile'>" +
        "<div class='profile-hero'>" +
          banner +
          "<div class='profile-main'>" +
            "<div class='profile-avatar-row'>" +
              "<div class='profile-avatar avatar " + ui.esc((user.profile.avatar && user.profile.avatar.color) || "c0") + "'>" + (user.profile.avatar && user.profile.avatar.img ? "<img src='" + ui.esc(user.profile.avatar.img) + "' alt=''>" : ui.esc((user.profile.name || "?").charAt(0).toUpperCase())) + "</div>" +
              followBtn +
              messageBtn +
            "</div>" +
            "<div>" +
              "<h1 class='profile-name'>" + ui.esc(user.profile.name) + ui.verifiedHtml(user) + "</h1>" +
              "<div class='profile-handle'>@" + ui.esc(user.profile.handle) + "</div>" +
            "</div>" +
            (user.profile.bio ? "<p class='profile-bio'>" + ui.esc(user.profile.bio) + "</p>" : "") +
            "<div class='profile-stats'>" +
              "<span class='stat-chip'><span class='num'>" + ui.num(plushes.length) + "</span> Plush</span>" +
              "<span class='stat-chip'><span class='num'>" + ui.num(Object.keys(user.following || {}).length) + "</span> Takip</span>" +
              "<span class='stat-chip'><span class='num'>" + ui.num(Object.keys(user.followers || {}).length) + "</span> Takipçi</span>" +
            "</div>" +
            "<div class='profile-joined'>" + ui.icon("calendar") + "<span>Katılım: " + ui.esc(ui.joinedDate(user.profile.joined)) + "</span></div>" +
          "</div>" +
        "</div>" +
        tabs +
        listHtml +
      "</section>";
  }

  /* ================= CHAT — ODA LİSTESİ ================= */
  var EMOJIS = ["😀","😂","🥰","😍","😎","🤔","😭","😡","👍","👎","👏","🙏","❤️","🔥","🎉","✨","💯","😴","🤗","😅","🧸","🐻","🐰","🦄","🌈","⭐","🍼","💖"];

  function roomHasUnread(r, uid) {
    var msgs = r.messages || {};
    var keys = Object.keys(msgs);
    if (!keys.length) return false;
    var last = null;
    keys.forEach(function (k) { if (!last || msgs[k].createdAt > last.createdAt) last = msgs[k]; });
    if (!last || last.authorId === uid) return false;
    var meMem = r.members && r.members[uid];
    return !!(meMem && meMem.lastRead !== last.id);
  }

  function roomCardHtml(r) {
    var me = store.me();
    var voice = r.meta.type === "voice";
    var isPublic = r.meta.privacy === "public";
    return (
      "<a class='room-card' href='#/room/" + ui.esc(r.id) + "'>" +
        "<div class='room-card-icon'>" + ui.icon(voice ? "mic" : "chat") + "</div>" +
        "<div class='room-card-meta'>" +
          "<strong>" + ui.esc(r.meta.name) + "</strong>" +
          "<span>" + (isPublic ? "<span class='privacy-badge'>Açık</span> " : "") + (voice ? "Ses odası" : "Metin odası") + " · " + ui.num(Object.keys(r.members || {}).length) + " üye</span>" +
          (r.meta.description ? "<span class='room-card-desc'>" + ui.esc(r.meta.description) + "</span>" : "") +
        "</div>" +
        (me && roomHasUnread(r, me.id) ? "<span class='chat-unread'>yeni</span>" : "") +
      "</a>"
    );
  }

  /* T10: profili silinmiş karşı taraf için "hayalet" kullanıcı — DM yine de
     açılır, kullanıcı konuşmayı görüp silebilir. */
  function userOrGhost(uid) {
    return store.getUser(uid) || { id: uid, profile: { handle: "", name: "Silinmiş kullanıcı" } };
  }

  /* U6/U7: DM kartı — son mesaj zamanı + okundu (✓✓) rozeti. */
  function dmCardHtml(d) {
    var u = userOrGhost(d.otherUid);
    var read = !d.unread && !!d.lastMsgId && d.otherRead === d.lastMsgId;
    return (
      "<a href='#/dm/" + ui.esc(d.dmId) + "' class='room-card dm-card'>" +
        ui.avatarHtml(u, "avatar-lg") +
        "<div class='room-card-meta'><strong>" + ui.esc(u.profile.name) + "</strong>" +
          "<span>" + ui.esc(dmPreview(d)) + "</span>" +
          (d.lastAt ? "<span class='dm-time'>" + ui.esc(ui.timeAgo(d.lastAt)) + "</span>" : "") +
        "</div>" +
        (read ? "<span class='dm-read' title='Okundu'>✓✓</span>" : (d.unread ? "<span class='chat-unread'>yeni</span>" : "")) +
      "</a>"
    );
  }

  /* U2: #/dms route'u — yalnızca DM listesi görünümü. */
  function renderDmsTab(dms) {
    var dmRows = dms;
    var rowsHtml = dmRows.length
      ? dmRows.map(dmCardHtml).join("")
      : "<div class='empty-state'>" + ui.icon("chat") + "<h3>Henüz mesajın yok</h3><p>Bir kullanıcının profilinden ya da aşağıdaki butondan yeni mesaj başlatabilirsin.</p>" +
        "<button class='btn btn-accent' data-action='new-dm'>" + ui.icon("plus") + "<span>Yeni Mesaj</span></button></div>";
    view().innerHTML =
      "<div class='rooms-page'>" +
        "<header class='page-head'>" +
          "<h1>Mesajlar</h1>" +
          "<button class='btn btn-accent' data-action='new-dm'>" + ui.icon("plus") + "<span>Yeni Mesaj</span></button>" +
        "</header>" +
        "<div class='chat-section'>" + rowsHtml + "</div>" +
      "</div>";
  }

  function renderRooms(tab) {
    var authed = store.isAuthed();
    if (!authed) { router.navigate("#/auth"); return; }

    var me = store.me();
    if (!me) return;

    /* U5: ilk snapshot'lar gelmeden yanlış "Henüz odan yok" boş flaşı basma. */
    if (chat.hasError()) {
      view().innerHTML = "<div class='empty-state'>" + ui.icon("warn") + "<h3>Veriler yüklenemedi</h3><p>Bağlantı sorunu oluştu. Tekrar dene.</p><button class='btn btn-accent' data-action='retry-chat'>Yeniden Dene</button></div>";
      return;
    }
    if (!chat.isLoaded()) {
      view().innerHTML = "<div class='chat-loading'>" + ui.icon("chat") + "<p>Odalar yükleniyor…</p></div>";
      return;
    }

    var all = chat.getRooms();
    var invites = chat.myInvites();
    var dms = chat.dmList();

    if (tab === "dm") { renderDmsTab(dms); return; }

    var inviteRoomIds = {};
    invites.forEach(function (inv) { if (inv.roomId) inviteRoomIds[inv.roomId] = true; });

    var memberRooms = [];
    var publicRooms = [];
    all.forEach(function (r) {
      if (inviteRoomIds[r.id] && !chat.isMember(r.id, me.id)) return;
      if (chat.isMember(r.id, me.id)) memberRooms.push(r);
      else if (r.meta && r.meta.privacy === "public") publicRooms.push(r);
    });

    var roomsHtml = memberRooms.length
      ? memberRooms.map(function (r) { return roomCardHtml(r); }).join("")
      : "<div class='empty-state'>" + ui.icon("chat") + "<h3>Henüz odan yok</h3><p>Bir oda oluştur ya da davetlerini bekle.</p>" +
        "<button class='btn btn-accent' data-action='new-room'>Yeni oda oluştur</button></div>";

    var publicHtml = publicRooms.length
      ? "<div class='chat-section'>" +
          "<h2 class='rail-title'>Açık Odalar (" + ui.num(publicRooms.length) + ")</h2>" +
          publicRooms.map(function (r) { return roomCardHtml(r); }).join("") +
        "</div>"
      : "";

    var dmRows = dms;

    /* U8: Mesajlar bölümü her zaman görünür ve "Yeni Mesaj" CTA'sı taşır. */
    var dmsHtml = "<div class='chat-section'>" +
        "<div class='rail-title-row'>" +
          "<h2 class='rail-title'>Mesajlar (" + ui.num(dmRows.length) + ")</h2>" +
          "<button class='btn btn-sm btn-accent' data-action='new-dm'>" + ui.icon("plus") + "<span>Yeni Mesaj</span></button>" +
        "</div>" +
        (dmRows.length
          ? dmRows.map(dmCardHtml).join("")
          : "<div class='empty-state'>" + ui.icon("chat") + "<h3>Henüz mesajın yok</h3><p>Bir kullanıcının profilinden ya da aşağıdaki butondan yeni mesaj başlatabilirsin.</p>" +
            "<button class='btn btn-accent' data-action='new-dm'>" + ui.icon("plus") + "<span>Yeni Mesaj</span></button></div>") +
      "</div>";

    var invitesHtml = invites.length
      ? "<div class='chat-section'>" +
          "<h2 class='rail-title'>Davetler</h2>" +
          invites.map(function (inv) {
            var r = inv.room;
            /* U12: oda verisi henüz cache'e gelmediyse iskelet satır göster. */
            if (!r) {
              return "<div class='invite-row invite-loading'><div class='invite-icon'>" + ui.icon("chat") + "</div><div class='invite-meta'><strong>Davet yükleniyor…</strong></div></div>";
            }
            return (
              "<div class='invite-row'>" +
                "<div class='invite-icon'>" + ui.icon(r.meta.type === "voice" ? "mic" : "chat") + "</div>" +
                "<div class='invite-meta'><strong>" + ui.esc(r.meta.name) + "</strong><span>" + (r.meta.type === "voice" ? "Ses odası" : "Metin odası") + "</span></div>" +
                "<button class='btn btn-sm btn-accent' data-action='accept-invite' data-id='" + ui.esc(r.id) + "'>Kabul</button>" +
                "<button class='btn btn-sm btn-ghost' data-action='decline-invite' data-id='" + ui.esc(r.id) + "'>Reddet</button>" +
              "</div>"
            );
          }).join("") +
        "</div>"
      : "";

    view().innerHTML =
      "<div class='rooms-page'>" +
        "<header class='page-head'>" +
          "<h1>Odalarım</h1>" +
          "<button class='btn btn-accent' data-action='new-room'>" + ui.icon("plus") + "<span>Yeni Oda</span></button>" +
        "</header>" +
        invitesHtml +
        dmsHtml +
        "<div class='chat-section'>" +
          "<h2 class='rail-title'>Odalarım (" + ui.num(memberRooms.length) + ")</h2>" +
          roomsHtml +
        "</div>" +
        publicHtml +
      "</div>";
  }

  /* U8: yeni DM başlatma — kullanıcı seçme modalı. */
  function openNewDmModal() {
    var me = store.me();
    if (!me) return;
    var candidates = store.usersList().filter(function (u) {
      return u && u.profile && u.id !== me.id;
    });
    var listHtml = candidates.length
      ? candidates.map(function (u) {
          return "<button class='user-pick' data-action='new-dm-pick' data-id='" + ui.esc(u.id) + "'>" +
            ui.avatarHtml(u, "avatar-md") +
            "<span class='user-pick-id'><strong>" + ui.esc(u.profile.name) + "</strong><small>@" + ui.esc(u.profile.handle) + "</small></span>" +
          "</button>";
        }).join("")
      : "<p class='form-note'>Henüz başka kullanıcı bulunmuyor.</p>";
    ui.openModal(
      "<div class='modal-head'><h2>Yeni Mesaj</h2>" +
      "<button class='icon-btn' data-action='modal-close' aria-label='Kapat'>" + ui.icon("imageX") + "</button></div>" +
      "<div class='user-pick-list'>" + listHtml + "</div>"
    );
  }

  /* K10/U9: startDm sonucuna göre yönlendirme; hedef yoksa/başarısızsa toast. */
  function startDmAndNavigate(targetId) {
    var me = store.me();
    if (!targetId || !me) return;
    if (targetId === me.id) { ui.toast("Kendine mesaj gönderemezsin.", "err"); return; }
    var dmId = chat.startDm(targetId, function (id, ok) {
      if (ok && id) router.navigate("#/dm/" + id);
      else ui.toast("Mesaj başlatılamadı.", "err");
    });
    if (!dmId) ui.toast("Mesaj başlatılamadı.", "err");
  }

  function openNewRoomModal() {
    var me = store.me();
    if (!me) { router.navigate("#/auth"); return; }
    ui.openModal(
      "<div class='modal-head'><h2>Yeni Oda</h2>" +
      "<button class='icon-btn' data-action='modal-close' aria-label='Kapat'>" + ui.icon("imageX") + "</button></div>" +
      "<form class='settings-form' data-form='room-create'>" +
        "<div class='field'><label for='roomName'>Oda adı</label><input class='input' id='roomName' maxlength='40' placeholder='Örn. Plush Sohbet' required></div>" +
        "<div class='field'><label for='roomDesc'>Açıklama (isteğe bağlı)</label><input class='input' id='roomDesc' maxlength='160' placeholder='Ne konuşulur?'></div>" +
        "<div class='field'><label for='roomPrivacy'>Gizlilik</label>" +
          "<select class='input' id='roomPrivacy'><option value='public' selected>Açık — herkes görebilir ve katılabilir</option><option value='private'>Özel — davet ile katılım</option></select>" +
        "</div>" +
        "<div class='settings-actions'><button class='btn btn-accent btn-lg' type='submit'>Odayı Oluştur</button></div>" +
      "</form>"
    );
    setTimeout(function () { var n = $("#roomName"); if (n) n.focus(); }, 60);
  }

  /* U10: oda ayarları — ad/açıklama/gizlilik düzenleme modalı. */
  function openEditRoomModal(roomId) {
    var me = store.me();
    var room = chat.getRoom(roomId);
    if (!me || !room || !chat.isOwner(roomId, me.id)) return;
    ui.openModal(
      "<div class='modal-head'><h2>Oda Düzenle</h2>" +
      "<button class='icon-btn' data-action='modal-close' aria-label='Kapat'>" + ui.icon("imageX") + "</button></div>" +
      "<form class='settings-form' data-form='room-edit' data-id='" + ui.esc(roomId) + "'>" +
        "<div class='field'><label for='roomEditName'>Oda adı</label><input class='input' id='roomEditName' maxlength='40' value='" + ui.esc(room.meta.name) + "' required></div>" +
        "<div class='field'><label for='roomEditDesc'>Açıklama</label><input class='input' id='roomEditDesc' maxlength='160' value='" + ui.esc(room.meta.description || "") + "'></div>" +
        "<div class='field'><label for='roomEditPrivacy'>Gizlilik</label>" +
          "<select class='input' id='roomEditPrivacy'>" +
            "<option value='public'" + (room.meta.privacy === "public" ? " selected" : "") + ">Açık — herkes görebilir ve katılabilir</option>" +
            "<option value='private'" + (room.meta.privacy === "private" ? " selected" : "") + ">Özel — davet ile katılım</option>" +
          "</select>" +
        "</div>" +
        "<div class='settings-actions'><button class='btn btn-accent btn-lg' type='submit'>Kaydet</button></div>" +
      "</form>"
    );
    setTimeout(function () { var n = $("#roomEditName"); if (n) n.focus(); }, 60);
  }

  function openInviteModal(roomId) {
    var room = chat.getRoom(roomId);
    if (!room) return;
    var me = store.me();
    if (!me) return;
    var memberSet = {}, inviteSet = {};
    chat.roomMembers(roomId).forEach(function (m) { memberSet[m.uid] = true; });
    chat.roomInvites(roomId).forEach(function (i) { inviteSet[i.uid] = true; });

    var candidates = store.usersList().filter(function (u) {
      return u && u.profile && u.id !== me.id && !memberSet[u.id] && !inviteSet[u.id];
    });

    var listHtml = candidates.length
      ? candidates.map(function (u) {
          return (
            "<div class='invite-pick'>" +
              ui.avatarHtml(u, "avatar-sm") +
              "<div class='invite-pick-meta'><strong>" + ui.esc(u.profile.name) + "</strong><span>@" + ui.esc(u.profile.handle) + "</span></div>" +
              "<button class='btn btn-sm btn-soft' data-action='invite-send' data-room='" + ui.esc(roomId) + "' data-uid='" + ui.esc(u.id) + "'>Davet Et</button>" +
            "</div>"
          );
        }).join("")
      : "<div class='empty-state'>" + ui.icon("users") + "<h3>Davet edilecek kullanıcı yok</h3><p>Odadaki herkesi davet etmişsin ya da başka kullanıcı bulunmuyor.</p></div>";

    ui.openModal(
      "<div class='modal-head'><h2>Üye Davet Et</h2>" +
      "<button class='icon-btn' data-action='modal-close' aria-label='Kapat'>" + ui.icon("imageX") + "</button></div>" +
      "<p class='modal-text'>" + ui.esc(room.meta.name) + " odasına kimleri davet edelim?</p>" +
      "<div class='invite-pick-list'>" + listHtml + "</div>"
    );
  }

  function confirmDeleteRoom(roomId) {
    var room = chat.getRoom(roomId);
    if (!room) return;
    ui.openModal(
      "<div class='confirm-icon'>" + ui.icon("trash") + "</div>" +
      "<div class='modal-head' style='justify-content:center'><h2>Odayı sil?</h2></div>" +
      "<p class='form-note' style='text-align:center'>" + ui.esc(room.meta.name) + " odası ve tüm mesajları silinecek. Bu işlem geri alınamaz.</p>" +
      "<div class='confirm-actions'>" +
        "<button class='btn btn-danger btn-block' data-action='delete-room' data-id='" + ui.esc(roomId) + "'>Evet, Sil</button>" +
        "<button class='btn btn-ghost btn-block' data-action='modal-close'>Vazgeç</button>" +
      "</div>"
    );
  }

  function confirmDeleteDm(dmId) {
    var me = store.me();
    if (!me || !chat.getDm(dmId)) return;
    ui.openModal(
      "<div class='confirm-icon'>" + ui.icon("trash") + "</div>" +
      "<div class='modal-head' style='justify-content:center'><h2>Konuşmayı sil?</h2></div>" +
      "<p class='form-note' style='text-align:center'>Konuşma yalnızca senin tarafından silinir, karşı taraftan silinmez.</p>" +
      "<div class='confirm-actions'>" +
        "<button class='btn btn-danger btn-block' data-action='delete-dm' data-id='" + ui.esc(dmId) + "'>Evet, Sil</button>" +
        "<button class='btn btn-ghost btn-block' data-action='modal-close'>Vazgeç</button>" +
      "</div>"
    );
  }

  /* ================= CHAT — ODA / DM GÖRÜNÜMÜ ================= */
  function msgMediaHtml(m) {
    if (m.type === "image" || m.type === "gif") {
      return "<div class='msg-media'><img src='" + ui.esc(m.mediaUrl) + "' alt='' loading='lazy'></div>";
    }
    if (m.type === "video") {
      return "<div class='msg-media'><video src='" + ui.esc(m.mediaUrl) + "' controls playsinline></video></div>";
    }
    return "";
  }

  function msgItemHtml(m, scope, scopeId) {
    var me = store.me();
    var author = store.getUser(m.authorId) || { profile: { name: "Silinmiş", handle: "silindi" } };
    var mine = me && m.authorId === me.id;

    var body = "";
    if (m.type === "emoji") {
      body = "<div class='msg-emoji'>" + ui.esc(m.text) + "</div>";
    } else {
      if (m.mediaUrl) body += msgMediaHtml(m);
      if (m.text) body += "<div class='msg-text'>" + ui.esc(m.text) + "</div>";
    }

    var canDelete = scope === "dm"
      ? mine
      : (mine || (scope === "room" && me && (chat.isOwner(scopeId, me.id) || chat.isAdmin(scopeId, me.id))));

    var delBtn = canDelete
      ? "<button class='icon-btn msg-menu' data-action='msg-menu' data-scope='" + ui.esc(scope) + "' data-scopeid='" + ui.esc(scopeId) + "' data-id='" + ui.esc(m.id) + "' aria-label='Mesaj menüsü' title='Mesajı sil'>" + ui.icon("dots") + "</button>"
      : "";

    var status = "";
    if (scope === "dm" && mine) {
      var dm = chat.getDm(scopeId);
      var otherRead = dm && dm.otherRead;
      var otherMsg = otherRead && dm.messages ? dm.messages[otherRead] : null;
      var read = !!(otherRead && (m.id === otherRead || (otherMsg && m.createdAt <= otherMsg.createdAt)));
      status = "<span class='msg-status" + (read ? " read" : "") + "'>" + (read ? "✓✓" : "✓") + "</span>";
    }

    return (
      "<div class='msg" + (mine ? " mine" : "") + "' data-msg-id='" + ui.esc(m.id) + "'>" +
        "<a href='#/u/" + ui.esc(author.profile.handle) + "' data-nav-user='" + ui.esc(author.id) + "' class='msg-avatar'>" + ui.avatarHtml(author, "avatar-md") + "</a>" +
        "<div class='msg-body'>" +
          "<div class='msg-head'>" +
            "<a href='#/u/" + ui.esc(author.profile.handle) + "' class='msg-author' data-nav-user='" + ui.esc(author.id) + "'>" + ui.esc(author.profile.name) + ui.verifiedHtml(author) + "</a>" +
            "<span class='msg-time'>" + ui.esc(ui.timeAgo(m.createdAt)) + "</span>" +
            status +
          "</div>" +
          body +
          delBtn +
        "</div>" +
      "</div>"
    );
  }

  function roomMessagesHtml(roomId) {
    var msgs = chat.roomMessages(roomId);
    if (!msgs.length) {
      return "<div class='chat-empty'>" + ui.icon("chat") + "<p>Henüz mesaj yok. İlk mesajı sen gönder!</p></div>";
    }
    return msgs.map(function (m) { return msgItemHtml(m, "room", roomId); }).join("");
  }

  function dmMessagesHtml(dmId) {
    var msgs = chat.dmMessages(dmId);
    if (!msgs.length) {
      return "<div class='chat-empty'>" + ui.icon("chat") + "<p>Henüz mesaj yok. Merhaba de!</p></div>";
    }
    return msgs.map(function (m) { return msgItemHtml(m, "dm", dmId); }).join("");
  }

  function composerHtml(scope, scopeId) {
    return (
      "<div class='chat-composer' data-scope='" + ui.esc(scope) + "' data-scopeid='" + ui.esc(scopeId) + "'>" +
        "<div class='composer-tools'>" +
          "<button type='button' class='icon-btn chat-tool' data-action='chat-emoji-toggle' aria-label='Emoji' title='Emoji'>" + ui.icon("emoji") + "</button>" +
          "<label class='chat-tool chat-tool-file' title='Medya ekle'>" + ui.icon("paperclip") +
            "<input type='file' accept='image/*,video/mp4,video/quicktime' class='hidden chat-media-input'></label>" +
          "<div class='emoji-palette hidden' data-emoji-palette>" +
            EMOJIS.map(function (e) { return "<button type='button' class='emoji-cell' data-action='chat-emoji' data-emoji='" + ui.esc(e) + "'>" + ui.esc(e) + "</button>"; }).join("") +
          "</div>" +
          "<div class='chat-media-preview hidden' data-media-preview></div>" +
        "</div>" +
        "<div class='composer-row'>" +
          "<textarea class='chat-input' maxlength='2000' rows='1' placeholder='Mesaj yaz…'></textarea>" +
          "<button type='button' class='btn btn-accent chat-send-btn' data-action='chat-send'>" + ui.icon("send") + "</button>" +
        "</div>" +
      "</div>"
    );
  }

  function autosizeChatInput(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px"; /* chat-input max-height: var(--px-140) ile eşit */
  }

  function bindChatComposer(scope, scopeId) {
    var composer = document.querySelector(".chat-composer[data-scope='" + scope + "'][data-scopeid='" + scopeId + "']");
    if (!composer) return;
    var input = composer.querySelector(".chat-input");
    var mediaInput = composer.querySelector(".chat-media-input");
    var preview = composer.querySelector("[data-media-preview]");
    var typingT = null;

    if (input) {
      input.addEventListener("input", function () {
        autosizeChatInput(input);
        if (typingT) clearTimeout(typingT);
        typingT = setTimeout(function () { chat.setTyping(scope, scopeId); }, 2000);
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendChatFromComposer(composer);
        }
      });
    }
    if (mediaInput) {
      mediaInput.addEventListener("change", function () {
        var f = mediaInput.files && mediaInput.files[0];
        if (!f) return;
        uploadChatMedia(f, function (info) {
          preview.dataset.type = info.type;
          preview.dataset.mime = info.mime || "";
          preview.classList.remove("hidden");
          preview.innerHTML =
            (info.type === "video"
              ? "<video src='" + ui.esc(info.url) + "' controls></video>"
              : "<img src='" + ui.esc(info.url) + "' alt=''>") +
            "<button type='button' class='icon-btn chat-media-remove' data-action='chat-remove-media' aria-label='Kaldır'>" + ui.icon("imageX") + "</button>";
        }, function () {
          preview.removeAttribute("data-type");
          preview.removeAttribute("data-mime");
          preview.classList.add("hidden");
          preview.innerHTML = "";
        });
      });
    }
  }

  function sendChatFromComposer(composer) {
    /* K9: çift gönderim kilidi — gönderim sürerken tekrar Enter/tıklama yeni
       msgId üretip mükerrer mesaj yazamaz; buton da devre dışı kalır. */
    if (composer.dataset.sending === "1") return;
    var scope = composer.getAttribute("data-scope");
    var scopeId = composer.getAttribute("data-scopeid");
    var input = composer.querySelector(".chat-input");
    var sendBtn = composer.querySelector(".chat-send-btn");
    var preview = composer.querySelector("[data-media-preview]");
    var text = (input && input.value.trim()) || "";
    var mediaEl = preview && (preview.querySelector("img") || preview.querySelector("video"));
    var mediaSrc = mediaEl ? mediaEl.src : null;
    var mediaType = preview ? (preview.getAttribute("data-type") || "") : "";
    var mediaMime = preview ? (preview.getAttribute("data-mime") || "") : "";

    if (!text && !mediaSrc) { ui.toast("Mesaj boş olamaz.", "err"); if (input) input.focus(); return; }

    var sendType = mediaSrc ? mediaType : "text";
    var mime = mediaType === "video" ? (mediaMime || "video/mp4") : null;
    if (!mediaSrc && text.length > 0 && text.length <= 12 && !/[A-Za-z0-9çğıöşüÇĞİÖŞÜ]/.test(text)) sendType = "emoji";

    var data = { type: sendType, text: text, mediaUrl: mediaSrc, mime: mime };

    /* Optimistik temizleme: gönderim anında kullanıcı yazısı inputtan kalkar. */
    composer.dataset.sending = "1";
    if (sendBtn) sendBtn.disabled = true;
    if (input) { input.value = ""; autosizeChatInput(input); }
    if (preview) {
      preview.removeAttribute("data-type");
      preview.removeAttribute("data-mime");
      preview.innerHTML = "";
      preview.classList.add("hidden");
    }
    var pal = composer.querySelector("[data-emoji-palette]");
    if (pal) pal.classList.add("hidden");

    var done = function (ok) {
      composer.dataset.sending = "0";
      if (sendBtn) sendBtn.disabled = false;
      if (ok === false) {
        /* T5: gönderim başarısızsa yazılan metin input'a geri konur — kayıp yok. */
        if (input && text) { input.value = text; autosizeChatInput(input); }
        if (input) input.focus();
      }
    };

    var ok = scope === "room"
      ? chat.sendRoomMessage(scopeId, data, done)
      : chat.sendDmMessage(scopeId, data, done);
    if (ok === false) done(false);
  }

  var pendingRoomTimer = {};
  var pendingDmTimer = {};

  function renderRoom(roomId) {
    var me = store.me();
    var room = chat.getRoom(roomId);
    if (!room) {
      if (!pendingRoomTimer[roomId]) {
        pendingRoomTimer[roomId] = true;
        view().innerHTML = "<div class='chat-loading'>" + ui.icon("chat") + "<p>Oda yükleniyor…</p></div>";
        setTimeout(function () {
          pendingRoomTimer[roomId] = false;
          if (router.current().name === "room" && router.current().params.id === roomId) renderRoom(roomId);
        }, 400);
      } else {
        view().innerHTML = "<div class='empty-state'>" + ui.icon("warn") + "<h3>Oda bulunamadı</h3><p>Bu oda silinmiş ya da davetli değilsin.</p><a class='btn btn-accent' href='#/rooms'>Odalara dön</a></div>";
      }
      return;
    }
    if (!room.meta) {
      view().innerHTML = "<div class='empty-state'>" + ui.icon("warn") + "<h3>Oda verisi bozuk</h3><p>Bu oda eksik veri içeriyor.</p><a class='btn btn-accent' href='#/rooms'>Odalara dön</a></div>";
      return;
    }
    if (!chat.isMember(roomId, me.id)) {
      var pending = !!(room.invites && room.invites[me.id]);
      var isOpen = room.meta.privacy === "public";
      view().innerHTML =
        "<div class='empty-state'>" + ui.icon("users") + "<h3>Odaya katılmadın</h3><p>" +
        (pending
          ? "Bu odaya davetlisin, katılabilirsin."
          : isOpen
            ? "Bu oda herkese açık, katılabilirsin."
            : "Bu oda yalnızca davetlilere açık.") + "</p>" +
        (pending || isOpen
          ? "<div style='display:flex;gap:10px;justify-content:center;margin-top:16px'>" +
            (pending
              ? "<button class='btn btn-accent' data-action='accept-invite' data-id='" + ui.esc(roomId) + "'>Daveti Kabul Et</button>"
              : "<button class='btn btn-accent' data-action='join-room' data-id='" + ui.esc(roomId) + "'>Katıl</button>") +
            (pending
              ? "<button class='btn btn-ghost' data-action='decline-invite' data-id='" + ui.esc(roomId) + "'>Reddet</button>"
              : "") +
          "</div>"
          : "") +
        "</div>";
      return;
    }

    var voice = room.meta.type === "voice";
    var isOwner = chat.isOwner(roomId, me.id);

    view().innerHTML =
      "<div class='room-view'>" +
        "<header class='room-head'>" +
          "<a href='#/rooms' class='icon-btn' aria-label='Odalara dön' title='Odalara dön'>" + ui.icon("back") + "</a>" +
          "<div class='room-head-meta'>" +
            "<strong>" + ui.esc(room.meta.name) + "</strong>" +
            "<span>" + ui.icon(voice ? "mic" : "chat") + " " + (voice ? "Ses odası" : "Metin odası") + " · " + ui.num(Object.keys(room.members || {}).length) + " üye</span>" +
          "</div>" +
          (isOwner && room.meta.privacy === "private" && !voice
            ? "<button class='icon-btn' data-action='invite-members' data-id='" + ui.esc(roomId) + "' title='Üye davet et' aria-label='Üye davet et'>" + ui.icon("plus") + "</button>"
            : "") +
          "<button class='icon-btn' data-action='room-menu' data-id='" + ui.esc(roomId) + "' aria-label='Oda menüsü' title='Daha fazla'>" + ui.icon("dots") + "</button>" +
        "</header>" +
        "<div class='room-messages' id='roomMessages'>" + roomMessagesHtml(roomId) + "</div>" +
        (voice
          ? "<div class='chat-composer chat-voice-note'>" + ui.icon("mic") + "<span>Ses odaları şu an desteklenmiyor. Bu odada metin mesajı gönderilemez.</span></div>"
          : composerHtml("room", roomId)) +
      "</div>";

    bindChatComposer("room", roomId);
    chat.markRoomRead(roomId);
    scrollRoomToBottom(true);
    renderRailMembers();
    renderTypingIndicator("room", roomId);
  }

  function renderDm(dmId) {
    var me = store.me();
    var dm = chat.getDm(dmId);
    var meta = null;
    chat.dmList().forEach(function (d) { if (d.dmId === dmId) meta = d; });
    if (!dm || !meta) {
      if (!pendingDmTimer[dmId]) {
        pendingDmTimer[dmId] = true;
        view().innerHTML = "<div class='chat-loading'>" + ui.icon("chat") + "<p>Sohbet yükleniyor…</p></div>";
        setTimeout(function () {
          pendingDmTimer[dmId] = false;
          if (router.current().name === "dm" && router.current().params.id === dmId) renderDm(dmId);
        }, 400);
      } else {
        view().innerHTML = "<div class='empty-state'>" + ui.icon("warn") + "<h3>Konuşma bulunamadı</h3><p>Bu konuşmaya erişimin yok.</p><a class='btn btn-accent' href='#/rooms'>Odalara dön</a></div>";
      }
      return;
    }
    /* T10: karşı tarafın profili silinmiş olsa bile konuşma açılır — hayalet
       kullanıcı gösterilir; kullanıcı mesajları görüp konuşmayı silebilir. */
    var other = userOrGhost(meta.otherUid);
    var otherHead = other.profile.handle
      ? "<a href='#/u/" + ui.esc(other.profile.handle) + "' class='room-head-meta' data-nav-user='" + ui.esc(other.id) + "'>" +
          ui.avatarHtml(other, "avatar-md") +
          "<span class='room-head-id'><strong>" + ui.esc(other.profile.name) + ui.verifiedHtml(other) + "</strong>" +
          "<span class='room-head-sub'>@" + ui.esc(other.profile.handle) + "</span></span>" +
        "</a>"
      : "<div class='room-head-meta' title='Profil silinmiş'>" +
          ui.avatarHtml(other, "avatar-md") +
          "<span class='room-head-id'><strong>" + ui.esc(other.profile.name) + "</strong>" +
          "<span class='room-head-sub'>Profil silinmiş</span></span>" +
        "</div>";

    view().innerHTML =
      "<div class='room-view dm-view'>" +
        "<header class='room-head'>" +
          "<a href='#/rooms' class='icon-btn' aria-label='Odalara dön' title='Odalara dön'>" + ui.icon("back") + "</a>" +
          otherHead +
          "<button class='icon-btn' data-action='dm-menu' data-id='" + ui.esc(dmId) + "' aria-label='Konuşma menüsü' title='Daha fazla'>" + ui.icon("dots") + "</button>" +
        "</header>" +
        "<div class='room-messages' id='roomMessages'>" + dmMessagesHtml(dmId) + "</div>" +
        composerHtml("dm", dmId) +
      "</div>";

    bindChatComposer("dm", dmId);
    chat.markDmRead(dmId);
    scrollRoomToBottom(true);
    renderRailMembers();
    renderTypingIndicator("dm", dmId);
  }

  /* Yazıyor göstergesi: typing/<scope>/<scopeId> dinlenir; kendi uid dışındaki
     kullanıcılar 3 sn içinde yazdıysa mesaj listesinin altına eklenir. */
  var typingRef = null;
  var typingHandle = null;
  function offTypingIndicator() {
    if (typingRef && typingHandle) typingRef.off("value", typingHandle);
    typingRef = null;
    typingHandle = null;
    var old = $("#typingIndicator");
    if (old) old.remove();
  }

  function renderTypingIndicator(scope, scopeId) {
    offTypingIndicator();
    if (!chat.isFirebase()) return;
    var list = $("#roomMessages");
    if (!list) return;
    var db = window.firebase && firebase.database ? firebase.database() : null;
    if (!db) return;
    var ref = db.ref("typing").child(scope).child(scopeId);
    var handle = ref.on("value", function (snap) {
      var val = snap.val() || {};
      var me = store.me();
      var now = Date.now();
      var handles = [];
      Object.keys(val).forEach(function (uid) {
        if (me && uid === me.id) return;
        var at = val[uid] && val[uid].at;
        if (typeof at === "number" && now - at > 3000) return;
        var u = store.getUser(uid);
        handles.push(u && u.profile ? u.profile.handle : uid);
      });
      var old = $("#typingIndicator");
      if (old) old.remove();
      if (!handles.length) return;
      var div = document.createElement("div");
      div.className = "typing-indicator";
      div.id = "typingIndicator";
      div.innerHTML =
        "<span></span><span></span><span></span> <em>@" + ui.esc(handles[0]) +
        (handles.length > 1 ? " ve " + (handles.length - 1) + " kişi" : "") +
        " yazıyor…</em>";
      list.appendChild(div);
    });
    typingRef = ref;
    typingHandle = handle;
  }

  /* Sohbet listesi güncellemeleri: alttaysa en altta kalır, değilse kaydırma
     konumu korunur. P1: tam innerHTML rebuild yerine kısmi senkron — aynı
     data-msg-id'li düğümler korunur (video oynatma durumu, P2, bozulmaz),
     yeni mesajlar eklenir, cache'te kalmayanlar kaldırılır. */
  function updateRoomMessages(html) {
    var list = $("#roomMessages");
    if (!list) return;
    var prevHeight = list.scrollHeight;
    var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 100;
    var wrap = document.createElement("div");
    wrap.innerHTML = html;
    var want = {};
    var existing = {};
    Array.prototype.slice.call(list.children).forEach(function (node) {
      var id = node.getAttribute && node.getAttribute("data-msg-id");
      if (id) existing[id] = true;
    });
    Array.prototype.slice.call(wrap.children).forEach(function (node) {
      var id = node.getAttribute && node.getAttribute("data-msg-id");
      if (id) {
        want[id] = true;
        if (existing[id]) return;
      }
      list.appendChild(node);
    });
    if (wrap.querySelector("[data-msg-id]")) {
      var empty = list.querySelector(".chat-empty");
      if (empty) empty.remove();
    }
    Array.prototype.slice.call(list.children).forEach(function (node) {
      var id = node.getAttribute && node.getAttribute("data-msg-id");
      if (id && !want[id]) node.remove();
    });
    if (atBottom) list.scrollTop = list.scrollHeight;
    else list.scrollTop += list.scrollHeight - prevHeight;
  }

  function scrollRoomToBottom(force) {
    var list = $("#roomMessages");
    if (!list) return;
    if (force) { list.scrollTop = list.scrollHeight; return; }
    if (list.scrollHeight - list.scrollTop - list.clientHeight < 100) list.scrollTop = list.scrollHeight;
  }

  function updateRoomView(roomId) {
    var room = chat.getRoom(roomId);
    var me = store.me();
    if (!room || !me || !chat.isMember(roomId, me.id)) { renderRoom(roomId); return; }
    updateRoomMessages(roomMessagesHtml(roomId));
    chat.markRoomRead(roomId);
    renderRailMembers();
  }

  function updateDmView(dmId) {
    var dm = chat.getDm(dmId);
    var has = false;
    chat.dmList().forEach(function (d) { if (d.dmId === dmId) has = true; });
    if (!dm || !has) { renderDm(dmId); return; }
    updateRoomMessages(dmMessagesHtml(dmId));
    chat.markDmRead(dmId);
  }

  /* ================= CHAT — RAIL & SIDEBAR ================= */
  function renderSidebarRooms() {
    var list = $("#sideRoomList");
    if (!list) return;
    var me = store.me();
    if (!me) { list.innerHTML = ""; return; }
    var rooms = chat.getRooms().filter(function (r) { return chat.isMember(r.id, me.id); });
    var route = router.current();

    var badge = $("#sideRoomsBadge");
    var badgeCount = chat.pendingInviteCount() + chat.unreadDmCount();
    if (badge) {
      badge.hidden = badgeCount === 0;
      badge.textContent = badgeCount > 9 ? "9+" : String(badgeCount);
    }

    list.innerHTML = rooms.length
      ? rooms.map(function (r) {
          var active = route.name === "room" && route.params.id === r.id;
          var voice = r.meta.type === "voice";
          return (
            "<a href='#/room/" + ui.esc(r.id) + "' class='side-room" + (active ? " active" : "") + "' title='" + ui.esc(r.meta.name) + "'>" +
              ui.icon(voice ? "mic" : "chat") +
              "<span>" + ui.esc(r.meta.name) + "</span>" +
              (roomHasUnread(r, me.id) ? "<span class='side-room-unread'></span>" : "") +
            "</a>"
          );
        }).join("")
      : "<div class='side-room-empty'>" + ui.icon("chat") + "<span>Henüz oda yok</span></div>";
  }

  /* P6: preview için tüm mesajları sıralamak yerine dmList'in lastMsgId'si
     (server senkronlu) kullanılır; bulunamazsa cache'teki en geç mesaj alınır. */
  function dmPreview(d) {
    var dm = chat.getDm(d.dmId);
    var msgs = dm && dm.messages ? dm.messages : {};
    var last = (d.lastMsgId && msgs[d.lastMsgId]) ? msgs[d.lastMsgId] : null;
    if (!last) {
      var keys = Object.keys(msgs);
      if (!keys.length) return "Yeni konuşma";
      keys.forEach(function (k) { if (!last || msgs[k].createdAt > last.createdAt) last = msgs[k]; });
    }
    var me = store.me();
    var prefix = last.authorId === me.id ? "Sen: " : "";
    var txt = last.type === "image" ? "Fotoğraf" : last.type === "gif" ? "GIF" : last.type === "video" ? "Video" : last.type === "emoji" ? (last.text || "Emoji") : (last.text || "");
    return prefix + txt;
  }

  function renderRailDm() {
    var list = $("#railDmList");
    if (!list) return;
    var me = store.me();
    var card = list.closest(".rail-card");
    var emptyHtml = "<div class='rail-dm-empty'>" + ui.icon("chat") + "<span>Konuşma yok — bir profilden mesaj gönder</span></div>";
    if (!me) {
      if (card) card.style.display = "";
      list.innerHTML = emptyHtml;
      return;
    }
    var dms = chat.dmList();
    if (!dms.length) {
      if (card) card.style.display = "";
      list.innerHTML = emptyHtml;
      return;
    }
    if (card) card.style.display = "";
    var route = router.current();
    list.innerHTML = dms.map(function (d) {
      var u = userOrGhost(d.otherUid);
      var active = route.name === "dm" && route.params.id === d.dmId;
      var read = !d.unread && !!d.lastMsgId && d.otherRead === d.lastMsgId;
      return (
        "<a href='#/dm/" + ui.esc(d.dmId) + "' class='rail-dm-row" + (active ? " active" : "") + "' data-nav-dm='" + ui.esc(d.dmId) + "'>" +
          ui.avatarHtml(u, "avatar-md") +
          "<div class='rail-dm-meta'><strong>" + ui.esc(u.profile.name) + "</strong>" +
            (read ? "<span class='dm-read' title='Okundu'>✓✓</span>" : (d.unread ? "<span class='dm-unread'></span>" : "")) +
            "<span>" + ui.esc(dmPreview(d)) + "</span>" +
            (d.lastAt ? "<span class='dm-time'>" + ui.esc(ui.timeAgo(d.lastAt)) + "</span>" : "") +
          "</div>" +
        "</a>"
      );
    }).join("");
  }

  function renderRailMembers() {
    var card = $("#railMembersCard");
    if (!card) return;
    var me = store.me();
    var route = router.current();
    if (!me || route.name !== "room") {
      card.classList.add("hidden");
      return;
    }
    var roomId = route.params.id;
    var room = chat.getRoom(roomId);
    if (!room || !chat.isMember(roomId, me.id)) {
      card.classList.add("hidden");
      return;
    }
    card.classList.remove("hidden");

    var isOwner = chat.isOwner(roomId, me.id);
    var box = $("#railMembers");
    var members = chat.roomMembers(roomId);

    var membersHtml = members.map(function (m) {
      var u = store.getUser(m.uid);
      if (!u) return "";
      var roleBadge = m.role === "admin" ? "<span class='role-badge'>Yönetici</span>" : "";
      var menu = isOwner && m.uid !== me.id
        ? "<button class='icon-btn icon-btn-sm' data-action='member-menu' data-room='" + ui.esc(roomId) + "' data-uid='" + ui.esc(m.uid) + "' aria-label='Üye menüsü' title='Daha fazla'>" + ui.icon("dots") + "</button>"
        : "";
      return (
        "<div class='rail-member'>" +
          "<a href='#/u/" + ui.esc(u.profile.handle) + "' class='rail-member-id' data-nav-user='" + ui.esc(m.uid) + "'>" +
            ui.avatarHtml(u, "avatar-md") +
            "<span class='rail-member-name'><strong>" + ui.esc(u.profile.name) + "</strong>" + roleBadge + "</span>" +
          "</a>" +
          menu +
        "</div>"
      );
    }).join("");

    var invitesHtml = isOwner && chat.roomInvites(roomId).length
      ? "<div class='rail-invites'><div class='rail-invites-title'>Davetler</div>" +
        chat.roomInvites(roomId).map(function (inv) {
          var u = store.getUser(inv.uid);
          if (!u) return "";
          return (
            "<div class='rail-invite'><span>" + ui.esc(u.profile.name) + "</span>" +
              "<button class='icon-btn icon-btn-sm' data-action='invite-cancel' data-room='" + ui.esc(roomId) + "' data-uid='" + ui.esc(inv.uid) + "' title='Daveti iptal et' aria-label='Daveti iptal et'>" + ui.icon("imageX") + "</button>" +
            "</div>"
          );
        }).join("") +
        "</div>"
      : "";

    box.innerHTML =
      "<div class='rail-members-head'><span>" + ui.num(members.length) + " üye</span>" +
        (isOwner
          ? "<button class='btn btn-sm btn-accent' data-action='invite-members' data-id='" + ui.esc(roomId) + "'>" + ui.icon("plus") + "<span>Davet Et</span></button>"
          : "") +
      "</div>" +
      membersHtml +
      invitesHtml;
  }

  /* Chat verisi değiştiğinde chrome + aktif sohbet görünümü tazelenir. */
  function refreshChatChrome() {
    renderSidebarRooms();
    renderRailDm();
    renderRailMembers();
  }

  /* ================= AYARLAR ================= */
  function renderSettings() {
    var me = store.me();
    if (!me) { router.navigate("#/auth"); return; }

    var avatarPreview = me.profile.avatar && me.profile.avatar.img
      ? "<img src='" + ui.esc(me.profile.avatar.img) + "' alt='' style='width:100%;height:100%;object-fit:cover'>"
      : ui.esc((me.profile.name || "?").charAt(0).toUpperCase());

    view().innerHTML =
      "<div class='settings'>" +

        "<div class='settings-card'>" +
          "<div class='settings-card-head'>" + ui.icon("user") +
            "<h2>Vitrin Bilgileri</h2></div>" +
          "<form class='settings-form' data-form='profile'>" +
            "<div class='avatar-edit'>" +
              "<div class='avatar-upload'>" +
                "<div class='avatar-xl' id='setAvatarPreview'>" + avatarPreview + "</div>" +
                "<label class='avatar-upload-btn' for='setAvatarFile'>" +
                  ui.icon("image") + "<span>Fotoğraf Seç</span>" +
                "</label>" +
                "<input type='file' accept='image/*' id='setAvatarFile' hidden>" +
              "</div>" +
              "<div class='avatar-edit-side'>" +
                "<strong>Vitrin fotoğrafı</strong>" +
                "<p class='form-note'>Profilinde görünen yuvarlak fotoğraf. PNG/JPG, en fazla 2MB.</p>" +
              "</div>" +
            "</div>" +
            "<div class='settings-row'>" +
              "<div class='field'><label for='setName'>Ad</label><input class='input' id='setName' value='" + ui.esc(me.profile.name) + "' required></div>" +
              "<div class='field'><label for='setHandle'>Kullanıcı adı</label><input class='input' id='setHandle' value='" + ui.esc(me.profile.handle) + "' pattern='[a-zA-Z0-9_]{3,20}' required></div>" +
            "</div>" +
            "<div class='field'><label for='setBio'>Hakkında</label><textarea class='textarea' id='setBio' maxlength='160' style='min-height:120px'>" + ui.esc(me.profile.bio || "") + "</textarea></div>" +
            "<div class='settings-actions'>" +
              "<button class='btn btn-accent' type='submit' id='btnSaveProfile' disabled>" + ui.icon("check") + "<span>Değişiklikleri Kaydet</span></button>" +
              "<button class='btn btn-ghost' type='button' id='btnCancelProfile' data-action='profile-cancel' disabled>" + ui.icon("back") + "<span>İptal</span></button>" +
              "<a class='btn btn-ghost' href='#/u/" + ui.esc(me.profile.handle) + "'>Vitrini Görüntüle</a>" +
            "</div>" +
          "</form>" +
        "</div>" +

        "<div class='settings-card'>" +
          "<div class='settings-card-head'>" + ui.icon("settings") +
            "<h2>Şifre Değiştir</h2><p>Güvenlik</p></div>" +
          "<form class='settings-form' data-form='password'>" +
            "<div class='field'><label for='setCurPass'>Mevcut şifre</label><input class='input' id='setCurPass' type='password' placeholder='••••••••'></div>" +
            "<div class='settings-row'>" +
              "<div class='field'><label for='setNewPass'>Yeni şifre</label><input class='input' id='setNewPass' type='password' placeholder='En az 6 karakter'></div>" +
              "<div class='field'><label for='setNewPass2'>Yeni şifre (tekrar)</label><input class='input' id='setNewPass2' type='password' placeholder='Tekrar yaz'></div>" +
            "</div>" +
            "<div class='settings-actions'><button class='btn btn-ghost' type='submit'>Şifreyi Güncelle</button></div>" +
          "</form>" +
        "</div>" +

        "<div class='settings-card danger-zone'>" +
          "<div class='settings-card-head'>" + ui.icon("warn") +
            "<h2>Tehlikeli Bölge</h2><p>Geri alınamaz</p></div>" +
          "<div class='settings-actions'>" +
            "<button class='btn btn-outline-danger' data-action='logout'>" + ui.icon("logout") + "<span>Çıkış Yap</span></button>" +
            "<button class='btn btn-danger' data-action='delete-account'>" + ui.icon("trash") + "<span>Hesabı Sil</span></button>" +
          "</div>" +
        "</div>" +

      "</div>";

    bindSettingsProfile();
  }

  /* ----- Ayarlar vitrin formu: değişiklik izleme, kaydet/iptal, ayrılma guard'ı ----- */
  var profileSnapshot = null;   // form açılış anındaki değerler
  var profileDirty = false;     // kaydedilmemiş değişiklik var mı
  var profilePendingHash = null; // guard devreye girdiğinde gidilmek istenen hash

  window.addEventListener("beforeunload", function (e) {
    if (profileDirty) { e.preventDefault(); e.returnValue = ""; }
  });

  function bindSettingsProfile() {
    var me = store.me();
    if (!me) return;

    var nameEl = $("#setName");
    var handleEl = $("#setHandle");
    var bioEl = $("#setBio");
    var fileEl = $("#setAvatarFile");
    var previewEl = $("#setAvatarPreview");
    var btnSave = $("#btnSaveProfile");
    var btnCancel = $("#btnCancelProfile");
    if (!nameEl || !handleEl || !bioEl || !btnSave || !btnCancel) return;

    profileSnapshot = {
      name: me.profile.name,
      handle: me.profile.handle,
      bio: me.profile.bio || "",
      avatar: (me.profile.avatar && me.profile.avatar.img) || null
    };
    profileDirty = false;
    profilePendingHash = null;

    function refreshState() {
      profileDirty =
        nameEl.value !== profileSnapshot.name ||
        handleEl.value !== profileSnapshot.handle ||
        bioEl.value !== profileSnapshot.bio ||
        fileEl.files.length > 0 ||
        (previewEl && previewEl.dataset.changed === "1");
      btnSave.disabled = !profileDirty;
      btnCancel.disabled = !profileDirty;
    }

    [nameEl, handleEl, bioEl].forEach(function (el) {
      el.addEventListener("input", refreshState);
    });

    if (fileEl) {
      fileEl.addEventListener("change", function () {
        var f = fileEl.files[0];
        if (!f) { refreshState(); return; }
        readImage(f, function (data) {
          if (previewEl) {
            previewEl.innerHTML = "<img src='" + ui.esc(data) + "' alt='' style='width:100%;height:100%;object-fit:cover'>";
            previewEl.dataset.changed = "1";
          }
          refreshState();
        });
      });
    }

    /* İptal: formu açılış anındaki değerlere döndür */
    btnCancel.addEventListener("click", function () {
      if (!profileDirty) return;
      nameEl.value = profileSnapshot.name;
      handleEl.value = profileSnapshot.handle;
      bioEl.value = profileSnapshot.bio;
      fileEl.value = "";
      if (previewEl) {
        previewEl.dataset.changed = "";
        previewEl.innerHTML = profileSnapshot.avatar
          ? "<img src='" + ui.esc(profileSnapshot.avatar) + "' alt='' style='width:100%;height:100%;object-fit:cover'>"
          : ui.esc((profileSnapshot.name || "?").charAt(0).toUpperCase());
      }
      refreshState();
      ui.toast("Değişiklikler iptal edildi.", "info");
    });
  }

  /* Router guard: settings'te kaydedilmemiş değişiklik varken ayrılırsa
     uyarı göster, kullanıcı onaylarsa devam et. */
  function guardNavigation(nextHash, prevHash) {
    if (!profileDirty) return false;
    if (!store.isAuthed()) { profileDirty = false; return false; }
    if ((prevHash || "").indexOf("#/settings") !== 0) return false;
    profilePendingHash = nextHash;
    openUnsavedModal();
    return true;
  }

  function openUnsavedModal() {
    var panel = ui.openModal(
      "<div class='modal-head'><h2>" + ui.icon("warn") + "<span>Kaydedilmemiş değişiklikler var</span></h2>" +
      "<button class='icon-btn' data-action='modal-close' aria-label='Kapat'>" + ui.icon("imageX") + "</button></div>" +
      "<p class='modal-text'>Vitrin bilgilerindeki değişiklikleri henüz kaydetmedin. Ayrılırsan değişiklikler kaybolur.</p>" +
      "<div class='confirm-actions'>" +
        "<button class='btn btn-accent btn-block' data-action='unsaved-keep'>" + ui.icon("back") + "<span>Düzenlemeye devam et</span></button>" +
        "<button class='btn btn-danger btn-block' data-action='unsaved-discard'>" + ui.icon("trash") + "<span>İptal et ve ayrıl</span></button>" +
      "</div>"
    );
    return panel;
  }

  /* ================= GİRİŞ / KAYIT ================= */
  function renderAuth() {
    view().innerHTML =
      "<div class='auth-wrap'>" +
        "<div class='auth-card'>" +
          "<div class='auth-head'>" +
            "<div class='brand'><span class='brand-mark'>P</span><span class='brand-name'>Plush Babies</span></div>" +
            "<p>Yumuşacık plush şamatası. Plushla, beğen, öfle.</p>" +
          "</div>" +

          "<div class='auth-tabs' role='tablist'>" +
            "<button class='auth-tab active' data-action='auth-tab' data-tab='login' role='tab'>Giriş Yap</button>" +
            "<button class='auth-tab' data-action='auth-tab' data-tab='register' role='tab'>Kayıt Ol</button>" +
          "</div>" +

          "<div id='authPane'></div>" +

          "<div class='auth-note'>" + ui.icon("info") +
            "<span>" + (store.isFirebase()
              ? "Firebase'e bağlısın — verilerin Realtime Database'de saklanır."
              : "Yerel geliştirme verisi kullanılıyor (Firebase modu kapalı).") +
            "</span>" +
          "</div>" +
        "</div>" +
      "</div>";

    renderAuthPane("login");
  }

  function renderAuthPane(tab) {
    var pane = $("#authPane");
    if (tab === "register") {
      pane.innerHTML =
        "<form class='auth-form' data-form='register'>" +
          "<div class='field'><label for='regName'>Ad</label><input class='input' id='regName' placeholder='Adın ne?' required></div>" +
          "<div class='field'><label for='regHandle'>Kullanıcı adı</label><input class='input' id='regHandle' placeholder='@kullanici_adi' pattern='[a-zA-Z0-9_]{3,20}' required></div>" +
          "<div class='field'><label for='regEmail'>E-posta</label><input class='input' id='regEmail' type='email' placeholder='ornek@mail.com' required></div>" +
          "<div class='field'><label for='regPass'>Şifre</label><input class='input' id='regPass' type='password' placeholder='En az 6 karakter' required></div>" +
          "<button class='btn btn-accent btn-lg auth-submit' type='submit'>Hesap Oluştur</button>" +
        "</form>" +
        "<p class='form-note' style='margin-top:18px;text-align:center'>Hesabın var mı? <button data-action='auth-tab' data-tab='login' class='text-accent' style='text-decoration:underline;font-weight:800'>Giriş yap</button></p>";
    } else {
      pane.innerHTML =
        "<form class='auth-form' data-form='login'>" +
          "<div class='field'><label for='loginEmail'>E-posta</label><input class='input' id='loginEmail' type='email' placeholder='ornek@mail.com' value='" + ui.esc(rememberedEmail()) + "' required></div>" +
          "<div class='field'><label for='loginPass'>Şifre</label><input class='input' id='loginPass' type='password' placeholder='Şifren' required></div>" +
          "<label class='remember-row'><input type='checkbox' id='loginRemember'" + (rememberedEmail() ? " checked" : "") + "><span>Beni hatırla</span></label>" +
          "<button class='btn btn-accent btn-lg auth-submit' type='submit'>Giriş Yap</button>" +
        "</form>";
    }
  }

  /* "Beni hatırla": e-posta localStorage'da tutulur; işaretlenmezse silinir. */
  function rememberedEmail() {
    try { return localStorage.getItem(DZ.STORAGE_KEYS.remember) || ""; } catch (e) { return ""; }
  }
  function saveRememberedEmail(email, on) {
    try {
      if (on) localStorage.setItem(DZ.STORAGE_KEYS.remember, String(email || "").trim().toLowerCase());
      else localStorage.removeItem(DZ.STORAGE_KEYS.remember);
    } catch (e) { /* localStorage engelli ise sessiz geç */ }
  }

  /* ================= ÜST BAR & NAV ================= */
  function markNav(name, params) {
    var map = { feed: "feed", settings: "settings", rooms: "rooms", dm: "dm", dms: "dm" };
    var active = map[name] || null;
    var me = store.me();
    if (name === "u" && params && me && params.handle === me.profile.handle) active = "profile";
    if (name === "room") active = "rooms";

    $$(".side-link").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-nav") === active);
    });
    $$(".side-chat-title").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-nav") === active);
    });
    $$(".mob-link").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-nav") === active);
    });
  }

  function setAvatar(id, user, sizeCls) {
    var el = document.getElementById(id);
    if (!el) return;
    el.outerHTML = ui.avatarHtml(user, sizeCls).replace("<div", "<div id='" + id + "'");
  }

  function updateChrome() {
    var me = store.me();
    var authed = !!me;

    /* Misafir kavramı yok: giriş yokken yalnızca auth ekranı gösterilir */
    document.body.classList.toggle("auth-only", !authed);

    /* Vitrinim linkleri -> me handle */
    $$(".js-link-profile-me").forEach(function (el) {
      if (authed) el.setAttribute("href", "#/u/" + me.profile.handle);
      else el.setAttribute("href", "#/auth");
    });

    if (authed) {
      $("#sideUserName").textContent = me.profile.name;
      $("#sideUserHandle").textContent = "@" + me.profile.handle;
      setAvatar("sideUserAvatar", me, "avatar-lg");
      setAvatar("mobAvatar", me, "avatar-sm");
      $("#btnLogoutSide").style.display = "";
      $("#sideUserAvatar").style.display = "";
    } else {
      $("#btnLogoutSide").style.display = "none";
      $("#sideUserAvatar").style.display = "none";
    }

    try {
      if (authed) refreshChatChrome();
      else {
        var sr = $("#sideRoomList"); if (sr) sr.innerHTML = "";
        var rdl = $("#railDmList"); if (rdl) rdl.innerHTML = "";
        var rmc = $("#railMembersCard"); if (rmc) rmc.classList.add("hidden");
      }
    } catch (e) { console.error(e); }

    try { renderSuggestions(); } catch (e) { console.error(e); }
  }

  function renderSuggestions() {
    var rail = $("#railSuggest");
    if (!rail) return;
    var card = rail.closest(".rail-card");
    var me = store.me();
    if (!me) {
      if (card) card.style.display = "none";
      rail.innerHTML = "";
      return;
    }
    var meFollows = me.following || {};
    var list = store.usersList()
      .filter(function (u) { return u && u.profile && (u.id !== me.id && !meFollows[u.id]); })
      .slice(0, 4);

    if (!list.length) {
      if (card) card.style.display = "none";
      rail.innerHTML = "";
      return;
    }
    if (card) card.style.display = "";
    rail.innerHTML = list.map(function (u) {
      return (
        "<a href='#/u/" + ui.esc(u.profile.handle) + "' class='rail-user' data-nav-user='" + ui.esc(u.id) + "'>" +
          ui.avatarHtml(u, "avatar-md") +
          "<div class='rail-user-meta'><strong>" + ui.esc(u.profile.name) + "</strong></div>" +
        "</a>"
      );
    }).join("");
  }

  /* ================= KOMPOZÖR ================= */
  function bindComposer() {
    var text = $("#composerText");
    var count = $("#composerCount");
    var imgInput = $("#composerImg");
    var preview = $("#composerPreview");

    if (text) {
      text.addEventListener("input", function () {
        if (count) {
          count.textContent = text.value.length + " / " + DZ.PLUSH_MAX_LENGTH;
          count.classList.toggle("over", text.value.length > DZ.PLUSH_MAX_LENGTH);
        }
      });
    }

    if (imgInput) {
      imgInput.addEventListener("change", function () {
        var file = imgInput.files && imgInput.files[0];
        if (!file) return;
        var btn = $("#btnComposerPlush");
        if (btn) btn.disabled = true;
        uploadImage(file, "plush_images", function (url) {
          if (btn) btn.disabled = false;
          preview.innerHTML =
            "<div class='composer-preview'>" +
              "<img src='" + url + "' alt='Görsel önizleme'>" +
              "<button class='icon-btn composer-preview-remove' data-action='composer-remove-img'>" + ui.icon("imageX") + "</button>" +
            "</div>";
        }, function () { if (btn) btn.disabled = false; });
      });
    }

    var btn = $("#btnComposerPlush");
    if (btn) {
      btn.addEventListener("click", function () {
        var val = text ? text.value.trim() : "";
        if (!val) { ui.toast("Plush metni boş olamaz.", "err"); text && text.focus(); return; }
        var img = getComposerImage(preview);
        var plush = store.createPlush({ text: val, image: img });
        if (plush) {
          ui.toast("Plush şamataya eklendi.", "ok");
          renderFeed();
          router.navigate("#/plush/" + plush.id);
        }
      });
    }
  }

  function getComposerImage(preview) {
    if (!preview) return null;
    var img = preview.querySelector("img");
    return img ? img.src : null;
  }

  /* ================= YENİ PLUSH MODAL ================= */
  function openComposerModal() {
    var me = store.me();
    if (!me) { router.navigate("#/auth"); return; }
    var panel = ui.openModal(
      "<div class='modal-head'><h2>Yeni Plush</h2>" +
      "<button class='icon-btn' data-action='modal-close' aria-label='Kapat'>" + ui.icon("imageX") + "</button></div>" +
      "<div class='composer' style='margin:0'>" +
        "<div class='composer-top'>" +
          ui.avatarHtml(me, "avatar-lg") +
          "<div class='composer-body'>" +
            "<textarea class='composer-input' id='modalComposerText' maxlength='" + DZ.PLUSH_MAX_LENGTH + "' placeholder='Ne plushlamak istersin?' style='min-height:120px'></textarea>" +
            "<div class='composer-preview hidden' id='modalComposerPreview'></div>" +
          "</div>" +
        "</div>" +
        "<div class='composer-foot'>" +
          "<div class='composer-count' id='modalComposerCount'>0 / " + DZ.PLUSH_MAX_LENGTH + "</div>" +
          "<div style='display:flex;gap:12px'>" +
            "<label class='media-btn'>" + ui.icon("image") + "<span>Görsel</span><input type='file' accept='image/*' class='hidden' id='modalComposerImg'></label>" +
            "<button class='btn btn-accent' id='btnModalPlush'>Plushla</button>" +
          "</div>" +
        "</div>" +
      "</div>"
    );

    var text = $("#modalComposerText");
    var count = $("#modalComposerCount");
    var imgInput = $("#modalComposerImg");
    var preview = $("#modalComposerPreview");

    text.focus();
    text.addEventListener("input", function () {
      count.textContent = text.value.length + " / " + DZ.PLUSH_MAX_LENGTH;
      count.classList.toggle("over", text.value.length > DZ.PLUSH_MAX_LENGTH);
    });
    imgInput.addEventListener("change", function () {
      var file = imgInput.files && imgInput.files[0];
      if (!file) return;
      var btn = $("#btnModalPlush");
      if (btn) btn.disabled = true;
      uploadImage(file, "plush_images", function (url) {
        if (btn) btn.disabled = false;
        preview.innerHTML =
          "<div class='composer-preview'>" +
            "<img src='" + url + "' alt='Görsel önizleme'>" +
            "<button class='icon-btn composer-preview-remove' data-action='composer-remove-img'>" + ui.icon("imageX") + "</button>" +
          "</div>";
      }, function () { if (btn) btn.disabled = false; });
    });
    $("#btnModalPlush").addEventListener("click", function () {
      var val = text.value.trim();
      if (!val) { ui.toast("Plush metni boş olamaz.", "err"); text.focus(); return; }
      var imgBtn = preview.querySelector("[data-action='composer-remove-img']");
      var img = imgBtn ? imgBtn.closest(".composer-preview").querySelector("img").src : null;
      var plush = store.createPlush({ text: val, image: img });
      if (plush) {
        ui.closeModal();
        ui.toast("Plush şamataya eklendi.", "ok");
        router.navigate("#/plush/" + plush.id);
      }
    });
  }

  /* Yerel görüntü önizlemesi (yalnızca ekranda gösterilir, RTDB'ye yazılmaz). */
  function readImage(file, cb) {
    if (!file) return;
    if (file.type.indexOf("image/") !== 0) { ui.toast("Lütfen bir görsel dosyası seç.", "err"); return; }
    if (file.size > IMG_MAX) { ui.toast("Görsel çok büyük (maks 2MB).", "err"); return; }
    var r = new FileReader();
    r.onload = function () { cb(r.result); };
    r.readAsDataURL(file);
  }

  /* Görsel yükleme: Firebase modunda Storage'a yükleyip downloadURL döner,
     yerel (mock) modda base64 üretir. Böylece RTDB'ye büyük base64 gömülmez. */
  function uploadImage(file, pathPrefix, cb, errCb) {
    if (!file) return;
    if (file.type.indexOf("image/") !== 0) { ui.toast("Lütfen bir görsel dosyası seç.", "err"); return; }
    if (file.size > IMG_MAX) { ui.toast("Görsel çok büyük (maks 2MB).", "err"); return; }
    if (store.isFirebase() && firebase.storage) {
      var ref = firebase.storage().ref().child(pathPrefix + "/" + DZ.uid("img_"));
      ref.put(file)
        .then(function (snap) { return snap.ref.getDownloadURL(); })
        .then(cb)
        .catch(function () {
          ui.toast("Görsel yüklenemedi, tekrar dene.", "err");
          if (errCb) errCb();
        });
    } else {
      var r = new FileReader();
      r.onload = function () { cb(r.result); };
      r.readAsDataURL(file);
    }
  }

  /* Chat medyası: görsel (jpg/png/gif) + video (mp4). Gif "gif", görsel
     "image", video "video" tipine eşlenir. Yerel modda dataURL üretilir. */
  function uploadChatMedia(file, cb, errCb) {
    if (!file) return;
    var type = "image";
    if (/^video\//.test(file.type)) type = "video";
    else if (/^image\//.test(file.type)) type = /gif/i.test(file.type) ? "gif" : "image";
    else {
      ui.toast("Yalnızca görsel veya video (mp4) gönderebilirsin.", "err");
      if (errCb) errCb();
      return;
    }
    var limit = type === "video" ? VIDEO_MAX : IMG_MAX;
    if (file.size > limit) {
      ui.toast(type === "video" ? "Video çok büyük (maks 25MB)." : "Görsel çok büyük (maks 2MB).", "err");
      if (errCb) errCb();
      return;
    }
    var done = function (url) { cb({ url: url, type: type, mime: file.type }); };
    if (store.isFirebase() && firebase.storage) {
      var ref = firebase.storage().ref().child("chat_media/" + DZ.uid(type === "video" ? "vid_" : "img_"));
      ref.put(file)
        .then(function (snap) { return snap.ref.getDownloadURL(); })
        .then(done)
        .catch(function () {
          ui.toast("Medya yüklenemedi, tekrar dene.", "err");
          if (errCb) errCb();
        });
    } else {
      var r = new FileReader();
      r.onload = function () { done(r.result); };
      r.readAsDataURL(file);
    }
  }

  /* ================= MENÜ & MODALLAR ================= */
  function openPlushMenu(anchor, plushId) {
    var plush = store.getPlush(plushId);
    if (!plush) return;
    var me = store.me();
    var isOwner = me && plush.meta.authorId === me.id;
    ui.openDropdown(
      anchor,
      "<button class='dropdown-item' data-action='copy-link' data-id='" + ui.esc(plushId) + "'>" + ui.icon("link") + "<span>Bağlantıyı Kopyala</span></button>" +
      (isOwner
        ? "<button class='dropdown-item danger' data-action='delete-plush' data-id='" + ui.esc(plushId) + "'>" + ui.icon("trash") + "<span>Plushu Sil</span></button>"
        : "<button class='dropdown-item danger' data-action='report-plush' data-id='" + ui.esc(plushId) + "'>" + ui.icon("flag") + "<span>Bildir</span></button>")
    );
  }

  function confirmDeleteAccount() {
    var me = store.me();
    if (!me) return;
    ui.openModal(
      "<div class='confirm-icon'>" + ui.icon("trash") + "</div>" +
      "<div class='modal-head' style='justify-content:center'><h2>Hesabı kalıcı sil?</h2></div>" +
      "<p class='form-note' style='text-align:center'>Tüm plushların, öflerin ve verilerin silinecek. Bu işlem geri alınamaz.</p>" +
      "<form data-form='delete-account' style='display:flex;flex-direction:column;gap:14px;margin-top:20px'>" +
        "<input class='input' type='password' id='delPass' placeholder='Şifreni yaz' required>" +
        "<button class='btn btn-danger btn-lg' type='submit'>Evet, Hesabımı Sil</button>" +
        "<button class='btn btn-ghost' type='button' data-action='modal-close'>Vazgeç</button>" +
      "</form>"
    );
    var pass = $("#delPass");
    if (pass) setTimeout(function () { pass.focus(); }, 60);
  }

  /* ================= OLAY YÖNETİMİ (delegasyon) ================= */
  function handleClick(e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");

    if (action === "open-plush") {
      var pid = el.getAttribute("data-id");
      if (pid) { e.preventDefault(); router.navigate("#/plush/" + pid); }
      return;
    }

    if (action === "like") {
      e.preventDefault();
      var id = el.getAttribute("data-id");
      var liked = store.toggleLike(id);
      if (liked === null) return;
      var plush = store.getPlush(id);
      el.classList.toggle("on", liked);
      var countEl = el.querySelector(".count");
      if (countEl) countEl.textContent = ui.num(Object.keys(plushLikes(plush)).length);
      return;
    }

    if (action === "pocket") {
      e.preventDefault();
      var sid = el.getAttribute("data-id");
      var pockets = store.togglePocket(sid);
      if (pockets === null) return;
      el.classList.toggle("on", pockets);
      ui.toast(pockets ? "Cepledin." : "Cebinden çıkardın.", pockets ? "ok" : "info");
      return;
    }

    if (action === "plush-menu") {
      e.preventDefault();
      openPlushMenu(el, el.getAttribute("data-id"));
      return;
    }

    if (action === "delete-plush") {
      e.preventDefault();
      ui.closeDropdown();
      var did = el.getAttribute("data-id");
      if (store.deletePlush(did)) {
        ui.toast("Plush silindi.", "ok");
        if (DZ.router.current().name === "plush") { router.navigate("#/feed"); return; }
        DZ.router.render();
      }
      return;
    }

    if (action === "report-plush") {
      e.preventDefault();
      ui.closeDropdown();
      ui.toast("Bildirim alındı, teşekkürler.", "ok");
      return;
    }

    if (action === "copy-link") {
      e.preventDefault();
      ui.closeDropdown();
      var url = location.origin + location.pathname + "#/plush/" + el.getAttribute("data-id");
      var done = function () { ui.toast("Bağlantı kopyalandı.", "ok"); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { done(); });
      } else done();
      return;
    }

    if (action === "follow") {
      e.preventDefault();
      var fid = el.getAttribute("data-id");
      var nowFollowing = store.toggleFollow(fid);
      if (nowFollowing === null) { ui.toast("Kendini takip edemezsin.", "err"); return; }
      el.classList.toggle("btn-accent", !nowFollowing);
      el.classList.toggle("btn-ghost", nowFollowing);
      el.innerHTML = nowFollowing ? "Takip Ediliyor" : "Takip Et";
      updateChrome();
      return;
    }

    if (action === "of-like") {
      e.preventDefault();
      var cPlush = el.getAttribute("data-plush");
      var cId = el.getAttribute("data-of");
      var liked = store.toggleOfLike(cPlush, cId);
      if (liked === null) return;
      el.classList.toggle("on", liked);
      var plush = store.getPlush(cPlush);
      var of = plush && plushOfs(plush)[cId];
      var ccount = el.querySelector("span");
      if (of && ccount) ccount.textContent = ui.num(Object.keys(ofLikes(of)).length);
      return;
    }

    if (action === "pof-like") {
      e.preventDefault();
      var rp = el.getAttribute("data-plush");
      var rc = el.getAttribute("data-of");
      var rr = el.getAttribute("data-pof");
      var liked = store.togglePofLike(rp, rc, rr);
      if (liked === null) return;
      el.classList.toggle("on", liked);
      var plush = store.getPlush(rp);
      var of = plush && plushOfs(plush)[rc];
      var pof = of && ofPofs(of)[rr];
      var rcount = el.querySelector("span");
      if (pof && rcount) rcount.textContent = ui.num(Object.keys(pofLikes(pof)).length);
      return;
    }

    if (action === "pof-toggle") {
      e.preventDefault();
      var cid = el.getAttribute("data-of");
      var form = document.querySelector("[data-pof-form='" + cid + "']");
      if (form) {
        form.classList.toggle("hidden");
        if (!form.classList.contains("hidden")) {
          var input = form.querySelector("input");
          input && input.focus();
        }
      }
      return;
    }

    if (action === "pof-submit") {
      e.preventDefault();
      var rp2 = el.getAttribute("data-plush");
      var rc2 = el.getAttribute("data-of");
      var form = document.querySelector("[data-pof-form='" + rc2 + "']");
      var input = form && form.querySelector("input");
      var val = input && input.value.trim();
      if (!val) { ui.toast("Pöf boş olamaz.", "err"); return; }
      var pof = store.addPof(rp2, rc2, val);
      if (pof) {
        var plush = store.getPlush(rp2);
        var of = plush && plushOfs(plush)[rc2];
        if (of) appendPof(plush, of, pof);
      }
      if (input) { input.value = ""; input.focus(); }
      ui.toast("Pöflendi.", "ok");
      return;
    }

    if (action === "of-menu") {
      e.preventDefault();
      ui.openDropdown(
        el,
        "<button class='dropdown-item danger' data-action='of-delete' data-plush='" + ui.esc(el.getAttribute("data-plush")) + "' data-of='" + ui.esc(el.getAttribute("data-of")) + "'>" +
          ui.icon("trash") + "<span>Öfü Sil</span></button>"
      );
      return;
    }

    if (action === "pof-menu") {
      e.preventDefault();
      ui.openDropdown(
        el,
        "<button class='dropdown-item danger' data-action='pof-delete' data-plush='" + ui.esc(el.getAttribute("data-plush")) + "' data-of='" + ui.esc(el.getAttribute("data-of")) + "' data-pof='" + ui.esc(el.getAttribute("data-pof")) + "'>" +
          ui.icon("trash") + "<span>Pöfü Sil</span></button>"
      );
      return;
    }

    if (action === "of-delete") {
      e.preventDefault();
      ui.closeDropdown();
      var cdp = el.getAttribute("data-plush");
      var cdc = el.getAttribute("data-of");
      if (store.deleteOf(cdp, cdc)) {
        var card = el.closest(".of");
        if (card) card.remove();
        updateOfCount(cdp);
        ui.toast("Öf silindi.", "ok");
      }
      return;
    }

    if (action === "pof-delete") {
      e.preventDefault();
      ui.closeDropdown();
      var rdp = el.getAttribute("data-plush");
      var rdc = el.getAttribute("data-of");
      var rdr = el.getAttribute("data-pof");
      if (store.deletePof(rdp, rdc, rdr)) {
        var pofEl = el.closest(".pof");
        if (pofEl) pofEl.remove();
        ui.toast("Pöf silindi.", "ok");
      }
      return;
    }

    if (action === "logout") {
      e.preventDefault();
      store.logout().then(function () {
        updateChrome();
        router.navigate("#/auth");
        ui.toast("Çıkış yapıldı.", "info");
      });
      return;
    }

    if (action === "delete-account") {
      e.preventDefault();
      confirmDeleteAccount();
      return;
    }

    if (action === "auth-tab") {
      e.preventDefault();
      var tab = el.getAttribute("data-tab");
      $$(".auth-tab").forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-tab") === tab); });
      renderAuthPane(tab);
      return;
    }

    if (action === "composer-remove-img") {
      e.preventDefault();
      var pre = el.closest(".composer-preview");
      if (pre) { pre.innerHTML = ""; pre.classList.add("hidden"); }
      return;
    }

    if (action === "modal-close") {
      e.preventDefault();
      ui.closeModal();
      return;
    }

    if (action === "unsaved-keep") {
      e.preventDefault();
      ui.closeModal();
      return;
    }

    if (action === "unsaved-discard") {
      e.preventDefault();
      ui.closeModal();
      profileDirty = false;
      if (profilePendingHash) {
        var pending = profilePendingHash;
        profilePendingHash = null;
        router.navigate(pending);
      }
      return;
    }

    if (action === "open-image") {
      var iid = el.getAttribute("data-id");
      var iplush = store.getPlush(iid);
      if (iplush && iplush.content.image) {
        ui.openModal(
          "<button class='icon-btn' data-action='modal-close' style='position:absolute;top:18px;right:18px;z-index:2;background:rgba(4,5,7,.7);color:#fff'>" + ui.icon("imageX") + "</button>" +
          "<img src='" + ui.esc(iplush.content.image) + "' alt='Görsel' style='width:100%;border-radius:var(--radius)'>"
        );
      }
      return;
    }

    /* ---------- CHAT AKSİYONLARI ---------- */
    if (action === "retry-chat") {
      e.preventDefault();
      chat.reload();
      router.render();
      return;
    }

    if (action === "new-room") {
      e.preventDefault();
      openNewRoomModal();
      return;
    }

    if (action === "invite-members") {
      e.preventDefault();
      ui.closeDropdown();
      var imRoomId = el.getAttribute("data-id");
      var imRoom = chat.getRoom(imRoomId);
      if (imRoom && imRoom.meta.privacy !== "private") {
        ui.toast("Bu oda herkese açık, davet gerekmez.", "info");
        return;
      }
      openInviteModal(imRoomId);
      return;
    }

    if (action === "invite-send") {
      e.preventDefault();
      var iroom = el.getAttribute("data-room");
      var iuid = el.getAttribute("data-uid");
      if (chat.inviteToRoom(iroom, iuid)) {
        el.disabled = true;
        el.textContent = "Davet Edildi";
        ui.toast("Davet gönderildi.", "ok");
        renderRailMembers();
      } else ui.toast("Davet gönderilemedi.", "err");
      return;
    }

    if (action === "invite-cancel") {
      e.preventDefault();
      var cRoom = el.getAttribute("data-room");
      var cUid = el.getAttribute("data-uid");
      if (chat.cancelInvite(cRoom, cUid)) {
        ui.toast("Davet iptal edildi.", "ok");
        renderRailMembers();
      } else ui.toast("Davet iptal edilemedi.", "err");
      return;
    }

    if (action === "accept-invite") {
      e.preventDefault();
      var aRoom = el.getAttribute("data-id");
      var aName = chat.getRoom(aRoom);
      if (chat.acceptInvite(aRoom)) {
        ui.toast("Odaya katıldın.", "ok");
        renderSidebarRooms();
        if (aName) router.navigate("#/room/" + aRoom);
        else router.navigate("#/rooms");
      } else ui.toast("Katılınamadı.", "err");
      return;
    }

    if (action === "join-room") {
      e.preventDefault();
      var jRoom = el.getAttribute("data-id");
      chat.joinRoom(jRoom, function (ok) {
        if (ok) {
          ui.toast("Odaya katıldın.", "ok");
          renderSidebarRooms();
          router.navigate("#/room/" + jRoom);
        } else ui.toast("Katılınamadı.", "err");
      });
      return;
    }

    if (action === "decline-invite") {
      e.preventDefault();
      var dRoom = el.getAttribute("data-id");
      if (chat.declineInvite(dRoom)) {
        ui.toast("Davet reddedildi.", "info");
        renderSidebarRooms();
        if (router.current().name === "rooms") renderRooms();
      }
      return;
    }

    if (action === "room-menu") {
      e.preventDefault();
      var rmId = el.getAttribute("data-id");
      var rm = chat.getRoom(rmId);
      if (!rm || !store.me()) return;
      var owner = chat.isOwner(rmId, store.me().id);
      var voiceRoom = rm.meta.type === "voice";
      ui.openDropdown(el,
        (owner && rm.meta.privacy === "private" && !voiceRoom
          ? "<button class='dropdown-item' data-action='invite-members' data-id='" + ui.esc(rmId) + "'>" + ui.icon("users") + "<span>Üye Davet Et</span></button>"
          : "") +
        (owner
          ? "<button class='dropdown-item' data-action='edit-room' data-id='" + ui.esc(rmId) + "'>" + ui.icon("settings") + "<span>Oda Düzenle</span></button>" +
            "<button class='dropdown-item danger' data-action='confirm-del-room' data-id='" + ui.esc(rmId) + "'>" + ui.icon("trash") + "<span>Odayı Sil</span></button>"
          : "<button class='dropdown-item danger' data-action='leave-room' data-id='" + ui.esc(rmId) + "'>" + ui.icon("logout") + "<span>Odadan Ayrıl</span></button>")
      );
      return;
    }

    if (action === "dm-menu") {
      e.preventDefault();
      ui.openDropdown(el,
        "<button class='dropdown-item danger' data-action='confirm-del-dm' data-id='" + ui.esc(el.getAttribute("data-id")) + "'>" + ui.icon("trash") + "<span>Konuşmayı Sil</span></button>"
      );
      return;
    }

    if (action === "confirm-del-dm") {
      e.preventDefault();
      ui.closeDropdown();
      confirmDeleteDm(el.getAttribute("data-id"));
      return;
    }

    if (action === "delete-dm") {
      e.preventDefault();
      var delDmId = el.getAttribute("data-id");
      chat.deleteDm(delDmId, function (ok) {
        if (ok) {
          ui.closeModal();
          ui.toast("Konuşma silindi.", "ok");
          refreshChatChrome();
          router.navigate("#/rooms");
        } else ui.toast("Konuşma silinemedi.", "err");
      });
      return;
    }

    if (action === "edit-room") {
      e.preventDefault();
      ui.closeDropdown();
      openEditRoomModal(el.getAttribute("data-id"));
      return;
    }

    if (action === "confirm-del-room") {
      e.preventDefault();
      ui.closeDropdown();
      confirmDeleteRoom(el.getAttribute("data-id"));
      return;
    }

    if (action === "leave-room") {
      e.preventDefault();
      ui.closeDropdown();
      var lRoom = el.getAttribute("data-id");
      if (chat.leaveRoom(lRoom)) {
        ui.toast("Odadan ayrıldın.", "info");
        router.navigate("#/rooms");
      } else ui.toast("Odadan ayrılınamadı.", "err");
      return;
    }

    if (action === "delete-room") {
      e.preventDefault();
      var delRoom = el.getAttribute("data-id");
      if (chat.deleteRoom(delRoom)) {
        ui.closeModal();
        ui.toast("Oda silindi.", "ok");
        router.navigate("#/rooms");
      } else ui.toast("Oda silinemedi.", "err");
      return;
    }

    if (action === "member-menu") {
      e.preventDefault();
      var mroom = el.getAttribute("data-room");
      var muid = el.getAttribute("data-uid");
      var mRow = null;
      chat.roomMembers(mroom).forEach(function (x) { if (x.uid === muid) mRow = x; });
      if (!mRow) return;
      var mIsAdmin = mRow.role === "admin";
      ui.openDropdown(el,
        "<button class='dropdown-item' data-action='member-role' data-room='" + ui.esc(mroom) + "' data-uid='" + ui.esc(muid) + "' data-role='" + (mIsAdmin ? "member" : "admin") + "'>" + ui.icon("users") + "<span>" + (mIsAdmin ? "Yöneticiliği al" : "Yönetici yap") + "</span></button>" +
        "<button class='dropdown-item danger' data-action='member-remove' data-room='" + ui.esc(mroom) + "' data-uid='" + ui.esc(muid) + "'>" + ui.icon("trash") + "<span>Odadan çıkar</span></button>"
      );
      return;
    }

    if (action === "member-role") {
      e.preventDefault();
      ui.closeDropdown();
      var roleRoom = el.getAttribute("data-room");
      var roleUid = el.getAttribute("data-uid");
      var role = el.getAttribute("data-role");
      if (chat.setMemberRole(roleRoom, roleUid, role)) {
        ui.toast(role === "admin" ? "Yönetici yapıldı." : "Yöneticilik alındı.", "ok");
        renderRailMembers();
      } else ui.toast("Rol değiştirilemedi.", "err");
      return;
    }

    if (action === "member-remove") {
      e.preventDefault();
      ui.closeDropdown();
      var remRoom = el.getAttribute("data-room");
      var remUid = el.getAttribute("data-uid");
      var remUser = store.getUser(remUid);
      if (chat.removeMember(remRoom, remUid)) {
        ui.toast((remUser ? remUser.profile.name : "Üye") + " odadan çıkarıldı.", "ok");
        renderRailMembers();
      } else ui.toast("Üye çıkarılamadı.", "err");
      return;
    }

    if (action === "msg-menu") {
      e.preventDefault();
      ui.openDropdown(el,
        "<button class='dropdown-item danger' data-action='msg-delete' data-scope='" + ui.esc(el.getAttribute("data-scope")) + "' data-scopeid='" + ui.esc(el.getAttribute("data-scopeid")) + "' data-id='" + ui.esc(el.getAttribute("data-id")) + "'>" + ui.icon("trash") + "<span>Mesajı Sil</span></button>"
      );
      return;
    }

    if (action === "msg-delete") {
      e.preventDefault();
      ui.closeDropdown();
      var mdScope = el.getAttribute("data-scope");
      var mdScopeId = el.getAttribute("data-scopeid");
      var mdId = el.getAttribute("data-id");
      var ok = mdScope === "room"
        ? chat.deleteRoomMessage(mdScopeId, mdId)
        : chat.deleteDmMessage(mdScopeId, mdId);
      if (ok) ui.toast("Mesaj silindi.", "ok");
      else ui.toast("Mesaj silinemedi.", "err");
      return;
    }

    if (action === "dm-user") {
      e.preventDefault();
      startDmAndNavigate(el.getAttribute("data-id"));
      return;
    }

    if (action === "new-dm") {
      e.preventDefault();
      openNewDmModal();
      return;
    }

    if (action === "new-dm-pick") {
      e.preventDefault();
      ui.closeModal();
      startDmAndNavigate(el.getAttribute("data-id"));
      return;
    }

    if (action === "chat-emoji-toggle") {
      e.preventDefault();
      var composer = el.closest(".chat-composer");
      var pal = composer && composer.querySelector("[data-emoji-palette]");
      if (pal) {
        var wasHidden = pal.classList.contains("hidden");
        $$(".emoji-palette").forEach(function (p) { p.classList.add("hidden"); });
        pal.classList.toggle("hidden", !wasHidden);
      }
      return;
    }

    if (action === "chat-emoji") {
      e.preventDefault();
      var comp = el.closest(".chat-composer");
      var input = comp && comp.querySelector(".chat-input");
      if (input) {
        input.value = (input.value || "") + el.getAttribute("data-emoji");
        input.focus();
        autosizeChatInput(input);
      }
      return;
    }

    if (action === "chat-remove-media") {
      e.preventDefault();
      var prev = el.closest("[data-media-preview]");
      if (prev) {
        prev.removeAttribute("data-type");
        prev.removeAttribute("data-mime");
        prev.innerHTML = "";
        prev.classList.add("hidden");
      }
      return;
    }

    if (action === "chat-send") {
      e.preventDefault();
      var compEl = el.closest(".chat-composer");
      if (compEl) sendChatFromComposer(compEl);
      return;
    }
  }

  /* data-nav-user linkleri: hash zaten geçerli. */
  document.addEventListener("click", handleClick);

  document.addEventListener("submit", function (e) {
    var form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    var kind = form.getAttribute("data-form");

    if (kind === "login") {
      var email = ($("#loginEmail") || {}).value || "";
      var pass = ($("#loginPass") || {}).value || "";
      saveRememberedEmail(email, !!($("#loginRemember") || {}).checked);
      store.login(email, pass).then(function (res) {
        if (res.error) { showFormError(form, res.error); return; }
        updateChrome();
        router.navigate("#/feed");
        ui.toast("Tekrar hoş geldin, " + res.user.profile.name + "!", "ok");
      });
      return;
    }

    if (kind === "register") {
      store.register({
        name: ($("#regName") || {}).value,
        handle: ($("#regHandle") || {}).value,
        email: ($("#regEmail") || {}).value,
        password: ($("#regPass") || {}).value
      }).then(function (res) {
        if (res.error) { showFormError(form, res.error); return; }
        updateChrome();
        router.navigate("#/feed");
        ui.toast("Hesap oluşturuldu. Hoş geldin, " + res.user.profile.name + "!", "ok");
      });
      return;
    }

    if (kind === "profile") {
      var name = ($("#setName") || {}).value || "";
      var handle = ($("#setHandle") || {}).value || "";
      var bio = ($("#setBio") || {}).value || "";
      var avatarImg = ($("#setAvatarFile") || {}).files && $("#setAvatarFile").files[0];

      var me = store.me();
      if (!me) return;

      if (handle.toLowerCase() !== me.profile.handle.toLowerCase()) {
        var other = store.getUserByHandle(handle);
        if (other && other.id !== me.id) { showFormError(form, "Bu kullanıcı adı zaten alınmış."); return; }
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle)) { showFormError(form, "Kullanıcı adı 3-20 karakter ve sadece harf/rakam/alt çizgi olmalı."); return; }
      }
      if (!name.trim()) { showFormError(form, "Ad boş olamaz."); return; }
      if (avatarImg) {
        if (avatarImg.type.indexOf("image/") !== 0) { showFormError(form, "Lütfen bir görsel dosyası seç."); return; }
        if (avatarImg.size > IMG_MAX) { showFormError(form, "Görsel çok büyük (maks 2MB)."); return; }
      }

      if (avatarImg) {
        var btnSave = $("#btnSaveProfile");
        if (btnSave) btnSave.disabled = true;
        uploadImage(avatarImg, "avatars", function (url) {
          var me = store.me();
          store.updateMe({
            name: name,
            handle: handle.toLowerCase(),
            bio: bio,
            avatar: { color: (me && me.profile.avatar && me.profile.avatar.color) || "c0", img: url }
          });
          afterProfilePocket();
        }, function () { if (btnSave) btnSave.disabled = false; });
      } else {
        store.updateMe({ name: name, handle: handle.toLowerCase(), bio: bio });
        afterProfilePocket();
      }
      return;
    }

    if (kind === "password") {
      var cur = ($("#setCurPass") || {}).value || "";
      var n1 = ($("#setNewPass") || {}).value || "";
      var n2 = ($("#setNewPass2") || {}).value || "";
      if (n1 !== n2) { showFormError(form, "Yeni şifreler birbiriyle uyuşmuyor."); return; }
      store.changePassword(cur, n1).then(function (res) {
        if (res.error) { showFormError(form, res.error); return; }
        form.reset();
        ui.toast("Şifren güncellendi.", "ok");
      });
      return;
    }

    if (kind === "delete-account") {
      var pass = ($("#delPass") || {}).value || "";
      store.deleteAccount(pass).then(function (res) {
        if (res.error) { showFormError(form, res.error); return; }
        ui.closeModal();
        updateChrome();
        router.navigate("#/auth");
        ui.toast("Hesabın silindi. Görüşürüz.", "info");
      });
      return;
    }

    if (kind === "of") {
      var plushId = form.getAttribute("data-of-form");
      var tarea = form.querySelector("textarea");
      var val = (tarea && tarea.value.trim()) || "";
      if (!val) { ui.toast("Öf boş olamaz.", "err"); return; }
      var of = store.addOf(plushId, val);
      if (of) {
        var plush = store.getPlush(plushId);
        var list = $("#ofList");
        if (list && plush) {
          var empty = list.querySelector(".empty-state");
          if (empty) empty.remove();
          list.insertAdjacentHTML("beforeend", ofItemHtml(plush, of));
          updateOfCount(plushId);
        }
      }
      if (tarea) { tarea.value = ""; tarea.focus(); }
      ui.toast("Öflendi.", "ok");
      return;
    }

    if (kind === "room-create") {
      var rname = ($("#roomName") || {}).value || "";
      var rdesc = ($("#roomDesc") || {}).value || "";
      var rpriv = ($("#roomPrivacy") || {}).value || "public";
      if (!rname.trim()) { showFormError(form, "Oda adı boş olamaz."); return; }
      var room = chat.createRoom({ name: rname, description: rdesc, privacy: rpriv });
      if (!room) { showFormError(form, "Oda oluşturulamadı."); return; }
      ui.closeModal();
      ui.toast("Oda oluşturuldu.", "ok");
      router.navigate("#/room/" + room.id);
      return;
    }

    if (kind === "room-edit") {
      var eid = form.getAttribute("data-id");
      var ename = ($("#roomEditName") || {}).value || "";
      var edesc = ($("#roomEditDesc") || {}).value || "";
      var epriv = ($("#roomEditPrivacy") || {}).value || "public";
      if (!ename.trim()) { showFormError(form, "Oda adı boş olamaz."); return; }
      chat.updateRoomMeta(eid, { name: ename, description: edesc, privacy: epriv }, function (ok) {
        if (!ok) { showFormError(form, "Oda güncellenemedi."); return; }
        ui.closeModal();
        ui.toast("Oda güncellendi.", "ok");
        if (router.current().name === "room" && router.current().params.id === eid) renderRoom(eid);
        else router.navigate("#/room/" + eid);
      });
      return;
    }
  });

  function afterProfilePocket() {
    var me = store.me();
    profileDirty = false;
    profilePendingHash = null;
    if (profileSnapshot && me) {
      profileSnapshot = {
        name: me.profile.name,
        handle: me.profile.handle,
        bio: me.profile.bio || "",
        avatar: (me.profile.avatar && me.profile.avatar.img) || null
      };
    }
    updateChrome();
    ui.toast("Vitrin güncellendi.", "ok");
    router.navigate("#/u/" + me.profile.handle);
  }

  function showFormError(form, msg) {
    var old = form.querySelector(".form-error");
    if (old) old.remove();
    var div = document.createElement("div");
    div.className = "form-error";
    div.textContent = msg;
    form.insertBefore(div, form.firstChild);
    setTimeout(function () { div.remove(); }, 4000);
  }

  /* ================= ARAMA ================= */
  function bindSearch() {
    var input = $("#globalSearch");
    if (!input) return;
    var pop = null;

    function close() { if (pop) { pop.remove(); pop = null; } }

    function open() {
      close();
      var q = input.value.trim();
      if (!q) return;
      var results = store.searchUsers(q);
      pop = document.createElement("div");
      pop.className = "search-pop";
      if (!results.length) {
        pop.innerHTML = "<div class='search-pop-title'>Sonuç yok</div>";
      } else {
        pop.innerHTML = "<div class='search-pop-title'>Kullanıcılar</div>" + results.slice(0, 6).map(function (u) {
          return "<a href='#/u/" + ui.esc(u.profile.handle) + "' class='search-pop-row' data-nav-user='" + ui.esc(u.id) + "'>" +
            ui.avatarHtml(u, "avatar-sm") +
            "<div><strong>" + ui.esc(u.profile.name) + "</strong><span>@" + ui.esc(u.profile.handle) + "</span></div>" +
          "</a>";
        }).join("");
      }
      var wrap = input.closest(".rail-search") || input.parentElement;
      wrap.appendChild(pop);
    }
    input.addEventListener("input", function () {
      if (input.value.trim()) open(); else close();
    });
    input.addEventListener("focus", function () { if (input.value.trim()) open(); });
    input.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    document.addEventListener("click", function (e) {
      if (pop && !e.target.closest(".search-pop") && e.target !== input) close();
    });
    window.addEventListener("hashchange", close);
  }

  /* ================= BAŞLANGIÇ ================= */
  /* P7: chat.on (120ms) ve store.onSync (150ms) ayrı ayrı görünüm render'ı
     yapıyordu → üst üste binen çifte render. Tek kuyruk (scheduleResync):
     iki kaynak da buradan geçer; aynı pencere içinde ikisi tetiklenirse
     resyncTimer guard'ı ikinci timer'ı engeller ve "store" (daha kapsamlı)
     isteği "chat" isteğini üstlenir. "chat" modu yalnız oda/DM görünümlerini
     çizer; feed/plush/profil render'ları yalnız store değişiminde çalışır
     (mesaj aktivitesi feed'i gereksiz yeniden çizmez). */
  var resyncTimer = null;
  var resyncMode = "chat";
  function scheduleResync(mode) {
    if (mode === "store") resyncMode = "store";
    if (resyncTimer) return;
    resyncTimer = setTimeout(function () {
      resyncTimer = null;
      resyncView(resyncMode);
      resyncMode = "chat";
    }, 150);
  }

  function captureComposerState() {
    var text = $("#composerText");
    if (!text) return null;
    var preview = $("#composerPreview");
    var img = preview && preview.querySelector("img");
    return { value: text.value, img: img ? img.src : null };
  }

  /* Yeniden çizim sonrası metin VE görsel önizleme geri yüklenir:
     uzaktan bir değişiklik geldiğinde eklenen görsel sessizce kaybolmaz. */
  function restoreComposerState(state) {
    if (!state) return;
    var text = $("#composerText");
    if (text) text.value = state.value;
    if (state.img) {
      var preview = $("#composerPreview");
      if (preview) {
        preview.classList.remove("hidden");
        preview.innerHTML =
          "<div class='composer-preview'>" +
            "<img src='" + ui.esc(state.img) + "' alt='Görsel önizleme'>" +
            "<button class='icon-btn composer-preview-remove' data-action='composer-remove-img'>" + ui.icon("imageX") + "</button>" +
          "</div>";
      }
    }
  }

  /* Açık olan TÜM pöf formları korunur (tek form değil). */
  function capturePofFormStates() {
    return $$(".pof-form:not(.hidden)").map(function (form) {
      var input = form.querySelector("input");
      return { ofId: form.getAttribute("data-pof-form"), value: input ? input.value : "" };
    });
  }

  function restorePofFormStates(states) {
    (states || []).forEach(function (state) {
      var form = document.querySelector("[data-pof-form='" + state.ofId + "']");
      if (!form) return;
      form.classList.remove("hidden");
      var input = form.querySelector("input");
      if (input) input.value = state.value;
    });
  }

  function resyncView(mode) {
    updateChrome();
    var route = router.current();
    var authed = store.isAuthed();
    if (!authed) {
      /* Giriş yokken auth dışında bir görünümdeysek oraya yönlendir */
      if (route.name !== "auth") router.navigate("#/auth");
      return;
    }
    /* Giriş/oturum yenilemesi sonrası auth ekranında kalmayı bitir */
    if (route.name === "auth") { router.navigate("#/feed"); return; }

    /* Render öncesi mevcut kaydırma konumu saklanır; sonunda geri yüklenir
       (resync'te sayfa en üste sıçramaz). */
    var scrollY = window.scrollY;

    if (route.name === "feed") {
      if (mode === "chat") return;
      var comp = captureComposerState();
      renderFeed();
      restoreComposerState(comp);
    } else if (route.name === "plush") {
      if (mode === "chat") return;
      var pofStates = capturePofFormStates();
      renderPlush(route.params.id);
      restorePofFormStates(pofStates);
    } else if (route.name === "u") {
      if (mode === "chat") return;
      renderProfile(route.params.handle, route.params.sub);
    } else if (route.name === "rooms" || route.name === "dms") {
      renderRooms(route.name === "dms" ? "dm" : null);
    } else if (route.name === "room") {
      updateRoomView(route.params.id);
    } else if (route.name === "dm") {
      updateDmView(route.params.id);
    }

    window.scrollTo(0, scrollY);
  }

  function init() {
    store = DZ.store;
    ui = DZ.ui;
    router = DZ.router;
    store.init();
    if (DZ.chat) {
      chat = DZ.chat;
      chat.init();
      chat.on(function () {
        var authed = store.isAuthed();
        if (!authed) return;
        try { scheduleResync("chat"); } catch (e) { console.error(e); }
      });
    }

    /* Emoji paletini dışarı tıklanınca kapat (capture: buton işlenmeden önce) */
    document.addEventListener("click", function (e) {
      if (!e.target.closest("[data-emoji-palette]")) {
        $$(".emoji-palette").forEach(function (p) { p.classList.add("hidden"); });
      }
    }, true);

    bindSearch();
    store.onSync(function () { scheduleResync("store"); });

    $("#btnLogoutSide").addEventListener("click", function () {
      store.logout().then(function () {
        updateChrome();
        router.navigate("#/auth");
        ui.toast("Çıkış yapıldı.", "info");
      });
    });
    $("#btnNewPlushSidebar").addEventListener("click", function () { openComposerModal(); });
    $("#btnNewPlushMobile").addEventListener("click", function () { openComposerModal(); });
    var btnNewRoomSide = $("#btnNewRoomSide");
    if (btnNewRoomSide) {
      btnNewRoomSide.addEventListener("click", function () { openNewRoomModal(); });
    }
    $("#btnMobileSearch").addEventListener("click", function () {
      var search = $("#railSearch");
      if (search) {
        search.classList.add("open");
        var input = $("#globalSearch");
        if (input) input.focus();
      }
    });
    window.addEventListener("hashchange", function () {
      offTypingIndicator();
      var search = $("#railSearch");
      if (search) search.classList.remove("open");
      if (location.hash.indexOf("#/feed") !== 0) frozenFeedOrder = null;
    });

    /* Veri katmanı hazır olunca arayüzü çiz (Firebase'de auth + veri beklenir) */
    store.ready(function () {
      updateChrome();
      router.render();
    });
  }

  window.DZ.app = {
    renderAuth: renderAuth,
    renderFeed: renderFeed,
    renderPlush: renderPlush,
    renderProfile: renderProfile,
    renderSettings: renderSettings,
    renderRooms: renderRooms,
    renderRoom: renderRoom,
    renderDm: renderDm,
    markNav: markNav,
    guardNavigation: guardNavigation,
    init: init
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

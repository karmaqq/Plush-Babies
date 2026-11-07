/* ============================================================
   Plush Babies — UI Yardımcıları
   ============================================================ */

(function () {
  var ICONS = {
    home: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M3 11.2 12 4l9 7.2M5.2 9.8V20h5v-5.2h3.6V20h5V9.8'/></svg>",
    chat: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M4 6.5h16v11H8.5L4 20.5z'/><path fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' d='M8.5 10.5h7M8.5 13.5h4'/></svg>",
    mic: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' d='M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15Z'/><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' d='M6 11.5a6 6 0 0 0 12 0M12 17.5V20.5M9.5 20.5h5'/></svg>",
    users: "<svg viewBox='0 0 24 24' class='icon'><circle cx='9' cy='8.5' r='3.5' fill='none' stroke='currentColor' stroke-width='2.2'/><circle cx='17' cy='9.5' r='2.5' fill='none' stroke='currentColor' stroke-width='2.2'/><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' d='M2.8 19.5c1-2.8 3.3-4.3 6.2-4.3s5.2 1.5 6.2 4.3M14.6 15.6a5.6 5.6 0 0 1 5.6 3.9'/></svg>",
    emoji: "<svg viewBox='0 0 24 24' class='icon'><circle cx='12' cy='12' r='9' fill='none' stroke='currentColor' stroke-width='2.2'/><path fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' d='M8.5 10h.1M15.5 10h.1'/><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' d='M8 14.2c.8 1.4 2.3 2.3 4 2.3s3.2-.9 4-2.3'/></svg>",
    video: "<svg viewBox='0 0 24 24' class='icon'><rect x='3' y='6' width='13' height='12' rx='2' fill='none' stroke='currentColor' stroke-width='2.2'/><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='m16 10 5-3v10l-5-3z'/></svg>",
    plus: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.6' stroke-linecap='round' d='M12 5v14M5 12h14'/></svg>",
    paperclip: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M8.5 20a4 4 0 0 1-5.7-5.7l9.6-9.7a5.5 5.5 0 0 1 7.8 7.8l-8.7 8.8a3 3 0 0 1-4.3-4.3l8.1-8.2'/></svg>",
    search: "<svg viewBox='0 0 24 24' class='icon'><circle cx='11' cy='11' r='7' fill='none' stroke='currentColor' stroke-width='2.2'/><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' d='m20 20-3.4-3.4'/></svg>",
    user: "<svg viewBox='0 0 24 24' class='icon'><circle cx='12' cy='8' r='4' fill='none' stroke='currentColor' stroke-width='2.2'/><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' d='M4.5 20c1.2-3.4 4-5 7.5-5s6.3 1.6 7.5 5'/></svg>",
    settings: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z'/><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.8-1.6L13.4 2h-2.8l-.4 2.9a7 7 0 0 0-2.7 1.6l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .5 0 1.1.2 1.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.8 1.6l.3 2.9h2.8l.4-2.9a7 7 0 0 0 2.7-1.6l2.3 1 2-3.4-2-1.5c.2-.5.2-1.1.2-1.6Z'/></svg>",
    logout: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M15 4h-2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h2M9 12h11M17 9l3 3-3 3'/></svg>",
    heart: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linejoin='round' d='M12 20.7C6.9 17.2 3 13.7 3 9.5 3 6.4 5.4 4 8.4 4c1.6 0 3 .7 3.6 2 .6-1.3 2-2 3.6-2C18.6 4 21 6.4 21 9.5c0 4.2-3.9 7.7-9 11.2Z'/></svg>",
    of: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M4 6.5h16v11H8.5L4 20.5z'/></svg>",
    pocket: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linejoin='round' d='M7 4h10a1.5 1.5 0 0 1 1.5 1.5V20L12 16.5 5.5 20V5.5A1.5 1.5 0 0 1 7 4Z'/></svg>",
    send: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M4 12 20 4l-4.4 16-3.2-6.4L6 9.2Z'/></svg>",
    image: "<svg viewBox='0 0 24 24' class='icon'><rect x='3.5' y='4.5' width='17' height='15' rx='2' fill='none' stroke='currentColor' stroke-width='2'/><circle cx='9' cy='10' r='1.8' fill='currentColor'/><path fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' d='m5 18 4.5-5 3.5 3.5 3-3 3.5 4'/></svg>",
    dots: "<svg viewBox='0 0 24 24' class='icon'><circle cx='5' cy='12' r='1.7' fill='currentColor'/><circle cx='12' cy='12' r='1.7' fill='currentColor'/><circle cx='19' cy='12' r='1.7' fill='currentColor'/></svg>",
    trash: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M5 7h14M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M7 7l.8 12.2A1.6 1.6 0 0 0 9.4 20.5h5.2a1.6 1.6 0 0 0 1.6-1.3L17 7M10 10.5v6M14 10.5v6'/></svg>",
    flag: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M6 21V4m0 2h12l-2.5 4L18 14H6'/></svg>",
    calendar: "<svg viewBox='0 0 24 24' class='icon'><rect x='4' y='5.5' width='16' height='15' rx='2' fill='none' stroke='currentColor' stroke-width='2'/><path fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' d='M8 3.5v4M16 3.5v4M4 10h16'/></svg>",
    back: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round' d='M15 5l-7 7 7 7'/></svg>",
    check: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round' d='M5 12.5 10 17.5 19 7'/></svg>",
    warn: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M12 3.5 22 20H2Z'/><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' d='M12 10v4.5M12 17.5v.1'/></svg>",
    info: "<svg viewBox='0 0 24 24' class='icon'><circle cx='12' cy='12' r='9' fill='none' stroke='currentColor' stroke-width='2.2'/><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' d='M12 11v5.5M12 7.5v.1'/></svg>",
    verified: "<svg viewBox='0 0 24 24' class='icon icon-sm'><path fill='currentColor' d='M12 1.8 14.6 4l3.4-.4.8 3.3 3 1.6-1.3 3.2L22 15l-3 1.5.2 3.4-3.4.4L14 22.7 12 20.4 10 22.7l-1.8-2.4-3.4-.4.2-3.4L2 15l1.5-3.3L2.2 8.5l3-1.6.8-3.3L9.4 4Z'/><path fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' d='m8.6 12.2 2.2 2.2 4.6-4.8'/></svg>",
    imageX: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' d='m6 6 12 12M18 6 6 18'/></svg>",
    link: "<svg viewBox='0 0 24 24' class='icon'><path fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M9.5 14.5 14.5 9.5M6.5 17.5 4 15a4 4 0 0 1 0-5.7L7 6.3a4 4 0 0 1 5.7 0l2 2M17.5 6.5 20 9a4 4 0 0 1 0 5.7L17 18.2a4 4 0 0 1-5.7 0l-2-2'/></svg>"
  };

  function icon(name) { return ICONS[name] || ""; }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Zaman: "şimdi", "5dk", "2sa", "3g" */
  function timeAgo(ts) {
    var diff = Date.now() - ts;
    var MIN = 60000, HOUR = 3600000, DAY = 86400000;
    if (diff < MIN) return "şimdi";
    if (diff < HOUR) return Math.floor(diff / MIN) + "dk önce";
    if (diff < DAY) return Math.floor(diff / HOUR) + "sa önce";
    if (diff < 30 * DAY) return Math.floor(diff / DAY) + "g önce";
    var d = new Date(ts);
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
  }

  /* Saat: "14:05" */
  function clockTime(ts) {
    return new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  function joinedDate(ts) {
    return new Date(ts).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  }

  function avatarHtml(user, sizeCls) {
    var u = user || {};
    var pr = u.profile || u;
    var img = pr.avatar && pr.avatar.img ? pr.avatar.img : null;
    var color = (pr.avatar && pr.avatar.color) || "c0";
    var cls = sizeCls || "";
    if (img) {
      return "<div class='avatar " + cls + "'><img src='" + esc(img) + "' alt='" + esc(pr.name || "") + "'></div>";
    }
    var letter = (pr.name || "?").trim().charAt(0).toUpperCase() || "?";
    /* G1: color değeri attribute injection'a açıktı — esc'ten geçirilir. */
    return "<div class='avatar " + cls + " " + esc(color) + "' aria-hidden='true'>" + esc(letter) + "</div>";
  }

  function verifiedHtml(user) {
    if (user && ((user.profile && user.profile.verified) || user.verified)) {
      return "<span class='verified-badge' title='Doğrulanmış hesap'>" + icon("verified") + "</span>";
    }
    return "";
  }

  function num(n) {
    n = n || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".", ",") + "Mn";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + "B";
    return String(n);
  }

  /* ----- Modal ----- */
  var lastFocusedEl = null;

  function openModal(html) {
    var root = document.getElementById("modal-root");
    root.innerHTML = "";
    var backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.addEventListener("click", closeModal);

    var panel = document.createElement("div");
    panel.className = "modal";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.innerHTML = html;

    root.appendChild(backdrop);
    root.appendChild(panel);
    root.classList.add("open");
    document.body.style.overflow = "hidden";

    /* Klavye erişilebilirliği: odağı modal içine al, kapanınca eski konuma dön. */
    lastFocusedEl = document.activeElement;
    var firstFocusable = panel.querySelector("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])");
    if (firstFocusable) firstFocusable.focus();
    else { panel.setAttribute("tabindex", "-1"); panel.focus(); }
    return panel;
  }

  function closeModal() {
    var root = document.getElementById("modal-root");
    root.classList.remove("open");
    root.innerHTML = "";
    document.body.style.overflow = "";
    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
      try { lastFocusedEl.focus(); } catch (e) { /* eleman DOM'dan kaldırılmış olabilir */ }
    }
    lastFocusedEl = null;
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeModal(); closeDropdown(); return; }
    if (e.key !== "Tab") return;
    var root = document.getElementById("modal-root");
    if (!root.classList.contains("open")) return;
    var focusables = root.querySelectorAll("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])");
    if (!focusables.length) { e.preventDefault(); return; }
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ----- Açılır menü (dropdown) ----- */
  var dropdownEl = null;

  function openDropdown(anchor, itemsHtml) {
    closeDropdown();
    var menu = document.createElement("div");
    menu.className = "dropdown-menu";
    menu.setAttribute("role", "menu");
    menu.innerHTML = itemsHtml;
    document.body.appendChild(menu);
    dropdownEl = menu;

    var pad = 6;
    var rect = anchor.getBoundingClientRect();
    var top = rect.bottom + pad;
    var left = rect.right - menu.offsetWidth;
    if (left < pad) left = pad;
    if (top + menu.offsetHeight > window.innerHeight - pad) {
      top = rect.top - menu.offsetHeight - pad;
      if (top < pad) top = pad;
    }
    menu.style.top = top + "px";
    menu.style.left = left + "px";

    setTimeout(function () {
      document.addEventListener("click", onDocClickCapture, true);
      document.addEventListener("scroll", closeDropdown, true);
      window.addEventListener("resize", closeDropdown);
    }, 0);
    return menu;
  }

  function closeDropdown() {
    if (dropdownEl) { dropdownEl.remove(); dropdownEl = null; }
    document.removeEventListener("click", onDocClickCapture, true);
    document.removeEventListener("scroll", closeDropdown, true);
    window.removeEventListener("resize", closeDropdown);
  }

  function onDocClickCapture(e) {
    if (dropdownEl && !dropdownEl.contains(e.target)) closeDropdown();
  }

  window.addEventListener("hashchange", function () { closeDropdown(); closeModal(); });

  /* ----- Toast ----- */
  function toast(msg, kind) {
    var root = document.getElementById("toast-root");
    var t = document.createElement("div");
    t.className = "toast " + (kind || "info");
    var ic = kind === "ok" ? "check" : kind === "err" ? "warn" : "info";
    t.innerHTML = icon(ic) + "<span>" + esc(msg) + "</span>";
    root.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .3s, transform .3s";
      t.style.opacity = "0";
      t.style.transform = "translateY(10px)";
      setTimeout(function () { t.remove(); }, 320);
    }, 2600);
  }

  window.DZ.ui = {
    icon: icon,
    esc: esc,
    timeAgo: timeAgo,
    clockTime: clockTime,
    joinedDate: joinedDate,
    avatarHtml: avatarHtml,
    verifiedHtml: verifiedHtml,
    num: num,
    openModal: openModal,
    closeModal: closeModal,
    openDropdown: openDropdown,
    closeDropdown: closeDropdown,
    toast: toast
  };
})();

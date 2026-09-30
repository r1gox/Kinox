/**
 * Kinox — solo MÓVIL
 * Barra de secciones ABAJO (Inicio, Películas, Series, Anime, JK…)
 * PC: no se inyecta nada; el menú superior sigue igual.
 */
(function () {
  var MQ = window.matchMedia("(max-width: 900px)");

  function cssHref() {
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (/common\.js|mobile-ui\.js/i.test(src)) {
          return src.replace(/\/js\/[^/?]+(\?.*)?$/i, "/css/mobile.css") + "?v=6";
        }
      }
    } catch (_) {}
    if (location.pathname.indexOf("/pages/") !== -1) return "../css/mobile.css?v=6";
    return "css/mobile.css?v=6";
  }

  function ensureCss() {
    var href = cssHref();
    var link = document.getElementById("mz-mobile-css");
    if (!link) {
      link = document.createElement("link");
      link.id = "mz-mobile-css";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = href;
  }

  function linkTo(path) {
    if (typeof appLink === "function") return appLink(path);
    if (location.pathname.indexOf("/pages/") !== -1) {
      if (path === "/" || path === "") return "../index.html";
      return path.replace(/^\//, "") + ".html";
    }
    return path === "/" ? "index.html" : path.replace(/^\//, "") + ".html";
  }

  function currentSection() {
    var path = (location.pathname || "").toLowerCase();
    if (path.includes("peliculas") || path.includes("detalle-pelicula")) return "peliculas";
    if (path.includes("series") || path.includes("detalle-serie")) return "series";
    if (path.includes("anime")) return "anime";
    if (path.includes("/jk") || path.includes("jk.html")) return "jk";
    if (path.includes("favoritos")) return "favoritos";
    if (path.includes("historial")) return "historial";
    if (
      path.includes("perfil") ||
      path.includes("buscar") ||
      path.includes("reproductor") ||
      path.includes("trailer")
    )
      return "";
    return "inicio";
  }

  /** Quitar restos de la barra superior de secciones */
  function removeTopSecBar() {
    var bar = document.getElementById("mz-sec-bar");
    if (bar) bar.remove();
    document.body.classList.remove("mz-has-sec-bar");
  }

  /** Barra INFERIOR con todas las secciones */
  function ensureBottomNav() {
    removeTopSecBar();
    var existing = document.getElementById("mz-bottom-nav");

    if (!MQ.matches) {
      if (existing) existing.remove();
      document.body.classList.remove("mz-has-bottom-nav");
      return;
    }

    document.body.classList.add("mz-has-bottom-nav");

    var items = [
      { id: "inicio", href: "/", ico: "⌂", lbl: "Inicio" },
      { id: "peliculas", href: "/peliculas", ico: "🎬", lbl: "Películas" },
      { id: "series", href: "/series", ico: "📺", lbl: "Series" },
      { id: "anime", href: "/anime", ico: "✦", lbl: "Anime" },
      { id: "jk", href: "/jk", ico: "JK", lbl: "JK" },
      { id: "favoritos", href: "/favoritos", ico: "♥", lbl: "Favoritos" },
      { id: "historial", href: "/historial", ico: "◷", lbl: "Historial" },
    ];

    if (!existing) {
      existing = document.createElement("nav");
      existing.id = "mz-bottom-nav";
      existing.className = "mz-bottom-nav";
      existing.setAttribute("aria-label", "Secciones");
      document.body.appendChild(existing);
    }

    existing.innerHTML = items
      .map(function (it) {
        return (
          '<a data-section="' +
          it.id +
          '" href="' +
          linkTo(it.href) +
          '"><span class="ico" aria-hidden="true">' +
          it.ico +
          '</span><span class="lbl">' +
          it.lbl +
          "</span></a>"
        );
      })
      .join("");

    var sec = currentSection();
    existing.querySelectorAll("a").forEach(function (a) {
      a.classList.toggle("on", a.getAttribute("data-section") === sec);
    });
  }

  function apply() {
    ensureCss();
    ensureBottomNav();
  }

  function boot() {
    apply();
    setTimeout(apply, 40);
    setTimeout(apply, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  if (MQ.addEventListener) MQ.addEventListener("change", apply);
  else if (MQ.addListener) MQ.addListener(apply);

  window.mzMobileUi = { refresh: apply };
})();

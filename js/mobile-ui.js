/**
 * Kinox mobile — barra inferior + carga mobile.css
 * El menú superior lo arregla CSS (flex + order). No reordena el DOM.
 */
(function () {
  var MQ = window.matchMedia("(max-width: 900px)");

  function cssHref() {
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (/common\.js|mobile-ui\.js/i.test(src)) {
          return src.replace(/\/js\/[^/?]+(\?.*)?$/i, "/css/mobile.css") + "?v=4";
        }
      }
    } catch (_) {}
    if (location.pathname.indexOf("/pages/") !== -1) return "../css/mobile.css?v=4";
    return "css/mobile.css?v=4";
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

  function ensureBottomNav() {
    var existing = document.getElementById("mz-bottom-nav");
    if (!MQ.matches) {
      if (existing) existing.remove();
      document.body.classList.remove("mz-has-bottom-nav");
      return;
    }
    document.body.classList.add("mz-has-bottom-nav");
    if (existing) {
      markActive(existing);
      return;
    }
    var nav = document.createElement("nav");
    nav.id = "mz-bottom-nav";
    nav.className = "mz-bottom-nav";
    nav.setAttribute("aria-label", "Navegación rápida");
    var items = [
      { id: "inicio", href: "/", ico: "⌂", lbl: "Inicio" },
      { id: "peliculas", href: "/peliculas", ico: "🎬", lbl: "Películas" },
      { id: "series", href: "/series", ico: "📺", lbl: "Series" },
      { id: "anime", href: "/anime", ico: "✦", lbl: "Anime" },
      { id: "favoritos", href: "/favoritos", ico: "♥", lbl: "Favoritos" },
    ];
    nav.innerHTML = items
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
    document.body.appendChild(nav);
    markActive(nav);
  }

  function markActive(nav) {
    var sec = currentSection();
    nav.querySelectorAll("a").forEach(function (a) {
      a.classList.toggle("on", a.getAttribute("data-section") === sec);
    });
  }

  function apply() {
    ensureCss();
    ensureBottomNav();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
  setTimeout(apply, 50);

  if (MQ.addEventListener) MQ.addEventListener("change", apply);
  else if (MQ.addListener) MQ.addListener(apply);

  window.mzMobileUi = { refresh: apply };
})();

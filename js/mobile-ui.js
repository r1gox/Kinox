/**
 * Kinox mobile UI — reordena el header para que las secciones se vean
 * Solo viewport ≤ 900px. PC no se toca.
 */
(function () {
  var MQ = window.matchMedia("(max-width: 900px)");

  function cssHref() {
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (/common\.js|mobile-ui\.js/i.test(src)) {
          return src.replace(/\/js\/[^/?]+(\?.*)?$/i, "/css/mobile.css");
        }
      }
    } catch (_) {}
    if (location.pathname.indexOf("/pages/") !== -1) return "../css/mobile.css";
    return "css/mobile.css";
  }

  function ensureCss() {
    var href = cssHref() + (hrefHasBust() ? "" : "?v=3");
    var link = document.getElementById("mz-mobile-css");
    if (!link) {
      link = document.createElement("link");
      link.id = "mz-mobile-css";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") !== href) link.href = href;
  }

  function hrefHasBust() {
    return false;
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

  /**
   * Reordena #top:
   *   [ .mz-m-top: logo | buscar | perfil ]
   *   [ nav: Inicio Películas Series … ]
   * En PC se deshace y queda el orden original.
   */
  function layoutHeader() {
    var header = document.getElementById("top") || document.querySelector("header");
    if (!header) return;

    var logo = header.querySelector(".logo");
    var nav = header.querySelector("nav");
    var sf = header.querySelector("#sf");
    var prof = header.querySelector("#prof");

    if (!MQ.matches) {
      // Restaurar orden PC: logo, nav, sf, prof
      var wrap = header.querySelector(".mz-m-top");
      if (wrap) {
        while (wrap.firstChild) header.insertBefore(wrap.firstChild, wrap);
        wrap.remove();
      }
      if (logo) header.appendChild(logo);
      if (nav) header.appendChild(nav);
      if (sf) header.appendChild(sf);
      if (prof) header.appendChild(prof);
      header.classList.remove("mz-m-header");
      // limpiar estilos inline
      header.removeAttribute("style");
      if (nav) nav.removeAttribute("style");
      return;
    }

    if (!logo || !nav || !sf || !prof) return;

    header.classList.add("mz-m-header");

    var topRow = header.querySelector(".mz-m-top");
    if (!topRow) {
      topRow = document.createElement("div");
      topRow.className = "mz-m-top";
      header.insertBefore(topRow, header.firstChild);
    }

    // Fila superior
    topRow.appendChild(logo);
    topRow.appendChild(sf);
    topRow.appendChild(prof);
    // Nav debajo del top row
    if (nav.parentNode !== header || topRow.nextSibling !== nav) {
      header.insertBefore(nav, topRow.nextSibling);
    }

    // Asegurar visibles
    nav.style.display = "flex";
    nav.style.visibility = "visible";
    nav.style.opacity = "1";
    nav.style.width = "100%";
    nav.style.overflowX = "auto";
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
    // también marca el nav superior
    try {
      var topNav = document.querySelector("header nav");
      if (topNav) {
        topNav.querySelectorAll("a").forEach(function (a) {
          a.classList.toggle("on", a.getAttribute("data-section") === sec);
        });
      }
    } catch (_) {}
  }

  function apply() {
    ensureCss();
    layoutHeader();
    ensureBottomNav();
  }

  function boot() {
    apply();
    // nav() de common puede correr justo antes; reaplicar
    setTimeout(apply, 0);
    setTimeout(apply, 100);
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

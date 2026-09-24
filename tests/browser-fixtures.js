(function installBrowserFixtureTool() {
  "use strict";

  function responseJson(bindings, status, headers) {
    return new Response(JSON.stringify({
      head: { vars: ["id", "subject", "predicate", "object"] },
      results: { bindings: bindings || [] },
    }), {
      status: status || 200,
      headers: Object.assign({ "Content-Type": "application/sparql-results+json" }, headers || {}),
    });
  }

  function fixtureRowsForPage(start, count, mode) {
    if (mode === "all-invalid") {
      return makeGastroPage(start, count, { lat: 0, lng: 0 });
    }
    if (mode === "xss") {
      return makeGastroPage(start, count, {
        name: '<img src=x onerror="window.__gastroXss=1">',
        description: '<script>window.__gastroXssDescription=1</script>',
      });
    }
    const imageMode = (mode === "image-fail" || mode === "image") && start === 0;
    return makeGastroPage(start, count, imageMode ? {
      images: [{
        id: "fixture-image",
        url: mode === "image-fail"
          ? "http://127.0.0.1:8765/tests/fixtures/broken-image.png"
          : "http://127.0.0.1:8765/tests/fixtures/photo.svg",
        title: mode === "image-fail" ? "Absichtlich defektes Testbild" : "Synthetische Testillustration",
        credit: "Gastrofinder Testfixture",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      }],
    } : {});
  }

  function readGastroFixtureState() {
    const root = document.getElementById("main-content");
    const state = root && root.gastroState;
    return {
      root,
      state,
      view: state?.view || "map",
      catalogOpen: Boolean(state?.runtime?.catalogOpen),
      mobileView: state?.runtime?.mobileView || "map",
      focusedControl: document.activeElement?.getAttribute("data-gf-control") || "",
    };
  }

  function clickGastroFixtureControl(selector) {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Browser-Fixture-Control fehlt: ${selector}`);
    element.click();
    return true;
  }

  function installGastroFixture(mode = "success") {
    const originalFetch = window.fetch.bind(window);
    const originalConfig = configData;
    const root = document.getElementById("main-content");
    const result = {
      mode,
      requests: [],
      unexpected: [],
      errors: [],
    };
    let pageNumber = 0;

    if (typeof onPageLeave === "function") onPageLeave("startseite");
    configData = Object.assign({}, originalConfig, {
      titel: "Gastrofinder",
      seitentitel: "Gastrofinder · Browser-Fixture",
      ort: "Berlin",
      radiusKm: "25",
      latitude: "52.52",
      longitude: "13.405",
      apiurls: [{
        name: "dztsparql",
        label: "DZT SPARQL",
        url: "https://proxy.opendatagermany.io/api/ts/v1/kg/sparql",
      }],
    });

    window.fetch = async (input, init) => {
      const raw = String(input);
      let url;
      try { url = new URL(raw, window.location.href); } catch (_error) { url = null; }
      if (url && (url.hostname === "proxy.opendatagermany.io" || url.pathname.includes("/odp-data"))) {
        result.unexpected.push(raw);
        return new Response("blocked direct data access", { status: 403 });
      }
      if (!url || !url.pathname.endsWith("/dzt") || !url.searchParams.has("path")) {
        return originalFetch(input, init);
      }
      result.requests.push(raw);
      const path = url.searchParams.get("path");
      const query = new URLSearchParams(path.split("?")[1] || "").get("query") || "";
      const detailMatch = query.match(/VALUES\s+\?id\s+\{\s+<([^>]+)>/);
      if (detailMatch) {
        if (mode === "detail-error") return new Response("detail unavailable", { status: 500 });
        const detailImages = mode === "image" || mode === "image-fail" ? [{
          id: "fixture-detail-image",
          url: mode === "image-fail"
            ? "http://127.0.0.1:8765/tests/fixtures/broken-image.png"
            : "http://127.0.0.1:8765/tests/fixtures/photo.svg",
          title: mode === "image-fail" ? "Absichtlich defektes Testbild" : "Synthetische Testillustration",
          credit: "Gastrofinder Testfixture",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        }] : [];
        return responseJson(makeGastroRows({
          id: detailMatch[1],
          images: detailImages,
          ...(mode === "xss" ? {
            name: '<img src=x onerror="window.__gastroXss=1">',
            description: '<script>window.__gastroXssDescription=1</script>',
          } : {}),
        }));
      }
      if (mode === "empty") return responseJson([]);
      if (mode === "error-401") return new Response("unauthorized", { status: 401 });
      if (mode === "error-403") return new Response("forbidden", { status: 403 });
      if (mode === "error-404") return new Response("relay missing", { status: 404 });
      if (mode === "error-429") return new Response("rate limited", { status: 429, headers: { "Retry-After": "60" } });
      if (mode === "error-500") return new Response("server error", { status: 500 });
      if (mode === "html-200") return new Response("<html>synthetic error</html>", { status: 200 });
      if (mode === "broken-json") return new Response("{not-json", { status: 200 });
      if (mode === "all-invalid") return responseJson(fixtureRowsForPage(0, 200, mode));
      if (mode === "paging") {
        const start = pageNumber * 200;
        const count = pageNumber < 2 ? 200 : pageNumber === 2 ? 1 : 0;
        pageNumber += 1;
        return responseJson(fixtureRowsForPage(start, count, mode));
      }
      return responseJson(fixtureRowsForPage(0, 200, mode));
    };

    const banner = document.createElement("div");
    banner.dataset.gfFixtureBanner = "true";
    banner.textContent = "Synthetische Testdaten · keine Live-Daten";
    banner.style.cssText = "position:relative;z-index:9999;display:block;padding:6px 12px;background:#193629;color:#fffdf7;font:700 12px system-ui;text-align:center";
    const fixtureStyle = document.createElement("style");
    fixtureStyle.dataset.gfFixtureStyle = "true";
    fixtureStyle.textContent = "body.gf-app-fullscreen .gf-fullscreen-wrapper{top:28px!important;bottom:auto!important;height:calc(100dvh - 28px)!important}";
    document.head.appendChild(fixtureStyle);
    document.body.insertBefore(banner, document.body.firstChild);
    window.gastroFixtureResult = result;
    Promise.resolve(typeof loadPage === "function" ? loadPage("startseite") : null)
      .catch((error) => result.errors.push(String(error && error.message || error)))
      .finally(() => {
        const snapshot = readGastroFixtureState();
        result.view = snapshot.view;
        result.catalogOpen = snapshot.catalogOpen;
        result.mobileView = snapshot.mobileView;
        result.focusedControl = snapshot.focusedControl;
        result.ready = true;
      });
    window.gastroFixtureActions = {
      state: readGastroFixtureState,
      click: clickGastroFixtureControl,
      catalog: () => clickGastroFixtureControl("[data-gf-catalog-toggle]"),
      cockpit: () => clickGastroFixtureControl("[data-gf-cockpit-toggle]"),
      mobile: () => clickGastroFixtureControl("[data-gf-bottom-switcher]"),
      detailClose: () => clickGastroFixtureControl("[data-gf-close]"),
      secondaryBack: () => clickGastroFixtureControl(".gf-secondary-back-link"),
    };
    return result;
  }

  function uninstallGastroFixture() {
    const state = window.gastroFixtureOriginal;
    if (state) {
      window.fetch = state.fetch;
      configData = state.config;
      const root = document.getElementById("main-content");
      if (root && root.gastroState) {
        if (typeof onPageLeave === "function") onPageLeave("startseite");
        root.gastroState = null;
      }
      if (typeof loadPage === "function") return loadPage("startseite");
      document.querySelectorAll("[data-gf-fixture-banner]").forEach((node) => node.remove());
      document.querySelectorAll("[data-gf-fixture-style]").forEach((node) => node.remove());
      window.gastroFixtureResult = null;
      window.gastroFixtureOriginal = null;
    }
    return Promise.resolve();
  }

  window.installGastroFixture = function (mode) {
    const previous = window.gastroFixtureOriginal;
    if (previous) uninstallGastroFixture();
    const originalFetch = window.fetch.bind(window);
    const originalConfig = configData;
    window.gastroFixtureOriginal = { fetch: originalFetch, config: originalConfig };
    return installGastroFixture(mode || "success");
  };
  window.uninstallGastroFixture = uninstallGastroFixture;
}());

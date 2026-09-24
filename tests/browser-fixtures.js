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
    const imageMode = mode === "image-fail" && start === 0;
    return makeGastroPage(start, count, imageMode ? {
      images: [{
        id: "fixture-image",
        url: "http://127.0.0.1:8765/tests/fixtures/broken-image.png",
        title: "Absichtlich defektes Testbild",
        credit: "Gastrofinder Testfixture",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      }],
    } : {});
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
        return responseJson(makeGastroRows({ id: detailMatch[1] }));
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
    banner.style.cssText = "position:fixed;z-index:9999;top:0;left:0;right:0;padding:6px 12px;background:#193629;color:#fffdf7;font:700 12px system-ui;text-align:center";
    document.body.appendChild(banner);
    window.gastroFixtureResult = result;
    Promise.resolve(typeof loadPage === "function" ? loadPage("startseite") : null)
      .catch((error) => result.errors.push(String(error && error.message || error)))
      .finally(() => { result.ready = true; });
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

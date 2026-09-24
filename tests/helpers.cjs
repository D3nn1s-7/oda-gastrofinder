const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadApp(overrides = {}) {
  const box = vm.createContext({
    console,
    URL,
    URLSearchParams,
    AbortController,
    Response,
    Headers,
    Map,
    Set,
    setTimeout,
    clearTimeout,
    fetch: async () => {
      throw new Error("Unerwarteter Netzwerkzugriff im Test");
    },
    ...overrides,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8"),
    box,
    { filename: "app/app.js" },
  );
  return box;
}

const validConfig = {
  ort: "Berlin",
  radiusKm: "25",
  latitude: "52.52",
  longitude: "13.405",
  apiurls: [
    {
      name: "dztsparql",
      label: "DZT SPARQL",
      url: "https://proxy.opendatagermany.io/api/ts/v1/kg/sparql",
    },
  ],
};

module.exports = { loadApp, validConfig };

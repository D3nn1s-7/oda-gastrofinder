function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getOdasApiUrl(configdata, name) {
  const entries = Array.isArray(configdata && configdata.apiurls) ? configdata.apiurls : [];
  const match = entries.find((entry) => entry && entry.name === name);
  return String((match && match.url) || "").trim();
}

function getOdasAppBasePath(pathname) {
  let appPath =
    pathname === undefined
      ? typeof window !== "undefined"
        ? window.location.pathname
        : "/"
      : String(pathname || "/");

  if (!appPath.endsWith("/")) {
    const lastSlashIndex = appPath.lastIndexOf("/");
    const lastSegment = appPath.substring(lastSlashIndex + 1);
    if (lastSegment.includes(".")) {
      appPath = appPath.substring(0, lastSlashIndex + 1);
    }
  }

  return appPath.replace(/\/+$/, "");
}

function gastroConfigError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseGastroNumber(value, label, errorLabel = label) {
  const text = String(value == null ? "" : value).trim();
  if (!text) {
    throw gastroConfigError("CONFIG", `${errorLabel} darf nicht leer sein.`);
  }
  const number = Number(text);
  if (!Number.isFinite(number)) {
    throw gastroConfigError("CONFIG", `${errorLabel} muss eine endliche Zahl sein.`);
  }
  return number;
}

function validateGastroSource(config) {
  const sourceUrl = getOdasApiUrl(config, "dztsparql");
  if (
    !sourceUrl ||
    /^\{\{.*\}\}$/.test(sourceUrl) ||
    /^<.*>$/.test(sourceUrl)
  ) {
    throw gastroConfigError(
      "NO_SOURCE",
      "Es ist keine gültige DZT-Datenquelle namens dztsparql konfiguriert.",
    );
  }

  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch (_error) {
    throw gastroConfigError("CONFIG", "Die DZT-Datenquelle ist keine gültige URL.");
  }

  const expected = "https://proxy.opendatagermany.io/api/ts/v1/kg/sparql";
  if (
    parsed.href !== expected ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw gastroConfigError(
      "CONFIG",
      "Die DZT-Datenquelle muss der freigegebene HTTPS-SPARQL-Endpunkt sein.",
    );
  }
  return sourceUrl;
}

function validateGastroConfig(config = {}) {
  const sourceUrl = validateGastroSource(config);
  const ort = String(config.ort == null ? "" : config.ort).trim();
  if (!ort) {
    throw gastroConfigError(
      "CONFIG",
      "Der Ort muss vom Portalbetreiber angegeben werden.",
    );
  }

  const radiusKm = parseGastroNumber(config.radiusKm, "Der Umkreis");
  if (![5, 10, 25, 50, 100].includes(radiusKm)) {
    throw gastroConfigError("CONFIG", "Der Umkreis muss 5, 10, 25, 50 oder 100 km betragen.");
  }

  const latitudeText = String(config.latitude == null ? "" : config.latitude).trim();
  const longitudeText = String(config.longitude == null ? "" : config.longitude).trim();
  if (!latitudeText && !longitudeText) {
    return { sourceUrl, ort, radiusKm, explicitCenter: null };
  }
  if (!latitudeText || !longitudeText) {
    throw gastroConfigError(
      "CONFIG",
      "Die Koordinaten müssen als vollständiges Paar aus Breiten- und Längengrad angegeben werden.",
    );
  }

  const lat = parseGastroNumber(latitudeText, "Breitengrad", "Die Koordinaten beim Breitengrad");
  const lng = parseGastroNumber(longitudeText, "Längengrad", "Die Koordinaten beim Längengrad");
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw gastroConfigError("CONFIG", "Die angegebenen Koordinaten liegen außerhalb der gültigen Weltgrenzen.");
  }

  return { sourceUrl, ort, radiusKm, explicitCenter: { lat, lng } };
}

function app(configdata = {}, enclosingHtmlDivElement) {
  if (!enclosingHtmlDivElement) {
    throw new Error("Der Inhaltsbereich der App wurde nicht gefunden.");
  }

  try {
    const config = validateGastroConfig(configdata);
    enclosingHtmlDivElement.innerHTML = `
      <section class="gf-root" aria-label="Gastrofinder">
        <h1>${escapeHtml(config.ort)}</h1>
        <p role="status">Der Gastrofinder wird vorbereitet.</p>
      </section>`;
  } catch (error) {
    const message = error && error.message ? error.message : "Die App ist nicht konfiguriert.";
    enclosingHtmlDivElement.innerHTML = `
      <div class="alert alert-danger" role="alert">${escapeHtml(message)}</div>`;
  }
}

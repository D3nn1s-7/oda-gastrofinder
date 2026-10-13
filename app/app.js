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

function normalizeGastroPlaceName(value) {
  return String(value == null ? "" : value)
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("de-DE");
}

function isValidGastroCoordinate(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function resolveGastroRegion(validated, places = []) {
  if (validated.explicitCenter) {
    return {
      ort: validated.ort,
      lat: validated.explicitCenter.lat,
      lng: validated.explicitCenter.lng,
      radiusKm: validated.radiusKm,
    };
  }

  const wanted = normalizeGastroPlaceName(validated.ort);
  const matches = Array.isArray(places)
    ? places.filter((place) => normalizeGastroPlaceName(place && place.name) === wanted)
    : [];
  if (matches.length === 0) {
    throw gastroConfigError(
      "CONFIG",
      `Der Ort „${validated.ort}" wurde im mitgelieferten Ortsindex nicht gefunden. Bitte explizite Koordinaten angeben.`,
    );
  }
  if (matches.length > 1) {
    throw gastroConfigError(
      "CONFIG",
      `Der Ort „${validated.ort}" ist mehrdeutig. Bitte explizite Koordinaten angeben.`,
    );
  }

  const place = matches[0];
  if (
    !place ||
    !isValidGastroCoordinate(Number(place.lat), -90, 90) ||
    !isValidGastroCoordinate(Number(place.lng), -180, 180)
  ) {
    throw gastroConfigError("CONFIG", "Der eindeutige Ortsindex-Eintrag enthält ungültige Koordinaten.");
  }
  return {
    ort: validated.ort,
    lat: Number(place.lat),
    lng: Number(place.lng),
    radiusKm: validated.radiusKm,
  };
}

function distanceKm(a, b) {
  if (
    !a ||
    !b ||
    !isValidGastroCoordinate(Number(a.lat), -90, 90) ||
    !isValidGastroCoordinate(Number(b.lat), -90, 90) ||
    !isValidGastroCoordinate(Number(a.lng), -180, 180) ||
    !isValidGastroCoordinate(Number(b.lng), -180, 180)
  ) {
    return Number.NaN;
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(Number(a.lat));
  const lat2 = toRadians(Number(b.lat));
  const deltaLat = toRadians(Number(b.lat) - Number(a.lat));
  const deltaLng = toRadians(Number(b.lng) - Number(a.lng));
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function isInGastroRegion(point, region) {
  if (
    !point ||
    !region ||
    !isValidGastroCoordinate(Number(point.lat), -90, 90) ||
    !isValidGastroCoordinate(Number(point.lng), -180, 180) ||
    !isValidGastroCoordinate(Number(region.lat), -90, 90) ||
    !isValidGastroCoordinate(Number(region.lng), -180, 180) ||
    !Number.isFinite(Number(region.radiusKm)) ||
    Number(region.radiusKm) < 0
  ) {
    return false;
  }
  return distanceKm(region, point) <= Number(region.radiusKm);
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

function isGastroTerm(term) {
  return Boolean(
    term &&
      typeof term === "object" &&
      ["uri", "bnode", "literal"].includes(term.type) &&
      typeof term.value === "string",
  );
}

function compareSourceIds(a, b) {
  const left = Array.from(String(a == null ? "" : a));
  const right = Array.from(String(b == null ? "" : b));
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftCode = left[index].codePointAt(0);
    const rightCode = right[index].codePointAt(0);
    if (leftCode !== rightCode) return leftCode < rightCode ? -1 : 1;
  }
  if (left.length === right.length) return 0;
  return left.length < right.length ? -1 : 1;
}

function sparqlIri(value) {
  const text = String(value == null ? "" : value);
  if (
    !/^https?:\/\//i.test(text) ||
    /[\u0000-\u0020<>"{}|^`\\]/.test(text) ||
    text.includes("//", 8)
  ) {
    throw new Error("Ungültige oder unsichere IRI.");
  }
  let parsed;
  try {
    parsed = new URL(text);
  } catch (_error) {
    throw new Error("Ungültige oder unsichere IRI.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Ungültige oder unsichere IRI.");
  }
  return `<${text}>`;
}

function safeHttpUrl(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text || /[\u0000-\u0020]/.test(text) || text.startsWith("//")) return "";
  try {
    const parsed = new URL(text);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
    return text;
  } catch (_error) {
    return "";
  }
}

function isKeineDatenquelleKonfiguriert(targetUrl) {
  const quelle = String(targetUrl || "").trim();
  return !quelle || /^\{\{.*\}\}$/.test(quelle) || /^<.*>$/.test(quelle);
}

// var statt const: app.js muss ohne Lexical-Kollision zweimal ladbar sein.
var TYP_BEZEICHNUNG = {
  "ckan-dkan-ds": "Tabellen-API mit Daten-ID",
  "ckan-ps": "Datensatz-API",
  "ckan-dl": "Datei-Download",
  "ods21": "Open-Data-Suche (API v2.1)",
  "wfs": "Kartendienst (WFS)",
  "sparql": "Wissensdatenbank (SPARQL)",
  "csv-zip": "Statische Datei"
}

function validateUrlTypErwartung(url, erwarteterTyp) {
  const u = String(url || "");
  if (!erwarteterTyp || isKeineDatenquelleKonfiguriert(u)) return null;
  const checks = {
    "ckan-dkan-ds": /\/api\/3\/action\/datastore_search\?resource_id=/i,
    "ckan-ps": /\/api\/3\/action\/package_show\?id=/i,
    "ckan-dl": /\/dataset\/.*\/resource\/.*\/download\//i,
    "ods21": /\/api\/explore\/v2\.1\//i,
    "wfs": /service=WFS/i,
    "sparql": /\/api\/ts\/v1\/kg\/sparql/i,
    "csv-zip": /\.(csv|json|zip)(\?|$)/i
  };
  const re = checks[erwarteterTyp];
  if (!re) return null;
  if (!re.test(u)) {
    const soll = TYP_BEZEICHNUNG[erwarteterTyp] || erwarteterTyp;
    return `Typ passt nicht: erwartet „${soll}", erhalten „${u.slice(0, 60)}…". Prüfen Sie den Hilfe-Tooltip bei „URLs zu Datenressourcen".`;
  }
  return null;
}

function classifyOdasFehler(error, kontext = {}) {
  const msg = String((error && error.message) || error || "");
  const url = String(kontext.url || "");
  const label = String(kontext.label || "Datenressource");
  const typLabel = String(kontext.typLabel || TYP_BEZEICHNUNG[kontext.erwarteterTyp] || "Datenquelle");
  if (/Keine Datenquelle konfiguriert/i.test(msg) || isKeineDatenquelleKonfiguriert(url)) {
    return {
      kind: "KEINE_QUELLE",
      titel: "Es ist keine Datenquelle konfiguriert.",
      hinweis: `Prüfen Sie unter „URLs zu Datenressourcen → ${label}" ob eine gültige ${typLabel}-URL eingetragen ist (Hilfe-Tooltip beachten).`,
      detail: msg,
      alertClass: "alert-info"
    };
  }
  if (/Typ passt nicht: erwartet/i.test(msg)) {
    return {
      kind: "TYP_MISMATCH",
      titel: msg,
      hinweis: `Diese App erwartet ${typLabel}. Korrigieren Sie die URL gemäß Hilfe-Tooltip (Beispiel dort).`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/URL origin not allowed/i.test(msg)) {
    return {
      kind: "PROXY_ORIGIN",
      titel: "ODAS-Proxy blockiert: Ziel-Origin nicht freigegeben.",
      hinweis: "Tragen Sie die Ziel-Origin als eigenen Eintrag unter „URLs zu Datenressourcen“ ein oder prüfen Sie proxyAktiv.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/ODAS-Proxy-Fehler/i.test(msg) || /kein content-String/i.test(msg)) {
    return {
      kind: "PROXY_HTTP",
      titel: msg,
      hinweis: "Prüfen Sie proxyAktiv und Erreichbarkeit im ODAS-Live-System (lokal 404 ist normal).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/Direkter Datenabruf fehlgeschlagen/i.test(msg) || /Failed to fetch/i.test(msg)) {
    const corsHint = /Failed to fetch/i.test(msg) ? " – vermutlich CORS blockiert → im ODAS-Live proxyAktiv=ja." : "";
    return {
      kind: "DIREKT_CORS_HTTP",
      titel: msg,
      hinweis: `Prüfen Sie URL und CORS der Quelle${corsHint}`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/liefert kein JSON/i.test(msg) || /HTML-Seite|CSV-|leere Antwort|unlesbaren/i.test(msg)) {
    return {
      kind: "PAYLOAD_TYP",
      titel: msg,
      hinweis: "Tragen Sie den passenden Endpunkt ein – nicht die Datensatzseite (/dataset/…) – Hilfe-Tooltip beachten.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/CKAN.*Fehler|success:false/i.test(msg)) {
    return {
      kind: "CKAN_API",
      titel: msg,
      hinweis: "Prüfen Sie Daten-ID / Datensatz-ID (existiert die Tabelle/Datei noch auf dem Portal?).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/404|Nicht gefunden/i.test(msg)) {
    return {
      kind: "HTTP_404",
      titel: msg,
      hinweis: "Ressource/Datensatz auf dem Portal nicht gefunden (404).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  return {
    kind: "UNBEKANNT",
    titel: msg || "Unbekannter Fehler beim Laden.",
    hinweis: "Prüfen Sie Konfiguration und Erreichbarkeit der Quelle.",
    detail: msg,
    alertClass: "alert-danger"
  };
}

function renderOdasFehler(container, error, kontext = {}) {
  if (!container) return;
  const typWarn = validateUrlTypErwartung(kontext.url, kontext.erwarteterTyp);
  if (typWarn && !/Typ passt nicht/i.test(String(error && error.message))) {
    error = new Error(typWarn);
  }
  const info = classifyOdasFehler(error, kontext);
  const url = String(kontext.url || "");
  const urlZeile = url ? `<p class="mb-1 small text-muted">Konfigurierte URL: <code>${escapeHtml(url.length > 80 ? url.slice(0, 80) + "…" : url)}</code></p>` : "";
  const titel = kontext.leer ? "Keine Datensätze gefunden." : info.titel;
  const alertClass = kontext.leer ? "alert-info" : info.alertClass;
  container.innerHTML = `<div class="alert ${alertClass}" role="alert"><strong>${escapeHtml(titel)}</strong><p class="mb-1">${escapeHtml(info.hinweis)}</p>${urlZeile}<details class="small"><summary>Details</summary><code>${escapeHtml(info.detail || String(error))}</code></details></div>`;
}

function safeTelephone(value) {
  const text = String(value == null ? "" : value).trim();
  return /^[+0-9()./\-\s]{3,}$/.test(text) ? text : "";
}

function pushUnique(values, value) {
  if (value !== "" && value !== null && value !== undefined && !values.includes(value)) values.push(value);
}

function dztError(code, message, status, retryAt) {
  const error = new Error(message);
  error.code = code;
  if (status !== undefined) error.status = status;
  if (retryAt !== undefined) error.retryAt = retryAt;
  return error;
}

function buildGastroSparqlQuery(lat, lng, radiusKm) {
  let geoFilter = "";
  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);
  const radius = parseFloat(radiusKm) || 25;

  if (!isNaN(numLat) && !isNaN(numLng) && numLat !== 0 && numLng !== 0) {
    const geoShapeJson = JSON.stringify({
      query: {
        geo_shape: {
          geometry: {
            shape: {
              type: "circle",
              radius: `${radius}km`,
              coordinates: [numLng, numLat],
            },
            relation: "intersects",
          },
        },
      },
    });
    geoFilter = `
  ?search a inst:dzt-geo-shapes ;
    con:query ${JSON.stringify(geoShapeJson)} ;
    con:entities ?s .`;
  }

  return `PREFIX inst: <http://www.ontotext.com/connectors/elasticsearch/instance#>
PREFIX con: <http://www.ontotext.com/connectors/elasticsearch#>
PREFIX schema: <https://schema.org/>

SELECT ?s 
  (SAMPLE(?nameDe) AS ?name)
  (SAMPLE(?descDe) AS ?desc)
  (SAMPLE(?latVal) AS ?lat)
  (SAMPLE(?lngVal) AS ?lng)
  (SAMPLE(?streetVal) AS ?street)
  (SAMPLE(?postalVal) AS ?postal)
  (SAMPLE(?cityVal) AS ?city)
  (SAMPLE(?phoneVal) AS ?phone)
  (SAMPLE(?webVal) AS ?web)
  (SAMPLE(?imgUrl) AS ?img)
  (GROUP_CONCAT(DISTINCT ?imgUrl; separator="|") AS ?imgs)
  (GROUP_CONCAT(DISTINCT ?type; separator=",") AS ?types)
  (GROUP_CONCAT(DISTINCT ?cuisineVal; separator=", ") AS ?cuisines)
WHERE {${geoFilter}
  VALUES ?targetType {
    schema:Restaurant
    schema:CafeOrCoffeeShop
  }
  ?s a ?targetType .
  OPTIONAL { ?s a ?type }
  ?s schema:name ?nameDe .
  FILTER(lang(?nameDe) = "de" || lang(?nameDe) = "")
  OPTIONAL {
    ?s schema:description ?descDe .
    FILTER(isLiteral(?descDe) && (lang(?descDe) = "de" || lang(?descDe) = ""))
  }
  OPTIONAL {
    ?s schema:geo ?geo .
    ?geo schema:latitude ?latVal .
    ?geo schema:longitude ?lngVal .
  }
  OPTIONAL {
    ?s schema:address ?addr .
    OPTIONAL { ?addr schema:streetAddress ?streetVal }
    OPTIONAL { ?addr schema:postalCode ?postalVal }
    OPTIONAL { ?addr schema:addressLocality ?cityVal }
  }
  OPTIONAL { ?s schema:telephone ?phoneVal }
  OPTIONAL { ?s schema:url ?webVal }
  OPTIONAL { ?s schema:servesCuisine ?cuisineVal }
  OPTIONAL {
    {
      ?s schema:image ?imgObj .
      ?imgObj schema:contentUrl ?imgUrl .
    } UNION {
      ?s schema:image ?imgDirect .
      FILTER(isIRI(?imgDirect))
      BIND(STR(?imgDirect) AS ?imgUrl)
    } UNION {
      ?s schema:photo ?photoObj .
      ?photoObj schema:contentUrl ?imgUrl .
    } UNION {
      ?s schema:thumbnailUrl ?thumbUrl .
      BIND(STR(?thumbUrl) AS ?imgUrl)
    }
  }
}
GROUP BY ?s
LIMIT 300`;
}

function convertGastroBindingToPoi(b, refLat, refLng) {
  const types = b.types && b.types.value ? b.types.value.split(",") : ["https://schema.org/Restaurant"];
  const isRestaurant = types.some((t) => t.includes("Restaurant"));
  const isCafe = types.some((t) => t.includes("Cafe") || t.includes("CoffeeShop"));

  let images = [];
  if (b.imgs && b.imgs.value) {
    const urls = b.imgs.value.split("|").map((u) => u.trim()).filter(Boolean);
    images = urls.map((u) => ({ "@type": "ImageObject", "schema:contentUrl": u }));
  } else if (b.img && b.img.value) {
    images = [{ "@type": "ImageObject", "schema:contentUrl": b.img.value }];
  }

  const lat = b.lat && b.lat.value ? parseFloat(b.lat.value) : null;
  const lng = b.lng && b.lng.value ? parseFloat(b.lng.value) : null;

  let distKm = null;
  if (lat !== null && lng !== null && typeof refLat === "number" && typeof refLng === "number") {
    const calc = distanceKm({ lat: refLat, lng: refLng }, { lat, lng });
    if (!isNaN(calc)) distKm = Math.round(calc * 10) / 10;
  }

  const name = b.name && b.name.value ? b.name.value : "Gastrobetrieb";
  const desc = b.desc && b.desc.value ? b.desc.value : "";

  return {
    id: b.s ? b.s.value : "",
    name,
    description: desc,
    lat,
    lng,
    distanceKm: distKm,
    street: b.street ? b.street.value : "",
    postalCode: b.postal ? b.postal.value : "",
    city: b.city ? b.city.value : "",
    phone: b.phone ? b.phone.value : "",
    website: b.web ? b.web.value : "",
    cuisines: b.cuisines ? b.cuisines.value : "",
    types,
    isRestaurant,
    isCafe,
    imageUrl: images.length > 0 ? images[0]["schema:contentUrl"] : "",
    images,
    raw: b,
  };
}

function buildSparqlPrefixes() {
  return [
    "PREFIX schema: <https://schema.org/>",
    "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>",
    "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>",
    "PREFIX inst: <http://www.ontotext.com/connectors/elasticsearch/instance#>",
    "PREFIX con: <http://www.ontotext.com/connectors/elasticsearch#>",
  ].join("\n");
}

function validateGastroQueryRegion(region) {
  if (
    !region ||
    !isValidGastroCoordinate(Number(region.lat), -90, 90) ||
    !isValidGastroCoordinate(Number(region.lng), -180, 180) ||
    ![5, 10, 25, 50, 100].includes(Number(region.radiusKm))
  ) {
    throw new Error("Ungültige Region für die DZT-Abfrage.");
  }
}

function buildGastroFieldList(fields) {
  return `VALUES ?predicate { ${fields.join(" ")} }`;
}

function buildGastroQuery(region, idPage, detail) {
  const rootFields = [
    "rdf:type",
    "schema:name",
    "schema:geo",
    "schema:address",
    "schema:servesCuisine",
    "schema:sdLicense",
    "schema:sdPublisher",
    "schema:publisher",
    "schema:license",
    "schema:creator",
    "schema:author",
    "schema:copyrightHolder",
    "schema:copyrightNotice",
    "schema:creditText",
    "schema:image",
  ];
  if (detail) rootFields.push("schema:description", "schema:url", "schema:telephone", "schema:openingHoursSpecification");
  const childFields = [
    "schema:latitude",
    "schema:longitude",
    "schema:streetAddress",
    "schema:postalCode",
    "schema:addressLocality",
    "schema:addressRegion",
    "schema:name",
    "schema:url",
    "rdfs:label",
    "schema:license",
    "schema:copyrightNotice",
    "schema:creditText",
    "schema:contentUrl",
    "schema:caption",
    "schema:creator",
    "schema:author",
    "schema:copyrightHolder",
  ];
  if (detail) childFields.push("schema:text");
  const hourFields = ["schema:dayOfWeek", "schema:opens", "schema:closes", "schema:validFrom", "schema:validThrough"];
  const subjectImageFilter = "FILTER NOT EXISTS { ?id schema:image ?other . FILTER(STR(?other) < STR(?subject)) }";
  const rootPart = `
  {
    ?id ?rootPredicate ?object .
    BIND(?id AS ?subject)
    BIND(?rootPredicate AS ?predicate)
    VALUES ?rootPredicate { ${rootFields.join(" ")} }
    ${detail ? "" : `FILTER (?rootPredicate != schema:image || NOT EXISTS { ?id schema:image ?other . FILTER(STR(?other) < STR(?object)) })`}
  }
  UNION
  {
    ?id ?link ?subject .
    VALUES ?link { schema:geo schema:address schema:sdLicense schema:sdPublisher schema:publisher schema:creator schema:author schema:copyrightHolder ${detail ? "schema:description" : ""} }
    ?subject ?predicate ?object .
    ${buildGastroFieldList(childFields)}
  }
  UNION
  {
    ?id schema:image ?subject .
    ?subject ?predicate ?object .
    ${buildGastroFieldList(childFields)}
    ${detail ? "" : subjectImageFilter}
  }
  ${detail ? `UNION
  {
    ?id schema:openingHoursSpecification ?subject .
    ?subject ?predicate ?object .
    ${buildGastroFieldList(hourFields)}
  }` : ""}
  UNION
  {
    ?id ?rightsLink ?rightsNode .
    VALUES ?rightsLink { schema:image schema:sdLicense }
    ?rightsNode ?rightsParty ?subject .
    VALUES ?rightsParty { schema:creator schema:author schema:copyrightHolder }
    ?subject ?predicate ?object .
    VALUES ?predicate { schema:name schema:url rdfs:label }
  }`;
  return `${buildSparqlPrefixes()}\nSELECT DISTINCT ?id ?subject ?predicate ?object WHERE {\n  { ${idPage} }\n  ${rootPart}\n}\nORDER BY STR(?id) STR(?subject) STR(?predicate) STR(?object)`;
}

function buildOverviewQuery(region, cursor = "") {
  validateGastroQueryRegion(region);
  const safeCursor = String(cursor || "").trim();
  if (safeCursor) sparqlIri(safeCursor);
  const shape = JSON.stringify({
    query: {
      geo_shape: {
        geometry: {
          shape: {
            type: "circle",
            radius: `${Number(region.radiusKm)}km`,
            coordinates: [Number(region.lng), Number(region.lat)],
          },
          relation: "intersects",
        },
      },
    },
  });
  const idPage = `SELECT DISTINCT ?id WHERE {
    ?search a inst:dzt-geo-shapes ; con:query ${JSON.stringify(shape)} ; con:entities ?id .
    VALUES ?targetType { schema:Restaurant schema:CafeOrCoffeeShop }
    ?id a ?targetType .
    ${safeCursor ? `FILTER(STR(?id) > ${JSON.stringify(safeCursor)})` : ""}
  } ORDER BY STR(?id) LIMIT 200`;
  return buildGastroQuery(region, idPage, false);
}

function buildDetailQuery(id) {
  const iri = sparqlIri(id);
  const idPage = `SELECT DISTINCT ?id WHERE {
    VALUES ?id { ${iri} }
    VALUES ?targetType { schema:Restaurant schema:CafeOrCoffeeShop }
    ?id a ?targetType .
  }`;
  return buildGastroQuery({ lat: 0, lng: 0, radiusKm: 25 }, idPage, true);
}

function validateDztBinding(binding) {
  if (!binding || typeof binding !== "object") return false;
  return ["id", "subject", "predicate"].every((key) => isGastroTerm(binding[key])) &&
    binding.id.type === "uri" && ["uri", "bnode"].includes(binding.subject.type) &&
    binding.predicate.type === "uri" && isGastroTerm(binding.object);
}

function parseRetryAfter(value) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Date.now() + seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : undefined;
}

async function fetchDztBindings(sourceUrl, query, { signal } = {}) {
  validateGastroSource({ apiurls: [{ name: "dztsparql", url: sourceUrl }] });
  const path = `ts/v1/kg/sparql?${new URLSearchParams({ query: String(query || "") })}`;
  const relay = `${getOdasAppBasePath()}/dzt?path=${encodeURIComponent(path)}`;
  let response;
  try {
    response = await fetch(relay, {
      method: "GET",
      headers: { Accept: "application/sparql-results+json" },
      signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw dztError("NETWORK", "Die Datenquelle konnte nicht erreicht werden.");
  }

  if (response.status === 401 || response.status === 403) {
    throw dztError("ACCESS", "Der Zugriff auf die Datenquelle ist nicht freigegeben.", response.status);
  }
  if (response.status === 404) {
    throw dztError("RELAY", "Das DZT-Relay wurde nicht gefunden.", response.status);
  }
  if (response.status === 429) {
    throw dztError("RATE_LIMIT", "Die Datenquelle ist gerade ausgelastet.", response.status, parseRetryAfter(response.headers.get("Retry-After")));
  }
  if (!response.ok) {
    throw dztError("HTTP", "Die Datenquelle konnte nicht geladen werden.", response.status);
  }

  let text;
  try {
    text = await response.text();
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw dztError("PAYLOAD", "Die Antwort der Datenquelle konnte nicht gelesen werden.");
  }
  if (!text.trim()) throw dztError("PAYLOAD", "Die Datenquelle lieferte eine leere Antwort.");
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (_error) {
    throw dztError("PAYLOAD", "Die Datenquelle lieferte kein gültiges SPARQL-JSON.");
  }
  if (!payload || !payload.results || !Array.isArray(payload.results.bindings)) {
    throw dztError("PAYLOAD", "Die Datenquelle lieferte kein gültiges SPARQL-Ergebnis.");
  }
  if (!payload.results.bindings.every(validateDztBinding)) {
    throw dztError("PAYLOAD", "Die Datenquelle lieferte unvollständige RDF-Bindings.");
  }
  return payload.results.bindings;
}

function rowValue(row) {
  return row && row.object ? row.object.value : "";
}

function rowsForSubject(group, subject) {
  return group.rows.filter((row) => row.subject.value === subject);
}

function valuesFor(group, subject, predicate) {
  return rowsForSubject(group, subject)
    .filter((row) => row.predicate.value === predicate)
    .map(rowValue)
    .filter(Boolean);
}

function directValues(group, predicate) {
  return group.rows
    .filter((row) => row.subject.value === group.id && row.predicate.value === predicate)
    .map(rowValue)
    .filter(Boolean);
}

function directNodes(group, predicate) {
  return group.rows
    .filter((row) => row.subject.value === group.id && row.predicate.value === predicate && ["uri", "bnode"].includes(row.object.type))
    .map((row) => row.object.value);
}

function jsonLdNodeId(term) {
  return term.type === "bnode" && !String(term.value).startsWith("_:") ? `_:${term.value}` : term.value;
}

function jsonLdRdfValue(term) {
  if (term.type === "uri" || term.type === "bnode") return { "@id": jsonLdNodeId(term) };
  const value = { "@value": term.value };
  if (term["xml:lang"]) value["@language"] = term["xml:lang"];
  else if (term.datatype) value["@type"] = term.datatype;
  return value;
}

function normalizeGastroJsonLd(group) {
  const nodes = new Map();
  for (const row of group.rows) {
    if (!validateDztBinding(row) || !/^https?:\/\//i.test(row.predicate.value)) {
      throw dztError("PAYLOAD", "Die Antwort der Datenquelle enthält ungültige RDF-Tripel.");
    }
    const subjectId = jsonLdNodeId(row.subject);
    if (!nodes.has(subjectId)) nodes.set(subjectId, { "@id": subjectId });
    const node = nodes.get(subjectId);
    const predicate = row.predicate.value;
    if (!Array.isArray(node[predicate])) node[predicate] = [];
    node[predicate].push(jsonLdRdfValue(row.object));
  }
  return { "@graph": [...nodes.values()].sort((a, b) => compareSourceIds(a["@id"], b["@id"])) };
}

function chooseLocalizedValue(entries, fallback = "") {
  const candidates = entries.filter((entry) => entry && entry.value);
  const german = candidates.filter((entry) => /^(de)(?:-|$)/i.test(String(entry.lang || "")));
  const neutral = candidates.filter((entry) => !entry.lang);
  const other = candidates.filter((entry) => entry.lang && !/^(de)(?:-|$)/i.test(String(entry.lang)));
  const chosen = german.length ? german : neutral.length ? neutral : other;
  chosen.sort((a, b) => compareSourceIds(a.value, b.value));
  return chosen.length ? String(chosen[0].value) : fallback;
}

function normalizeGastroLicense(licenseUrl, evidence) {
  const supported = new Map([
    ["https://creativecommons.org/publicdomain/zero/1.0/", "CC0 1.0"],
    ["https://creativecommons.org/licenses/by/4.0/", "CC BY 4.0"],
    ["https://creativecommons.org/licenses/by-sa/4.0/", "CC BY-SA 4.0"],
    ["https://creativecommons.org/licenses/by-nc-nd/4.0/", "CC BY-NC-ND 4.0"],
    ["https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode.de", "CC BY-NC-ND 4.0"],
  ]);
  const url = String(licenseUrl || "").trim();
  if (!supported.has(url)) return null;
  const requiresEvidence = url !== "https://creativecommons.org/publicdomain/zero/1.0/";
  if (requiresEvidence && !evidence) return null;
  return { url, attribution: requiresEvidence ? String(evidence) : "", label: supported.get(url) };
}

function collectNodeValues(group, node, predicates) {
  const values = new Map();
  for (const predicate of predicates) values.set(predicate, valuesFor(group, node, predicate));
  return values;
}

function gastroAttributionValues(group, node) {
  const predicates = ["creditText", "creator", "author", "copyrightHolder", "copyrightNotice", "publisher", "sdPublisher"]
    .map((name) => `https://schema.org/${name}`);
  const evidence = [];
  for (const row of rowsForSubject(group, node).filter((entry) => predicates.includes(entry.predicate.value))) {
    const names = ["uri", "bnode"].includes(row.object.type)
      ? rowsForSubject(group, row.object.value).filter((entry) =>
        ["https://schema.org/name", "http://www.w3.org/2000/01/rdf-schema#label"].includes(entry.predicate.value) && entry.object.type === "literal")
      : [row];
    const name = chooseLocalizedValue(names.map((entry) => ({ value: entry.object.value, lang: entry.object["xml:lang"] || "" }))).trim();
    if (name && !/^https?:\/\//i.test(name)) pushUnique(evidence, name);
  }
  return evidence;
}

function normalizeGastroImages(group, stage) {
  const imageIds = [...new Set(directNodes(group, "https://schema.org/image"))];
  const images = [];
  for (const imageId of imageIds) {
    const values = collectNodeValues(group, imageId, [
      "https://schema.org/contentUrl",
      "https://schema.org/url",
      "https://schema.org/name",
      "https://schema.org/caption",
      "https://schema.org/license",
    ]);
    const url = safeHttpUrl(values.get("https://schema.org/contentUrl")[0] || values.get("https://schema.org/url")[0]);
    if (!url) continue;
    const licenseValues = values.get("https://schema.org/license");
    const credit = gastroAttributionValues(group, imageId).join(" · ");
    const license = normalizeGastroLicense(licenseValues[0], credit);
    if (!license) continue;
    const image = {
      url,
      sourceUrl: safeHttpUrl(values.get("https://schema.org/url")[0] || ""),
      title: values.get("https://schema.org/name")[0] || values.get("https://schema.org/caption")[0] || "",
      credit,
      licenseUrl: license.url,
    };
    if (!images.some((existing) => existing.url === image.url)) images.push(image);
  }
  images.sort((a, b) => compareSourceIds(a.url, b.url));
  return stage === "overview" ? images.slice(0, 1) : images;
}

function normalizeGastroCoordinates(group, region) {
  const geoIds = [...new Set(directNodes(group, "https://schema.org/geo"))];
  const points = [];
  for (const geoId of geoIds) {
    const lat = Number(valuesFor(group, geoId, "https://schema.org/latitude")[0]);
    const lng = Number(valuesFor(group, geoId, "https://schema.org/longitude")[0]);
    if (!isValidGastroCoordinate(lat, -90, 90) || !isValidGastroCoordinate(lng, -180, 180)) {
      return { error: "coordinates" };
    }
    points.push({ lat, lng });
  }
  const unique = [...new Map(points.map((point) => [`${point.lat},${point.lng}`, point])).values()];
  if (unique.length !== 1) return { error: "coordinates" };
  const point = unique[0];
  if (!isInGastroRegion(point, region)) return { error: "outside" };
  return { point, distanceKm: distanceKm(region, point) };
}

function normalizeGastroAddress(group) {
  const address = { street: "", postalCode: "", locality: "" };
  const addressId = directNodes(group, "https://schema.org/address")[0];
  if (!addressId) return address;
  address.street = valuesFor(group, addressId, "https://schema.org/streetAddress")[0] || "";
  address.postalCode = valuesFor(group, addressId, "https://schema.org/postalCode")[0] || "";
  address.locality = valuesFor(group, addressId, "https://schema.org/addressLocality")[0] || "";
  return address;
}

function normalizeGastroHours(group) {
  const hours = [];
  for (const node of directNodes(group, "https://schema.org/openingHoursSpecification")) {
    const days = valuesFor(group, node, "https://schema.org/dayOfWeek");
    const opens = valuesFor(group, node, "https://schema.org/opens")[0] || "";
    const closes = valuesFor(group, node, "https://schema.org/closes")[0] || "";
    const validFrom = valuesFor(group, node, "https://schema.org/validFrom")[0] || "";
    const validThrough = valuesFor(group, node, "https://schema.org/validThrough")[0] || "";
    if (days.length || opens || closes || validFrom || validThrough) {
      hours.push({ days, opens, closes, validFrom, validThrough, warning: "" });
    }
  }
  return hours;
}

function normalizeDztRows(bindings, region, stage) {
  if (!Array.isArray(bindings)) throw dztError("PAYLOAD", "Keine gültigen RDF-Bindings.");
  if (stage !== "overview" && stage !== "detail") throw new Error("Ungültiger Normalisierungsabschnitt.");
  validateGastroQueryRegion(region);
  const groups = new Map();
  const excluded = [];
  const excludedIds = new Set();
  for (const row of bindings) {
    if (!row || !row.id || typeof row.id.value !== "string") {
      const id = "";
      if (!excludedIds.has(`missing:${id}`)) {
        excluded.push({ id, reason: "id" });
        excludedIds.add(`missing:${id}`);
      }
      continue;
    }
    const id = row.id.value;
    if (!groups.has(id)) groups.set(id, { id, rows: [] });
    groups.get(id).rows.push(row);
  }
  const sourceIds = [...groups.keys()];
  const pois = [];
  for (const id of sourceIds) {
    const group = groups.get(id);
    const types = [...new Set(directValues(group, "http://www.w3.org/1999/02/22-rdf-syntax-ns#type")
      .filter((value) => ["https://schema.org/Restaurant", "https://schema.org/CafeOrCoffeeShop"].includes(value)))];
    const exclude = (reason) => {
      if (!excludedIds.has(id)) {
        excluded.push({ id, reason });
        excludedIds.add(id);
      }
    };
    if (!types.length) {
      exclude("type");
      continue;
    }
    const nameEntries = group.rows
      .filter((row) => row.subject.value === id && row.predicate.value === "https://schema.org/name")
      .map((row) => ({ value: row.object.value, lang: row.object["xml:lang"] || "" }));
    const name = chooseLocalizedValue(nameEntries, "Name nicht angegeben");
    const coordinates = normalizeGastroCoordinates(group, region);
    if (coordinates.error) {
      exclude(coordinates.error);
      continue;
    }
    const licenseNode = directNodes(group, "https://schema.org/sdLicense")[0];
    const licenseValues = licenseNode
      ? valuesFor(group, licenseNode, "https://schema.org/license")
      : directValues(group, "https://schema.org/license");
    const evidence = [...new Set([
      ...gastroAttributionValues(group, group.id),
      ...(licenseNode ? gastroAttributionValues(group, licenseNode) : []),
    ])].join(" · ");
    const dataLicense = normalizeGastroLicense(licenseValues[0], evidence);
    if (!dataLicense) {
      exclude("rights");
      continue;
    }
    const cuisines = [];
    for (const value of directValues(group, "https://schema.org/servesCuisine")) pushUnique(cuisines, value);
    cuisines.sort(compareSourceIds);
    const websites = [];
    for (const value of directValues(group, "https://schema.org/url")) pushUnique(websites, safeHttpUrl(value));
    websites.sort(compareSourceIds);
    const telephones = [];
    for (const value of directValues(group, "https://schema.org/telephone")) pushUnique(telephones, safeTelephone(value));
    telephones.sort(compareSourceIds);
    const descriptionRows = rowsForSubject(group, group.id)
      .filter((row) => row.predicate.value === "https://schema.org/description")
      .flatMap((row) => ["uri", "bnode"].includes(row.object.type)
        ? rowsForSubject(group, row.object.value).filter((entry) => entry.predicate.value === "https://schema.org/text")
        : [row])
      .filter((row) => row.object.type === "literal");
    const description = chooseLocalizedValue(descriptionRows.map((row) => ({ value: row.object.value, lang: row.object["xml:lang"] || "" })));
    pois.push({
      id,
      types,
      name,
      address: normalizeGastroAddress(group),
      lat: coordinates.point.lat,
      lng: coordinates.point.lng,
      distanceKm: coordinates.distanceKm,
      cuisines,
      images: normalizeGastroImages(group, stage),
      dataLicense,
      description: stage === "detail" ? description : "",
      openingHours: stage === "detail" ? normalizeGastroHours(group) : [],
      websites,
      telephones,
      raw: normalizeGastroJsonLd(group),
    });
  }
  return { sourceIds, pois, excluded };
}

function createGastroState(sourceUrl, region) {
  return {
    sourceUrl: String(sourceUrl || ""),
    region: region || null,
    configKey: JSON.stringify({ sourceUrl: String(sourceUrl || ""), region: region || null }),
    byId: new Map(),
    details: new Map(),
    page: {
      cursor: "",
      done: false,
      loaded: false,
      busy: false,
      error: null,
      retryAt: 0,
      excluded: new Map(),
      seenIds: new Set(),
    },
    filters: { text: "", type: "all", cuisine: "all" },
    sort: "distance",
    selectedId: null,
    view: "map",
    sheet: "compact",
    visible: { list: 24, catalog: 24 },
    positions: { list: 0, catalog: 0, map: null },
    detail: { seq: 0, busy: false, error: null, retryAt: 0 },
    runtime: {
      active: false,
      generation: 0,
      map: null,
      cluster: null,
      pageAbort: null,
      detailAbort: null,
      events: null,
      resizeObserver: null,
      debounceTimer: null,
      gallery: null,
      lightbox: null,
      mapPosition: null,
      mapResizeTimer: null,
      markerById: null,
      markerLayer: null,
      mapAreaCircle: null,
      mapError: null,
      lastSelectedId: null,
      detailOpener: null,
      focusTimer: null,
      cockpitCollapsed: false,
      catalogOpen: false,
      mobileView: "map",
      detailDialog: null,
      catalogOpener: null,
      fullscreen: false,
      root: null,
    },
  };
}

function stateError(code, message) {
  return dztError(code, message);
}

function validateGastroPageIds(state, sourceIds) {
  if (!Array.isArray(sourceIds)) throw stateError("PAGE", "Die Quellseite enthält keine IDs.");
  const seen = new Set();
  let hasNew = false;
  for (let index = 0; index < sourceIds.length; index += 1) {
    const id = sourceIds[index];
    if (typeof id !== "string" || !id) throw stateError("PAGE", "Die Quellseite enthält eine ungültige ID.");
    try {
      sparqlIri(id);
    } catch (_error) {
      throw stateError("PAGE", "Die Quellseite enthält eine ungültige ID.");
    }
    if (seen.has(id)) throw stateError("CURSOR", "Die Quellseite enthält eine doppelte Quell-ID.");
    if (index > 0 && compareSourceIds(sourceIds[index - 1], id) >= 0) {
      throw stateError("CURSOR", "Die Quell-IDs sind nicht in der serverseitigen Reihenfolge.");
    }
    if (!state.page.cursor || compareSourceIds(id, state.page.cursor) > 0) hasNew = true;
    if (state.page.cursor && compareSourceIds(id, state.page.cursor) <= 0 && !state.page.seenIds.has(id)) {
      throw stateError("CURSOR", "Die Quellseite springt vor dem gespeicherten Cursor zurück.");
    }
    seen.add(id);
  }
  if (state.page.cursor && sourceIds.length && !hasNew) {
    throw stateError("CURSOR", "Die Quellseite macht keinen Cursorfortschritt.");
  }
}

function commitGastroPage(state, page) {
  if (!state || !state.page || !page) throw stateError("PAGE", "Ungültiger Seitencommit.");
  if (state.page.done && page.sourceIds.length) throw stateError("PAGE", "Die Quelle ist bereits als abgeschlossen markiert.");
  validateGastroPageIds(state, page.sourceIds);
  const sourceIdSet = new Set(page.sourceIds);
  const nextById = new Map(state.byId);
  const nextExcluded = new Map(state.page.excluded);
  const nextSeen = new Set(state.page.seenIds);
  for (const id of page.sourceIds) nextSeen.add(id);
  for (const poi of page.pois || []) {
    if (!poi || !sourceIdSet.has(poi.id)) throw stateError("PAGE", "Ein Treffer gehört nicht zur Quellseite.");
    if (!nextById.has(poi.id)) nextById.set(poi.id, poi);
    nextExcluded.delete(poi.id);
  }
  for (const item of page.excluded || []) {
    if (!item || !sourceIdSet.has(item.id)) throw stateError("PAGE", "Ein Ausschluss gehört nicht zur Quellseite.");
    if (!nextById.has(item.id)) nextExcluded.set(item.id, item.reason || "unusable");
  }
  state.byId = nextById;
  state.page.excluded = nextExcluded;
  state.page.seenIds = nextSeen;
  state.page.loaded = true;
  state.page.error = null;
  state.page.retryAt = 0;
  if (page.sourceIds.length) {
    state.page.cursor = page.sourceIds[page.sourceIds.length - 1];
    state.page.done = false;
  } else {
    state.page.done = true;
  }
}

function stateMatchesText(poi, text) {
  if (!text) return true;
  const needle = normalizeGastroPlaceName(text);
  const values = [
    poi.name,
    poi.address && poi.address.street,
    poi.address && poi.address.postalCode,
    poi.address && poi.address.locality,
    ...(Array.isArray(poi.cuisines) ? poi.cuisines : [poi.cuisines]),
  ];
  return values.some((value) => normalizeGastroPlaceName(value).includes(needle));
}

function stateMatchesCuisine(poi, cuisine) {
  if (!cuisine || cuisine === "all") return true;
  if (cuisine === "missing") return !poi.cuisines || poi.cuisines.length === 0;
  return (poi.cuisines || []).some((value) => normalizeGastroPlaceName(value) === normalizeGastroPlaceName(cuisine));
}

function stateMatchesType(poi, type) {
  if (!type || type === "all") return true;
  const uri = type === "restaurant"
    ? "https://schema.org/Restaurant"
    : type === "cafe"
      ? "https://schema.org/CafeOrCoffeeShop"
      : "";
  return uri && poi.types.includes(uri);
}

function comparePoiOrder(a, b, sort) {
  if (sort === "name") {
    const nameOrder = compareSourceIds(a.name || "", b.name || "");
    return nameOrder || compareSourceIds(a.id, b.id);
  }
  const distanceOrder = (a.distanceKm || 0) - (b.distanceKm || 0);
  return distanceOrder || compareSourceIds(a.id, b.id);
}

function deriveGastroView(state) {
  const all = Array.from(state.byId.values());
  const filters = state.filters || { text: "", type: "all", cuisine: "all" };
  const base = all.filter((poi) => stateMatchesText(poi, filters.text) && stateMatchesCuisine(poi, filters.cuisine));
  const counts = {
    all: base.length,
    restaurant: base.filter((poi) => poi.types.includes("https://schema.org/Restaurant")).length,
    cafe: base.filter((poi) => poi.types.includes("https://schema.org/CafeOrCoffeeShop")).length,
  };
  const cuisineOptions = [];
  for (const poi of all) {
    if (!poi.cuisines || !poi.cuisines.length) pushUnique(cuisineOptions, "missing");
    for (const cuisine of poi.cuisines || []) pushUnique(cuisineOptions, cuisine);
  }
  if (filters.cuisine && filters.cuisine !== "all") pushUnique(cuisineOptions, filters.cuisine);
  cuisineOptions.sort((a, b) => a === "missing" ? 1 : b === "missing" ? -1 : compareSourceIds(a, b));
  const pois = base
    .filter((poi) => stateMatchesType(poi, filters.type))
    .sort((a, b) => comparePoiOrder(a, b, state.sort));
  return { pois, counts, cuisineOptions, partial: !state.page.done };
}

function showMoreGastroResults(state, view) {
  if (view !== "list" && view !== "catalog") throw new Error("Ungültige Ergebnisansicht.");
  const derived = deriveGastroView(state);
  const current = Number(state.visible[view]) || 24;
  state.visible[view] = Math.min(current + 24, Math.max(24, derived.pois.length));
}

function runtimeIsCurrent(state, generation) {
  return Boolean(state && state.runtime && state.runtime.active && state.runtime.generation === generation);
}

async function loadNextGastroPage(state, notify = () => {}) {
  if (!state || !state.runtime || !state.runtime.active || !state.page || state.page.done || state.page.busy) return;
  if (state.page.retryAt && state.page.retryAt > Date.now()) return;
  if (!state.region || !state.sourceUrl) {
    state.page.error = stateError("CONFIG", "Die Region ist noch nicht aufgelöst.");
    notify();
    return;
  }
  const generation = state.runtime.generation;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  state.runtime.pageAbort = controller;
  state.page.busy = true;
  state.page.error = null;
  try {
    const bindings = await fetchDztBindings(
      state.sourceUrl,
      buildOverviewQuery(state.region, state.page.cursor),
      { signal: controller ? controller.signal : undefined },
    );
    if (!runtimeIsCurrent(state, generation)) return;
    const result = normalizeDztRows(bindings, state.region, "overview");
    if (!runtimeIsCurrent(state, generation)) return;
    commitGastroPage(state, result);
    if (runtimeIsCurrent(state, generation)) {
      state.page.busy = false;
      state.runtime.pageAbort = null;
      notify();
    }
  } catch (error) {
    if (!runtimeIsCurrent(state, generation) || (error && error.name === "AbortError")) return;
    state.page.error = error;
    state.page.retryAt = error && error.retryAt ? error.retryAt : 0;
    state.page.busy = false;
    state.runtime.pageAbort = null;
    notify();
  } finally {
    if (runtimeIsCurrent(state, generation)) {
      state.page.busy = false;
      state.runtime.pageAbort = null;
    }
  }
}

function restoreGastroDetailFocus(root, state, id = null) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const targetId = id || (state.runtime && state.runtime.detailOpener && typeof state.runtime.detailOpener.getAttribute === "function"
    ? state.runtime.detailOpener.getAttribute("data-gf-id")
    : "");
  if (targetId) {
    for (const button of root.querySelectorAll("[data-gf-select]")) {
      if (button.getAttribute("data-gf-id") === targetId && typeof button.focus === "function") {
        button.focus();
        return;
      }
    }
  }
  const heading = root.querySelector('[data-gf="results-heading"]');
  if (heading && typeof heading.focus === "function") heading.focus();
}

async function selectGastroPoi(state, id, notify = () => {}) {
  if (!state || !state.byId.has(id) || !state.runtime || !state.runtime.active) return;
  if (!state.details.has(id) && state.detail.retryAt > Date.now()) {
    state.selectedId = id;
    state.detail.busy = false;
    state.detail.error = state.detail.error || stateError("RATE_LIMIT", "Die Datenquelle ist gerade ausgelastet.");
    if (state.runtime.root) openGastroDetailDialog(state.runtime.root, state, state.runtime.detailOpener);
    notify();
    return;
  }
  if (state.selectedId === id && state.details.has(id)) {
    state.detail.busy = false;
    state.detail.error = null;
    if (state.runtime.root) openGastroDetailDialog(state.runtime.root, state, state.runtime.detailOpener);
    notify();
    return;
  }
  if (state.runtime.detailAbort && typeof state.runtime.detailAbort.abort === "function") {
    state.runtime.detailAbort.abort();
  }
  const generation = state.runtime.generation;
  state.selectedId = id;
  state.detail.busy = true;
  state.detail.error = null;
  if (state.runtime.root) openGastroDetailDialog(state.runtime.root, state, state.runtime.detailOpener);
  if (state.details.has(id)) {
    state.detail.busy = false;
    openDetailModal(state, id, false, false);
    notify();
    return;
  }
  const sequence = ++state.detail.seq;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  state.runtime.detailAbort = controller;
  const stillCurrent = () => runtimeIsCurrent(state, generation) &&
    state.detail.seq === sequence && state.selectedId === id;
  try {
    const bindings = await fetchDztBindings(
      state.sourceUrl,
      buildDetailQuery(id),
      { signal: controller ? controller.signal : undefined },
    );
    if (!stillCurrent()) return;
    const result = normalizeDztRows(bindings, state.region, "detail");
    const detail = result.pois.find((poi) => poi.id === id);
    if (!detail || result.sourceIds.length !== 1 || result.sourceIds[0] !== id || result.pois.length !== 1) {
      throw stateError("DETAIL", "Die Detailantwort passt nicht zum ausgewählten Betrieb.");
    }
    if (!stillCurrent()) return;
    state.details.set(id, detail);
    state.detail.error = null;
    state.detail.retryAt = 0;
    state.detail.busy = false;
    state.runtime.detailAbort = null;
    openDetailModal(state, id, false, false);
    notify();
  } catch (error) {
    if (!stillCurrent() || (error && error.name === "AbortError")) return;
    state.detail.error = error;
    state.detail.retryAt = error && error.retryAt ? error.retryAt : 0;
    state.detail.busy = false;
    state.runtime.detailAbort = null;
    openDetailModal(state, id, false, false);
    notify();
  } finally {
    if (stillCurrent()) {
      state.detail.busy = false;
      state.runtime.detailAbort = null;
    }
  }
}

function disposeGastroRuntime(state) {
  if (!state || !state.runtime) return;
  const runtime = state.runtime;
  runtime.active = false;
  runtime.generation = (runtime.generation || 0) + 1;
  if (state.detail) state.detail.seq = (state.detail.seq || 0) + 1;
  if (runtime.pageAbort && typeof runtime.pageAbort.abort === "function") runtime.pageAbort.abort();
  if (runtime.detailAbort && typeof runtime.detailAbort.abort === "function") runtime.detailAbort.abort();
  if (runtime.lightbox && typeof runtime.lightbox.close === "function") runtime.lightbox.close(true);
  runtime.lightbox = null;
  if (runtime.events && typeof runtime.events.abort === "function") runtime.events.abort();
  if (typeof clearTimeout === "function") {
    if (runtime.debounceTimer !== null) clearTimeout(runtime.debounceTimer);
    if (runtime.mapResizeTimer !== null) clearTimeout(runtime.mapResizeTimer);
    if (runtime.focusTimer !== null) clearTimeout(runtime.focusTimer);
  }
  if (runtime.resizeObserver && typeof runtime.resizeObserver.disconnect === "function") runtime.resizeObserver.disconnect();
  if (runtime.detailDialog) {
    const detailElement = runtime.detailDialog.element || runtime.detailDialog;
    if (detailElement && typeof detailElement.close === "function") {
      try { detailElement.close(); } catch (_error) { /* bereits geschlossen */ }
    }
    if (detailElement && typeof detailElement.remove === "function") detailElement.remove();
  }
  if (runtime.appendedModals && Array.isArray(runtime.appendedModals)) {
    for (const modal of runtime.appendedModals) {
      if (modal) {
        if (typeof window !== "undefined" && window.bootstrap && window.bootstrap.Modal) {
          try {
            const inst = window.bootstrap.Modal.getInstance(modal);
            if (inst && typeof inst.hide === "function") inst.hide();
          } catch (_) {}
        }
        if (typeof modal.remove === "function") modal.remove();
      }
    }
    runtime.appendedModals = [];
  }
  if (runtime.gallery && typeof runtime.gallery.close === "function") runtime.gallery.close();
  if (typeof document !== "undefined" && document.getElementById) {
    const lb = document.getElementById("gf-lightbox");
    if (lb && typeof lb.remove === "function") lb.remove();
  }
  if (runtime.map) {
    try {
      if (typeof runtime.map.getCenter === "function") {
        const center = runtime.map.getCenter();
        runtime.mapPosition = { lat: center.lat, lng: center.lng, zoom: center.zoom };
      }
      if (typeof runtime.map.remove === "function") runtime.map.remove();
    } catch (_error) {
      // Cleanup muss auch bei einem bereits teilweise zerstörten Mapper laufen.
    }
  }
  runtime.pageAbort = null;
  runtime.detailAbort = null;
  runtime.events = null;
  runtime.resizeObserver = null;
  runtime.debounceTimer = null;
  runtime.mapResizeTimer = null;
  runtime.focusTimer = null;
  runtime.gallery = null;
  runtime.map = null;
  runtime.markerById = null;
  runtime.markerLayer = null;
  runtime.mapAreaCircle = null;
  runtime.lastSelectedId = null;
  runtime.detailOpener = null;
  runtime.cockpitCollapsed = false;
  runtime.catalogOpen = false;
  runtime.mobileView = "map";
  runtime.detailDialog = null;
  runtime.catalogOpener = null;
  runtime.fullscreen = false;
  runtime.root = null;
  runtime.cluster = null;
  if (state.page) state.page.busy = false;
  if (state.detail) state.detail.busy = false;
}

function setGastroFullscreen(root, active) {
  const enabled = Boolean(active);
  if (root && root.gastroState) root.gastroState.runtime.fullscreen = enabled;
  if (typeof document !== "undefined" && document.body && document.body.classList) {
    if (typeof document.body.classList.toggle === "function") {
      document.body.classList.toggle("gf-app-fullscreen", enabled);
    } else if (enabled) {
      document.body.classList.add("gf-app-fullscreen");
    } else {
      document.body.classList.remove("gf-app-fullscreen");
    }
  }
}

function createGastroUid() {
  if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
    return `gf-${crypto.randomUUID().replace(/[^a-z0-9]/gi, "").slice(0, 12)}`;
  }
  return `gf-${Math.random().toString(36).slice(2, 12)}`;
}

function gastroDomToken(value) {
  const text = String(value == null ? "" : value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `token-${(hash >>> 0).toString(36)}`;
}

function gastroIcon(name) {
  const icons = {
    fork: '<path d="M7 3v6c0 3 6 3 6 0V3M10 3v18M17 3v18M17 3c-4 3-4 9 0 9"/>',
    cup: '<path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM16 9h2a3 3 0 0 1 0 6h-2M7 3v2M12 2v3M3 22h15"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16"/>',
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-6h6v6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    pin: '<path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    phone: '<path d="m7 3 3 5-3 2c2 4 3 5 7 7l2-3 5 3c-1 5-5 5-10 2S2 9 3 5Z"/>',
    route: '<path d="m12 2 10 10-10 10L2 12Z"/><path d="M8 15v-5h8m-3-3 3 3-3 3"/>',
    share: '<path d="M12 16V3m-5 5 5-5 5 5M5 13v8h14v-8"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    shield: '<path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  };
  return `<svg class="gf-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.pin}</svg>`;
}

function gastroTypeLabels(poi) {
  const labels = [];
  if ((poi.types || []).includes("https://schema.org/Restaurant")) labels.push("Restaurant");
  if ((poi.types || []).includes("https://schema.org/CafeOrCoffeeShop")) labels.push("Café");
  return labels.length ? labels : ["Gastronomie"];
}

function gastroImageIsUsable(image) {
  if (!image || !safeHttpUrl(image.url)) return false;
  return Boolean(normalizeGastroLicense(image.licenseUrl, image.credit));
}

function renderGastroImageAttribution(image, className = "") {
  const license = image && normalizeGastroLicense(image.licenseUrl, image.credit);
  const licenseUrl = safeHttpUrl(license && license.url);
  const sourceUrl = safeHttpUrl(image && image.sourceUrl);
  if (!image || (!licenseUrl && !sourceUrl && !image.credit)) return "";
  return `<span class="gf-image-attribution ${escapeHtml(className)}"><span>${escapeHtml(image.credit || "Urheber nicht angegeben")}</span>${licenseUrl ? `<a href="${escapeHtml(licenseUrl)}" target="_blank" rel="noopener noreferrer">Lizenz ${escapeHtml(license.label)}</a>` : ""}${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Quelle</a>` : ""}</span>`;
}

function renderGastroDatasetLicense(dataLicense) {
  const license = dataLicense && normalizeGastroLicense(dataLicense.url, dataLicense.attribution);
  const url = license && safeHttpUrl(license.url);
  if (!url) return "";
  return `<div class="gf-dataset-license"><strong>Datensatzlizenz:</strong> <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(license.label)}</a>${license.attribution ? ` · ${escapeHtml(license.attribution)}` : ""}</div>`;
}

function gastroNoPhoto(label = "Gastrofinder") {
  return `<div class="gf-no-photo" aria-hidden="true"><span class="gf-no-photo-ring"></span>${gastroIcon("fork")}<span>${escapeHtml(label)}</span></div>`;
}

function renderGastroCard(poi, uid = "gf-card", selected = false) {
  const item = poi || {};
  const firstImage = (item.images && item.images[0]) || null;
  const imgUrl = firstImage && gastroImageIsUsable(firstImage) ? firstImage.url : "";
  const imgAlt = (firstImage && firstImage.title) || item.name || "Gastrofinder-Bild";
  const media = imgUrl
    ? `<img class="gf-card-thumb-img" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(imgAlt)}" loading="lazy">`
    : `<div class="gf-card-thumb-fallback">${item.isCafe ? "☕" : "🍴"}</div>`;
  const imageAttribution = imgUrl ? renderGastroImageAttribution(firstImage, "gf-card-image-attribution") : "";
  const address = item.address || {};
  const locality = item.city || address.locality || address.city || "";
  const street = item.street || address.street || "";
  const place = [locality, street].filter(Boolean).join(" · ") || (item.city || "Ort nicht angegeben");
  const distance = Number.isFinite(Number(item.distanceKm))
    ? `${Number(item.distanceKm).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`
    : (item.distanceKm != null ? `${item.distanceKm} km` : "");
  const cuisine = Array.isArray(item.cuisines)
    ? item.cuisines.join(", ")
    : (item.cuisines || "");
  const typeLabels = gastroTypeLabels(item);

  return `<article id="${escapeHtml(`${uid}-card-${gastroDomToken(item.id)}`)}" class="gf-card gf-clean-card${selected ? " is-selected" : ""}" data-gf-card data-gf-id="${escapeHtml(item.id || "")}">
    <div class="gf-card-thumb-wrap">${media}${imageAttribution ? `<div class="gf-card-photo-credit">${imageAttribution}</div>` : ""}</div>
    <div class="gf-card-content">
      <div class="gf-card-heading-wrap">
        <h3 class="gf-card-heading" title="${escapeHtml(item.name || "")}">${escapeHtml(item.name || "Name nicht angegeben")}</h3>
        <div class="gf-card-meta">
          ${place ? `<span>${escapeHtml(place)}</span>` : ""}
          ${distance ? `<span class="gf-distance-badge">&bull; <strong>${escapeHtml(distance)}</strong></span>` : ""}
        </div>
      </div>
      <div class="gf-badges">
        ${typeLabels.map((label) => `<span class="gf-badge${label === "Café" ? " gf-badge-cafe" : ""}">${escapeHtml(label)}</span>`).join("")}
        ${cuisine ? `<span class="gf-badge gf-badge-cuisine">${escapeHtml(cuisine)}</span>` : ""}
      </div>
      <div class="gf-card-action">
        <button type="button" class="gf-card-select gf-btn-detail-link" data-gf-select data-gf-control="card-details" data-gf-id="${escapeHtml(item.id || "")}" aria-pressed="${selected ? "true" : "false"}">
          Details ansehen »
        </button>
      </div>
    </div>
  </article>`;
}

function gastroDayLabel(value) {
  const days = {
    Monday: "Montag", Tuesday: "Dienstag", Wednesday: "Mittwoch", Thursday: "Donnerstag",
    Friday: "Freitag", Saturday: "Samstag", Sunday: "Sonntag",
  };
  const tail = String(value || "").split("/").pop();
  return days[tail] || tail || "Tag nicht angegeben";
}

function renderGastroHours(hours) {
  if (!Array.isArray(hours) || !hours.length) return "Öffnungszeiten nicht angegeben";
  return `<ul class="gf-hours-list">${hours.map((entry) => {
    const days = (entry.days || []).map(gastroDayLabel).join(", ") || "Tag nicht angegeben";
    const opens = entry.opens || "nicht angegeben";
    const closes = entry.closes || "nicht angegeben";
    const timeText = opens !== "nicht angegeben" && closes !== "nicht angegeben"
      ? `${opens}–${closes}`
      : `${opens} / ${closes}`;
    const overnight = opens !== "nicht angegeben" && closes !== "nicht angegeben" && closes < opens
      ? " bis zum Folgetag"
      : "";
    const validity = entry.validFrom || entry.validThrough
      ? ` · gültig ${escapeHtml(entry.validFrom || "unbekannt")} bis ${escapeHtml(entry.validThrough || "unbekannt")}`
      : "";
    return `<li><strong>${escapeHtml(days)}</strong>: ${escapeHtml(timeText)}${escapeHtml(overnight)}${validity}</li>`;
  }).join("")}</ul>`;
}

function renderGastroHeroDetails(poi, uid = "gf-detail", status = "ready") {
  if (status === "loading") {
    return `<div id="${escapeHtml(`${uid}-content`)}" class="modal-body position-relative text-center p-5"><button type="button" class="btn-close position-absolute top-0 end-0 m-3" data-bs-dismiss="modal" aria-label="Schließen" title="Schließen"></button><div class="spinner-border gf-spinner-forest" role="status"><span class="visually-hidden">Details werden geladen …</span></div><p class="mt-3 text-muted">Details werden geladen …</p></div>`;
  }
  if (status === "error") {
    return `<div id="${escapeHtml(`${uid}-content`)}" class="modal-body text-center p-5"><p class="text-secondary fw-semibold" role="alert">Die Detailangaben konnten nicht geladen werden.</p><button type="button" class="btn btn-outline-forest btn-sm me-2" data-gf-detail-retry>Erneut versuchen</button><button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Schließen</button></div>`;
  }

  const item = poi || {};
  const name = item.name || "Gastrobetrieb";

  // Clean description: NEVER show raw IRI or onlim entity URIs
  let desc = item.description || "";
  if (typeof desc !== "string" || desc.startsWith("http://") || desc.startsWith("https://") || desc.includes("onlim.com/entity")) {
    desc = "";
  }
  if (!desc) {
    desc = "Für diesen Gastronomiebetrieb liegt im DZT Knowledge Graph keine ausführliche Beschreibung vor.";
  }

  // Address
  const address = item.address || {};
  const street = item.street || address.street || "";
  const postalCode = item.postalCode || address.postalCode || "";
  const city = item.city || address.locality || "";
  const addressText = [street, postalCode, city].filter(Boolean).join(", ") || "Adresse nicht angegeben";

  // Contact
  const phone = item.phone || (item.telephones && item.telephones[0]) || "";
  const website = item.website || (item.websites && item.websites[0]) || "";

  // Coordinates & Route
  const lat = item.lat != null ? Number(item.lat) : null;
  const lng = item.lng != null ? Number(item.lng) : null;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const routeUrl = safeHttpUrl(hasCoords ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}` : "");

  // Only show images with independently verified photo rights.
  const rawImages = Array.isArray(item.images) ? item.images : [];
  const images = rawImages.map((img) => {
    if (typeof img === "string") return { url: img };
    return {
      url: img.url || img["schema:contentUrl"] || img.contentUrl || "",
      title: img.title || name,
      credit: img.credit || "",
      licenseUrl: img.licenseUrl || "",
      sourceUrl: img.sourceUrl || "",
    };
  }).filter(gastroImageIsUsable);

  const heroImage = images[0] ? images[0].url : "";

  // Distance string
  const distText = (item.distanceKm != null && Number.isFinite(Number(item.distanceKm)))
    ? `${Number(item.distanceKm).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km entfernt`
    : "";

  const types = Array.isArray(item.types) ? item.types : [];
  const isRestaurant = item.isRestaurant || types.some((t) => typeof t === "string" && t.includes("Restaurant"));
  const isCafe = item.isCafe || types.some((t) => typeof t === "string" && (t.includes("Cafe") || t.includes("CoffeeShop") || t.includes("BarOrPub")));
  const cuisines = typeof item.cuisines === "string" && item.cuisines.trim()
    ? item.cuisines
    : (Array.isArray(item.cuisines) && item.cuisines.length ? item.cuisines.join(", ") : "Küche nicht angegeben");

  const hoursHtml = renderGastroHours(item.openingHours);

  return `
    ${heroImage ? `
      <div class="gf-detail-hero">
        <button type="button" class="gf-detail-hero-wrap" data-gf-hero-gallery aria-label="Foto von ${escapeHtml(name)} in Vollbild ansehen" title="Tippen für Vollbild-Galerie">
          <img src="${escapeHtml(heroImage)}" class="gf-detail-hero-img" alt="">
          <span class="gf-detail-hero-gradient"></span>
          <span class="gf-detail-hero-gallery-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            <span>${images.length > 1 ? `1 von ${images.length} Fotos` : "Vollbildansicht"}</span>
            <span class="gf-gallery-zoom-hint">🔍</span>
          </span>
          <span class="gf-detail-hero-caption">
            <span class="gf-detail-hero-title">${escapeHtml(name)}</span>
            <span class="gf-detail-hero-subtitle">
              ${escapeHtml([city, item.region].filter(Boolean).join(" "))}
              ${distText ? ` &bull; <strong>${escapeHtml(distText)}</strong>` : ""}
            </span>
          </span>
        </button>
        <button type="button" class="gf-detail-close-btn" data-bs-dismiss="modal" aria-label="Schließen" title="Schließen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        ${renderGastroImageAttribution(images[0], "gf-detail-hero-license")}
      </div>
    ` : `
      <div class="modal-header border-0 pb-0">
        <h3 class="modal-title fw-bold text-truncate pe-3">${escapeHtml(name)}</h3>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Schließen" title="Schließen"></button>
      </div>
    `}

    <div class="gf-detail-dialog-content modal-body p-4" id="${escapeHtml(`${uid}-content`)}">
      ${renderGastroDatasetLicense(item.dataLicense)}
      <div class="d-flex flex-wrap gap-2 mb-3">
        ${isRestaurant ? '<span class="badge gf-badge-restaurant px-2.5 py-1.5 fs-6 fw-semibold">🍽️ Restaurant</span>' : ""}
        ${isCafe ? '<span class="badge gf-badge-cafe px-2.5 py-1.5 fs-6 fw-semibold">☕ Café & Bar</span>' : ""}
        <span class="badge gf-badge-cuisine px-2.5 py-1.5 fs-6 fw-semibold">🍲 ${escapeHtml(cuisines)}</span>
      </div>

      <div class="mb-4">
        <h5 class="fw-bold mb-2">Über diesen Gastronomiebetrieb</h5>
        <p class="text-secondary fs-6" style="line-height: 1.7;">
          ${escapeHtml(desc)}
        </p>
      </div>

      <div class="mb-4">
        <h6 class="fw-bold mb-2">Öffnungszeiten</h6>
        <div class="p-3 bg-light rounded-3 small">
          ${hoursHtml}
        </div>
      </div>

      <div class="row g-3 mb-4">
        <div class="col-12 col-md-6">
          <div class="p-3 bg-light rounded-3 h-100">
            <h6 class="fw-bold mb-2">Adresse & Lage</h6>
            <div class="small text-muted">
              ${street ? `<div>${escapeHtml(street)}</div>` : ""}
              ${postalCode || city ? `<div>${escapeHtml(postalCode)} ${escapeHtml(city)}</div>` : ""}
              ${item.region ? `<div>${escapeHtml(item.region)}</div>` : ""}
              ${distText ? `<div class="mt-2 gf-dist-text">&bull; ${escapeHtml(distText)}</div>` : ""}
            </div>
          </div>
        </div>
        <div class="col-12 col-md-6">
          <div class="p-3 bg-light rounded-3 h-100 d-flex flex-column justify-content-between">
            <div>
              <h6 class="fw-bold mb-2">Anreise & Kontakt</h6>
              <p class="small text-muted mb-2">Route oder direkte Kontaktaufnahme:</p>
            </div>
            <div class="d-flex flex-column gap-2">
              ${hasCoords ? `
                <a href="${escapeHtml(routeUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm gf-btn-outline-forest w-100 d-inline-flex align-items-center justify-content-center gap-1">
                  <span>Google Maps Route öffnen</span> <span>↗</span>
                </a>
              ` : `<button class="btn btn-sm btn-outline-secondary w-100" disabled>Keine Koordinaten</button>`}
              ${phone ? `
                <a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}" class="btn btn-sm btn-outline-secondary w-100 d-inline-flex align-items-center justify-content-center gap-1">
                  <span>📞 Anrufen (${escapeHtml(phone)})</span>
                </a>
              ` : ""}
              ${website ? `
                <a href="${escapeHtml(safeHttpUrl(website))}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-secondary w-100 d-inline-flex align-items-center justify-content-center gap-1">
                  <span>🌐 Website besuchen</span> <span>↗</span>
                </a>
              ` : ""}
            </div>
          </div>
        </div>
      </div>

      ${images.length > 1 ? `
        <div class="mb-4">
          <h6 class="fw-bold mb-2">Fotos (${images.length})</h6>
          <div class="d-flex gap-2 overflow-auto py-1">
            ${images.map((img, idx) => `
              <button type="button" class="btn p-0 border-0 rounded overflow-hidden flex-shrink-0" data-gf-gallery-index="${idx}" style="width:72px; height:56px;" title="Foto vergrößern">
                <img src="${escapeHtml(img.url)}" style="width:100%; height:100%; object-fit:cover;" alt="Foto ${idx + 1}">
              </button>
            `).join("")}
          </div>
        </div>
      ` : ""}

      <!-- ODTA Rohdaten Akkordeon -->
      <div class="accordion mb-2" id="gf-${uid}-accordion-raw">
        <div class="accordion-item border-0 bg-light rounded-3">
          <h2 class="accordion-header">
            <button class="accordion-button collapsed bg-light rounded-3 py-2 px-3 small fw-semibold text-muted" type="button" data-bs-toggle="collapse" data-bs-target="#gf-${uid}-collapse-raw">
              <span>{ } ODTA / schema.org Rohdaten (JSON-LD)</span>
            </button>
          </h2>
          <div id="gf-${uid}-collapse-raw" class="accordion-collapse collapse" data-bs-parent="#gf-${uid}-accordion-raw">
            <div class="accordion-body p-2">
              <pre class="p-2 mb-2 bg-white rounded border small" style="max-height: 200px; overflow-y: auto;"><code>${escapeHtml(JSON.stringify(item.raw || {}, null, 2))}</code></pre>
              <button type="button" class="btn btn-sm btn-outline-secondary py-1" id="gf-${uid}-copy-raw-btn">
                In Zwischenablage kopieren
              </button>
              <p class="gf-copy-raw-status small mt-2 mb-0" data-gf-copy-status role="status" aria-live="polite"></p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-footer border-0 bg-light d-flex justify-content-between p-3">
      <button type="button" class="btn gf-btn-forest d-inline-flex align-items-center gap-2 px-3" data-gf-show-on-map>
        <span>Auf Karte anzeigen</span>
      </button>
      <button type="button" class="btn btn-outline-secondary px-3" data-bs-dismiss="modal">Schließen</button>
    </div>
  `;
}

function renderGastroLoadingSkeleton() {
  return `
    <div class="gf-skeleton-list" aria-label="Daten werden geladen">
      <div class="gf-skeleton-card">
        <div class="gf-skeleton-thumb"></div>
        <div class="gf-skeleton-lines">
          <div class="gf-skeleton-line gf-skeleton-title"></div>
          <div class="gf-skeleton-line gf-skeleton-subtitle"></div>
          <div class="gf-skeleton-line gf-skeleton-meta"></div>
        </div>
      </div>
      <div class="gf-skeleton-card">
        <div class="gf-skeleton-thumb"></div>
        <div class="gf-skeleton-lines">
          <div class="gf-skeleton-line gf-skeleton-title"></div>
          <div class="gf-skeleton-line gf-skeleton-subtitle"></div>
          <div class="gf-skeleton-line gf-skeleton-meta"></div>
        </div>
      </div>
      <div class="gf-skeleton-card">
        <div class="gf-skeleton-thumb"></div>
        <div class="gf-skeleton-lines">
          <div class="gf-skeleton-line gf-skeleton-title"></div>
          <div class="gf-skeleton-line gf-skeleton-subtitle"></div>
          <div class="gf-skeleton-line gf-skeleton-meta"></div>
        </div>
      </div>
    </div>
  `;
}

function hideGastroLoadingOverlay(root, uid) {
  if (!root || typeof root.querySelector !== "function") return;
  const overlay = (uid && root.querySelector(`#gf-${uid}-loading-overlay`)) || root.querySelector(".gf-loading-overlay");
  if (!overlay) return;
  overlay.classList.add("gf-fade-out");
  setTimeout(() => {
    if (overlay && overlay.parentNode) {
      overlay.style.display = "none";
    }
  }, 400);
}

function renderGastroDetails(poi, uid = "gf-detail", status = "ready") {
  return renderGastroHeroDetails(poi, uid, status);
}

function renderGastroShell(root, state) {
  if (!root || !state || !state.runtime) return;
  const uid = state.runtime.uid || createGastroUid();
  state.runtime.uid = uid;
  if (root.classList && root.classList.add) root.classList.add("gf-root");
  const regionName = state.region ? state.region.ort : "Suchgebiet wird geladen";
  const radius = state.region ? `${state.region.radiusKm} km Umkreis` : "Umkreis wird geladen";
  const appTitle = state.config && state.config.titel ? state.config.titel : "Gastrofinder";
  root.innerHTML = `<section class="gf-fullscreen-wrapper gf-shell" aria-label="Gastrofinder im Suchgebiet">
    <div class="gf-map-layer">
      <div class="gf-map-canvas" data-gf="map" aria-label="Karte der geladenen Gastro-Betriebe">
        <div class="gf-map-fallback" data-gf="map-fallback">Karte wird geladen …</div>
        <button type="button" class="gf-area-button" data-gf-show-area data-gf-control="area">${gastroIcon("pin")} Gebiet anzeigen</button>
      </div>
    </div>
    <div class="gf-brandbar" data-gf-brandbar>
      <img src="${escapeHtml(resolveGastroBrandAssetUrl("odas-app-icon.svg"))}" class="gf-brandbar-logo" alt="Logo" onerror="this.onerror=null;this.src='${escapeHtml(resolveGastroBrandAssetUrl("favicon.png"))}'">
      <div class="gf-brandbar-text">
        <strong>${escapeHtml(appTitle)}</strong>
        <span>Genussatlas · ${escapeHtml(regionName)}</span>
        <small>${escapeHtml(radius)} · vom Portal festgelegt</small>
      </div>
    </div>
    <div class="gf-floating-actions" data-gf-floating-actions aria-label="Kartenaktionen">
      <button type="button" class="gf-floating-button gf-floating-primary" data-gf-catalog-toggle data-gf-control="catalog">${gastroIcon("grid")}<span>Katalog</span></button>
      <button type="button" class="gf-floating-button" data-gf-share data-gf-control="share" title="Auf dem Smartphone öffnen">${gastroIcon("share")}<span>Handy</span></button>
      <button type="button" class="gf-floating-button gf-floating-icon" data-gf-menu data-gf-control="menu" data-bs-toggle="offcanvas" data-bs-target="#offcanvasNavbar" aria-controls="offcanvasNavbar" aria-label="Menü öffnen">${gastroIcon("menu")}</button>
    </div>
    <aside id="gf-${uid}-cockpit" class="gf-cockpit" data-gf-cockpit aria-label="Suche und Ergebnisse">
      <div class="gf-cockpit-header">
        <div class="gf-cockpit-brand">
          <img src="${escapeHtml(resolveGastroBrandAssetUrl("odas-app-icon.svg"))}" class="gf-cockpit-logo" alt="Logo" onerror="this.onerror=null;this.src='${escapeHtml(resolveGastroBrandAssetUrl("favicon.png"))}'">
          <div class="gf-cockpit-title-wrap">
            <strong class="gf-cockpit-title">${escapeHtml(appTitle)}</strong>
            <span class="gf-cockpit-subtitle">${escapeHtml(regionName)} · ${escapeHtml(radius)}</span>
          </div>
        </div>
        <button type="button" class="gf-cockpit-toggle" data-gf-cockpit-toggle data-gf-control="cockpit" aria-expanded="true" aria-label="Cockpit einklappen">${gastroIcon("arrow")}</button>
      </div>
      <div class="gf-cockpit-search">
        <label class="gf-visually-hidden" for="gf-${uid}-search">Name, Ort oder Küche suchen</label>
        <div class="gf-search">${gastroIcon("search")}<input id="gf-${uid}-search" data-gf-search type="search" placeholder="Name, Ort oder Küche suchen" autocomplete="off"></div>
      </div>
      <div class="gf-filter-buttons" role="group" aria-label="Betriebstyp"><button type="button" data-gf-filter="all" aria-pressed="true">Alle <span data-gf-count="all">0</span></button><button type="button" data-gf-filter="restaurant" aria-pressed="false">Restaurants <span data-gf-count="restaurant">0</span></button><button type="button" data-gf-filter="cafe" aria-pressed="false">Cafés <span data-gf-count="cafe">0</span></button></div>
      <div class="gf-selects"><label for="gf-${uid}-cuisine">Küche</label><select id="gf-${uid}-cuisine" data-gf-cuisine><option value="all">Alle Küchen</option><option value="missing">Nicht angegeben</option></select><label for="gf-${uid}-sort">Sortierung</label><select id="gf-${uid}-sort" data-gf-sort><option value="distance">Entfernung</option><option value="name">Name</option></select></div>
      <div class="gf-results-head"><div><p class="gf-eyebrow">Gut essen. Nah entdecken.</p><h1 id="gf-${uid}-results-heading" data-gf="results-heading" tabindex="-1">Ergebnisse im Suchgebiet</h1></div><span class="gf-count" data-gf="count">0 Orte</span></div>
      <div class="gf-results-scroll" data-gf="results-scroll"><div class="gf-results-list" data-gf="results-list" data-gf-results-list></div></div>
      <div class="gf-results-footer"><span data-gf="visible-count">0 von 0 Orten</span><button type="button" class="gf-button gf-button-secondary" data-gf-show-more data-gf-control="show-more">Mehr anzeigen</button><button type="button" class="gf-button gf-button-primary" data-gf-load-next data-gf-control="load-next">Weitere Daten laden</button></div>
    </aside>
    <button type="button" class="gf-edge-tab" data-gf-edge-tab data-gf-control="cockpit-edge" aria-controls="gf-${uid}-cockpit" hidden>${gastroIcon("arrow")}<span>Ergebnisse öffnen</span></button>
    <button type="button" class="gf-bottom-switcher" data-gf-bottom-switcher data-gf-control="mobile-switcher" aria-pressed="false">${gastroIcon("map")}<span>Genusskarte</span></button>
    <div class="gf-map-controls" data-gf="map-controls" aria-label="Kartensteuerung"></div>
    <p class="gf-status" data-gf="status" role="status" aria-live="polite"></p>
    <div class="gf-legend" aria-label="Kartenlegende"><span>${gastroIcon("fork")} Restaurant</span><span>${gastroIcon("cup")} Café</span><span>${gastroIcon("pin")} Auswahl bleibt erhalten</span></div>
    
    <!-- Glassmorphism Lade-Overlay -->
    <div id="gf-${uid}-loading-overlay" class="gf-loading-overlay" data-gf-loading-overlay>
      <div class="gf-loading-card">
        <div class="gf-loading-icon-wrap">
          <img src="${escapeHtml(resolveGastroBrandAssetUrl("odas-app-icon.svg"))}" class="gf-loading-icon" alt="Laden…" onerror="this.onerror=null;this.src='${escapeHtml(resolveGastroBrandAssetUrl("favicon.png"))}'">
          <div class="gf-loading-spinner-ring"></div>
        </div>
        <h3 class="gf-loading-title">Gastronomiebetriebe werden geladen…</h3>
        <p class="gf-loading-subtitle">DZT Knowledge Graph &bull; ${escapeHtml(regionName)}</p>
      </div>
    </div>

    <div class="modal fade gf-detail-modal" id="gf-${uid}-detail-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
        <div class="modal-content border-0 shadow-lg overflow-hidden" id="gf-${uid}-detail-modal-content"></div>
      </div>
    </div>
  </section>`;
  const detailModal = (root && typeof root.querySelector === "function") ? root.querySelector(`#gf-${uid}-detail-modal`) : null;
  if (detailModal && typeof document !== "undefined" && document.body && typeof document.body.appendChild === "function") {
    document.body.appendChild(detailModal);
    if (!state.runtime.appendedModals) state.runtime.appendedModals = [];
    state.runtime.appendedModals.push(detailModal);
    setupDetailModalListeners(detailModal, state, () => updateGastroView(root, state));
  }
}

function bindGastroImageFallbacks(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  for (const image of root.querySelectorAll("img.gf-card-image, .gf-gallery-item img, .gf-detail-content > .gf-gallery img")) {
    addGastroListener(image, "error", () => {
      const cardMedia = image.closest(".gf-card-media");
      if (cardMedia) {
        const card = image.closest("[data-gf-card]");
        const heading = card && card.querySelector("h3");
        cardMedia.innerHTML = gastroNoPhoto(heading ? heading.textContent : "Gastrofinder");
        return;
      }
      const figure = image.closest(".gf-gallery-figure");
      if (figure) figure.innerHTML = `<div class="gf-no-photo" aria-live="polite">${gastroIcon("fork")}<span>Bild nicht verfügbar</span></div>`;
    }, { runtime: { events: null } });
  }
}

function updateGastroStatus(root, state, view) {
  if (!root || typeof root.querySelector !== "function") return;
  const status = root.querySelector('[data-gf="status"]');
  if (!status) return;
  if (state.page.error) {
    status.textContent = state.page.error.code === "ACCESS" || state.page.error.code === "RELAY"
      ? "Die Datenquelle ist gerade nicht erreichbar. Bitte später erneut versuchen."
      : "Die Daten konnten nicht geladen werden. Bitte später erneut versuchen.";
  } else if (state.page.busy) {
    status.textContent = "Weitere Daten werden geladen …";
  } else if (state.page.done && !state.byId.size) {
    status.textContent = "Keine Daten gefunden.";
  } else {
    status.textContent = `${state.byId.size} Orte geladen · ${view.partial ? "Nachladen möglich" : "geladener Bestand vollständig"}`;
  }
}

function updateGastroView(root, state) {
  if (!root || !state || typeof root.querySelector !== "function") return;
  const brandbar = root.querySelector('[data-gf-brandbar]');
  if (brandbar && state.region) {
    const regionName = state.region.ort || "Region";
    const radius = `${state.region.radiusKm || 25} km Umkreis`;
    const appTitle = state.config && state.config.titel ? state.config.titel : "Gastrofinder";
    brandbar.innerHTML = `
      <img src="${escapeHtml(resolveGastroBrandAssetUrl("odas-app-icon.svg"))}" class="gf-brandbar-logo" alt="Logo" onerror="this.onerror=null;this.src='${escapeHtml(resolveGastroBrandAssetUrl("favicon.png"))}'">
      <div class="gf-brandbar-text">
        <strong>${escapeHtml(appTitle)}</strong>
        <span>Genussatlas · ${escapeHtml(regionName)}</span>
        <small>${escapeHtml(radius)} · vom Portal festgelegt</small>
      </div>
    `;
  }
  const cockpitBrand = root.querySelector('.gf-cockpit-brand');
  if (cockpitBrand && state.region) {
    const regionName = state.region.ort || "Region";
    const radius = `${state.region.radiusKm || 25} km Umkreis`;
    const appTitle = state.config && state.config.titel ? state.config.titel : "Gastrofinder";
    const titleEl = cockpitBrand.querySelector('.gf-cockpit-title');
    if (titleEl) titleEl.textContent = appTitle;
    const subtitleEl = cockpitBrand.querySelector('.gf-cockpit-subtitle');
    if (subtitleEl) subtitleEl.textContent = `${regionName} · ${radius}`;
  }
  const view = deriveGastroView(state);
  const focusedId = typeof document !== "undefined" && document.activeElement && typeof document.activeElement.getAttribute === "function"
    ? document.activeElement.getAttribute("data-gf-id")
    : null;
  const openerId = state.runtime.detailOpener && typeof state.runtime.detailOpener.getAttribute === "function"
    ? state.runtime.detailOpener.getAttribute("data-gf-id")
    : null;
  const scroll = root.querySelector('[data-gf="results-scroll"]');
  const previousScroll = scroll ? scroll.scrollTop : 0;
  const list = root.querySelector('[data-gf="results-list"]');
  if (list) {
    const limit = state.view === "catalog" ? state.visible.catalog : state.visible.list;
    const visible = view.pois.slice(0, limit);
    if (visible.length) {
      list.innerHTML = visible.map((poi) => renderGastroCard(poi, state.runtime.uid, poi.id === state.selectedId)).join("");
    } else if (state.page.busy) {
      list.innerHTML = renderGastroLoadingSkeleton();
    } else {
      list.innerHTML = `<div class="gf-empty">${state.page.done ? "Keine passenden Orte gefunden." : "Keine passenden Orte im geladenen Bestand. Weitere Daten können noch folgen."}</div>`;
    }
  }
  if (scroll) {
    const key = state.view === "catalog" ? "catalog" : "list";
    state.positions[key] = previousScroll;
    scroll.scrollTop = state.positions[key] || 0;
  }
  const count = root.querySelector('[data-gf="count"]');
  if (count) count.textContent = `${view.pois.length} ${view.pois.length === 1 ? "Ort" : "Orte"}`;
  const visibleCount = root.querySelector('[data-gf="visible-count"]');
  if (visibleCount) {
    const limit = state.view === "catalog" ? state.visible.catalog : state.visible.list;
    visibleCount.textContent = `${Math.min(limit, view.pois.length)} von ${view.pois.length} Orten`;
  }
  for (const type of ["all", "restaurant", "cafe"]) {
    const counter = root.querySelector(`[data-gf-count="${type}"]`);
    if (counter) counter.textContent = view.counts[type];
  }
  const cuisine = root.querySelector('[data-gf-cuisine]');
  if (cuisine && view.cuisineOptions) {
    const selected = state.filters.cuisine;
    const options = ["all", ...view.cuisineOptions.filter((value) => value !== "all")];
    cuisine.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value === "all" ? "Alle Küchen" : value === "missing" ? "Nicht angegeben" : value)}</option>`).join("");
  }
  const sort = root.querySelector('[data-gf-sort]');
  if (sort) sort.value = state.sort;
  const load = root.querySelector('[data-gf-load-next]');
  if (load) {
    load.disabled = state.page.busy || state.page.done;
    load.innerHTML = state.page.busy
      ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Wird geladen …'
      : "Weitere Daten laden";
  }
  const more = root.querySelector('[data-gf-show-more]');
  if (more) {
    const limit = state.view === "catalog" ? state.visible.catalog : state.visible.list;
    more.hidden = view.pois.length <= limit;
  }
  if (typeof root.querySelectorAll === "function") {
    for (const button of root.querySelectorAll("[data-gf-filter]")) {
      button.setAttribute("aria-pressed", button.getAttribute("data-gf-filter") === state.filters.type ? "true" : "false");
    }
    for (const button of root.querySelectorAll("[data-gf-view]")) {
      button.setAttribute("aria-pressed", button.getAttribute("data-gf-view") === state.view ? "true" : "false");
    }
  }
  if ((focusedId || openerId) && typeof root.querySelectorAll === "function") {
    for (const button of root.querySelectorAll("[data-gf-select]")) {
      if (button.getAttribute("data-gf-id") === (openerId || focusedId)) {
        if (openerId) state.runtime.detailOpener = button;
        if (focusedId && typeof button.focus === "function") button.focus();
        break;
      }
    }
  }
  if (state.runtime.catalogOpen) refreshGastroCatalog(root, state);
  if (state.runtime.detailDialog) updateGastroDetailDialog(root, state);
  bindGastroImageFallbacks(root);
  updateGastroStatus(root, state, view);
  updateGastroMap(root, state, view);
  if (state.byId.size > 0 || state.page.done || state.page.error) {
    hideGastroLoadingOverlay(root, state.runtime.uid);
  }
}

function galleryImageMarkup(image) {
  const sourceUrl = safeHttpUrl(image.sourceUrl);
  return `<figure class="gf-gallery-figure"><img src="${escapeHtml(safeHttpUrl(image.url))}" alt="${escapeHtml(image.title || "Gastrofinder-Bild")}"><figcaption><strong>${escapeHtml(image.title || "Bild")}</strong><span>${escapeHtml(image.credit || "Urheber nicht angegeben")}</span>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Quelle ${gastroIcon("external")}</a>` : ""}<a href="${escapeHtml(safeHttpUrl(image.licenseUrl))}" target="_blank" rel="noopener noreferrer">Lizenz ${gastroIcon("external")}</a></figcaption></figure>`;
}

function openGastroGallery(root, state, opener = null) {
  if (typeof document === "undefined" || !state || !state.selectedId) return false;
  const poi = state.details.get(state.selectedId) || state.byId.get(state.selectedId);
  const images = (poi && poi.images || []).filter(gastroImageIsUsable);
  if (!images.length) return false;
  if (state.runtime.gallery) closeGastroGallery(root, state);
  const dialog = document.createElement("dialog");
  dialog.className = "gf-gallery-dialog";
  dialog.setAttribute("aria-label", "Bilder des ausgewählten Betriebs");
  const gallery = { dialog, opener: opener || document.activeElement, images, index: 0 };
  const renderAt = (index) => {
    gallery.index = (index + images.length) % images.length;
    const image = images[gallery.index];
    dialog.innerHTML = `<div class="gf-gallery-dialog-inner"><div class="gf-gallery-toolbar"><strong>Bild ${gallery.index + 1} von ${images.length}</strong><button type="button" class="gf-icon-button" data-gallery-close aria-label="Galerie schließen">${gastroIcon("close")}</button></div>${galleryImageMarkup(image)}<div class="gf-gallery-controls"><button type="button" class="gf-button gf-button-secondary" data-gallery-prev>${gastroIcon("arrow")} Vorheriges Bild</button><button type="button" class="gf-button gf-button-secondary" data-gallery-next>Nächstes Bild ${gastroIcon("arrow")}</button></div></div>`;
  };
  const close = () => closeGastroGallery(root, state);
  gallery.close = close;
  state.runtime.gallery = gallery;
  dialog.addEventListener("close", () => {
    if (state.runtime.gallery === gallery) closeGastroGallery(root, state, true);
  });
  dialog.addEventListener("click", (event) => {
    const target = event.target && typeof event.target.closest === "function" ? event.target.closest("button") : null;
    if (!target) return;
    if (target.hasAttribute("data-gallery-close")) closeGastroGallery(root, state);
    if (target.hasAttribute("data-gallery-prev")) renderAt(gallery.index - 1);
    if (target.hasAttribute("data-gallery-next")) renderAt(gallery.index + 1);
  });
  renderAt(0);
  if (typeof document !== "undefined" && document.body && typeof document.body.appendChild === "function") {
    document.body.appendChild(dialog);
  }
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  return true;
}

function closeGastroGallery(root, state, fromDialogEvent = false) {
  if (!state || !state.runtime || !state.runtime.gallery) return;
  const gallery = state.runtime.gallery;
  state.runtime.gallery = null;
  if (!fromDialogEvent && gallery.dialog && typeof gallery.dialog.close === "function") {
    try { gallery.dialog.close(); } catch (_error) { /* bereits geschlossen */ }
  }
  if (gallery.dialog && typeof gallery.dialog.remove === "function") gallery.dialog.remove();
  if (gallery.opener && gallery.opener.isConnected && typeof gallery.opener.focus === "function") {
    gallery.opener.focus();
  } else if (root && root.querySelector) {
    const heading = root.querySelector('[data-gf="results-heading"]');
    if (heading && typeof heading.focus === "function") heading.focus();
  }
}

function updateGastroDetailDialog(root, state) {
  if (!root || !state || !state.runtime || !state.runtime.detailDialog) return false;
  const record = state.runtime.detailDialog;
  const element = record.element || record;
  if (!element) return false;
  const selected = state.selectedId ? state.byId.get(state.selectedId) : null;
  if (!selected) return false;
  const detail = state.details.get(selected.id);
  const status = state.detail.error ? "error" : state.detail.busy || !detail ? "loading" : "ready";
  element.innerHTML = renderGastroHeroDetails(detail || selected, state.runtime.uid, status);
  if (typeof element.setAttribute === "function") element.setAttribute("aria-labelledby", `gf-${state.runtime.uid}-title`);
  bindGastroImageFallbacks(element);
  return true;
}

function setupDetailModalListeners(modalEl, state, notify = () => {}) {
  if (!modalEl || typeof modalEl.addEventListener !== "function") return;
  if (modalEl.__gfDetailListenersSet) return;
  modalEl.__gfDetailListenersSet = true;
  modalEl.addEventListener("show.bs.modal", () => { modalEl.__gfShown = false; });
  modalEl.addEventListener("shown.bs.modal", () => { modalEl.__gfShown = true; });
  modalEl.addEventListener("hidden.bs.modal", () => {
    if (state.runtime && state.runtime.detailAbort && typeof state.runtime.detailAbort.abort === "function") {
      state.runtime.detailAbort.abort();
      state.runtime.detailAbort = null;
    }
    if (state.detail) {
      state.detail.seq += 1;
      state.detail.busy = false;
    }
    const navigatingToMap = Boolean(state.runtime && state.runtime.navigatingToMap);
    const opener = state.runtime && state.runtime.detailOpener;
    const openerId = opener && typeof opener.getAttribute === "function" ? opener.getAttribute("data-gf-id") : null;
    if (!navigatingToMap) state.selectedId = null;
    if (state.runtime) {
      state.runtime.navigatingToMap = false;
      state.runtime.detailOpener = null;
    }
    if (!navigatingToMap && opener && opener.isConnected !== false && typeof opener.focus === "function") opener.focus();
    else if (!navigatingToMap && state.runtime && state.runtime.root) restoreGastroDetailFocus(state.runtime.root, state, openerId);
    notify();
  });
}

function focusPoiOnMap(state, poiId) {
  if (!state) return;
  const id = typeof poiId === "string" ? poiId : (poiId && poiId.id);
  if (!id) return;
  const poi = (state.byId && state.byId.get ? state.byId.get(id) : null)
    || (state.pois || []).find((p) => p.id === id)
    || (state.allPois || []).find((p) => p.id === id);
  if (!poi) return;
  if (state.runtime) {
    if (state.runtime.catalogOpen && state.runtime.root) {
      closeGastroCatalog(state.runtime.root, state);
    }
    if (state.runtime.mobileView === "list" && state.runtime.root) {
      setGastroMobileView(state.runtime.root, state, "map");
    }
    if (state.runtime.cockpitCollapsed && typeof state.setCockpitState === "function") {
      state.setCockpitState(false);
    }
    state.selectedId = id;
    if (state.runtime.root) updateGastroView(state.runtime.root, state);
    const marker = state.runtime.markerById ? state.runtime.markerById.get(id) : null;
    if (marker && state.runtime.markerLayer && typeof state.runtime.markerLayer.zoomToShowLayer === "function") {
      state.runtime.markerLayer.zoomToShowLayer(marker, () => {
        if (typeof marker.openPopup === "function") marker.openPopup();
      });
    } else if (state.runtime.map && poi.lat && poi.lng) {
      const zoom = state.runtime.map.getZoom ? state.runtime.map.getZoom() : 14;
      state.runtime.map.setView([poi.lat, poi.lng], Math.max(zoom, 15));
      if (marker && typeof marker.openPopup === "function") marker.openPopup();
    }
  } else if (state.map && poi.lat && poi.lng) {
    const zoom = state.map.getZoom ? state.map.getZoom() : 14;
    state.map.setView([poi.lat, poi.lng], Math.max(zoom, 15));
  }
}

function openDetailModal(state, poiId, shouldLoadDetails = true, showModal = true) {
  if (!state) return;
  const targetId = typeof poiId === "string" ? poiId : (poiId && poiId.id ? poiId.id : state.selectedId);
  const poi = (typeof poiId === "object" && poiId !== null && poiId.name)
    ? poiId
    : ((state.pois || []).find((candidate) => candidate.id === targetId)
      || (state.allPois || []).find((candidate) => candidate.id === targetId)
      || (state.byId && state.byId.get ? state.byId.get(targetId) : null));
  if (!poi) return;

  if (shouldLoadDetails && state.runtime && state.runtime.active && state.runtime.root) {
    selectGastroPoi(state, poi.id, () => {
      if (state.runtime && state.runtime.root) updateGastroView(state.runtime.root, state);
    });
    return;
  }
  if (state.runtime) state.selectedId = poi.id;

  const uid = state.runtime ? state.runtime.uid : (state.uid || "gf");
  let modalEl = typeof document !== "undefined" && document.getElementById
    ? (document.getElementById(`gf-${uid}-detail-modal`) || document.getElementById("gf-detail-modal"))
    : null;
  if (!modalEl && typeof document !== "undefined" && document.createElement) {
    modalEl = document.createElement("div");
    modalEl.className = "modal fade gf-detail-modal";
    modalEl.id = `gf-${uid}-detail-modal`;
    modalEl.tabIndex = -1;
    modalEl.setAttribute("aria-hidden", "true");
    modalEl.setAttribute("aria-label", "Details zum Gastronomiebetrieb");
    modalEl.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable"><div class="modal-content border-0 shadow-lg overflow-hidden" id="gf-${uid}-detail-modal-content"></div></div>`;
    if (document.body && typeof document.body.appendChild === "function") {
      document.body.appendChild(modalEl);
      if (state.runtime) {
        if (!state.runtime.appendedModals) state.runtime.appendedModals = [];
        state.runtime.appendedModals.push(modalEl);
      }
    }
  }
  if (modalEl) setupDetailModalListeners(modalEl, state, () => {
    if (state.runtime && state.runtime.root) updateGastroView(state.runtime.root, state);
  });

  const modalContent = (modalEl && modalEl.querySelector &&
    (modalEl.querySelector(`#gf-${uid}-detail-modal-content`) || modalEl.querySelector(".modal-content"))) || modalEl;
  if (modalContent) {
    const detail = state.details && state.details.get ? state.details.get(poi.id) : null;
    const isSelected = state.selectedId === poi.id;
    const status = state.detail && isSelected && state.detail.error ? "error"
      : state.detail && isSelected && state.detail.busy ? "loading"
        : detail ? "ready" : "ready";
    const displayedPoi = detail || poi;
    modalContent.innerHTML = renderGastroHeroDetails(displayedPoi, uid, status);
    bindGastroImageFallbacks(modalContent);

    const showOnMapBtn = modalContent.querySelector && modalContent.querySelector("[data-gf-show-on-map]");
    if (showOnMapBtn && typeof showOnMapBtn.addEventListener === "function") {
      showOnMapBtn.addEventListener("click", () => {
        if (state.runtime) state.runtime.navigatingToMap = true;
        if (typeof window !== "undefined" && window.bootstrap && window.bootstrap.Modal) {
          const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
          modal.hide();
        }
        focusPoiOnMap(state, poi.id);
      });
    }

    const retryBtn = modalContent.querySelector && modalContent.querySelector("[data-gf-detail-retry]");
    if (retryBtn && typeof retryBtn.addEventListener === "function") {
      if (state.detail && state.detail.retryAt > Date.now()) {
        retryBtn.textContent = `Erneut versuchen ab ${new Date(state.detail.retryAt).toLocaleTimeString("de-DE")}`;
      }
      retryBtn.addEventListener("click", () => selectGastroPoi(state, poi.id, () => {
        if (state.runtime && state.runtime.root) updateGastroView(state.runtime.root, state);
      }));
    }

    const copyRawBtn = modalContent.querySelector && modalContent.querySelector(`#gf-${uid}-copy-raw-btn`);
    const copyStatus = modalContent.querySelector && modalContent.querySelector("[data-gf-copy-status]");
    if (copyRawBtn && typeof copyRawBtn.addEventListener === "function") {
      copyRawBtn.addEventListener("click", async () => {
        const rawJson = JSON.stringify(displayedPoi.raw || {}, null, 2);
        try {
          if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
            throw new Error("Clipboard nicht verfügbar");
          }
          await navigator.clipboard.writeText(rawJson);
          if (copyStatus) copyStatus.textContent = "JSON wurde kopiert.";
        } catch (_error) {
          if (copyStatus) copyStatus.textContent = "Kopieren nicht möglich. Rohdaten können oben manuell kopiert werden.";
        }
      });
    }

    const heroWrap = modalContent.querySelector && modalContent.querySelector("[data-gf-hero-gallery]");
    if (heroWrap && typeof heroWrap.addEventListener === "function") {
      heroWrap.addEventListener("click", (event) => {
        openLightbox(displayedPoi, 0, state, event.currentTarget || heroWrap);
      });
    }
    if (modalContent.querySelectorAll) {
      modalContent.querySelectorAll("[data-gf-gallery-index]").forEach((thumb) => {
        if (typeof thumb.addEventListener === "function") {
          thumb.addEventListener("click", () => {
            const index = parseInt(thumb.getAttribute("data-gf-gallery-index"), 10) || 0;
            openLightbox(displayedPoi, index, state, thumb);
          });
        }
      });
    }
  }

  if (showModal && modalEl && typeof window !== "undefined" && window.bootstrap && window.bootstrap.Modal) {
    window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

function openLightbox(poi, initialIndex = 0, state = null, opener = null) {
  if (!poi || typeof document === "undefined" || !document.createElement) return;
  const rawImages = Array.isArray(poi.images) ? poi.images : [];
  const images = rawImages.map((img) => {
    if (typeof img === "string") return { url: img };
    return {
      url: img.url || img["schema:contentUrl"] || img.contentUrl || "",
      title: img.title || poi.name || "",
      credit: img.credit || "",
      licenseUrl: img.licenseUrl || "",
      sourceUrl: img.sourceUrl || "",
    };
  }).filter(gastroImageIsUsable);
  if (images.length === 0) return;

  let currentIndex = initialIndex;
  if (currentIndex < 0 || currentIndex >= images.length) currentIndex = 0;

  const existing = document.getElementById("gf-lightbox-overlay");
  if (existing && typeof existing.__gfClose === "function") existing.__gfClose(true);
  else if (existing && typeof existing.remove === "function") existing.remove();

  const focusOpener = opener || document.activeElement;
  const lightbox = document.createElement("div");
  lightbox.id = "gf-lightbox-overlay";
  lightbox.className = "gf-lightbox-overlay";
  lightbox.tabIndex = -1;
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", "Vollbild Galerie");
  lightbox.innerHTML = `
    <div class="gf-lightbox-backdrop"></div>
    <div class="gf-lightbox-top-bar">
      <div class="gf-lightbox-counter">${images.length > 1 ? `${currentIndex + 1} / ${images.length}` : ""}</div>
      <button type="button" class="gf-lightbox-close-btn" aria-label="Schließen" title="Schließen (Esc)">✕</button>
    </div>
    <div class="gf-lightbox-content">
      ${images.length > 1 ? `<button type="button" class="gf-lightbox-nav-btn gf-lightbox-prev" aria-label="Vorheriges Bild" title="Vorheriges Bild (Pfeiltaste links)">‹</button>` : ""}
      <div class="gf-lightbox-img-container">
        <img src="${escapeHtml(images[currentIndex].url)}" class="gf-lightbox-img" alt="${escapeHtml(poi.name || '')}" />
      </div>
      ${images.length > 1 ? `<button type="button" class="gf-lightbox-nav-btn gf-lightbox-next" aria-label="Nächstes Bild" title="Nächstes Bild (Pfeiltaste rechts)">›</button>` : ""}
    </div>
    <div class="gf-lightbox-bottom-bar">
      <div class="gf-lightbox-title">${escapeHtml(poi.name || '')}</div>
      <div class="gf-lightbox-caption">${renderGastroImageAttribution(images[currentIndex], "gf-lightbox-image-attribution")}</div>
    </div>
  `;

  const lightboxHost = focusOpener && typeof focusOpener.closest === "function"
    ? focusOpener.closest(".modal")
    : null;
  if (lightboxHost && typeof lightboxHost.appendChild === "function") lightboxHost.appendChild(lightbox);
  else if (document.body && typeof document.body.appendChild === "function") document.body.appendChild(lightbox);
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => lightbox.classList.add("gf-lightbox-open"));
  else if (lightbox.classList && lightbox.classList.add) lightbox.classList.add("gf-lightbox-open");

  let closed = false;
  const focusableSelector = "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
  function closeLightbox(fromPageLeave = false) {
    if (closed) return;
    closed = true;
    if (lightbox.classList && lightbox.classList.remove) lightbox.classList.remove("gf-lightbox-open");
    if (typeof document.removeEventListener === "function") document.removeEventListener("keydown", handleKeydown, true);
    if (state && state.runtime && state.runtime.lightbox === record) state.runtime.lightbox = null;
    if (fromPageLeave) {
      removeParentFocusListeners();
      if (lightbox && typeof lightbox.remove === "function") lightbox.remove();
    } else {
      setTimeout(() => {
        if (lightbox && lightbox.parentNode && typeof lightbox.remove === "function") lightbox.remove();
      }, 250);
    }
    if (focusOpener && focusOpener.isConnected !== false && typeof focusOpener.focus === "function") focusOpener.focus();
  }

  function updateImage(idx) {
    if (idx < 0) idx = images.length - 1;
    if (idx >= images.length) idx = 0;
    currentIndex = idx;
    const image = images[currentIndex];
    const imgEl = lightbox.querySelector(".gf-lightbox-img");
    const counterEl = lightbox.querySelector(".gf-lightbox-counter");
    const captionEl = lightbox.querySelector(".gf-lightbox-caption");
    if (imgEl) imgEl.src = image.url;
    if (counterEl && images.length > 1) counterEl.textContent = `${currentIndex + 1} / ${images.length}`;
    if (captionEl) captionEl.innerHTML = renderGastroImageAttribution(image, "gf-lightbox-image-attribution");
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeLightbox();
    } else if (event.key === "ArrowLeft" && images.length > 1) {
      updateImage(currentIndex - 1);
    } else if (event.key === "ArrowRight" && images.length > 1) {
      updateImage(currentIndex + 1);
    } else if (event.key === "Tab") {
      const focusable = Array.from(lightbox.querySelectorAll(focusableSelector) || []).filter((element) => !element.disabled);
      if (!focusable.length) {
        event.preventDefault();
        lightbox.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === lightbox)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  const record = { element: lightbox, opener: focusOpener, close: closeLightbox };
  lightbox.__gfClose = closeLightbox;
  if (state && state.runtime) state.runtime.lightbox = record;
  if (typeof document.addEventListener === "function") document.addEventListener("keydown", handleKeydown, true);

  const closeBtn = lightbox.querySelector(".gf-lightbox-close-btn");
  function removeParentFocusListeners() {
    if (!lightboxHost || typeof lightboxHost.removeEventListener !== "function") return;
    lightboxHost.removeEventListener("shown.bs.modal", restoreParentFocus);
    lightboxHost.removeEventListener("hidden.bs.modal", removeParentFocusListeners);
  }
  function restoreParentFocus() {
    removeParentFocusListeners();
    const target = closed ? focusOpener : closeBtn;
    if (target && target.isConnected !== false && typeof target.focus === "function") target.focus();
  }
  // Bootstrap setzt am Ende seiner Fade-Transition den Fokus erneut auf das Modal.
  if (lightboxHost && !lightboxHost.__gfShown && typeof lightboxHost.addEventListener === "function") {
    lightboxHost.addEventListener("shown.bs.modal", restoreParentFocus);
    lightboxHost.addEventListener("hidden.bs.modal", removeParentFocusListeners);
  }
  if (closeBtn && typeof closeBtn.addEventListener === "function") closeBtn.addEventListener("click", () => closeLightbox());
  const backdrop = lightbox.querySelector(".gf-lightbox-backdrop");
  if (backdrop && typeof backdrop.addEventListener === "function") backdrop.addEventListener("click", () => closeLightbox());
  const prevBtn = lightbox.querySelector(".gf-lightbox-prev");
  if (prevBtn && typeof prevBtn.addEventListener === "function") prevBtn.addEventListener("click", () => updateImage(currentIndex - 1));
  const nextBtn = lightbox.querySelector(".gf-lightbox-next");
  if (nextBtn && typeof nextBtn.addEventListener === "function") nextBtn.addEventListener("click", () => updateImage(currentIndex + 1));
  if (closeBtn && typeof closeBtn.focus === "function") closeBtn.focus();
  return record;
}

async function openQrModal(state) {
  let modalEl = (typeof document !== "undefined" && document.getElementById)
    ? (document.getElementById("gf-qr-modal") || document.getElementById("sw-qr-modal"))
    : null;
  if (!modalEl && typeof document !== "undefined" && document.createElement) {
    modalEl = document.createElement("div");
    modalEl.className = "modal fade gf-qr-modal";
    modalEl.id = "gf-qr-modal";
    modalEl.tabIndex = -1;
    modalEl.setAttribute("aria-hidden", "true");
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content border-0 shadow-lg text-center gf-qr-modal-content">
          <div class="modal-header border-0 pb-0 justify-content-end">
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Schließen"></button>
          </div>
          <div class="modal-body px-4 pt-1 pb-4" id="gf-qr-modal-body"></div>
        </div>
      </div>
    `;
    if (document.body && typeof document.body.appendChild === "function") {
      document.body.appendChild(modalEl);
      if (state && state.runtime) {
        if (!state.runtime.appendedModals) state.runtime.appendedModals = [];
        state.runtime.appendedModals.push(modalEl);
      }
    }
  }

  const modalBody = modalEl && modalEl.querySelector ? modalEl.querySelector("#gf-qr-modal-body") : null;
  if (!modalBody) return;

  try {
    await ensureQrCodeLoaded();
  } catch (err) {
    console.warn("QR code library load error:", err);
  }

  const currentUrl = (typeof window !== "undefined" && window.location)
    ? window.location.href.split("#")[0] + "#startseite"
    : "";

  let svgHtml = "";
  if (typeof window !== "undefined" && typeof window.qrcode === "function") {
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(currentUrl);
      qr.make();
      svgHtml = qr.createSvgTag({ scalable: true });
    } catch (e) {
      console.error("QR generation failed:", e);
    }
  }

  modalBody.innerHTML = `
    <div class="gf-qr-icon-wrap" style="width:48px;height:48px;margin:0 auto 12px;background:#fef2f2;color:#b91c1c;border-radius:50%;display:flex;align-items:center;justify-content:center;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
        <line x1="12" y1="18" x2="12.01" y2="18"></line>
      </svg>
    </div>
    <h3 class="h5 fw-bold text-dark mt-2 mb-1">Auf Smartphone öffnen</h3>
    <p class="small text-secondary mb-3" style="line-height: 1.4;">
      Scanne den QR-Code mit der Smartphone-Kamera, um diesen Gastrofinder direkt mobil aufzurufen.
    </p>
    <div class="gf-qr-svg-card mb-3 p-2 bg-white rounded border" style="display:inline-block;max-width:200px;">
      ${svgHtml || '<div class="text-danger small">QR-Code konnte nicht geladen werden</div>'}
    </div>
    <div class="d-flex flex-column gap-2 mt-1">
      <button class="btn gf-btn-forest rounded-pill py-2 px-3 fw-semibold d-inline-flex align-items-center justify-content-center gap-2" id="gf-qr-copy-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span id="gf-qr-copy-text">Link kopieren</span>
      </button>
      <span class="text-muted text-truncate px-2" style="font-size: 0.75rem;" title="${escapeHtml(currentUrl)}">
        ${escapeHtml(currentUrl)}
      </span>
    </div>
  `;

  const copyBtn = document.getElementById("gf-qr-copy-btn");
  const copyText = document.getElementById("gf-qr-copy-text");
  if (copyBtn && copyText && typeof copyBtn.addEventListener === "function") {
    copyBtn.addEventListener("click", () => {
      const finish = () => {
        copyText.textContent = "Kopiert! ✓";
        setTimeout(() => {
          const t = document.getElementById("gf-qr-copy-text");
          if (t) t.textContent = "Link kopieren";
        }, 2000);
      };
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentUrl).then(finish).catch(finish);
      } else {
        finish();
      }
    });
  }

  if (modalEl && typeof window !== "undefined" && window.bootstrap && window.bootstrap.Modal) {
    const modalInst = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modalInst.show();
  }
}

function openGastroDetailDialog(root, state, opener = null) {
  if (!state) return false;
  if (opener && state.runtime) state.runtime.detailOpener = opener;
  openDetailModal(state, state.selectedId, false, true);
  return true;
}

function closeGastroDetailDialog(root, state, fromDialogEvent = false) {
  if (!state || !state.runtime) return false;
  const record = state.runtime.detailDialog;
  if (record) {
    const element = record.element || record;
    const opener = record.opener;
    state.runtime.detailDialog = null;
    if (!fromDialogEvent && element && typeof element.close === "function") {
      try { element.close(); } catch (_error) { /* bereits geschlossen */ }
    }
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  const uid = state.runtime.uid || "gf";
  const modalEl = typeof document !== "undefined" ? (document.getElementById(`gf-${uid}-detail-modal`) || document.getElementById("gf-detail-modal")) : null;
  if (modalEl && typeof window !== "undefined" && window.bootstrap && window.bootstrap.Modal) {
    const modal = window.bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }
  state.selectedId = null;
  return true;
}

function closeGastroDetails(state, root = null) {
  if (state && state.runtime && state.runtime.detailDialog) return closeGastroDetailDialog(root, state);
  if (!state || !state.detail) return false;
  const opener = state.runtime && state.runtime.detailOpener;
  if (state.runtime && state.runtime.detailAbort && typeof state.runtime.detailAbort.abort === "function") state.runtime.detailAbort.abort();
  if (state.runtime) state.runtime.detailAbort = null;
  state.selectedId = null;
  state.detail.seq += 1;
  state.detail.busy = false;
  state.detail.error = null;
  if (state.runtime) state.runtime.detailOpener = null;
  if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
  else if (root && root.querySelector) {
    const heading = root.querySelector('[data-gf="results-heading"]');
    if (heading && typeof heading.focus === "function") heading.focus();
  }
  return true;
}

function renderGastroCatalogCard(poi, uid = "gf-catalog", selected = false) {
  const item = poi || {};
  const firstImage = (item.images && item.images[0]) || null;
  const imgUrl = firstImage && gastroImageIsUsable(firstImage) ? firstImage.url : "";
  const imgAlt = (firstImage && firstImage.title) || item.name || "Gastrofinder-Bild";
  const imageAttribution = imgUrl ? renderGastroImageAttribution(firstImage, "gf-catalog-image-attribution") : "";
  const name = item.name || "Gastronomiebetrieb";
  const locality = item.city || (item.address && (item.address.locality || item.address.city)) || "";
  const street = item.street || (item.address && item.address.street) || "";
  const place = [locality, street].filter(Boolean).join(" · ") || (item.city || "Ort nicht angegeben");
  const distance = Number.isFinite(Number(item.distanceKm))
    ? `${Number(item.distanceKm).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`
    : (item.distanceKm != null ? `${item.distanceKm} km` : "");

  let desc = item.description || "";
  if (typeof desc !== "string" || desc.startsWith("http://") || desc.startsWith("https://") || desc.includes("onlim.com/entity")) {
    desc = "";
  }
  const descExcerpt = desc ? desc.slice(0, 140) + (desc.length > 140 ? " …" : "") : "Keine ausführliche Beschreibung verfügbar.";

  const typeLabels = gastroTypeLabels(item);
  const cuisine = Array.isArray(item.cuisines) ? item.cuisines.join(", ") : (item.cuisines || "");

  return `<div class="gf-catalog-card${selected ? " is-selected" : ""}" data-gf-catalog-card data-gf-id="${escapeHtml(item.id || "")}">
    <div class="gf-catalog-img-wrap">
      ${imgUrl ? `
        <img src="${escapeHtml(imgUrl)}" class="gf-catalog-img" alt="${escapeHtml(imgAlt)}" loading="lazy">
      ` : `
        <div class="gf-catalog-img-fallback">${item.isCafe ? "☕" : "🍴"}</div>
      `}
      ${distance ? `<span class="gf-catalog-dist-badge">${escapeHtml(distance)}</span>` : ""}
    </div>
    ${imageAttribution ? `<div class="gf-catalog-photo-credit">${imageAttribution}</div>` : ""}
    <div class="gf-catalog-body">
      <h3 class="gf-catalog-card-title">${escapeHtml(name)}</h3>
      <div class="gf-catalog-meta text-muted small mb-2">${escapeHtml(place)}</div>
      <p class="gf-catalog-card-desc">${escapeHtml(descExcerpt)}</p>
      <div class="gf-badges mb-3">
        ${typeLabels.map((label) => `<span class="gf-badge${label === "Café" ? " gf-badge-cafe" : ""}">${escapeHtml(label)}</span>`).join("")}
        ${cuisine ? `<span class="gf-badge gf-badge-cuisine">${escapeHtml(cuisine)}</span>` : ""}
      </div>
      <div class="gf-catalog-actions">
        <button type="button" class="btn btn-sm gf-btn-outline-forest gf-catalog-map-action" data-gf-catalog-map data-gf-id="${escapeHtml(item.id || "")}">
          ${gastroIcon("map")} <span>Auf Karte</span>
        </button>
        <button type="button" class="btn btn-sm gf-btn-forest gf-catalog-detail-action" data-gf-catalog-detail data-gf-select data-gf-id="${escapeHtml(item.id || "")}">
          <span>Details »</span>
        </button>
      </div>
    </div>
  </div>`;
}

function renderGastroCatalog(view, state) {
  const current = view || deriveGastroView(state);
  const limit = Math.max(24, Number(state && state.visible && state.visible.catalog) || 24);
  const items = current.pois.slice(0, limit);
  const uid = state && state.runtime && state.runtime.uid ? state.runtime.uid : "gf-catalog";
  const cards = items.length
    ? items.map((poi) => renderGastroCatalogCard(poi, uid, poi.id === state.selectedId)).join("")
    : `<div class="gf-empty col-12 text-center py-5"><h3 class="h5 text-muted mb-2">Keine passenden Orte gefunden</h3><p class="small text-muted">Bitte passe die Suchbegriffe oder Filter an.</p></div>`;

  return `<div class="gf-catalog-overlay" data-gf-catalog-overlay role="dialog" aria-modal="true" aria-labelledby="gf-${uid}-catalog-title">
    <header class="gf-catalog-header">
      <div>
        <p class="gf-eyebrow">Gastrofinder Katalog</p>
        <h2 id="gf-${uid}-catalog-title">Genussatlas (${current.pois.length})</h2>
        <p class="gf-catalog-subtitle">${current.pois.length} ${current.pois.length === 1 ? "Ort" : "Orte"} im geladenen Bestand</p>
      </div>
      <button type="button" class="gf-button gf-button-secondary" data-gf-catalog-close>
        ${gastroIcon("arrow")} <span>Zurück zur Karte</span>
      </button>
    </header>
    <div class="gf-catalog-scroll">
      <div class="gf-catalog-grid">${cards}</div>
    </div>
  </div>`;
}

function refreshGastroCatalog(root, state) {
  if (!root || !state || !state.runtime || !state.runtime.catalogOpen) return;
  const overlay = root.querySelector("[data-gf-catalog-overlay]");
  const markup = renderGastroCatalog(deriveGastroView(state), state);
  if (overlay && typeof overlay.outerHTML === "string") overlay.outerHTML = markup;
  else if (!overlay && typeof root.insertAdjacentHTML === "function") root.insertAdjacentHTML("beforeend", markup);
}

function openGastroCatalog(root, state, opener = null) {
  if (!root || !state || !state.runtime) return false;
  state.runtime.catalogOpen = true;
  state.runtime.catalogOpener = opener || (typeof document !== "undefined" ? document.activeElement : null);
  state.view = "catalog";
  if (root.classList && root.classList.add) root.classList.add("gf-catalog-open");
  refreshGastroCatalog(root, state);
  const overlay = root.querySelector && root.querySelector("[data-gf-catalog-close]");
  if (overlay && typeof overlay.focus === "function") overlay.focus();
  invalidateGastroMapSize(state);
  return true;
}

function closeGastroCatalog(root, state, fromBackButton = false) {
  if (!state || !state.runtime) return false;
  const opener = state.runtime.catalogOpener;
  state.runtime.catalogOpen = false;
  state.runtime.catalogOpener = null;
  state.view = "map";
  if (root && root.classList && root.classList.remove) root.classList.remove("gf-catalog-open");
  const overlay = root && root.querySelector ? root.querySelector("[data-gf-catalog-overlay]") : null;
  if (overlay && typeof overlay.remove === "function") overlay.remove();
  if (fromBackButton && opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
  invalidateGastroMapSize(state);
  return true;
}

function setGastroView(root, state, view) {
  if (view === "catalog") return openGastroCatalog(root, state);
  if (view === "map") return closeGastroCatalog(root, state);
  return false;
}

function setGastroSheet(root, state, size) {
  if (size !== "compact" && size !== "expanded") return;
  state.sheet = size;
  if (root && root.querySelector) {
    const toggle = root.querySelector("[data-gf-sheet-toggle]");
    if (toggle) {
      toggle.setAttribute("aria-expanded", size === "expanded" ? "true" : "false");
      toggle.textContent = size === "expanded" ? "Ergebnisbereich verkleinern" : "Ergebnisbereich vergrößern";
    }
    if (root.classList && root.classList.toggle) root.classList.toggle("gf-sheet-expanded", size === "expanded");
  }
}

function addGastroListener(target, type, handler, state) {
  if (!target || typeof target.addEventListener !== "function") return;
  try {
    target.addEventListener(type, handler, state.runtime.events ? { signal: state.runtime.events.signal } : undefined);
  } catch (_error) {
    target.addEventListener(type, handler);
  }
}

function applyGastroFilterChange(state, root, changes) {
  Object.assign(state.filters, changes || {});
  const view = deriveGastroView(state);
  if (state.selectedId && !view.pois.some((poi) => poi.id === state.selectedId)) {
    closeGastroGallery(root, state);
    closeGastroDetails(state, root);
    state.runtime.filterNotice = "Die Auswahl liegt nicht mehr im aktuellen Filter.";
  }
  updateGastroView(root, state);
}

function setGastroCockpitCollapsed(root, state, collapsed) {
  if (!root || !state || !state.runtime) return;
  const leavingMobileList = Boolean(collapsed && state.runtime.mobileView === "list");
  if (leavingMobileList) {
    state.runtime.mobileView = "map";
    if (root.classList && root.classList.remove) root.classList.remove("gf-mobile-list");
  }
  state.runtime.cockpitCollapsed = leavingMobileList ? false : Boolean(collapsed);
  if (root.classList && root.classList.toggle) root.classList.toggle("gf-cockpit-collapsed", state.runtime.cockpitCollapsed);
  const edge = root.querySelector("[data-gf-edge-tab]");
  if (edge) {
    edge.hidden = !state.runtime.cockpitCollapsed;
    if (typeof edge.setAttribute === "function") edge.setAttribute("aria-hidden", String(!state.runtime.cockpitCollapsed));
  }
  const button = root.querySelector("[data-gf-cockpit-toggle]");
  if (button) {
    button.setAttribute("aria-expanded", String(!state.runtime.cockpitCollapsed));
    button.setAttribute("aria-label", state.runtime.cockpitCollapsed ? "Cockpit öffnen" : "Cockpit einklappen");
  }
  invalidateGastroMapSize(state);
}

function setGastroMobileView(root, state, view) {
  if (!root || !state || !state.runtime || (view !== "map" && view !== "list")) return;
  state.runtime.mobileView = view;
  if (view === "list") {
    state.runtime.cockpitCollapsed = false;
    if (root.classList && root.classList.remove) root.classList.remove("gf-cockpit-collapsed");
  }
  if (root.classList && root.classList.toggle) root.classList.toggle("gf-mobile-list", view === "list");
  const button = root.querySelector("[data-gf-bottom-switcher]");
  if (button) {
    const listMode = view === "list";
    button.setAttribute("aria-pressed", String(listMode));
    button.innerHTML = listMode
      ? `${gastroIcon("map")}<span>Karte ansehen</span>`
      : `${gastroIcon("grid")}<span>Genusskarte</span>`;
  }
  invalidateGastroMapSize(state);
}

function bindGastroShellEvents(root, state) {
  if (!root || typeof root.querySelector !== "function") return;
  if (typeof AbortController === "function" && (!state.runtime.events || state.runtime.events.signal && state.runtime.events.signal.aborted)) {
    state.runtime.events = new AbortController();
  }
  const notify = () => updateGastroView(root, state);
  const search = root.querySelector('[data-gf-search]');
  if (search) {
    addGastroListener(search, "input", () => {
      if (state.runtime.debounceTimer !== null) clearTimeout(state.runtime.debounceTimer);
      state.runtime.debounceTimer = setTimeout(() => {
        state.runtime.debounceTimer = null;
        if (state.runtime.active) applyGastroFilterChange(state, root, { text: search.value });
      }, 250);
    }, state);
  }
  const cuisine = root.querySelector('[data-gf-cuisine]');
  if (cuisine) addGastroListener(cuisine, "change", () => applyGastroFilterChange(state, root, { cuisine: cuisine.value }), state);
  const sort = root.querySelector('[data-gf-sort]');
  if (sort) addGastroListener(sort, "change", () => { state.sort = sort.value; notify(); }, state);
  const cockpitToggle = root.querySelector("[data-gf-cockpit-toggle]");
  if (cockpitToggle) addGastroListener(cockpitToggle, "click", () => {
    setGastroCockpitCollapsed(root, state, !state.runtime.cockpitCollapsed);
  }, state);
  const edgeTab = root.querySelector("[data-gf-edge-tab]");
  if (edgeTab) addGastroListener(edgeTab, "click", () => setGastroCockpitCollapsed(root, state, false), state);
  const mobileSwitcher = root.querySelector("[data-gf-bottom-switcher]");
  if (mobileSwitcher) addGastroListener(mobileSwitcher, "click", () => {
    setGastroMobileView(root, state, state.runtime.mobileView === "list" ? "map" : "list");
  }, state);
  const catalogToggle = root.querySelector("[data-gf-catalog-toggle]");
  if (catalogToggle) addGastroListener(catalogToggle, "click", () => {
    openGastroCatalog(root, state, catalogToggle);
  }, state);
  if (typeof root.addEventListener === "function") addGastroListener(root, "click", (event) => {
    const target = event.target && typeof event.target.closest === "function"
      ? event.target.closest("button")
      : null;
    if (!target) return;
    if (target.hasAttribute("data-gf-catalog-close")) {
      event.preventDefault();
      closeGastroCatalog(root, state, true);
      return;
    }
    if (target.hasAttribute("data-gf-catalog-map")) {
      const id = target.getAttribute("data-gf-id");
      if (!id) return;
      event.preventDefault();
      closeGastroCatalog(root, state);
      state.runtime.detailOpener = null;
      focusPoiOnMap(state, id);
      return;
    }
    if ((target.hasAttribute("data-gf-select") || target.hasAttribute("data-gf-catalog-detail")) && target.closest("[data-gf-catalog-card]")) {
      const id = target.getAttribute("data-gf-id");
      if (!id) return;
      state.runtime.detailOpener = target;
      openDetailModal(state, id);
      return;
    }
  }, state);
  const list = root.querySelector('[data-gf="results-list"]');
  if (list) {
    addGastroListener(list, "click", (event) => {
      const detailBtn = event.target && typeof event.target.closest === "function"
        ? event.target.closest("[data-gf-select]")
        : null;
      if (detailBtn) {
        event.stopPropagation();
        const id = detailBtn.getAttribute("data-gf-id");
        if (id) {
          state.runtime.detailOpener = detailBtn;
          openDetailModal(state, id);
        }
        return;
      }
      const card = event.target && typeof event.target.closest === "function"
        ? event.target.closest("[data-gf-card]")
        : null;
      if (card) {
        const id = card.getAttribute("data-gf-id");
        if (id) {
          focusPoiOnMap(state, id);
        }
      }
    }, state);
  }
  for (const button of root.querySelectorAll("[data-gf-filter]")) {
    addGastroListener(button, "click", () => applyGastroFilterChange(state, root, { type: button.getAttribute("data-gf-filter") || "all" }), state);
  }
  for (const button of root.querySelectorAll("[data-gf-view]")) {
    addGastroListener(button, "click", () => setGastroView(root, state, button.getAttribute("data-gf-view")), state);
  }
  const load = root.querySelector('[data-gf-load-next]');
  if (load) addGastroListener(load, "click", () => loadNextGastroPage(state, notify), state);
  const more = root.querySelector('[data-gf-show-more]');
  if (more) addGastroListener(more, "click", () => { showMoreGastroResults(state, state.view === "catalog" ? "catalog" : "list"); notify(); }, state);
  const area = root.querySelector('[data-gf-show-area]');
  if (area) addGastroListener(area, "click", () => showGastroArea(state), state);
  const share = root.querySelector('[data-gf-share]');
  if (share) addGastroListener(share, "click", () => openQrModal(state), state);
  const menuBtn = root.querySelector('[data-gf-control="menu"], [data-gf-menu]');
  if (menuBtn) {
    addGastroListener(menuBtn, "click", () => {
      ensureGlobalOffcanvasSetup();
      ensureQrNavMenuItem(state);
      const offcanvasNav = document.getElementById("offcanvasNavbar");
      if (offcanvasNav && typeof window !== "undefined" && window.bootstrap && window.bootstrap.Offcanvas) {
        let oc = window.bootstrap.Offcanvas.getInstance(offcanvasNav);
        if (!oc) {
          oc = new window.bootstrap.Offcanvas(offcanvasNav);
        }
        oc.show();
      }
    }, state);
  }
  if (typeof ResizeObserver === "function") {
    state.runtime.resizeObserver = new ResizeObserver(() => invalidateGastroMapSize(state));
    const mapLayer = root.querySelector(".gf-fullscreen-wrapper");
    if (mapLayer) state.runtime.resizeObserver.observe(mapLayer);
  }
}

function resolveGastroBrandAssetUrl(fileName, location = (typeof window !== "undefined" ? window.location : null)) {
  const file = String(fileName || "odas-app-icon.svg").replace(/^\/+/, "");
  const hostname = String(location && location.hostname || "").toLowerCase();
  const pathname = String(location && location.pathname || "/");
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  const localAppPath = /^\/app(?:\/|$)/.test(pathname);
  return `${isLocal && localAppPath ? "../assets" : "assets"}/${file}`;
}

function resolveGastroAssetUrl(relPath) {
  if (!relPath || relPath.startsWith("http://") || relPath.startsWith("https://") || relPath.startsWith("/")) {
    return relPath;
  }
  const base = getOdasAppBasePath();
  return base ? `${base}/${relPath}` : relPath;
}

function loadGastroStyle(href) {
  if (typeof document === "undefined") return Promise.resolve();
  const resolved = resolveGastroAssetUrl(href);
  const existing = document.querySelector(`link[data-gf-style="${resolved}"]`);
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = resolved;
    link.dataset.gfStyle = resolved;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error("Karten-Asset konnte nicht geladen werden."));
    document.head.appendChild(link);
  });
}

function loadGastroScript(src) {
  if (typeof document === "undefined") return Promise.resolve();
  const resolved = resolveGastroAssetUrl(src);
  const existing = document.querySelector(`script[data-gf-script="${resolved}"]`);
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = resolved;
    script.dataset.gfScript = resolved;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Bibliothek konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
}

async function ensureQrCodeLoaded() {
  if (typeof window !== "undefined" && typeof window.qrcode === "function") return;
  const qrUrl = resolveGastroAssetUrl("vendor/qrcode/qrcode.min.js");
  await loadGastroScript(qrUrl);
}

async function ensureGastroMapLibraries() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.L && typeof window.L.markerClusterGroup === "function" && window.__gastroMapStylesLoaded) return;
  if (window.__gastroMapLibraryPromise) return window.__gastroMapLibraryPromise;
  window.__gastroMapLibraryPromise = (async () => {
    await loadGastroStyle("vendor/leaflet/leaflet.css");
    await loadGastroStyle("vendor/markercluster/MarkerCluster.css");
    await loadGastroStyle("vendor/markercluster/MarkerCluster.Default.css");
    if (!window.L) await loadGastroScript("vendor/leaflet/leaflet.js");
    if (!window.L || typeof window.L.markerClusterGroup !== "function") {
      await loadGastroScript("vendor/markercluster/leaflet.markercluster.js");
    }
    window.__gastroMapStylesLoaded = true;
  })().catch((error) => {
    window.__gastroMapLibraryPromise = null;
    throw error;
  });
  return window.__gastroMapLibraryPromise;
}

function gastroMarkerHtml(poi, selected) {
  const labels = gastroTypeLabels(poi);
  const typeClass = labels.length === 2 ? "gf-marker-dual" : labels[0] === "Café" ? "gf-marker-cafe" : "gf-marker-restaurant";
  return `<span class="gf-marker ${typeClass}${selected ? " is-selected" : ""}">${gastroIcon(labels[0] === "Café" && labels.length === 1 ? "cup" : "fork")}</span>`;
}

function initGastroMap(root, state) {
  if (!root || typeof root.querySelector !== "function" || typeof window === "undefined" || !window.L) return false;
  const mapNode = root.querySelector('[data-gf="map"]');
  if (!mapNode || state.runtime.map) return Boolean(state.runtime.map);
  try {
    const L = window.L;
    const map = L.map(mapNode, { zoomControl: false, preferCanvas: true });
    const savedPosition = state.runtime.mapPosition;
    map.setView(
      savedPosition ? [savedPosition.lat, savedPosition.lng] : [state.region.lat, state.region.lng],
      savedPosition && Number.isFinite(savedPosition.zoom) ? savedPosition.zoom : 12,
    );
    if (L.Control && typeof L.Control.extend === "function") {
      const HomeControl = L.Control.extend({
        options: { position: "bottomright" },
        onAdd: function() {
          const container = (L.DomUtil && typeof L.DomUtil.create === "function")
            ? L.DomUtil.create("div", "gf-home-control-bar leaflet-bar")
            : document.createElement("div");
          const btn = (L.DomUtil && typeof L.DomUtil.create === "function")
            ? L.DomUtil.create("button", "gf-map-home-btn", container)
            : document.createElement("button");
          btn.type = "button";
          btn.innerHTML = gastroIcon("home");
          btn.title = `Ausgangsansicht (${escapeHtml(state.region ? state.region.ort : "")}) wiederherstellen`;
          btn.setAttribute("aria-label", "Karte auf Ausgangsansicht zurücksetzen");
          if (L.DomEvent) {
            if (typeof L.DomEvent.disableClickPropagation === "function") L.DomEvent.disableClickPropagation(btn);
            if (typeof L.DomEvent.disableScrollPropagation === "function") L.DomEvent.disableScrollPropagation(btn);
          }
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            if (typeof map.flyTo === "function" && state.region) map.flyTo([state.region.lat, state.region.lng], 12, { duration: 0.8 });
            if (typeof map.closePopup === "function") map.closePopup();
          });
          return container;
        }
      });
      new HomeControl().addTo(map);
    }

    if (L.control && typeof L.control.zoom === "function") {
      L.control.zoom({ position: "bottomright" }).addTo(map);
    }
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    state.runtime.map = map;
    state.runtime.markerById = new Map();
    state.runtime.markerLayer = typeof L.markerClusterGroup === "function"
      ? L.markerClusterGroup({ showCoverageOnHover: false, animate: false })
      : L.layerGroup();
    state.runtime.markerLayer.addTo(map);
    state.runtime.mapAreaCircle = L.circle([state.region.lat, state.region.lng], {
      radius: state.region.radiusKm * 1000,
      color: "#28543d",
      weight: 1,
      fillColor: "#9db58d",
      fillOpacity: 0.08,
    }).addTo(map);
    const controls = root.querySelector('[data-gf="map-controls"]');
    if (controls && (!L.Control || typeof L.Control.extend !== "function") && typeof document !== "undefined" && document.createElement) {
      const homeButton = document.createElement("button");
      homeButton.type = "button";
      homeButton.className = "gf-home-button";
      homeButton.dataset.gfHome = "true";
      homeButton.setAttribute("aria-label", "Karte auf Ausgangsansicht zurücksetzen");
      homeButton.title = "Ausgangsansicht";
      homeButton.innerHTML = gastroIcon("home");
      homeButton.addEventListener("click", () => {
        if (typeof map.flyTo === "function") map.flyTo([state.region.lat, state.region.lng], 12, { duration: .6 });
        if (typeof map.closePopup === "function") map.closePopup();
      });
      controls.appendChild(homeButton);
    }
    const fallback = root.querySelector('[data-gf="map-fallback"]');
    if (fallback) fallback.hidden = true;
    updateGastroMap(root, state, deriveGastroView(state));
    return true;
  } catch (error) {
    const fallback = root.querySelector('[data-gf="map-fallback"]');
    if (fallback) fallback.textContent = "Karte nicht verfügbar. Die Ergebnisse bleiben nutzbar.";
    state.runtime.mapError = error;
    return false;
  }
}

function updateGastroMarkers(root, state, view = null) {
  if (!state || !state.runtime || !state.runtime.map || typeof window === "undefined" || !window.L) return;
  const L = window.L;
  const current = view || deriveGastroView(state);
  const layer = state.runtime.markerLayer;
  if (!layer) return;
  layer.clearLayers();
  const markers = new Map();
  for (const poi of current.pois) {
    const selected = poi.id === state.selectedId;
    const firstImage = (poi.images && poi.images[0]) || null;
    const imgUrl = firstImage && gastroImageIsUsable(firstImage) ? firstImage.url : "";
    const distance = Number.isFinite(Number(poi.distanceKm))
      ? `${Number(poi.distanceKm).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`
      : (poi.distanceKm != null ? `${poi.distanceKm} km` : "");
    const typeLabels = gastroTypeLabels(poi);
    const cuisine = Array.isArray(poi.cuisines) ? poi.cuisines.join(", ") : (poi.cuisines || "");

    const popupHtml = `
      <div class="gf-map-popup" style="min-width: 210px; max-width: 260px;">
        ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" style="width:100%; height:90px; object-fit:cover; border-radius:6px; margin-bottom:8px;" alt="${escapeHtml(poi.name || '')}">` : ""}
        <h6 class="fw-bold mb-1" style="font-size:0.92rem; color:var(--gf-forest-dark);">${escapeHtml(poi.name || 'Gastrobetrieb')}</h6>
        <div class="text-muted small mb-2">${escapeHtml(poi.city || '')} ${distance ? `&bull; <strong>${escapeHtml(distance)}</strong>` : ''}</div>
        <div class="d-flex flex-wrap gap-1 mb-2">
          ${typeLabels.map((lbl) => `<span class="badge gf-badge${lbl === 'Café' ? ' gf-badge-cafe' : ''}" style="font-size:0.68rem;">${escapeHtml(lbl)}</span>`).join('')}
          ${cuisine ? `<span class="badge gf-badge gf-badge-cuisine" style="font-size:0.68rem;">${escapeHtml(cuisine)}</span>` : ''}
        </div>
        <button type="button" class="btn btn-sm gf-btn-forest w-100 py-1" data-gf-popup-detail="${escapeHtml(poi.id)}">
          Details ansehen &raquo;
        </button>
      </div>
    `;

    const marker = L.marker([poi.lat, poi.lng], {
      riseOnHover: true,
      icon: L.divIcon({
        className: "gf-marker-icon",
        html: gastroMarkerHtml(poi, selected),
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -19],
      }),
      keyboard: true,
      title: poi.name || "Gastrofinder-Betrieb",
    });

    marker.bindPopup(popupHtml, { minWidth: 210, maxWidth: 280, className: "gf-leaflet-popup" });
    marker.on("popupopen", (e) => {
      const popupEl = e && e.popup && typeof e.popup.getElement === "function" ? e.popup.getElement() : null;
      if (popupEl) {
        const btn = popupEl.querySelector(`[data-gf-popup-detail]`);
        if (btn) {
          btn.addEventListener("click", () => {
            if (typeof marker.closePopup === "function") marker.closePopup();
            state.runtime.detailOpener = btn;
            openDetailModal(state, poi.id);
          });
        }
      }
    });

    layer.addLayer(marker);
    markers.set(poi.id, marker);
  }
  state.runtime.markerById = markers;
  if (state.selectedId && state.runtime.lastSelectedId !== state.selectedId) {
    const marker = markers.get(state.selectedId);
    if (marker && typeof marker.getLatLng === "function") {
      const target = marker.getLatLng();
      if (typeof state.runtime.map.panTo === "function") state.runtime.map.panTo(target);
    }
  }
  state.runtime.lastSelectedId = state.selectedId;
}

function updateGastroMap(root, state, view = null) {
  return updateGastroMarkers(root, state, view);
}

function invalidateGastroMapSize(state) {
  if (!state || !state.runtime || !state.runtime.map) return;
  if (state.runtime.mapResizeTimer !== null) clearTimeout(state.runtime.mapResizeTimer);
  state.runtime.mapResizeTimer = setTimeout(() => {
    state.runtime.mapResizeTimer = null;
    if (state.runtime.map && typeof state.runtime.map.invalidateSize === "function") {
      state.runtime.map.invalidateSize({ animate: false, pan: true });
    }
  }, 0);
}

function showGastroArea(state) {
  if (!state || !state.runtime || !state.runtime.map || !state.runtime.mapAreaCircle) return;
  const bounds = state.runtime.mapAreaCircle.getBounds && state.runtime.mapAreaCircle.getBounds();
  if (bounds && typeof state.runtime.map.fitBounds === "function") state.runtime.map.fitBounds(bounds, { padding: [24, 24] });
}

async function shareGastroInstance(root) {
  if (typeof window === "undefined" || !window.location) return { copied: false, url: "" };
  const base = new URL(`${getOdasAppBasePath()}/`, window.location.origin);
  base.search = "";
  base.hash = "startseite";
  const url = base.href;
  let copied = false;
  let shared = false;
  let cancelled = false;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title: "Gastrofinder", url });
      shared = true;
    } else if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(url);
      copied = true;
      if (root && root.querySelector) {
        const status = root.querySelector('[data-gf="status"]');
        if (status) status.textContent = "App-Instanz-URL kopiert.";
      }
    }
  } catch (error) {
    if (error && error.name === "AbortError") cancelled = true;
  }
  if (!copied && !shared && !cancelled && root && typeof root.appendChild === "function") {
    let input;
    if (typeof document !== "undefined" && document.createElement) {
      input = document.createElement("input");
      input.type = "text";
      input.readOnly = true;
      input.value = url;
      input.setAttribute("aria-label", "App-Instanz-URL zum manuellen Kopieren");
      input.dataset.gfShareFallback = "true";
    } else {
      input = { type: "text", readOnly: true, value: url };
    }
    root.appendChild(input);
  }
  return { copied, shared, cancelled, url };
}

async function loadGastroPlaces(url = "data/orte-de.json") {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Der mitgelieferte Ortsindex konnte nicht geladen werden.");
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.places)) throw new Error("Der mitgelieferte Ortsindex ist ungültig.");
  return payload.places;
}

async function app(configdata = {}, enclosingHtmlDivElement) {
  if (!enclosingHtmlDivElement) {
    throw new Error("Der Inhaltsbereich der App wurde nicht gefunden.");
  }

  let validated;
  try {
    validated = validateGastroConfig(configdata);
  } catch (error) {
    const previous = enclosingHtmlDivElement.gastroState;
    if (previous) disposeGastroRuntime(previous);
    enclosingHtmlDivElement.gastroState = null;
    setGastroFullscreen(enclosingHtmlDivElement, false);
    if (enclosingHtmlDivElement.classList && enclosingHtmlDivElement.classList.remove) enclosingHtmlDivElement.classList.remove("gf-root");
    const message = error && error.message ? error.message : "Die App ist nicht konfiguriert.";
    // Datenquellenfehler (fehlend/falscher Endpunkt) in der Portfolio-Standardanzeige
    // (Variante A); Ort-, Umkreis- und Koordinatenfehler wie bisher.
    if (error && (error.code === "NO_SOURCE" || /DZT-Datenquelle/.test(message))) {
      renderOdasFehler(enclosingHtmlDivElement, error, {
        url: getOdasApiUrl(configdata, "dztsparql"),
        label: "DZT Knowledge Graph (SPARQL)",
        typLabel: "Wissensdatenbank (SPARQL)",
        erwarteterTyp: "sparql",
      });
      return;
    }
    enclosingHtmlDivElement.innerHTML = `<div class="alert alert-danger" role="alert">${escapeHtml(message)}</div>`;
    return;
  }

  const configKey = JSON.stringify({
    sourceUrl: validated.sourceUrl,
    ort: validated.ort,
    radiusKm: validated.radiusKm,
    explicitCenter: validated.explicitCenter,
  });
  const previous = enclosingHtmlDivElement.gastroState;
  let state;
  if (previous && previous.configKey === configKey) {
    disposeGastroRuntime(previous);
    state = previous;
  } else {
    if (previous) disposeGastroRuntime(previous);
    state = createGastroState(validated.sourceUrl, null);
    state.configKey = configKey;
  }
  state.runtime.active = true;
  state.runtime.generation += 1;
  state.runtime.uid = state.runtime.uid || createGastroUid();
  enclosingHtmlDivElement.gastroState = state;
  state.runtime.root = enclosingHtmlDivElement;
  setGastroFullscreen(enclosingHtmlDivElement, true);
  renderGastroShell(enclosingHtmlDivElement, state);
  if (typeof enclosingHtmlDivElement.querySelector === "function") {
    bindGastroShellEvents(enclosingHtmlDivElement, state);
  }
  updateGastroView(enclosingHtmlDivElement, state);

  const generation = state.runtime.generation;
  const stillCurrent = () => enclosingHtmlDivElement.gastroState === state &&
    state.runtime.active && state.runtime.generation === generation;

  try {
    if (!state.region) {
      const places = await loadGastroPlaces("data/orte-de.json");
      if (!stillCurrent()) return;
      state.region = resolveGastroRegion(validated, places);
      state.configKey = configKey;
    }
    if (!stillCurrent()) return;
    try {
      await ensureGastroMapLibraries();
      if (stillCurrent()) initGastroMap(enclosingHtmlDivElement, state);
    } catch (error) {
      if (stillCurrent()) state.runtime.mapError = error;
    }
    if (stillCurrent()) {
      updateGastroView(enclosingHtmlDivElement, state);
      await loadNextGastroPage(state, () => {
        if (stillCurrent()) updateGastroView(enclosingHtmlDivElement, state);
      });
      if (stillCurrent()) {
        hideGastroLoadingOverlay(enclosingHtmlDivElement, state.runtime.uid);
      }
    }
  } catch (error) {
    if (!stillCurrent()) return;
    state.page.error = error;
    updateGastroView(enclosingHtmlDivElement, state);
    hideGastroLoadingOverlay(enclosingHtmlDivElement, state.runtime.uid);
  }
}

function getGastroSecondaryPageInfo(page) {
  const pages = {
    beschreibung: { title: "Über diese App & Methodik", icon: "info" },
    kontakt: { title: "Kontakt & Ansprechpartner", icon: "mail" },
    datenschutz: { title: "Datenschutzerklärung", icon: "shield" },
    impressum: { title: "Impressum", icon: "file" },
  };
  return pages[page] || null;
}

function renderGastroSecondaryPage(page, content) {
  const info = getGastroSecondaryPageInfo(page);
  if (!info) return null;
  const body = content == null || content === "" ? "Informationen zu dieser Seite sind derzeit nicht verfügbar." : String(content);
  return `<div class="gf-secondary-wrapper"><div class="gf-secondary-card" id="secondarySites"><div class="gf-secondary-nav"><a href="#startseite" class="gf-secondary-back-link">${gastroIcon("arrow")}<span>Zurück zur Karte</span></a><span class="gf-secondary-badge">DZT · ODAS</span></div><div class="gf-secondary-header"><span class="gf-secondary-icon">${gastroIcon(info.icon)}</span><div><p class="gf-eyebrow">Gastrofinder</p><h1 class="gf-secondary-title">${escapeHtml(info.title)}</h1></div></div><div class="gf-secondary-body">${body}</div></div></div>`;
}

function renderPageOverride(page) {
  syncGastroAppIdentity();
  if (page === "startseite") return null;
  ensureGlobalOffcanvasSetup();
  setTimeout(() => ensureQrNavMenuItem(), 0);
  const info = getGastroSecondaryPageInfo(page);
  if (!info) return null;
  let content = typeof configData !== "undefined" && configData ? configData[page] : "";
  if (Array.isArray(content)) {
    content = typeof normalizeMultilineValue === "function" ? normalizeMultilineValue(content) : content.join("\n");
  }
  return renderGastroSecondaryPage(page, content);
}

function onPageLeave(page) {
  if (typeof document === "undefined") return;
  const root = document.getElementById("main-content");
  if (page !== "startseite") {
    if (root && root.gastroState) disposeGastroRuntime(root.gastroState);
    setGastroFullscreen(root, false);
    if (root && root.classList && root.classList.remove) root.classList.remove("gf-root");
  }
  if (document.body && document.body.classList && document.body.classList.remove) {
    document.body.classList.remove("gf-app-fullscreen");
    document.body.classList.remove("modal-open");
  }
  if (document.querySelectorAll) {
    const backdrops = document.querySelectorAll(".modal-backdrop, .offcanvas-backdrop");
    if (backdrops && backdrops.forEach) {
      backdrops.forEach((el) => {
        if (el && typeof el.remove === "function") el.remove();
      });
    }
  }
}

function addToHead() {
  // Die Kartenbibliotheken werden bewusst erst nach der ersten sichtbaren Shell geladen.
}

function syncGastroAppIdentity() {
  if (typeof document === "undefined") return;
  document.body.classList.add("gf-app-themed");
  const logo = document.getElementById("logo-icon");
  const src = resolveGastroBrandAssetUrl("odas-app-icon.svg");
  if (logo) {
    logo.src = src;
    logo.alt = "Gastrofinder-App-Logo";
  }
  const menuTitle = document.getElementById("offcanvasNavbarLabel");
  if (menuTitle && !menuTitle.querySelector(".gf-menu-logo")) {
    const image = document.createElement("img");
    image.className = "gf-menu-logo";
    image.src = src;
    image.alt = "Gastrofinder-App-Logo";
    menuTitle.prepend(image);
  }
}

function ensureGlobalOffcanvasSetup() {
  if (typeof document === "undefined" || !document.getElementById || !document.body || typeof document.body.appendChild !== "function") return;
  const offcanvasNav = document.getElementById("offcanvasNavbar");
  if (offcanvasNav && offcanvasNav.parentElement !== document.body) {
    document.body.appendChild(offcanvasNav);
  }
}

function ensureQrNavMenuItem(state) {
  if (typeof document === "undefined" || !document.getElementById || typeof document.createElement !== "function") return;
  const offcanvasNav = document.getElementById("offcanvasNavbar");
  if (!offcanvasNav) return;
  const navList = offcanvasNav.querySelector ? offcanvasNav.querySelector(".navbar-nav") : null;
  if (!navList || (navList.querySelector && navList.querySelector("#gf-qr-nav-item")) || typeof navList.appendChild !== "function") return;

  const qrLi = document.createElement("li");
  qrLi.className = "nav-item";
  qrLi.id = "gf-qr-nav-item";
  qrLi.innerHTML = `
    <a class="nav-link gf-qr-nav-link" href="#qr-code" role="button">
      <span class="gf-nav-icon">${gastroIcon("share")}</span>
      <span>Auf dem Smartphone öffnen</span>
    </a>
  `;
  const link = qrLi.querySelector("a");
  if (link && typeof link.addEventListener === "function") {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof window !== "undefined" && window.bootstrap && window.bootstrap.Offcanvas) {
        const oc = window.bootstrap.Offcanvas.getInstance(offcanvasNav);
        if (oc) oc.hide();
      }
      openQrModal(state || (document.getElementById("main-content") && document.getElementById("main-content").gastroState));
    });
  }
  navList.appendChild(qrLi);
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  const initGlobalMenu = () => {
    ensureGlobalOffcanvasSetup();
    ensureQrNavMenuItem();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGlobalMenu);
  } else {
    initGlobalMenu();
  }

  document.addEventListener("click", (e) => {
    const toggler = e.target && e.target.closest && e.target.closest('[data-bs-toggle="offcanvas"][data-bs-target="#offcanvasNavbar"], .navbar-toggler, [data-gf-control="menu"], [data-gf-menu]');
    if (toggler) {
      ensureGlobalOffcanvasSetup();
      ensureQrNavMenuItem();
    }
  }, true);
}

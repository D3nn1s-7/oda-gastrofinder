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
    return parsed.href;
  } catch (_error) {
    return "";
  }
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
  const hourFields = ["schema:dayOfWeek", "schema:opens", "schema:closes", "schema:validFrom", "schema:validThrough"];
  const subjectImageFilter = "FILTER NOT EXISTS { ?id schema:image ?other . FILTER(STR(?other) < STR(?subject)) }";
  const rootPart = `
  {
    ?id ?rootPredicate ?object .
    BIND(?id AS ?subject)
    VALUES ?rootPredicate { ${rootFields.join(" ")} }
    ${detail ? "" : `FILTER (?rootPredicate != schema:image || NOT EXISTS { ?id schema:image ?other . FILTER(STR(?other) < STR(?object)) })`}
  }
  UNION
  {
    ?id ?link ?subject .
    VALUES ?link { schema:geo schema:address schema:sdLicense schema:sdPublisher }
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
    ?id schema:image ?subject .
    ?subject ?imageLink ?nestedSubject .
    VALUES ?imageLink { schema:creator schema:author schema:copyrightHolder }
    ?nestedSubject ?predicate ?object .
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
    binding.id.type === "uri" && binding.subject.type === "uri" &&
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
    .filter((row) => row.subject.value === group.id && row.predicate.value === predicate && row.object.type === "uri")
    .map((row) => row.object.value);
}

function chooseLocalizedValue(entries, fallback = "") {
  const candidates = entries.filter((entry) => entry && entry.value);
  const german = candidates.filter((entry) => String(entry.lang || "").toLowerCase() === "de");
  const neutral = candidates.filter((entry) => !entry.lang);
  const other = candidates.filter((entry) => entry.lang && !String(entry.lang).toLowerCase().startsWith("de"));
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
  return { url, attribution: requiresEvidence ? String(evidence) : "" };
}

function collectNodeValues(group, node, predicates) {
  const values = new Map();
  for (const predicate of predicates) values.set(predicate, valuesFor(group, node, predicate));
  return values;
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
      "https://schema.org/creditText",
      "https://schema.org/creator",
      "https://schema.org/author",
      "https://schema.org/copyrightHolder",
    ]);
    const url = safeHttpUrl(values.get("https://schema.org/contentUrl")[0] || values.get("https://schema.org/url")[0]);
    if (!url) continue;
    const licenseValues = values.get("https://schema.org/license");
    const credit = [
      ...values.get("https://schema.org/creditText"),
      ...values.get("https://schema.org/creator"),
      ...values.get("https://schema.org/author"),
      ...values.get("https://schema.org/copyrightHolder"),
    ][0] || "";
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
    const publisherNode = directNodes(group, "https://schema.org/sdPublisher")[0];
    const evidence = [
      ...directValues(group, "https://schema.org/creditText"),
      ...directValues(group, "https://schema.org/creator"),
      ...directValues(group, "https://schema.org/author"),
      ...directValues(group, "https://schema.org/copyrightHolder"),
      ...(publisherNode ? valuesFor(group, publisherNode, "https://schema.org/name") : []),
      ...(publisherNode ? valuesFor(group, publisherNode, "rdfs:label") : []),
    ][0] || "";
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
    const description = directValues(group, "https://schema.org/description")[0] || "";
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
      mapPosition: null,
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
    if (runtimeIsCurrent(state, generation)) notify();
  } catch (error) {
    if (!runtimeIsCurrent(state, generation) || (error && error.name === "AbortError")) return;
    state.page.error = error;
    state.page.retryAt = error && error.retryAt ? error.retryAt : 0;
    notify();
  } finally {
    if (runtimeIsCurrent(state, generation)) {
      state.page.busy = false;
      state.runtime.pageAbort = null;
    }
  }
}

function closeGastroDetails(state) {
  if (!state || !state.detail) return;
  if (state.runtime && state.runtime.detailAbort && typeof state.runtime.detailAbort.abort === "function") {
    state.runtime.detailAbort.abort();
  }
  state.runtime.detailAbort = null;
  state.selectedId = null;
  state.detail.seq += 1;
  state.detail.busy = false;
  state.detail.error = null;
  state.detail.retryAt = 0;
}

async function selectGastroPoi(state, id, notify = () => {}) {
  if (!state || !state.byId.has(id) || !state.runtime || !state.runtime.active) return;
  if (state.selectedId === id && state.details.has(id)) {
    state.detail.busy = false;
    state.detail.error = null;
    notify();
    return;
  }
  if (state.runtime.detailAbort && typeof state.runtime.detailAbort.abort === "function") {
    state.runtime.detailAbort.abort();
  }
  const generation = state.runtime.generation;
  state.selectedId = id;
  state.detail.busy = false;
  state.detail.error = null;
  if (state.details.has(id)) {
    notify();
    return;
  }
  const sequence = ++state.detail.seq;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  state.runtime.detailAbort = controller;
  state.detail.busy = true;
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
    notify();
  } catch (error) {
    if (!stillCurrent() || (error && error.name === "AbortError")) return;
    state.detail.error = error;
    state.detail.retryAt = error && error.retryAt ? error.retryAt : 0;
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
  runtime.generation += 1;
  state.detail.seq += 1;
  if (runtime.pageAbort && typeof runtime.pageAbort.abort === "function") runtime.pageAbort.abort();
  if (runtime.detailAbort && typeof runtime.detailAbort.abort === "function") runtime.detailAbort.abort();
  if (runtime.events && typeof runtime.events.abort === "function") runtime.events.abort();
  if (runtime.debounceTimer !== null) clearTimeout(runtime.debounceTimer);
  if (runtime.resizeObserver && typeof runtime.resizeObserver.disconnect === "function") runtime.resizeObserver.disconnect();
  if (runtime.gallery && typeof runtime.gallery.close === "function") runtime.gallery.close();
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
  runtime.gallery = null;
  runtime.map = null;
  runtime.cluster = null;
  state.page.busy = false;
  state.detail.busy = false;
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

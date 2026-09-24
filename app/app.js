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
    BIND(?rootPredicate AS ?predicate)
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
    if (state.runtime.root) updateGastroDetailDialog(state.runtime.root, state);
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
    notify();
  } catch (error) {
    if (!stillCurrent() || (error && error.name === "AbortError")) return;
    state.detail.error = error;
    state.detail.retryAt = error && error.retryAt ? error.retryAt : 0;
    state.detail.busy = false;
    state.runtime.detailAbort = null;
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
  if (runtime.mapResizeTimer !== null) clearTimeout(runtime.mapResizeTimer);
  if (runtime.focusTimer !== null) clearTimeout(runtime.focusTimer);
  if (runtime.resizeObserver && typeof runtime.resizeObserver.disconnect === "function") runtime.resizeObserver.disconnect();
  if (runtime.detailDialog) {
    const detailElement = runtime.detailDialog.element || runtime.detailDialog;
    if (detailElement && typeof detailElement.close === "function") {
      try { detailElement.close(); } catch (_error) { /* bereits geschlossen */ }
    }
    if (detailElement && typeof detailElement.remove === "function") detailElement.remove();
  }
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
  state.page.busy = false;
  state.detail.busy = false;
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
  return `<svg class="gf-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.pin}</svg>`;
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

function gastroNoPhoto(label = "Gastrofinder") {
  return `<div class="gf-no-photo" aria-hidden="true"><span class="gf-no-photo-ring"></span>${gastroIcon("fork")}<span>${escapeHtml(label)}</span></div>`;
}

function renderGastroCard(poi, uid = "gf-card", selected = false) {
  const item = poi || {};
  const image = (item.images || []).find(gastroImageIsUsable);
  const media = image
    ? `<img class="gf-card-image" src="${escapeHtml(safeHttpUrl(image.url))}" alt="${escapeHtml(image.title || item.name || "Gastrofinder-Bild")}" loading="lazy">`
    : gastroNoPhoto(item.name || "Gastrofinder");
  const address = item.address || {};
  const place = [address.locality, address.postalCode, address.street].filter(Boolean).join(" · ") || "Ort nicht angegeben";
  const distance = Number.isFinite(Number(item.distanceKm))
    ? `${Number(item.distanceKm).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km Luftlinie`
    : "Entfernung nicht berechnet";
  const cuisine = (item.cuisines || []).length ? item.cuisines.join(", ") : "Küche nicht angegeben";
  const typeLabels = gastroTypeLabels(item);
  return `<article id="${escapeHtml(`${uid}-card-${gastroDomToken(item.id)}`)}" class="gf-card${selected ? " is-selected" : ""}" data-gf-card>
    <div class="gf-card-media">${media}</div>
    <div class="gf-card-body">
      <div class="gf-card-heading"><h3>${escapeHtml(item.name || "Name nicht angegeben")}</h3><span class="gf-distance">${escapeHtml(distance)}</span></div>
      <div class="gf-badges">${typeLabels.map((label) => `<span class="gf-badge${label === "Café" ? " gf-badge-cafe" : ""}">${escapeHtml(label)}</span>`).join("")}</div>
      <p class="gf-card-place">${escapeHtml(place)}</p>
      <p class="gf-card-cuisine">${escapeHtml(cuisine)}</p>
      <button type="button" class="gf-card-select" data-gf-select data-gf-control="card-details" data-gf-id="${escapeHtml(item.id || "")}" aria-pressed="${selected ? "true" : "false"}">${selected ? "Ausgewählt" : "Details ansehen"}</button>
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

function renderGastroHeroDetails(poi, uid = "gf-detail", status = "loading") {
  if (status === "loading") {
    return `<div id="${escapeHtml(`${uid}-content`)}" class="gf-detail-dialog-content gf-detail-status" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Details werden geladen …</div>`;
  }
  if (status === "error") {
    return `<div id="${escapeHtml(`${uid}-content`)}" class="gf-detail-dialog-content gf-detail-status" role="alert">Die Detailangaben konnten nicht geladen werden. Die Grunddaten bleiben sichtbar.</div>`;
  }
  const item = poi || {};
  const address = item.address || {};
  const addressText = [address.street, address.postalCode, address.locality].filter(Boolean).join(", ") || "Adresse nicht angegeben";
  const cuisine = (item.cuisines || []).length ? item.cuisines.join(", ") : "Küche nicht angegeben";
  const description = item.description || "Beschreibung nicht angegeben";
  const source = item.dataLicense || {};
  const images = (item.images || []).filter(gastroImageIsUsable);
  const route = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${item.lat},${item.lng}`)}`;
  const website = safeHttpUrl((item.websites || [])[0]);
  const telephone = safeTelephone((item.telephones || [])[0]);
  const hero = images[0]
    ? `<img class="gf-detail-hero-image" src="${escapeHtml(safeHttpUrl(images[0].url))}" alt="${escapeHtml(images[0].title || item.name || "Gastrofinder-Bild")}">`
    : gastroNoPhoto(item.name || "Gastrofinder");
  return `<div class="gf-detail-dialog-content" id="${escapeHtml(`${uid}-content`)}">
    <div class="gf-detail-hero">${hero}<div class="gf-detail-hero-overlay"></div><button type="button" class="gf-icon-button gf-detail-close" data-gf-close aria-label="Details schließen">${gastroIcon("close")}</button><div class="gf-detail-hero-caption"><p class="gf-eyebrow">${escapeHtml(gastroTypeLabels(item).join(" · "))}</p><h2 id="${escapeHtml(`${uid}-title`)}">${escapeHtml(item.name || "Name nicht angegeben")}</h2><span>${escapeHtml([item.address && item.address.locality, Number.isFinite(Number(item.distanceKm)) ? `${Number(item.distanceKm).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km Luftlinie` : ""].filter(Boolean).join(" · ") || "Ort nicht angegeben")}</span></div></div>
    <div class="gf-detail-body"><p class="gf-description">${escapeHtml(description)}</p>
      <dl class="gf-facts"><div><dt>${gastroIcon("clock")}Öffnungszeiten</dt><dd>${renderGastroHours(item.openingHours)}</dd></div><div><dt>${gastroIcon("cup")}Küche</dt><dd>${escapeHtml(cuisine)}</dd></div><div><dt>${gastroIcon("pin")}Adresse</dt><dd>${escapeHtml(addressText)}</dd></div></dl>
      <div class="gf-detail-actions"><a class="gf-button gf-button-primary" href="${escapeHtml(route)}" target="_blank" rel="noopener noreferrer">${gastroIcon("route")} Route öffnen</a>${telephone ? `<a class="gf-button gf-button-secondary" href="tel:${escapeHtml(telephone.replace(/[^\d+]/g, ""))}">${gastroIcon("phone")} Anrufen</a>` : ""}</div>
      ${website ? `<a class="gf-text-link" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Website besuchen ${gastroIcon("external")}</a>` : ""}
      ${images.length > 1 ? `<div class="gf-gallery" aria-label="Weitere Bilder">${images.slice(1).map((image, index) => `<button type="button" class="gf-gallery-item" data-gf-gallery data-gf-image-index="${index + 1}" aria-label="Bild ${index + 2} vergrößern"><img src="${escapeHtml(safeHttpUrl(image.url))}" alt="${escapeHtml(image.title || item.name || "Gastrofinder-Bild")}" loading="lazy"><span>${index + 2}/${images.length}</span></button>`).join("")}</div>` : ""}
    </div>
    <footer class="gf-detail-source"><span>DZT Knowledge Graph</span><span>${escapeHtml(source.attribution || "Lizenz: " + (source.url || "nicht angegeben"))}</span></footer>
  </div>`;
}

function renderGastroDetails(poi, uid = "gf-detail", status = "loading") {
  return renderGastroHeroDetails(poi, uid, status);
}

function renderGastroShell(root, state) {
  if (!root || !state || !state.runtime) return;
  const uid = state.runtime.uid || createGastroUid();
  state.runtime.uid = uid;
  if (root.classList && root.classList.add) root.classList.add("gf-root");
  const regionName = state.region ? state.region.ort : "Suchgebiet wird geladen";
  const radius = state.region ? `${state.region.radiusKm} km Umkreis` : "Umkreis wird geladen";
  root.innerHTML = `<section class="gf-fullscreen-wrapper gf-shell" aria-label="Gastrofinder im Suchgebiet">
    <div class="gf-map-layer">
      <div class="gf-map-canvas" data-gf="map" aria-label="Karte der geladenen Gastro-Betriebe">
        <div class="gf-map-fallback" data-gf="map-fallback">Karte wird geladen …</div>
        <button type="button" class="gf-area-button" data-gf-show-area data-gf-control="area">${gastroIcon("pin")} Gebiet anzeigen</button>
      </div>
    </div>
    <div class="gf-brandbar" data-gf-brandbar>
      <strong>Gastrofinder</strong>
      <span>Genussatlas · ${escapeHtml(regionName)}</span>
      <small>${escapeHtml(radius)} · vom Portal festgelegt</small>
    </div>
    <div class="gf-floating-actions" data-gf-floating-actions aria-label="Kartenaktionen">
      <button type="button" class="gf-floating-button gf-floating-primary" data-gf-catalog-toggle data-gf-control="catalog">${gastroIcon("grid")}<span>Katalog</span></button>
      <button type="button" class="gf-floating-button" data-gf-share data-gf-control="share">${gastroIcon("share")}<span>Teilen</span></button>
      <button type="button" class="gf-floating-button gf-floating-icon" data-gf-menu data-gf-control="menu" data-bs-toggle="offcanvas" data-bs-target="#offcanvasNavbar" aria-controls="offcanvasNavbar" aria-label="Menü öffnen">${gastroIcon("menu")}</button>
    </div>
    <aside id="gf-${uid}-cockpit" class="gf-cockpit" data-gf-cockpit aria-label="Suche und Ergebnisse">
      <div class="gf-cockpit-header">
        <div class="gf-cockpit-brand"><span class="gf-cockpit-mark">${gastroIcon("fork")}</span><div><strong>Gastrofinder</strong><span>Genussatlas</span></div></div>
        <button type="button" class="gf-cockpit-toggle" data-gf-cockpit-toggle data-gf-control="cockpit" aria-expanded="true" aria-label="Cockpit einklappen">${gastroIcon("arrow")}</button>
      </div>
      <div class="gf-cockpit-search">
        <label class="gf-visually-hidden" for="gf-${uid}-search">Name, Ort oder Küche suchen</label>
        <div class="gf-search">${gastroIcon("search")}<input id="gf-${uid}-search" data-gf-search type="search" placeholder="Name, Ort oder Küche suchen" autocomplete="off"></div>
      </div>
      <div class="gf-filter-buttons" role="group" aria-label="Betriebstyp"><button type="button" data-gf-filter="all" aria-pressed="true">Alle <span data-gf-count="all">0</span></button><button type="button" data-gf-filter="restaurant" aria-pressed="false">Restaurants <span data-gf-count="restaurant">0</span></button><button type="button" data-gf-filter="cafe" aria-pressed="false">Cafés <span data-gf-count="cafe">0</span></button></div>
      <div class="gf-selects"><label for="gf-${uid}-cuisine">Küche</label><select id="gf-${uid}-cuisine" data-gf-cuisine><option value="all">Alle Küchen</option><option value="missing">Nicht angegeben</option></select><label for="gf-${uid}-sort">Sortierung</label><select id="gf-${uid}-sort" data-gf-sort><option value="distance">Entfernung</option><option value="name">Name</option></select></div>
      <div class="gf-results-head"><div><p class="gf-eyebrow">Gut essen. Nah entdecken.</p><h1 id="gf-${uid}-results-heading" data-gf="results-heading" tabindex="-1">Ergebnisse im Suchgebiet</h1></div><span class="gf-count" data-gf="count">0 Orte</span></div>
      <div class="gf-results-scroll" data-gf="results-scroll"><div class="gf-results-list" data-gf="results-list"></div></div>
      <div class="gf-results-footer"><span data-gf="visible-count">0 von 0 Orten</span><button type="button" class="gf-button gf-button-secondary" data-gf-show-more data-gf-control="show-more">Mehr anzeigen</button><button type="button" class="gf-button gf-button-primary" data-gf-load-next data-gf-control="load-next">Weitere Daten laden</button></div>
    </aside>
    <button type="button" class="gf-edge-tab" data-gf-edge-tab data-gf-control="cockpit-edge" aria-controls="gf-${uid}-cockpit" hidden>${gastroIcon("arrow")}<span>Ergebnisse öffnen</span></button>
    <button type="button" class="gf-bottom-switcher" data-gf-bottom-switcher data-gf-control="mobile-switcher" aria-pressed="false">${gastroIcon("map")}<span>Genusskarte</span></button>
    <div class="gf-map-controls" data-gf="map-controls" aria-label="Kartensteuerung"></div>
    <p class="gf-status" data-gf="status" role="status" aria-live="polite"></p>
    <div class="gf-legend" aria-label="Kartenlegende"><span>${gastroIcon("fork")} Restaurant</span><span>${gastroIcon("cup")} Café</span><span>${gastroIcon("pin")} Auswahl bleibt erhalten</span></div>
  </section>`;
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
    list.innerHTML = visible.length
      ? visible.map((poi) => renderGastroCard(poi, state.runtime.uid, poi.id === state.selectedId)).join("")
      : `<div class="gf-empty">${state.page.done ? "Keine passenden Orte gefunden." : "Keine passenden Orte im geladenen Bestand. Weitere Daten können noch folgen."}</div>`;
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
    load.textContent = state.page.busy ? "Wird geladen …" : "Weitere Daten laden";
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

function openGastroDetailDialog(root, state, opener = null) {
  const targetRoot = root || (state && state.runtime && state.runtime.root);
  if (!targetRoot || !state || !state.runtime || typeof document === "undefined" || !document.body || typeof document.createElement !== "function") return false;
  if (state.runtime.detailDialog) {
    updateGastroDetailDialog(targetRoot, state);
    const current = state.runtime.detailDialog.element || state.runtime.detailDialog;
    if (current && typeof current.showModal === "function" && !current.open) current.showModal();
    return true;
  }
  const dialog = document.createElement("dialog");
  const uid = state.runtime.uid || createGastroUid();
  state.runtime.uid = uid;
  dialog.className = "gf-detail-dialog";
  dialog.setAttribute("aria-labelledby", `gf-${uid}-title`);
  dialog.setAttribute("aria-describedby", `gf-${uid}-content`);
  if (typeof dialog.addEventListener === "function") {
    dialog.addEventListener("close", () => {
      if (state.runtime.detailDialog && state.runtime.detailDialog.element === dialog) closeGastroDetailDialog(targetRoot, state, true);
    });
    dialog.addEventListener("click", (event) => {
      const target = event.target && typeof event.target.closest === "function" ? event.target.closest("button") : null;
      if (!target) return;
      if (target.hasAttribute("data-gf-close")) closeGastroDetailDialog(targetRoot, state);
      if (target.hasAttribute("data-gf-gallery")) openGastroGallery(targetRoot, state, target);
    });
  }
  state.runtime.detailDialog = {
    element: dialog,
    opener: opener || (document.activeElement || null),
  };
  document.body.appendChild(dialog);
  updateGastroDetailDialog(targetRoot, state);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  const closeButton = dialog.querySelector && dialog.querySelector("[data-gf-close]");
  if (closeButton && typeof closeButton.focus === "function") closeButton.focus();
  return true;
}

function closeGastroDetailDialog(root, state, fromDialogEvent = false) {
  if (!state || !state.runtime) return false;
  const record = state.runtime.detailDialog;
  if (!record) return false;
  const element = record.element || record;
  const opener = record.opener;
  state.runtime.detailDialog = null;
  if (state.runtime.detailAbort && typeof state.runtime.detailAbort.abort === "function") state.runtime.detailAbort.abort();
  state.runtime.detailAbort = null;
  state.detail.seq += 1;
  state.detail.busy = false;
  state.detail.error = null;
  state.detail.retryAt = 0;
  state.selectedId = null;
  closeGastroGallery(root, state);
  if (!fromDialogEvent && element && typeof element.close === "function") {
    try { element.close(); } catch (_error) { /* bereits geschlossen */ }
  }
  if (element && typeof element.remove === "function") element.remove();
  if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
  else if (root && root.querySelector) {
    const heading = root.querySelector('[data-gf="results-heading"]');
    if (heading && typeof heading.focus === "function") heading.focus();
  }
  if (root && state.runtime.active) updateGastroView(root, state);
  invalidateGastroMapSize(state);
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
  state.detail.retryAt = 0;
  if (state.runtime) state.runtime.detailOpener = null;
  if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
  else if (root && root.querySelector) {
    const heading = root.querySelector('[data-gf="results-heading"]');
    if (heading && typeof heading.focus === "function") heading.focus();
  }
  return true;
}

function renderGastroCatalog(view, state) {
  const current = view || deriveGastroView(state);
  const limit = Math.max(24, Number(state && state.visible && state.visible.catalog) || 24);
  const items = current.pois.slice(0, limit);
  const uid = state && state.runtime && state.runtime.uid ? state.runtime.uid : "gf-catalog";
  const cards = items.length
    ? items.map((poi) => `<div class="gf-catalog-card" data-gf-catalog-card data-gf-id="${escapeHtml(poi.id || "")}">${renderGastroCard(poi, uid, poi.id === state.selectedId)}<button type="button" class="gf-button gf-button-secondary gf-catalog-map-action" data-gf-catalog-map data-gf-id="${escapeHtml(poi.id || "")}">${gastroIcon("map")} Auf Karte</button></div>`).join("")
    : `<div class="gf-empty">Keine passenden Orte gefunden.</div>`;
  return `<div class="gf-catalog-overlay" data-gf-catalog-overlay role="dialog" aria-modal="true" aria-labelledby="gf-${uid}-catalog-title"><header class="gf-catalog-header"><div><p class="gf-eyebrow">Gastrofinder Katalog</p><h2 id="gf-${uid}-catalog-title">Genussatlas</h2><p>${current.pois.length} ${current.pois.length === 1 ? "Ort" : "Orte"} im geladenen Bestand</p></div><button type="button" class="gf-button gf-button-secondary" data-gf-catalog-close>${gastroIcon("arrow")} Zurück zur Karte</button></header><div class="gf-catalog-scroll"><div class="gf-catalog-grid">${cards}</div></div></div>`;
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
      selectGastroPoi(state, id, () => updateGastroView(root, state));
      updateGastroView(root, state);
      return;
    }
    if (target.hasAttribute("data-gf-select") && target.closest("[data-gf-catalog-card]")) {
      const id = target.getAttribute("data-gf-id");
      if (!id) return;
      state.runtime.detailOpener = target;
      selectGastroPoi(state, id, () => updateGastroView(root, state));
    }
  }, state);
  const list = root.querySelector('[data-gf="results-list"]');
  if (list) {
    addGastroListener(list, "click", (event) => {
      const target = event.target && typeof event.target.closest === "function"
        ? event.target.closest("[data-gf-select]")
        : null;
      if (!target) return;
      const id = target.getAttribute("data-gf-id");
      if (id) {
        state.runtime.detailOpener = target;
        selectGastroPoi(state, id, notify);
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
  if (share) addGastroListener(share, "click", () => shareGastroInstance(root), state);
  if (typeof ResizeObserver === "function") {
    state.runtime.resizeObserver = new ResizeObserver(() => invalidateGastroMapSize(state));
    const mapLayer = root.querySelector(".gf-fullscreen-wrapper");
    if (mapLayer) state.runtime.resizeObserver.observe(mapLayer);
  }
}

function loadGastroStyle(href) {
  if (typeof document === "undefined") return Promise.resolve();
  const existing = document.querySelector(`link[data-gf-style="${href}"]`);
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.gfStyle = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error("Karten-Asset konnte nicht geladen werden."));
    document.head.appendChild(link);
  });
}

function loadGastroScript(src) {
  if (typeof document === "undefined") return Promise.resolve();
  const existing = document.querySelector(`script[data-gf-script="${src}"]`);
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.dataset.gfScript = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Kartenbibliothek konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
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
    if (controls && typeof document !== "undefined" && document.createElement) {
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

function updateGastroMap(root, state, view = null) {
  if (!state || !state.runtime || !state.runtime.map || typeof window === "undefined" || !window.L) return;
  const L = window.L;
  const current = view || deriveGastroView(state);
  const layer = state.runtime.markerLayer;
  if (!layer) return;
  layer.clearLayers();
  const markers = new Map();
  for (const poi of current.pois) {
    const selected = poi.id === state.selectedId;
    const marker = L.marker([poi.lat, poi.lng], {
      riseOnHover: true,
      icon: L.divIcon({
        className: "gf-marker-icon",
        html: gastroMarkerHtml(poi, selected),
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      }),
      keyboard: true,
      title: poi.name || "Gastrofinder-Betrieb",
    });
    marker.bindTooltip(escapeHtml(poi.name || "Name nicht angegeben"));
    marker.on("click", () => {
      state.runtime.detailOpener = null;
      selectGastroPoi(state, poi.id, () => updateGastroView(root, state));
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
    }
  } catch (error) {
    if (!stillCurrent()) return;
    state.page.error = error;
    updateGastroView(enclosingHtmlDivElement, state);
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
  if (page === "startseite") return null;
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
}

function addToHead() {
  // Die Kartenbibliotheken werden bewusst erst nach der ersten sichtbaren Shell geladen.
}

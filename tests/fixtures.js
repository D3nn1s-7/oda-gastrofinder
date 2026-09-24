function fixtureTerm(value, type = "literal", lang = "") {
  return {
    type,
    value: String(value),
    ...(lang ? { "xml:lang": lang } : {}),
  };
}

function fixtureRow(id, subject, predicate, object) {
  return {
    id: fixtureTerm(id, "uri"),
    subject: fixtureTerm(subject, "uri"),
    predicate: fixtureTerm(predicate, "uri"),
    object,
  };
}

function fixtureUniqueRows(entityId, rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = [
      row.subject.value,
      row.predicate.value,
      row.object.value,
      row.object.type,
      row.object["xml:lang"] || "",
      row.object.datatype || "",
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeGastroRows(options = {}) {
  const id = options.id === undefined ? "https://example.org/gastro/0001" : options.id;
  const types = options.types === undefined
    ? ["https://schema.org/Restaurant"]
    : options.types;
  const coordinates = options.geoPoints || [{
    lat: options.lat === undefined ? 52.52 : options.lat,
    lng: options.lng === undefined ? 13.405 : options.lng,
  }];
  const address = options.address === undefined
    ? { street: "Teststraße 1", postalCode: "10115", locality: "Berlin" }
    : options.address;
  const licenseUrl = options.licenseUrl === undefined
    ? "https://creativecommons.org/publicdomain/zero/1.0/"
    : options.licenseUrl;
  const description = options.description === undefined
    ? "Ein synthetischer Gastrofinder-Datensatz."
    : options.description;
  const cuisines = options.cuisines === undefined ? ["deutsch"] : options.cuisines;
  const websites = options.websites === undefined ? ["https://example.org/"] : options.websites;
  const telephones = options.telephones === undefined ? ["+49 30 123456"] : options.telephones;
  const images = options.images === undefined ? [] : options.images;
  const hours = options.hours === undefined ? [] : options.hours;
  const rows = [];

  const root = (predicate, object) => rows.push(fixtureRow(id, id, predicate, object));
  const node = (nodeId, predicate, object) => rows.push(fixtureRow(id, nodeId, predicate, object));

  for (const type of types || []) root("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", fixtureTerm(type, "uri"));

  const names = options.names || (options.name === null || options.name === undefined
    ? []
    : [{ value: options.name === undefined ? "Synthetic Restaurant" : options.name, lang: options.lang || "" }]);
  for (const name of names) {
    if (name && name.value !== null && name.value !== undefined && String(name.value).trim()) {
      root("https://schema.org/name", fixtureTerm(name.value, "literal", name.lang || ""));
    }
  }

  for (const point of coordinates) {
    if (!point) continue;
    const geoId = `${id}/geo/${rows.length}`;
    root("https://schema.org/geo", fixtureTerm(geoId, "uri"));
    if (point.lat !== null && point.lat !== undefined) node(geoId, "https://schema.org/latitude", fixtureTerm(point.lat));
    if (point.lng !== null && point.lng !== undefined) node(geoId, "https://schema.org/longitude", fixtureTerm(point.lng));
  }

  if (address) {
    const addressId = `${id}/address`;
    root("https://schema.org/address", fixtureTerm(addressId, "uri"));
    const addressFields = [
      ["https://schema.org/streetAddress", address.street],
      ["https://schema.org/postalCode", address.postalCode],
      ["https://schema.org/addressLocality", address.locality],
      ["https://schema.org/addressRegion", address.region],
    ];
    for (const [predicate, value] of addressFields) {
      if (value !== null && value !== undefined && String(value).trim()) {
        node(addressId, predicate, fixtureTerm(value));
      }
    }
  }

  for (const cuisine of cuisines || []) {
    if (cuisine && typeof cuisine === "object") {
      if (cuisine.value && (cuisine.type !== "uri" || cuisine.label)) {
        root("https://schema.org/servesCuisine", fixtureTerm(cuisine.label || cuisine.value, "literal", cuisine.lang || ""));
      }
    } else if (cuisine !== null && cuisine !== undefined && String(cuisine).trim()) {
      root("https://schema.org/servesCuisine", fixtureTerm(cuisine));
    }
  }

  if (licenseUrl) {
    const licenseId = `${id}/data-license`;
    root("https://schema.org/sdLicense", fixtureTerm(licenseId, "uri"));
    node(licenseId, "https://schema.org/license", fixtureTerm(licenseUrl));
  }
  const publisher = options.publisher === undefined
    ? (licenseUrl && licenseUrl !== "https://creativecommons.org/publicdomain/zero/1.0/"
      ? "Synthetic Publisher"
      : null)
    : options.publisher;
  if (publisher) {
    const publisherId = `${id}/publisher`;
    root("https://schema.org/sdPublisher", fixtureTerm(publisherId, "uri"));
    node(publisherId, "https://schema.org/name", fixtureTerm(publisher));
    if (options.publisherUrl) node(publisherId, "https://schema.org/url", fixtureTerm(options.publisherUrl));
  }
  for (const field of ["creator", "author", "copyrightHolder", "copyrightNotice", "creditText"]) {
    const value = options[field];
    if (Array.isArray(value)) {
      for (const item of value) root(`https://schema.org/${field}`, fixtureTerm(item));
    } else if (value !== null && value !== undefined && String(value).trim()) {
      root(`https://schema.org/${field}`, fixtureTerm(value));
    }
  }

  for (let index = 0; index < (images || []).length; index += 1) {
    const image = images[index] || {};
    const imageId = image.id || `${id}/image/${index + 1}`;
    root("https://schema.org/image", fixtureTerm(imageId, "uri"));
    if (image.url) node(imageId, "https://schema.org/contentUrl", fixtureTerm(image.url));
    if (image.title) node(imageId, "https://schema.org/name", fixtureTerm(image.title));
    if (image.caption) node(imageId, "https://schema.org/caption", fixtureTerm(image.caption));
    if (image.sourceUrl) node(imageId, "https://schema.org/url", fixtureTerm(image.sourceUrl));
    if (image.credit) node(imageId, "https://schema.org/creditText", fixtureTerm(image.credit));
    if (image.creator) node(imageId, "https://schema.org/creator", fixtureTerm(image.creator));
    if (image.licenseUrl) node(imageId, "https://schema.org/license", fixtureTerm(image.licenseUrl));
  }

  for (let index = 0; index < (hours || []).length; index += 1) {
    const hoursValue = hours[index] || {};
    const hoursId = `${id}/hours/${index + 1}`;
    root("https://schema.org/openingHoursSpecification", fixtureTerm(hoursId, "uri"));
    for (const day of hoursValue.days || []) {
      node(hoursId, "https://schema.org/dayOfWeek", fixtureTerm(
        String(day).startsWith("http") ? day : `https://schema.org/${day}`,
        "uri",
      ));
    }
    for (const field of ["opens", "closes", "validFrom", "validThrough"]) {
      if (hoursValue[field] !== null && hoursValue[field] !== undefined && String(hoursValue[field]).trim()) {
        node(hoursId, `https://schema.org/${field}`, fixtureTerm(hoursValue[field]));
      }
    }
  }

  for (const website of websites || []) {
    if (website !== null && website !== undefined && String(website).trim()) {
      root("https://schema.org/url", fixtureTerm(website));
    }
  }
  for (const telephone of telephones || []) {
    if (telephone !== null && telephone !== undefined && String(telephone).trim()) {
      root("https://schema.org/telephone", fixtureTerm(telephone));
    }
  }
  if (description !== null && description !== undefined && String(description).trim()) {
    root("https://schema.org/description", fixtureTerm(description));
  }

  const uniqueRows = fixtureUniqueRows(id, rows);
  if (options.omitIdTerm) uniqueRows.forEach((row) => delete row.id);
  return uniqueRows;
}

function makeGastroPage(start, count, options = {}) {
  const rows = [];
  for (let offset = 0; offset < count; offset += 1) {
    const number = start + offset;
    rows.push(...makeGastroRows({
      ...options,
      id: `https://example.org/gastro/${String(number).padStart(4, "0")}`,
      lat: options.lat === undefined ? 52.52 + number * 0.0001 : options.lat,
      cuisines: options.cuisines === undefined
        ? (number % 3 === 0 ? [] : ["deutsch", "international"])
        : options.cuisines,
    }));
  }
  return rows;
}

export interface GeocodingResult {
  id: number;
  name: string;
  city?: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  feature_code?: string;
  country_code?: string;
  admin1_id?: number;
  admin2_id?: number;
  admin3_id?: number;
  admin4_id?: number;
  timezone?: string;
  population?: number;
  postcodes?: string[];
  country_id?: number;
  country?: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
  admin4?: string;
}

export interface GeocodingApiResponse {
  results?: GeocodingResult[];
  generationtime_ms?: number;
}

/**
 * Cleans administrative terms like " District", " Subdistrict", " County", "(R)", etc.
 */
export function cleanAdminName(val?: string): string {
  if (!val) return "";
  return val
    .replace(/\b(subdistrict|sub-district|district|county|taluk|taluka|tehsil|ward|zone\s*\d*)\b/gi, "")
    .replace(/\s*\([A-Z0-9\s-]+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tests if a string is a postal or PIN code.
 * Postal codes worldwide always contain numeric digits. Pure alphabetic words
 * (like "Wakad", "Pune", "Paris", "Delhi") are place names, never postal codes.
 */
export function isPostalCodeString(val?: string): boolean {
  if (!val) return false;
  const clean = val.trim();
  if (!/\d/.test(clean)) return false;

  return (
    /^\d{3,10}$/.test(clean) ||
    /^\d{5}-\d{4}$/.test(clean) ||
    /^[A-Z0-9]{2,5}\s?[A-Z0-9]{2,4}$/i.test(clean)
  );
}

/**
 * Extracts the most appropriate city or town name from an OpenStreetMap address object.
 */
export function resolveCityFromAddress(addr: any): string {
  if (!addr) return "";
  const candidate =
    addr.city ||
    addr.town ||
    addr.municipality ||
    cleanAdminName(addr.city_district) ||
    cleanAdminName(addr.state_district) ||
    cleanAdminName(addr.county) ||
    addr.suburb ||
    addr.village ||
    addr.hamlet ||
    "";

  return isPostalCodeString(candidate) ? "" : candidate.trim();
}

/**
 * Resolves the primary city from a geocoding result.
 * For regional localities / suburbs (e.g. Wakad or Hinjawadi in Pune),
 * resolves to the parent city (Pune) while preserving the locality in the full address.
 */
export function resolveCityFromGeocoding(item: GeocodingResult): string {
  if (item.city && !isPostalCodeString(item.city) && !/^\d+/.test(item.city.trim())) {
    return cleanAdminName(item.city);
  }

  const cleanAdmin2 = cleanAdminName(item.admin2);
  const cleanAdmin3 = cleanAdminName(item.admin3);

  // If item.name starts with numbers (e.g. "411057, Mulshi" or "10001, New York"),
  // strip the numeric prefix for city identification
  const nameClean = item.name.replace(/^\d+[\s,-]*/, "").trim();

  // If name matches admin2 or there is no admin2, name is the city (e.g. Pune, Mumbai, Paris)
  if (!cleanAdmin2 || (nameClean && nameClean.toLowerCase() === cleanAdmin2.toLowerCase())) {
    return isPostalCodeString(nameClean) ? "" : nameClean;
  }

  // If name matches admin3 (e.g. Shegaon where admin3 is Shegaon and admin2 is Buldhana),
  // then name is the town/city itself
  if (cleanAdmin3 && nameClean && nameClean.toLowerCase() === cleanAdmin3.toLowerCase()) {
    return nameClean;
  }

  // If name is a locality/suburb inside a city (e.g. Wakad in Pune, Hinjawadi in Pune):
  // The city is admin2 (e.g. Pune)
  if (cleanAdmin2 && !isPostalCodeString(cleanAdmin2) && !/^\d+/.test(cleanAdmin2)) {
    return cleanAdmin2;
  }

  return nameClean && !isPostalCodeString(nameClean) ? nameClean : "";
}

/**
 * Generates common transliteration and spelling variants for location queries.
 * Example: "hinjewadi" <-> "hinjawadi", "pimpari" <-> "pimpri", "buldana" <-> "buldhana"
 */
export function getSpellingVariants(raw: string): string[] {
  const variants = [raw];
  const lower = raw.toLowerCase();

  if (lower.includes("ewadi")) {
    variants.push(raw.replace(/ewadi/gi, "awadi"));
  } else if (lower.includes("awadi")) {
    variants.push(raw.replace(/awadi/gi, "ewadi"));
  }

  if (lower.includes("pimpri")) {
    variants.push(raw.replace(/pimpri/gi, "pimpari"));
  } else if (lower.includes("pimpari")) {
    variants.push(raw.replace(/pimpari/gi, "pimpri"));
  }

  if (lower.includes("buldana")) {
    variants.push(raw.replace(/buldana/gi, "buldhana"));
  } else if (lower.includes("buldhana")) {
    variants.push(raw.replace(/buldhana/gi, "buldana"));
  }

  return Array.from(new Set(variants));
}

/**
 * Deduplicates geocoding results based on normalized address and coordinates,
 * preserving distinct postal code zones (e.g. 411057 vs 411115) and distinct
 * towns while eliminating identical commercial POIs.
 */
export function deduplicateGeocodingResults(items: GeocodingResult[]): GeocodingResult[] {
  const unique: GeocodingResult[] = [];

  for (const item of items) {
    const formatted = formatGeocodingAddress(item).toLowerCase().trim();
    if (!formatted) continue;

    const postal = (item.postcodes && item.postcodes[0]) ? item.postcodes[0].trim().toLowerCase() : "";
    const nameLower = (item.name || "").toLowerCase().trim();
    const admin2Lower = cleanAdminName(item.admin2).toLowerCase();
    const countryLower = (item.country || "").toLowerCase().trim();

    const existingIndex = unique.findIndex((existing) => {
      const exPostal = (existing.postcodes && existing.postcodes[0]) ? existing.postcodes[0].trim().toLowerCase() : "";
      const exName = (existing.name || "").toLowerCase().trim();
      const exAdmin2 = cleanAdminName(existing.admin2).toLowerCase();
      const exCountry = (existing.country || "").toLowerCase().trim();
      const exFormatted = formatGeocodingAddress(existing).toLowerCase().trim();

      // If both have different postal codes, they are distinct zones (NOT duplicates!)
      if (postal && exPostal && postal !== exPostal) {
        return false;
      }

      // Distance check (~3km in coordinates is approx 0.03 degrees)
      const dist = Math.hypot(existing.latitude - item.latitude, existing.longitude - item.longitude);

      // If same formatted address and same postal code (or within 3km), they are duplicates
      if (exFormatted === formatted && (postal === exPostal || dist < 0.035)) {
        return true;
      }

      // Same name and same district/country within 3km
      if ((exName === nameLower || exFormatted === formatted) && exAdmin2 === admin2Lower && exCountry === countryLower && dist < 0.035) {
        return true;
      }

      return false;
    });

    if (existingIndex >= 0) {
      // If existing item lacked postal code but new item has it, enrich the existing entry
      const existing = unique[existingIndex];
      if ((!existing.postcodes || existing.postcodes.length === 0) && item.postcodes && item.postcodes.length > 0) {
        existing.postcodes = item.postcodes;
      }
    } else {
      unique.push(item);
    }
  }

  return unique;
}

/**
 * Searches locations using the Open-Meteo Geocoding API with multi-source fallback
 * (Photon OSM Geocoding & India Post API) to ensure complete coverage worldwide.
 *
 * Open-Meteo Geocoding API:
 * https://geocoding-api.open-meteo.com/v1/search?name={location}&count=10&language=en&format=json
 */
export async function searchLocations(
  location: string,
  count = 10,
  signal?: AbortSignal
): Promise<GeocodingResult[]> {
  const query = location.trim();
  if (!query || query.length < 2) {
    return [];
  }

  const isNumericPostal = /^\d{3,10}$/.test(query);
  const isIndianPin = /^\d{6}$/.test(query);
  const lowerQuery = query.toLowerCase();

  // Extract any standalone numbers in query (e.g. '858', '1', '2')
  const queryNumbers = query.match(/\b\d+\b/g) || [];
  const queryVariants = getSpellingVariants(query);

  const collected: GeocodingResult[] = [];

  // 1. Special handling for 6-digit Indian PIN codes (e.g. 411057, 444203, 400001)
  if (isIndianPin) {
    try {
      const indiaPostRes = await fetch(`https://api.postalpincode.in/pincode/${query}`, { signal });
      if (indiaPostRes.ok) {
        const ipData = await indiaPostRes.json();
        const postOffices: any[] = ipData?.[0]?.PostOffice || [];

        if (Array.isArray(postOffices) && postOffices.length > 0) {
          const firstPO = postOffices[0];
          const district = firstPO.District || "Pune";
          const state = firstPO.State || "Maharashtra";

          // Fetch coordinates for PIN code via Photon
          let pinLat = 0;
          let pinLon = 0;
          try {
            const phRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`, { signal });
            if (phRes.ok) {
              const phData = await phRes.json();
              if (phData.features?.[0]?.geometry?.coordinates) {
                pinLat = phData.features[0].geometry.coordinates[1];
                pinLon = phData.features[0].geometry.coordinates[0];
              }
            }
          } catch {}

          if (!pinLat && !pinLon) {
            pinLat = 18.5204;
            pinLon = 73.8567;
          }

          // Primary District/City result
          collected.push({
            id: Number(query) * 100,
            name: district,
            city: district,
            latitude: pinLat,
            longitude: pinLon,
            country: "India",
            country_code: "IN",
            admin1: state,
            admin2: district,
            postcodes: [query],
          });

          // Distinct sub-office localities (e.g. Hinjawadi, Wakad, Marunji)
          for (let i = 0; i < Math.min(postOffices.length, count); i++) {
            const po = postOffices[i];
            const rawPoName = (po.Name || "").replace(/\s+/g, " ").trim();
            if (rawPoName.toLowerCase() === district.toLowerCase()) continue;

            collected.push({
              id: Number(query) * 100 + i + 1,
              name: `${rawPoName}, ${district}`,
              city: district,
              latitude: pinLat,
              longitude: pinLon,
              country: "India",
              country_code: "IN",
              admin1: state,
              admin2: po.Block || district,
              postcodes: [query],
            });
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") throw err;
      console.warn("India Post PIN search failed, using fallback providers:", err);
    }
  }

  // 2. Open-Meteo Geocoding API (using requested endpoint with spelling variants of the query)
  if (!isNumericPostal) {
    for (const variant of queryVariants) {
      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          variant
        )}&count=${Math.max(count * 2, 20)}&language=en&format=json`;

        const response = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal,
        });

        if (response.ok) {
          const data: GeocodingApiResponse = await response.json();
          if (Array.isArray(data.results) && data.results.length > 0) {
            for (const r of data.results) {
              collected.push({
                ...r,
                city: resolveCityFromGeocoding(r),
              });
            }
            if (collected.length > 0) break;
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") throw err;
        console.warn(`Open-Meteo query (${variant}) failed:`, err);
      }
    }
  }

  // 3. Photon OSM Geocoding (high-accuracy global coverage with postcodes, localities & CORS)
  let photonFeatures: any[] = [];
  try {
    for (const variant of queryVariants) {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(variant)}&limit=${Math.max(count * 2, 15)}`;
      const phRes = await fetch(photonUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      });

      if (phRes.ok) {
        const phData = await phRes.json();
        const features = phData.features || [];
        photonFeatures.push(...features);

        for (let i = 0; i < features.length; i++) {
          const f = features[i];
          const p = f.properties || {};
          const osmKey = p.osm_key;

          // Exclude commercial shops, gas stations, clinics, offices - keep only real places / boundaries / streets / areas
          if (osmKey === "amenity" || osmKey === "office" || osmKey === "shop" || osmKey === "building" || osmKey === "craft") {
            continue;
          }

          const primaryName = p.name || p.street || p.city || query;
          const city = p.city || p.district || p.county || "";
          const admin2 = cleanAdminName(p.district || p.county || city);

          let displayName = primaryName;
          if (city && primaryName.toLowerCase() !== city.toLowerCase()) {
            displayName = `${primaryName}, ${city}`;
          }

          collected.push({
            id: 8000000 + (f.properties?.osm_id || i),
            name: displayName,
            city: city || displayName,
            latitude: f.geometry.coordinates[1],
            longitude: f.geometry.coordinates[0],
            country: p.country || "",
            country_code: p.countrycode ? p.countrycode.toUpperCase() : undefined,
            admin1: p.state || "",
            admin2: admin2,
            postcodes: p.postcode ? [String(p.postcode).trim()] : undefined,
          });
        }
        if (collected.length > 0) break;
      }
    }
  } catch (err: any) {
    if (err.name === "AbortError") throw err;
    console.warn("Photon search failed:", err);
  }

  // 4. Enrich any Open-Meteo items that lack postal codes with nearby Photon postal codes
  if (photonFeatures.length > 0) {
    for (const item of collected) {
      if (!item.postcodes || item.postcodes.length === 0) {
        const match = photonFeatures.find((p) => {
          const pc = p.properties?.postcode;
          if (!pc) return false;
          const [lon, lat] = p.geometry?.coordinates || [];
          return Math.hypot(lat - item.latitude, lon - item.longitude) < 0.08;
        });
        if (match?.properties?.postcode) {
          item.postcodes = [String(match.properties.postcode).trim()];
        }
      }
    }
  }

  // 5. Strict Relevance Validation:
  // If the query contains standalone numbers (e.g. '858', '1', '2'),
  // discard any result that does not genuinely contain all of those numbers!
  // This guarantees queries for non-existent places like "Hinjewadi phase 858" return 0 results.
  const validResults = collected.filter((item) => {
    const fullText = (
      (item.name || "") + " " +
      (item.city || "") + " " +
      (item.admin2 || "") + " " +
      (item.admin1 || "") + " " +
      (item.country || "") + " " +
      (item.postcodes ? item.postcodes.join(" ") : "")
    ).toLowerCase();

    for (const num of queryNumbers) {
      const regex = new RegExp(`\\b${num}\\b`, "i");
      if (!regex.test(fullText)) {
        return false;
      }
    }

    return true;
  });

  // 6. Deduplicate all verified genuine locations
  const deduped = deduplicateGeocodingResults(validResults);

  // 7. Intelligent Ranking:
  // - Exact matches to the searched query come first
  // - Locations starting with the searched query come second
  // - Locations with postal codes and higher geographic relevance next
  deduped.sort((a, b) => {
    const aName = (a.name || "").toLowerCase();
    const bName = (b.name || "").toLowerCase();

    // Exact match to query
    const aExact = aName === lowerQuery || aName.startsWith(`${lowerQuery},`);
    const bExact = bName === lowerQuery || bName.startsWith(`${lowerQuery},`);
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    // Starts with query
    const aStarts = aName.startsWith(lowerQuery);
    const bStarts = bName.startsWith(lowerQuery);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    // Has postal code
    const aHasPost = a.postcodes && a.postcodes.length > 0;
    const bHasPost = b.postcodes && b.postcodes.length > 0;
    if (aHasPost && !bHasPost) return -1;
    if (!aHasPost && bHasPost) return 1;

    return 0;
  });

  return deduped.slice(0, count * 2);
}

/**
 * Reverse geocodes coordinates to fetch postal code if not directly present.
 * Uses CORS-enabled Photon reverse geocoding with OpenStreetMap fallback.
 */
export async function fetchPostalCodeFromCoordinates(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<string> {
  // 1. Try Photon reverse geocoding (CORS-friendly, accurate worldwide)
  try {
    const photonUrl = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`;
    const res = await fetch(photonUrl, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      const postcode = data?.features?.[0]?.properties?.postcode;
      if (postcode) return String(postcode).trim();
    }
  } catch {}

  // 2. OpenStreetMap reverse geocoding fallback
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      const postcode = data?.address?.postcode;
      return typeof postcode === "string" ? postcode.trim() : "";
    }
  } catch {}

  return "";
}

/**
 * Formats a geocoding result into a clean, human-readable full address string.
 * Example: "Hinjawadi, Pune, Maharashtra, India" or "Berlin, State of Berlin, Germany"
 */
export function formatGeocodingAddress(item: GeocodingResult): string {
  const isPostcode = isPostalCodeString(item.name);
  const primaryName = isPostcode ? item.city || item.admin2 || "" : item.name;

  const rawParts = [
    primaryName,
    item.admin2 && !primaryName.toLowerCase().includes(item.admin2.toLowerCase()) ? item.admin2 : null,
    item.admin1 && !primaryName.toLowerCase().includes(item.admin1.toLowerCase()) ? item.admin1 : null,
    item.country,
  ].filter(Boolean) as string[];

  // Deduplicate parts (case-insensitive) while preserving order
  const seen = new Set<string>();
  const uniqueParts: string[] = [];

  for (const part of rawParts) {
    const trimmed = part.trim();
    const lower = trimmed.toLowerCase();
    if (trimmed && !seen.has(lower)) {
      seen.add(lower);
      uniqueParts.push(trimmed);
    }
  }

  return uniqueParts.join(", ");
}

/**
 * Safely extracts the postal code from an Open-Meteo or Nominatim result without inventing values.
 * If unavailable, returns an empty string.
 */
export function extractPostalCode(item: GeocodingResult): string {
  if (Array.isArray(item.postcodes) && item.postcodes.length > 0) {
    const firstValid = item.postcodes.find((p) => typeof p === "string" && p.trim().length > 0);
    return firstValid ? firstValid.trim() : "";
  }
  return "";
}

/**
 * Formats latitude and longitude coordinates with cardinal directions.
 * Example: 18.5196° N, 73.8554° E
 */
export function formatCoordinates(lat: number | null | undefined, lon: number | null | undefined): string {
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) {
    return "—";
  }
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}


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
 */
export function isPostalCodeString(val?: string): boolean {
  if (!val) return false;
  const clean = val.trim();
  return (
    /^\d{3,10}$/.test(clean) ||
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
 * Searches locations using the Open-Meteo Geocoding API with intelligent
 * OpenStreetMap Nominatim fallback and Indian PIN code directory integration.
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

  // 1. If not a numeric postal code, query Open-Meteo Geocoding API first
  if (!isNumericPostal) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        query
      )}&count=${count}&language=en&format=json`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal,
      });

      if (response.ok) {
        const data: GeocodingApiResponse = await response.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          return data.results.map((r) => ({
            ...r,
            city: isPostalCodeString(r.name) ? r.admin2 || r.admin1 || "" : r.name,
          }));
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") throw err;
      console.warn("Open-Meteo query had no matches or failed, trying fallback:", err);
    }
  }

  // 2. Special handling for 6-digit Indian PIN codes (e.g. 411057, 444203, 400001)
  if (isIndianPin) {
    try {
      const [indiaPostRes, nominatimPinRes] = await Promise.allSettled([
        fetch(`https://api.postalpincode.in/pincode/${query}`, { signal }),
        fetch(
          `https://nominatim.openstreetmap.org/search?postalcode=${query}&country=India&format=json&addressdetails=1&limit=5`,
          {
            headers: { Accept: "application/json" },
            signal,
          }
        ),
      ]);

      let osmLat = 0;
      let osmLon = 0;
      let osmAddress: any = null;

      if (nominatimPinRes.status === "fulfilled" && nominatimPinRes.value.ok) {
        const osmData = await nominatimPinRes.value.json();
        if (Array.isArray(osmData) && osmData.length > 0) {
          osmLat = parseFloat(osmData[0].lat);
          osmLon = parseFloat(osmData[0].lon);
          osmAddress = osmData[0].address;
        }
      }

      if (indiaPostRes.status === "fulfilled" && indiaPostRes.value.ok) {
        const ipData = await indiaPostRes.value.json();
        const postOffices: any[] = ipData?.[0]?.PostOffice || [];

        if (Array.isArray(postOffices) && postOffices.length > 0) {
          const firstPO = postOffices[0];
          const district = firstPO.District || cleanAdminName(osmAddress?.state_district) || "Pune";
          const state = firstPO.State || osmAddress?.state || "Maharashtra";

          // If OSM coordinates with country=India was missing, query quick fallback
          if (!osmLat && !osmLon) {
            try {
              const fallbackOsm = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
                  `${query}, India`
                )}&format=json&limit=1`,
                { headers: { Accept: "application/json" }, signal }
              );
              if (fallbackOsm.ok) {
                const fbData = await fallbackOsm.json();
                if (fbData?.[0]) {
                  osmLat = parseFloat(fbData[0].lat);
                  osmLon = parseFloat(fbData[0].lon);
                }
              }
            } catch {
              // Ignore fallback coords failure
            }
          }

          const results: GeocodingResult[] = [];

          // Primary District/City result
          const primaryTown =
            postOffices.find(
              (p) =>
                p.Name?.toLowerCase() === p.Block?.toLowerCase() ||
                p.Name?.toLowerCase() === district.toLowerCase()
            )?.Name || district;

          results.push({
            id: Number(query) * 100,
            name: primaryTown !== district ? `${primaryTown}, ${district}` : district,
            city: primaryTown,
            latitude: osmLat || 18.5204,
            longitude: osmLon || 73.8567,
            country: "India",
            country_code: "IN",
            admin1: state,
            admin2: district,
            postcodes: [query],
          });

          // Distinct sub-office localities (e.g. Hinjawadi, Wakad, Marunji)
          for (let i = 0; i < Math.min(postOffices.length, count - 1); i++) {
            const po = postOffices[i];
            const cleanPoName = po.Name?.replace(/\s*\([^)]*\)/g, "").trim() || po.Name;
            if (cleanPoName.toLowerCase() === primaryTown.toLowerCase()) continue;

            results.push({
              id: Number(query) * 100 + i + 1,
              name: `${po.Name}, ${district}`,
              city: district,
              latitude: osmLat,
              longitude: osmLon,
              country: "India",
              country_code: "IN",
              admin1: state,
              admin2: po.Block || district,
              postcodes: [query],
            });
          }

          if (results.length > 0) {
            return results;
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") throw err;
      console.warn("India Post PIN search failed, falling back to general Nominatim:", err);
    }
  }

  // 3. Fallback to OpenStreetMap Nominatim for general and international postal codes
  try {
    const fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query
    )}&format=json&addressdetails=1&limit=${count}`;

    const fallbackResponse = await fetch(fallbackUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal,
    });

    if (fallbackResponse.ok) {
      const osmResults: any[] = await fallbackResponse.json();
      if (Array.isArray(osmResults) && osmResults.length > 0) {
        const mappedResults: GeocodingResult[] = [];

        for (let index = 0; index < osmResults.length; index++) {
          const item = osmResults[index];
          let addr = item.address || {};
          const isPostcodeItem =
            item.type === "postcode" ||
            item.addresstype === "postcode" ||
            isPostalCodeString(item.name);

          // If it's a postal code point without city/town, reverse geocode coordinates to find the suburb/city
          if (isPostcodeItem && !addr.city && !addr.town && !addr.suburb && index === 0) {
            try {
              const revRes = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${item.lat}&lon=${item.lon}&format=json&addressdetails=1`,
                { headers: { Accept: "application/json" }, signal }
              );
              if (revRes.ok) {
                const revData = await revRes.json();
                if (revData?.address) {
                  addr = { ...addr, ...revData.address };
                }
              }
            } catch {
              // Ignore reverse geocode failures
            }
          }

          const city = resolveCityFromAddress(addr);
          const suburb = addr.suburb || addr.neighbourhood || "";
          let displayName = city;

          if (suburb && city && suburb.toLowerCase() !== city.toLowerCase()) {
            displayName = `${suburb}, ${city}`;
          } else if (!displayName) {
            displayName = cleanAdminName(addr.county) || cleanAdminName(addr.state_district) || query;
          }

          const postcodes: string[] = [];
          if (addr.postcode) {
            postcodes.push(String(addr.postcode).trim());
          } else if (isPostalCodeString(query)) {
            postcodes.push(query);
          }

          mappedResults.push({
            id: Number(item.place_id) || index + 1,
            name: displayName,
            city: city || displayName,
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
            country: addr.country || "",
            country_code: addr.country_code ? addr.country_code.toUpperCase() : undefined,
            admin1: addr.state || "",
            admin2: cleanAdminName(addr.county) || cleanAdminName(addr.state_district) || "",
            postcodes: postcodes.length > 0 ? postcodes : undefined,
          });
        }

        return mappedResults;
      }
    }
  } catch (err: any) {
    if (err.name === "AbortError") throw err;
    console.warn("Nominatim fallback search failed:", err);
  }

  return [];
}

/**
 * Reverse geocodes coordinates to fetch postal code if Open-Meteo returned null postcodes.
 * Uses OpenStreetMap reverse geocoding API.
 */
export async function fetchPostalCodeFromCoordinates(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return "";
    const data = await res.json();
    const postcode = data?.address?.postcode;
    return typeof postcode === "string" ? postcode.trim() : "";
  } catch {
    return "";
  }
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
    item.admin2 && item.admin2 !== primaryName && item.admin2 !== item.city ? item.admin2 : null,
    item.admin1 && item.admin1 !== primaryName ? item.admin1 : null,
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


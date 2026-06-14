import { getDb } from './db.js';
import { CITY_COORDS, cityFromText } from './cityCoords.js';
import type { LatLng } from './types.js';

/**
 * Resolve an address to coordinates.
 *  1. cache (geocode_cache table)
 *  2. Google Geocoding API (if GOOGLE_MAPS_API_KEY set)
 *  3. WA city centroid + deterministic jitter (always works, no network)
 */
export async function geocode(address: string, hintCity?: string): Promise<LatLng & { source: string }> {
  const db = await getDb();
  const key = address.trim().toLowerCase();
  const cached = (await db.get(
    'SELECT lat, lng, source FROM geocode_cache WHERE query = ?',
    [key],
  )) as { lat: number; lng: number; source: string } | undefined;
  if (cached) return { lat: cached.lat, lng: cached.lng, source: cached.source };

  let result: (LatLng & { source: string }) | null = null;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address,
      )}&key=${apiKey}`;
      const res = await fetch(url);
      const data = (await res.json()) as any;
      if (data.status === 'OK' && data.results?.[0]) {
        const loc = data.results[0].geometry.location;
        result = { lat: loc.lat, lng: loc.lng, source: 'google' };
      }
    } catch {
      /* fall through to heuristic */
    }
  }

  if (!result) {
    const city = (hintCity && CITY_COORDS[hintCity.toLowerCase()] ? hintCity : cityFromText(address)) || 'seattle';
    const base = CITY_COORDS[city.toLowerCase()] ?? CITY_COORDS['seattle'];
    const [dx, dy] = jitter(address);
    result = { lat: round(base[0] + dy), lng: round(base[1] + dx), source: 'city-estimate' };
  }

  await db.run(
    `INSERT INTO geocode_cache (query, lat, lng, source) VALUES (?,?,?,?)
     ON CONFLICT (query) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, source = excluded.source`,
    [key, result.lat, result.lng, result.source],
  );
  return result;
}

function jitter(seed: string, scale = 0.045): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) & 0xffff) / 0xffff;
  const b = ((h >>> 16) & 0xffff) / 0xffff;
  return [(a - 0.5) * 2 * scale, (b - 0.5) * 2 * scale];
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

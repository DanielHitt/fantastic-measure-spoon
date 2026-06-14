import type { LatLng } from '../types.js';

export interface Leg {
  minutes: number;
  km: number;
}

export type ProviderName = 'google' | 'heuristic';

const R = 6371; // earth radius km

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = deg(b.lat - a.lat);
  const dLng = deg(b.lng - a.lng);
  const la1 = deg(a.lat);
  const la2 = deg(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const deg = (d: number) => (d * Math.PI) / 180;

/**
 * Time-of-day + weekday congestion multiplier (1.0 = free flow).
 * Mirrors a typical Puget Sound commute curve: heavy AM/PM peaks,
 * a midday bump, light evenings/weekends.
 */
export function trafficFactor(when: Date): number {
  const day = when.getDay(); // 0 Sun .. 6 Sat
  const weekend = day === 0 || day === 6;
  const h = when.getHours() + when.getMinutes() / 60;
  // base curve (weekday)
  const peakAM = bell(h, 7.75, 1.15) * 0.62; // ~7:45 peak
  const peakPM = bell(h, 17.0, 1.5) * 0.7; // ~5:00 peak
  const midday = bell(h, 12.5, 2.2) * 0.18;
  let factor = 1 + peakAM + peakPM + midday;
  if (weekend) factor = 1 + (factor - 1) * 0.35; // weekends much lighter
  // overnight free flow
  if (h < 5.5 || h > 20) factor = 1.0;
  return Math.max(1, Math.round(factor * 100) / 100);
}
function bell(x: number, mu: number, sigma: number): number {
  return Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));
}

const CITY_KMH = num(process.env.HEURISTIC_CITY_KMH, 38);
const HWY_KMH = num(process.env.HEURISTIC_HIGHWAY_KMH, 78);
const CIRCUITY = 1.32; // road distance / straight-line

/** Heuristic single leg: road distance + congestion-adjusted duration. */
export function heuristicLeg(a: LatLng, b: LatLng, depart: Date): Leg {
  const straight = haversineKm(a, b);
  const km = straight * CIRCUITY;
  // longer trips ride freeways (faster avg); short trips are arterial/urban
  const hwyShare = Math.min(0.85, Math.max(0, (straight - 4) / 30));
  const baseKmh = CITY_KMH * (1 - hwyShare) + HWY_KMH * hwyShare;
  const freeMinutes = (km / baseKmh) * 60;
  const minutes = freeMinutes * trafficFactor(depart) + 1.5; // +parking/walk-in
  return { minutes: round1(minutes), km: round1(km) };
}

/**
 * Build an N×N travel matrix between points, departing at `depart`.
 * Uses Google Distance Matrix (traffic-aware) when a key is configured,
 * otherwise the heuristic engine.
 */
export async function buildMatrix(
  points: LatLng[],
  depart: Date,
): Promise<{ minutes: number[][]; km: number[][]; provider: ProviderName }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey && points.length <= 25) {
    try {
      return await googleMatrix(points, depart, apiKey);
    } catch {
      /* fall back */
    }
  }
  const n = points.length;
  const minutes: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const km: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const leg = heuristicLeg(points[i], points[j], depart);
      minutes[i][j] = leg.minutes;
      km[i][j] = leg.km;
    }
  }
  return { minutes, km, provider: 'heuristic' };
}

async function googleMatrix(
  points: LatLng[],
  depart: Date,
  apiKey: string,
): Promise<{ minutes: number[][]; km: number[][]; provider: ProviderName }> {
  const locs = points.map((p) => `${p.lat},${p.lng}`).join('|');
  const departureSec = Math.max(Math.floor(depart.getTime() / 1000), Math.floor(Date.now() / 1000) + 60);
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(locs)}` +
    `&destinations=${encodeURIComponent(locs)}&departure_time=${departureSec}` +
    `&traffic_model=best_guess&key=${apiKey}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;
  if (data.status !== 'OK') throw new Error(`distance matrix: ${data.status}`);
  const n = points.length;
  const minutes: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const km: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  data.rows.forEach((row: any, i: number) => {
    row.elements.forEach((el: any, j: number) => {
      if (i === j || el.status !== 'OK') return;
      const sec = (el.duration_in_traffic ?? el.duration)?.value ?? 0;
      minutes[i][j] = round1(sec / 60);
      km[i][j] = round1((el.distance?.value ?? 0) / 1000);
    });
  });
  return { minutes, km, provider: 'google' };
}

function num(v: string | undefined, d: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
}
const round1 = (n: number) => Math.round(n * 10) / 10;

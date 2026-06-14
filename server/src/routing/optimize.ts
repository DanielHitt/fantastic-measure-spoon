import type { LatLng, RoutePlan, RouteStop } from '../types.js';
import { buildMatrix, heuristicLeg, type ProviderName } from './provider.js';

export interface OptStop {
  jobId: number;
  projectId: number;
  projectName: string;
  unit: string;
  scopeCode: string;
  lat: number;
  lng: number;
  estMinutes: number;
  priority?: number;
  windowStart?: string | null; // 'HH:MM'
  windowEnd?: string | null;
}

export interface OptInput {
  start: LatLng & { name: string };
  startTime: Date;
  stops: OptStop[];
  returnToStart?: boolean;
  workdayMinutes?: number;
  /** preserve the given order instead of optimizing (manual mode) */
  lockOrder?: boolean;
}

interface Timeline {
  totalDrive: number;
  totalKm: number;
  penalty: number;
  legs: { minutes: number; km: number }[];
  arrive: Date[];
  depart: Date[];
  returnLeg: { minutes: number; km: number };
}

export async function optimizeRoute(input: OptInput): Promise<RoutePlan> {
  const { start, startTime } = input;
  const stops = input.stops;
  const returnToStart = input.returnToStart ?? true;
  const workdayMinutes = input.workdayMinutes ?? 9 * 60;

  if (stops.length === 0) {
    return {
      employeeId: null,
      date: toDateStr(startTime),
      startLocation: start,
      startTime: startTime.toISOString(),
      stops: [],
      totalDriveMinutes: 0,
      totalServiceMinutes: 0,
      totalKm: 0,
      returnDriveMinutes: 0,
      finishTime: startTime.toISOString(),
      provider: 'heuristic',
      warnings: [],
    };
  }

  const points: LatLng[] = [start, ...stops.map((s) => ({ lat: s.lat, lng: s.lng }))];
  const { minutes, km, provider } = await buildMatrix(points, startTime);

  // indices 1..n correspond to stops[0..n-1]
  let order: number[];
  if (input.lockOrder) {
    order = stops.map((_, i) => i + 1);
  } else {
    order = nearestNeighbor(minutes, stops.length);
    order = twoOpt(order, (ord) => evaluate(ord, input, minutes, km, returnToStart).cost);
  }

  const { timeline } = evaluate(order, input, minutes, km, returnToStart);

  const routeStops: RouteStop[] = order.map((pointIdx, k) => {
    const s = stops[pointIdx - 1];
    return {
      jobId: s.jobId,
      projectId: s.projectId,
      projectName: s.projectName,
      unit: s.unit,
      scopeCode: s.scopeCode,
      lat: s.lat,
      lng: s.lng,
      estMinutes: s.estMinutes,
      sequence: k + 1,
      etaArrive: timeline.arrive[k].toISOString(),
      etaDepart: timeline.depart[k].toISOString(),
      driveMinutesFromPrev: timeline.legs[k].minutes,
      driveKmFromPrev: timeline.legs[k].km,
    };
  });

  const totalService = stops.reduce((a, s) => a + s.estMinutes, 0);
  const finish = returnToStart
    ? addMin(timeline.depart[timeline.depart.length - 1], timeline.returnLeg.minutes)
    : timeline.depart[timeline.depart.length - 1];

  const warnings = buildWarnings(input, routeStops, finish, startTime, workdayMinutes, provider);

  return {
    employeeId: null,
    date: toDateStr(startTime),
    startLocation: start,
    startTime: startTime.toISOString(),
    stops: routeStops,
    totalDriveMinutes: round1(timeline.totalDrive + (returnToStart ? timeline.returnLeg.minutes : 0)),
    totalServiceMinutes: totalService,
    totalKm: round1(timeline.totalKm + (returnToStart ? timeline.returnLeg.km : 0)),
    returnDriveMinutes: returnToStart ? timeline.returnLeg.minutes : 0,
    finishTime: finish.toISOString(),
    provider,
    warnings,
  };
}

/** Walk the order, accumulating time-of-day-accurate legs + service time. */
function evaluate(
  order: number[],
  input: OptInput,
  matMin: number[][],
  matKm: number[][],
  returnToStart: boolean,
): { cost: number; timeline: Timeline } {
  const { start, startTime, stops } = input;
  const legs: { minutes: number; km: number }[] = [];
  const arrive: Date[] = [];
  const depart: Date[] = [];
  let cur = new Date(startTime);
  let prevPoint: LatLng = start;
  let totalDrive = 0;
  let totalKm = 0;
  let penalty = 0;

  for (let k = 0; k < order.length; k++) {
    const s = stops[order[k] - 1];
    const leg = legAt(prevPoint, { lat: s.lat, lng: s.lng }, cur, order, k, matMin, matKm);
    legs.push(leg);
    totalDrive += leg.minutes;
    totalKm += leg.km;
    const arr = addMin(cur, leg.minutes);
    // time window handling
    let effArr = arr;
    if (s.windowStart) {
      const ws = atTime(arr, s.windowStart);
      if (arr < ws) effArr = ws; // wait until window opens (no penalty, just idle)
    }
    if (s.windowEnd) {
      const we = atTime(arr, s.windowEnd);
      if (effArr > we) penalty += (effArr.getTime() - we.getTime()) / 60000; // minutes late
    }
    arrive.push(effArr);
    const dep = addMin(effArr, s.estMinutes);
    depart.push(dep);
    cur = dep;
    prevPoint = { lat: s.lat, lng: s.lng };
  }

  let returnLeg = { minutes: 0, km: 0 };
  if (returnToStart) {
    returnLeg = legAt(prevPoint, start, cur, order, order.length, matMin, matKm);
    totalDrive += returnLeg.minutes;
    totalKm += returnLeg.km;
  }

  // objective: total drive time + window penalties (heavy)
  const cost = totalDrive + penalty * 5;
  return { cost, timeline: { totalDrive, totalKm, penalty, legs, arrive, depart, returnLeg } };
}

/** Use traffic-aware matrix value, but for the heuristic provider recompute the
 *  leg at the actual departure time so AM/PM peaks shift ETAs realistically. */
function legAt(
  from: LatLng,
  to: LatLng,
  departAt: Date,
  order: number[],
  k: number,
  matMin: number[][],
  matKm: number[][],
): { minutes: number; km: number } {
  const useHeuristicRecalc = process.env.GOOGLE_MAPS_API_KEY ? false : true;
  if (useHeuristicRecalc) return heuristicLeg(from, to, departAt);
  // google matrix indices: 0 = start, stop i -> point i
  const fromIdx = k === 0 ? 0 : order[k - 1];
  const toIdx = k < order.length ? order[k] : 0;
  return { minutes: matMin[fromIdx][toIdx], km: matKm[fromIdx][toIdx] };
}

function nearestNeighbor(mat: number[][], n: number): number[] {
  const visited = new Set<number>();
  const order: number[] = [];
  let cur = 0; // start
  for (let step = 0; step < n; step++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 1; j <= n; j++) {
      if (visited.has(j)) continue;
      if (mat[cur][j] < bestD) {
        bestD = mat[cur][j];
        best = j;
      }
    }
    visited.add(best);
    order.push(best);
    cur = best;
  }
  return order;
}

function twoOpt(order: number[], cost: (o: number[]) => number): number[] {
  let best = order.slice();
  let bestCost = cost(best);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const c = cost(candidate);
        if (c < bestCost - 1e-6) {
          best = candidate;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return best;
}

function buildWarnings(
  input: OptInput,
  stops: RouteStop[],
  finish: Date,
  startTime: Date,
  workdayMinutes: number,
  provider: ProviderName,
): string[] {
  const w: string[] = [];
  const elapsed = (finish.getTime() - startTime.getTime()) / 60000;
  if (elapsed > workdayMinutes) {
    w.push(
      `Day runs ~${fmtHrs(elapsed)} (over the ${fmtHrs(workdayMinutes)} target). Consider moving ${
        stops.length > 1 ? 'a stop' : 'the stop'
      } to another day or tech.`,
    );
  }
  input.stops.forEach((s) => {
    if (!s.windowEnd) return;
    const rs = stops.find((x) => x.jobId === s.jobId);
    if (!rs) return;
    const arr = new Date(rs.etaArrive);
    if (arr > atTime(arr, s.windowEnd)) {
      w.push(`${s.projectName} (${s.unit}) is projected to arrive after its ${s.windowEnd} window.`);
    }
  });
  if (provider === 'heuristic') {
    w.push('Drive times are estimates (no Google Maps key configured). Add a key for live traffic.');
  }
  return w;
}

// ---- small date helpers ----
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
function atTime(ref: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(ref);
  d.setHours(h, m ?? 0, 0, 0);
  return d;
}
const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtHrs = (min: number) => `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;

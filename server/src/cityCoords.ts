/** Approximate centroids for WA cities/areas in the field-measure territory.
 *  Used as a geocoding fallback so the map + routing work with no API key. */
export const CITY_COORDS: Record<string, [number, number]> = {
  seattle: [47.6062, -122.3321], kirkland: [47.6769, -122.206], ellensburg: [46.9965, -120.5478],
  redmond: [47.674, -122.1215], shoreline: [47.7557, -122.3415], 'pt orchard': [47.5404, -122.6362],
  'port orchard': [47.5404, -122.6362], tacoma: [47.2529, -122.4443], lynnwood: [47.8279, -122.3054],
  arlington: [48.1987, -122.1251], woodinville: [47.7543, -122.1635], silverdale: [47.6448, -122.6949],
  bellevue: [47.6101, -122.2015], tukwila: [47.4738, -122.2606], marysville: [48.0518, -122.1771],
  kennewick: [46.2112, -119.1372], fife: [47.2393, -122.3573], lakewood: [47.1718, -122.5185],
  belfair: [47.4515, -122.8268], interbay: [47.647, -122.38], bremerton: [47.5673, -122.6326],
  burlington: [48.4759, -122.3254], bothell: [47.7623, -122.2054], olympia: [47.0379, -122.9007],
  lynden: [48.9466, -122.4521], renton: [47.4829, -122.2171], 'walla walla': [46.0646, -118.343],
  lacey: [47.0343, -122.8232], 'mercer island': [47.5707, -122.2221], 'bonney lake': [47.1773, -122.1865],
  tumwater: [47.0073, -122.9093], puyallup: [47.1854, -122.2929], burien: [47.4704, -122.3468],
  othello: [46.8257, -119.1748], everett: [47.979, -122.2021], auburn: [47.3073, -122.2285],
  seatac: [47.4436, -122.3016], yelm: [46.9426, -122.6059], 'ocean shores': [46.9737, -124.1563],
  poulsbo: [47.7362, -122.6465], 'federal way': [47.3223, -122.3126], snohomish: [47.9129, -122.0982],
  'north bend': [47.4954, -121.7868], quincy: [47.2343, -119.8526], bellingham: [48.7519, -122.4787],
  covington: [47.359, -122.1218], spanaway: [47.1043, -122.4343], kent: [47.3809, -122.2348],
  'lake stevens': [48.0151, -122.0635], 'moses lake': [47.1301, -119.2781], monroe: [47.8554, -121.9715],
  buckley: [47.1632, -122.0268], shelton: [47.2151, -123.1007], orting: [47.0976, -122.2043],
  sultan: [47.8612, -121.8157], wenatchee: [47.4235, -120.3103], issaquah: [47.5301, -122.0326],
  sammamish: [47.6163, -122.0356], edmonds: [47.8107, -122.3774], sumner: [47.2032, -122.2407],
};

export function cityFromText(text: string): string | null {
  const t = text.toLowerCase();
  for (const city of Object.keys(CITY_COORDS)) {
    if (t.includes(city)) return city;
  }
  return null;
}

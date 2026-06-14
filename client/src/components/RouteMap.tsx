import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { RoutePlan } from '../types';

function numberedIcon(n: number | string, color: string): L.DivIcon {
  return L.divIcon({
    className: 'route-pin',
    html: `<div style="background:${color}"><span>${n}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
}
const officeIcon = L.divIcon({
  className: 'route-pin',
  html: `<div style="background:#0f172a"><span>⌂</span></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -24],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 12);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [JSON.stringify(points), map]);
  return null;
}

export function RouteMap({
  plan,
  color = '#2563eb',
  height = 420,
}: {
  plan: RoutePlan | null;
  color?: string;
  height?: number;
}) {
  const start = plan?.startLocation;
  const stops = plan?.stops ?? [];
  const points: [number, number][] = [];
  if (start) points.push([start.lat, start.lng]);
  stops.forEach((s) => points.push([s.lat, s.lng]));

  const line: [number, number][] = [];
  if (start) line.push([start.lat, start.lng]);
  stops.forEach((s) => line.push([s.lat, s.lng]));
  if (start && plan?.returnDriveMinutes) line.push([start.lat, start.lng]);

  const center: [number, number] = start ? [start.lat, start.lng] : [47.6062, -122.3321];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200" style={{ height }}>
      <MapContainer center={center} zoom={10} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {line.length > 1 && (
          <Polyline positions={line} pathOptions={{ color, weight: 4, opacity: 0.7, dashArray: '1 8' }} />
        )}
        {start && (
          <Marker position={[start.lat, start.lng]} icon={officeIcon}>
            <Popup>
              <strong>{start.name}</strong>
              <br />
              Start / return point
            </Popup>
          </Marker>
        )}
        {stops.map((s) => (
          <Marker key={s.jobId} position={[s.lat, s.lng]} icon={numberedIcon(s.sequence, color)}>
            <Popup>
              <strong>
                #{s.sequence} · {s.projectName}
              </strong>
              <br />
              {s.unit}
              <br />
              Arrive {new Date(s.etaArrive).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ·{' '}
              {s.scopeCode}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

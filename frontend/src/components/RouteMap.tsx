/**
 * RouteMap — Leaflet-based Indian Railways Geographic & Topological Network Map.
 * Renders electrified railway track sections, junction pins, speed restrictions,
 * and live train markers with delay status.
 */
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Station, RouteSection, OperationalEvent } from '../types';
import { formatDelay } from '../api';

interface Props {
  stations: Station[];
  sections?: RouteSection[];
  activeEvents?: OperationalEvent[];
  trainLat?: number;
  trainLon?: number;
  trainNumber?: string;
  delayMin?: number;
  speedKmh?: number;
  onSelectStation?: (st: Station) => void;
  onSelectSection?: (sec: RouteSection) => void;
}

// Fix Leaflet default icon asset resolution
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function RouteMap({
  stations,
  sections = [],
  activeEvents = [],
  trainLat,
  trainLon,
  trainNumber,
  delayMin,
  speedKmh,
  onSelectStation,
  onSelectSection,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const trainMarkerRef = useRef<L.Marker | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [24.8, 75.0],
      zoom: 6,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        maxZoom: 18,
        subdomains: 'abcd',
      }
    ).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layersGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render Tracks & Stations
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layersGroupRef.current;
    if (!map || !layerGroup || stations.length === 0) return;

    layerGroup.clearLayers();

    // Map restricted sections
    const restrictedSectionIds = new Set(
      activeEvents
        .filter(e => e.event_type === 'SPEED_RESTRICTION' && e.section_id)
        .map(e => e.section_id)
    );

    // Render Track Polyline
    const coordinates = stations.map(s => [s.latitude, s.longitude] as [number, number]);

    // Base railway casing (dark double track line)
    L.polyline(coordinates, {
      color: '#1e293b',
      weight: 6,
      opacity: 0.9,
    }).addTo(layerGroup);

    // Active track line (electrified indigo/azure line)
    L.polyline(coordinates, {
      color: '#38bdf8',
      weight: 3,
      opacity: 0.8,
      dashArray: '8, 6',
    }).addTo(layerGroup);

    // Highlight restricted segments if any
    if (sections.length > 0 && restrictedSectionIds.size > 0) {
      sections.forEach(sec => {
        if (restrictedSectionIds.has(sec.id) && sec.from_station && sec.to_station) {
          L.polyline(
            [
              [sec.from_station.latitude, sec.from_station.longitude],
              [sec.to_station.latitude, sec.to_station.longitude],
            ],
            {
              color: '#f59e0b',
              weight: 5,
              opacity: 0.95,
              dashArray: '4, 4',
            }
          ).addTo(layerGroup);
        }
      });
    }

    // Render Station Markers
    stations.forEach(s => {
      const isJunction = s.is_junction;
      const markerHtml = `
        <div style="
          width: ${isJunction ? '16px' : '10px'};
          height: ${isJunction ? '16px' : '10px'};
          background-color: ${isJunction ? '#38bdf8' : '#64748b'};
          border: 2px solid #090c12;
          border-radius: 50%;
          box-shadow: 0 0 6px ${isJunction ? 'rgba(56, 189, 248, 0.8)' : 'rgba(0,0,0,0.5)'};
        "></div>
      `;

      const icon = L.divIcon({
        className: 'station-div-icon',
        html: markerHtml,
        iconSize: [isJunction ? 16 : 10, isJunction ? 16 : 10],
        iconAnchor: [isJunction ? 8 : 5, isJunction ? 8 : 5],
      });

      const marker = L.marker([s.latitude, s.longitude], { icon }).addTo(layerGroup);

      marker.bindPopup(`
        <div style="font-family: var(--font-sans); color: #0f172a; padding: 4px;">
          <div style="font-weight: 800; font-size: 13px;">${s.name} (${s.code})</div>
          <div style="font-size: 11px; color: #475569;">Zone: ${s.zone || 'NR'} ${s.is_junction ? '· Railway Junction' : ''}</div>
          <div style="font-size: 11px; color: #475569;">Lat/Lon: ${s.latitude.toFixed(3)}, ${s.longitude.toFixed(3)}</div>
        </div>
      `);

      if (onSelectStation) {
        marker.on('click', () => onSelectStation(s));
      }
    });

    map.fitBounds(L.latLngBounds(coordinates), { padding: [30, 30] });
  }, [stations, sections, activeEvents, onSelectStation]);

  // Update Train Position Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || trainLat === undefined || trainLon === undefined) return;

    const delay = delayMin ?? 0;
    const color = delay <= 0 ? '#10b981' : delay < 15 ? '#f59e0b' : '#ef4444';

    const trainHtml = `
      <div style="
        width: 26px;
        height: 26px;
        background-color: ${color};
        border: 2px solid #ffffff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        box-shadow: 0 0 14px ${color};
        cursor: pointer;
      ">🚆</div>
    `;

    const icon = L.divIcon({
      className: 'train-live-icon',
      html: trainHtml,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

    if (trainMarkerRef.current) {
      trainMarkerRef.current.setLatLng([trainLat, trainLon]);
      trainMarkerRef.current.setIcon(icon);
    } else {
      trainMarkerRef.current = L.marker([trainLat, trainLon], { icon }).addTo(map);
    }

    trainMarkerRef.current.bindPopup(`
      <div style="font-family: var(--font-sans); color: #0f172a; padding: 4px;">
        <div style="font-weight: 800; font-size: 13px;">Train #${trainNumber || 'Active Run'}</div>
        <div style="font-size: 11px; font-weight: 700; color: ${color};">Delay: ${formatDelay(delay)}</div>
        <div style="font-size: 11px; color: #475569;">Speed: ${speedKmh?.toFixed(0) ?? '—'} km/h</div>
      </div>
    `);
  }, [trainLat, trainLon, delayMin, speedKmh, trainNumber]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', height: 420 }}>
      <div
        ref={mapContainerRef}
        style={{ width: '100%', height: '100%', background: '#090c12' }}
      />
    </div>
  );
}

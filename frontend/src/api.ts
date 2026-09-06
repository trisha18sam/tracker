/* API and WebSocket utility functions */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE  = BASE_URL.replace(/^http/, 'ws');

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${path}: ${res.status} ${err}`);
  }
  return res.json();
}

export const api = {
  getTrains:            () => apiFetch<import('./types').Train[]>('/trains'),
  searchTrains:         (q: string, from_station?: string, to_station?: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (from_station) params.set('from_station', from_station);
    if (to_station) params.set('to_station', to_station);
    return apiFetch<{ provenance: any; query: string; count: number; trains: any[] }>(`/trains/search?${params.toString()}`);
  },
  getTrain:             (id: number) => apiFetch<import('./types').TrainDetail>(`/trains/${id}`),
  getTrainLive:         (id: number) => apiFetch<import('./types').TrainLive>(`/trains/${id}/live`),
  getTrainPredictions:  (id: number) => apiFetch<import('./types').TrainPredictions>(`/trains/${id}/predictions`),
  getStations:          () => apiFetch<import('./types').Station[]>('/stations'),
  searchStations:       (q: string, limit: number = 20) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('limit', String(limit));
    return apiFetch<{ provenance: any; query: string; count: number; stations: import('./types').Station[] }>(`/stations/search?${params.toString()}`);
  },
  getRoute:             () => apiFetch<import('./types').Route>(`/routes/1`),

  getActiveRuns:        () => apiFetch<import('./types').ActiveRunSummary[]>('/analytics/active-runs'),
  getModelPerformance:  () => apiFetch<import('./types').ModelPerformance>('/analytics/model-performance'),
  getSectionBottlenecks:() => apiFetch<import('./types').SectionBottleneck[]>('/analytics/section-bottlenecks'),
  getPredictionVsReality:() => apiFetch<import('./types').PredictionVsReality[]>('/analytics/prediction-vs-reality'),
  getNetworkImpact:     (runId: number) => apiFetch<import('./types').NetworkImpact>(`/analytics/network-impact/${runId}`),
  getPredictionsByRun:  (runId: number) => apiFetch<import('./types').TrainPredictions>(`/predictions/${runId}`),
  postTelemetry:        (payload: unknown) => apiFetch('/telemetry', { method: 'POST', body: JSON.stringify(payload) }),
  startSimulation:      (payload: unknown) => apiFetch('/simulation/start', { method: 'POST', body: JSON.stringify(payload) }),
  injectEvent:          (payload: unknown) => apiFetch('/simulation/events', { method: 'POST', body: JSON.stringify(payload) }),
  clearEvent:           (id: number) => apiFetch(`/simulation/events/${id}`, { method: 'DELETE' }),

  /* Last-Minute Seat Finder */
  searchSeats: (params: { from_station_id: number; to_station_id: number; travel_date?: string; coach_class?: string; berth_type?: string }) => {
    const query = new URLSearchParams();
    query.set('from_station_id', String(params.from_station_id));
    query.set('to_station_id', String(params.to_station_id));
    if (params.travel_date) query.set('travel_date', params.travel_date);
    if (params.coach_class) query.set('coach_class', params.coach_class);
    if (params.berth_type) query.set('berth_type', params.berth_type);
    return apiFetch<import('./types').SeatSearchResult[]>(`/seats/search?${query.toString()}`);
  },
  getLastMinuteSeats: (params?: { from_station_id?: number; hours_ahead?: number }) => {
    const query = new URLSearchParams();
    if (params?.from_station_id) query.set('from_station_id', String(params.from_station_id));
    if (params?.hours_ahead) query.set('hours_ahead', String(params.hours_ahead));
    return apiFetch<import('./types').SeatSearchResult[]>(`/seats/last-minute?${query.toString()}`);
  },
  getTrainCoaches: (trainId: number) =>
    apiFetch<import('./types').CoachBrief[]>(`/seats/train/${trainId}/coaches`),
  getCoachMap: (trainId: number, coachId: number, params: { from_station_id: number; to_station_id: number; run_id?: number }) => {
    const query = new URLSearchParams();
    query.set('from_station_id', String(params.from_station_id));
    query.set('to_station_id', String(params.to_station_id));
    if (params.run_id) query.set('run_id', String(params.run_id));
    return apiFetch<import('./types').CoachMap>(`/seats/train/${trainId}/coach/${coachId}/map?${query.toString()}`);
  },
  watchSeat: (payload: { session_token: string; train_id: number; from_station_id: number; to_station_id: number; travel_date?: string; preferred_class?: string; preferred_berth?: string }) =>
    apiFetch<import('./types').SeatWatch>('/seats/watch', { method: 'POST', body: JSON.stringify(payload) }),
  getSeatWatches: (sessionToken: string) =>
    apiFetch<import('./types').SeatWatch[]>(`/seats/watch/${sessionToken}`),
  deleteSeatWatch: (watchId: number) =>
    apiFetch<{ message: string }>(`/seats/watch/${watchId}`, { method: 'DELETE' }),
  simulateSeatEvent: (payload: { train_run_id: number; coach_code: string; seat_number: number; event_type: string }) =>
    apiFetch<{ message: string; event: unknown }>('/seats/simulate-event', { method: 'POST', body: JSON.stringify(payload) }),
  getSeatOperationsAnalytics: () =>
    apiFetch<import('./types').SeatOperationsAnalytics>('/seats/operations-analytics'),

  /* Pantry & Onboard Catering */
  getPantryMenu: (trainNumber?: string, stationCode?: string) => {
    const query = new URLSearchParams();
    if (trainNumber) query.set('train_number', trainNumber);
    if (stationCode) query.set('station_code', stationCode);
    return apiFetch<{
      provenance: any;
      official_tariff_source?: string;
      vendors?: any[];
      items: any[];
      categories: Record<string, any[]>;
      total_items: number;
    }>(`/pantry/menu?${query.toString()}`);
  },
  createPantryOrder: (payload: unknown) =>
    apiFetch<any>('/pantry/order', { method: 'POST', body: JSON.stringify(payload) }),
};


export function connectRunWS(
  runId: number,
  onMessage: (msg: import('./types').WsPredictionUpdate) => void,
  onClose?: () => void,
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws/predictions/${runId}`);
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch (_) {}
  };
  ws.onclose = onClose ?? (() => {});
  return ws;
}

export function connectDashboardWS(
  onMessage: (msg: import('./types').WsDashboardUpdate) => void,
  onClose?: () => void,
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws/dashboard`);
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch (_) {}
  };
  ws.onclose = onClose ?? (() => {});
  return ws;
}

/* Formatting helpers */
export function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDelay(min: number): string {
  if (Math.abs(min) < 1) return 'On time';
  return min > 0 ? `+${min.toFixed(0)} min` : `${min.toFixed(0)} min`;
}

export function delayClass(min: number): string {
  if (min <= 0)   return 'early';
  if (min < 5)    return 'ontime';
  if (min < 20)   return 'moderate';
  return 'severe';
}

export function confidenceColor(score?: number): string {
  if (!score) return '#8b5cf6';
  if (score > 0.8) return '#10b981';
  if (score > 0.6) return '#f59e0b';
  return '#ef4444';
}

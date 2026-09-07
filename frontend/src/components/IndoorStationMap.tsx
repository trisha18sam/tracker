import React, { useState, useMemo } from 'react';

interface IndoorStationMapProps {
  stationCode: string;
  stationName: string;
}

interface GraphNode {
  id: string;
  label: string;
  category: 'ENTRY' | 'PLATFORM' | 'FOB' | 'AMENITY' | 'EXIT';
  platform?: string;
  icon: string;
  description?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  distMeters: number;
  accessible: boolean; // Step-free (lift / ramp / flat ground)
  instruction: string;
}

interface AmenityPoint {
  id: string;
  name: string;
  category: 'FOOD' | 'WAITING' | 'ACCESSIBILITY' | 'EXIT' | 'TICKETING' | 'MEDICAL';
  platform: string;
  locationLabel: string;
  nodeId: string;
  icon: string;
}

export const IndoorStationMap: React.FC<IndoorStationMapProps> = ({ stationCode, stationName }) => {
  const isJaipur = stationCode.toUpperCase() === 'JP';

  // Navigation state
  const [startNodeId, setStartNodeId] = useState<string>(isJaipur ? 'entry_city' : 'entry_paharganj');
  const [targetNodeId, setTargetNodeId] = useState<string>(isJaipur ? 'food_plaza' : 'food_ndls');
  const [accessibleOnly, setAccessibleOnly] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');

  // Jaipur Junction Nodes
  const jpNodes: GraphNode[] = [
    { id: 'entry_city', label: 'Main City Entrance (South)', category: 'ENTRY', platform: 'PF 1 Side', icon: '🏛️' },
    { id: 'entry_hasanpura', label: 'Hasanpura 2nd Entrance (North)', category: 'ENTRY', platform: 'PF 7 Side', icon: '🚪' },
    { id: 'pf1', label: 'Platform 1 (Main Concourse)', category: 'PLATFORM', platform: 'PF 1', icon: '🚆' },
    { id: 'pf2_3', label: 'Platforms 2 & 3 Island', category: 'PLATFORM', platform: 'PF 2/3', icon: '🚆' },
    { id: 'pf4_5', label: 'Platforms 4 & 5 Island', category: 'PLATFORM', platform: 'PF 4/5', icon: '🚆' },
    { id: 'pf6_7', label: 'Platforms 6 & 7 Island', category: 'PLATFORM', platform: 'PF 6/7', icon: '🚆' },
    { id: 'fob1_bridge', label: 'North Foot Overbridge (FOB 1) Walkway', category: 'FOB', icon: '🌉' },
    { id: 'fob2_bridge', label: 'South Foot Overbridge (FOB 2) Walkway', category: 'FOB', icon: '🌉' },
    { id: 'lounge', label: 'Executive Waiting Lounge (AC)', category: 'AMENITY', platform: 'PF 1', icon: '🛋️' },
    { id: 'food_plaza', label: 'IRCTC Food Plaza & Refreshments', category: 'AMENITY', platform: 'PF 1', icon: '🍱' },
    { id: 'jan_aahar', label: 'Jan Aahaar Budget Cafeteria', category: 'AMENITY', platform: 'PF 3', icon: '🍲' },
    { id: 'wheelchair_desk', label: 'Divyangjan Accessible Helpdesk & Ramps', category: 'AMENITY', platform: 'PF 1 Porch', icon: '♿' },
    { id: 'medical_booth', label: '24/7 Railway Medical Booth', category: 'AMENITY', platform: 'PF 1', icon: '🏥' },
    { id: 'cloak_room', label: 'Cloak Room & Luggage Locker', category: 'AMENITY', platform: 'PF 1 Concourse', icon: '🧳' },
    { id: 'ticket_counter', label: 'UTS / PRS Ticketing Hall', category: 'AMENITY', platform: 'PF 1 Entry', icon: '🎫' },
    { id: 'taxi_stand', label: 'Prepaid Taxi & Auto Stand', category: 'EXIT', platform: 'City Porch', icon: '🚕' },
  ];

  // Jaipur Junction Edges
  const jpEdges: GraphEdge[] = [
    // Entry connections
    { from: 'entry_city', to: 'pf1', distMeters: 25, accessible: true, instruction: 'Walk through Main City Gate ramp to Platform 1 Concourse' },
    { from: 'entry_city', to: 'ticket_counter', distMeters: 15, accessible: true, instruction: 'Turn left into the UTS/PRS Ticketing Hall' },
    { from: 'entry_city', to: 'wheelchair_desk', distMeters: 20, accessible: true, instruction: 'Proceed 20m along Main Porch to Wheelchair Assistance Desk' },
    { from: 'entry_city', to: 'taxi_stand', distMeters: 30, accessible: true, instruction: 'Walk out to the Prepaid Taxi/Auto booth' },

    // PF 1 Amenities
    { from: 'pf1', to: 'lounge', distMeters: 40, accessible: true, instruction: 'Walk north along Platform 1 to Executive Lounge' },
    { from: 'pf1', to: 'food_plaza', distMeters: 50, accessible: true, instruction: 'Walk 50m past waiting hall to IRCTC Food Plaza' },
    { from: 'pf1', to: 'medical_booth', distMeters: 35, accessible: true, instruction: 'Locate 24/7 Medical Emergency room near Station Supt. office' },
    { from: 'pf1', to: 'cloak_room', distMeters: 45, accessible: true, instruction: 'Walk towards parcel wing for Cloak Room' },

    // FOB 1 (North FOB) - Has Lifts on all platforms (Accessible!)
    { from: 'pf1', to: 'fob1_bridge', distMeters: 30, accessible: true, instruction: 'Take Lift L-1 (or North FOB stairs) up to FOB-1 Walkway' },
    { from: 'fob1_bridge', to: 'pf2_3', distMeters: 40, accessible: true, instruction: 'Cross FOB-1 and take Lift L-2 (or stairs) down to Platforms 2 & 3' },
    { from: 'fob1_bridge', to: 'pf4_5', distMeters: 65, accessible: true, instruction: 'Cross FOB-1 and take Lift L-3 (or stairs) down to Platforms 4 & 5' },
    { from: 'fob1_bridge', to: 'pf6_7', distMeters: 90, accessible: true, instruction: 'Cross FOB-1 and take Lift L-4 (or stairs) down to Platforms 6 & 7' },

    // FOB 2 (South FOB) - Escalators and Stairs (Not step-free for wheelchairs)
    { from: 'pf1', to: 'fob2_bridge', distMeters: 35, accessible: false, instruction: 'Take South FOB Escalator / Stairs up to FOB-2 Walkway' },
    { from: 'fob2_bridge', to: 'pf2_3', distMeters: 45, accessible: false, instruction: 'Take South FOB Escalator / Stairs down to Platforms 2 & 3' },
    { from: 'fob2_bridge', to: 'pf4_5', distMeters: 70, accessible: false, instruction: 'Take South FOB Escalator / Stairs down to Platforms 4 & 5' },
    { from: 'fob2_bridge', to: 'pf6_7', distMeters: 95, accessible: false, instruction: 'Take South FOB Escalator / Stairs down to Platforms 6 & 7' },

    // Island amenities
    { from: 'pf2_3', to: 'jan_aahar', distMeters: 20, accessible: true, instruction: 'Walk along Platform 3 middle bay to Jan Aahaar Cafeteria' },

    // Hasanpura 2nd Entrance
    { from: 'pf6_7', to: 'entry_hasanpura', distMeters: 35, accessible: true, instruction: 'Exit via Hasanpura 2nd Entry concourse' },
  ];

  // NDLS fallback nodes & edges
  const ndlsNodes: GraphNode[] = [
    { id: 'entry_paharganj', label: 'Paharganj Main Entry (PF 1)', category: 'ENTRY', platform: 'PF 1', icon: '🏛️' },
    { id: 'entry_ajmeri', label: 'Ajmeri Gate Entry & Metro (PF 16)', category: 'ENTRY', platform: 'PF 16', icon: '🚇' },
    { id: 'pf1_ndls', label: 'Platform 1 (VIP Concourse)', category: 'PLATFORM', platform: 'PF 1', icon: '🚆' },
    { id: 'pf2_3_ndls', label: 'Platform 2 & 3', category: 'PLATFORM', platform: 'PF 2/3', icon: '🚆' },
    { id: 'pf15_16_ndls', label: 'Platform 15 & 16', category: 'PLATFORM', platform: 'PF 15/16', icon: '🚆' },
    { id: 'fob_ndls', label: 'Central Foot Over Bridge (FOB 2)', category: 'FOB', icon: '🌉' },
    { id: 'food_ndls', label: 'IRCTC Food Plaza (Gate 2)', category: 'AMENITY', platform: 'PF 1', icon: '🍱' },
    { id: 'lounge_ndls', label: 'Executive AC Lounge', category: 'AMENITY', platform: 'PF 1', icon: '🛋️' },
    { id: 'wheelchair_ndls', label: 'Wheelchair & Battery Cart Helpdesk', category: 'AMENITY', platform: 'PF 1', icon: '♿' },
  ];

  const ndlsEdges: GraphEdge[] = [
    { from: 'entry_paharganj', to: 'pf1_ndls', distMeters: 20, accessible: true, instruction: 'Walk through Main Concourse to Platform 1' },
    { from: 'pf1_ndls', to: 'food_ndls', distMeters: 30, accessible: true, instruction: 'Walk 30m south to IRCTC Food Plaza' },
    { from: 'pf1_ndls', to: 'lounge_ndls', distMeters: 40, accessible: true, instruction: 'Walk north to Executive AC Lounge' },
    { from: 'pf1_ndls', to: 'wheelchair_ndls', distMeters: 15, accessible: true, instruction: 'Visit Wheelchair Helpdesk near Gate 1' },
    { from: 'pf1_ndls', to: 'fob_ndls', distMeters: 35, accessible: true, instruction: 'Take Lift to Central FOB 2' },
    { from: 'fob_ndls', to: 'pf2_3_ndls', distMeters: 40, accessible: true, instruction: 'Take Lift down to Platform 2/3' },
    { from: 'fob_ndls', to: 'pf15_16_ndls', distMeters: 120, accessible: true, instruction: 'Walk along Central FOB to Platform 15/16 Lift' },
    { from: 'pf15_16_ndls', to: 'entry_ajmeri', distMeters: 30, accessible: true, instruction: 'Walk towards Ajmeri Gate Skywalk & Airport Metro' },
  ];

  const nodes = isJaipur ? jpNodes : ndlsNodes;
  const edges = isJaipur ? jpEdges : ndlsEdges;

  // Amenities list for quick search / filter
  const amenities: AmenityPoint[] = isJaipur ? [
    { id: '1', name: 'IRCTC Executive Waiting Lounge (AC)', category: 'WAITING', platform: 'PF 1', locationLabel: 'Main Concourse North', nodeId: 'lounge', icon: '🛋️' },
    { id: '2', name: 'IRCTC Food Plaza & Multi-Cuisine', category: 'FOOD', platform: 'PF 1', locationLabel: 'Near Gate 2 Concourse', nodeId: 'food_plaza', icon: '🍱' },
    { id: '3', name: 'Divyangjan Accessible Helpdesk & Ramps', category: 'ACCESSIBILITY', platform: 'PF 1 Porch', locationLabel: 'Main City Entrance Ramp', nodeId: 'wheelchair_desk', icon: '♿' },
    { id: '4', name: 'North FOB Lift System (All Platforms)', category: 'ACCESSIBILITY', platform: 'PF 1 to 7', locationLabel: 'North FOB Overbridge', nodeId: 'fob1_bridge', icon: '🛗' },
    { id: '5', name: 'Jan Aahaar Budget Cafeteria', category: 'FOOD', platform: 'PF 3', locationLabel: 'Platform 3 Central Island', nodeId: 'jan_aahar', icon: '🍲' },
    { id: '6', name: '24/7 Railway Medical Booth', category: 'MEDICAL', platform: 'PF 1', locationLabel: 'Adjacent to Station Supt.', nodeId: 'medical_booth', icon: '🏥' },
    { id: '7', name: 'Cloak Room & Luggage Locker', category: 'WAITING', platform: 'PF 1', locationLabel: 'Parcel Wing West', nodeId: 'cloak_room', icon: '🧳' },
    { id: '8', name: 'UTS / PRS Ticketing Hall', category: 'TICKETING', platform: 'Entry Hall', locationLabel: 'Main Entrance Hall', nodeId: 'ticket_counter', icon: '🎫' },
    { id: '9', name: 'Hasanpura 2nd Entrance', category: 'EXIT', platform: 'PF 7', locationLabel: 'Hasanpura North Concourse', nodeId: 'entry_hasanpura', icon: '🚪' },
    { id: '10', name: 'Prepaid Taxi & Auto Stand', category: 'EXIT', platform: 'City Porch', locationLabel: 'South Portico', nodeId: 'taxi_stand', icon: '🚕' },
  ] : [
    { id: '1', name: 'Executive Waiting Lounge (AC)', category: 'WAITING', platform: 'PF 1', locationLabel: 'Main Concourse North', nodeId: 'lounge_ndls', icon: '🛋️' },
    { id: '2', name: 'IRCTC Food Plaza & Jan Aahaar', category: 'FOOD', platform: 'PF 1', locationLabel: 'Near Gate 2 Exit', nodeId: 'food_ndls', icon: '🍱' },
    { id: '3', name: 'Wheelchair Assistance & Battery Cart', category: 'ACCESSIBILITY', platform: 'PF 1', locationLabel: 'Chief Booking Supervisor Office', nodeId: 'wheelchair_ndls', icon: '♿' },
    { id: '4', name: 'Metro Airport Line Direct FOB', category: 'EXIT', platform: 'PF 16 FOB', locationLabel: 'Ajmeri Gate Skywalk', nodeId: 'entry_ajmeri', icon: '🚇' },
  ];

  // Dijkstra Shortest Path Calculation
  const pathResult = useMemo(() => {
    if (startNodeId === targetNodeId) {
      return { totalDistance: 0, walkingTimeMin: 0, steps: ['You are already at your destination.'], pathNodes: [startNodeId] };
    }

    // Build adjacency graph
    const adj: Record<string, { to: string; dist: number; instruction: string; accessible: boolean }[]> = {};
    nodes.forEach(n => { adj[n.id] = []; });

    edges.forEach(e => {
      if (accessibleOnly && !e.accessible) return; // Skip non-step-free edges when accessible mode is ON
      if (adj[e.from]) adj[e.from].push({ to: e.to, dist: e.distMeters, instruction: e.instruction, accessible: e.accessible });
      if (adj[e.to]) adj[e.to].push({ to: e.from, dist: e.distMeters, instruction: e.instruction, accessible: e.accessible });
    });

    const distances: Record<string, number> = {};
    const previous: Record<string, { node: string; instruction: string; dist: number } | null> = {};
    const unvisited = new Set<string>();

    nodes.forEach(n => {
      distances[n.id] = Infinity;
      previous[n.id] = null;
      unvisited.add(n.id);
    });

    distances[startNodeId] = 0;

    while (unvisited.size > 0) {
      // Pick unvisited node with smallest distance
      let current: string | null = null;
      let smallestDist = Infinity;
      for (const node of unvisited) {
        if (distances[node] < smallestDist) {
          smallestDist = distances[node];
          current = node;
        }
      }

      if (!current || smallestDist === Infinity || current === targetNodeId) break;

      unvisited.delete(current);

      const neighbors = adj[current] || [];
      for (const edge of neighbors) {
        if (!unvisited.has(edge.to)) continue;
        const alt = distances[current] + edge.dist;
        if (alt < distances[edge.to]) {
          distances[edge.to] = alt;
          previous[edge.to] = { node: current, instruction: edge.instruction, dist: edge.dist };
        }
      }
    }

    // Reconstruct path
    if (distances[targetNodeId] === Infinity) {
      return {
        totalDistance: 0,
        walkingTimeMin: 0,
        steps: ['No accessible step-free route found between these locations. Try toggling off the wheelchair filter or choose an alternative entry.'],
        pathNodes: [],
      };
    }

    const pathNodes: string[] = [];
    const steps: string[] = [];
    let curr: string | null = targetNodeId;

    while (curr && curr !== startNodeId) {
      pathNodes.unshift(curr);
      const prevStep: { node: string; instruction: string; dist: number } | null = previous[curr] || null;
      if (prevStep) {
        steps.unshift(`${prevStep.instruction} (${prevStep.dist}m)`);
        curr = prevStep.node;
      } else {
        break;
      }
    }
    pathNodes.unshift(startNodeId);

    const totalDistance = distances[targetNodeId];
    // Avg walking speed ~ 1.1 m/s (approx 66 m/min)
    const walkingTimeMin = Math.max(1, Math.ceil(totalDistance / 60));

    return { totalDistance, walkingTimeMin, steps, pathNodes };
  }, [startNodeId, targetNodeId, accessibleOnly, nodes, edges]);

  const filteredAmenities = selectedFilter === 'ALL'
    ? amenities
    : amenities.filter(a => a.category === selectedFilter);

  return (
    <div className="card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)', padding: 20 }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <div>
          <div className="flex items-center gap-2">
            <h3 style={{ fontSize: '1.2rem', color: '#f1f5f9', fontWeight: 800 }}>
              📍 Station Indoor Navigation & Wayfinding
            </h3>
            <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              {stationCode} · {stationName}
            </span>
          </div>
          <p className="text-xs text-muted" style={{ marginTop: 2 }}>
            Real graph-based pathfinding (Dijkstra algorithm) across platforms, FOB bridges, escalators, and accessible lifts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Accessible Route Toggle */}
          <button
            type="button"
            className={`btn btn-sm ${accessibleOnly ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAccessibleOnly(!accessibleOnly)}
            style={{
              fontSize: '0.75rem',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: accessibleOnly ? '#0284c7' : 'var(--bg-canvas)',
              borderColor: accessibleOnly ? '#38bdf8' : 'var(--border-strong)',
              color: accessibleOnly ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            <span>♿</span>
            <strong>{accessibleOnly ? 'Accessible Mode: ON (Lifts & Ramps Only)' : 'Filter: Step-Free Route'}</strong>
          </button>

          <div className="telemetry-status-pill live" style={{ fontSize: '0.68rem' }}>
            <span className="live-pulse-dot" /> LIVE INDOOR GRAPH
          </div>
        </div>
      </div>

      {/* Origin & Destination Route Planner */}
      <div
        style={{
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: 16,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div>
          <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
            🟢 Starting Point:
          </label>
          <select
            value={startNodeId}
            onChange={(e) => setStartNodeId(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 10px',
              color: '#f1f5f9',
              fontSize: '0.82rem',
            }}
          >
            {nodes.map(n => (
              <option key={n.id} value={n.id}>
                {n.icon} {n.label} {n.platform ? `(${n.platform})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
            🎯 Destination / Amenity:
          </label>
          <select
            value={targetNodeId}
            onChange={(e) => setTargetNodeId(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 10px',
              color: '#f1f5f9',
              fontSize: '0.82rem',
            }}
          >
            {nodes.map(n => (
              <option key={n.id} value={n.id}>
                {n.icon} {n.label} {n.platform ? `(${n.platform})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ paddingTop: 18 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const temp = startNodeId;
              setStartNodeId(targetNodeId);
              setTargetNodeId(temp);
            }}
            title="Swap Origin & Destination"
            style={{ fontSize: '0.8rem', padding: '7px 12px' }}
          >
            🔄 Reverse
          </button>
        </div>
      </div>

      {/* Route Summary Banner */}
      <div
        className="animate-fadeIn"
        style={{
          background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.15) 0%, rgba(16, 185, 129, 0.12) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div className="flex items-center gap-3">
          <div style={{ fontSize: '1.8rem' }}>🗺️</div>
          <div>
            <div className="font-bold" style={{ color: '#f1f5f9', fontSize: '0.92rem' }}>
              Optimal Route Calculated: {pathResult.totalDistance} meters
            </div>
            <div className="text-xs text-muted">
              Estimated walking time: <strong style={{ color: '#38bdf8' }}>~{pathResult.walkingTimeMin} min</strong> at normal pace (1.1 m/s)
              {accessibleOnly && (
                <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 700 }}>
                  · ♿ 100% Step-Free (Ramps & Elevators)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
            {pathResult.steps.length} Route Legs
          </span>
          <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            Dijkstra Shortest Path
          </span>
        </div>
      </div>

      {/* Main Grid: Visual Schematic + Turn-by-Turn Wayfinding */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.1fr', gap: 16 }}>
        {/* 2D Schematic Platform Layout */}
        <div
          style={{
            background: 'var(--bg-canvas)',
            border: '2px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: 16,
            position: 'relative',
          }}
        >
          {/* North Entry / Hasanpura */}
          <div
            style={{
              background: pathResult.pathNodes.includes('entry_hasanpura') ? 'rgba(56, 189, 248, 0.2)' : 'var(--bg-panel-elevated)',
              border: `1px solid ${pathResult.pathNodes.includes('entry_hasanpura') ? '#38bdf8' : 'var(--border-strong)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '6px 10px',
              textAlign: 'center',
              marginBottom: 10,
              fontSize: '0.72rem',
              color: '#38bdf8',
              fontWeight: 700,
            }}
          >
            ▲ NORTH ENTRY: {isJaipur ? 'HASANPURA 2ND CONCOURSE (PF 6/7 SIDE)' : 'AJMERI GATE & METRO SKYWALK (PF 16)'}
          </div>

          {/* North FOB Bridge indicator */}
          <div
            style={{
              background: pathResult.pathNodes.includes('fob1_bridge') || pathResult.pathNodes.includes('fob_ndls')
                ? 'rgba(16, 185, 129, 0.25)'
                : 'rgba(255, 255, 255, 0.04)',
              border: '1px dashed #10b981',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: '0.68rem',
              color: '#10b981',
              fontWeight: 700,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            🌉 NORTH FOOT OVERBRIDGE (FOB-1) · ♿ EQUIPPED WITH ELEVATORS TO ALL PLATFORMS
          </div>

          {/* Platform tracks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(isJaipur ? [
              { id: 'pf6_7', name: 'Platform 6 & 7', type: 'Island Platform', tags: 'Express Corridors', lifts: 'Lift L-4' },
              { id: 'pf4_5', name: 'Platform 4 & 5', type: 'Island Platform', tags: 'Shatabdi & Superfast', lifts: 'Lift L-3' },
              { id: 'pf2_3', name: 'Platform 2 & 3', type: 'Island Platform', tags: 'Rajdhani / Vande Bharat', lifts: 'Lift L-2' },
              { id: 'pf1', name: 'Platform 1 (Main Concourse)', type: 'Main Terminal Platform', tags: 'Executive Wing & IRCTC Plaza', lifts: 'Lift L-1' },
            ] : [
              { id: 'pf15_16_ndls', name: 'Platform 15 & 16', type: 'Ajmeri Side Island', tags: 'Vande Bharat / Express', lifts: 'Lift L-8' },
              { id: 'pf2_3_ndls', name: 'Platform 2 & 3', type: 'Central Island', tags: 'Intercity Corridors', lifts: 'Lift L-2' },
              { id: 'pf1_ndls', name: 'Platform 1 (VIP Concourse)', type: 'Main Terminal', tags: 'Executive Concourse', lifts: 'Lift L-1' },
            ]).map((p) => {
              const isOnPath = pathResult.pathNodes.includes(p.id);
              const isStart = startNodeId === p.id;
              const isTarget = targetNodeId === p.id;

              return (
                <div
                  key={p.id}
                  style={{
                    background: isStart ? 'rgba(16, 185, 129, 0.2)' : isTarget ? 'rgba(56, 189, 248, 0.25)' : isOnPath ? 'rgba(2, 132, 199, 0.12)' : 'var(--bg-panel)',
                    border: isStart ? '1px solid #10b981' : isTarget ? '1px solid #38bdf8' : isOnPath ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="mono font-bold" style={{ color: '#f1f5f9', fontSize: '0.8rem' }}>
                      {p.name}
                    </span>
                    <span className="text-muted text-xs">({p.tags})</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', borderRadius: 3 }}>
                      ♿ {p.lifts}
                    </span>
                    {isStart && <span className="badge" style={{ background: '#10b981', color: '#000' }}>START</span>}
                    {isTarget && <span className="badge" style={{ background: '#0284c7', color: '#fff' }}>DEST</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* South FOB Bridge indicator */}
          <div
            style={{
              background: pathResult.pathNodes.includes('fob2_bridge')
                ? 'rgba(245, 158, 11, 0.25)'
                : 'rgba(255, 255, 255, 0.04)',
              border: '1px dashed #f59e0b',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: '0.68rem',
              color: '#f59e0b',
              fontWeight: 700,
              textAlign: 'center',
              marginTop: 8,
              marginBottom: 8,
            }}
          >
            🌉 SOUTH FOOT OVERBRIDGE (FOB-2) · 🪜 ESCALATORS & STAIRS (STEPPED)
          </div>

          {/* Main City Entrance / South */}
          <div
            style={{
              background: pathResult.pathNodes.includes('entry_city') || pathResult.pathNodes.includes('entry_paharganj') ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-panel-elevated)',
              border: `1px solid ${pathResult.pathNodes.includes('entry_city') || pathResult.pathNodes.includes('entry_paharganj') ? '#10b981' : 'var(--border-strong)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '6px 10px',
              textAlign: 'center',
              fontSize: '0.72rem',
              color: '#10b981',
              fontWeight: 700,
            }}
          >
            ▼ SOUTH MAIN ENTRANCE: {isJaipur ? 'MAIN CITY CONCOURSE & PORTICO (PF 1 SIDE)' : 'PAHARGANJ MAIN CONCOURSE (PF 1 SIDE)'}
          </div>
        </div>

        {/* Turn-by-Turn Wayfinding Instructions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              background: 'var(--bg-panel-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 14,
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted mono uppercase font-bold">
                🚶 Turn-by-Turn Directions:
              </span>
              <span className="mono text-xs text-primary font-bold">
                {pathResult.steps.length} Steps
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
              {pathResult.steps.map((step, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    fontSize: '0.78rem',
                    lineHeight: 1.4,
                    padding: '6px 8px',
                    background: 'var(--bg-canvas)',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid #38bdf8',
                  }}
                >
                  <span
                    style={{
                      background: '#0284c7',
                      color: '#fff',
                      borderRadius: '50%',
                      width: 18,
                      height: 18,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span style={{ color: '#e2e8f0' }}>{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Select Destination Amenity Chips */}
          <div>
            <div className="text-xs text-muted mono uppercase font-bold mb-1.5">
              Quick Navigate to Amenity:
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {filteredAmenities.slice(0, 6).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{
                    fontSize: '0.7rem',
                    padding: '3px 8px',
                    borderColor: targetNodeId === a.nodeId ? '#38bdf8' : 'var(--border-default)',
                    background: targetNodeId === a.nodeId ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-panel)',
                  }}
                  onClick={() => setTargetNodeId(a.nodeId)}
                >
                  {a.icon} {a.name.split('&')[0]} ({a.platform})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

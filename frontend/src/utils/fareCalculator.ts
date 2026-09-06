/**
 * Client-Side Indian Railways Telescopic Fare Calculator.
 *
 * Implements standard distance-based telescopic fare slabs, reservation fees,
 * and superfast surcharges across coach classes (1A, 2A, 3A, SL, CC, EC).
 * Fares are transparently labeled as CALCULATED_ESTIMATE.
 */

export interface ClassFareEstimate {
  coachClass: string;
  name: string;
  fare: number;
  fareType: 'CALCULATED_ESTIMATE';
  sourceLabel: string;
  disclaimer: string;
}

export interface SegmentFareSummary {
  distanceKm: number;
  minFare: number;
  fares: Record<string, number>;
  classBreakdown: ClassFareEstimate[];
  fareType: 'CALCULATED_ESTIMATE';
  sourceLabel: string;
  disclaimer: string;
}

const CLASS_RATES: Record<
  string,
  {
    name: string;
    ratePerKm: number;
    reservationFee: number;
    superfastFee: number;
    minDist: number;
    minFare: number;
  }
> = {
  SL: {
    name: 'Sleeper Class (SL)',
    ratePerKm: 0.48,
    reservationFee: 20,
    superfastFee: 20,
    minDist: 200,
    minFare: 140,
  },
  CC: {
    name: 'AC Chair Car (CC)',
    ratePerKm: 1.15,
    reservationFee: 40,
    superfastFee: 45,
    minDist: 150,
    minFare: 385,
  },
  '3A': {
    name: 'AC 3 Tier (3A)',
    ratePerKm: 1.35,
    reservationFee: 40,
    superfastFee: 45,
    minDist: 300,
    minFare: 495,
  },
  '2A': {
    name: 'AC 2 Tier (2A)',
    ratePerKm: 1.95,
    reservationFee: 50,
    superfastFee: 45,
    minDist: 300,
    minFare: 710,
  },
  '1A': {
    name: 'AC First Class (1A)',
    ratePerKm: 3.3,
    reservationFee: 60,
    superfastFee: 75,
    minDist: 300,
    minFare: 1250,
  },
  EC: {
    name: 'Executive Chair Car (EC)',
    ratePerKm: 2.1,
    reservationFee: 60,
    superfastFee: 75,
    minDist: 150,
    minFare: 835,
  },
};

/**
 * Calculate Haversine distance between two coordinates in kilometers.
 */
export function calculateDistanceKm(
  lat1?: number,
  lon1?: number,
  lat2?: number,
  lon2?: number
): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 300; // Default trunk distance
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  // Multiply by track curvature factor (~1.25)
  return Math.max(Math.round(R * c * 1.25), 45);
}

/**
 * Estimate fare for a single coach class given journey distance in km.
 */
export function estimateClassFare(coachClass: string, distanceKm: number): number {
  const norm = coachClass.toUpperCase().trim();
  const cfg = CLASS_RATES[norm] || CLASS_RATES['3A'];
  const dist = Math.max(distanceKm, cfg.minDist);

  let telescopicFactor = 1.0;
  if (dist > 1000) telescopicFactor = 0.85;
  else if (dist > 500) telescopicFactor = 0.92;

  const raw = dist * cfg.ratePerKm * telescopicFactor + cfg.reservationFee + cfg.superfastFee;
  const fare = Math.max(Math.round(raw), cfg.minFare);
  // Round to nearest 5 rupees (IR standard)
  return Math.round(fare / 5) * 5;
}

export function calculateFare(distanceKm: number, coachClass: string): { fare: number; sourceLabel: string } {
  return {
    fare: estimateClassFare(coachClass, distanceKm),
    sourceLabel: 'IR Telescopic Tariff',
  };
}

/**
 * Calculate full class fare matrix for a station pair.
 */
export function calculateSegmentFareSummary(
  fromLat?: number,
  fromLon?: number,
  toLat?: number,
  toLon?: number,
  knownDistanceKm?: number
): SegmentFareSummary {
  const distanceKm = knownDistanceKm || calculateDistanceKm(fromLat, fromLon, toLat, toLon);
  const classes = ['SL', '3A', '2A', '1A', 'CC', 'EC'];

  const fares: Record<string, number> = {};
  const classBreakdown: ClassFareEstimate[] = [];

  for (const cls of classes) {
    const f = estimateClassFare(cls, distanceKm);
    fares[cls] = f;
    classBreakdown.push({
      coachClass: cls,
      name: CLASS_RATES[cls]?.name || cls,
      fare: f,
      fareType: 'CALCULATED_ESTIMATE',
      sourceLabel: 'Estimated Fare',
      disclaimer: 'Based on Indian Railways standard telescopic distance slabs.',
    });
  }

  const minFare = Math.min(...Object.values(fares));

  return {
    distanceKm,
    minFare,
    fares,
    classBreakdown,
    fareType: 'CALCULATED_ESTIMATE',
    sourceLabel: 'Estimated Fare (IR Telescopic Tariff)',
    disclaimer:
      'Fares computed from Indian Railways distance tariff slabs. Dynamic flexi-fares or Tatkal surcharges may apply at PRS charting.',
  };
}

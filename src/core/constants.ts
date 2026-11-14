export const MARS_GRAVITY_MS2 = 3.721;

export const EARTH_GRAVITY_MS2 = 9.80665;

export const GALE_SITE = {
  latitudeDeg: -4.618,
  longitudeDeg: 137.402,
  datumElevationM: -4482
} as const;

export const PNR_CRITICAL_FRACTION = 0.85;

export const PNR_CAUTION_FRACTION = 0.7;

export const SLOPE_ABORT_DEG = 20;

export const SANTEE_MIN_GRADE_PERCENT = -20;

export const OXYGEN_ENERGY_EQUIVALENT_J_PER_LITRE = 20100;

export const OXYGEN_DENSITY_KG_PER_LITRE_STP = 0.001429;

export const WAL_RATE_HZ = 1;

export const EVA_DURATION_HOURS = 4;

export const WAL_CAPACITY_PACKETS = EVA_DURATION_HOURS * 3600 * WAL_RATE_HZ;

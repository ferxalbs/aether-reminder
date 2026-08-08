/**
 * Explicit temporal domain primitives.
 * The application runtime owns resolution and validation — never write a
 * model-produced timestamp to SQLite without going through these types.
 */

/** Calendar date in a local zone, ISO `YYYY-MM-DD`. */
export type LocalDate = string & { readonly __brand: 'LocalDate' };

/** Wall-clock time, 24h `HH:mm` (optional seconds not stored in domain). */
export type LocalTime = string & { readonly __brand: 'LocalTime' };

/** IANA timezone id (e.g. `America/Mexico_City`) or empty for device-local floating. */
export type TimeZone = string & { readonly __brand: 'TimeZone' };

/**
 * fixed — absolute / zoned instant semantics
 * floating — wall-clock in the user's local calendar (moves with zone)
 */
export type TemporalSemantics = 'fixed' | 'floating';

export interface ResolvedDateTime {
  date: LocalDate;
  time: LocalTime | null;
  timezone: TimeZone | null;
  semantics: TemporalSemantics;
}

export type Weekday =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export const WEEKDAY_INDEX: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export class TemporalValidationError extends Error {
  readonly code = 'TEMPORAL_VALIDATION_FAILED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'TemporalValidationError';
  }
}

export interface Currency {
  id: string;
  code: string;
  symbol: string;
  name: string;
}

export interface Unit {
  id: string;
  code: string;
  label: string;
  applies_to: string | null;
}

/** Shape stored in `location jsonb` columns (farms, listings, dealer stores, expert profiles). */
export interface GeoLocation {
  country: string | null;
  province: string | null;
  city: string | null;
}

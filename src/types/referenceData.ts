export interface Country {
  id: string;
  name: string;
  iso_code: string;
}

export interface Province {
  id: string;
  country_id: string;
  name: string;
}

export interface City {
  id: string;
  province_id: string;
  name: string;
}

export interface PhoneCode {
  id: string;
  country_id: string;
  calling_code: string;
}

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

/** Shape stored in `location jsonb` columns (profiles, listings, farms, ...). */
export interface GeoLocation {
  country_id: string | null;
  province_id: string | null;
  city_id: string | null;
}

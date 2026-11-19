// ZaraiLink serves Pakistan only, so the country is never a field a person fills in. Provinces and territories come from
// a list, never free text, so "Sind", "sindh " and "Sindh" cannot become three places in a filter or a report.
export const COUNTRY = 'Pakistan';

export const PROVINCES = [
  'Punjab',
  'Sindh',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Islamabad Capital Territory',
  'Gilgit-Baltistan',
  'Azad Jammu and Kashmir',
] as const;

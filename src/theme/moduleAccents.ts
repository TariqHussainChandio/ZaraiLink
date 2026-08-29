// Per-module accent colors (SRDS v4.0 §"Module Accent Coding"). Used to color-code
// section identifiers, icons, and small UI accents by feature area.
export const moduleAccents = {
  marketplace: '#2E7D32',
  farmer: '#2E7D32',
  dealer: '#EF6C00',
  inventory: '#EF6C00',
  buyer: '#1976D2',
  orders: '#1976D2',
  expert: '#7B1FA2',
  consultation: '#7B1FA2',
  diseaseAdvisory: '#00897B',
  payments: '#43A047',
  messages: '#1976D2',
  notifications: '#F9A825',
  admin: '#374151',
} as const;

export type ModuleAccentKey = keyof typeof moduleAccents;

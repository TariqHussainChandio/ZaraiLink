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

// Dark-ground contrast pass, same reasoning and adjustments as roleColors/statusColors —
// `admin` is the one that actually needed lightening rather than just one brightness step.
export const moduleAccentsDark = {
  marketplace: '#66BB6A',
  farmer: '#66BB6A',
  dealer: '#FFA726',
  inventory: '#FFA726',
  buyer: '#42A5F5',
  orders: '#42A5F5',
  expert: '#AB47BC',
  consultation: '#AB47BC',
  diseaseAdvisory: '#26A69A',
  payments: '#66BB6A',
  messages: '#42A5F5',
  notifications: '#FFD54F',
  admin: '#9CA3AF',
} as const;

export type ModuleAccentKey = keyof typeof moduleAccents;

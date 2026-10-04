import type { FetchListingsParams } from '../common/marketplace';

/**
 * Every React Query key in the app is built here, so an invalidation can never miss a query because of a typo
 * and the persisted-cache allow-list (queryClient.ts) can name whole domains by their first element.
 */
export const queryKeys = {
  marketplace: {
    all: ['marketplace'] as const,
    listings: (filters: FetchListingsParams) => ['marketplace', 'listings', filters] as const,
    listing: (id: string) => ['marketplace', 'listing', id] as const,
    myListings: (ownerId: string) => ['marketplace', 'my-listings', ownerId] as const,
    listingOptions: () => ['marketplace', 'listing-options'] as const,
    categories: () => ['marketplace', 'categories'] as const,
    crops: () => ['marketplace', 'crops'] as const,
  },
  analytics: {
    all: ['analytics'] as const,
    farmer: () => ['analytics', 'farmer'] as const,
    dealer: () => ['analytics', 'dealer'] as const,
    expert: () => ['analytics', 'expert'] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    forListing: (listingId: string) => ['reviews', 'listing', listingId] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (segment: 'buyer' | 'seller') => ['orders', 'list', segment] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
  },
  payments: {
    all: ['payments'] as const,
    byId: (id: string) => ['payments', 'detail', id] as const,
    forOrder: (orderId: string) => ['payments', 'order', orderId] as const,
  },
  messaging: {
    all: ['messaging'] as const,
    conversations: () => ['messaging', 'conversations'] as const,
    messages: (conversationId: string) => ['messaging', 'messages', conversationId] as const,
    attachments: (paths: string[]) => ['messaging', 'attachments', paths] as const,
  },
  mfa: {
    verifiedFactor: () => ['mfa', 'verified-factor'] as const,
  },
  profile: {
    farmer: () => ['profile', 'farmer'] as const,
  },
  admin: {
    all: ['admin'] as const,
    stats: () => ['admin', 'stats'] as const,
    analytics: () => ['admin', 'analytics'] as const,
    auditLogs: () => ['admin', 'audit-logs'] as const,
    orders: () => ['admin', 'orders'] as const,
    profiles: (filter?: string) => ['admin', 'profiles', filter ?? 'all'] as const,
    moderationListings: () => ['admin', 'moderation-listings'] as const,
    verifications: (status: string | undefined) => ['admin', 'verifications', status ?? null] as const,
    reports: (status: string | undefined) => ['admin', 'reports', status ?? null] as const,
    reportPreviews: (ids: string[]) => ['admin', 'report-previews', ids] as const,
  },
  consultations: {
    all: ['consultations'] as const,
    list: (kind: 'requester' | 'expert') => ['consultations', 'list', kind] as const,
    detail: (id: string) => ['consultations', 'detail', id] as const,
    messages: (id: string) => ['consultations', 'messages', id] as const,
    review: (id: string) => ['consultations', 'review', id] as const,
    attachments: (paths: string[]) => ['consultations', 'attachments', paths] as const,
  },
  experts: {
    all: ['experts'] as const,
    list: (specialization: string | undefined) => ['experts', 'list', specialization ?? null] as const,
    detail: (id: string) => ['experts', 'detail', id] as const,
    own: () => ['experts', 'own'] as const,
  },
  farmer: {
    all: ['farmer'] as const,
    farms: () => ['farmer', 'farms'] as const,
    farm: (id: string) => ['farmer', 'farms', id] as const,
    crops: (farmId: string) => ['farmer', 'farms', farmId, 'crops'] as const,
    crop: (id: string) => ['farmer', 'crops', id] as const,
  },
  disease: {
    all: ['disease'] as const,
    case: (id: string) => ['disease', 'case', id] as const,
  },
  referenceData: {
    all: ['reference-data'] as const,
    units: () => ['reference-data', 'units'] as const,
    rows: (table: string) => ['reference-data', 'rows', table] as const,
  },
  dealer: {
    all: ['dealer'] as const,
    inventory: () => ['dealer', 'inventory'] as const,
    inventoryItem: (id: string) => ['dealer', 'inventory', id] as const,
    inventoryTransactions: (id: string) => ['dealer', 'inventory', id, 'transactions'] as const,
    listingOptions: () => ['dealer', 'listing-options'] as const,
    stores: () => ['dealer', 'stores'] as const,
    store: (id: string) => ['dealer', 'stores', id] as const,
    suppliers: () => ['dealer', 'suppliers'] as const,
    supplier: (id: string) => ['dealer', 'suppliers', id] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
  },
} as const;

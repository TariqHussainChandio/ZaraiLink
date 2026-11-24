// Analytics types: the dashboard numbers each role receives.
// A best-selling listing and how many units sold.
interface PopularProduct {
  listingId: string;
  title: string;
  unitsSold: number;
  revenue: number;
}

/** `month` is formatted "YYYY-MM". */
interface MonthlyPoint {
  month: string;
  value: number;
}

// The numbers on the farmer dashboard.
export interface FarmerAnalytics {
  totalListingViews: number;
  activeListings: number;
  pendingOrders: number;
  /** Orders at `ready`, waiting for the seller to dispatch them (A4). */
  readyToDispatch: number;
  totalOrders: number;
  totalSales: number;
  popularProducts: PopularProduct[];
  farmCount: number;
  cropCount: number;
  openConsultations: number;
  resolvedConsultations: number;
}

// The numbers on the dealer dashboard.
export interface DealerAnalytics {
  totalSales: number;
  totalOrders: number;
  activeListings: number;
  pendingOrders: number;
  /** Orders at `ready`, waiting for the seller to dispatch them (A4). */
  readyToDispatch: number;
  inventoryMovement: MonthlyPoint[];
  lowStockCount: number;
  bestSellers: PopularProduct[];
  storeCount: number;
  supplierCount: number;
}

// The numbers on the expert dashboard.
export interface ExpertAnalytics {
  totalConsultations: number;
  completedConsultations: number;
  averageRating: number;
  reviewCount: number;
  consultationsByMonth: MonthlyPoint[];
}

// The numbers on the admin dashboard.
export interface AdminAnalytics {
  userGrowth: MonthlyPoint[];
  usersByRole: Record<string, number>;
  totalListings: number;
  activeListings: number;
  orderVolume: MonthlyPoint[];
  totalOrders: number;
  paymentsByStatus: Record<string, number>;
  paymentsTotal: number;
  reportsByStatus: Record<string, number>;
  pendingExpertVerifications: number;
  approvedExperts: number;
  consultationResolutionRate: number;
}

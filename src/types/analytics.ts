export interface ListingView {
  id: string;
  listing_id: string;
  viewer_id: string | null;
  created_at: string;
}

export interface PopularProduct {
  listingId: string;
  title: string;
  unitsSold: number;
  revenue: number;
}

/** `month` is formatted "YYYY-MM". */
export interface MonthlyPoint {
  month: string;
  value: number;
}

export interface FarmerAnalytics {
  totalListingViews: number;
  totalOrders: number;
  totalSales: number;
  popularProducts: PopularProduct[];
  farmCount: number;
  cropCount: number;
  openConsultations: number;
  resolvedConsultations: number;
}

export interface DealerAnalytics {
  totalSales: number;
  totalOrders: number;
  inventoryMovement: MonthlyPoint[];
  lowStockCount: number;
  bestSellers: PopularProduct[];
  storeCount: number;
  supplierCount: number;
}

export interface ExpertAnalytics {
  totalConsultations: number;
  completedConsultations: number;
  averageRating: number;
  reviewCount: number;
  consultationsByMonth: MonthlyPoint[];
}

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

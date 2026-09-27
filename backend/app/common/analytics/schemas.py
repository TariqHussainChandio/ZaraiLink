from pydantic import BaseModel


class MonthlyPoint(BaseModel):
    month: str
    value: float


class PopularProduct(BaseModel):
    listingId: str
    title: str
    unitsSold: float
    revenue: float


class FarmerAnalytics(BaseModel):
    totalListingViews: int
    activeListings: int
    pendingOrders: int
    totalOrders: int
    totalSales: float
    popularProducts: list[PopularProduct]
    farmCount: int
    cropCount: int
    openConsultations: int
    resolvedConsultations: int


class DealerAnalytics(BaseModel):
    totalSales: float
    totalOrders: int
    activeListings: int
    pendingOrders: int
    inventoryMovement: list[MonthlyPoint]
    lowStockCount: int
    bestSellers: list[PopularProduct]
    storeCount: int
    supplierCount: int


class ExpertAnalytics(BaseModel):
    totalConsultations: int
    completedConsultations: int
    averageRating: float
    reviewCount: int
    consultationsByMonth: list[MonthlyPoint]


class AdminAnalytics(BaseModel):
    userGrowth: list[MonthlyPoint]
    usersByRole: dict[str, int]
    totalListings: int
    activeListings: int
    orderVolume: list[MonthlyPoint]
    totalOrders: int
    paymentsByStatus: dict[str, int]
    paymentsTotal: float
    reportsByStatus: dict[str, int]
    pendingExpertVerifications: int
    approvedExperts: int
    consultationResolutionRate: float

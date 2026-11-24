"""Analytics response shapes for each role's dashboard."""

from pydantic import BaseModel


# One point of a monthly chart: the month and its value.
class MonthlyPoint(BaseModel):
    month: str
    value: float


# A listing in the best-sellers list, with units sold.
class PopularProduct(BaseModel):
    listingId: str
    title: str
    unitsSold: float
    revenue: float


# The numbers on the farmer dashboard.
class FarmerAnalytics(BaseModel):
    totalListingViews: int
    activeListings: int
    pendingOrders: int
    readyToDispatch: int
    totalOrders: int
    totalSales: float
    popularProducts: list[PopularProduct]
    farmCount: int
    cropCount: int
    openConsultations: int
    resolvedConsultations: int


# The numbers on the dealer dashboard.
class DealerAnalytics(BaseModel):
    totalSales: float
    totalOrders: int
    activeListings: int
    pendingOrders: int
    readyToDispatch: int
    inventoryMovement: list[MonthlyPoint]
    lowStockCount: int
    bestSellers: list[PopularProduct]
    storeCount: int
    supplierCount: int


# The numbers on the expert dashboard.
class ExpertAnalytics(BaseModel):
    totalConsultations: int
    completedConsultations: int
    averageRating: float
    reviewCount: int
    consultationsByMonth: list[MonthlyPoint]


# The numbers on the admin dashboard.
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

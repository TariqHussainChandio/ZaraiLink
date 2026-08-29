export const AUTH_ROUTES = {
  Login: 'Login',
  Register: 'Register',
  ForgotPassword: 'ForgotPassword',
  VerifyOtp: 'VerifyOtp',
} as const;

export const APP_TABS = {
  Home: 'Home',
  Marketplace: 'Marketplace',
  Orders: 'Orders',
  Consultations: 'Consultations',
  Messages: 'Messages',
  Profile: 'Profile',
} as const;

// Expert gets its own dedicated tab bar (no Marketplace/Orders) per SRDS v4.0 §34.
export const EXPERT_TABS = {
  Home: 'Home',
  Consultations: 'Consultations',
  Messages: 'Messages',
  Notifications: 'Notifications',
  Profile: 'Profile',
} as const;

// Expert's own Home stack: Dashboard + the application/edit-profile screen (Module 14).
// Qualifications/credentials stay here rather than in the shared ProfileNavigator per Module
// 17's own note ("most role-specific data ... stays in its owning module").
export const EXPERT_HOME_ROUTES = {
  Dashboard: 'Dashboard',
  ExpertApplication: 'ExpertApplication',
  Analytics: 'Analytics',
} as const;

// Admin gets its own dedicated tab bar; the long list of admin destinations (Users, Experts,
// Products, Orders, Reports, Categories, Reference Data, Audit Logs) live as stack screens
// reachable from the Home dashboard's Quick Actions rather than as individual bottom tabs.
export const ADMIN_TABS = {
  Home: 'Home',
  Profile: 'Profile',
} as const;

export const ROOT_ROUTES = {
  Splash: 'Splash',
  Auth: 'Auth',
  App: 'App',
} as const;

export const MARKETPLACE_ROUTES = {
  Browse: 'Browse',
  ListingDetail: 'ListingDetail',
  CreateListing: 'CreateListing',
  EditListing: 'EditListing',
  Cart: 'Cart',
  Checkout: 'Checkout',
} as const;

// PaymentMethod/Processing/Result (Module 10) live in the orders stack rather than a separate
// nested navigator — `payments` rows are single-order (matches `payments.order_id`), and every
// other domain in this app (Home, Marketplace, ...) already puts its whole flow in one flat
// stack rather than nesting a navigator inside a navigator.
export const ORDERS_ROUTES = {
  OrderHistory: 'OrderHistory',
  OrderDetail: 'OrderDetail',
  PaymentMethod: 'PaymentMethod',
  PaymentProcessing: 'PaymentProcessing',
  PaymentResult: 'PaymentResult',
  // Reviews (Module 11) live here for the same reason payments do — one flat stack per domain,
  // no nested navigator, and `WriteReviewScreen` is only ever reached from `OrderDetailScreen`.
  WriteReview: 'WriteReview',
} as const;

export const MESSAGING_ROUTES = {
  ConversationList: 'ConversationList',
  Chat: 'Chat',
} as const;

// Shared Home stack for buyer/farmer/dealer. Farms/Crops (Module 7), Stores/Suppliers/
// Inventory (Module 8), and Disease Advisory (Module 15) are real screens; My Listings/
// Products remain placeholders owned by later modules. Every route here is reachable via Quick
// Actions on the dashboard, but not every role gets every action — Disease Advisory is
// farmer-only (like Inventory is dealer-only), gated purely at the Quick Actions level, same as
// Farms/Crops already are.
export const HOME_ROUTES = {
  Dashboard: 'Dashboard',
  MyListings: 'MyListings',
  FarmList: 'FarmList',
  FarmDetail: 'FarmDetail',
  CreateFarm: 'CreateFarm',
  CropList: 'CropList',
  AddCrop: 'AddCrop',
  DiseaseAdvisory: 'DiseaseAdvisory',
  DiseaseProcessing: 'DiseaseProcessing',
  DiseaseResult: 'DiseaseResult',
  Products: 'Products',
  Stores: 'Stores',
  StoreDetail: 'StoreDetail',
  Suppliers: 'Suppliers',
  SupplierDetail: 'SupplierDetail',
  Inventory: 'Inventory',
  InventoryTransactions: 'InventoryTransactions',
  Notifications: 'Notifications',
  Analytics: 'Analytics',
} as const;

// Admin's Home stack: dashboard + every admin destination from SRDS v4.0 §34, reached via
// Quick Actions on the Admin dashboard. UserManagement/ListingModeration have real screens
// already (Module 18 partial); the rest are placeholders pending the rest of Module 18.
export const ADMIN_HOME_ROUTES = {
  Dashboard: 'Dashboard',
  UserManagement: 'UserManagement',
  ListingModeration: 'ListingModeration',
  ExpertVerification: 'ExpertVerification',
  Orders: 'Orders',
  Reports: 'Reports',
  Categories: 'Categories',
  ReferenceData: 'ReferenceData',
  AuditLogs: 'AuditLogs',
  Notifications: 'Notifications',
  Analytics: 'Analytics',
} as const;

// Consultations tab (Buyer/Farmer per §34; Dealer's nav tree omits it — no dealer entry point
// was ever built, matching that omission). Real screens as of Module 14. Expert's own
// consultations stack (ExpertNavigator) reuses `ConsultationList`/`ConsultationDetail` only —
// browsing/requesting experts is requester-only, an expert doesn't browse other experts.
export const CONSULTATIONS_ROUTES = {
  ConsultationList: 'ConsultationList',
  ExpertList: 'ExpertList',
  ExpertProfile: 'ExpertProfile',
  RequestConsultation: 'RequestConsultation',
  ConsultationDetail: 'ConsultationDetail',
} as const;

// The Expert's dedicated Notifications tab (real screen as of Module 13). Buyer/farmer/dealer
// and admin don't have a bottom tab for this — they reach `NotificationListScreen` via
// `HOME_ROUTES.Notifications`/`ADMIN_HOME_ROUTES.Notifications` instead, behind a bell icon on
// their dashboard header.
export const NOTIFICATIONS_ROUTES = {
  NotificationList: 'NotificationList',
} as const;

export const PROFILE_ROUTES = {
  ViewProfile: 'ViewProfile',
  EditProfile: 'EditProfile',
  Settings: 'Settings',
  ChangePassword: 'ChangePassword',
} as const;

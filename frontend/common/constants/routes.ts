export const AUTH_ROUTES = {
  Login: 'Login',
  // A3b: the four ways to register (SRDS §4), then the form for the chosen one.
  CreateAccount: 'CreateAccount',
  Register: 'Register',
  ForgotPassword: 'ForgotPassword',
  VerifyOtp: 'VerifyOtp',
} as const;

// A dealer or expert whose application is pending or rejected sees only these (A3a, decision D10).
export const APPROVAL_ROUTES = {
  ApplicationStatus: 'ApplicationStatus',
  // A3b: the dealer's or expert's application, details, documents and review.
  ApplicationWizard: 'ApplicationWizard',
  DeleteAccount: 'ApprovalDeleteAccount',
} as const;

export const APP_TABS = {
  Home: 'Home',
  Marketplace: 'Marketplace',
  Orders: 'Orders',
  Consultations: 'Consultations',
  Messages: 'Messages',
  Profile: 'Profile',
} as const;

// The expert's shell (A2): Requests (Home) · Cases (Consultations) · Messages · Account (Profile). No Market or Orders;
// notifications open from the bell on Requests.
export const EXPERT_TABS = {
  Home: 'Home',
  Consultations: 'Consultations',
  Messages: 'Messages',
  Profile: 'Profile',
} as const;

// Expert's own Home stack: Dashboard + the application/edit-profile screen (Module 14).
// Qualifications/credentials stay here rather than in the shared ProfileNavigator per Module
// 17's own note ("most role-specific data ... stays in its owning module").
export const EXPERT_HOME_ROUTES = {
  Dashboard: 'Dashboard',
  ExpertApplication: 'ExpertApplication',
  Analytics: 'Analytics',
  Notifications: 'Notifications',
} as const;

// The admin's shell (A2): Overview (Home) · Approvals · Moderation · Audit · Account (Profile). Dense and operational;
// every decision screen writes an audit entry (BR-15).
export const ADMIN_TABS = {
  Home: 'Home',
  Approvals: 'Approvals',
  Moderation: 'Moderation',
  Audit: 'Audit',
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
  // A3b: an approved dealer's business details.
  BusinessDetails: 'BusinessDetails',
  Stores: 'Stores',
  StoreDetail: 'StoreDetail',
  Suppliers: 'Suppliers',
  SupplierDetail: 'SupplierDetail',
  Inventory: 'Inventory',
  InventoryTransactions: 'InventoryTransactions',
  Notifications: 'Notifications',
  Analytics: 'Analytics',
} as const;

// Every admin screen, across the admin's tab stacks (they share one param list, AdminStackParamList).
export const ADMIN_HOME_ROUTES = {
  Dashboard: 'Dashboard',
  Analytics: 'Analytics',
  Notifications: 'Notifications',
  // A3b: the dealer and expert review queue, one application, a photographed document, the required-document list.
  Approvals: 'ApprovalQueue',
  ApplicationDetail: 'ApplicationDetail',
  DocumentViewer: 'DocumentViewer',
  RequiredDocuments: 'RequiredDocuments',
  ModerationHub: 'ModerationHub',
  UserManagement: 'UserManagement',
  ListingModeration: 'ListingModeration',
  Orders: 'Orders',
  OrderDetail: 'OrderDetail',
  Reports: 'Reports',
  Categories: 'Categories',
  ReferenceData: 'ReferenceData',
  AuditLogs: 'AuditLogs',
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

export const PROFILE_ROUTES = {
  ViewProfile: 'ViewProfile',
  EditProfile: 'EditProfile',
  Settings: 'Settings',
  ChangePassword: 'ChangePassword',
  // P4 (4A.4, admin-only) and (4A.5, every role).
  MfaEnrollment: 'MfaEnrollment',
  // A3b, admin only: email, password and two-step verification together, and the email change itself.
  AccountSecurity: 'AccountSecurity',
  ChangeEmail: 'ChangeEmail',
  DeleteAccount: 'DeleteAccount',
  // Development builds only (A2): every shared component in the current theme.
  DesignCatalogue: 'DesignCatalogue',
} as const;

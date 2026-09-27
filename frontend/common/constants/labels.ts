import type { ExpertSpecialization } from '../types/expert';
import type { OrderStatus } from '../types/orders';
import type { PaymentMethod } from '../types/payments';

// Display names for values the database stores as codes, shared by every screen that shows them.

export const SPECIALIZATION_LABELS: Record<ExpertSpecialization, string> = {
  crop_management: 'Crop Management',
  plant_diseases: 'Plant Diseases',
  pest_management: 'Pest Management',
  fertilizer_management: 'Fertilizer Management',
  irrigation: 'Irrigation',
  soil_management: 'Soil Management',
  crop_nutrition: 'Crop Nutrition',
  general_agriculture: 'General Agriculture',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  payment_failed: 'Payment Failed',
  disputed: 'Disputed',
  refunded: 'Refunded',
  expired: 'Expired',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: 'Cash on Delivery',
  bank_transfer: 'Bank Transfer',
};

import type { ExpertSpecialization } from '../../expert';
import type { PaymentMethod } from '../payments';

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

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: 'Cash on Delivery',
  bank_transfer: 'Bank Transfer',
};

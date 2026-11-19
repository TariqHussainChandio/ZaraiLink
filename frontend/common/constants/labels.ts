import type { ExpertSpecialization } from '../../expert';
import type { BusinessType } from '../auth';
import type { PaymentMethod } from '../payments';

// Display names for values the database stores as codes, shared by every screen that shows them.

export const SPECIALIZATION_LABELS: Record<ExpertSpecialization, string> = {
  crop_management: 'Crop management',
  plant_diseases: 'Plant diseases',
  pest_management: 'Pest management',
  fertilizer_management: 'Fertilizer management',
  irrigation: 'Irrigation',
  soil_management: 'Soil management',
  crop_nutrition: 'Crop nutrition',
  general_agriculture: 'General agriculture',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: 'Cash on delivery',
  bank_transfer: 'Bank transfer',
};

// The five dealer business types decided on 2026-10-04 (A3b; SRDS §7).
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  agri_input_retailer: 'Agri-input shop',
  wholesaler: 'Wholesaler',
  distributor: 'Distributor',
  manufacturer: 'Manufacturer',
  other: 'Other',
};

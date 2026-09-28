import type { GeoLocation } from '../../types/referenceData';

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  created_at: string;
}

export type ListingStatus = 'active' | 'inactive' | 'sold';

export interface Crop {
  id: string;
  name: string;
  category: string | null;
}

export interface Listing {
  id: string;
  owner_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  price: number;
  unit: string;
  quantity: number;
  images: string[];
  status: ListingStatus;
  /** Crop names (not ids) a listing applies to — matches the `text[]` column. */
  crop_compatibility: string[];
  brand: string | null;
  condition: string | null;
  location: GeoLocation | null;
  /** Denormalized from the owner's profile at insert time — see set_listings_seller_role. */
  seller_role: 'farmer' | 'buyer' | 'dealer' | 'expert' | 'admin' | null;
  created_at: string;
  updated_at: string;
}

/** Listing joined with its category and owner profile, as returned by `fetchListings`/`fetchListingById`. */
export interface ListingWithRelations extends Listing {
  category: Pick<Category, 'id' | 'name' | 'slug'> | null;
  owner: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

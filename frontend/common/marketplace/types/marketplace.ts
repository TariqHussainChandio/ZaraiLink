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
  /** The dealer's inventory product this listing sells (D8): its availability then comes from that product's stock.
   * Null for an unlinked listing and for every non-dealer listing. */
  inventory_product_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A listing's stock as a buyer may know it (A4, the "Listing availability" contract): a word, never the seller's
 * figures. `unknown` when the answer could not be had. */
type Availability = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';

/** Listing joined with its category and owner profile, as returned by `fetchListings`/`fetchListingById`. */
export interface ListingWithRelations extends Listing {
  /** Browse and detail carry it; the admin's moderation list does not. */
  availability?: Availability | null;
  category: Pick<Category, 'id' | 'name' | 'slug'> | null;
  owner: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

/** A dealer's inventory product as the listing form offers it for linking (D8): only what the picker shows. */
export interface LinkableInventoryProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  is_active: boolean;
}

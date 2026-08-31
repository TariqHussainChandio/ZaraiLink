import type { Asset } from 'react-native-image-picker';
import { apiFetch } from '../../api/client';
import { supabase } from '../../supabase/client';
import type {
  Category,
  Crop,
  Listing,
  ListingStatus,
  ListingWithRelations,
} from '../../../types/marketplace';
import type { Role } from '../../../constants/roles';

export interface FetchListingsParams {
  categoryId?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sellerRole?: Role;
  city?: string;
  cropName?: string;
  page?: number;
  ownerId?: string;
}

export async function fetchListings({
  categoryId,
  search,
  minPrice,
  maxPrice,
  sellerRole,
  city,
  cropName,
  page,
  ownerId,
}: FetchListingsParams = {}): Promise<ListingWithRelations[]> {
  return apiFetch('/api/v1/marketplace/listings', {
    query: {
      category_id: categoryId,
      search,
      min_price: minPrice,
      max_price: maxPrice,
      seller_role: sellerRole,
      city,
      crop_name: cropName,
      page,
      owner_id: ownerId,
    },
  });
}

export async function fetchListingById(id: string): Promise<ListingWithRelations> {
  return apiFetch(`/api/v1/marketplace/listings/${id}`);
}

export async function fetchCategories(): Promise<Category[]> {
  return apiFetch('/api/v1/marketplace/categories');
}

export interface CategoryInput {
  name: string;
  slug: string;
  icon: string | null;
}

/** Admin-only in practice — enforced server-side. No `actorId` param — the acting admin is
 * derived from the verified session token. */
export async function createCategory(input: CategoryInput): Promise<Category> {
  return apiFetch('/api/v1/marketplace/categories', { method: 'POST', body: input });
}

export async function updateCategory(id: string, input: Partial<CategoryInput>): Promise<Category> {
  return apiFetch(`/api/v1/marketplace/categories/${id}`, { method: 'PATCH', body: input });
}

export async function deleteCategory(id: string): Promise<void> {
  await apiFetch(`/api/v1/marketplace/categories/${id}`, { method: 'DELETE' });
}

export async function fetchCrops(): Promise<Crop[]> {
  return apiFetch('/api/v1/marketplace/crops');
}

export interface ListingInput {
  title: string;
  description: string;
  categoryId: string | null;
  price: number;
  unit: string;
  quantity: number;
  images: string[];
  brand: string | null;
  condition: string | null;
  cropCompatibility: string[];
  country: string | null;
  province: string | null;
  city: string | null;
}

function toApiListing(input: Partial<ListingInput>) {
  return {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.categoryId !== undefined && { category_id: input.categoryId }),
    ...(input.price !== undefined && { price: input.price }),
    ...(input.unit !== undefined && { unit: input.unit }),
    ...(input.quantity !== undefined && { quantity: input.quantity }),
    ...(input.images !== undefined && { images: input.images }),
    ...(input.brand !== undefined && { brand: input.brand }),
    ...(input.condition !== undefined && { condition: input.condition }),
    ...(input.cropCompatibility !== undefined && { crop_compatibility: input.cropCompatibility }),
    ...(input.country !== undefined && { country: input.country }),
    ...(input.province !== undefined && { province: input.province }),
    ...(input.city !== undefined && { city: input.city }),
  };
}

// No ownerId param — the backend always uses the caller's own id.
export async function createListing(input: ListingInput): Promise<Listing> {
  return apiFetch('/api/v1/marketplace/listings', { method: 'POST', body: toApiListing(input) });
}

export async function updateListing(id: string, input: Partial<ListingInput>): Promise<Listing> {
  return apiFetch(`/api/v1/marketplace/listings/${id}`, { method: 'PATCH', body: toApiListing(input) });
}

export async function deleteListing(id: string): Promise<void> {
  await apiFetch(`/api/v1/marketplace/listings/${id}`, { method: 'DELETE' });
}

/**
 * Admin moderation: reuses `active`/`inactive` rather than a separate "flagged" state. Its two
 * callers (`ListingModerationScreen`, `ReportsScreen`) are both admin-only contexts — kept
 * admin-only server-side too, even though RLS alone would also permit the owner. No `actorId`
 * param — derived from the verified session token.
 */
export async function updateListingStatus(id: string, status: ListingStatus): Promise<void> {
  await apiFetch(`/api/v1/marketplace/listings/${id}/status`, { method: 'PATCH', body: { status } });
}

export async function fetchAllListingsForModeration(): Promise<ListingWithRelations[]> {
  return apiFetch('/api/v1/marketplace/listings/moderation');
}

/** Records a view of a listing. Callers should skip this for the listing's own owner. No
 * `viewerId` param — always the caller's own id. */
export async function recordListingView(listingId: string): Promise<void> {
  await apiFetch(`/api/v1/marketplace/listings/${listingId}/views`, { method: 'POST' });
}

/** Owner-only under RLS; used by farmer/dealer analytics, never shown to buyers. */
export async function fetchListingViewCounts(listingIds: string[]): Promise<Record<string, number>> {
  if (listingIds.length === 0) return {};
  return apiFetch('/api/v1/marketplace/listings/view-counts', {
    method: 'POST',
    body: { listing_ids: listingIds },
  });
}

export async function uploadListingImages(userId: string, images: Asset[]): Promise<string[]> {
  const urls: string[] = [];

  for (const image of images) {
    if (!image.uri) continue;

    const extension = image.fileName?.split('.').pop() ?? 'jpg';
    const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;

    const response = await fetch(image.uri);
    const arrayBuffer = await response.arrayBuffer();

    const { error } = await supabase.storage
      .from('listing-images')
      .upload(path, arrayBuffer, { contentType: image.type ?? 'image/jpeg' });

    if (error) throw error;

    const { data } = supabase.storage.from('listing-images').getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}

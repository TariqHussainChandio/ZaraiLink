// Marketplace hooks: queries and mutations for listings, categories and crops.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createListing,
  deleteListing,
  fetchCategories,
  fetchCrops,
  fetchListingById,
  fetchListingFilterOptions,
  fetchListings,
  recordListingView,
  updateListing,
  uploadListingImages,
  type FetchListingsParams,
  type ListingInput,
} from '../services/listingsService';
import { fetchLinkableInventoryProducts } from '../services/inventoryProductsService';
import type { PickedPhoto } from '../../../utils/photoPicker';
import { queryKeys } from '../../../hooks/keys';

/** Categories and crops are admin-curated reference data: they change rarely, so a day-old copy is fine. */
const REFERENCE_STALE_TIME = 24 * 60 * 60 * 1000;

// Loads all categories.
export function useCategories() {
  return useQuery({
    queryKey: queryKeys.marketplace.categories(),
    queryFn: fetchCategories,
    staleTime: REFERENCE_STALE_TIME,
  });
}

/** The cities and price range of what is for sale now (D20). Listings come and go, so it is asked for again whenever the
 * filters open rather than kept for a day like the reference data. */
export function useListingFilterOptions() {
  return useQuery({
    queryKey: queryKeys.marketplace.filterOptions(),
    queryFn: fetchListingFilterOptions,
  });
}

// Loads all crops.
export function useCrops() {
  return useQuery({
    queryKey: queryKeys.marketplace.crops(),
    queryFn: fetchCrops,
    staleTime: REFERENCE_STALE_TIME,
  });
}

/** The marketplace feed: one query per filter set, one page appended per `fetchNextPage` (the API pages by number). */
export function useListings(filters: Omit<FetchListingsParams, 'page'>) {
  return useInfiniteQuery({
    queryKey: queryKeys.marketplace.listings(filters),
    queryFn: ({ pageParam }) => fetchListings({ ...filters, page: pageParam }),
    initialPageParam: 0,
    // A new search or filter keeps the old grid on screen until the new one arrives, instead of flashing skeletons on
    // every change (MK-13).
    placeholderData: keepPreviousData,
    // An empty page is the end of the feed.
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.length > 0 ? lastPageParam + 1 : undefined,
  });
}

// Loads one listing by id.
export function useListing(id: string) {
  return useQuery({
    queryKey: queryKeys.marketplace.listing(id),
    queryFn: () => fetchListingById(id),
  });
}

/** Every listing, as choices for an expert recommending a product; fetched only once the picker is opened. */
export function useListingOptions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.marketplace.listingOptions(),
    queryFn: async () =>
      (await fetchListings({})).map(listing => ({
        id: listing.id,
        title: listing.title,
      })),
    enabled,
  });
}

/**
 * The dealer's active inventory products, for linking a listing to one (D8). `enabled` only for an approved dealer:
 * the API refuses everyone else. The key sits under `marketplace` so a listing change also refreshes it.
 */
export function useLinkableInventoryProducts(enabled: boolean) {
  return useQuery({
    queryKey: [
      ...queryKeys.marketplace.all,
      'linkable-inventory-products',
    ] as const,
    queryFn: fetchLinkableInventoryProducts,
    enabled,
  });
}

// Loads the listings of one owner.
export function useMyListings(ownerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.marketplace.myListings(ownerId ?? ''),
    queryFn: () => fetchListings({ ownerId }),
    enabled: !!ownerId,
  });
}

/** Records a view. Fire-and-forget: view counting must never block or fail the listing screen. */
export function useRecordListingView() {
  return useMutation({
    mutationFn: (listingId: string) => recordListingView(listingId),
  });
}

/**
 * A change to any listing can appear in the feed, the detail page and the owner's list, and it moves the seller
 * dashboard's "active listings" figure, so all of them refetch.
 */
function useInvalidateMarketplace() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
    ]);
}

// Inputs for creating a listing.
interface CreateListingVariables {
  userId: string;
  images: PickedPhoto[];
  input: Omit<ListingInput, 'images'>;
}

// Uploads the photos, creates the listing, then refreshes the lists.
export function useCreateListing() {
  const invalidate = useInvalidateMarketplace();
  return useMutation({
    mutationFn: async ({ userId, images, input }: CreateListingVariables) =>
      createListing({
        ...input,
        images: await uploadListingImages(userId, images),
      }),
    onSuccess: invalidate,
  });
}

// Inputs for editing a listing.
interface UpdateListingVariables {
  id: string;
  userId: string;
  newImages: PickedPhoto[];
  existingImages: string[];
  input: Omit<ListingInput, 'images'>;
}

// Uploads new photos, saves the changes, then refreshes the lists.
export function useUpdateListing() {
  const invalidate = useInvalidateMarketplace();
  return useMutation({
    mutationFn: async ({
      id,
      userId,
      newImages,
      existingImages,
      input,
    }: UpdateListingVariables) => {
      const uploaded =
        newImages.length > 0
          ? await uploadListingImages(userId, newImages)
          : [];
      return updateListing(id, {
        ...input,
        images: [...existingImages, ...uploaded],
      });
    },
    onSuccess: invalidate,
  });
}

// Deletes a listing, then refreshes the lists.
export function useDeleteListing() {
  const invalidate = useInvalidateMarketplace();
  return useMutation({
    mutationFn: (id: string) => deleteListing(id),
    onSuccess: invalidate,
  });
}

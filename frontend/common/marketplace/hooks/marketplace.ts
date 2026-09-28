import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createListing,
  deleteListing,
  fetchCategories,
  fetchCrops,
  fetchListingById,
  fetchListings,
  recordListingView,
  updateListing,
  uploadListingImages,
  type FetchListingsParams,
  type ListingInput,
} from '../services/listingsService';
import type { PickedPhoto } from '../../../utils/photoPicker';
import { queryKeys } from '../../../hooks/keys';

/** Categories and crops are admin-curated reference data: they change rarely, so a day-old copy is fine. */
const REFERENCE_STALE_TIME = 24 * 60 * 60 * 1000;

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.marketplace.categories(),
    queryFn: fetchCategories,
    staleTime: REFERENCE_STALE_TIME,
  });
}

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
    // An empty page is the end of the feed.
    getNextPageParam: (lastPage, _pages, lastPageParam) => (lastPage.length > 0 ? lastPageParam + 1 : undefined),
  });
}

export function useListing(id: string) {
  return useQuery({ queryKey: queryKeys.marketplace.listing(id), queryFn: () => fetchListingById(id) });
}

/** Listings that suit a crop, for the disease result's "related products" (the first few, newest first). */
export function useRelatedListings(cropName: string | undefined) {
  return useQuery({
    queryKey: queryKeys.marketplace.listings({ cropName }),
    queryFn: async () => (await fetchListings({ cropName })).slice(0, 5),
    enabled: !!cropName,
  });
}

/** Every listing, as choices for an expert recommending a product; fetched only once the picker is opened. */
export function useListingOptions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.marketplace.listingOptions(),
    queryFn: async () => (await fetchListings({})).map(listing => ({ id: listing.id, title: listing.title })),
    enabled,
  });
}

export function useMyListings(ownerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.marketplace.myListings(ownerId ?? ''),
    queryFn: () => fetchListings({ ownerId }),
    enabled: !!ownerId,
  });
}

/** Records a view. Fire-and-forget: view counting must never block or fail the listing screen. */
export function useRecordListingView() {
  return useMutation({ mutationFn: (listingId: string) => recordListingView(listingId) });
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

interface CreateListingVariables {
  userId: string;
  images: PickedPhoto[];
  input: Omit<ListingInput, 'images'>;
}

export function useCreateListing() {
  const invalidate = useInvalidateMarketplace();
  return useMutation({
    mutationFn: async ({ userId, images, input }: CreateListingVariables) =>
      createListing({ ...input, images: await uploadListingImages(userId, images) }),
    onSuccess: invalidate,
  });
}

interface UpdateListingVariables {
  id: string;
  userId: string;
  newImages: PickedPhoto[];
  existingImages: string[];
  input: Omit<ListingInput, 'images'>;
}

export function useUpdateListing() {
  const invalidate = useInvalidateMarketplace();
  return useMutation({
    mutationFn: async ({ id, userId, newImages, existingImages, input }: UpdateListingVariables) => {
      const uploaded = newImages.length > 0 ? await uploadListingImages(userId, newImages) : [];
      return updateListing(id, { ...input, images: [...existingImages, ...uploaded] });
    },
    onSuccess: invalidate,
  });
}

export function useDeleteListing() {
  const invalidate = useInvalidateMarketplace();
  return useMutation({ mutationFn: (id: string) => deleteListing(id), onSuccess: invalidate });
}

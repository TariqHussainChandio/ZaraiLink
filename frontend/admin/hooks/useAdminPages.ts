import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { AdminPage } from '../services/adminService';

/**
 * One admin list read a page at a time (AD-02): the API caps a request at 100 rows, so a list that needs more has to ask
 * again from where the last page ended, using the `Link: rel="next"` header `apiFetchPage` reads. `rows` is every page
 * loaded so far, in order.
 *
 * `loadAll` keeps asking until the list ends. A screen turns it on while it filters or searches rows it already has (the
 * API has no name search): a match on page 3 must be found without the admin pressing "Load more" three times.
 */
export function useAdminPages<T>(
  queryKey: readonly unknown[],
  fetchPage: (offset: number) => Promise<AdminPage<T>>,
  { loadAll = false }: { loadAll?: boolean } = {},
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: lastPage => lastPage.next?.offset,
    staleTime: 0,
    // Changing a filter keeps the old rows on screen until the new ones arrive, instead of flashing skeletons.
    placeholderData: keepPreviousData,
  });
  const { data, hasNextPage, isFetchingNextPage, isFetching, isError, fetchNextPage } = query;
  const rows = useMemo(() => data?.pages.flatMap(page => page.data) ?? [], [data]);

  useEffect(() => {
    // Not after a failure: asking again at once would loop; the error banner's "Try again" is the way back.
    if (loadAll && hasNextPage && !isFetching && !isFetchingNextPage && !isError) fetchNextPage();
    // `data` too: a page can arrive and settle between two renders, leaving every flag as it was.
  }, [loadAll, hasNextPage, isFetching, isFetchingNextPage, isError, fetchNextPage, data]);

  return { ...query, rows };
}

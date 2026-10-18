import type { LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNetworkStore } from '../../state/networkStore';
import { type Theme, useTheme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { Banner } from './Banner';
import { EmptyState } from './EmptyState';
import { SkeletonList } from './Skeleton';

/** The part of a React Query result ScreenState reads; a `useQuery(...)` result fits as it is. */
interface ScreenStateQuery<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  /** The failure, shown in plain words through `errorMessage` (a 404 says "not found", not "check your connection"). */
  error?: unknown;
  /** True while a retry is in flight: the failed state shows the skeleton again instead of a Retry that does nothing. */
  isFetching?: boolean;
  refetch: () => unknown;
}

interface ScreenStateEmpty {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ScreenStateProps<T> {
  query: ScreenStateQuery<T>;
  /** Shown while the first copy loads. Defaults to four list rows. */
  skeleton?: React.ReactNode;
  /** Whether loaded data counts as empty. Defaults to "an empty array". */
  isEmpty?: (data: T) => boolean;
  /** The empty state. Also shown when the query settled with no data at all (a record looked up in a list and not
   * found). Without it an empty result goes to `children`. */
  empty?: ScreenStateEmpty;
  /** What could not be loaded, as a title: "Couldn't load your products". */
  errorTitle?: string;
  /** The screen once there is data. Omit it when the screen uses ScreenState only as an early-return guard. */
  children?: (data: T) => React.ReactNode;
}

const DEFAULT_ERROR_TITLE = "Couldn't load this";

function defaultIsEmpty(data: unknown): boolean {
  return Array.isArray(data) && data.length === 0;
}

/**
 * The four states of a screen that reads server data, in one place so every screen loads, fails and empties alike.
 *
 * - first load (no copy yet): the skeleton;
 * - failed with no copy: a danger Banner with Retry;
 * - failed with a cached copy: the copy, under a danger Banner with Retry; when the phone is offline the global
 *   OfflineBanner already says so and this banner stays away;
 * - loaded but empty: the EmptyState;
 * - otherwise: `children(data)`.
 *
 * @example
 * const products = useProducts();
 * return (
 *   <ScreenState
 *     query={products}
 *     errorTitle="Couldn't load your products"
 *     empty={{ title: 'No products yet', actionLabel: 'Add product', onAction: openForm }}
 *   >
 *     {data => <FlashList data={data} renderItem={renderProduct} />}
 *   </ScreenState>
 * );
 */
export function ScreenState<T>({
  query,
  skeleton,
  isEmpty = defaultIsEmpty,
  empty,
  errorTitle = DEFAULT_ERROR_TITLE,
  children,
}: ScreenStateProps<T>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isOffline = useNetworkStore(state => state.isOffline);
  const {
    data,
    isPending,
    isError,
    error,
    isFetching = false,
    refetch,
  } = query;
  const retry = () => {
    refetch();
  };

  if (data === undefined) {
    if (isPending || (isError && isFetching))
      return <>{skeleton ?? <SkeletonList count={4} />}</>;
    if (isError) {
      return (
        <View style={styles.inset}>
          <Banner
            tone="danger"
            title={errorTitle}
            actionLabel="Retry"
            onAction={retry}
          >
            {errorMessage(error)}
          </Banner>
        </View>
      );
    }
    return empty ? <EmptyState {...empty} /> : null;
  }

  const content =
    empty && isEmpty(data) ? (
      <EmptyState {...empty} />
    ) : (
      (children?.(data) ?? null)
    );
  // Offline, the global OfflineBanner already says why the copy is old; a second banner here would only repeat it.
  if (!isError || isOffline) return <>{content}</>;

  return (
    <View style={styles.fill}>
      <View style={styles.inset}>
        {/* Retry is hidden while a refetch runs, so a second press cannot queue the same request. */}
        <Banner
          tone="danger"
          title={errorTitle}
          actionLabel={isFetching ? undefined : 'Retry'}
          onAction={retry}
        >
          Showing the last copy saved on this phone.
        </Banner>
      </View>
      {content}
    </View>
  );
}

function makeStyles({ components }: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    inset: { padding: components.screen.margin },
  });
}

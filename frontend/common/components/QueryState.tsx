import { WifiOff, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { Banner } from './Banner';
import { EmptyState } from './EmptyState';
import { ListGroup } from './ListRow';
import { SkeletonCard, SkeletonListItem } from './Skeleton';

/** What QueryState reads from a React Query result (`useQuery`, `useInfiniteQuery`): any of them fits as it is. */
export interface QueryLike {
  /** No data yet. */
  isPending: boolean;
  isError: boolean;
  error: unknown;
  /** `paused` is a request waiting for the connection to come back. */
  fetchStatus: 'fetching' | 'paused' | 'idle';
  data: unknown;
  refetch: () => unknown;
}

export interface QueryStateProps {
  query: QueryLike;
  /** The query succeeded and found nothing (a filter with no matches, a list nobody has filled yet). */
  isEmpty?: boolean;
  /** What to show for `isEmpty`: what will appear here, and the first step. */
  empty?: { title: string; description?: string; icon?: LucideIcon; actionLabel?: string; onAction?: () => void };
  /** The shape of what is loading: rows in a group (default) or the listing grid. */
  skeleton?: 'list' | 'cards';
  /** Names what failed: "Couldn't load your orders". */
  failureTitle?: string;
  children: React.ReactNode;
}

const SKELETON_ROWS = 6;
const SKELETON_CARDS = 4;

/** The four states of a screen that reads from the server, in one place so every list handles them the same way:
 * the screen's own skeleton while loading; a danger Banner with the reason and "Try again" when it failed; the empty state
 * when there is nothing; and the content. With no data and the phone offline (the request is paused) it says "Waiting for
 * connection" instead of spinning forever. A refresh that failed while old data is on screen shows the Banner above it. */
export function QueryState({ query, isEmpty = false, empty, skeleton = 'list', failureTitle = "Couldn't load this", children }: QueryStateProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const hasData = query.data !== undefined;
  const retry = () => {
    query.refetch();
  };

  const failure = query.isError ? (
    <Banner tone="danger" title={failureTitle} actionLabel="Try again" onAction={retry}>
      {errorMessage(query.error)}
    </Banner>
  ) : null;

  if (query.isPending && !hasData) {
    if (query.fetchStatus === 'paused') {
      return (
        <EmptyState icon={WifiOff} title="Waiting for connection" description="This loads by itself as soon as you are back online." />
      );
    }
    return skeleton === 'cards' ? (
      <View style={styles.grid}>
        {Array.from({ length: SKELETON_CARDS }, (_, i) => (
          <View key={i} style={styles.cell}>
            <SkeletonCard />
          </View>
        ))}
      </View>
    ) : (
      <ListGroup>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <SkeletonListItem key={i} />
        ))}
      </ListGroup>
    );
  }

  if (query.isError && !hasData) return failure;

  if (isEmpty && empty) {
    return (
      <>
        {failure}
        <EmptyState {...empty} />
      </>
    );
  }

  return (
    <>
      {failure ? <View style={styles.failure}>{failure}</View> : null}
      {children}
    </>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: '50%' },
    failure: { marginBottom: space[3] },
  });
}

import React from 'react';
import { Button } from '../../common/components';

interface Props {
  /** More rows exist on the server. */
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** What the rows are, for the label and a screen reader: "Load more users". */
  noun: string;
}

/** The end of a paged admin list: a button that asks for the next page (AD-02). Nothing when the list has ended. */
export function LoadMore({ hasMore, loading, onLoadMore, noun }: Props) {
  if (!hasMore) return null;
  return <Button label={`Load more ${noun}`} variant="secondary" loading={loading} disabled={loading} onPress={onLoadMore} />;
}

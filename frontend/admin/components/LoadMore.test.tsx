import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LoadMore } from './LoadMore';

describe('LoadMore', () => {
  it('asks for the next page by name', async () => {
    const onLoadMore = jest.fn();
    await render(<LoadMore hasMore loading={false} onLoadMore={onLoadMore} noun="users" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Load more users' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('is absent when the list has ended', async () => {
    await render(<LoadMore hasMore={false} loading={false} onLoadMore={jest.fn()} noun="users" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not ask twice while a page is loading', async () => {
    const onLoadMore = jest.fn();
    await render(<LoadMore hasMore loading onLoadMore={onLoadMore} noun="users" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Load more users' }));
    expect(onLoadMore).not.toHaveBeenCalled();
  });
});

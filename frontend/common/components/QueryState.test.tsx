import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApiError, apiErrorFromNetwork } from '../../services/api/errors';
import { QueryState, type QueryLike } from './QueryState';

const loaded: QueryLike = { isPending: false, isError: false, error: null, fetchStatus: 'idle', data: [1, 2], refetch: () => undefined };
const loading: QueryLike = { ...loaded, isPending: true, data: undefined, fetchStatus: 'fetching' };
const waiting: QueryLike = { ...loading, fetchStatus: 'paused' };

function failed(error: unknown, refetch = jest.fn()): QueryLike {
  return { ...loaded, isError: true, error, data: undefined, refetch };
}

describe('QueryState', () => {
  it('shows the content when the query has data', async () => {
    await render(
      <QueryState query={loaded}>
        <Text>Orders</Text>
      </QueryState>,
    );
    expect(screen.getByText('Orders')).toBeTruthy();
  });

  it('shows the list skeleton, not the content, while loading', async () => {
    await render(
      <QueryState query={loading}>
        <Text>Orders</Text>
      </QueryState>,
    );
    expect(screen.queryByText('Orders')).toBeNull();
    expect(screen.queryByText('Waiting for connection')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the card skeleton for a grid', async () => {
    await render(
      <QueryState query={loading} skeleton="cards">
        <Text>Listings</Text>
      </QueryState>,
    );
    expect(screen.queryByText('Listings')).toBeNull();
  });

  it('says what failed, why and what to do, with a Try again that asks again', async () => {
    const refetch = jest.fn();
    await render(
      <QueryState query={failed(apiErrorFromNetwork(false), refetch)} failureTitle="Couldn't load your orders">
        <Text>Orders</Text>
      </QueryState>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText("Couldn't load your orders")).toBeTruthy();
    expect(screen.getByText('No connection. Check your internet, then try again.')).toBeTruthy();
    expect(screen.queryByText('Orders')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('tells a refusal from a lost connection', async () => {
    await render(
      <QueryState query={failed(new ApiError({ status: 403, code: 'forbidden', kind: 'forbidden', message: 'x' }))}>
        <Text>Orders</Text>
      </QueryState>,
    );
    expect(screen.getByText('Your account cannot do this.')).toBeTruthy();
  });

  it('says it is waiting for the connection, instead of spinning for ever, when a request is paused with nothing to show', async () => {
    await render(
      <QueryState query={waiting}>
        <Text>Orders</Text>
      </QueryState>,
    );
    expect(screen.getByText('Waiting for connection')).toBeTruthy();
    expect(screen.queryByText('Orders')).toBeNull();
  });

  it('keeps showing what it has while a refresh waits for the connection', async () => {
    await render(
      <QueryState query={{ ...loaded, fetchStatus: 'paused' }}>
        <Text>Orders</Text>
      </QueryState>,
    );
    expect(screen.getByText('Orders')).toBeTruthy();
    expect(screen.queryByText('Waiting for connection')).toBeNull();
  });

  it('shows the empty state, with its first step, when there is nothing', async () => {
    const onAction = jest.fn();
    await render(
      <QueryState
        query={loaded}
        isEmpty
        empty={{ title: 'No listings yet', description: 'Your listings appear here once you publish one.', actionLabel: 'New listing', onAction }}
      >
        <Text>Listings</Text>
      </QueryState>,
    );
    expect(screen.getByText('No listings yet')).toBeTruthy();
    expect(screen.queryByText('Listings')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'New listing' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('shows the content, not an empty state, when something is there', async () => {
    await render(
      <QueryState query={loaded} isEmpty={false} empty={{ title: 'No listings yet' }}>
        <Text>Listings</Text>
      </QueryState>,
    );
    expect(screen.getByText('Listings')).toBeTruthy();
    expect(screen.queryByText('No listings yet')).toBeNull();
  });

  it('puts the failure above the old data when a refresh fails, instead of dropping the list', async () => {
    await render(
      <QueryState query={{ ...loaded, isError: true, error: apiErrorFromNetwork(false) }}>
        <Text>Orders</Text>
      </QueryState>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Orders')).toBeTruthy();
  });
});

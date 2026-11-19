import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApiError } from '../../services/api/errors';
import { useNetworkStore } from '../../state/networkStore';
import { ScreenState, type ScreenStateProps } from './ScreenState';

type Query = ScreenStateProps<string[]>['query'];

const query = (overrides: Partial<Query> = {}): Query => ({
  data: undefined,
  isPending: false,
  isError: false,
  error: null,
  isFetching: false,
  refetch: jest.fn(),
  ...overrides,
});

function renderState(q: Query, extra: Partial<ScreenStateProps<string[]>> = {}) {
  return render(
    <ScreenState
      query={q}
      skeleton={<Text>Loading shape</Text>}
      errorTitle="Couldn't load your products"
      empty={{ title: 'No products yet' }}
      {...extra}
    >
      {data => <Text>{data.join(', ')}</Text>}
    </ScreenState>,
  );
}

beforeEach(() => {
  useNetworkStore.setState({ isOffline: false });
});

describe('ScreenState', () => {
  it('shows the skeleton on the first load', async () => {
    await renderState(query({ isPending: true }));
    expect(screen.getByText('Loading shape')).toBeTruthy();
    expect(screen.queryByText("Couldn't load your products")).toBeNull();
  });

  it('shows the failure in plain words with a Retry that refetches, when nothing is cached', async () => {
    const refetch = jest.fn();
    await renderState(
      query({
        isError: true,
        refetch,
        error: new ApiError({ status: 404, code: 'not_found', kind: 'notFound', message: 'Not Found' }),
      }),
    );

    expect(screen.getByText("Couldn't load your products")).toBeTruthy();
    // The stable code's message, never the server's English title.
    expect(screen.getByText('That could not be found. It may have been removed.')).toBeTruthy();
    expect(screen.queryByText('Not Found')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the skeleton again while a retry runs, instead of a Retry that does nothing', async () => {
    await renderState(query({ isError: true, isFetching: true, error: new Error('offline') }));
    expect(screen.getByText('Loading shape')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('shows the empty state for an empty result, and the content otherwise', async () => {
    await renderState(query({ data: [] }));
    expect(screen.getByText('No products yet')).toBeTruthy();

    await renderState(query({ data: ['Urea', 'DAP'] }));
    expect(screen.getByText('Urea, DAP')).toBeTruthy();
    expect(screen.queryByText('No products yet')).toBeNull();
  });

  it('shows the empty state when the query settled with no data at all', async () => {
    await renderState(query());
    expect(screen.getByText('No products yet')).toBeTruthy();
  });

  it('keeps the cached copy under a Retry banner when a refetch fails online', async () => {
    const refetch = jest.fn();
    await renderState(query({ data: ['Urea'], isError: true, error: new Error('Boom'), refetch }));

    expect(screen.getByText('Urea')).toBeTruthy();
    expect(screen.getByText("Couldn't load your products")).toBeTruthy();
    expect(screen.getByText('Showing the last copy saved on this phone.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('hides Retry on the cached copy while the refetch runs', async () => {
    await renderState(query({ data: ['Urea'], isError: true, isFetching: true, error: new Error('Boom') }));
    expect(screen.getByText('Showing the last copy saved on this phone.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('adds no banner of its own offline, where the global OfflineBanner already explains the old copy', async () => {
    useNetworkStore.setState({ isOffline: true });
    await renderState(query({ data: ['Urea'], isError: true, error: new Error('Network request failed') }));

    expect(screen.getByText('Urea')).toBeTruthy();
    expect(screen.queryByText("Couldn't load your products")).toBeNull();
  });
});

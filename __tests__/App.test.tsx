/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { queryClient } from '../frontend/hooks/queryClient';

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  // Unmount and empty the app's query client, so no listener or cache timer outlives the test (in one process,
  // as in CI, a leftover timer keeps Jest from exiting).
  await ReactTestRenderer.act(() => renderer?.unmount());
  queryClient.clear();
});

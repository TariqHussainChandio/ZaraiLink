import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { ThemeProvider } from '../../theme';
import { logger } from '../../utils/logger';
import { ErrorBoundary } from './ErrorBoundary';

let shouldThrow = true;

function Broken() {
  if (shouldThrow) throw new Error('render failed');
  return <Text>recovered</Text>;
}

async function renderBoundary() {
  return await render(
    <ThemeProvider>
      <ErrorBoundary name="test navigator">
        <Broken />
      </ErrorBoundary>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  shouldThrow = true;
  // React logs the caught error itself; that noise is not what is under test.
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('shows a retry screen instead of a blank app when a screen throws while rendering', async () => {
    await renderBoundary();

    expect(screen.getByText('This screen stopped working')).toBeTruthy();
    expect(screen.queryByText('recovered')).toBeNull();
  });

  it('records which boundary caught what', async () => {
    await renderBoundary();

    expect(logger.warn).toHaveBeenCalledWith('ErrorBoundary:test navigator', expect.objectContaining({ message: 'render failed' }));
  });

  it('renders the screen again when the user retries and the problem is gone', async () => {
    await renderBoundary();
    shouldThrow = false;

    await fireEvent.press(screen.getByText('Try again'));

    expect(screen.getByText('recovered')).toBeTruthy();
  });

  it('shows the retry screen again when the problem is still there', async () => {
    await renderBoundary();

    await fireEvent.press(screen.getByText('Try again'));

    expect(screen.getByText('This screen stopped working')).toBeTruthy();
  });

  it('renders its children untouched when nothing throws', async () => {
    shouldThrow = false;
    await renderBoundary();

    expect(screen.getByText('recovered')).toBeTruthy();
  });
});

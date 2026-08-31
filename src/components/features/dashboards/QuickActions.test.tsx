import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QuickActions } from './QuickActions';

describe('QuickActions', () => {
  it('renders every action label', async () => {
    await render(
      <QuickActions
        actions={[
          { label: 'Analytics', onPress: () => {} },
          { label: 'View Orders', onPress: () => {} },
        ]}
      />,
    );
    expect(screen.getByText('Analytics')).toBeTruthy();
    expect(screen.getByText('View Orders')).toBeTruthy();
  });

  it('calls the right action\'s onPress when tapped', async () => {
    const onPressAnalytics = jest.fn();
    const onPressOrders = jest.fn();
    await render(
      <QuickActions
        actions={[
          { label: 'Analytics', onPress: onPressAnalytics },
          { label: 'View Orders', onPress: onPressOrders },
        ]}
      />,
    );
    fireEvent.press(screen.getByText('View Orders'));
    expect(onPressOrders).toHaveBeenCalledTimes(1);
    expect(onPressAnalytics).not.toHaveBeenCalled();
  });

  it('renders nothing when there are no actions', async () => {
    await render(<QuickActions actions={[]} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

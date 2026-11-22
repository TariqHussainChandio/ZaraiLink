import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { lightTheme } from '../../theme';
import { SwitchRow } from './SwitchRow';

describe('SwitchRow', () => {
  it('is one switch stop with its name, its description and its state', async () => {
    await render(
      <SwitchRow label="Notifications" description="Order and message alerts" value onValueChange={() => undefined} />,
    );
    const row = screen.getByRole('switch', { name: 'Notifications' });
    expect(row).toBeChecked();
    expect(row.props.accessibilityHint).toBe('Order and message alerts');
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('is a full 48 dp target: a tap anywhere on the row flips the value (A8)', async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow label="Default location" value={false} onValueChange={onValueChange} />);
    const row = screen.getByRole('switch', { name: 'Default location' });
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(lightTheme.size.touchMin);

    await fireEvent.press(screen.getByText('Default location'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('does nothing while disabled, and says so', async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow label="Default location" value disabled onValueChange={onValueChange} />);
    const row = screen.getByRole('switch', { name: 'Default location' });
    expect(row).toBeDisabled();
    await fireEvent.press(row);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

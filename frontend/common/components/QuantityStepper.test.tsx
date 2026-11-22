import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { lightTheme } from '../../theme';
import { QuantityStepper } from './QuantityStepper';

function Harness({ initial = 3, max, min }: { initial?: number; max?: number; min?: number }) {
  const [value, setValue] = useState(initial);
  return <QuantityStepper value={value} onChange={setValue} unit="bag" min={min} max={max} />;
}

describe('QuantityStepper', () => {
  it('adds and takes away one with 48 dp buttons named for what they count', async () => {
    await render(<Harness />);
    const more = screen.getByRole('button', { name: 'One more bag' });
    const fewer = screen.getByRole('button', { name: 'One fewer bag' });
    for (const button of [more, fewer]) {
      const style = StyleSheet.flatten(button.props.style);
      expect(style.width).toBe(lightTheme.size.touchMin);
      expect(style.height).toBe(lightTheme.size.touchMin);
    }
    await fireEvent.press(more);
    expect(screen.getByRole('button', { name: '4 bags' })).toBeTruthy();
    await fireEvent.press(fewer);
    await fireEvent.press(fewer);
    expect(screen.getByRole('button', { name: '2 bags' })).toBeTruthy();
  });

  it('says one bag in the singular', async () => {
    await render(<Harness initial={1} />);
    expect(screen.getByRole('button', { name: '1 bag' })).toBeTruthy();
  });

  it('stops taking away at the least allowed', async () => {
    await render(<Harness initial={1} min={1} />);
    const fewer = screen.getByRole('button', { name: 'One fewer bag' });
    expect(fewer.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(fewer);
    expect(screen.getByRole('button', { name: '1 bag' })).toBeTruthy();
  });

  it('stops adding at the stock', async () => {
    await render(<Harness initial={340} max={340} />);
    expect(screen.getByRole('button', { name: 'One more bag' }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('opens a numeric box when the number is tapped, for a large order', async () => {
    await render(<Harness initial={3} max={340} />);
    await fireEvent.press(screen.getByRole('button', { name: '3 bags' }));
    const box = screen.getByLabelText('Number of bags');
    expect(box.props.keyboardType).toBe('number-pad');
    await fireEvent.changeText(box, '120');
    await fireEvent(box, 'submitEditing');
    expect(screen.getByRole('button', { name: '120 bags' })).toBeTruthy();
  });

  it('takes the digits out of what is typed, so 1,500 is 1500 and never 0', async () => {
    await render(<Harness initial={3} />);
    await fireEvent.press(screen.getByRole('button', { name: '3 bags' }));
    await fireEvent.changeText(screen.getByLabelText('Number of bags'), '1,500');
    await fireEvent(screen.getByLabelText('Number of bags'), 'blur');
    expect(screen.getByRole('button', { name: '1,500 bags' })).toBeTruthy();
  });

  it('cuts a typed number down to the stock and says so inline', async () => {
    await render(<Harness initial={3} max={340} />);
    await fireEvent.press(screen.getByRole('button', { name: '3 bags' }));
    await fireEvent.changeText(screen.getByLabelText('Number of bags'), '500');
    await fireEvent(screen.getByLabelText('Number of bags'), 'submitEditing');
    expect(screen.getByRole('button', { name: '340 bags' })).toBeTruthy();
    expect(screen.getByText('Only 340 bags in stock')).toBeTruthy();
  });

  it('raises a typed number to the least allowed', async () => {
    await render(<Harness initial={5} min={1} />);
    await fireEvent.press(screen.getByRole('button', { name: '5 bags' }));
    await fireEvent.changeText(screen.getByLabelText('Number of bags'), '0');
    await fireEvent(screen.getByLabelText('Number of bags'), 'submitEditing');
    expect(screen.getByRole('button', { name: '1 bag' })).toBeTruthy();
  });

  it('leaves the number alone when the box is emptied', async () => {
    await render(<Harness initial={7} />);
    await fireEvent.press(screen.getByRole('button', { name: '7 bags' }));
    await fireEvent.changeText(screen.getByLabelText('Number of bags'), '');
    await fireEvent(screen.getByLabelText('Number of bags'), 'blur');
    expect(screen.getByRole('button', { name: '7 bags' })).toBeTruthy();
  });

  it('says it when the stock drops below the quantity already chosen', async () => {
    await render(<QuantityStepper value={500} onChange={() => undefined} max={340} unit="bag" />);
    expect(screen.getByText('Only 340 bags in stock')).toBeTruthy();
  });

  it('says nothing while the quantity is within the stock', async () => {
    await render(<Harness initial={3} max={340} />);
    expect(screen.queryByText(/in stock/)).toBeNull();
  });
});

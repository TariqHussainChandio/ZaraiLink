import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import { lightTheme } from '../../../theme';
import { BarChart } from './BarChart';

describe('BarChart', () => {
  it('shows the default empty message when there is no data', async () => {
    await render(<BarChart data={[]} color="#2E7D32" />);
    expect(screen.getByText('No data yet')).toBeTruthy();
  });

  it('shows a custom empty message', async () => {
    await render(<BarChart data={[]} color="#2E7D32" emptyMessage="No sales yet" />);
    expect(screen.getByText('No sales yet')).toBeTruthy();
  });

  it('renders a label and raw value per bar by default', async () => {
    await render(
      <BarChart
        data={[
          { label: 'Jan', value: 10 },
          { label: 'Feb', value: 20 },
        ]}
        color="#2E7D32"
      />,
    );
    expect(screen.getByText('Jan')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('Feb')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
  });

  it('formats the value with formatValue when given', async () => {
    await render(
      <BarChart data={[{ label: 'Jan', value: 500 }]} color="#2E7D32" formatValue={v => `Rs ${v}`} />,
    );
    expect(screen.getByText('Rs 500')).toBeTruthy();
  });

  it('scales the tallest bar to the full bar area, and shorter bars proportionally', async () => {
    await render(
      <BarChart
        data={[
          { label: 'Jan', value: 10 },
          { label: 'Feb', value: 20 },
        ]}
        color="#2E7D32"
        height={140}
      />,
    );
    // `height` is the bar area alone: the value above and the label below sit outside it.
    expect(screen.getByTestId('bar-Feb').props.style[1].height).toBe(140);
    expect(screen.getByTestId('bar-Jan').props.style[1].height).toBe(70);
  });

  it('keeps the labels out of the bar area, so they cannot overlap a bar at a large font scale', async () => {
    await render(<BarChart data={[{ label: 'Jan', value: 10 }]} color="#2E7D32" height={100} />);
    const track = screen.getByTestId('bar-Jan').parent;
    expect(StyleSheet.flatten(track?.props.style).height).toBe(100);
    expect(within(track?.parent as never).getByText('Jan')).toBeTruthy();
    expect(within(track as never).queryByText('Jan')).toBeNull();
  });

  it('floors bar height so a zero value stays visible', async () => {
    await render(
      <BarChart
        data={[
          { label: 'Zero', value: 0 },
          { label: 'Max', value: 100 },
        ]}
        color="#2E7D32"
      />,
    );
    expect(screen.getByTestId('bar-Zero').props.style[1].height).toBe(lightTheme.borders.band);
  });

  it('draws in the shell accent when it is given no colour', async () => {
    await render(<BarChart data={[{ label: 'Jan', value: 10 }]} />);
    expect(screen.getByTestId('bar-Jan').props.style[1].backgroundColor).toBe(lightTheme.colors.accent.brand.mark);
  });

  it('is one picture to a screen reader, summarised in a sentence', async () => {
    await render(
      <BarChart
        data={[
          { label: 'Aug', value: 12 },
          { label: 'Sep', value: 18 },
        ]}
        formatValue={v => `${v} orders`}
      />,
    );
    expect(screen.getByRole('image', { name: 'Aug 12 orders, Sep 18 orders' })).toBeTruthy();
  });

  it('lets a screen say what the chart shows', async () => {
    await render(<BarChart data={[{ label: 'Aug', value: 12 }]} accessibilityLabel="Orders by month, rising" />);
    expect(screen.getByRole('image', { name: 'Orders by month, rising' })).toBeTruthy();
  });
});

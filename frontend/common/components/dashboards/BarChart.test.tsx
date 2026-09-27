import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
      <BarChart data={[{ label: 'Jan', value: 500 }]} color="#2E7D32" formatValue={v => `Rs. ${v}`} />,
    );
    expect(screen.getByText('Rs. 500')).toBeTruthy();
  });

  it('scales the tallest bar to the full available height, and shorter bars proportionally', async () => {
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
    // barTrack area = height - 40 = 100; tallest bar (value 20, the max) fills it, the half-as-tall
    // bar (value 10) gets half that.
    expect(screen.getByTestId('bar-Feb').props.style[1].height).toBe(100);
    expect(screen.getByTestId('bar-Jan').props.style[1].height).toBe(50);
  });

  it('floors bar height at 4px so a zero/near-zero value stays visible', async () => {
    await render(
      <BarChart
        data={[
          { label: 'Zero', value: 0 },
          { label: 'Max', value: 100 },
        ]}
        color="#2E7D32"
      />,
    );
    expect(screen.getByTestId('bar-Zero').props.style[1].height).toBe(4);
  });
});

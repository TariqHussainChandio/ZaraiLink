import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { lightColors } from '../../theme';
import { STATUS } from '../constants/status';
import { StatusBadge } from './StatusBadge';

function colourOf(text: ReturnType<typeof screen.getByText>): string | undefined {
  const styles = ([] as { color?: string }[]).concat(text.props.style).flat(Infinity) as { color?: string }[];
  return styles.reduce<string | undefined>((found, s) => s?.color ?? found, undefined);
}

describe('StatusBadge', () => {
  it.each(Object.entries(STATUS.order))('shows the order status %s by its word', async (status, meta) => {
    await render(<StatusBadge kind="order" status={status as keyof typeof STATUS.order} />);
    expect(screen.getByText(meta.label)).toBeTruthy();
  });

  it.each(Object.entries(STATUS.payment))('shows the payment status %s by its word', async (status, meta) => {
    await render(<StatusBadge kind="payment" status={status as keyof typeof STATUS.payment} />);
    expect(screen.getByText(meta.label)).toBeTruthy();
  });

  it('never offers a held, escrow or release payment state (BR-11)', () => {
    const words = Object.values(STATUS.payment).map(m => m.label.toLowerCase());
    expect(words.some(w => /held|escrow|release/.test(w))).toBe(false);
  });

  it('draws a failure as the one solid block, with the on-accent text colour', async () => {
    await render(<StatusBadge kind="order" status="rejected" />);
    expect(colourOf(screen.getByText('Rejected'))).toBe(lightColors.onAccent);
  });

  it('draws a waiting state on its tint, in the tone ink', async () => {
    await render(<StatusBadge kind="application" status="pending" />);
    expect(colourOf(screen.getByText('Under review'))).toBe(lightColors.status.warning.ink);
  });

  it('shows a status this build does not know as a neutral badge with its own word, instead of crashing', async () => {
    // An installed build meets new API values before it is updated (D5 adds `dispatched` in A4).
    await render(<StatusBadge kind="order" status={'dispatched' as never} />);
    expect(screen.getByText('Dispatched')).toBeTruthy();
    await render(<StatusBadge kind="payment" status={'partially_paid' as never} />);
    expect(screen.getByText('Partially paid')).toBeTruthy();
  });

  it('reads only the vocabulary itself, not what its lookup object inherits', async () => {
    await render(<StatusBadge kind="order" status={'constructor' as never} />);
    expect(screen.getByText('Constructor')).toBeTruthy();
  });

  it('gives every status in every kind an icon and a word', () => {
    for (const table of Object.values(STATUS)) {
      for (const meta of Object.values(table)) {
        expect(meta.icon).toBeTruthy();
        expect(meta.label.length).toBeGreaterThan(0);
      }
    }
  });
});

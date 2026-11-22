import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PriorityBadge, priorityLabel } from './PriorityBadge';

describe('PriorityBadge', () => {
  it.each([
    ['high', 'High priority'],
    ['medium', 'Medium priority'],
    ['low', 'Low priority'],
  ] as const)('says %s in words', async (priority, label) => {
    await render(<PriorityBadge priority={priority} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(priorityLabel(priority)).toBe(label);
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { RoleBadge } from './RoleBadge';
import { ROLES, ROLE_LABELS } from '../../constants/roles';

describe('RoleBadge', () => {
  it.each(ROLES)('renders the label for role "%s"', async role => {
    await render(<RoleBadge role={role} />);
    expect(screen.getByText(ROLE_LABELS[role])).toBeTruthy();
  });
});

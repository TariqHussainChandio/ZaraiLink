import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Skeleton, SkeletonCard, SkeletonList, SkeletonListItem } from './Skeleton';

describe('Skeleton', () => {
  it('renders without crashing', async () => {
    await render(<Skeleton />);
    expect(screen.toJSON()).toBeTruthy();
  });
});

describe('SkeletonCard', () => {
  it('renders without crashing', async () => {
    await render(<SkeletonCard />);
    expect(screen.toJSON()).toBeTruthy();
  });
});

describe('SkeletonListItem', () => {
  it('renders without crashing', async () => {
    await render(<SkeletonListItem />);
    expect(screen.toJSON()).toBeTruthy();
  });
});

describe('SkeletonList', () => {
  it('defaults to 6 repeated rows', async () => {
    await render(<SkeletonList />);
    const tree = screen.toJSON();
    const children = Array.isArray(tree) ? tree : tree?.children;
    expect(children).toHaveLength(6);
  });

  it('renders the requested count', async () => {
    await render(<SkeletonList count={3} />);
    const tree = screen.toJSON();
    const children = Array.isArray(tree) ? tree : tree?.children;
    expect(children).toHaveLength(3);
  });
});

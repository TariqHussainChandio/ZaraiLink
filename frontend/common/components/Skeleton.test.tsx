import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { lightTheme } from '../../theme';
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

describe('SkeletonCard image', () => {
  it('is exactly as tall as the photo on a listing card, so the grid does not jump when the cards arrive', async () => {
    await render(<SkeletonCard />);
    const tree = screen.toJSON();
    const card = Array.isArray(tree) ? tree[0] : tree;
    const image = card?.children?.[0];
    if (!image || typeof image === 'string') throw new Error('the card skeleton has no image block');
    expect(StyleSheet.flatten(image.props.style).height).toBe(lightTheme.size.photoLg);
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

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { PhotoViewer } from './PhotoViewer';

const photos = [
  { uri: 'https://example.test/leaf-1.jpg', label: 'Leaf, front' },
  { uri: 'https://example.test/leaf-2.jpg', label: 'Leaf, back' },
  { uri: 'https://example.test/leaf-3.jpg' },
  { uri: 'https://example.test/leaf-4.jpg' },
];

/** The scale the photo with this label is drawn at (Animated resolves its values into the style it hands the view). */
function scaleOf(label: string): number | undefined {
  const { transform } = StyleSheet.flatten(screen.getByLabelText(label).props.style);
  const entry = (transform as { scale?: number }[] | undefined)?.find(t => t.scale !== undefined);
  return entry?.scale;
}

describe('PhotoViewer', () => {
  it('shows nothing until it is opened', async () => {
    await render(<PhotoViewer visible={false} onClose={() => undefined} photos={photos} />);
    expect(screen.queryByText('1 of 4')).toBeNull();
  });

  it('opens on the first photo and says where it is: "1 of 4"', async () => {
    await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
    expect(screen.getByText('1 of 4')).toBeTruthy();
    expect(screen.getByLabelText('Leaf, front')).toBeTruthy();
  });

  it('opens on the photo that was asked for', async () => {
    await render(<PhotoViewer visible onClose={() => undefined} photos={photos} initialIndex={2} />);
    expect(screen.getByText('3 of 4')).toBeTruthy();
    expect(screen.getByLabelText('Photo 3 of 4')).toBeTruthy();
  });

  it('moves to the next and the previous photo', async () => {
    await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByText('2 of 4')).toBeTruthy();
    expect(screen.getByLabelText('Leaf, back')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Previous photo' }));
    expect(screen.getByText('1 of 4')).toBeTruthy();
  });

  it('offers no previous on the first photo and no next on the last', async () => {
    await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
    expect(screen.queryByRole('button', { name: 'Previous photo' })).toBeNull();
    await render(<PhotoViewer visible onClose={() => undefined} photos={photos} initialIndex={3} />);
    expect(screen.queryByRole('button', { name: 'Next photo' })).toBeNull();
  });

  it('offers no next or previous for a single photo', async () => {
    await render(<PhotoViewer visible onClose={() => undefined} photos={photos.slice(0, 1)} />);
    expect(screen.getByText('1 of 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next photo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous photo' })).toBeNull();
  });

  it('has a labelled close that closes it', async () => {
    const onClose = jest.fn();
    await render(<PhotoViewer visible onClose={onClose} photos={photos} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close photos' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has zoom buttons, because a screen reader cannot pinch', async () => {
    await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    await fireEvent.press(zoomIn);
    await fireEvent.press(zoomOut);
    expect(screen.getByLabelText('Leaf, front')).toBeTruthy();
  });

  it('draws the photo scaled when zoomed in and whole again when zoomed out', async () => {
    await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
    expect(scaleOf('Leaf, front')).toBe(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Zoom in' }));
    expect(scaleOf('Leaf, front')).toBe(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Zoom out' }));
    expect(scaleOf('Leaf, front')).toBe(1);
  });

  it('does not zoom past four times, or below the whole photo', async () => {
    await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
    for (let i = 0; i < 6; i += 1) await fireEvent.press(screen.getByRole('button', { name: 'Zoom in' }));
    expect(scaleOf('Leaf, front')).toBe(4);
    for (let i = 0; i < 8; i += 1) await fireEvent.press(screen.getByRole('button', { name: 'Zoom out' }));
    expect(scaleOf('Leaf, front')).toBe(1);
  });

  it('shows the next photo whole, not zoomed like the last', async () => {
    await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Zoom in' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next photo' }));
    expect(scaleOf('Leaf, back')).toBe(1);
  });

  describe('with a hand', () => {
    it('zooms in as the fingers spread, and keeps the zoom where they let go', async () => {
      await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
      await act(async () => fireGestureHandler(getByGestureTestId('photo-pinch'), [{ scale: 1 }, { scale: 1.5 }, { scale: 2.5 }]));
      expect(scaleOf('Leaf, front')).toBe(2.5);
    });

    it('is held to four times however far the fingers spread', async () => {
      await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
      await act(async () => fireGestureHandler(getByGestureTestId('photo-pinch'), [{ scale: 1 }, { scale: 9 }]));
      expect(scaleOf('Leaf, front')).toBe(4);
    });

    it('goes back to the whole photo when the fingers close past it', async () => {
      await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
      await act(async () => fireGestureHandler(getByGestureTestId('photo-pinch'), [{ scale: 1 }, { scale: 0.4 }]));
      expect(scaleOf('Leaf, front')).toBe(1);
    });

    it('zooms in on a double tap and out on the next', async () => {
      await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
      await act(async () => fireGestureHandler(getByGestureTestId('photo-double-tap'), [{ state: 5 }]));
      expect(scaleOf('Leaf, front')).toBeGreaterThan(1);
      await act(async () => fireGestureHandler(getByGestureTestId('photo-double-tap'), [{ state: 5 }]));
      expect(scaleOf('Leaf, front')).toBe(1);
    });

    it('moves a zoomed photo with a drag, and leaves a whole photo where it is', async () => {
      await render(<PhotoViewer visible onClose={() => undefined} photos={photos} />);
      const shift = () => {
        const { transform } = StyleSheet.flatten(screen.getByLabelText('Leaf, front').props.style);
        return (transform as { translateX?: number }[]).find(t => t.translateX !== undefined)?.translateX;
      };
      await act(async () => fireGestureHandler(getByGestureTestId('photo-drag'), [{ translationX: 0 }, { translationX: 40 }]));
      expect(shift()).toBe(0);
      await fireEvent.press(screen.getByRole('button', { name: 'Zoom in' }));
      await act(async () => fireGestureHandler(getByGestureTestId('photo-drag'), [{ translationX: 0 }, { translationX: 40 }]));
      expect(shift()).toBe(40);
    });
  });
});

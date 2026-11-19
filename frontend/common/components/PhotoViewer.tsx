import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useInsets } from '../../hooks/useInsets';
import { type Theme, useTheme } from '../../theme';
import { IconButton } from './TopAppBar';

interface ViewerPhoto {
  uri: string;
  /** What the photo shows, for a screen reader ("Leaf with brown spots"). */
  label?: string;
}

export interface PhotoViewerProps {
  visible: boolean;
  onClose: () => void;
  photos: ViewerPhoto[];
  /** The photo to open on. */
  initialIndex?: number;
}

// Behaviour limits, not design values: how far a photo zooms, and by how much a zoom button steps.
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1;
const DOUBLE_TAP_ZOOM = 2.5;

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** One photo's zoom and position: the Animated values the image is drawn from, and where the last gesture left them, so
 * the next gesture continues from there instead of snapping back. A plain object held in state (not refs) because the
 * gestures that drive it are built while rendering and run later, on the JS thread. */
class Zoom {
  readonly scale = new Animated.Value(MIN_ZOOM);
  readonly pan = new Animated.ValueXY();
  private zoom = MIN_ZOOM;
  private x = 0;
  private y = 0;
  private liveZoom = MIN_ZOOM;
  private liveX = 0;
  private liveY = 0;

  get isZoomed() {
    return this.zoom > MIN_ZOOM;
  }

  get current() {
    return this.zoom;
  }

  reset() {
    this.set(MIN_ZOOM, 0, 0);
  }

  /** Jumps to a zoom level, keeping the position unless the photo is whole again. */
  to(zoom: number) {
    const next = clampZoom(zoom);
    this.set(next, next === MIN_ZOOM ? 0 : this.x, next === MIN_ZOOM ? 0 : this.y);
  }

  pinch(gestureScale: number) {
    this.liveZoom = clampZoom(this.zoom * gestureScale);
    this.scale.setValue(this.liveZoom);
  }

  endPinch() {
    this.to(this.liveZoom);
  }

  drag(translationX: number, translationY: number) {
    // A photo that is not zoomed has nowhere to go.
    if (!this.isZoomed) return;
    this.liveX = this.x + translationX;
    this.liveY = this.y + translationY;
    this.pan.setValue({ x: this.liveX, y: this.liveY });
  }

  endDrag() {
    if (this.isZoomed) {
      this.x = this.liveX;
      this.y = this.liveY;
    }
  }

  private set(zoom: number, x: number, y: number) {
    this.zoom = this.liveZoom = zoom;
    this.x = this.liveX = x;
    this.y = this.liveY = y;
    this.scale.setValue(zoom);
    this.pan.setValue({ x, y });
  }
}

/** A full-screen look at the photos of one thing (a listing, a plant, an application's documents): pinch or double-tap to
 * zoom, drag a zoomed photo around, next and previous, "2 of 4", and a labelled close. TalkBack cannot pinch, so zoom has
 * buttons too. It is built on gesture-handler's JS-thread callbacks and React Native's Animated; there is no reanimated
 * in this app. */
export function PhotoViewer({ visible, onClose, photos, initialIndex = 0 }: PhotoViewerProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useInsets();
  const [index, setIndex] = useState(initialIndex);
  const [zoom] = useState(() => new Zoom());
  const [wasVisible, setWasVisible] = useState(visible);

  // Opening starts on the requested photo.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setIndex(Math.min(initialIndex, Math.max(0, photos.length - 1)));
  }

  // Closing puts the zoom back, so the next photo opens whole.
  const close = () => {
    zoom.reset();
    onClose();
  };

  const go = (to: number) => {
    zoom.reset();
    setIndex(to);
  };

  const gestures = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pinch()
          .runOnJS(true)
          .withTestId('photo-pinch')
          .onUpdate(event => zoom.pinch(event.scale))
          .onEnd(() => zoom.endPinch()),
        Gesture.Pan()
          .runOnJS(true)
          .withTestId('photo-drag')
          .minPointers(1)
          .onUpdate(event => zoom.drag(event.translationX, event.translationY))
          .onEnd(() => zoom.endDrag()),
        Gesture.Tap()
          .runOnJS(true)
          .withTestId('photo-double-tap')
          .numberOfTaps(2)
          .onEnd(() => zoom.to(zoom.isZoomed ? MIN_ZOOM : DOUBLE_TAP_ZOOM)),
      ),
    [zoom],
  );
  const photo = photos[index];
  const count = photos.length;

  return (
    <Modal visible={visible} onRequestClose={close} animationType="fade" statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        {photo ? (
          <GestureDetector gesture={gestures}>
            <Animated.View style={styles.stage} collapsable={false}>
              <Animated.Image
                source={{ uri: photo.uri }}
                resizeMode="contain"
                style={[styles.photo, { transform: [{ translateX: zoom.pan.x }, { translateY: zoom.pan.y }, { scale: zoom.scale }] }]}
                accessibilityLabel={photo.label ?? `Photo ${index + 1} of ${count}`}
              />
            </Animated.View>
          </GestureDetector>
        ) : null}

        <View style={[styles.top, { paddingTop: insets.top }]}>
          <Text style={styles.counter} accessibilityLiveRegion="polite">{`${Math.min(index + 1, count)} of ${count}`}</Text>
          <IconButton icon={ZoomOut} label="Zoom out" color={theme.colors.onBoard} onPress={() => zoom.to(zoom.current - ZOOM_STEP)} />
          <IconButton icon={ZoomIn} label="Zoom in" color={theme.colors.onBoard} onPress={() => zoom.to(zoom.current + ZOOM_STEP)} />
          <IconButton icon={X} label="Close photos" color={theme.colors.onBoard} onPress={close} />
        </View>

        {count > 1 ? (
          <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, theme.space[4]) }]}>
            {index > 0 ? (
              <IconButton icon={ChevronLeft} label="Previous photo" color={theme.colors.onBoard} onPress={() => go(index - 1)} />
            ) : (
              <View style={styles.placeholder} />
            )}
            {index < count - 1 ? (
              <IconButton icon={ChevronRight} label="Next photo" color={theme.colors.onBoard} onPress={() => go(index + 1)} />
            ) : (
              <View style={styles.placeholder} />
            )}
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function makeStyles({ colors, dark, space, size, typography }: Theme) {
  return StyleSheet.create({
    // Near-black in both themes from the tokens that already are: `ground` in the dark theme, `ink` in the light one.
    root: { flex: 1, backgroundColor: dark ? colors.ground : colors.ink },
    stage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
    photo: { width: '100%', height: '100%' },
    top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2] },
    counter: { ...typography.label, flex: 1, color: colors.onBoard, paddingHorizontal: space[2] },
    bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space[2] },
    placeholder: { width: size.touchMin, height: size.touchMin },
  });
}

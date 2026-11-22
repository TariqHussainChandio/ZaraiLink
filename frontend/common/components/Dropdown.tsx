import React, { useEffect, useMemo, useState } from 'react';
import { type GestureResponderEvent, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useInsets } from '../../hooks/useInsets';
import { type Theme, useTheme } from '../../theme';

/** Where the control that opened a dropdown sits on the screen, from `measureInWindow`. */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a control is on the screen, for the dropdown it opens. Call it from the press handler with the control's ref
 * (a plain View or Pressable); null when there is nothing to measure. */
export function measureAnchor(node: View | null): Promise<AnchorRect | null> {
  return new Promise(resolve => {
    if (!node) {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

/** The point a finger pressed, as an anchor: a menu opened from a list row appears where the row was tapped. A press
 * with no position (TalkBack's double tap can send none) opens the menu centred. */
export function anchorFromPress(event?: GestureResponderEvent): AnchorRect | null {
  const point = event?.nativeEvent;
  return point && Number.isFinite(point.pageX) && Number.isFinite(point.pageY)
    ? { x: point.pageX, y: point.pageY, width: 0, height: 0 }
    : null;
}

export interface DropdownProps {
  visible: boolean;
  /** The control it opens from; null opens it centred on the screen (the control could not be measured); undefined
   * while it is being measured, when the list is laid out but not yet shown, so it never jumps. */
  anchor: AnchorRect | null | undefined;
  onClose: () => void;
  /** Names the list for TalkBack. */
  label: string;
  /** Above the list and not scrolled with it, such as a search box. */
  header?: React.ReactNode;
  /** The list. It is given the height it may use, so a long one can virtualise inside a bounded box. */
  children: (listMaxHeight: number) => React.ReactNode;
}

/**
 * Options open where they were asked for (D19): directly under the field or button that was tapped, as wide as it, and
 * above it when there is no room below (near the bottom of the screen, or with the keyboard up). Tapping outside, the
 * back gesture, or choosing an option closes it. It replaces the bottom sheet for picking one option from a list; a sheet
 * stays for a task with its own form (a reason, a price range).
 */
export function Dropdown({ visible, anchor, onClose, label, header, children }: DropdownProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const window = useWindowDimensions();
  const insets = useInsets();
  const keyboard = useKeyboardHeight();
  const keyboardHeight = visible ? keyboard : 0;
  const [headerHeight, setHeaderHeight] = useState(0);
  const { gap, margin, maxHeight, padding } = theme.components.dropdown;

  // The room on each side of the control, inside the safe area and above the keyboard.
  const top = insets.top + margin;
  const bottom = window.height - insets.bottom - keyboardHeight - margin;
  const width = Math.min(
    Math.max(anchor?.width ?? 0, theme.size.dropdownMinWidth),
    window.width - insets.left - insets.right - margin * 2,
  );
  const left = anchor
    ? Math.min(Math.max(anchor.x, insets.left + margin), window.width - insets.right - margin - width)
    : (window.width - width) / 2;

  let position: { top?: number; bottom?: number; maxHeight: number };
  if (!anchor) {
    position = { top: Math.max(top, (window.height - maxHeight) / 2), maxHeight: Math.min(maxHeight, bottom - top) };
  } else {
    const below = bottom - (anchor.y + anchor.height + gap);
    const above = anchor.y - gap - top;
    // Below by preference; above only when that side has more room and below cannot hold the whole list.
    position =
      below >= maxHeight || below >= above
        ? { top: anchor.y + anchor.height + gap, maxHeight: Math.min(maxHeight, below) }
        : { bottom: window.height - anchor.y + gap, maxHeight: Math.min(maxHeight, above) };
  }
  const listMaxHeight = Math.max(theme.size.touchMin, position.maxHeight - headerHeight - padding * 2);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* No scrim colour: the screen stays readable around the list, as with any menu. On Android the backdrop is hidden
          from TalkBack (the back gesture closes the list), as in Sheet. */}
      <Pressable
        testID="dropdown-backdrop"
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={`Close ${label}`}
        importantForAccessibility="no-hide-descendants"
      />
      <View
        style={[
          styles.panel,
          { left, width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight },
          anchor === undefined && styles.measuring,
        ]}
        accessibilityViewIsModal
        accessibilityLabel={label}
        collapsable={false}
      >
        {header ? <View onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>{header}</View> : null}
        {children(listMaxHeight)}
      </View>
    </Modal>
  );
}

export interface DropdownMenuItem {
  label: string;
  onPress: () => void;
  /** Ends something for someone (a suspension, a demotion): its label is in the danger colour. */
  destructive?: boolean;
}

/** A short list of actions on one thing (a person, a listing), opened at the press. Choosing one closes the menu first;
 * the action then asks for its own confirmation where it needs one. */
export function DropdownMenu({
  visible,
  anchor,
  onClose,
  label,
  items,
}: Omit<DropdownProps, 'children' | 'header'> & { items: DropdownMenuItem[] }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Dropdown visible={visible} anchor={anchor} onClose={onClose} label={label}>
      {listMaxHeight => (
        <ScrollView style={{ maxHeight: listMaxHeight }}>
          {items.map(item => (
            <Pressable
              key={item.label}
              style={styles.item}
              android_ripple={{ color: theme.colors.ripple }}
              accessibilityRole="menuitem"
              accessibilityLabel={item.label}
              onPress={() => {
                onClose();
                item.onPress();
              }}
            >
              <Text style={item.destructive ? styles.itemDanger : styles.itemLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Dropdown>
  );
}

/** The keyboard's height while it is up, so a dropdown with a search box never sits under it. */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', event => setHeight(event.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return height;
}

function makeStyles({ colors, components, shadows, borders, size, space, typography, radius }: Theme) {
  const { dropdown } = components;
  return StyleSheet.create({
    panel: {
      position: 'absolute',
      padding: dropdown.padding,
      backgroundColor: colors.surface,
      borderRadius: dropdown.radius,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      overflow: 'hidden',
      ...shadows.elev2,
    },
    measuring: { opacity: 0 },
    item: { minHeight: size.touchMin, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: radius.xs },
    itemLabel: { ...typography.body, color: colors.ink },
    itemDanger: { ...typography.body, color: colors.status.danger.ink },
  });
}

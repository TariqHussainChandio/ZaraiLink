import { X } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { KeyboardAvoidingView, Modal, type ModalProps, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../../hooks/useInsets';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { type Theme, useTheme } from '../../theme';
import { IconButton } from './TopAppBar';

export interface SheetProps extends Pick<ModalProps, 'visible'> {
  onClose: () => void;
  /** Names the dialog and adds the close button. Optional in the type while screens migrate; every sheet should have one
   * (a sheet with no title has no close button and is announced as nothing). */
  title?: string;
  children: React.ReactNode;
  /** A sticky action row (a primary Button, or Cancel and Save), kept above the keyboard and the gesture inset however
   * long the body is. */
  footer?: React.ReactNode;
  /** Scroll the body (default). Turn off for a body that scrolls itself, such as a list: a list inside a scroll view
   * loses its virtualisation. */
  scroll?: boolean;
}

/** A bottom sheet for a task that belongs to the screen behind it: filters, a reason, recording stock, a confirmation. It
 * rises over the scrim with elevation 3. The body scrolls and the sheet stops at 90% of the window, so a long form never
 * pushes its footer off a small phone; the footer stays above the keyboard and the gesture inset. System back, the
 * backdrop and the close button dismiss it. With reduced motion on it appears without sliding. */
export function Sheet({ visible, onClose, title, children, footer, scroll = true }: SheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useInsets();
  const reduceMotion = useReducedMotion();

  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          testID="sheet-backdrop"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={title ? `Close ${title}` : 'Close'}
        />
        {/* `padding` lifts the sheet by the keyboard's height. The sheet's own maxHeight is a share of what is left, so
            it never rises past the top of the window. box-none: a tap above the sheet reaches the backdrop. */}
        <KeyboardAvoidingView behavior="padding" style={styles.avoider} pointerEvents="box-none">
          <View
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.components.sheet.padding) }]}
            accessibilityViewIsModal
            accessibilityLabel={title}
            collapsable={false}
          >
            <View style={styles.grip} />
            {title ? (
              <View style={styles.head}>
                <Text style={styles.title} accessibilityRole="header">
                  {title}
                </Text>
                <IconButton icon={X} label="Close" onPress={onClose} />
              </View>
            ) : null}
            {scroll ? (
              <ScrollView testID="sheet-body" style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
                {children}
              </ScrollView>
            ) : (
              <View style={styles.body}>{children}</View>
            )}
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function makeStyles({ colors, space, size, components, shadows, typography, radius, borders }: Theme) {
  const { sheet } = components;
  return StyleSheet.create({
    root: { flex: 1 },
    avoider: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      // On a tablet the sheet is a centred column, like the screens behind it.
      alignSelf: 'center',
      width: '100%',
      maxWidth: size.contentMax,
      maxHeight: sheet.maxHeight,
      backgroundColor: colors.surface,
      borderTopLeftRadius: sheet.radius,
      borderTopRightRadius: sheet.radius,
      paddingHorizontal: sheet.padding,
      paddingTop: space[2],
      ...shadows.elev3,
    },
    grip: {
      alignSelf: 'center',
      width: sheet.grip.width,
      height: sheet.grip.height,
      borderRadius: radius.pill,
      backgroundColor: colors.lineStrong,
      marginBottom: space[3],
    },
    head: { flexDirection: 'row', alignItems: 'center', minHeight: size.touchMin, marginBottom: space[2] },
    title: { ...typography.title, flex: 1, color: colors.ink },
    body: { flexShrink: 1 },
    bodyContent: { paddingBottom: space[2] },
    footer: { paddingTop: space[3], borderTopWidth: borders.hairline, borderTopColor: colors.line },
  });
}

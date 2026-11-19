import { X } from 'lucide-react-native';
import React, { useContext, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  type ModalProps,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { type Theme, useTheme } from '../../theme';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

export interface SheetProps extends Pick<ModalProps, 'visible'> {
  onClose: () => void;
  /** Names the task; with a title the sheet is announced as a dialog with that name. */
  title?: string;
  children: React.ReactNode;
}

/** A bottom sheet for a task that belongs to the screen behind it: filters, a reason, a stock adjustment. It rises over
 * the scrim with elevation 3; system back, the backdrop and the close button dismiss it. */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Read softly: App.tsx provides the insets; a component test that renders a picker on its own gets none, not a crash.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
      // Edge to edge (Android 15+): the modal window covers the status and navigation bars too, so the sheet reaches the
      // bottom edge instead of stopping part-way down the tab bar (A8 accessibility run, dark mode), and the insets
      // below keep its content clear of both bars.
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* The sheet rides up on the keyboard: a picker's search field focuses itself, and without this the keyboard
          covered the options it was filtering (B3 verification, N1). The modal window is not resized for the keyboard
          on Android (edge to edge), so padding is used on both platforms. */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <Pressable
          testID="sheet-backdrop"
          // At least the status bar plus a strip of scrim stays above a tall sheet, so its top never runs under the
          // status bar; the body below scrolls instead.
          style={[styles.backdrop, { minHeight: insets.top + theme.space[8] }]}
          onPress={onClose}
          // A full-screen "Close" stop was the first thing TalkBack found (A8). On Android the backdrop is hidden from
          // accessibility; the Close button and the back gesture close the sheet. iOS keeps it as the escape.
          accessible={Platform.OS !== 'android'}
          importantForAccessibility="no-hide-descendants"
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={[styles.sheet, { paddingBottom: theme.space[6] + insets.bottom }]}
          accessibilityViewIsModal
          accessibilityLabel={title}
        >
          <View style={styles.grip} />
          {/* The Close button is always there, titled or not: on Android it is the one way to close by touch that
              TalkBack offers besides the back gesture. */}
          <View style={styles.head}>
            {title ? (
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
            ) : (
              <View style={styles.titleSpace} />
            )}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}
            >
              <X color={theme.colors.ink} size={theme.size.iconMd} />
            </Pressable>
          </View>
          {/* The body scrolls when it is taller than the room left (a long Filters sheet kept Apply and Clear off the
              screen while `scrollEnabled` was off). `handled` still passes the first tap with the keyboard up to the
              button under it and closes the keyboard on a tap elsewhere (A7 emulator walk). A picker's own list inside
              scrolls on its own (`nestedScrollEnabled` in SelectField). */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.body}
            testID="sheet-body"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles({
  colors,
  space,
  size,
  components,
  shadows,
  typography,
  radius,
}: Theme) {
  const { sheet } = components;
  return StyleSheet.create({
    fill: { flex: 1 },
    // Shrinks with the sheet when the content is taller than the room above, so it scrolls.
    body: { flexGrow: 0, flexShrink: 1 },
    backdrop: { flex: 1, backgroundColor: colors.scrim },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: sheet.radius,
      borderTopRightRadius: sheet.radius,
      paddingHorizontal: sheet.padding,
      paddingTop: space[2],
      flexShrink: 1,
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
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: size.touchMin,
      marginBottom: space[2],
    },
    title: { ...typography.title, flex: 1, color: colors.ink },
    titleSpace: { flex: 1 },
    close: {
      width: size.touchMin,
      height: size.touchMin,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

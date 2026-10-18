import { X } from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  type ModalProps,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type Theme, useTheme } from '../../theme';

export interface SheetProps extends Pick<ModalProps, 'visible'> {
  onClose: () => void;
  /** Names the task; with a title the sheet gets a close button and is announced as a dialog with that name. */
  title?: string;
  children: React.ReactNode;
}

/** A bottom sheet for a task that belongs to the screen behind it: filters, a reason, a stock adjustment. It rises over
 * the scrim with elevation 3; system back, the backdrop and the close button dismiss it. */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      {/* The sheet rides up on the keyboard: a picker's search field focuses itself, and without this the keyboard
          covered the options it was filtering (B3 verification, N1). The modal window is not resized for the keyboard
          on Android (edge to edge), so padding is used on both platforms. */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <Pressable
          testID="sheet-backdrop"
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={styles.sheet}
          accessibilityViewIsModal
          accessibilityLabel={title}
        >
          <View style={styles.grip} />
          {title ? (
            <View style={styles.head}>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.close}
              >
                <X color={theme.colors.ink} size={theme.size.iconMd} />
              </Pressable>
            </View>
          ) : null}
          {/* With the keyboard up, the first tap on a sheet's button only closed the keyboard (A7 emulator walk). A
              ScrollView that never scrolls is how React Native lets that tap through: `handled` passes it to the
              button and still closes the keyboard on a tap elsewhere. A picker's own list inside keeps its scrolling. */}
          <ScrollView
            scrollEnabled={false}
            keyboardShouldPersistTaps="handled"
            style={styles.body}
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
    body: { flexGrow: 0 },
    backdrop: { flex: 1, backgroundColor: colors.scrim },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: sheet.radius,
      borderTopRightRadius: sheet.radius,
      paddingHorizontal: sheet.padding,
      paddingTop: space[2],
      paddingBottom: space[6],
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
    close: {
      width: size.touchMin,
      height: size.touchMin,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

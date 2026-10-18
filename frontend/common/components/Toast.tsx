import {
  CircleAlert,
  CircleCheck,
  CircleX,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme, type ToneKey, useTheme } from '../../theme';

/** How long a toast stays before it leaves on its own. Long enough to read one plain sentence. */
const TOAST_DURATION_MS = 4000;

export type ToastTone = 'success' | 'info' | 'error';

export interface ToastApi {
  /** Something the person did worked: "Product saved". */
  success: (message: string) => void;
  /** Neutral news that needs no action: "Stock synced from the marketplace". */
  info: (message: string) => void;
  /** An action failed and nothing changed; pass a plain message (see `errorMessage` in frontend/utils). */
  error: (message: string) => void;
}

interface ToastMessage {
  /** Grows with every show, so the same text shown twice still restarts the timer and the announcement. */
  id: number;
  tone: ToastTone;
  message: string;
}

const ICON: Record<ToastTone, LucideIcon> = {
  success: CircleCheck,
  info: CircleAlert,
  error: CircleX,
};
// The toast reuses the status palette the Banner reads, so both themes' contrast pairs (ink on soft) already hold.
const TONE: Record<ToastTone, ToneKey> = {
  success: 'success',
  info: 'info',
  error: 'danger',
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * The short, self-dismissing confirmation that replaces a success `Alert` (maintainer decision 2026-10-11).
 *
 * Call it from any screen under `ToastProvider` (mounted once in App.tsx):
 *
 * @example
 * const toast = useToast();
 * const onSave = async () => {
 *   try {
 *     await save.mutateAsync(input);
 *     toast.success('Product saved');
 *     navigation.goBack();
 *   } catch (error) {
 *     toast.error(errorMessage(error));
 *   }
 * };
 *
 * A failure that the person must read before going on (a form that did not save) still belongs on the screen, in a
 * Banner or the field's error; a toast is for news that can safely disappear.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api)
    throw new Error(
      'useToast must be called inside <ToastProvider> (mounted once in App.tsx).',
    );
  return api;
}

/** Holds the one visible toast and renders it above every screen. Mount once, inside ThemeProvider and
 * SafeAreaProvider. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const nextId = useRef(0);

  // One toast at a time: a new one replaces the current, so a quick run of saves never stacks a column of messages.
  const show = useCallback((tone: ToastTone, message: string) => {
    nextId.current += 1;
    setCurrent({ id: nextId.current, tone, message });
  }, []);
  const dismiss = useCallback(() => setCurrent(null), []);

  const api = useMemo<ToastApi>(
    () => ({
      success: message => show('success', message),
      info: message => show('info', message),
      error: message => show('error', message),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? (
        <Toast
          key={current.id}
          tone={current.tone}
          message={current.message}
          onDismiss={dismiss}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

interface ToastProps {
  tone: ToastTone;
  message: string;
  onDismiss: () => void;
}

/** The toast itself. Screens do not render it; they call `useToast()`. Exported for the provider and its tests. */
function Toast({ tone, message, onDismiss }: ToastProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const colours = theme.colors.status[TONE[tone]];
  const Icon = ICON[tone];
  // Starts hidden and below its place; the entry below either slides it up or, under reduced motion, just shows it.
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    // TalkBack does not reliably read a view that appears outside the focused screen, so the message is also announced.
    AccessibilityInfo.announceForAccessibility(message);
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(reduce => {
        if (cancelled) return;
        if (reduce) {
          progress.setValue(1);
          return;
        }
        Animated.timing(progress, {
          toValue: 1,
          duration: theme.motion.duration.base,
          easing: theme.motion.easing.decelerate,
          useNativeDriver: true,
        }).start();
      });
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      progress.stopAnimation();
    };
  }, [message, onDismiss, progress, theme.motion]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.space[6], 0],
  });

  return (
    <View
      // Above the bottom tab bar and the gesture inset, whichever screen is on top; touches pass through around it.
      style={[
        styles.layer,
        { bottom: insets.bottom + theme.size.tabBar + theme.space[2] },
      ]}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[
          styles.toast,
          {
            backgroundColor: colours.soft,
            borderColor: colours.mark,
            opacity: progress,
            transform: [{ translateY }],
          },
        ]}
        accessibilityLiveRegion="polite"
        accessibilityRole={tone === 'error' ? 'alert' : 'summary'}
      >
        <Icon color={colours.mark} size={theme.size.iconMd} />
        <Text style={[styles.message, { color: colours.ink }]}>{message}</Text>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
        >
          <X color={colours.ink} size={theme.size.iconButton} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function makeStyles({
  space,
  size,
  borders,
  shadows,
  components,
  typography,
}: Theme) {
  return StyleSheet.create({
    layer: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: components.screen.margin,
    },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      width: '100%',
      maxWidth: size.contentMax,
      // The icon and the dismiss target set the left and right insets; the message wraps between them.
      paddingLeft: space[4],
      paddingRight: space[1],
      paddingVertical: space[1],
      minHeight: size.touchMin,
      borderRadius: components.banner.radius,
      borderWidth: borders.hairline,
      ...shadows.elev2,
    },
    message: { ...typography.bodyStrong, flex: 1, paddingVertical: space[2] },
    // The X is an icon, the target around it is the full touch minimum.
    dismiss: {
      width: size.touchMin,
      height: size.touchMin,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: components.button.radius,
    },
    pressed: { opacity: 0.6 },
  });
}

import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../../hooks/useInsets';
import { type Theme, useTheme } from '../../theme';

export interface SnackbarAction {
  label: string;
  onPress: () => void;
}

export interface SnackbarProps {
  /** What just happened, in the action's past tense: "Listing published", "Request sent to Dr Ali". */
  message: string;
  /** One follow-up: "View", "Undo". */
  action?: SnackbarAction;
}

/** Confirms what just happened, with one follow-up. `ink` ground with `surface` text; the action is bold and underlined,
 * so it needs no colour of its own. It replaces the blocking success Alert: an Alert is only for a real decision. */
export function Snackbar({ message, action }: SnackbarProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    // Announced politely: it is news, not an interruption.
    <View style={styles.snackbar} accessibilityLiveRegion="polite">
      <Text style={styles.message}>{message}</Text>
      {action ? (
        <Pressable
          style={styles.action}
          onPress={action.onPress}
          android_ripple={{ color: theme.colors.rippleOnFill }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.actionLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface SnackbarApi {
  /** Shows a message, replacing the one on screen. Stays 6 s, longer with an action. */
  show: (message: string, action?: SnackbarAction) => void;
  dismiss: () => void;
}

/** What the provider holds: `show` also takes how far up the caller's own bottom bar reaches. */
interface SnackbarHost {
  showAbove: (clearance: number, message: string, action?: SnackbarAction) => void;
  dismiss: () => void;
}

interface Shown extends SnackbarProps {
  id: number;
  /** How far up the screen's own bottom bar (the tab bar, gesture area included) reaches; 0 when it has none. */
  clearance: number;
}

const SnackbarContext = createContext<SnackbarHost | null>(null);

/** Mounted once, near the root (App.tsx), above navigation: it draws the one snackbar over whatever screen is open. */
export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useInsets();
  const [shown, setShown] = useState<Shown | null>(null);
  const lastId = useRef(0);

  const dismiss = useCallback(() => setShown(null), []);
  const showAbove = useCallback((clearance: number, message: string, action?: SnackbarAction) => {
    lastId.current += 1;
    setShown({ id: lastId.current, message, action, clearance });
  }, []);

  const id = shown?.id;
  const hasAction = shown?.action !== undefined;
  const { duration } = theme.components.snackbar;
  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(() => setShown(null), hasAction ? duration.withAction : duration.message);
    return () => clearTimeout(timer);
  }, [id, hasAction, duration]);

  const host = useMemo(() => ({ showAbove, dismiss }), [showAbove, dismiss]);
  const action = shown?.action;

  return (
    <SnackbarContext.Provider value={host}>
      {children}
      {shown ? (
        // box-none: only the snackbar itself takes touches; the screen under the rest of the overlay stays usable.
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={[styles.slot, { paddingBottom: shown.clearance > 0 ? shown.clearance : insets.bottom }]} pointerEvents="box-none">
            <Snackbar
              message={shown.message}
              action={
                action
                  ? {
                      label: action.label,
                      onPress: () => {
                        action.onPress();
                        dismiss();
                      },
                    }
                  : undefined
              }
            />
          </View>
        </View>
      ) : null}
    </SnackbarContext.Provider>
  );
}

/** `show("Listing published", { label: "View", onPress })` from a screen or a mutation's `onSuccess`. The snackbar sits
 * above the tab bar when the calling screen is inside one, and above the gesture area when it is not. */
export function useSnackbar(): SnackbarApi {
  const host = useContext(SnackbarContext);
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  if (!host) throw new Error('useSnackbar needs a SnackbarProvider above it (App.tsx mounts one)');
  const { showAbove, dismiss } = host;
  return useMemo(
    () => ({ show: (message: string, action?: SnackbarAction) => showAbove(tabBarHeight, message, action), dismiss }),
    [showAbove, dismiss, tabBarHeight],
  );
}

function makeStyles({ colors, components, size, shadows, typography, space }: Theme) {
  const { snackbar } = components;
  return StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
    slot: { paddingHorizontal: snackbar.margin, paddingTop: space[2], alignItems: 'center' },
    snackbar: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      maxWidth: size.contentMax,
      gap: snackbar.gap,
      minHeight: snackbar.minHeight,
      paddingLeft: snackbar.paddingLeft,
      paddingRight: snackbar.paddingRight,
      marginBottom: snackbar.margin,
      backgroundColor: colors.ink,
      borderRadius: snackbar.radius,
      ...shadows.elev2,
    },
    message: { ...typography.body, flex: 1, color: colors.surface, paddingVertical: space[2] },
    action: { minHeight: size.touchMin, minWidth: size.touchMin, paddingHorizontal: space[3], alignItems: 'center', justifyContent: 'center' },
    actionLabel: { ...typography.label, color: colors.surface, textDecorationLine: 'underline' },
  });
}

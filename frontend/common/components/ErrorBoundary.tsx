// Catches render errors in a part of the app and shows a "Try again" screen instead of crashing.
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { logger } from '../../utils/logger';
import { EmptyState } from './EmptyState';

interface ErrorBoundaryProps {
  /** Where the boundary sits ("root", "admin navigator"): written with the error so a log says which part failed. */
  name: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// The fallback screen with a retry button.
function Fallback({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.container}>
      <EmptyState
        title="This screen stopped working"
        description="Your data is safe. Try again, and if it keeps happening, close the app and open it again."
        actionLabel="Try again"
        onAction={onRetry}
      />
    </View>
  );
}

/**
 * Catches a render error below it and shows a retry screen instead of a blank app. One at the root and one around
 * each role's navigator, so a crash in the admin screens cannot take down another role's navigator.
 *
 * It catches errors thrown while rendering, in lifecycle methods and in constructors. It does not catch errors in
 * event handlers or async code (those are handled where they are thrown: every mutation and query shows its own error).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  // Saves the error so the next render shows the fallback.
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  // Logs the error and the component stack.
  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.warn(`ErrorBoundary:${this.props.name}`, error);
    logger.warn(`ErrorBoundary:${this.props.name}:componentStack`, info.componentStack ?? undefined);
  }

  private retry = () => this.setState({ error: null });

  // Shows the fallback after an error, otherwise the children.
  render(): ReactNode {
    return this.state.error ? <Fallback onRetry={this.retry} /> : this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
});

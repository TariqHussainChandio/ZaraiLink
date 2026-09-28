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

function Fallback({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.container}>
      <EmptyState
        title="Something went wrong"
        description="This screen hit a problem. Your data is safe. Try again, and if it keeps happening, restart the app."
        actionLabel="Retry"
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

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.warn(`ErrorBoundary:${this.props.name}`, error);
    logger.warn(`ErrorBoundary:${this.props.name}:componentStack`, info.componentStack ?? undefined);
  }

  private retry = () => this.setState({ error: null });

  render(): ReactNode {
    return this.state.error ? <Fallback onRetry={this.retry} /> : this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
});

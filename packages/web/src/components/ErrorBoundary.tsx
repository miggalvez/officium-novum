import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryState {
  readonly error?: Error;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Officium demo error', error, info);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="warning-banner warning-banner--error" role="alert">
          <strong>Something went wrong.</strong>
          <p>{this.state.error.message}</p>
          <p>
            Try reloading the page. If the problem persists, please report it through the GitHub
            handoff.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

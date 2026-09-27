import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Last line of defence against the blank-window failure mode.
 *
 * A React render error unmounts the whole tree, which in a frameless desktop
 * window looks identical to "the app didn't start" — no message, no console
 * for the user to open, nothing to report. This turns that into a readable
 * screen with the actual error text, so a bug is diagnosable from a screenshot.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[hermes] render crashed', error, info.componentStack);
  }

  override render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Deliberately not localized: the i18n provider may be the thing that broke.
    return (
      <div className="crash" role="alert">
        <h1>HERMES failed to start</h1>
        <p>Something threw while rendering. The details below are what to report.</p>
        <pre>{error.message}</pre>
        {error.stack ? <pre className="crash-stack">{error.stack}</pre> : null}
        <button type="button" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}

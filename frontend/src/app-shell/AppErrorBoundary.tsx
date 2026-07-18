import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../design-system/Button";
import "./AppErrorBoundary.css";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Relay error boundary caught:", error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <h1 className="error-boundary__title">Something went wrong</h1>
          <p className="error-boundary__message">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <div className="error-boundary__actions">
            <Button variant="primary" onClick={this.handleReload}>
              Reload
            </Button>
            <Link to="/app">
              <Button variant="secondary">Return to overview</Button>
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

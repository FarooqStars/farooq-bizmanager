import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  ErrorState,
  ErrorStateContent,
  ErrorStateDescription,
  ErrorStateHeader,
  ErrorStateMedia,
  ErrorStateTitle,
} from "@/components/ui/error-state.tsx";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error in component tree:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <ErrorState>
            <ErrorStateHeader>
              <ErrorStateMedia />
              <ErrorStateTitle>Something went wrong</ErrorStateTitle>
              <ErrorStateDescription>
                An unexpected error occurred. You can try again, or reload the page if the problem
                persists.
              </ErrorStateDescription>
            </ErrorStateHeader>
            <ErrorStateContent>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" onClick={this.handleReset}>
                  Try again
                </Button>
                <Button onClick={() => window.location.reload()}>
                  <RefreshCwIcon />
                  Reload
                </Button>
              </div>
            </ErrorStateContent>
          </ErrorState>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

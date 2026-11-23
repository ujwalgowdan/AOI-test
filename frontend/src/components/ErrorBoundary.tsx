import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="mx-auto max-w-xl py-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Something went wrong
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              The UI encountered an unexpected error. The detection backend is unaffected.
            </p>
            <pre className="max-h-48 overflow-auto rounded bg-slate-100 p-2 text-xs">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2">
              <Button onClick={this.reset} variant="outline">
                Try again
              </Button>
              <Button onClick={this.reload}>
                <RotateCcw className="mr-1 h-4 w-4" /> Reload page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

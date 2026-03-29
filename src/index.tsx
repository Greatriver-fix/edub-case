import { Buffer } from 'buffer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/cs16.css';
import './styles/style.css';
import './components/CaseOpener.css';

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

const renderFatalError = (message: string) => {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  rootElement.innerHTML = `
    <div style="padding:24px;color:#fff;font-family:monospace;white-space:pre-wrap;overflow-wrap:anywhere;">
      <h1 style="margin:0 0 12px 0;">Frontend Error</h1>
      <pre style="margin:0;">${message.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char))}</pre>
    </div>
  `;
};

class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React render error', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '24px', color: '#fff', fontFamily: 'monospace' }}>
          <h1 style={{ marginBottom: '12px' }}>Frontend Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {this.state.error.stack || this.state.error.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

if (typeof window !== 'undefined') {
  (window as Window & { Buffer?: typeof Buffer }).Buffer = Buffer;

  window.addEventListener('error', (event) => {
    const error = event.error instanceof Error ? event.error : null;
    renderFatalError(error?.stack || event.message || 'Unknown window error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason instanceof Error) {
      renderFatalError(reason.stack || reason.message);
    } else {
      renderFatalError(String(reason));
    }
  });

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Failed to find the root element');
  }

  const root = ReactDOM.createRoot(rootElement);

  import('./components/App')
    .then(({ default: App }) => {
      root.render(
        <React.StrictMode>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </React.StrictMode>
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      renderFatalError(message);
    });
}

import { StrictMode, Component, ReactNode, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { reportError, installGlobalErrorReporting } from './lib/errorReporting';
import { isAndroidApp } from './lib/platform';

interface EBProps  { children: ReactNode }
interface EBState  { error: Error | null }

class ErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled app error:', error, info);
    reportError(error, `React render: ${info.componentStack?.split('\n')[1]?.trim() ?? 'unknown'}`);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f8fafc' }}>
          <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontWeight: 900, fontSize: 20, color: '#0f172a', marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>An unexpected error occurred. Please reload the page.</p>
            <button
              onClick={() => window.location.reload()}
              style={{ background: '#4f46e5', color: '#fff', fontWeight: 900, padding: '14px 32px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 14 }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return (this as Component<EBProps, EBState>).props.children;
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

installGlobalErrorReporting();

// Capture the Android-app launch referrer before any in-app navigation can lose it.
isAndroidApp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

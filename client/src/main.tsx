import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// PWA: cache the app shell in production only (dev stays network-live).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const checkForUpdates = () => {
    navigator.serviceWorker.getRegistration().then((reg) => reg?.update().catch(() => { /* offline ok */ }));
  };
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline ok */ });
  });
  // A swapped-in worker means fresher assets are cached: prompt, never force.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.dispatchEvent(new CustomEvent('sw-updated'));
  });
  // Re-check on reconnect and every 30 minutes while the tab stays open.
  window.addEventListener('online', checkForUpdates);
  setInterval(checkForUpdates, 30 * 60 * 1000);
}

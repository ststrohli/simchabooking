import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  import('@axe-core/react').then((axe) => {
    axe.default(React, ReactDOM, 1000);
  }).catch((err) => {
    console.warn('axe-core react library could not be loaded:', err);
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
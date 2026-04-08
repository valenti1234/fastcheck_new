import React from 'react';
import './i18n';
import { createRoot } from 'react-dom/client';
// import { connectDB } from './config/database';
import App from './App';
import logger from './utils/logger';

// Connect to MongoDB
// Connect to MongoDB (commented out due to missing import)
// connectDB().catch(logger.error);

// Create React root and render app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
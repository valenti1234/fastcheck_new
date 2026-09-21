import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';
import VersionChangeNotifier from './components/common/VersionChangeNotifier';
import './i18n';

// Initialize dark mode from localStorage or system preference
const initializeDarkMode = () => {
  const savedTheme = localStorage.getItem('theme');
  
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else if (savedTheme === 'light') {
    document.documentElement.classList.remove('dark');
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }
};

initializeDarkMode();

ReactDOM.createRoot(document.getElementById('root')!).render(
  // 🔧 FIX 21.09: RIMOSSO React.StrictMode per evitare DOPPIO mount di ReactFlow!
  // StrictMode monta 2 volte i componenti e rompe useRef/useReactFlow interni → Appare e scompare!
  <BrowserRouter>
    <AuthProvider>
      <VersionChangeNotifier />
      <App />
      <Toaster position="top-right" />
    </AuthProvider>
  </BrowserRouter>
);
/**
 * Conditional logger utility that respects VITE_SHOW_LOG environment variable
 */

const isLoggingEnabled = (): boolean => {
  const g = globalThis as unknown as { localStorage?: Storage; VITE_SHOW_LOG?: string };
  try {
    const fromStorage = g.localStorage?.getItem('VITE_SHOW_LOG');
    if (fromStorage !== null) return fromStorage === 'true';
  } catch {
    return g.VITE_SHOW_LOG === 'true';
  }
  return g.VITE_SHOW_LOG === 'true';
};

export const logger = {
  log: (...args: Parameters<typeof console.log>) => {
    if (isLoggingEnabled()) {
      console.log(...args);
    }
  },
  
  warn: (...args: Parameters<typeof console.warn>) => {
    if (isLoggingEnabled()) {
      console.warn(...args);
    }
  },
  
  error: (...args: Parameters<typeof console.error>) => {
    if (isLoggingEnabled()) {
      console.error(...args);
    }
  },
  
  info: (...args: Parameters<typeof console.info>) => {
    if (isLoggingEnabled()) {
      console.info(...args);
    }
  },
  
  debug: (...args: Parameters<typeof console.debug>) => {
    if (isLoggingEnabled()) {
      console.debug(...args);
    }
  }
};

export default logger;

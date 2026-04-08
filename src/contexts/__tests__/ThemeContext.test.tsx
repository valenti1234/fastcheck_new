import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from '../ThemeContext';

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock document.documentElement
const mockClassList = {
  add: jest.fn(),
  remove: jest.fn(),
  contains: jest.fn(),
};
Object.defineProperty(document.documentElement, 'classList', {
  value: mockClassList,
});

// Mock document.body.style
Object.defineProperty(document.body, 'style', {
  value: {},
  writable: true,
});

// Mock logger.log
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

// Test component to access context
const TestComponent = () => {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <button onClick={toggleTheme} data-testid="toggle-btn">
        Toggle Theme
      </button>
    </div>
  );
};

const renderWithProvider = () => {
  return render(
    <ThemeProvider>
      <TestComponent />
    </ThemeProvider>
  );
};

describe('ThemeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockClassList.contains.mockReturnValue(false);
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
  });

  describe('useTheme hook', () => {
    it('should throw error when used outside ThemeProvider', () => {
      const TestComponentOutside = () => {
        useTheme();
        return <div>Test</div>;
      };

      // Suppress logger.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => render(<TestComponentOutside />)).toThrow(
        'useTheme must be used within a ThemeProvider'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Initial theme detection', () => {
    it('should default to light theme when no saved theme and no dark class', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockClassList.contains.mockReturnValue(false);

      renderWithProvider();

      expect(screen.getByTestId('theme')).toHaveTextContent('light');
      expect(mockClassList.remove).toHaveBeenCalledWith('dark', 'light');
      expect(mockClassList.add).toHaveBeenCalledWith('light');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'light');
      expect(mockConsoleLog).toHaveBeenCalledWith('Theme changed to:', 'light');
    });

    it('should use saved light theme from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('light');

      renderWithProvider();

      expect(screen.getByTestId('theme')).toHaveTextContent('light');
      expect(mockClassList.remove).toHaveBeenCalledWith('dark', 'light');
      expect(mockClassList.add).toHaveBeenCalledWith('light');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'light');
    });

    it('should use saved dark theme from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('dark');

      renderWithProvider();

      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
      expect(mockClassList.remove).toHaveBeenCalledWith('dark', 'light');
      expect(mockClassList.add).toHaveBeenCalledWith('dark');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
    });

    it('should detect dark theme from HTML class when no saved theme', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockClassList.contains.mockReturnValue(true);

      renderWithProvider();

      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
      expect(mockClassList.remove).toHaveBeenCalledWith('dark', 'light');
      expect(mockClassList.add).toHaveBeenCalledWith('dark');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
    });

    it('should ignore invalid saved theme values', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid-theme');
      mockClassList.contains.mockReturnValue(false);

      renderWithProvider();

      expect(screen.getByTestId('theme')).toHaveTextContent('light');
      expect(mockClassList.remove).toHaveBeenCalledWith('dark', 'light');
      expect(mockClassList.add).toHaveBeenCalledWith('light');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'light');
    });
  });

  describe('toggleTheme function', () => {
    it('should toggle from light to dark', async () => {
      mockLocalStorage.getItem.mockReturnValue('light');

      renderWithProvider();

      expect(screen.getByTestId('theme')).toHaveTextContent('light');

      await act(async () => {
        await userEvent.click(screen.getByTestId('toggle-btn'));
      });

      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
      expect(mockClassList.remove).toHaveBeenCalledWith('dark', 'light');
      expect(mockClassList.add).toHaveBeenCalledWith('dark');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
      expect(mockConsoleLog).toHaveBeenCalledWith('Theme changed to:', 'dark');
    });

    it('should toggle from dark to light', async () => {
      mockLocalStorage.getItem.mockReturnValue('dark');

      renderWithProvider();

      expect(screen.getByTestId('theme')).toHaveTextContent('dark');

      await act(async () => {
        await userEvent.click(screen.getByTestId('toggle-btn'));
      });

      expect(screen.getByTestId('theme')).toHaveTextContent('light');
      expect(mockClassList.remove).toHaveBeenCalledWith('dark', 'light');
      expect(mockClassList.add).toHaveBeenCalledWith('light');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'light');
      expect(mockConsoleLog).toHaveBeenCalledWith('Theme changed to:', 'light');
    });

    it('should toggle multiple times correctly', async () => {
      mockLocalStorage.getItem.mockReturnValue('light');

      renderWithProvider();

      // Initial state
      expect(screen.getByTestId('theme')).toHaveTextContent('light');

      // Toggle to dark
      await act(async () => {
        await userEvent.click(screen.getByTestId('toggle-btn'));
      });
      expect(screen.getByTestId('theme')).toHaveTextContent('dark');

      // Toggle back to light
      await act(async () => {
        await userEvent.click(screen.getByTestId('toggle-btn'));
      });
      expect(screen.getByTestId('theme')).toHaveTextContent('light');

      // Toggle to dark again
      await act(async () => {
        await userEvent.click(screen.getByTestId('toggle-btn'));
      });
      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    });
  });

  describe('DOM manipulation', () => {
    it('should apply transition style to document.body', () => {
      renderWithProvider();

      expect(document.body.style.transition).toBe('background-color 0.3s ease');
    });

    it('should remove existing theme classes before adding new ones', () => {
      mockLocalStorage.getItem.mockReturnValue('light');

      renderWithProvider();

      expect(mockClassList.remove).toHaveBeenCalledWith('dark', 'light');
      expect(mockClassList.add).toHaveBeenCalledWith('light');
    });

    it('should update classes and localStorage on theme change', async () => {
      mockLocalStorage.getItem.mockReturnValue('light');

      renderWithProvider();

      // Clear previous calls
      jest.clearAllMocks();

      await act(async () => {
        await userEvent.click(screen.getByTestId('toggle-btn'));
      });

      expect(mockClassList.remove).toHaveBeenCalledWith('dark', 'light');
      expect(mockClassList.add).toHaveBeenCalledWith('dark');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
    });
  });

  describe('Multiple providers', () => {
    it('should work with multiple theme providers independently', () => {
      const TestComponent1 = () => {
        const { theme } = useTheme();
        return <div data-testid="theme1">{theme}</div>;
      };

      const TestComponent2 = () => {
        const { theme } = useTheme();
        return <div data-testid="theme2">{theme}</div>;
      };

      mockLocalStorage.getItem.mockReturnValue('light');

      render(
        <div>
          <ThemeProvider>
            <TestComponent1 />
          </ThemeProvider>
          <ThemeProvider>
            <TestComponent2 />
          </ThemeProvider>
        </div>
      );

      expect(screen.getByTestId('theme1')).toHaveTextContent('light');
      expect(screen.getByTestId('theme2')).toHaveTextContent('light');
    });
  });
});
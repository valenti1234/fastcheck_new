import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
}

const useToggle = true;

const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    useToggle && (
    <div className={`flex items-center ${className}`}>
      <button
        onClick={toggleTheme}
        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        <div className="flex items-center">
          {theme === 'light' ? (
            <Sun className="mr-3 flex-shrink-0 h-5 w-5 text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400" />
          ) : (
            <Moon className="mr-3 flex-shrink-0 h-5 w-5 text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400" />
          )}
          <span>{theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}</span>
        </div>
        <div className="relative ml-3">
          <div className={`w-10 h-5 bg-gray-200 rounded-full shadow-inner transition-colors duration-300 ease-in-out ${theme === 'light' ? '' : 'bg-primary-600'}`}>
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-300 ease-in-out ${theme === 'light' ? '' : 'translate-x-5'}`}></div>
          </div>
        </div>
      </button>
    </div>
    )
  );
};

export default ThemeToggle;
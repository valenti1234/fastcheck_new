import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    try {
      localStorage.setItem('i18nextLng', lng);
    } catch {}
    const html = document.querySelector('html');
    if (html) html.setAttribute('lang', lng);
  };

  return (
    <div className="flex items-center space-x-2">
      {[
        { code: 'es', label: 'ES' },
        { code: 'pt', label: 'PT' },
        { code: 'en', label: 'EN' },
        { code: 'fr', label: 'FR' },
      ].map((lng) => (
        <button
          key={lng.code}
          onClick={() => changeLanguage(lng.code)}
          className={`px-2 py-1 text-xs rounded border ${
            i18n.resolvedLanguage === lng.code
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
          aria-label={`Change language to ${lng.label}`}
        >
          {lng.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
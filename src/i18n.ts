import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/translation.json';
import es from './locales/es/translation.json';
import pt from './locales/pt/translation.json';
import fr from './locales/fr/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      pt: { translation: pt },
      fr: { translation: fr },
    },
    fallbackLng: 'es',
    supportedLngs: ['es', 'pt', 'en', 'fr'],
    // Map non-explicit codes like es-CL, pt-PT, fr-FR to their base language
    nonExplicitSupportedLngs: true,
    // Only use the base language part for resource lookup
    load: 'languageOnly',
    detection: {
      // Include querystring to allow ?lng=en overrides and deep links
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
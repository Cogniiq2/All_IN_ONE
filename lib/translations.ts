/**
 * Interface strings that are shared across pages.
 *
 * Most copy now lives with the component that renders it, which keeps the
 * German and English versions of a sentence next to each other and next to
 * their context. What remains here are the few labels used in more than one
 * place.
 *
 * The previous file carried marketing copy for five invented apartments, two
 * invented "collections", a 9.4/10 rating and walking times that contradicted
 * each other between languages. All of it is gone.
 */

export const translations = {
  de: {
    legal: {
      impressumTitle: 'Impressum',
      datenschutzTitle: 'Datenschutzerklärung',
      agbTitle: 'Allgemeine Geschäftsbedingungen',
    },
    common: {
      apartments: 'Apartments',
      contact: 'Kontakt',
      journal: 'Journal',
      about: 'Über uns',
      faq: 'Häufige Fragen',
    },
  },
  en: {
    legal: {
      impressumTitle: 'Legal notice',
      datenschutzTitle: 'Privacy policy',
      agbTitle: 'Terms and conditions',
    },
    common: {
      apartments: 'Apartments',
      contact: 'Contact',
      journal: 'Journal',
      about: 'About us',
      faq: 'FAQ',
    },
  },
} as const;

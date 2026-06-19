// Simple i18n loader and translation helper
const I18N = (() => {
  let dict = {};
  let lang = localStorage.getItem('lang') || 'en';

  async function load(language) {
    lang = language || lang;
    try {
      const res = await fetch(`/locales/${lang}.json`);
      dict = await res.json();
    } catch (e) {
      dict = {};
    }
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
  }

  function t(key, vars) {
    let str = dict[key] || key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        str = str.replace(`{${k}}`, vars[k]);
      }
    }
    return str;
  }

  function applyTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });
  }

  function getLang() { return lang; }

  return { load, t, applyTranslations, getLang };
})();

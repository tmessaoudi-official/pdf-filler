// Main entry point
import { PDFEditorApp } from './pdfEditorApp';
import { initI18n, changeLanguage, onLanguageChanged } from './i18n';

declare global {
  interface Window { app: PDFEditorApp; }
}

document.addEventListener('DOMContentLoaded', async () => {
  await initI18n();

  window.app = new PDFEditorApp();

  // Language switcher — re-render dynamic DOM on change
  onLanguageChanged(() => {
    window.app.onLanguageChanged();
  });

  document.querySelectorAll<HTMLElement>('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      if (lang) changeLanguage(lang);
    });
  });

  // Storage notice banner — show once, dismissed to localStorage
  const banner = document.getElementById('storageBanner');
  const dismissBtn = document.getElementById('storageBannerDismiss');
  if (banner && !localStorage.getItem('pdfturbo_storage_notice')) {
    banner.style.display = '';
    dismissBtn?.addEventListener('click', () => {
      banner.style.display = 'none';
      localStorage.setItem('pdfturbo_storage_notice', '1');
    });
  }
});

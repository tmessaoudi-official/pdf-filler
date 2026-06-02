// Main entry point
import { PDFEditorApp } from './pdfEditorApp';

declare global {
  interface Window { app: PDFEditorApp; }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new PDFEditorApp();
});


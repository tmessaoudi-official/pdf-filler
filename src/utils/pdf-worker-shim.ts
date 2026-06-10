// Worker entry point: polyfill runs before pdfjs worker code (ESM import order guarantees this)
import './polyfills';
import 'pdfjs-dist/build/pdf.worker.min.mjs';

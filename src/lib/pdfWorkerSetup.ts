// PDF.js worker setup — must be configured before any getDocument call

import * as pdfjsLib from 'pdfjs-dist';

// Use the Vite worker import so the bundler serves it correctly
const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.href;

export { pdfjsLib };

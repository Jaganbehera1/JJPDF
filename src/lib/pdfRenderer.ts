// PDF.js document loading and page rendering utilities

import { pdfjsLib } from './pdfWorkerSetup';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import type { PageData, TextSpan, BoundingBox } from '@/types';

export interface LoadedDocument {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageCount: number;
}

export async function loadPdfFromFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<LoadedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
  });

  if (onProgress) {
    loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
      if (progress.total > 0) {
        onProgress(Math.min(0.9, (progress.loaded / progress.total) * 0.9));
      }
    };
  }

  const pdf = await loadingTask.promise;
  onProgress?.(1);
  return { pdf, pageCount: pdf.numPages };
}

export async function renderPageToCanvas(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  rotation: number = 0,
  operationsToRemove: Set<number> = new Set()
): Promise<{ canvas: HTMLCanvasElement; viewport: pdfjsLib.PageViewport }> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  await page.render({
    canvasContext: context,
    viewport,
    canvas,
    ...(operationsToRemove.size ? { operationsFilter: (index: number) => !operationsToRemove.has(index) } : {}),
  }).promise;

  return { canvas, viewport };
}

export function cropBackgroundPatches(
  sourceCanvas: HTMLCanvasElement,
  eraseAreas: BoundingBox[],
): Array<{ bbox: BoundingBox; dataUrl: string }> {
  const patches: Array<{ bbox: BoundingBox; dataUrl: string }> = [];
  for (const area of eraseAreas) {
    const left = Math.max(0, Math.floor(area.x));
    const top = Math.max(0, Math.floor(area.y));
    const right = Math.min(sourceCanvas.width, Math.ceil(area.x + area.width));
    const bottom = Math.min(sourceCanvas.height, Math.ceil(area.y + area.height));
    if (right <= left || bottom <= top) continue;
    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = right - left;
    patchCanvas.height = bottom - top;
    const context = patchCanvas.getContext('2d');
    if (!context) continue;
    context.drawImage(sourceCanvas, left, top, patchCanvas.width, patchCanvas.height, 0, 0, patchCanvas.width, patchCanvas.height);
    patches.push({
      bbox: { x: left, y: top, width: right - left, height: bottom - top },
      dataUrl: patchCanvas.toDataURL('image/png'),
    });
    patchCanvas.width = 0;
    patchCanvas.height = 0;
  }
  return patches;
}

export async function extractPageData(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number
): Promise<PageData> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();
  const operatorList = await page.getOperatorList();
  const detectedImageBoxes: { bbox: BoundingBox; operatorIndex: number }[] = [];
  const OPS = pdfjsLib.OPS;
  const imageOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObject]);
  let ctm = [1, 0, 0, 1, 0, 0];
  const transforms: number[][] = [];
  const multiply = (m: number[], n: number[]) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const op = operatorList.fnArray[i];
    const args = operatorList.argsArray[i] as number[] | null;
    if (op === OPS.save) transforms.push(ctm);
    else if (op === OPS.restore) ctm = transforms.pop() || [1, 0, 0, 1, 0, 0];
    else if (op === OPS.transform && args && args.length >= 6) ctm = multiply(ctm, args);
    else if (imageOps.has(op)) {
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => viewport.convertToViewportPoint(
        ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5],
      ));
      const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
      const bbox = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      if (bbox.width > 2 && bbox.height > 2) detectedImageBoxes.push({ bbox, operatorIndex: i });
    }
  }
  const textSpans: TextSpan[] = [];
  // Some mobile Safari/WebView versions expose PDF.js text items as an
  // array-like object without a working iterator. Indexed access works in
  // those engines and avoids `undefined is not a function` during analysis.
  const textItems = textContent.items as ArrayLike<Record<string, unknown>>;
  for (let itemIndex = 0; itemIndex < textItems.length; itemIndex++) {
    const item = textItems[itemIndex];
    if (!('str' in item) || typeof item.str !== 'string' || item.str.trim() === '') continue;

    const transform = pdfjsLib.Util.transform(viewport.transform, item.transform as number[]);
    const str = item.str as string;
    const width = (item.width as number) || 0;
    const height = (item.height as number) || 10;
    const fontName = (item.fontName as string) || 'sans-serif';
    const fontSize = Math.hypot(transform[2], transform[3]) || height;
    const angle = Math.atan2(transform[1], transform[0]);
    const endX = transform[4] + Math.cos(angle) * width * viewport.scale;
    const endY = transform[5] + Math.sin(angle) * width * viewport.scale;
    const points = [
      [transform[4], transform[5]],
      [endX, endY],
      [transform[4] + transform[2], transform[5] + transform[3]],
      [endX + transform[2], endY + transform[3]],
    ];
    const xs = points.map(([pointX]) => pointX);
    const ys = points.map(([, pointY]) => pointY);
    const bbox: BoundingBox = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(Math.max(...xs) - Math.min(...xs), 10),
      height: Math.max(Math.max(...ys) - Math.min(...ys), 10),
    };

    const textStyle = textContent.styles?.[fontName];
    const styleFamily = (textStyle?.fontFamily || '').toLowerCase();
    const fontFamily = styleFamily.includes('mono') ? 'Courier' : styleFamily.includes('serif') && !styleFamily.includes('sans') ? 'Times-Roman' : 'Helvetica';

    textSpans.push({
      id: `span-${pageNumber}-${textSpans.length}`,
      page: pageNumber,
      text: str,
      bbox,
      fontSize: Math.round(fontSize * 10) / 10,
      rotation: angle * 180 / Math.PI,
      fontName,
      fontFamily,
      bold: /bold|black|demi/i.test(fontName),
      italic: /italic|oblique/i.test(fontName),
      color: '#000000',
      backgroundColor: '#ffffff',
      isEditable: true,
    });
  }

  const imageBoxes: { bbox: BoundingBox; dataUrl: string; backgroundColor: string; operatorIndex: number }[] = [];
  let pageRaster: HTMLCanvasElement | null = null;
  if (textSpans.length || detectedImageBoxes.length) {
    const rasterViewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    canvas.width = rasterViewport.width;
    canvas.height = rasterViewport.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context) {
      await page.render({ canvasContext: context, viewport: rasterViewport, canvas }).promise;
      pageRaster = canvas;
    }
  }
  if (pageRaster) {
    const context = pageRaster.getContext('2d', { willReadFrequently: true });
    const pixels = context?.getImageData(0, 0, pageRaster.width, pageRaster.height).data;
    if (pixels) {
      const scaleX = pageRaster.width / viewport.width;
      const scaleY = pageRaster.height / viewport.height;
      const colorAt = (x: number, y: number) => {
        const px = Math.max(0, Math.min(pageRaster!.width - 1, Math.round(x)));
        const py = Math.max(0, Math.min(pageRaster!.height - 1, Math.round(y)));
        const offset = (py * pageRaster!.width + px) * 4;
        return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      };
      const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
      const medianColor = (colors: number[][]) => [0, 1, 2].map((channel) =>
        [...colors.map((color) => color[channel])].sort((a, b) => a - b)[Math.floor(colors.length / 2)]
      );
      const sampleBorderColor = (bbox: BoundingBox) => {
        const samples: number[][] = [];
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
          const ratio = i / steps;
          const x = bbox.x + bbox.width * ratio;
          const y = bbox.y + bbox.height * ratio;
          samples.push(colorAt((x - 1) * scaleX, (bbox.y - 1) * scaleY));
          samples.push(colorAt((x + 1) * scaleX, (bbox.y + bbox.height + 1) * scaleY));
          samples.push(colorAt((bbox.x - 1) * scaleX, (y - 1) * scaleY));
          samples.push(colorAt((bbox.x + bbox.width + 1) * scaleX, (y + 1) * scaleY));
        }
        return toHex(medianColor(samples));
      };

      for (const detected of detectedImageBoxes) {
        const backgroundColor = sampleBorderColor(detected.bbox);
        imageBoxes.push({ bbox: detected.bbox, dataUrl: '', backgroundColor, operatorIndex: detected.operatorIndex });
      }

      for (const span of textSpans) {
        const x = span.bbox.x * scaleX, y = span.bbox.y * scaleY;
        const w = span.bbox.width * scaleX, h = span.bbox.height * scaleY;
        const corners = [colorAt(x + 1, y + 1), colorAt(x + w - 2, y + 1), colorAt(x + 1, y + h - 2), colorAt(x + w - 2, y + h - 2)];
        const bg = medianColor(corners);
        span.backgroundColor = toHex(bg);

        const left = Math.max(0, Math.min(pageRaster.width - 1, Math.floor(x)));
        const top = Math.max(0, Math.min(pageRaster.height - 1, Math.floor(y)));
        const right = Math.max(left + 1, Math.min(pageRaster.width, Math.ceil(x + w)));
        const bottom = Math.max(top + 1, Math.min(pageRaster.height, Math.ceil(y + h)));
        const stride = Math.max(1, Math.floor(Math.max(w, h) / 100));
        const foreground: number[][] = [];
        for (let py = top; py < bottom; py += stride) {
          for (let px = left; px < right; px += stride) {
            const offset = (py * pageRaster.width + px) * 4;
            const pixel = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
            if (Math.max(...pixel.map((c, i) => Math.abs(c - bg[i]))) > 70) foreground.push(pixel);
          }
        }
        if (foreground.length) span.color = toHex([0, 1, 2].map((channel) => foreground.reduce((sum, p) => sum + p[channel], 0) / foreground.length));
      }
    }
  }

  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    textSpans,
    imageBoxes,
    rotation: page.rotate,
  };
}

export function reconstructBackgroundPatches(
  sourceCanvas: HTMLCanvasElement,
  region: BoundingBox,
  eraseAreas: BoundingBox[],
): Array<{ bbox: BoundingBox; dataUrl: string }> {
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext || !eraseAreas.length) return [];

  const regionLeft = Math.max(0, Math.floor(region.x));
  const regionTop = Math.max(0, Math.floor(region.y));
  const regionRight = Math.min(sourceCanvas.width, Math.ceil(region.x + region.width));
  const regionBottom = Math.min(sourceCanvas.height, Math.ceil(region.y + region.height));
  if (regionRight <= regionLeft || regionBottom <= regionTop) return [];

  const width = regionRight - regionLeft;
  const height = regionBottom - regionTop;
  const fullPagePixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
  const sourcePixels = sourceContext.getImageData(regionLeft, regionTop, width, height);
  const pixels = sourcePixels.data;
  const sample = (x: number, y: number): number[] => {
    const colors: number[][] = [];
    const centerX = Math.max(0, Math.min(sourceCanvas.width - 1, Math.round(x)));
    const centerY = Math.max(0, Math.min(sourceCanvas.height - 1, Math.round(y)));
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const px = Math.max(0, Math.min(sourceCanvas.width - 1, centerX + dx));
        const py = Math.max(0, Math.min(sourceCanvas.height - 1, centerY + dy));
        const offset = (py * sourceCanvas.width + px) * 4;
        colors.push([fullPagePixels[offset], fullPagePixels[offset + 1], fullPagePixels[offset + 2]]);
      }
    }
    return [0, 1, 2].map((channel) =>
      colors.map((color) => color[channel]).sort((a, b) => a - b)[Math.floor(colors.length / 2)]
    );
  };

  const getEdgeColor = (x: number, y: number, dx: number, dy: number): number[] =>
    sample(x + dx, y + dy);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const absoluteX = regionLeft + x;
      const absoluteY = regionTop + y;
      const horizontalRatio = width <= 1 ? 0.5 : x / (width - 1);
      const verticalRatio = height <= 1 ? 0.5 : y / (height - 1);
      // Sample immediately outside the padded text box. Sampling farther away can
      // cross the edge of a colored footer band and incorrectly reconstruct white.
      const left = getEdgeColor(absoluteX, absoluteY, regionLeft - absoluteX - 1, 0);
      const right = getEdgeColor(absoluteX, absoluteY, regionRight - absoluteX + 1, 0);
      const top = getEdgeColor(absoluteX, absoluteY, 0, regionTop - absoluteY - 1);
      const bottom = getEdgeColor(absoluteX, absoluteY, 0, regionBottom - absoluteY + 1);
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const horizontal = left[channel] * (1 - horizontalRatio) + right[channel] * horizontalRatio;
        const vertical = top[channel] * (1 - verticalRatio) + bottom[channel] * verticalRatio;
        pixels[offset + channel] = Math.round((horizontal + vertical) / 2);
      }
    }
  }

  const patches: Array<{ bbox: BoundingBox; dataUrl: string }> = [];
  for (const area of eraseAreas) {
    const left = Math.max(regionLeft, Math.floor(area.x));
    const top = Math.max(regionTop, Math.floor(area.y));
    const right = Math.min(regionRight, Math.ceil(area.x + area.width));
    const bottom = Math.min(regionBottom, Math.ceil(area.y + area.height));
    if (right <= left || bottom <= top) continue;

    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = right - left;
    patchCanvas.height = bottom - top;
    const patchContext = patchCanvas.getContext('2d');
    if (!patchContext) continue;
    const patchPixels = patchContext.createImageData(patchCanvas.width, patchCanvas.height);
    for (let y = 0; y < patchCanvas.height; y++) {
      for (let x = 0; x < patchCanvas.width; x++) {
        const sourceOffset = ((top - regionTop + y) * width + left - regionLeft + x) * 4;
        const targetOffset = (y * patchCanvas.width + x) * 4;
        patchPixels.data.set(pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
      }
    }
    patchContext.putImageData(patchPixels, 0, 0);
    patches.push({
      bbox: { x: left, y: top, width: right - left, height: bottom - top },
      dataUrl: patchCanvas.toDataURL('image/png'),
    });
  }

  return patches;
}

export async function applyEmbeddedFontStyles(file: File, pages: PageData[]): Promise<void> {
  const sourcePdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const sourcePages = sourcePdf.getPages();

  for (const pageData of pages) {
    const sourcePage = sourcePages[pageData.pageNumber - 1];
    if (!sourcePage) continue;
    const pageResources = sourcePage.node.Resources();
    const fontResources = pageResources && pageResources.has(PDFName.of('Font'))
      ? pageResources.get(PDFName.of('Font'))
      : undefined;
    if (!(fontResources instanceof PDFDict)) continue;

    for (const span of pageData.textSpans) {
      const fontIndex = span.fontName.match(/_f(\d+)$/)?.[1];
      if (!fontIndex) continue;
      const fontReference = fontResources.get(PDFName.of(`F${fontIndex}`));      if (!fontReference) continue;

      const fontObject = sourcePdf.context.lookup(fontReference);
      if (!(fontObject instanceof PDFDict)) continue;

      const baseFont = fontObject.get(PDFName.of('BaseFont'));
      if (!(baseFont instanceof PDFName)) continue;
      const fontName = baseFont.decodeText().replace(/^[A-Z]{6}\+/, '');
      span.bold = /bold|black|demi|heavy/i.test(fontName);
      span.italic = /italic|oblique/i.test(fontName);
      // Preserve the embedded PDF font's real family for the editor UI. Export
      // will reuse the original embedded program when it contains the new text.
      const family = fontName.replace(/[-_,](bold|italic|oblique|regular|medium|light|black|semibold|demi).*$/i, '').replace(/^[A-Z]{6}\+/, '');
      if (family) span.fontFamily = family;
    }
  }
}

export async function extractAllPages(
  pdf: pdfjsLib.PDFDocumentProxy,
  onProgress?: (page: number, total: number) => void
): Promise<PageData[]> {
  const pages: PageData[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    let pageData: PageData;
    try {
      pageData = await extractPageData(pdf, i);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      let width = 612;
      let height = 792;
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        width = viewport.width;
        height = viewport.height;
      } catch {
        // Keep usable page dimensions when optional content analysis fails.
      }
      pageData = {
        pageNumber: i,
        width,
        height,
        rotation: 0,
        textSpans: [],
        imageBoxes: [],
        analysisError: detail,
      };
    }
    pages.push(pageData);
    onProgress?.(i, pdf.numPages);
  }
  return pages;
}

export function hasUsableText(page: PageData): boolean {
  const totalChars = page.textSpans.reduce((sum, s) => sum + s.text.length, 0);
  return totalChars > 10;
}

export async function validatePdfBytes(
  data: Uint8Array,
  expectedPageCount: number,
  onProgress?: (page: number, total: number) => void
): Promise<void> {
  // PDF.js may transfer and detach the supplied buffer to its worker. Validate a
  // copy so callers can still use the original bytes to construct the download.
  const loadingTask = pdfjsLib.getDocument({ data: data.slice() });
  let pdf: pdfjsLib.PDFDocumentProxy | null = null;
  let validatingPage = 0;

  try {
    pdf = await loadingTask.promise;
    if (pdf.numPages !== expectedPageCount) {
      throw new Error(`Expected ${expectedPageCount} pages, but the exported PDF contains ${pdf.numPages}.`);
    }

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      validatingPage = pageNumber;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error(`Could not allocate a validation canvas for page ${pageNumber}.`);
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      onProgress?.(pageNumber, pdf.numPages);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const pageMessage = validatingPage ? ` on page ${validatingPage}` : '';
    throw new Error(`Exported PDF validation failed${pageMessage}: ${detail}`);
  } finally {
    await loadingTask.destroy();
  }
}

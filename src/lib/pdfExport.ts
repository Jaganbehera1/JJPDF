// PDF export using pdf-lib — applies text edits, annotations, images, page ops

import { decodePDFRawStream, PDFDict, PDFDocument, PDFImage, PDFName, PDFRawStream, rgb, StandardFonts, degrees, rgb as rgbType, type PDFFont } from 'pdf-lib';
import 'regenerator-runtime/runtime';
import fontkit from '@pdf-lib/fontkit';
import type { DocumentState, TextEdit, Annotation, ImageItem } from '@/types';

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return rgbType(r, g, b);
}

function getFont(fontFamily: string): StandardFonts {
  const map: Record<string, StandardFonts> = {
    'Helvetica': StandardFonts.Helvetica,
    'Helvetica-Bold': StandardFonts.HelveticaBold,
    'Times-Roman': StandardFonts.TimesRoman,
    'Times-Bold': StandardFonts.TimesRomanBold,
    'Courier': StandardFonts.Courier,
    'Courier-Bold': StandardFonts.CourierBold,
  };
  return map[fontFamily] ?? StandardFonts.Helvetica;
}

async function embedImageFromDataUrl(
  pdfDoc: PDFDocument,
  dataUrl: string
): Promise<{ img: PDFImage; width: number; height: number }> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bytes = await blob.arrayBuffer();

  if (blob.type === 'image/png' || dataUrl.startsWith('data:image/png')) {
    const img = await pdfDoc.embedPng(bytes);
    return { img, width: img.width, height: img.height };
  } else {
    const img = await pdfDoc.embedJpg(bytes);
    return { img, width: img.width, height: img.height };
  }
}

export async function exportPdf(
  state: DocumentState,
  originalFile: File,
  onProgress?: (step: string) => void
): Promise<Uint8Array> {
  onProgress?.('Loading original PDF...');
  const fileBuffer = await originalFile.arrayBuffer();
  const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  pdfDoc.registerFontkit(fontkit);
  const pages = pdfDoc.getPages();

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const standardFontCache = new Map<string, Promise<PDFFont>>();
  const editFont = (edit: TextEdit): Promise<PDFFont> => {
    const family = edit.fontFamily === 'Times-Roman' ? 'TimesRoman' : edit.fontFamily === 'Courier' ? 'Courier' : 'Helvetica';
    const style = edit.bold && edit.italic ? (family === 'Helvetica' ? 'BoldOblique' : family === 'TimesRoman' ? 'BoldItalic' : 'BoldOblique')
      : edit.bold ? 'Bold' : edit.italic ? (family === 'Helvetica' ? 'Oblique' : family === 'TimesRoman' ? 'Italic' : 'Oblique') : '';
    const key = `${family}${style}` as keyof typeof StandardFonts;
    if (!standardFontCache.has(key)) standardFontCache.set(key, pdfDoc.embedFont(StandardFonts[key]));
    return standardFontCache.get(key)!;
  };
  let unicodeFontPromise: Promise<PDFFont> | null = null;
  const originalFontCache = new Map<string, Promise<PDFFont | null>>();
  const originalFontForEdit = (edit: TextEdit): Promise<PDFFont | null> => {
    const resourceIndex = edit.fontName?.match(/_f(\d+)$/)?.[1];
    if (!resourceIndex) return Promise.resolve(null);

    const cacheKey = `${edit.page}:${edit.fontName}`;
    if (!originalFontCache.has(cacheKey)) {
      originalFontCache.set(cacheKey, (async () => {
        const page = pages[edit.page - 1];
        const pageResources = page.node.Resources();
        const fontResources = pageResources && pageResources.has(PDFName.of('Font'))
          ? pageResources.get(PDFName.of('Font'))
          : undefined;
        if (!(fontResources instanceof PDFDict)) return null;

        const fontReference = fontResources.get(PDFName.of(`F${resourceIndex}`));
        if (!fontReference) return null;

        const fontObject = pdfDoc.context.lookup(fontReference);
        if (!(fontObject instanceof PDFDict)) return null;

        const descriptor = fontObject.lookup(PDFName.of('FontDescriptor'), PDFDict);
        if (!(descriptor instanceof PDFDict)) return null;

        const fontFile = descriptor.get(PDFName.of('FontFile2'));
        if (!fontFile) return null;

        const fontStream = pdfDoc.context.lookup(fontFile);
        if (!(fontStream instanceof PDFRawStream)) return null;
        const fontBytes = decodePDFRawStream(fontStream).decode();
        return pdfDoc.embedFont(fontBytes, { subset: true });
      })());
    }
    return originalFontCache.get(cacheKey)!;
  };
  const fontForText = async (text: string, standardFont: PDFFont, edit?: TextEdit): Promise<PDFFont> => {
    if (/[^\u0000-\u00ff]/u.test(text)) {
      if (!unicodeFontPromise) {
        unicodeFontPromise = fetch('/fonts/NotoSansOriya-Regular.ttf')
          .then((response) => {
            if (!response.ok) throw new Error('Could not load the bundled Unicode font.');
            return response.arrayBuffer();
          })
          .then((bytes) => pdfDoc.embedFont(bytes, { subset: true }));
      }
      return unicodeFontPromise;
    }
    const originalFont = edit ? await originalFontForEdit(edit) : null;
    if (!originalFont) return standardFont;
    const characterSet = new Set(originalFont.getCharacterSet());
    return [...text].every((character) => characterSet.has(character.codePointAt(0)!))
      ? originalFont
      : standardFont;
  };

  // Get pages in the correct order, respecting page reordering and deletion
  const orderedPageIndices = state.pageOrder.filter(
    (idx) => !state.deletedPages.includes(idx)
  );

  // Copy pages we need from the original
  const pageMap = new Map<number, typeof pages[0]>();
  for (let i = 0; i < pages.length; i++) {
    pageMap.set(i, pages[i]);
  }

  onProgress?.('Applying page rotations...');
  for (const pageIdx of orderedPageIndices) {
    const page = pageMap.get(pageIdx);
    if (!page) continue;
    const rotation = state.pageRotations[pageIdx] || 0;
    if (rotation !== 0) {
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees((currentRotation + rotation) % 360));
    }
  }

  // Erase covers sit above the source page but below edited text and inserted images.
  for (const ann of state.annotations) {
    if (ann.kind !== 'erase' || ann.sourceImageOperatorIndex !== undefined) continue;
    const page = pageMap.get(ann.page - 1);
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();
    const scaleX = pageWidth / (state.pages[ann.page - 1]?.width || pageWidth);
    const scaleY = pageHeight / (state.pages[ann.page - 1]?.height || pageHeight);
    const x = ann.bbox.x * scaleX;
    const y = pageHeight - (ann.bbox.y + ann.bbox.height) * scaleY;
    const width = ann.bbox.width * scaleX;
    const height = ann.bbox.height * scaleY;
    if (ann.backgroundDataUrl) {
      const { img } = await embedImageFromDataUrl(pdfDoc, ann.backgroundDataUrl);
      page.drawImage(img, { x, y, width, height, opacity: ann.opacity });
    } else {
      page.drawRectangle({ x, y, width, height, color: hexToRgb(ann.color), opacity: ann.opacity });
    }
  }

  // Apply text edits
  onProgress?.('Applying text edits...');
  for (const edit of state.textEdits) {
    // Text edits are stored against their original PDF page, so reordering does not change their target.
    const pageIdx = edit.page - 1;
    const page = pageMap.get(pageIdx);
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();

    // Draw white rectangle over original text to "erase" it
    const scaleY = pageHeight / (state.pages[edit.page - 1]?.height || pageHeight);
    const scaleX = pageWidth / (state.pages[edit.page - 1]?.width || pageWidth);

    // Restore the sampled/inpainted page background beneath OCR text where possible.
    const maskX = edit.bbox.x * scaleX;
    const maskY = pageHeight - (edit.bbox.y + edit.bbox.height) * scaleY;
    const maskWidth = edit.bbox.width * scaleX;
    const maskHeight = edit.bbox.height * scaleY;
    if (edit.backgroundDataUrl) {
      const { img } = await embedImageFromDataUrl(pdfDoc, edit.backgroundDataUrl);
      page.drawImage(img, { x: maskX, y: maskY, width: maskWidth, height: maskHeight });
    } else {
      page.drawRectangle({
        x: maskX, y: maskY, width: maskWidth, height: maskHeight,
        color: hexToRgb(edit.backgroundColor || '#ffffff'),
      });
    }

    // Draw new text
    const font = await fontForText(edit.newText, await editFont(edit), edit);

    const fontSize = edit.fontSize;
    const textY = pageHeight - (edit.bbox.y + edit.bbox.height) * scaleY + 2;

    const lines = edit.newText.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let textX = edit.bbox.x * scaleX;
      const textWidth = font.widthOfTextAtSize(line, fontSize);

      if (edit.alignment === 'center') {
        textX = edit.bbox.x * scaleX + (edit.bbox.width * scaleX - textWidth) / 2;
      } else if (edit.alignment === 'right') {
        textX = edit.bbox.x * scaleX + edit.bbox.width * scaleX - textWidth;
      }

      if (!line) continue;
      page.drawText(line, {
        x: textX,
        y: textY - li * (fontSize * 1.2),
        size: fontSize,
        font,
        color: hexToRgb(edit.color),
      });
    }
  }

  // Apply images
  onProgress?.('Applying images...');
  for (const imgItem of state.images) {
    if (imgItem.isOriginal || !imgItem.dataUrl) continue;
    const pageIdx = imgItem.page - 1;
    const page = pageMap.get(pageIdx);
    if (!page) continue;

    try {
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const scaleX = pageWidth / (state.pages[imgItem.page - 1]?.width || pageWidth);
      const scaleY = pageHeight / (state.pages[imgItem.page - 1]?.height || pageHeight);

      const { img } = await embedImageFromDataUrl(pdfDoc, imgItem.dataUrl);

      page.drawImage(img, {
        x: imgItem.bbox.x * scaleX,
        y: pageHeight - (imgItem.bbox.y + imgItem.bbox.height) * scaleY,
        width: imgItem.bbox.width * scaleX,
        height: imgItem.bbox.height * scaleY,
        opacity: imgItem.opacity,
        rotate: degrees(imgItem.rotation || 0),
      });
    } catch {
      // Skip images that can't be embedded
    }
  }

  // Apply annotations
  onProgress?.('Applying annotations...');
  for (const ann of state.annotations) {
    if (ann.kind === 'erase') continue;
    const pageIdx = ann.page - 1;
    const page = pageMap.get(pageIdx);
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();
    const scaleX = pageWidth / (state.pages[ann.page - 1]?.width || pageWidth);
    const scaleY = pageHeight / (state.pages[ann.page - 1]?.height || pageHeight);

    const ax = ann.bbox.x * scaleX;
    const ay = pageHeight - (ann.bbox.y + ann.bbox.height) * scaleY;
    const aw = ann.bbox.width * scaleX;
    const ah = ann.bbox.height * scaleY;
    const color = hexToRgb(ann.color);

    if (ann.kind === 'highlight') {
      page.drawRectangle({
        x: ax,
        y: ay,
        width: aw,
        height: ah,
        color,
        opacity: ann.opacity * 0.4,
      });
    } else if (ann.kind === 'underline') {
      page.drawLine({
        start: { x: ax, y: ay },
        end: { x: ax + aw, y: ay },
        thickness: ann.strokeWidth,
        color,
        opacity: ann.opacity,
      });
    } else if (ann.kind === 'strikethrough') {
      page.drawLine({
        start: { x: ax, y: ay + ah / 2 },
        end: { x: ax + aw, y: ay + ah / 2 },
        thickness: ann.strokeWidth,
        color,
        opacity: ann.opacity,
      });
    } else if (ann.kind === 'shape' && ann.shapeKind) {
      if (ann.shapeKind === 'rectangle') {
        page.drawRectangle({
          x: ax,
          y: ay,
          width: aw,
          height: ah,
          borderColor: color,
          borderWidth: ann.strokeWidth,
          opacity: ann.opacity,
        });
      } else if (ann.shapeKind === 'circle') {
        page.drawEllipse({
          x: ax + aw / 2,
          y: ay + ah / 2,
          xScale: aw / 2,
          yScale: ah / 2,
          borderColor: color,
          borderWidth: ann.strokeWidth,
          opacity: ann.opacity,
        });
      } else if (ann.shapeKind === 'line' || ann.shapeKind === 'arrow') {
        page.drawLine({
          start: { x: ax, y: ay + ah },
          end: { x: ax + aw, y: ay },
          thickness: ann.strokeWidth,
          color,
          opacity: ann.opacity,
        });
        if (ann.shapeKind === 'arrow' && ann.points && ann.points.length >= 2) {
          const p0 = ann.points[0];
          const p1 = ann.points[ann.points.length - 1];
          page.drawLine({
            start: { x: p1.x * scaleX, y: pageHeight - p1.y * scaleY },
            end: { x: (p1.x - 10) * scaleX, y: pageHeight - (p1.y - 10) * scaleY },
            thickness: ann.strokeWidth,
            color,
            opacity: ann.opacity,
          });
        }
      }
    } else if (ann.kind === 'draw' && ann.points && ann.points.length >= 2) {
      for (let i = 1; i < ann.points.length; i++) {
        const p0 = ann.points[i - 1];
        const p1 = ann.points[i];
        page.drawLine({
          start: { x: p0.x * scaleX, y: pageHeight - p0.y * scaleY },
          end: { x: p1.x * scaleX, y: pageHeight - p1.y * scaleY },
          thickness: ann.strokeWidth,
          color,
          opacity: ann.opacity,
        });
      }
    } else if (ann.kind === 'stickyNote' && ann.text) {
      page.drawRectangle({
        x: ax,
        y: ay,
        width: Math.max(aw, 120),
        height: Math.max(ah, 40),
        color: rgb(1, 0.93, 0.5),
        opacity: 0.9,
        borderColor: rgb(0.9, 0.8, 0.3),
        borderWidth: 1,
      });
      const noteText = ann.text.length > 50 ? ann.text.substring(0, 50) + '...' : ann.text;
      page.drawText(noteText, {
        x: ax + 4,
        y: ay + Math.max(ah, 40) - 14,
        size: 8,
        font: await fontForText(noteText, helvetica),
        color: rgb(0.3, 0.2, 0.1),
      });
    } else if (ann.kind === 'comment' && ann.text) {
      page.drawRectangle({
        x: ax,
        y: ay,
        width: Math.max(aw, 100),
        height: 16,
        color: color,
        opacity: 0.2,
      });
      const commentText = ann.text.length > 40 ? ann.text.substring(0, 40) + '...' : ann.text;
      page.drawText(commentText, {
        x: ax + 2,
        y: ay + 4,
        size: 7,
        font: await fontForText(commentText, helvetica),
        color,
      });
    }
  }

  // Apply signatures
  onProgress?.('Applying signatures...');
  for (const sig of state.signatures) {
    const pageIdx = state.pageOrder[sig.page - 1] ?? sig.page - 1;
    const page = pageMap.get(pageIdx);
    if (!page) continue;

    try {
      const { img } = await embedImageFromDataUrl(pdfDoc, sig.dataUrl);
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const scaleX = pageWidth / (state.pages[sig.page - 1]?.width || pageWidth);
      const scaleY = pageHeight / (state.pages[sig.page - 1]?.height || pageHeight);

      page.drawImage(img, {
        x: sig.bbox.x * scaleX,
        y: pageHeight - (sig.bbox.y + sig.bbox.height) * scaleY,
        width: sig.bbox.width * scaleX,
        height: sig.bbox.height * scaleY,
      });
    } catch {
      // Skip
    }
  }

  // Apply watermarks
  onProgress?.('Applying watermarks...');
  for (const wm of state.watermarks) {
    for (const pageIdx of orderedPageIndices) {
      const page = pageMap.get(pageIdx);
      if (!page) continue;
      const { width: pw, height: ph } = page.getSize();
      const watermarkFont = await fontForText(wm.text, helveticaBold);
      const textWidth = watermarkFont.widthOfTextAtSize(wm.text, wm.fontSize);
      page.drawText(wm.text, {
        x: (pw - textWidth) / 2,
        y: ph / 2,
        size: wm.fontSize,
        font: watermarkFont,
        color: rgb(0.8, 0.8, 0.8),
        opacity: wm.opacity,
        rotate: degrees(45),
      });
    }
  }

  // Apply page numbers
  if (state.pageNumbers) {
    onProgress?.('Applying page numbers...');
    const { position, fontSize: pnfs, startAt } = state.pageNumbers;
    for (let i = 0; i < orderedPageIndices.length; i++) {
      const pageIdx = orderedPageIndices[i];
      const page = pageMap.get(pageIdx);
      if (!page) continue;
      const { width: pw, height: ph } = page.getSize();
      const numText = String(startAt + i);
      const textWidth = helvetica.widthOfTextAtSize(numText, pnfs);
      const margin = 20;
      let x = margin;
      let y = margin;
      if (position.startsWith('top')) y = ph - margin - pnfs;
      if (position.endsWith('center')) x = (pw - textWidth) / 2;
      if (position.endsWith('right')) x = pw - margin - textWidth;
      page.drawText(numText, {
        x,
        y,
        size: pnfs,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });
    }
  }

  // Apply OCR text overlays
  onProgress?.('Applying OCR text...');
  for (const [pageKey, ocrText] of Object.entries(state.ocrText)) {
    const pageNum = parseInt(pageKey);
    const pageIdx = state.pageOrder[pageNum - 1] ?? pageNum - 1;
    const page = pageMap.get(pageIdx);
    if (!page || !ocrText) continue;

    // Add OCR text as invisible/semi-visible text layer
    const lines = ocrText.split('\n').filter((l) => l.trim());
    const startY = page.getSize().height - 40;
    for (let li = 0; li < Math.min(lines.length, 50); li++) {
      try {
        page.drawText(lines[li].substring(0, 100), {
          x: 30,
          y: startY - li * 14,
          size: 10,
          font: await fontForText(lines[li].substring(0, 100), helvetica),
          color: rgb(0, 0, 0),
          opacity: 0.01, // nearly invisible but searchable
        });
      } catch {
        // skip lines that can't be drawn
      }
    }
  }

  const requiresPageRebuild = orderedPageIndices.length !== pages.length ||
    orderedPageIndices.some((pageIdx, position) => pageIdx !== position);
  if (requiresPageRebuild) {
    onProgress?.('Restructuring pages...');
    const newDoc = await PDFDocument.create();
    for (const pageIdx of orderedPageIndices) {
      const page = pageMap.get(pageIdx);
      if (!page) {
        throw new Error(`Page ${pageIdx + 1} cannot be exported because it has no corresponding source PDF page.`);
      }
      const [copied] = await newDoc.copyPages(pdfDoc, [pageIdx]);
      newDoc.addPage(copied);
    }
    onProgress?.('Saving PDF...');
    return await newDoc.save();
  }

  onProgress?.('Saving PDF...');
  return await pdfDoc.save();
}

export async function mergePdfs(
  primaryFile: File,
  additionalFiles: File[]
): Promise<Uint8Array> {
  const primaryBuffer = await primaryFile.arrayBuffer();
  const mergedDoc = await PDFDocument.load(primaryBuffer, { ignoreEncryption: true });

  for (const file of additionalFiles) {
    const buffer = await file.arrayBuffer();
    const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const copiedPages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
    for (const page of copiedPages) {
      mergedDoc.addPage(page);
    }
  }

  return await mergedDoc.save();
}

export async function splitPdf(
  file: File,
  pageRanges: { start: number; end: number }[]
): Promise<Uint8Array[]> {
  const buffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const results: Uint8Array[] = [];

  for (const range of pageRanges) {
    const newDoc = await PDFDocument.create();
    const indices: number[] = [];
    for (let i = range.start - 1; i < range.end && i < srcDoc.getPageCount(); i++) {
      indices.push(i);
    }
    const copiedPages = await newDoc.copyPages(srcDoc, indices);
    for (const page of copiedPages) {
      newDoc.addPage(page);
    }
    results.push(await newDoc.save());
  }

  return results;
}

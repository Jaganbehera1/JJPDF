// Main PDF Editor — orchestrates all editor components and state

import { useState, useCallback, useRef, useEffect } from 'react';
import type * as pdfjsLib from 'pdfjs-dist';
import type { DocumentState, ToolType, TextEdit, ImageItem, Annotation, ShapeKind, BoundingBox, TextSpan } from '@/types';
import { loadPdfFromFile, extractAllPages, applyEmbeddedFontStyles, cropBackgroundPatches, reconstructBackgroundPatches, renderPageToCanvas, validatePdfBytes } from '@/lib/pdfRenderer';
import { exportPdf, mergePdfs, splitPdf } from '@/lib/pdfExport';
import { runOcrWords } from '@/lib/ocr';
import { X, AlertTriangle } from 'lucide-react';
import ProcessingOverlay from '../ProcessingOverlay';
import TopNav from './TopNav';
import LeftToolbar from './LeftToolbar';
import RightPanel from './RightPanel';
import PdfCanvas from './PdfCanvas';
import OrganizePages from './OrganizePages';
import SignaturePad from './SignaturePad';

interface EditorProps {
  file: File;
  onBack: () => void;
}

let idCounter = 0;
const genId = () => `id-${++idCounter}-${Date.now()}`;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function subtractTextAreas(region: BoundingBox, textAreas: BoundingBox[]): BoundingBox[] {
  let remaining = [region];

  for (const textArea of textAreas) {
    const protectedArea = {
      x: textArea.x - 1.5,
      y: textArea.y - 1.5,
      width: textArea.width + 3,
      height: textArea.height + 3,
    };
    remaining = remaining.flatMap((area) => {
      const left = Math.max(area.x, protectedArea.x);
      const top = Math.max(area.y, protectedArea.y);
      const right = Math.min(area.x + area.width, protectedArea.x + protectedArea.width);
      const bottom = Math.min(area.y + area.height, protectedArea.y + protectedArea.height);

      if (right <= left || bottom <= top) return [area];

      const pieces: BoundingBox[] = [];
      if (top > area.y) pieces.push({ x: area.x, y: area.y, width: area.width, height: top - area.y });
      if (bottom < area.y + area.height) pieces.push({ x: area.x, y: bottom, width: area.width, height: area.y + area.height - bottom });
      if (left > area.x) pieces.push({ x: area.x, y: top, width: left - area.x, height: bottom - top });
      if (right < area.x + area.width) pieces.push({ x: right, y: top, width: area.x + area.width - right, height: bottom - top });
      return pieces;
    });
    if (!remaining.length) break;
  }

  return remaining.filter((area) => area.width > 0.5 && area.height > 0.5);
}

export default function Editor({ file, onBack }: EditorProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [docState, setDocState] = useState<DocumentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStatus, setLoadStatus] = useState('Reading file...');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [zoom, setZoom] = useState(() => window.innerWidth < 768 ? Math.min(1, (window.innerWidth - 32) / 612) : 1);
  const [mobileAutoFit, setMobileAutoFit] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);

  const [annotationColor, setAnnotationColor] = useState('#ffeb3b');
  const [annotationWidth, setAnnotationWidth] = useState(3);
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rectangle');

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [isDownloading, setIsDownloading] = useState(false);
  const [showOrganize, setShowOrganize] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [showOcrPanel, setShowOcrPanel] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrResult, setOcrResult] = useState<string>('');
  const [ocrRunning, setOcrRunning] = useState(false);

  // Undo/redo
  const [undoStack, setUndoStack] = useState<DocumentState[]>([]);
  const [redoStack, setRedoStack] = useState<DocumentState[]>([]);
  const fileInputImageRef = useRef<HTMLInputElement>(null);
  const fileInputReplaceRef = useRef<HTMLInputElement>(null);
  const fileInputMergeRef = useRef<HTMLInputElement>(null);
  const replaceImageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const fitPage = () => {
      if (!mobileAutoFit) return;
      const pageWidth = docState?.pages[0]?.width || 612;
      setZoom(window.innerWidth < 768 ? Math.min(1, Math.max(0.25, (window.innerWidth - 32) / pageWidth)) : 1);
    };
    fitPage();
    window.addEventListener('resize', fitPage);
    return () => window.removeEventListener('resize', fitPage);
  }, [docState?.pages, mobileAutoFit]);

  // Load PDF on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadProgress(0);
      setLoadStatus('Reading file...');
      setLoadError(null);

      try {
        setLoadStatus('Loading PDF document...');
        const { pdf, pageCount } = await loadPdfFromFile(file, (p) => {
          setLoadProgress(p);
          setLoadStatus('Loading PDF document...');
        });

        if (cancelled) return;

        setLoadProgress(0.9);
        setLoadStatus('Extracting text content...');
        const pages = await extractAllPages(pdf, (page, total) => {
          setLoadProgress(0.9 + (page / total) * 0.1);
          setLoadStatus(`Extracting page ${page} of ${total}...`);
        });

        setLoadStatus('Reading embedded text styles...');
        await applyEmbeddedFontStyles(file, pages);

        if (cancelled) return;

        const initialState: DocumentState = {
          fileName: file.name,
          file,
          pageCount,
          pages,
          textEdits: [],
          images: pages.flatMap((page) => (page.imageBoxes || []).map(({ bbox, dataUrl, backgroundColor, operatorIndex }) => ({
            id: genId(), page: page.pageNumber, dataUrl, bbox, originalBbox: { ...bbox },
            originalOpIndex: operatorIndex,
            originalBackgroundColor: backgroundColor, rotation: 0, opacity: 1, isOriginal: true,
          }))),
          annotations: [],
          pageOrder: Array.from({ length: pageCount }, (_, i) => i),
          pageRotations: {},
          deletedPages: [],
          watermarks: [],
          pageNumbers: null,
          signatures: [],
          ocrText: {},
        };

        setPdfDoc(pdf);
        setDocState(initialState);
        const failedAnalysisPages = pages.filter((page) => page.analysisError);
        if (failedAnalysisPages.length > 0) {
          setLoadError(`Analysis failed for ${failedAnalysisPages.map((page) => `page ${page.pageNumber}: ${page.analysisError}`).join('; ')}`);
        }
        setLoadProgress(1);
        setLoadStatus('Ready');
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('password') || msg.includes('Password')) {
          setLoadError('This PDF is password-protected. Please remove the password and try again.');
        } else if (msg.includes('Invalid') || msg.includes('format')) {
          setLoadError('This file appears to be damaged or is not a valid PDF.');
        } else {
          setLoadError(`Unable to open this PDF: ${msg}`);
        }
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [file]);

  // Mark unsaved when state changes
  const markUnsaved = useCallback(() => {
    setSaveStatus('unsaved');
  }, []);

  const pushUndo = useCallback((newState: DocumentState) => {
    setDocState((prev) => {
      if (prev) setUndoStack((stack) => [...stack.slice(-30), prev]);
      return newState;
    });
    setRedoStack([]);
    markUnsaved();
  }, [markUnsaved]);

  const handleUndo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      setDocState((current) => {
        if (current) setRedoStack((r) => [...r, current]);
        return prev;
      });
      return stack.slice(0, -1);
    });
    markUnsaved();
  }, [markUnsaved]);

  const handleRedo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setDocState((current) => {
        if (current) setUndoStack((u) => [...u, current]);
        return next;
      });
      return stack.slice(0, -1);
    });
    markUnsaved();
  }, [markUnsaved]);

  const updateDocState = useCallback((updater: (prev: DocumentState) => DocumentState) => {
    setDocState((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      setUndoStack((stack) => [...stack.slice(-30), prev]);
      setRedoStack([]);
      return next;
    });
    markUnsaved();
  }, [markUnsaved]);

  // Tool change
  const handleToolChange = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    if (tool !== 'select') {
      setSelectedTextId(null);
      setSelectedImageId(null);
      setSelectedAnnotationId(null);
      setSelectedSignatureId(null);
    }
    if (tool === 'organize') {
      setShowOrganize(true);
      setActiveTool('select');
    }
    if (tool === 'fillSign') {
      setShowSignaturePad(true);
      setActiveTool('select');
    }
  }, []);

  // Add text
  const handleAddText = useCallback((page: number, bbox: BoundingBox, originalText = '', style: Partial<TextEdit> = {}) => {
    const newEdit: TextEdit = {
      id: genId(),
      page,
      originalText,
      newText: originalText || 'New text',
      bbox,
      fontSize: style.fontSize ?? 14,
      fontFamily: style.fontFamily ?? 'Helvetica',
      fontName: style.fontName,
      color: style.color ?? '#000000',
      backgroundColor: style.backgroundColor ?? '#ffffff',
      backgroundDataUrl: style.backgroundDataUrl,
      bold: style.bold ?? false,
      italic: style.italic ?? false,
      underline: false,
      alignment: 'left',
    };
    updateDocState((prev) => ({
      ...prev,
      textEdits: [...prev.textEdits, newEdit],
    }));
    setSelectedTextId(newEdit.id);
    setActiveTool('select');
  }, [updateDocState]);

  // Update text
  const handleUpdateText = useCallback((id: string, updates: Partial<TextEdit>) => {
    updateDocState((prev) => ({
      ...prev,
      textEdits: prev.textEdits.map((t) => t.id === id ? { ...t, ...updates } : t),
    }));
  }, [updateDocState]);

  // Delete text
  const handleDeleteText = useCallback(async (id: string) => {
    const target = docState?.textEdits.find((edit) => edit.id === id);
    let backgroundDataUrl = target?.backgroundDataUrl;
    // Older OCR detections may not have captured an inpaint patch. Create it at
    // deletion time so existing selections also work on colored backgrounds.
    if (target?.fontName === 'OCR' && pdfDoc && docState) {
      const pageData = docState.pages[target.page - 1];
      if (pageData) {
        try {
          const { canvas } = await renderPageToCanvas(pdfDoc, target.page, 2);
          const scaleX = canvas.width / pageData.width;
          const scaleY = canvas.height / pageData.height;
          const box = {
            x: Math.max(0, target.bbox.x * scaleX),
            y: Math.max(0, target.bbox.y * scaleY),
            width: Math.min(canvas.width, (target.bbox.x + target.bbox.width) * scaleX) - Math.max(0, target.bbox.x * scaleX),
            height: Math.min(canvas.height, (target.bbox.y + target.bbox.height) * scaleY) - Math.max(0, target.bbox.y * scaleY),
          };
          backgroundDataUrl = reconstructBackgroundPatches(canvas, box, [box])[0]?.dataUrl;
          canvas.width = 0;
          canvas.height = 0;
        } catch (error) {
          setLoadError(`Could not reconstruct the footer background: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
      }
    }
    updateDocState((prev) => ({
      ...prev,
      // Keep an edit for detected text so the export continues to mask it.
      textEdits: prev.textEdits.flatMap((t) => t.id !== id ? [t] : t.originalText ? [{ ...t, newText: '', ...(backgroundDataUrl ? { backgroundDataUrl } : {}) }] : []),
    }));
    setSelectedTextId(null);
  }, [docState, pdfDoc, updateDocState]);

  const handleRemoveWatermarks = useCallback(() => {
    if (!docState) return;
    const spans = docState.pages.flatMap((page) => page.textSpans.map((span) => ({ pageData: page, span })));
    const counts = new Map<string, Set<number>>();
    for (const { span } of spans) {
      const key = span.text.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
      if (key) {
        const pages = counts.get(key) || new Set<number>();
        pages.add(span.page);
        counts.set(key, pages);
      }
    }
    const candidates = spans.filter(({ pageData, span }) => {
      const centerX = (span.bbox.x + span.bbox.width / 2) / pageData.width;
      const centerY = (span.bbox.y + span.bbox.height / 2) / pageData.height;
      const centered = centerX > 0.2 && centerX < 0.8 && centerY > 0.2 && centerY < 0.8;
      const large = span.fontSize >= Math.max(26, pageData.height * 0.035);
      const diagonal = Math.abs(span.rotation) > 12 && Math.abs(span.rotation) < 80;
      const repeated = (counts.get(span.text.trim().toLocaleLowerCase().replace(/\s+/g, ' '))?.size || 0) > 1;
      const alreadyEdited = docState.textEdits.some((edit) => edit.page === span.page && Math.abs(edit.bbox.x - span.bbox.x) < 2 && Math.abs(edit.bbox.y - span.bbox.y) < 2);
      return centered && large && (diagonal || repeated) && !alreadyEdited;
    });
    if (!candidates.length) {
      window.alert('No likely text watermarks were found. This detector checks large centered or diagonal text; it cannot detect watermarks baked into page images.');
      return;
    }
    const examples = [...new Set(candidates.slice(0, 4).map(({ span }) => span.text.trim()))].join(', ');
    if (!window.confirm(`Remove ${candidates.length} likely text watermark${candidates.length === 1 ? '' : 's'}?\n\n${examples}\n\nReview the detected text before exporting.`)) return;
    const edits: TextEdit[] = candidates.map(({ span }) => ({
      id: genId(), page: span.page, originalText: span.text, newText: '', bbox: span.bbox,
      fontSize: span.fontSize, fontFamily: span.fontFamily, color: span.color,
      backgroundColor: span.backgroundColor, bold: span.bold, italic: span.italic,
      underline: false, alignment: 'left',
    }));
    updateDocState((prev) => ({ ...prev, textEdits: [...prev.textEdits, ...edits] }));
  }, [docState, updateDocState]);

  // Add annotation
  const handleAddAnnotation = useCallback((ann: Omit<Annotation, 'id'>) => {
    const newAnn: Annotation = { ...ann, id: genId() };
    updateDocState((prev) => ({
      ...prev,
      annotations: [...prev.annotations, newAnn],
    }));
  }, [updateDocState]);

  // Update annotation
  const handleUpdateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
    updateDocState((prev) => ({
      ...prev,
      annotations: prev.annotations.map((a) => a.id === id ? { ...a, ...updates } : a),
    }));
  }, [updateDocState]);

  const handleUpdateSignature = useCallback((id: string, updates: { bbox?: BoundingBox }) => {
    updateDocState((prev) => ({ ...prev, signatures: prev.signatures.map((signature) => signature.id === id ? { ...signature, ...updates } : signature) }));
  }, [updateDocState]);

  const handleDeleteSignature = useCallback((id: string) => {
    updateDocState((prev) => ({ ...prev, signatures: prev.signatures.filter((signature) => signature.id !== id) }));
    setSelectedSignatureId(null);
  }, [updateDocState]);

  // Delete annotation
  const handleDeleteAnnotation = useCallback((id: string) => {
    updateDocState((prev) => ({
      ...prev,
      annotations: prev.annotations.filter((a) => a.id !== id),
    }));
    setSelectedAnnotationId(null);
  }, [updateDocState]);

  // Add image
  const handleAddImageItem = useCallback((page: number, bbox: BoundingBox) => {
    // Trigger file picker
    const input = fileInputImageRef.current;
    if (input) {
      input.dataset.page = String(page);
      input.dataset.bbox = JSON.stringify(bbox);
      input.click();
    }
  }, []);

  const handleImageFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    const page = parseInt(input.dataset.page || '1');
    const bbox = JSON.parse(input.dataset.bbox || '{"x":50,"y":50,"width":100,"height":100}');

    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const newImg: ImageItem = {
          id: genId(),
          page,
          dataUrl,
          bbox,
          rotation: 0,
          opacity: 1,
          isOriginal: false,
        };
        updateDocState((prev) => ({
          ...prev,
          images: [...prev.images, newImg],
        }));
        setSelectedImageId(newImg.id);
        setActiveTool('select');
      };
      reader.readAsDataURL(file);
    }
    input.value = '';
  }, [updateDocState]);

  // Replace image
  const handleReplaceImage = useCallback((id: string) => {
    replaceImageIdRef.current = id;
    fileInputReplaceRef.current?.click();
  }, []);

  const handleReplaceImageSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = replaceImageIdRef.current;
    if (file && id) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        updateDocState((prev) => ({
          ...prev,
          images: prev.images.map((img) => img.id === id ? { ...img, dataUrl } : img),
        }));
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, [updateDocState]);

  // Update image
  const handleUpdateImage = useCallback((id: string, updates: Partial<ImageItem>) => {
    updateDocState((prev) => ({
      ...prev,
      images: prev.images.map((img) => img.id === id ? { ...img, ...updates } : img),
    }));
  }, [updateDocState]);

  // Delete image
  const handleDeleteImage = useCallback(async (id: string) => {
    const image = docState?.images.find((item) => item.id === id);
    if (!image) return;
    const imageBounds = image?.originalBbox || image?.bbox;
    const textAreas = image?.isOriginal && imageBounds
      ? (docState?.pages[image.page - 1]?.textSpans || [])
        .map((span) => span.bbox)
        .filter((bbox) =>
          bbox.x < imageBounds.x + imageBounds.width &&
          bbox.x + bbox.width > imageBounds.x &&
          bbox.y < imageBounds.y + imageBounds.height &&
          bbox.y + bbox.height > imageBounds.y
        )
      : [];
    // For indexed PDF images, the filtered render already contains any vector text
    // drawn above the image, so patch the full image bounds from that render.
    // Only use text-area exclusions for the legacy, unindexed reconstruction path.
    const eraseAreas = image?.isOriginal && imageBounds
      ? image.originalOpIndex !== undefined ? [imageBounds] : subtractTextAreas(imageBounds, textAreas)
      : [];
    let backgroundPatches: Array<{ bbox: BoundingBox; dataUrl: string }> = [];
    if (image.isOriginal && imageBounds && eraseAreas.length) {
      if (!pdfDoc) {
        setLoadError('The PDF page is unavailable for background reconstruction. Please reload the document and try again.');
        return;
      }
      try {
        const { canvas } = await renderPageToCanvas(
          pdfDoc,
          image.page,
          1,
          0,
          image.originalOpIndex === undefined ? new Set() : new Set([image.originalOpIndex]),
        );
        backgroundPatches = image.originalOpIndex === undefined
          ? reconstructBackgroundPatches(canvas, imageBounds, eraseAreas)
          : cropBackgroundPatches(canvas, eraseAreas);
        canvas.width = 0;
        canvas.height = 0;
      } catch (error) {
        setLoadError(`Could not reconstruct the image background: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
    }
    updateDocState((prev) => ({
      ...prev,
      images: prev.images.filter((img) => img.id !== id),
      annotations: image?.isOriginal
        ? [
          ...prev.annotations,
          ...backgroundPatches.map(({ bbox, dataUrl }) => ({
          id: genId(),
          page: image.page,
          kind: 'erase' as const,
          color: image.originalBackgroundColor || '#ffffff',
          strokeWidth: 1,
          bbox,
          backgroundDataUrl: dataUrl,
          opacity: 1,
        }))]
        : prev.annotations,
    }));
    setSelectedImageId(null);
  }, [docState, pdfDoc, updateDocState]);

  // Page operations
  const handleRotatePage = useCallback(() => {
    const pageIdx = docState?.pageOrder[currentPage - 1] ?? currentPage - 1;
    updateDocState((prev) => ({
      ...prev,
      pageRotations: {
        ...prev.pageRotations,
        [pageIdx]: ((prev.pageRotations[pageIdx] || 0) + 90) % 360,
      },
    }));
  }, [docState, currentPage, updateDocState]);

  const handleDeletePage = useCallback(() => {
    if (!docState || docState.pageOrder.length - docState.deletedPages.length <= 1) return;
    const pageIdx = docState.pageOrder[currentPage - 1];
    updateDocState((prev) => ({
      ...prev,
      deletedPages: [...prev.deletedPages, pageIdx],
    }));
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  }, [docState, currentPage, updateDocState]);

  const handleAddBlankPage = useCallback(() => {
    if (!docState) return;
    updateDocState((prev) => {
      const newIdx = Math.max(...prev.pageOrder) + 1;
      const newPage = {
        pageNumber: newIdx + 1,
        width: prev.pages[0]?.width || 612,
        height: prev.pages[0]?.height || 792,
        textSpans: [],
        rotation: 0,
      };
      const newPosition = currentPage; // Insert after current page
      const newOrder = [...prev.pageOrder];
      newOrder.splice(newPosition, 0, newIdx);
      return {
        ...prev,
        pages: [...prev.pages, newPage],
        pageOrder: newOrder,
        pageCount: prev.pageCount + 1,
      };
    });
  }, [docState, currentPage, updateDocState]);

  // Download / Export
  const handleDownload = useCallback(async () => {
    if (!docState || !docState.file) return;
    setIsDownloading(true);
    setSaveStatus('saving');
    try {
      const pdfBytes = await exportPdf(docState, docState.file, (step) => {
        setLoadStatus(step);
      });
      if (!(pdfBytes instanceof Uint8Array) || pdfBytes.byteLength < 8 ||
          new TextDecoder().decode(pdfBytes.subarray(0, 5)) !== '%PDF-') {
        throw new Error('PDF export returned empty or invalid file data.');
      }
      const expectedPageCount = docState.pageOrder.filter((idx) => !docState.deletedPages.includes(idx)).length;
      await validatePdfBytes(pdfBytes, expectedPageCount, (page, total) => {
        setLoadStatus(`Validating exported page ${page} of ${total}...`);
      });
      // Make a private copy for Blob construction so worker transfers cannot
      // detach the bytes that the browser is about to download.
      const downloadBytes = new Uint8Array(pdfBytes);
      const blob = new Blob([downloadBytes.buffer], { type: 'application/pdf' });
      if (blob.size === 0) throw new Error('The exported PDF download is empty. Please try exporting again.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = docState.fileName.endsWith('.pdf') ? docState.fileName : docState.fileName + '.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setSaveStatus('saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(`Failed to export PDF: ${msg}`);
      setSaveStatus('unsaved');
    } finally {
      setIsDownloading(false);
    }
  }, [docState]);

  // Merge
  const handleMergeFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!docState || !e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    if (!docState.file) return;
    try {
      const merged = await mergePdfs(docState.file, files);
      const blob = new Blob([merged as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'merged.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setLoadError(`Failed to merge: ${err instanceof Error ? err.message : String(err)}`);
    }
    e.target.value = '';
  }, [docState]);

  // Signature
  const handleSaveSignature = useCallback((dataUrl: string) => {
    if (!docState) return;
    const sig = {
      id: genId(),
      page: currentPage,
      dataUrl,
      bbox: { x: 100, y: 100, width: 200, height: 80 },
    };
    updateDocState((prev) => ({
      ...prev,
      signatures: [...prev.signatures, sig],
    }));
    setShowSignaturePad(false);
  }, [docState, currentPage, updateDocState]);

  // OCR
  const handleRunOcr = useCallback(async () => {
    if (!pdfDoc || !docState) return;
    setOcrRunning(true);
    setOcrProgress(0);
    setOcrResult('');
    try {
      const page = await pdfDoc.getPage(docState.pageOrder[currentPage - 1] + 1);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d')!;
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      const ocr = await runOcrWords(canvas, (p) => setOcrProgress(p));
      const text = ocr.text;
      const sourcePageIndex = docState.pageOrder[currentPage - 1];
      const pageData = docState.pages[sourcePageIndex];
      if (pageData) {
        const scaleX = canvas.width / pageData.width;
        const scaleY = canvas.height / pageData.height;
        const ocrLines = (ocr.lines || []).filter((line) => line.text.trim() && line.confidence >= 30);
        const detections = ocrLines.length ? ocrLines : (ocr.words || [])
          .filter((word) => word.text.trim() && word.confidence >= 40);
        const rasterContext = canvas.getContext('2d', { willReadFrequently: true });
        const sampleBackground = (box: { x0: number; y0: number; x1: number; y1: number }) => {
          if (!rasterContext) return '#ffffff';
          const points = [
            [box.x0 - 3, box.y0 - 3], [(box.x0 + box.x1) / 2, box.y0 - 3], [box.x1 + 3, box.y0 - 3],
            [box.x0 - 3, box.y1 + 3], [(box.x0 + box.x1) / 2, box.y1 + 3], [box.x1 + 3, box.y1 + 3],
          ];
          const colors = points.map(([x, y]) => {
            const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
            const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
            return Array.from(rasterContext.getImageData(px, py, 1, 1).data).slice(0, 3);
          });
          const rgb = [0, 1, 2].map((channel) =>
            colors.map((color) => color[channel]).sort((a, b) => a - b)[Math.floor(colors.length / 2)]
          );
          return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
        };
        const recognized: TextSpan[] = detections.map((line, index) => {
          const paddedBox = {
            x: Math.max(0, line.bbox.x0 - 3),
            y: Math.max(0, line.bbox.y0 - 2),
            width: Math.min(canvas.width, line.bbox.x1 + 3) - Math.max(0, line.bbox.x0 - 3),
            height: Math.min(canvas.height, line.bbox.y1 + 2) - Math.max(0, line.bbox.y0 - 2),
          };
          const backgroundPatch = reconstructBackgroundPatches(canvas, paddedBox, [paddedBox])[0];
          return ({
            id: `ocr-${sourcePageIndex + 1}-${Date.now()}-${index}`,
            page: sourcePageIndex + 1,
            text: line.text.trim(),
            bbox: {
              x: paddedBox.x / scaleX,
              y: paddedBox.y / scaleY,
              width: Math.max(4, paddedBox.width / scaleX),
              height: Math.max(6, paddedBox.height / scaleY),
            },
            fontSize: Math.max(6, (line.bbox.y1 - line.bbox.y0) / scaleY),
            rotation: 0,
            fontName: 'OCR',
            fontFamily: 'Helvetica',
            bold: false,
            italic: false,
            color: '#000000',
            backgroundColor: sampleBackground({ x0: paddedBox.x, y0: paddedBox.y, x1: paddedBox.x + paddedBox.width, y1: paddedBox.y + paddedBox.height }),
            backgroundDataUrl: backgroundPatch?.dataUrl,
            isEditable: true,
          });
        });
        const newDetections = recognized.filter((detected) => !pageData.textSpans.some((span) => {
          const overlapWidth = Math.max(0, Math.min(span.bbox.x + span.bbox.width, detected.bbox.x + detected.bbox.width) - Math.max(span.bbox.x, detected.bbox.x));
          const overlapHeight = Math.max(0, Math.min(span.bbox.y + span.bbox.height, detected.bbox.y + detected.bbox.height) - Math.max(span.bbox.y, detected.bbox.y));
          return overlapWidth * overlapHeight > Math.min(span.bbox.width * span.bbox.height, detected.bbox.width * detected.bbox.height) * 0.5;
        }));
        if (newDetections.length) {
          updateDocState((prev) => ({
            ...prev,
            pages: prev.pages.map((page, index) => index === sourcePageIndex
              ? { ...page, textSpans: [...page.textSpans, ...newDetections] }
              : page),
          }));
        }
      }
      setOcrResult(text);
      updateDocState((prev) => ({
        ...prev,
        ocrText: { ...prev.ocrText, [currentPage]: text },
      }));
    } catch (err) {
      setLoadError(`OCR failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setOcrRunning(false);
    }
  }, [pdfDoc, docState, currentPage, updateDocState]);

  // Organize handlers
  const handleReorder = useCallback((newOrder: number[]) => {
    updateDocState((prev) => ({ ...prev, pageOrder: newOrder }));
  }, [updateDocState]);

  const handleOrganizeRotate = useCallback((pageIdx: number) => {
    updateDocState((prev) => ({
      ...prev,
      pageRotations: {
        ...prev.pageRotations,
        [pageIdx]: ((prev.pageRotations[pageIdx] || 0) + 90) % 360,
      },
    }));
  }, [updateDocState]);

  const handleOrganizeDelete = useCallback((pageIdx: number) => {
    updateDocState((prev) => ({
      ...prev,
      deletedPages: [...prev.deletedPages, pageIdx],
    }));
  }, [updateDocState]);

  const handleOrganizeDuplicate = useCallback((pageIdx: number) => {
    if (!docState) return;
    updateDocState((prev) => {
      const newIdx = Math.max(...prev.pageOrder) + 1;
      const originalPage = prev.pages[pageIdx];
      const newPage = originalPage ? { ...originalPage, pageNumber: newIdx + 1 } : {
        pageNumber: newIdx + 1,
        width: 612, height: 792, textSpans: [], rotation: 0,
      };
      const pos = prev.pageOrder.indexOf(pageIdx);
      const newOrder = [...prev.pageOrder];
      newOrder.splice(pos + 1, 0, newIdx);
      return {
        ...prev,
        pages: [...prev.pages, newPage],
        pageOrder: newOrder,
        pageCount: prev.pageCount + 1,
      };
    });
  }, [docState, updateDocState]);

  // Get selected items
  const selectedText = docState?.textEdits.find((t) => t.id === selectedTextId) || null;
  const selectedImage = docState?.images.find((i) => i.id === selectedImageId) || null;
  const selectedAnnotation = docState?.annotations.find((a) => a.id === selectedAnnotationId) || null;
  const selectedSignature = docState?.signatures.find((signature) => signature.id === selectedSignatureId) || null;

  // Hidden file inputs
  const hiddenInputs = (
    <>
      <input ref={fileInputImageRef} type="file" accept="image/*" className="hidden" onChange={handleImageFileSelected} />
      <input ref={fileInputReplaceRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceImageSelected} />
      <input ref={fileInputMergeRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={handleMergeFiles} />
    </>
  );

  if (loading) {
    return (
      <>
        <ProcessingOverlay
          fileName={file.name}
          fileSize={formatFileSize(file.size)}
          progress={loadProgress}
          status={loadStatus}
          error={loadError}
          onRetry={onBack}
          onCancel={onBack}
        />
        {hiddenInputs}
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <ProcessingOverlay
          fileName={file.name}
          fileSize={formatFileSize(file.size)}
          progress={0}
          status=""
          error={loadError}
          onRetry={onBack}
          onCancel={onBack}
        />
        {hiddenInputs}
      </>
    );
  }

  if (!docState) return null;

  return (
    <div className="h-screen h-[100dvh] min-h-0 flex flex-col bg-gray-100 overflow-hidden">
      <TopNav
        fileName={docState.fileName}
        onRename={(name) => updateDocState((prev) => ({ ...prev, fileName: name }))}
        onBack={onBack}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        zoom={zoom}
        onZoomIn={() => { setMobileAutoFit(false); setZoom((z) => Math.min(3, z + 0.25)); }}
        onZoomOut={() => { setMobileAutoFit(false); setZoom((z) => Math.max(0.25, z - 0.25)); }}
        onZoomReset={() => setMobileAutoFit(true)}
        currentPage={currentPage}
        totalPages={docState.pageOrder.filter((idx) => !docState.deletedPages.includes(idx)).length}
        onPrevPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setCurrentPage((p) => Math.min(docState.pageOrder.length - docState.deletedPages.length, p + 1))}
        onPageChange={setCurrentPage}
        saveStatus={saveStatus}
        onDownload={handleDownload}
        onRotatePage={handleRotatePage}
        onAddPage={handleAddBlankPage}
        onDeletePage={handleDeletePage}
        isDownloading={isDownloading}
      />

      <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden max-md:flex-col">
        <LeftToolbar activeTool={activeTool} onToolChange={handleToolChange} />

        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden max-md:order-1">
          {/* Secondary toolbar for document operations */}
          <SecondaryToolbar
            onMerge={() => fileInputMergeRef.current?.click()}
            onSplit={() => {/* split handled via dialog */}}
            onOcr={() => setShowOcrPanel(true)}
            onRemoveWatermarks={handleRemoveWatermarks}
            onAddWatermark={() => {
              const text = prompt('Watermark text:');
              if (text && docState) {
                updateDocState((prev) => ({
                  ...prev,
                  watermarks: [...prev.watermarks, { text, opacity: 0.3, fontSize: 60 }],
                }));
              }
            }}
            onAddPageNumbers={() => {
              if (docState) {
                updateDocState((prev) => ({
                  ...prev,
                  pageNumbers: { position: 'bottom-center', fontSize: 10, startAt: 1 },
                }));
              }
            }}
            onSplitPdf={async () => {
              if (!docState) return;
              const input = prompt('Page range (e.g. "1-3,4-6"):');
              if (!input) return;
              const ranges = input.split(',').map(r => {
                const [s, e] = r.trim().split('-').map(Number);
                return { start: s, end: e || s };
              });
              try {
                if (!docState.file) return;
                const results = await splitPdf(docState.file, ranges);
                results.forEach((bytes, i) => {
                  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `split-${i + 1}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                });
              } catch (err) {
                setLoadError(`Split failed: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          />

          <PdfCanvas
            pdfDoc={pdfDoc}
            documentState={docState}
            zoom={zoom}
            currentPage={currentPage}
            activeTool={activeTool}
            selectedTextId={selectedTextId}
            selectedImageId={selectedImageId}
            selectedAnnotationId={selectedAnnotationId}
            selectedSignatureId={selectedSignatureId}
            annotationColor={annotationColor}
            annotationWidth={annotationWidth}
            shapeKind={shapeKind}
            onPageCountChange={() => {}}
            onSelectText={setSelectedTextId}
            onSelectImage={setSelectedImageId}
            onSelectAnnotation={setSelectedAnnotationId}
            onSelectSignature={setSelectedSignatureId}
            onAddText={handleAddText}
            onAddAnnotation={handleAddAnnotation}
            onUpdateAnnotation={handleUpdateAnnotation}
            onUpdateImage={handleUpdateImage}
            onUpdateText={handleUpdateText}
            onUpdateSignature={handleUpdateSignature}
            onDeleteSignature={handleDeleteSignature}
            onAddImageItem={handleAddImageItem}
          />
        </div>

        <div className={`max-md:order-2 ${activeTool === 'select' && !selectedText && !selectedImage && !selectedAnnotation && !selectedSignature ? 'max-md:hidden' : 'max-md:max-h-[32dvh] max-md:overflow-y-auto'}`}>
        <RightPanel
          activeTool={activeTool}
          selectedText={selectedText}
          selectedImage={selectedImage}
          selectedAnnotation={selectedAnnotation}
          selectedSignature={selectedSignature}
          onUpdateSignature={handleUpdateSignature}
          onDeleteSignature={handleDeleteSignature}
          onUpdateText={handleUpdateText}
          onUpdateImage={handleUpdateImage}
          onUpdateAnnotation={handleUpdateAnnotation}
          onDeleteText={handleDeleteText}
          onDeleteImage={handleDeleteImage}
          onDeleteAnnotation={handleDeleteAnnotation}
          onReplaceImage={handleReplaceImage}
          onAddImage={() => {}}
          annotationColor={annotationColor}
          annotationWidth={annotationWidth}
          onAnnotationColorChange={setAnnotationColor}
          onAnnotationWidthChange={setAnnotationWidth}
          shapeKind={shapeKind}
          onShapeKindChange={setShapeKind}
        />
        </div>
      </div>

      {showOrganize && docState && (
        <OrganizePages
          documentState={docState}
          onClose={() => setShowOrganize(false)}
          onReorder={handleReorder}
          onRotate={handleOrganizeRotate}
          onDelete={handleOrganizeDelete}
          onDuplicate={handleOrganizeDuplicate}
          onAddBlankPage={handleAddBlankPage}
          onApply={() => setShowOrganize(false)}
        />
      )}

      {showSignaturePad && (
        <SignaturePad
          onSave={handleSaveSignature}
          onCancel={() => setShowSignaturePad(false)}
        />
      )}

      {showOcrPanel && (
        <OcrPanel
          currentPage={currentPage}
          ocrRunning={ocrRunning}
          ocrProgress={ocrProgress}
          ocrResult={ocrResult}
          existingOcrText={docState.ocrText[currentPage] || ''}
          onRun={handleRunOcr}
          onUpdateText={(text) => updateDocState((prev) => ({
            ...prev,
            ocrText: { ...prev.ocrText, [currentPage]: text },
          }))}
          onClose={() => setShowOcrPanel(false)}
        />
      )}

      {loadError && !loading && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm p-4 bg-red-50 border border-red-200 rounded-xl shadow-lg">
          <p className="text-sm text-red-700">{loadError}</p>
          <button onClick={() => setLoadError(null)} className="mt-2 text-xs text-red-500 hover:underline">Dismiss</button>
        </div>
      )}

      {hiddenInputs}
    </div>
  );
}

// Secondary toolbar for document-level operations
function SecondaryToolbar({ onMerge, onSplitPdf, onOcr, onAddWatermark, onAddPageNumbers, onRemoveWatermarks }: {
  onMerge: () => void;
  onSplit: () => void;
  onSplitPdf: () => void;
  onOcr: () => void;
  onAddWatermark: () => void;
  onAddPageNumbers: () => void;
  onRemoveWatermarks: () => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="h-10 bg-white border-b border-gray-200 flex items-center px-3 gap-1 flex-shrink-0 overflow-x-auto max-md:px-1">
      <button onClick={onMerge} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 rounded-md hover:bg-gray-100 transition-colors">
        Merge PDFs
      </button>
      <button onClick={onSplitPdf} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 rounded-md hover:bg-gray-100 transition-colors">
        Split PDF
      </button>
      <button onClick={onOcr} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 rounded-md hover:bg-gray-100 transition-colors">
        OCR
      </button>
      <button onClick={onRemoveWatermarks} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 rounded-md hover:bg-gray-100 transition-colors">
        Remove likely watermarks
      </button>

      <div className="relative" ref={moreRef}>
        <button
          onClick={() => setShowMore(!showMore)}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 rounded-md hover:bg-gray-100 transition-colors"
        >
          More tools
        </button>
        {showMore && (
          <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50 fade-in">
            <button onClick={() => { onAddWatermark(); setShowMore(false); }} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
              Add watermark
            </button>
            <button onClick={() => { onAddPageNumbers(); setShowMore(false); }} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
              Add page numbers
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// OCR Panel
function OcrPanel({ currentPage, ocrRunning, ocrProgress, ocrResult, existingOcrText, onRun, onUpdateText, onClose }: {
  currentPage: number;
  ocrRunning: boolean;
  ocrProgress: number;
  ocrResult: string;
  existingOcrText: string;
  onRun: () => void;
  onUpdateText: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(existingOcrText || ocrResult);

  useEffect(() => {
    if (ocrResult) setText(ocrResult);
  }, [ocrResult]);

  useEffect(() => {
    setText(existingOcrText || ocrResult);
  }, [existingOcrText, ocrResult, currentPage]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">OCR Text Recognition</h2>
            <p className="text-sm text-gray-500">Recognize text on page {currentPage} using OCR</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {ocrRunning ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-gray-600">Recognizing text...</p>
              <div className="mt-3 w-48 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${ocrProgress * 100}%` }} />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg mb-4">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  OCR recognizes text from scanned pages. The result may not be perfectly accurate — review and correct the text below before exporting. The original page image is preserved.
                </p>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500 resize-none font-mono"
                placeholder="Click 'Recognize text' to start OCR..."
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-between p-5 border-t border-gray-200">
          <button
            onClick={onRun}
            disabled={ocrRunning}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {ocrRunning ? 'Processing...' : 'Recognize text'}
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { onUpdateText(text); onClose(); }}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save text
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// PDF Canvas — renders pages, text layers, annotations, and editing overlays

import { useRef, useEffect, useState, useCallback, Fragment } from 'react';
import { pdfjsLib } from '@/lib/pdfWorkerSetup';
import { reconstructBackgroundPatches } from '@/lib/pdfRenderer';
import type { DocumentState, TextEdit, ImageItem, Annotation, ToolType, ShapeKind, TextSpan, BoundingBox } from '@/types';

interface PdfCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  documentState: DocumentState;
  zoom: number;
  currentPage: number;
  activeTool: ToolType;
  selectedTextId: string | null;
  selectedImageId: string | null;
  selectedAnnotationId: string | null;
  selectedSignatureId: string | null;
  annotationColor: string;
  annotationWidth: number;
  shapeKind: ShapeKind;
  onPageCountChange: (count: number) => void;
  onSelectText: (id: string | null) => void;
  onSelectImage: (id: string | null) => void;
  onSelectAnnotation: (id: string | null) => void;
  onSelectSignature: (id: string | null) => void;
  onAddText: (page: number, bbox: BoundingBox, originalText?: string, style?: Partial<TextEdit>) => void;
  onAddAnnotation: (ann: Omit<Annotation, 'id'>) => void;
  onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  onUpdateImage: (id: string, updates: Partial<ImageItem>) => void;
  onUpdateText: (id: string, updates: Partial<TextEdit>) => void;
  onUpdateSignature: (id: string, updates: { bbox?: BoundingBox }) => void;
  onDeleteSignature: (id: string) => void;
  onAddImageItem: (page: number, bbox: BoundingBox) => void;
}

interface RenderedPage {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  viewport: pdfjsLib.PageViewport;
  renderScale: number;
  textSpans: TextSpan[];
}

export default function PdfCanvas(props: PdfCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderErrors, setRenderErrors] = useState<string[]>([]);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Drag/draw state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<{ x: number; y: number }[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState<{ type: 'text' | 'image' | 'annotation' | 'signature'; id: string; offsetX: number; offsetY: number; pageNumber: number } | null>(null);
  const [resizeInfo, setResizeInfo] = useState<{ type: 'text' | 'image' | 'signature'; id: string; handle: string; startX: number; startY: number; origBbox: BoundingBox; pageNumber: number } | null>(null);
  const drawingPageRef = useRef<number>(1);

  // Render all pages
  useEffect(() => {
    if (!props.pdfDoc) return;
    const pdfDocLocal = props.pdfDoc;
    const renderTasks = new Set<pdfjsLib.RenderTask>();
    let cancelled = false;

    const render = async () => {
      setRendering(true);
      const results: RenderedPage[] = [];
      const errors: string[] = [];

      // Determine which pages to render (respecting page order and deletions)
      const visiblePages = props.documentState.pageOrder
        .filter((idx) => !props.documentState.deletedPages.includes(idx));

      for (let displayIdx = 0; displayIdx < visiblePages.length; displayIdx++) {
        if (cancelled) return;
        const pageIdx = visiblePages[displayIdx];
        const rotation = props.documentState.pageRotations[pageIdx] || 0;

        try {
          const page = await pdfDocLocal.getPage(pageIdx + 1);
          const renderScale = Math.min(props.zoom * Math.min(window.devicePixelRatio || 1, 1.5), 1.5);
          const viewport = page.getViewport({ scale: renderScale, rotation });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / renderScale * props.zoom}px`;
          canvas.style.height = `${viewport.height / renderScale * props.zoom}px`;

          const removedImageOperations = new Set(props.documentState.annotations
            .filter((annotation) => annotation.kind === 'erase' && annotation.page === pageIdx + 1 && annotation.sourceImageOperatorIndex !== undefined)
            .map((annotation) => annotation.sourceImageOperatorIndex!));
          const renderTask = page.render({
            canvasContext: context,
            viewport,
            canvas,
            ...(removedImageOperations.size ? { operationsFilter: (index: number) => !removedImageOperations.has(index) } : {}),
          });
          renderTasks.add(renderTask);
          try {
            await renderTask.promise;
          } finally {
            renderTasks.delete(renderTask);
          }

          // Get text spans from our pre-extracted data
          const pageData = props.documentState.pages[pageIdx];
          const textSpans = pageData?.textSpans || [];

          results.push({ pageNumber: pageIdx + 1, canvas, viewport, renderScale, textSpans });
        } catch (error) {
          if (!cancelled) {
            const detail = error instanceof Error ? error.message : String(error);
            errors.push(`Page ${pageIdx + 1}: ${detail}`);
          }
        }
      }

      if (!cancelled) {
        setRenderedPages(results);
        setRenderErrors(errors);
        setRendering(false);
      }
    };

    render();

    return () => {
      cancelled = true;
      for (const task of renderTasks) task.cancel();
      renderTasks.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pdfDoc, props.zoom, props.documentState.pages, props.documentState.pageOrder, props.documentState.deletedPages, props.documentState.pageRotations, props.documentState.annotations]);

  // Scroll to current page
  useEffect(() => {
    if (renderedPages.length === 0) return;
    const displayIdx = props.currentPage - 1;
    const pageEl = pageRefs.current.get(displayIdx);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [props.currentPage, renderedPages.length]);

  // Helper: convert mouse coords to page coords (unzoomed)
  const getPageCoords = useCallback((e: React.MouseEvent, pageDiv: HTMLDivElement): { x: number; y: number } => {
    const rect = pageDiv.getBoundingClientRect();
    const x = (e.clientX - rect.left) / props.zoom;
    const y = (e.clientY - rect.top) / props.zoom;
    return { x, y };
  }, [props.zoom]);

  const beginResize = (e: React.MouseEvent, type: 'text' | 'image' | 'signature', id: string, handle: string, bbox: BoundingBox, pageNumber: number) => {
    e.preventDefault();
    e.stopPropagation();
    const pageDiv = (e.currentTarget as HTMLElement).closest('[data-page-idx]') as HTMLDivElement | null;
    if (!pageDiv) return;
    const coords = getPageCoords(e, pageDiv);
    if (type === 'text') props.onSelectText(id);
    else if (type === 'image') props.onSelectImage(id);
    else props.onSelectSignature(id);
    setResizeInfo({ type, id, handle, startX: coords.x, startY: coords.y, origBbox: { ...bbox }, pageNumber });
  };

  // Mouse down on canvas
  const handleMouseDown = useCallback((e: React.MouseEvent, displayIdx: number) => {
    if (e.button !== 0) return;
    const pageDiv = e.currentTarget as HTMLDivElement;
    const coords = getPageCoords(e, pageDiv);

    const pageState = props.documentState.pages[props.documentState.pageOrder[displayIdx]];
    drawingPageRef.current = pageState?.pageNumber ?? displayIdx + 1;

    // Check if clicking on an existing annotation/image/text element first
    const target = e.target as HTMLElement;
    const dataId = target.getAttribute('data-id');
    const dataType = target.getAttribute('data-type');

    if (dataType === 'text' && dataId) {
      props.onSelectText(dataId);
      props.onSelectImage(null);
      props.onSelectAnnotation(null);
      props.onSelectSignature(null);
      if (props.activeTool === 'editText') {
        setEditingTextId(dataId);
      }
      setDragInfo({ type: 'text', id: dataId, offsetX: 0, offsetY: 0, pageNumber: pageState?.pageNumber ?? displayIdx + 1 });
      return;
    }

    if (dataType === 'image' && dataId) {
      props.onSelectImage(dataId);
      props.onSelectText(null);
      props.onSelectAnnotation(null);
      props.onSelectSignature(null);
      setDragInfo({ type: 'image', id: dataId, offsetX: coords.x, offsetY: coords.y, pageNumber: pageState?.pageNumber ?? displayIdx + 1 });
      return;
    }

    if (dataType === 'annotation' && dataId) {
      props.onSelectAnnotation(dataId);
      props.onSelectText(null);
      props.onSelectImage(null);
      props.onSelectSignature(null);
      setDragInfo({ type: 'annotation', id: dataId, offsetX: coords.x, offsetY: coords.y, pageNumber: pageState?.pageNumber ?? displayIdx + 1 });
      return;
    }

    // Handle tool actions
    const pageNumber = pageState?.pageNumber ?? displayIdx + 1;

    if (props.activeTool === 'select') {
      props.onSelectText(null);
      props.onSelectImage(null);
      props.onSelectAnnotation(null);
      props.onSelectSignature(null);
      setEditingTextId(null);
    } else if (props.activeTool === 'addText') {
      props.onAddText(pageNumber, { x: coords.x - 50, y: coords.y - 10, width: 100, height: 20 });
    } else if (props.activeTool === 'addImage') {
      props.onAddImageItem(pageNumber, { x: coords.x - 50, y: coords.y - 50, width: 100, height: 100 });
    } else if (props.activeTool === 'highlight' || props.activeTool === 'underline' || props.activeTool === 'strikethrough') {
      setIsDrawing(true);
      setDrawStart(coords);
      setDrawCurrent(coords);
    } else if (props.activeTool === 'draw') {
      setIsDrawing(true);
      setFreehandPoints([coords]);
    } else if (props.activeTool === 'shapes' || props.activeTool === 'erase') {
      setIsDrawing(true);
      setDrawStart(coords);
      setDrawCurrent(coords);
    } else if (props.activeTool === 'stickyNote') {
      props.onAddAnnotation({
        page: pageNumber,
        kind: 'stickyNote',
        color: '#fbbf24',
        strokeWidth: 1,
        bbox: { x: coords.x - 60, y: coords.y - 30, width: 120, height: 60 },
        text: 'New note',
        opacity: 0.9,
      });
    } else if (props.activeTool === 'comment') {
      props.onAddAnnotation({
        page: pageNumber,
        kind: 'comment',
        color: props.annotationColor,
        strokeWidth: 1,
        bbox: { x: coords.x - 50, y: coords.y - 10, width: 100, height: 20 },
        text: 'New comment',
        opacity: 1,
      });
    }

    void pageState;
  }, [props, getPageCoords]);

  // Mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing && !freehandPoints.length && !dragInfo && !resizeInfo) return;
    const activePageNumber = resizeInfo?.pageNumber ?? dragInfo?.pageNumber;
    const pageDiv = activePageNumber
      ? [...pageRefs.current.values()].find((element) => Number(element.dataset.pageNumber) === activePageNumber)
      : (e.target as HTMLElement).closest('[data-page-idx]') as HTMLDivElement | null;
    if (!pageDiv) return;
    const coords = getPageCoords(e, pageDiv);

    if (resizeInfo) {
      const dx = coords.x - resizeInfo.startX;
      const dy = coords.y - resizeInfo.startY;
      const west = resizeInfo.handle.includes('w');
      const north = resizeInfo.handle.includes('n');
      const next = { ...resizeInfo.origBbox };
      if (west) { next.x += dx; next.width -= dx; } else next.width += dx;
      if (north) { next.y += dy; next.height -= dy; } else next.height += dy;
      if (next.width >= 12 && next.height >= 12) {
        const updates = { bbox: next };
        if (resizeInfo.type === 'text') props.onUpdateText(resizeInfo.id, updates);
        else if (resizeInfo.type === 'image') props.onUpdateImage(resizeInfo.id, updates);
        else props.onUpdateSignature(resizeInfo.id, updates);
      }
      return;
    }

    if (isDrawing && props.activeTool === 'draw') {
      setFreehandPoints(prev => [...prev, coords]);
    } else if (isDrawing && drawStart) {
      setDrawCurrent(coords);
    }

    if (dragInfo) {
      if (dragInfo.type === 'image') {
        const img = props.documentState.images.find(i => i.id === dragInfo.id);
        if (img) {
          const newX = coords.x - dragInfo.offsetX;
          const newY = coords.y - dragInfo.offsetY;
          props.onUpdateImage(dragInfo.id, {
            bbox: { ...img.bbox, x: newX, y: newY },
          });
        }
      } else if (dragInfo.type === 'text') {
        const edit = props.documentState.textEdits.find(t => t.id === dragInfo.id);
        if (edit) {
          props.onUpdateText(dragInfo.id, { bbox: { ...edit.bbox, x: coords.x - dragInfo.offsetX, y: coords.y - dragInfo.offsetY } });
        }
      } else if (dragInfo.type === 'annotation') {
        const ann = props.documentState.annotations.find(a => a.id === dragInfo.id);
        if (ann) {
          const dx = coords.x - dragInfo.offsetX;
          const dy = coords.y - dragInfo.offsetY;
          props.onUpdateAnnotation(dragInfo.id, {
            bbox: { ...ann.bbox, x: ann.bbox.x + dx, y: ann.bbox.y + dy },
          });
          setDragInfo({ ...dragInfo, offsetX: coords.x, offsetY: coords.y });
        }
      } else if (dragInfo.type === 'signature') {
        const signature = props.documentState.signatures.find((item) => item.id === dragInfo.id);
        if (signature) props.onUpdateSignature(signature.id, { bbox: { ...signature.bbox, x: coords.x - dragInfo.offsetX, y: coords.y - dragInfo.offsetY } });
      }
    }
  }, [isDrawing, freehandPoints.length, dragInfo, resizeInfo, drawStart, props, getPageCoords]);

  // Mouse up — finalize drawing
  const handleMouseUp = useCallback(() => {
    if (isDrawing && drawStart && drawCurrent) {
      const pageNumber = drawingPageRef.current;
      const bbox: BoundingBox = {
        x: Math.min(drawStart.x, drawCurrent.x),
        y: Math.min(drawStart.y, drawCurrent.y),
        width: Math.abs(drawCurrent.x - drawStart.x),
        height: Math.abs(drawCurrent.y - drawStart.y),
      };

      if (bbox.width > 5 && bbox.height > 5) {
        if (props.activeTool === 'highlight') {
          props.onAddAnnotation({
            page: pageNumber,
            kind: 'highlight',
            color: props.annotationColor,
            strokeWidth: 1,
            bbox,
            opacity: 0.5,
          });
        } else if (props.activeTool === 'underline') {
          props.onAddAnnotation({
            page: pageNumber,
            kind: 'underline',
            color: props.annotationColor,
            strokeWidth: 2,
            bbox,
            opacity: 1,
          });
        } else if (props.activeTool === 'strikethrough') {
          props.onAddAnnotation({
            page: pageNumber,
            kind: 'strikethrough',
            color: props.annotationColor,
            strokeWidth: 2,
            bbox,
            opacity: 1,
          });
        } else if (props.activeTool === 'shapes') {
          props.onAddAnnotation({
            page: pageNumber,
            kind: 'shape',
            color: props.annotationColor,
            strokeWidth: props.annotationWidth,
            bbox,
            shapeKind: props.shapeKind,
            opacity: 1,
            points: [drawStart, drawCurrent],
          });
        } else if (props.activeTool === 'erase') {
          const originalIndex = pageNumber - 1;
          const rendered = renderedPages.find((p) => p.pageNumber === pageNumber);
          let color = '#ffffff';
          let backgroundDataUrl: string | undefined;
          if (rendered) {
            const sx = rendered.canvas.width / (props.documentState.pages[originalIndex]?.width || rendered.canvas.width);
            const sy = rendered.canvas.height / (props.documentState.pages[originalIndex]?.height || rendered.canvas.height);
            const rasterBbox = {
              x: bbox.x * sx,
              y: bbox.y * sy,
              width: bbox.width * sx,
              height: bbox.height * sy,
            };
            const patch = reconstructBackgroundPatches(rendered.canvas, rasterBbox, [rasterBbox])[0];
            backgroundDataUrl = patch?.dataUrl;

            const context = rendered.canvas.getContext('2d', { willReadFrequently: true });
            if (context) {
              const samples = [
                [bbox.x - 2, bbox.y - 2],
                [bbox.x + bbox.width + 2, bbox.y - 2],
                [bbox.x - 2, bbox.y + bbox.height + 2],
                [bbox.x + bbox.width + 2, bbox.y + bbox.height + 2],
              ]
                .map(([x, y]) => context.getImageData(Math.max(0, Math.min(rendered.canvas.width - 1, Math.round(x * sx))), Math.max(0, Math.min(rendered.canvas.height - 1, Math.round(y * sy))), 1, 1).data);
              const rgb = [0, 1, 2].map((i) => [...samples.map((sample) => sample[i])].sort((a, b) => a - b)[2]);
              color = `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
            }
          }
          props.onAddAnnotation({ page: pageNumber, kind: 'erase', color, strokeWidth: 1, bbox, backgroundDataUrl, opacity: 1 });
        }
      }
    }

    if (isDrawing && freehandPoints.length > 2 && props.activeTool === 'draw') {
      const pageNumber = props.currentPage;
      const xs = freehandPoints.map(p => p.x);
      const ys = freehandPoints.map(p => p.y);
      const bbox: BoundingBox = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
      props.onAddAnnotation({
        page: pageNumber,
        kind: 'draw',
        color: props.annotationColor,
        strokeWidth: props.annotationWidth,
        bbox,
        points: freehandPoints,
        opacity: 1,
      });
    }

    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
    setFreehandPoints([]);
    setDragInfo(null);
    setResizeInfo(null);
  }, [isDrawing, drawStart, drawCurrent, freehandPoints, props]);

  const cursor = () => {
    switch (props.activeTool) {
      case 'select': return 'default';
      case 'addText': return 'text';
      case 'addImage': return 'copy';
      case 'highlight':
      case 'underline':
      case 'strikethrough':
      case 'erase':
      case 'draw':
      case 'shapes': return 'crosshair';
      case 'stickyNote':
      case 'comment': return 'pointer';
      default: return 'default';
    }
  };

  // Get text edits and annotations for a specific page
  const getTextEditsForPage = (pageNumber: number) =>
    props.documentState.textEdits.filter(t => t.page === pageNumber);

  const getImagesForPage = (pageNumber: number) =>
    props.documentState.images.filter(i => i.page === pageNumber);

  const getAnnotationsForPage = (pageNumber: number) =>
    props.documentState.annotations.filter(a => a.page === pageNumber);

  const getSignaturesForPage = (pageNumber: number) =>
    props.documentState.signatures.filter(s => s.page === pageNumber);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-gray-100 flex flex-col items-center py-6 px-4 gap-6"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {rendering && (
        <div className="fixed inset-0 bg-white/50 flex items-center justify-center z-40 pointer-events-none">
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-white px-4 py-2 rounded-lg shadow-md">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Rendering pages...
          </div>
        </div>
      )}

      {renderErrors.length > 0 && (
        <div role="alert" className="w-full max-w-3xl p-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
          Some pages could not be rendered: {renderErrors.join('; ')}
        </div>
      )}

      {renderedPages.map((page, displayIdx) => {
        const pageState = props.documentState.pages[page.pageNumber - 1];
        const pageWidth = (page.viewport.width / page.renderScale * props.zoom);
        const pageHeight = (page.viewport.height / page.renderScale * props.zoom);

        return (
          <div
            key={`${page.pageNumber}-${displayIdx}`}
            data-page-idx={displayIdx}
            ref={(el) => { if (el) pageRefs.current.set(displayIdx, el); }}
            data-page-number={page.pageNumber}
            className="relative bg-white shadow-lg flex-shrink-0"
            style={{
              width: pageWidth,
              height: pageHeight,
              cursor: cursor(),
            }}
            onMouseDown={(e) => handleMouseDown(e, displayIdx)}
          >
            {/* PDF canvas */}
            <div
              ref={(el) => {
                if (el && el.firstChild !== page.canvas) {
                  el.innerHTML = '';
                  el.appendChild(page.canvas);
                }
              }}
              className="absolute inset-0"
            />

            {getAnnotationsForPage(page.pageNumber).filter((ann) => ann.kind === 'erase').map((ann) => (
              <div
                key={ann.id}
                className="absolute pointer-events-none"
                style={{
                  left: ann.bbox.x * props.zoom,
                  top: ann.bbox.y * props.zoom,
                  width: ann.bbox.width * props.zoom,
                  height: ann.bbox.height * props.zoom,
                  backgroundColor: ann.color,
                  opacity: ann.opacity,
                }}
              >
                {ann.backgroundDataUrl && (
                  <img
                    src={ann.backgroundDataUrl}
                    alt=""
                    className="block w-full h-full"
                    draggable={false}
                  />
                )}
              </div>
            ))}

            {/* Text layer overlay for original text */}
            {pageState && props.activeTool === 'editText' && (
              <div
                className="pdf-text-layer"
                style={{ width: pageWidth, height: pageHeight }}
              >
                {page.textSpans.map((span) => {
                  const edit = getTextEditsForPage(page.pageNumber).find(
                    t => t.originalText === span.text &&
                    Math.abs(t.bbox.x - span.bbox.x) < 5 &&
                    Math.abs(t.bbox.y - span.bbox.y) < 5
                  );

                  // Skip spans that have been edited (show the edit overlay instead)
                  if (edit) return null;

                  const left = span.bbox.x * props.zoom;
                  const top = span.bbox.y * props.zoom;
                  const width = span.bbox.width * props.zoom;
                  const height = span.bbox.height * props.zoom;
                  const fontSize = span.fontSize * props.zoom;

                  return (
                    <span
                      key={span.id}
                      className="editable"
                      style={{
                        left,
                        top,
                        fontSize,
                        transform: 'scaleX(1)',
                      }}
                      data-type="text"
                      data-id={`span-${page.pageNumber}-${span.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Create a text edit from this span
                        props.onAddText(page.pageNumber, { ...span.bbox }, span.text, {
                          fontSize: span.fontSize,
                          fontFamily: span.fontFamily,
                          fontName: span.fontName,
                          color: span.color,
                          backgroundColor: span.backgroundColor,
                          backgroundDataUrl: span.backgroundDataUrl,
                          bold: span.bold,
                          italic: span.italic,
                        });
                        // Mark original text for this span
                      }}
                    >
                      {span.text}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Text edits overlay */}
            {getTextEditsForPage(page.pageNumber).map((edit) => (
              <div
                key={edit.id}
                data-type="text"
                data-id={edit.id}
                className={`absolute border-2 rounded-sm transition-colors ${
                  props.selectedTextId === edit.id ? 'border-blue-500 bg-blue-50/20' : 'border-transparent hover:border-blue-300'
                }`}
                style={{
                  left: edit.bbox.x * props.zoom,
                  top: edit.bbox.y * props.zoom,
                  width: edit.bbox.width * props.zoom,
                  height: edit.bbox.height * props.zoom,
                  cursor: 'move',
                  backgroundColor: edit.originalText ? (edit.backgroundDataUrl ? 'transparent' : (edit.backgroundColor || '#fff')) : 'transparent',
                  backgroundImage: edit.originalText && edit.backgroundDataUrl ? `url(${edit.backgroundDataUrl})` : undefined,
                  backgroundSize: '100% 100%',
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  props.onSelectText(edit.id);
                  props.onSelectImage(null);
                  props.onSelectAnnotation(null);
                  props.onSelectSignature(null);
                  const pageDiv = e.currentTarget.closest('[data-page-idx]') as HTMLDivElement;
                  const coords = getPageCoords(e, pageDiv);
                  setDragInfo({ type: 'text', id: edit.id, offsetX: coords.x - edit.bbox.x, offsetY: coords.y - edit.bbox.y, pageNumber: page.pageNumber });
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingTextId(edit.id);
                }}
              >
                <div
                  style={{
                    fontSize: edit.fontSize * props.zoom,
                    fontFamily: edit.fontFamily,
                    color: edit.color,
                    fontWeight: edit.bold ? 'bold' : 'normal',
                    fontStyle: edit.italic ? 'italic' : 'normal',
                    textDecoration: edit.underline ? 'underline' : 'none',
                    textAlign: edit.alignment,
                    lineHeight: 1.2,
                    padding: '0 2px',
                    overflow: 'hidden',
                  }}
                >
                  {edit.newText}
                </div>
                {props.selectedTextId === edit.id && (
                  <>
                    <div className="resize-handle" style={{ top: -5, left: -5, cursor: 'nwse-resize' }} onMouseDown={(e) => beginResize(e, 'text', edit.id, 'nw', edit.bbox, page.pageNumber)} />
                    <div className="resize-handle" style={{ top: -5, right: -5, cursor: 'nesw-resize' }} onMouseDown={(e) => beginResize(e, 'text', edit.id, 'ne', edit.bbox, page.pageNumber)} />
                    <div className="resize-handle" style={{ bottom: -5, left: -5, cursor: 'nesw-resize' }} onMouseDown={(e) => beginResize(e, 'text', edit.id, 'sw', edit.bbox, page.pageNumber)} />
                    <div className="resize-handle" style={{ bottom: -5, right: -5, cursor: 'nwse-resize' }} onMouseDown={(e) => beginResize(e, 'text', edit.id, 'se', edit.bbox, page.pageNumber)} />
                  </>
                )}
              </div>
            ))}

            {/* Images overlay */}
            {getImagesForPage(page.pageNumber).map((img) => (
              <Fragment key={img.id}>
              <div
                data-type="image"
                data-id={img.id}
                className={`absolute border-2 transition-colors ${
                  props.selectedImageId === img.id ? 'border-blue-500' : 'border-transparent hover:border-blue-300'
                }`}
                style={{
                  left: img.bbox.x * props.zoom,
                  top: img.bbox.y * props.zoom,
                  width: img.bbox.width * props.zoom,
                  height: img.bbox.height * props.zoom,
                  cursor: 'move',
                  pointerEvents: img.isOriginal && props.activeTool !== 'select' ? 'none' : 'auto',
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  props.onSelectImage(img.id);
                  props.onSelectText(null);
                  props.onSelectAnnotation(null);
                  props.onSelectSignature(null);
                  const pageDiv = e.currentTarget.closest('[data-page-idx]') as HTMLDivElement;
                  const coords = getPageCoords(e, pageDiv);
                  const px = coords.x - img.bbox.x;
                  const py = coords.y - img.bbox.y;
                  setDragInfo({ type: 'image', id: img.id, offsetX: px, offsetY: py, pageNumber: page.pageNumber });
                }}
              >
                {img.dataUrl ? (
                  <img
                    src={img.dataUrl}
                    alt=""
                    className="w-full h-full object-fill pointer-events-none"
                    style={{ transform: `rotate(${img.rotation}deg)`, opacity: img.opacity }}
                    draggable={false}
                  />
                ) : !img.isOriginal ? (
                  <div className="w-full h-full bg-blue-100/40 flex items-start justify-end pointer-events-none">
                    <span className="m-1 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px]">PDF image</span>
                  </div>
                ) : null}
                {props.selectedImageId === img.id && (
                  <>
                    <div className="resize-handle" style={{ top: -5, left: -5, cursor: 'nwse-resize' }} onMouseDown={(e) => beginResize(e, 'image', img.id, 'nw', img.bbox, page.pageNumber)} />
                    <div className="resize-handle" style={{ top: -5, right: -5, cursor: 'nesw-resize' }} onMouseDown={(e) => beginResize(e, 'image', img.id, 'ne', img.bbox, page.pageNumber)} />
                    <div className="resize-handle" style={{ bottom: -5, left: -5, cursor: 'nesw-resize' }} onMouseDown={(e) => beginResize(e, 'image', img.id, 'sw', img.bbox, page.pageNumber)} />
                    <div className="resize-handle" style={{ bottom: -5, right: -5, cursor: 'nwse-resize' }} onMouseDown={(e) => beginResize(e, 'image', img.id, 'se', img.bbox, page.pageNumber)} />
                  </>
                )}
              </div>
              </Fragment>
            ))}

            {/* Annotations overlay */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={pageWidth}
              height={pageHeight}
              style={{ overflow: 'visible' }}
            >
              {getAnnotationsForPage(page.pageNumber).map((ann) => {
                if (ann.kind === 'erase') return null;
                const x = ann.bbox.x * props.zoom;
                const y = ann.bbox.y * props.zoom;
                const w = ann.bbox.width * props.zoom;
                const h = ann.bbox.height * props.zoom;
                const isSelected = props.selectedAnnotationId === ann.id;

                if (ann.kind === 'highlight') {
                  return (
                    <g key={ann.id} className="pointer-events-auto" style={{ cursor: 'move' }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        props.onSelectAnnotation(ann.id);
                        props.onSelectText(null);
                        props.onSelectImage(null);
                      }}
                    >
                      <rect x={x} y={y} width={w} height={h} fill={ann.color} opacity={ann.opacity * 0.4} />
                      {isSelected && <rect x={x} y={y} width={w} height={h} fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 2" />}
                    </g>
                  );
                }
                if (ann.kind === 'underline') {
                  return (
                    <g key={ann.id} className="pointer-events-auto" style={{ cursor: 'move' }}
                      onMouseDown={(e) => { e.stopPropagation(); props.onSelectAnnotation(ann.id); }}
                    >
                      <line x1={x} y1={y + h} x2={x + w} y2={y + h} stroke={ann.color} strokeWidth={ann.strokeWidth} opacity={ann.opacity} />
                      {isSelected && <rect x={x} y={y} width={w} height={h} fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 2" />}
                    </g>
                  );
                }
                if (ann.kind === 'strikethrough') {
                  return (
                    <g key={ann.id} className="pointer-events-auto" style={{ cursor: 'move' }}
                      onMouseDown={(e) => { e.stopPropagation(); props.onSelectAnnotation(ann.id); }}
                    >
                      <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={ann.color} strokeWidth={ann.strokeWidth} opacity={ann.opacity} />
                      {isSelected && <rect x={x} y={y} width={w} height={h} fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 2" />}
                    </g>
                  );
                }
                if (ann.kind === 'draw' && ann.points) {
                  const pts = ann.points.map(p => `${p.x * props.zoom},${p.y * props.zoom}`).join(' ');
                  return (
                    <g key={ann.id} className="pointer-events-auto" style={{ cursor: 'move' }}
                      onMouseDown={(e) => { e.stopPropagation(); props.onSelectAnnotation(ann.id); }}
                    >
                      <polyline points={pts} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth} opacity={ann.opacity} strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  );
                }
                if (ann.kind === 'shape' && ann.shapeKind) {
                  return (
                    <g key={ann.id} className="pointer-events-auto" style={{ cursor: 'move' }}
                      onMouseDown={(e) => { e.stopPropagation(); props.onSelectAnnotation(ann.id); }}
                    >
                      {ann.shapeKind === 'rectangle' && <rect x={x} y={y} width={w} height={h} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth} opacity={ann.opacity} />}
                      {ann.shapeKind === 'circle' && <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth} opacity={ann.opacity} />}
                      {ann.shapeKind === 'line' && <line x1={x} y1={y + h} x2={x + w} y2={y} stroke={ann.color} strokeWidth={ann.strokeWidth} opacity={ann.opacity} />}
                      {ann.shapeKind === 'arrow' && (
                        <>
                          <line x1={x} y1={y + h} x2={x + w} y2={y} stroke={ann.color} strokeWidth={ann.strokeWidth} opacity={ann.opacity} />
                          <polygon points={`${x + w},${y} ${x + w - 10},${y + 5} ${x + w - 10},${y - 5}`} fill={ann.color} opacity={ann.opacity} />
                        </>
                      )}
                      {isSelected && <rect x={x} y={y} width={w} height={h} fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 2" />}
                    </g>
                  );
                }
                return null;
              })}
            </svg>

            {/* Sticky notes and comments (HTML overlay for text editing) */}
            {getAnnotationsForPage(page.pageNumber).filter(a => a.kind === 'stickyNote' || a.kind === 'comment').map((ann) => (
              <div
                key={ann.id}
                data-type="annotation"
                data-id={ann.id}
                className={`absolute rounded-lg p-2 text-xs cursor-move transition-colors ${
                  props.selectedAnnotationId === ann.id ? 'ring-2 ring-blue-400' : ''
                } ${
                  ann.kind === 'stickyNote' ? 'bg-amber-100 border border-amber-300' : 'bg-blue-50 border border-blue-200'
                }`}
                style={{
                  left: ann.bbox.x * props.zoom,
                  top: ann.bbox.y * props.zoom,
                  width: Math.max(ann.bbox.width * props.zoom, 80),
                  minHeight: Math.max(ann.bbox.height * props.zoom, 30),
                  opacity: ann.opacity,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  props.onSelectAnnotation(ann.id);
                  props.onSelectText(null);
                  props.onSelectImage(null);
                  props.onSelectSignature(null);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const px = (e.clientX - rect.left) / props.zoom;
                  const py = (e.clientY - rect.top) / props.zoom;
                  setDragInfo({ type: 'annotation', id: ann.id, offsetX: px, offsetY: py, pageNumber: page.pageNumber });
                }}
              >
                {ann.text || 'Click to edit'}
              </div>
            ))}

            {/* Signatures overlay */}
            {getSignaturesForPage(page.pageNumber).map((sig) => (
              <div
                key={sig.id}
                data-type="signature"
                data-id={sig.id}
                className={`absolute border-2 ${props.selectedSignatureId === sig.id ? 'border-blue-500' : 'border-transparent hover:border-blue-300'}`}
                style={{
                  left: sig.bbox.x * props.zoom,
                  top: sig.bbox.y * props.zoom,
                  width: sig.bbox.width * props.zoom,
                  height: sig.bbox.height * props.zoom,
                  cursor: 'move',
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  props.onSelectSignature(sig.id);
                  props.onSelectText(null); props.onSelectImage(null); props.onSelectAnnotation(null);
                  const coords = getPageCoords(e, e.currentTarget.closest('[data-page-idx]') as HTMLDivElement);
                  setDragInfo({ type: 'signature', id: sig.id, offsetX: coords.x - sig.bbox.x, offsetY: coords.y - sig.bbox.y, pageNumber: page.pageNumber });
                }}
              >
                <img src={sig.dataUrl} alt="signature" className="w-full h-full object-contain pointer-events-none" draggable={false} />
                {props.selectedSignatureId === sig.id && (
                  <>
                    {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                      <div key={handle} className="resize-handle" style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, background: 'white', border: '2px solid #2563eb', ...(handle.includes('n') ? { top: -6 } : { bottom: -6 }), ...(handle.includes('w') ? { left: -6 } : { right: -6 }), cursor: handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize' }} onMouseDown={(e) => beginResize(e, 'signature', sig.id, handle, sig.bbox, page.pageNumber)} />
                    ))}
                    <button type="button" title="Delete signature" className="absolute -right-3 -top-3 z-10 rounded-full bg-red-600 px-1.5 text-white shadow" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); props.onDeleteSignature(sig.id); props.onSelectSignature(null); }}>×</button>
                  </>
                )}
              </div>
            ))}

            {/* Live drawing preview */}
            {isDrawing && drawStart && drawCurrent && displayIdx === props.currentPage - 1 && (
              <svg className="absolute inset-0 pointer-events-none" width={pageWidth} height={pageHeight}>
                {props.activeTool === 'highlight' && (
                  <rect
                    x={Math.min(drawStart.x, drawCurrent.x) * props.zoom}
                    y={Math.min(drawStart.y, drawCurrent.y) * props.zoom}
                    width={Math.abs(drawCurrent.x - drawStart.x) * props.zoom}
                    height={Math.abs(drawCurrent.y - drawStart.y) * props.zoom}
                    fill={props.annotationColor}
                    opacity={0.3}
                  />
                )}
                {props.activeTool === 'shapes' && props.shapeKind === 'rectangle' && (
                  <rect
                    x={Math.min(drawStart.x, drawCurrent.x) * props.zoom}
                    y={Math.min(drawStart.y, drawCurrent.y) * props.zoom}
                    width={Math.abs(drawCurrent.x - drawStart.x) * props.zoom}
                    height={Math.abs(drawCurrent.y - drawStart.y) * props.zoom}
                    fill="none"
                    stroke={props.annotationColor}
                    strokeWidth={props.annotationWidth}
                  />
                )}
                {props.activeTool === 'shapes' && props.shapeKind === 'circle' && (
                  <ellipse
                    cx={(drawStart.x + drawCurrent.x) / 2 * props.zoom}
                    cy={(drawStart.y + drawCurrent.y) / 2 * props.zoom}
                    rx={Math.abs(drawCurrent.x - drawStart.x) / 2 * props.zoom}
                    ry={Math.abs(drawCurrent.y - drawStart.y) / 2 * props.zoom}
                    fill="none"
                    stroke={props.annotationColor}
                    strokeWidth={props.annotationWidth}
                  />
                )}
                {props.activeTool === 'shapes' && (props.shapeKind === 'line' || props.shapeKind === 'arrow') && (
                  <line
                    x1={drawStart.x * props.zoom}
                    y1={drawStart.y * props.zoom}
                    x2={drawCurrent.x * props.zoom}
                    y2={drawCurrent.y * props.zoom}
                    stroke={props.annotationColor}
                    strokeWidth={props.annotationWidth}
                  />
                )}
              </svg>
            )}

            {isDrawing && freehandPoints.length > 1 && displayIdx === props.currentPage - 1 && (
              <svg className="absolute inset-0 pointer-events-none" width={pageWidth} height={pageHeight}>
                <polyline
                  points={freehandPoints.map(p => `${p.x * props.zoom},${p.y * props.zoom}`).join(' ')}
                  fill="none"
                  stroke={props.annotationColor}
                  strokeWidth={props.annotationWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}

            {/* Page number label */}
            <div className="absolute -top-7 left-0 text-xs font-medium text-gray-400">
              Page {page.pageNumber}
            </div>
          </div>
        );
      })}

      {renderedPages.length === 0 && !rendering && (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <p className="text-sm">No pages to display</p>
        </div>
      )}
    </div>
  );
}

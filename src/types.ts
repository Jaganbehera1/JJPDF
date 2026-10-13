// Core type definitions for PDF Studio Pro

export type ToolType =
  | 'select'
  | 'editText'
  | 'addText'
  | 'addImage'
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'erase'
  | 'comment'
  | 'stickyNote'
  | 'draw'
  | 'shapes'
  | 'fillSign'
  | 'organize';

export type ShapeKind = 'rectangle' | 'circle' | 'line' | 'arrow';

export type AnnotationKind =
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'draw'
  | 'shape'
  | 'stickyNote'
  | 'comment'
  | 'erase';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSpan {
  id: string;
  page: number;
  text: string;
  bbox: BoundingBox;
  fontSize: number;
  rotation: number;
  fontName: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  color: string;
  backgroundColor: string;
  backgroundDataUrl?: string;
  isEditable: boolean;
}

export interface TextEdit {
  id: string;
  page: number;
  originalText: string;
  newText: string;
  bbox: BoundingBox;
  fontSize: number;
  fontFamily: string;
  fontName?: string;
  color: string;
  backgroundColor?: string;
  backgroundDataUrl?: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: 'left' | 'center' | 'right';
}

export interface ImageItem {
  id: string;
  page: number;
  dataUrl: string;
  bbox: BoundingBox;
  originalBbox?: BoundingBox;
  originalOpIndex?: number;
  originalBackgroundColor?: string;
  rotation: number;
  opacity: number;
  isOriginal: boolean;
}

export interface Annotation {
  id: string;
  page: number;
  kind: AnnotationKind;
  color: string;
  strokeWidth: number;
  bbox: BoundingBox;
  points?: { x: number; y: number }[];
  backgroundDataUrl?: string;
  sourceImageOperatorIndex?: number;
  text?: string;
  shapeKind?: ShapeKind;
  opacity: number;
}

export interface PageData {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  analysisError?: string;
  canvasDataUrl?: string;
  textSpans: TextSpan[];
  imageBoxes?: { bbox: BoundingBox; dataUrl: string; backgroundColor: string; operatorIndex: number }[];
}

export interface DocumentState {
  fileName: string;
  file: File | null;
  pageCount: number;
  pages: PageData[];
  textEdits: TextEdit[];
  images: ImageItem[];
  annotations: Annotation[];
  pageOrder: number[];
  pageRotations: Record<number, number>;
  deletedPages: number[];
  watermarks: { text: string; opacity: number; fontSize: number }[];
  pageNumbers: { position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'; fontSize: number; startAt: number } | null;
  signatures: { id: string; page: number; dataUrl: string; bbox: BoundingBox }[];
  ocrText: Record<number, string>;
}

export interface UndoAction {
  type: string;
  data: unknown;
  timestamp: number;
}

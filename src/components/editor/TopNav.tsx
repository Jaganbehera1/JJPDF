// Top navigation bar for the PDF editor

import { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  ZoomOut,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  Download,
  MoreHorizontal,
  Check,
  Pencil,
  RotateCw,
  Plus,
  Minus,
} from 'lucide-react';

interface TopNavProps {
  fileName: string;
  onRename: (name: string) => void;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  currentPage: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPageChange: (page: number) => void;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  onDownload: () => void;
  onRotatePage: () => void;
  onAddPage: () => void;
  onDeletePage: () => void;
  isDownloading: boolean;
}

export default function TopNav(props: TopNavProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(props.fileName);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(props.fileName);
  }, [props.fileName]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleRename = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== props.fileName) {
      props.onRename(trimmed.endsWith('.pdf') ? trimmed : trimmed + '.pdf');
    } else {
      setName(props.fileName);
    }
    setEditing(false);
  };

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-3 flex-shrink-0 gap-2">
      {/* Left section */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={props.onBack}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          title="Back to home"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="w-px h-6 bg-gray-200" />

        {editing ? (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') { setName(props.fileName); setEditing(false); }
            }}
            className="px-2 py-1 text-sm font-medium border border-blue-500 rounded-md outline-none w-48"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="group flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors max-w-[200px]"
          >
            <span className="text-sm font-medium text-gray-800 truncate">{props.fileName}</span>
            <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>
        )}
      </div>

      {/* Center section */}
      <div className="flex items-center gap-1">
        <button
          onClick={props.onUndo}
          disabled={!props.canUndo}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Undo"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={props.onRedo}
          disabled={!props.canRedo}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Redo"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <button
          onClick={props.onZoomOut}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={props.onZoomReset}
          className="px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md min-w-[50px] transition-colors"
          title="Reset zoom"
        >
          {Math.round(props.zoom * 100)}%
        </button>
        <button
          onClick={props.onZoomIn}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <button
          onClick={props.onPrevPage}
          disabled={props.currentPage <= 1}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30 transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <input
            type="number"
            value={props.currentPage}
            min={1}
            max={props.totalPages}
            onChange={(e) => {
              const p = parseInt(e.target.value);
              if (p >= 1 && p <= props.totalPages) props.onPageChange(p);
            }}
            className="w-10 text-center px-1 py-0.5 border border-gray-200 rounded outline-none focus:border-blue-500"
          />
          <span className="text-gray-400">/ {props.totalPages}</span>
        </div>
        <button
          onClick={props.onNextPage}
          disabled={props.currentPage >= props.totalPages}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30 transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {props.saveStatus === 'saved' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
          {props.saveStatus === 'saving' && <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
          {props.saveStatus === 'unsaved' && <div className="w-2 h-2 bg-amber-400 rounded-full" />}
          <span className="hidden sm:inline">
            {props.saveStatus === 'saved' ? 'All changes saved' : props.saveStatus === 'saving' ? 'Saving...' : 'Unsaved changes'}
          </span>
        </div>

        <button
          onClick={props.onDownload}
          disabled={props.isDownloading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          title="Download PDF"
        >
          {props.isDownloading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Download</span>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            title="More actions"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50 fade-in">
              <button
                onClick={() => { props.onRotatePage(); setMenuOpen(false); }}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <RotateCw className="w-4 h-4" /> Rotate current page
              </button>
              <button
                onClick={() => { props.onAddPage(); setMenuOpen(false); }}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add blank page
              </button>
              <button
                onClick={() => { props.onDeletePage(); setMenuOpen(false); }}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Minus className="w-4 h-4" /> Delete current page
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

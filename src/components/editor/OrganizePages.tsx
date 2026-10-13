// Organize Pages modal — reorder, rotate, delete, duplicate pages

import { useState, useEffect, useRef } from 'react';
import { RotateCw, Trash2, Copy, X, GripVertical, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import type { DocumentState } from '@/types';

interface OrganizePagesProps {
  documentState: DocumentState;
  onClose: () => void;
  onReorder: (newOrder: number[]) => void;
  onRotate: (pageIdx: number) => void;
  onDelete: (pageIdx: number) => void;
  onDuplicate: (pageIdx: number) => void;
  onAddBlankPage: () => void;
  onApply: () => void;
}

export default function OrganizePages({
  documentState,
  onClose,
  onReorder,
  onRotate,
  onDelete,
  onDuplicate,
  onAddBlankPage,
  onApply,
}: OrganizePagesProps) {
  const [order, setOrder] = useState<number[]>(documentState.pageOrder);
  const [deleted, setDeleted] = useState<Set<number>>(new Set(documentState.deletedPages));
  const [rotations, setRotations] = useState<Record<number, number>>(documentState.pageRotations);
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const visiblePages = order.filter((idx) => !deleted.has(idx));

  useEffect(() => {
    // Generate thumbnails would require pdfDoc — simplified for now
  }, []);

  const handleDragStart = (position: number) => {
    dragItem.current = position;
  };

  const handleDragEnter = (position: number) => {
    dragOverItem.current = position;
    if (dragItem.current === null || dragItem.current === position) return;
    const newOrder = [...order];
    const draggedItem = newOrder[dragItem.current];
    newOrder.splice(dragItem.current, 1);
    newOrder.splice(position, 0, draggedItem);
    dragItem.current = position;
    setOrder(newOrder);
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const toggleDelete = (idx: number) => {
    const newDeleted = new Set(deleted);
    if (newDeleted.has(idx)) {
      newDeleted.delete(idx);
    } else {
      newDeleted.add(idx);
    }
    setDeleted(newDeleted);
  };

  const rotatePage = (idx: number) => {
    setRotations({
      ...rotations,
      [idx]: ((rotations[idx] || 0) + 90) % 360,
    });
  };

  const duplicatePage = (idx: number) => {
    // Insert a copy right after the current position
    const newIdx = Math.max(...order) + 1;
    const position = order.indexOf(idx);
    const newOrder = [...order];
    newOrder.splice(position + 1, 0, newIdx);
    setOrder(newOrder);
    // Copy rotation
    if (rotations[idx]) {
      setRotations({ ...rotations, [newIdx]: rotations[idx] });
    }
  };

  const movePage = (position: number, direction: 'up' | 'down') => {
    if (direction === 'up' && position > 0) {
      const newOrder = [...order];
      [newOrder[position], newOrder[position - 1]] = [newOrder[position - 1], newOrder[position]];
      setOrder(newOrder);
    } else if (direction === 'down' && position < order.length - 1) {
      const newOrder = [...order];
      [newOrder[position], newOrder[position + 1]] = [newOrder[position + 1], newOrder[position]];
      setOrder(newOrder);
    }
  };

  const handleApply = () => {
    // Apply all changes to parent
    for (let i = 0; i < order.length; i++) {
      const idx = order[i];
      const currentRot = documentState.pageRotations[idx] || 0;
      const newRot = rotations[idx] || 0;
      if (currentRot !== newRot) {
        onRotate(idx);
      }
    }
    for (const idx of deleted) {
      if (!documentState.deletedPages.includes(idx)) {
        onDelete(idx);
      }
    }
    onReorder(order);
    onApply();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Organize Pages</h2>
            <p className="text-sm text-gray-500">Drag to reorder, rotate, delete, or duplicate pages</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {order.map((idx, position) => {
              const isDeleted = deleted.has(idx);
              const rotation = rotations[idx] || 0;
              const pageData = documentState.pages[idx];

              return (
                <div
                  key={`${idx}-${position}`}
                  draggable={!isDeleted}
                  onDragStart={() => handleDragStart(position)}
                  onDragEnter={() => handleDragEnter(position)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className={`relative group bg-white border-2 rounded-xl overflow-hidden transition-all ${
                    isDeleted ? 'border-red-300 opacity-40' : 'border-gray-200 hover:border-blue-400 cursor-grab active:cursor-grabbing'
                  }`}
                >
                  {/* Thumbnail */}
                  <div
                    className="aspect-[3/4] bg-gray-100 flex items-center justify-center relative"
                    style={{ transform: `rotate(${rotation}deg)` }}
                  >
                    {thumbnails.get(idx) ? (
                      <img src={thumbnails.get(idx)} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-gray-300 text-center">
                        <div className="w-12 h-16 bg-white border border-gray-200 rounded mx-auto mb-1" />
                        <span className="text-xs text-gray-400">Page {idx + 1}</span>
                      </div>
                    )}
                  </div>

                  {/* Page number */}
                  <div className="px-2 py-1.5 flex items-center justify-between bg-white border-t border-gray-100">
                    <span className="text-xs font-medium text-gray-600">Page {position + 1}</span>
                    <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                  </div>

                  {/* Actions */}
                  <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); rotatePage(idx); }}
                      className="w-7 h-7 bg-white/90 rounded-md shadow-sm flex items-center justify-center hover:bg-white text-gray-600"
                      title="Rotate"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicatePage(idx); }}
                      className="w-7 h-7 bg-white/90 rounded-md shadow-sm flex items-center justify-center hover:bg-white text-gray-600"
                      title="Duplicate"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleDelete(idx); }}
                      className="w-7 h-7 bg-white/90 rounded-md shadow-sm flex items-center justify-center hover:bg-white text-red-500"
                      title={isDeleted ? "Restore" : "Delete"}
                    >
                      {isDeleted ? <Plus className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Move buttons */}
                  <div className="absolute top-1 left-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); movePage(position, 'up'); }}
                      disabled={position === 0}
                      className="w-7 h-7 bg-white/90 rounded-md shadow-sm flex items-center justify-center hover:bg-white text-gray-600 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); movePage(position, 'down'); }}
                      disabled={position === order.length - 1}
                      className="w-7 h-7 bg-white/90 rounded-md shadow-sm flex items-center justify-center hover:bg-white text-gray-600 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isDeleted && (
                    <div className="absolute inset-0 bg-red-50/50 flex items-center justify-center">
                      <span className="text-xs font-medium text-red-500 bg-white/80 px-2 py-1 rounded">Deleted</span>
                    </div>
                  )}

                  {rotation !== 0 && (
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded">
                      {rotation}°
                    </div>
                  )}

                </div>
              );
            })}

            {/* Add blank page */}
            <button
              onClick={onAddBlankPage}
              className="aspect-[3/4] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              <Plus className="w-8 h-8 mb-1" />
              <span className="text-xs font-medium">Add blank page</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between p-5 border-t border-gray-200">
          <span className="text-sm text-gray-500">
            {visiblePages.length} page{visiblePages.length !== 1 ? 's' : ''} • {deleted.size} deleted
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

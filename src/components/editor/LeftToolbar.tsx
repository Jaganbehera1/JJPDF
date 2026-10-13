// Left editing toolbar for the PDF editor

import {
  MousePointer2,
  Type,
  ImagePlus,
  Highlighter,
  Underline,
  Strikethrough,
  MessageSquare,
  StickyNote,
  Pen,
  Shapes,
  PenTool,
  LayoutGrid,
  Eraser,
} from 'lucide-react';
import type { ToolType } from '@/types';

interface LeftToolbarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

const TOOLS: { id: ToolType; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'editText', icon: Type, label: 'Edit Text & Images' },
  { id: 'addText', icon: Type, label: 'Add Text' },
  { id: 'addImage', icon: ImagePlus, label: 'Add Image' },
  { id: 'highlight', icon: Highlighter, label: 'Highlight' },
  { id: 'underline', icon: Underline, label: 'Underline' },
  { id: 'strikethrough', icon: Strikethrough, label: 'Strikethrough' },
  { id: 'erase', icon: Eraser, label: 'Erase area' },
  { id: 'comment', icon: MessageSquare, label: 'Comment' },
  { id: 'stickyNote', icon: StickyNote, label: 'Sticky Note' },
  { id: 'draw', icon: Pen, label: 'Draw' },
  { id: 'shapes', icon: Shapes, label: 'Shapes' },
  { id: 'fillSign', icon: PenTool, label: 'Fill & Sign' },
  { id: 'organize', icon: LayoutGrid, label: 'Organize Pages' },
];

export default function LeftToolbar({ activeTool, onToolChange }: LeftToolbarProps) {
  return (
    <div className="w-14 bg-white border-r border-gray-200 flex flex-col items-center py-3 gap-1 overflow-y-auto flex-shrink-0 max-md:order-3 max-md:w-full max-md:h-14 max-md:flex-row max-md:justify-start max-md:overflow-x-auto max-md:overflow-y-hidden max-md:border-r-0 max-md:border-t max-md:px-2 max-md:py-1">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          className={`tool-btn relative group w-10 h-10 rounded-lg flex items-center justify-center ${
            activeTool === tool.id ? 'active' : 'text-gray-600'
          }`}
          title={tool.label}
        >
          <tool.icon className="w-5 h-5" />
          <span className="absolute left-12 z-50 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
            {tool.label}
          </span>
        </button>
      ))}
    </div>
  );
}

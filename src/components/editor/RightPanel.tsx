// Right properties panel — shows properties for the selected object/tool

import { useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  RotateCw,
  Upload,
  Square,
  Circle,
  Minus,
  MoveRight,
  Eye,
  Settings,
  Type,
} from 'lucide-react';
import type { ToolType, TextEdit, ImageItem, Annotation, ShapeKind, BoundingBox } from '@/types';

interface RightPanelProps {
  activeTool: ToolType;
  selectedText: TextEdit | null;
  selectedImage: ImageItem | null;
  selectedAnnotation: Annotation | null;
  selectedSignature: { id: string; bbox: BoundingBox } | null;
  onUpdateSignature: (id: string, updates: { bbox?: BoundingBox }) => void;
  onDeleteSignature: (id: string) => void;
  onUpdateText: (id: string, updates: Partial<TextEdit>) => void;
  onUpdateImage: (id: string, updates: Partial<ImageItem>) => void;
  onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  onDeleteText: (id: string) => void;
  onDeleteImage: (id: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onReplaceImage: (id: string) => void;
  onAddImage: (file: File) => void;
  annotationColor: string;
  annotationWidth: number;
  onAnnotationColorChange: (color: string) => void;
  onAnnotationWidthChange: (width: number) => void;
  shapeKind: ShapeKind;
  onShapeKindChange: (kind: ShapeKind) => void;
}

const FONTS = ['Helvetica', 'Times-Roman', 'Courier', 'Noto Sans Oriya'];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const COLORS = ['#000000', '#ffffff', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];

function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <div className="flex items-center gap-2 flex-wrap">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
              value.toLowerCase() === c.toLowerCase() ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border border-gray-200"
        />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

export default function RightPanel(props: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<'properties' | 'settings'>('properties');

  // No selection or select tool
  if (props.activeTool === 'select' && !props.selectedText && !props.selectedImage && !props.selectedAnnotation && !props.selectedSignature) {
    return (
      <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <PanelHeader title="Properties" />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Settings className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">Select an object to see its properties</p>
        </div>
      </div>
    );
  }

  if (props.selectedSignature) {
    const sig = props.selectedSignature;
    return (
      <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <PanelHeader title="Signature" />
        <div className="p-4 space-y-4">
          <Section title="Size">
            <div className="grid grid-cols-2 gap-2">
              <DimensionInput label="Width" value={sig.bbox.width} onChange={(width) => props.onUpdateSignature(sig.id, { bbox: { ...sig.bbox, width } })} />
              <DimensionInput label="Height" value={sig.bbox.height} onChange={(height) => props.onUpdateSignature(sig.id, { bbox: { ...sig.bbox, height } })} />
            </div>
          </Section>
          <button onClick={() => props.onDeleteSignature(sig.id)} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Delete signature</button>
          <p className="text-xs text-gray-500">Drag the signature to move it. Drag a corner handle to resize.</p>
        </div>
      </div>
    );
  }

  // Text properties
  if (props.selectedText) {
    const st = props.selectedText;
    return (
      <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <PanelHeader title="Text Properties" />
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <Section title="Font">
            <textarea
              value={st.newText}
              onChange={(e) => props.onUpdateText(st.id, { newText: e.target.value })}
              rows={3}
              placeholder="Enter replacement text"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500 resize-y"
            />
            {st.originalText && <p className="text-[11px] text-gray-400">Original: {st.originalText}</p>}
            <select
              value={st.fontFamily}
              onChange={(e) => props.onUpdateText(st.id, { fontFamily: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500"
            >
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              {!FONTS.includes(st.fontFamily) && <option value={st.fontFamily}>{st.fontFamily} (detected in document)</option>}
            </select>
            <select
              value={st.fontSize}
              onChange={(e) => props.onUpdateText(st.id, { fontSize: parseInt(e.target.value) })}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500"
            >
              {FONT_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
            </select>
          </Section>

          <Section title="Text box size">
            <div className="grid grid-cols-2 gap-2">
              <DimensionInput label="Width" value={st.bbox.width} onChange={(width) => props.onUpdateText(st.id, { bbox: { ...st.bbox, width } })} />
              <DimensionInput label="Height" value={st.bbox.height} onChange={(height) => props.onUpdateText(st.id, { bbox: { ...st.bbox, height } })} />
            </div>
          </Section>

          <Section title="Style">
            <div className="flex items-center gap-1">
              <ToggleButton active={st.bold} onClick={() => props.onUpdateText(st.id, { bold: !st.bold })}>
                <Bold className="w-4 h-4" />
              </ToggleButton>
              <ToggleButton active={st.italic} onClick={() => props.onUpdateText(st.id, { italic: !st.italic })}>
                <Italic className="w-4 h-4" />
              </ToggleButton>
              <ToggleButton active={st.underline} onClick={() => props.onUpdateText(st.id, { underline: !st.underline })}>
                <Underline className="w-4 h-4" />
              </ToggleButton>
            </div>
          </Section>

          <Section title="Alignment">
            <div className="flex items-center gap-1">
              <ToggleButton active={st.alignment === 'left'} onClick={() => props.onUpdateText(st.id, { alignment: 'left' })}>
                <AlignLeft className="w-4 h-4" />
              </ToggleButton>
              <ToggleButton active={st.alignment === 'center'} onClick={() => props.onUpdateText(st.id, { alignment: 'center' })}>
                <AlignCenter className="w-4 h-4" />
              </ToggleButton>
              <ToggleButton active={st.alignment === 'right'} onClick={() => props.onUpdateText(st.id, { alignment: 'right' })}>
                <AlignRight className="w-4 h-4" />
              </ToggleButton>
            </div>
          </Section>

          <ColorPicker
            label="Text Color"
            value={st.color}
            onChange={(c) => props.onUpdateText(st.id, { color: c })}
          />

          <div className="pt-3 border-t border-gray-100">
            <button
              onClick={() => props.onDeleteText(st.id)}
              className="w-full px-3 py-2 flex items-center justify-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete text
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Image properties
  if (props.selectedImage) {
    const si = props.selectedImage;
    return (
      <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <PanelHeader title="Image Properties" />
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {si.isOriginal && (
            <p className="p-3 text-xs text-amber-800 bg-amber-50 rounded-lg">
              This region is part of the rendered PDF page. Deleting it covers the region with a sampled background color; page textures may not be reconstructed.
            </p>
          )}

          <Section title="Rotation">
            <div className="flex items-center gap-2">
              <button
                onClick={() => props.onUpdateImage(si.id, { rotation: (si.rotation + 90) % 360 })}
                disabled={si.isOriginal}
                className="flex-1 px-3 py-2 flex items-center justify-center gap-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <RotateCw className="w-4 h-4" /> Rotate 90°
              </button>
            </div>
          </Section>

          <Section title="Opacity">
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(si.opacity * 100)}
              onChange={(e) => props.onUpdateImage(si.id, { opacity: parseInt(e.target.value) / 100 })}
              disabled={si.isOriginal}
              className="w-full accent-blue-600"
            />
            <p className="text-xs text-gray-500 text-center">{Math.round(props.selectedImage.opacity * 100)}%</p>
          </Section>

          <Section title="Dimensions">
            <div className="grid grid-cols-2 gap-2">
              <DimensionInput label="Width" value={si.bbox.width} onChange={(width) => props.onUpdateImage(si.id, { bbox: { ...si.bbox, width } })} disabled={si.isOriginal} />
              <DimensionInput label="Height" value={si.bbox.height} onChange={(height) => props.onUpdateImage(si.id, { bbox: { ...si.bbox, height } })} disabled={si.isOriginal} />
            </div>
          </Section>

          <div className="pt-3 border-t border-gray-100">
            <button
              onClick={() => props.onDeleteImage(si.id)}
              className="w-full px-3 py-2 flex items-center justify-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> {si.isOriginal ? 'Delete region' : 'Delete image'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Annotation properties
  if (props.selectedAnnotation) {
    const sa = props.selectedAnnotation;
    return (
      <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <PanelHeader title="Annotation Properties" />
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <Section title="Type">
            <p className="text-sm font-medium text-gray-900 capitalize">{sa.kind}</p>
          </Section>

          <ColorPicker
            label="Color"
            value={sa.color}
            onChange={(c) => props.onUpdateAnnotation(sa.id, { color: c })}
          />

          {(sa.kind === 'draw' || sa.kind === 'shape') && (
            <Section title="Stroke Width">
              <input
                type="range"
                min="1"
                max="20"
                value={sa.strokeWidth}
                onChange={(e) => props.onUpdateAnnotation(sa.id, { strokeWidth: parseInt(e.target.value) })}
                className="w-full accent-blue-600"
              />
              <p className="text-xs text-gray-500 text-center">{sa.strokeWidth}px</p>
            </Section>
          )}

          <Section title="Opacity">
            <input
              type="range"
              min="10"
              max="100"
              value={Math.round(sa.opacity * 100)}
              onChange={(e) => props.onUpdateAnnotation(sa.id, { opacity: parseInt(e.target.value) / 100 })}
              className="w-full accent-blue-600"
            />
            <p className="text-xs text-gray-500 text-center">{Math.round(props.selectedAnnotation.opacity * 100)}%</p>
          </Section>

          {(sa.kind === 'stickyNote' || sa.kind === 'comment') && (
            <Section title="Text">
              <textarea
                value={sa.text || ''}
                onChange={(e) => props.onUpdateAnnotation(sa.id, { text: e.target.value })}
                rows={4}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500 resize-none"
                placeholder="Enter text..."
              />
            </Section>
          )}

          <div className="pt-3 border-t border-gray-100">
            <button
              onClick={() => props.onDeleteAnnotation(sa.id)}
              className="w-full px-3 py-2 flex items-center justify-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete annotation
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Tool-specific settings (no selection)
  const isAnnotationTool = ['highlight', 'underline', 'strikethrough', 'draw', 'shapes', 'erase'].includes(props.activeTool);
  const isAddText = props.activeTool === 'addText';
  const isAddImage = props.activeTool === 'addImage';

  if (isAnnotationTool || isAddText || isAddImage) {
    void activeTab;
    void setActiveTab;
    return (
      <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <PanelHeader title={`${props.activeTool} Settings`} />
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {(isAnnotationTool || isAddText) && (
            <ColorPicker
              label="Color"
              value={props.annotationColor}
              onChange={props.onAnnotationColorChange}
            />
          )}

          {(props.activeTool === 'draw' || props.activeTool === 'shapes') && (
            <Section title="Stroke Width">
              <input
                type="range"
                min="1"
                max="20"
                value={props.annotationWidth}
                onChange={(e) => props.onAnnotationWidthChange(parseInt(e.target.value))}
                className="w-full accent-blue-600"
              />
              <p className="text-xs text-gray-500 text-center">{props.annotationWidth}px</p>
            </Section>
          )}

          {props.activeTool === 'shapes' && (
            <Section title="Shape">
              <div className="grid grid-cols-4 gap-2">
                {([
                  { kind: 'rectangle' as ShapeKind, icon: Square },
                  { kind: 'circle' as ShapeKind, icon: Circle },
                  { kind: 'line' as ShapeKind, icon: Minus },
                  { kind: 'arrow' as ShapeKind, icon: MoveRight },
                ]).map((s) => (
                  <button
                    key={s.kind}
                    onClick={() => props.onShapeKindChange(s.kind)}
                    className={`p-2 rounded-lg flex items-center justify-center transition-colors ${
                      props.shapeKind === s.kind ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <s.icon className="w-5 h-5" />
                  </button>
                ))}
              </div>
            </Section>
          )}

          {props.activeTool === 'erase' && (
            <Section title="Erase">
              <p className="text-xs text-gray-600 leading-relaxed">Drag a rectangle over text or artwork to cover it using the nearby page color. This works best on flat backgrounds.</p>
            </Section>
          )}

          {isAddText && (
            <Section title="Instructions">
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                <Type className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Click anywhere on the document to add a text box. Then use these properties to customize it.
                </p>
              </div>
            </Section>
          )}

          {isAddImage && (
            <Section title="Instructions">
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                <Upload className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Click anywhere on the document to place an image. You'll be prompted to choose a file from your device.
                </p>
              </div>
            </Section>
          )}

          {props.activeTool === 'highlight' && (
            <Section title="Instructions">
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                <Eye className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Click and drag over text to highlight it. Choose a color above.
                </p>
              </div>
            </Section>
          )}

          {(props.activeTool === 'underline' || props.activeTool === 'strikethrough') && (
            <Section title="Instructions">
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                <Eye className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Click and drag over text to apply {props.activeTool}. Choose a color above.
                </p>
              </div>
            </Section>
          )}

          {(props.activeTool === 'draw') && (
            <Section title="Instructions">
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                <Eye className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Click and draw freehand on the document. Adjust stroke width and color above.
                </p>
              </div>
            </Section>
          )}
        </div>
      </div>
    );
  }

  // Default empty state
  return (
    <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
      <PanelHeader title="Properties" />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Settings className="w-10 h-10 text-gray-300 mb-3" />
        <p className="text-sm text-gray-400">Select a tool or object to see properties</p>
      </div>
    </div>
  );
}

function DimensionInput({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <label className="block text-xs text-gray-500">
      {label} (pt)
      <input
        type="number"
        min="8"
        step="1"
        value={Math.round(value * 10) / 10}
        onChange={(e) => onChange(Math.max(8, Number(e.target.value) || 8))}
        disabled={disabled}
        className="mt-1 w-full px-2 py-1.5 text-sm text-gray-900 border border-gray-200 rounded-lg outline-none focus:border-blue-500"
      />
    </label>
  );
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="h-11 border-b border-gray-200 flex items-center px-4 flex-shrink-0">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
    </div>
  );
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
        active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

// Processing overlay shown during PDF loading

import { FileText, Loader2 } from 'lucide-react';

interface ProcessingOverlayProps {
  fileName: string;
  fileSize: string;
  progress: number;
  status: string;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
}

export default function ProcessingOverlay({
  fileName,
  fileSize,
  progress,
  status,
  error,
  onRetry,
  onCancel,
}: ProcessingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
      <div className="max-w-md w-full px-6">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">JJ PDF Studio <span className="text-blue-600">Pro</span></span>
        </div>

        {error ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <FileText className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Couldn't open this file</h2>
            <p className="text-sm text-gray-600 mb-1">{error}</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={onRetry}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try another file
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Processing your PDF</h2>
            <p className="text-sm text-gray-500 mb-1 truncate max-w-full">{fileName}</p>
            <p className="text-xs text-gray-400 mb-6">{fileSize}</p>

            <div className="space-y-3">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                {status}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

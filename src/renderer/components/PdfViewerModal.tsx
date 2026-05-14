import React, { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerModalProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({ filePath, fileName, onClose }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);

  const fileUrl = filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setPageNumber(p => Math.min(p + 1, numPages));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setPageNumber(p => Math.max(p - 1, 1));
  }, [onClose, numPages]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
        <span className="text-white font-medium text-sm truncate max-w-xs">{fileName}</span>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setPageNumber(p => Math.max(p - 1, 1))}
            disabled={pageNumber <= 1}
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-gray-300 text-sm tabular-nums">
            Seite {pageNumber} / {numPages || '…'}
          </span>
          <button
            onClick={() => setPageNumber(p => Math.min(p + 1, numPages))}
            disabled={pageNumber >= numPages}
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="w-px h-5 bg-gray-600 mx-1" />

          <button
            onClick={() => setScale(s => Math.max(s - 0.2, 0.4))}
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-gray-400 text-xs w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(s => Math.min(s + 0.2, 3))}
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          <div className="w-px h-5 bg-gray-600 mx-1" />

          <button
            onClick={onClose}
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-red-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex-1 overflow-auto flex justify-center py-6 bg-gray-900">
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNumber(1); }}
          onLoadError={(err) => console.error('PDF load error:', err)}
          loading={<div className="text-gray-400 mt-20">PDF wird geladen…</div>}
          error={<div className="text-red-400 mt-20">PDF konnte nicht geladen werden.</div>}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  );
};

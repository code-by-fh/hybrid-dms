import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, FileText, ScrollText, Columns } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PdfViewerModalProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({ filePath, fileName, onClose }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [viewMode, setViewMode] = useState<'single' | 'continuous' | 'double'>('single');
  const containerRef = useRef<HTMLDivElement>(null);

  const fileUrl = filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    
    const step = viewMode === 'double' ? 2 : 1;
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (viewMode !== 'continuous') {
        setPageNumber(p => Math.min(p + step, numPages));
      }
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (viewMode !== 'continuous') {
        setPageNumber(p => Math.max(p - step, 1));
      }
    }
  }, [onClose, numPages, viewMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale(s => Math.min(Math.max(s + delta, 0.4), 4));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="flex flex-col bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-800" style={{ width: '90%', height: '90%' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
        <span className="text-white font-medium text-sm truncate max-w-xs">{fileName}</span>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 bg-gray-700/50 rounded-lg p-1 mx-2">
            <button
              onClick={() => setViewMode('single')}
              className={`p-1.5 rounded ${viewMode === 'single' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              title="Einzelseite"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('double')}
              className={`p-1.5 rounded ${viewMode === 'double' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              title="Zwei Seiten"
            >
              <Columns className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('continuous')}
              className={`p-1.5 rounded ${viewMode === 'continuous' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              title="Fortlaufend"
            >
              <ScrollText className="w-4 h-4" />
            </button>
          </div>

          <div className="w-px h-5 bg-gray-600 mx-1" />

          <button
            onClick={() => setPageNumber(p => Math.max(p - (viewMode === 'double' ? 2 : 1), 1))}
            disabled={pageNumber <= 1 || viewMode === 'continuous'}
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-gray-300 text-sm tabular-nums min-w-[80px] text-center">
            {viewMode === 'continuous' ? `${numPages} Seiten` : `Seite ${pageNumber}${viewMode === 'double' && pageNumber < numPages ? `-${pageNumber+1}` : ''} / ${numPages || '…'}`}
          </span>
          <button
            onClick={() => setPageNumber(p => Math.min(p + (viewMode === 'double' ? 2 : 1), numPages))}
            disabled={pageNumber >= numPages || viewMode === 'continuous'}
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
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto flex justify-center py-6 bg-gray-900 scroll-smooth"
      >
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNumber(1); }}
          onLoadError={(err) => console.error('PDF load error:', err)}
          loading={<div className="text-gray-400 mt-20 flex flex-col items-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>PDF wird geladen…</div>}
          error={<div className="text-red-400 mt-20">PDF konnte nicht geladen werden.</div>}
        >
          {viewMode === 'single' && (
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-2xl"
            />
          )}
          {viewMode === 'double' && (
            <div className="flex gap-4 px-4 justify-center">
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="shadow-2xl"
              />
              {pageNumber + 1 <= numPages && (
                <Page
                  pageNumber={pageNumber + 1}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-2xl"
                />
              )}
            </div>
          )}
          {viewMode === 'continuous' && (
            <div className="flex flex-col gap-8 items-center px-4 pb-12">
              {Array.from({ length: numPages }, (_, i) => (
                <Page
                  key={i + 1}
                  pageNumber={i + 1}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-2xl"
                  loading={<div className="bg-gray-800 w-full h-[800px] animate-pulse rounded-lg" />}
                />
              ))}
            </div>
          )}
        </Document>
      </div>
      </div>
    </div>
  );
};

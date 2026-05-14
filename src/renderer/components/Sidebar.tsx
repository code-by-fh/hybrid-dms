import React, { useState, useEffect } from 'react';
import type { DocumentType } from '../../App';
import { X, Save, FileBox, Tag, User, Calendar, Cpu, LayoutGrid, RefreshCw, AlertCircle, FolderInput, Clock, FileText } from 'lucide-react';

interface SidebarProps {
  document: DocumentType;
  isInbox?: boolean;
  isArchive?: boolean;
  onSave: (tags: string[], metadata: any) => void;
  onMoveToProcessing?: () => void;
  onOpenPdf?: () => void;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ document, isInbox, isArchive, onSave, onMoveToProcessing, onOpenPdf, onClose }) => {
  const [tags, setTags] = useState<string>('');
  const [sender, setSender] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [docType, setDocType] = useState<string>('');
  const [archivePath, setArchivePath] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const isProcessing = document.status === 'ocr_processing' || document.status === 'ai_processing';
  const isAiPending = document.status === 'ai_pending';
  const isError = document.status === 'error';
  const processingText = document.status === 'ocr_processing' ? 'OCR Texterkennung läuft…' : 'KI Analyse läuft…';

  useEffect(() => {
    try {
      const parsedTags = document.tags ? JSON.parse(document.tags) : [];
      setTags(parsedTags.join(', '));

      const parsedMeta = document.metadata ? JSON.parse(document.metadata) : {};
      setSender(parsedMeta.sender || '');
      setDate(parsedMeta.date || '');
      setDocType(parsedMeta.docType || '');
      setArchivePath(parsedMeta.archivePath || '');
    } catch (e) {
      console.error('Error parsing metadata', e);
    }
  }, [document]);

  const handleSave = () => {
    const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
    onSave(tagsArray, { sender, date, docType, archivePath });
  };

  const handleAIAnalyze = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.analyzeDocument(document.hash);
      if (result.success && result.data) {
        if (result.data.sender) setSender(result.data.sender);
        if (result.data.date) setDate(result.data.date);
        if (result.data.docType) setDocType(result.data.docType);
        if (result.data.archivePath) setArchivePath(result.data.archivePath);
        if (result.data.tags && Array.isArray(result.data.tags)) {
          setTags(result.data.tags.join(', '));
        }
      } else {
        alert(`KI Analyse fehlgeschlagen: ${result.error}`);
      }
    } catch (e) {
      alert('Fehler bei der Kommunikation mit der KI.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    setLoading(true);
    try {
      await window.electronAPI.retryProcessing(document.hash);
    } catch (e) {
      console.error('Retry failed', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOCR = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.performOCR(document.hash);
      if (result.success) {
        alert('OCR Scan erfolgreich! KI-Analyse kann jetzt gestartet werden.');
      } else {
        alert(`OCR Scan fehlgeschlagen: ${result.error}`);
      }
    } catch {
      alert('Fehler beim Starten des OCR Scans.');
    } finally {
      setLoading(false);
    }
  };

  const fileName = document.last_path.split(/[\\/]/).pop() ?? '';

  const inputClass =
    'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <h2 className="font-semibold text-gray-800 flex items-center">
          <FileBox className="w-5 h-5 mr-2 text-blue-600" />
          Dokument Details
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded text-gray-500">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Filename badge */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 font-mono break-all">
          {fileName}
        </div>

        {/* PDF Viewer */}
        {onOpenPdf && (
          <button
            onClick={onOpenPdf}
            className="w-full py-2 px-4 border border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center text-sm font-medium"
          >
            <FileText className="w-4 h-4 mr-2 text-blue-500" />
            PDF anzeigen
          </button>
        )}

        {/* Status banners */}
        {isProcessing && (
          <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg text-sm text-orange-800 flex items-center animate-pulse">
            <RefreshCw className="w-5 h-5 mr-3 animate-spin text-orange-600 shrink-0" />
            <div>
              <p className="font-bold">{processingText}</p>
              <p className="text-xs mt-0.5 opacity-70">Bitte warten…</p>
            </div>
          </div>
        )}

        {isAiPending && (
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm text-yellow-800 flex items-center">
            <Clock className="w-5 h-5 mr-3 text-yellow-600 shrink-0" />
            <div>
              <p className="font-bold">Warte auf KI (Ollama offline)</p>
              <p className="text-xs mt-0.5 opacity-70">Wird automatisch wiederholt sobald Ollama erreichbar ist.</p>
            </div>
          </div>
        )}

        {isError && isInbox && (
          <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-800 flex items-start">
            <AlertCircle className="w-5 h-5 mr-3 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Verarbeitung fehlgeschlagen</p>
              <p className="text-xs mt-0.5 opacity-70">OCR oder KI-Analyse konnte nicht abgeschlossen werden.</p>
            </div>
          </div>
        )}

        {/* Metadata fields */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center">
              <User className="w-3.5 h-3.5 mr-1.5 text-blue-500" /> Absender
            </label>
            <input type="text" value={sender} onChange={e => setSender(e.target.value)}
              disabled={isProcessing} className={inputClass} placeholder="z.B. Telekom GmbH" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-blue-500" /> Datum
            </label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              disabled={isProcessing} className={inputClass} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center">
              <FileBox className="w-3.5 h-3.5 mr-1.5 text-blue-500" /> Dokumenttyp
            </label>
            <input type="text" value={docType} onChange={e => setDocType(e.target.value)}
              disabled={isProcessing} className={inputClass} placeholder="z.B. Rechnung, Vertrag, Brief" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center">
              <Tag className="w-3.5 h-3.5 mr-1.5 text-blue-500" /> Tags <span className="normal-case text-gray-400 ml-1 font-normal">(kommagetrennt)</span>
            </label>
            <input type="text" value={tags} onChange={e => setTags(e.target.value)}
              disabled={isProcessing} className={inputClass} placeholder="Rechnung, Internet, Urgent" />
          </div>

          {/* Archive path — shown in sort and archive views */}
          {!isInbox && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center">
                <FolderInput className="w-3.5 h-3.5 mr-1.5 text-green-500" /> Archivpfad
                <span className="normal-case text-gray-400 ml-1 font-normal">(KI-Vorschlag, editierbar)</span>
              </label>
              <input type="text" value={archivePath} onChange={e => setArchivePath(e.target.value)}
                disabled={isProcessing} className={inputClass}
                placeholder="z.B. Rechnungen/Internet" />
              {archivePath && (
                <p className="text-xs text-gray-400 mt-1 font-mono">
                  …/Archiv/<span className="text-green-600">{archivePath}</span>/{fileName}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!isArchive && (
          <div className="pt-3 border-t border-gray-100 space-y-2">
            {document.metadata && (() => {
              try { return JSON.parse(document.metadata).needsOcr; } catch { return false; }
            })() && (
              <button onClick={handleOCR} disabled={loading || isProcessing}
                className="w-full py-2 px-4 border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors flex items-center justify-center text-sm font-medium disabled:opacity-50">
                <Cpu className="w-4 h-4 mr-2" />
                {loading ? 'OCR läuft…' : 'OCR Scan starten'}
              </button>
            )}
            <button onClick={handleAIAnalyze} disabled={loading || isProcessing}
              className="w-full py-2 px-4 border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center justify-center text-sm font-medium disabled:opacity-50">
              <Cpu className="w-4 h-4 mr-2" />
              {loading ? 'KI analysiert…' : 'Erneut mit KI analysieren'}
            </button>
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div className="p-4 border-t bg-gray-50 flex flex-col space-y-2">
        {isInbox && isError && (
          <>
            <button onClick={handleRetry} disabled={loading}
              className="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors flex items-center justify-center font-semibold disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Erneut versuchen
            </button>
            <button onClick={onMoveToProcessing} disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center font-semibold disabled:opacity-50">
              <LayoutGrid className="w-4 h-4 mr-2" />
              Manuell nach Sortieren
            </button>
          </>
        )}

        {isInbox && !isError && !isAiPending && (
          <p className="text-center text-sm text-gray-400 py-2 italic">
            {isProcessing ? processingText : 'Automatische Verarbeitung läuft…'}
          </p>
        )}

        {isInbox && isAiPending && (
          <button onClick={onMoveToProcessing} disabled={loading}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center font-semibold disabled:opacity-50">
            <LayoutGrid className="w-4 h-4 mr-2" />
            Manuell nach Sortieren
          </button>
        )}

        {!isInbox && (
          <button onClick={handleSave} disabled={isProcessing || loading}
            className={`w-full py-3 px-4 text-white rounded-lg transition-colors flex items-center justify-center font-bold shadow-md disabled:opacity-50 ${
              isArchive ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
            }`}>
            {isArchive ? (
              <><Save className="w-5 h-5 mr-2" /> Metadaten aktualisieren</>
            ) : (
              <><FolderInput className="w-5 h-5 mr-2" /> In Archiv verschieben</>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

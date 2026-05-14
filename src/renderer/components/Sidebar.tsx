import React, { useState, useEffect } from 'react';
import type { DocumentType } from '../../App';
import { X, Save, FileBox, Tag, User, Calendar, Cpu, LayoutGrid, RefreshCw, AlertCircle } from 'lucide-react';

interface SidebarProps {
  document: DocumentType;
  isInbox?: boolean;
  isArchive?: boolean;
  onSave: (tags: string[], metadata: any) => void;
  onMoveToProcessing?: () => void;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ document, isInbox, isArchive, onSave, onMoveToProcessing, onClose }) => {
  const [tags, setTags] = useState<string>('');
  const [sender, setSender] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [docType, setDocType] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const isProcessing = document.status === 'ocr_processing' || document.status === 'ai_processing';
  const isError = document.status === 'error';
  const processingText = document.status === 'ocr_processing' ? 'OCR Texterkennung läuft...' : 'KI Analyse läuft...';

  useEffect(() => {
    // Populate form with existing data if available
    try {
      const parsedTags = document.tags ? JSON.parse(document.tags) : [];
      setTags(parsedTags.join(', '));
      
      const parsedMeta = document.metadata ? JSON.parse(document.metadata) : {};
      setSender(parsedMeta.sender || '');
      setDate(parsedMeta.date || '');
      setDocType(parsedMeta.docType || '');
    } catch (e) {
      console.error("Error parsing metadata", e);
    }
  }, [document]);

  const handleSave = () => {
    const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
    onSave(tagsArray, { sender, date, docType });
  };

  const handleAIAnalyze = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.analyzeDocument(document.hash);
      if (result.success && result.data) {
        if (result.data.sender) setSender(result.data.sender);
        if (result.data.date) setDate(result.data.date);
        if (result.data.docType) setDocType(result.data.docType);
        if (result.data.tags && Array.isArray(result.data.tags)) {
          setTags(result.data.tags.join(', '));
        }
      } else {
        console.error("AI Analysis failed:", result.error);
        alert(`KI Analyse fehlgeschlagen: ${result.error}`);
      }
    } catch (e) {
      console.error("Error calling analyzeDocument:", e);
      alert("Fehler bei der Kommunikation mit der KI.");
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
        alert("OCR Scan erfolgreich abgeschlossen! Du kannst nun die KI-Analyse erneut starten.");
        // We could also trigger AI analysis automatically here
      } else {
        console.error("OCR failed:", result.error);
        alert(`OCR Scan fehlgeschlagen: ${result.error}`);
      }
    } catch (e) {
      console.error("Error calling performOCR:", e);
      alert("Fehler beim Starten des OCR Scans.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <h2 className="font-semibold text-gray-800 flex items-center">
          <FileBox className="w-5 h-5 mr-2 text-blue-600" />
          Document Details
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded text-gray-500">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {isInbox && (
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-sm text-blue-800 mb-2">
            <p className="font-semibold">Neu in der Inbox</p>
            <p className="text-xs mt-1 text-blue-600">Dokument wurde im Posteingang erkannt. Verschiebe es zum Sortieren, um Metadaten zu erfassen.</p>
          </div>
        )}

        {isProcessing && (
          <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg text-sm text-orange-800 mb-2 animate-pulse flex items-center">
            <RefreshCw className="w-5 h-5 mr-3 animate-spin text-orange-600" />
            <div>
              <p className="font-bold">{processingText}</p>
              <p className="text-xs mt-1 opacity-80">Das Dokument kann gerade nicht bearbeitet werden.</p>
            </div>
          </div>
        )}

        {isError && isInbox && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-sm text-red-800 mb-2 flex items-start">
            <AlertCircle className="w-5 h-5 mr-3 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Verarbeitung fehlgeschlagen</p>
              <p className="text-xs mt-1 opacity-80">OCR oder KI-Analyse konnte nicht abgeschlossen werden.</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
             <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center">
               <User className="w-3.5 h-3.5 mr-1.5 text-blue-500" /> Sender / Author
             </label>
             <input 
               type="text" 
               value={sender}
               onChange={e => setSender(e.target.value)}
               disabled={isProcessing}
               className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 focus:border-blue-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium dark:text-gray-200"
               placeholder="e.g. Telekom GmbH"
             />
          </div>
 
          <div>
             <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center">
               <Calendar className="w-3.5 h-3.5 mr-1.5 text-blue-500" /> Date (YYYY-MM-DD)
             </label>
             <input 
               type="date" 
               value={date}
               onChange={e => setDate(e.target.value)}
               disabled={isProcessing}
               className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 focus:border-blue-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium dark:text-gray-200"
             />
          </div>
 
          <div>
             <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center">
               <FileBox className="w-3.5 h-3.5 mr-1.5 text-blue-500" /> Document Type
             </label>
             <select 
               value={docType}
               onChange={e => setDocType(e.target.value)}
               disabled={isProcessing}
               className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 focus:border-blue-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium dark:text-gray-200"
             >
               <option value="">Select Type...</option>
               <option value="Invoice">Rechnung (Invoice)</option>
               <option value="Contract">Vertrag (Contract)</option>
               <option value="Receipt">Quittung (Receipt)</option>
               <option value="Letter">Brief (Letter)</option>
               <option value="Insurance">Versicherung (Insurance)</option>
               <option value="Other">Sonstiges (Other)</option>
             </select>
          </div>
 
          <div>
             <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center">
               <Tag className="w-3.5 h-3.5 mr-1.5 text-blue-500" /> Tags (comma separated)
             </label>
             <input 
               type="text" 
               value={tags}
               onChange={e => setTags(e.target.value)}
               disabled={isProcessing}
               className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 focus:border-blue-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium dark:text-gray-200"
               placeholder="Invoice, Urgent, Tech"
             />
          </div>
        </div>

         {!isArchive && (
          <div className="pt-4 border-t border-gray-100 space-y-2">
             {document.metadata && JSON.parse(document.metadata).needsOcr && (
               <button 
                 onClick={handleOCR}
                 disabled={loading || isProcessing}
                 className="w-full py-2 px-4 border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-md transition-colors flex items-center justify-center text-sm font-medium disabled:opacity-50"
               >
                 <Cpu className="w-4 h-4 mr-2" />
                 {loading ? 'Performing OCR...' : 'OCR Scan starten (Text erkennen)'}
               </button>
             )}
             <button 
               onClick={handleAIAnalyze}
               disabled={loading || isProcessing}
               className="w-full py-2 px-4 border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors flex items-center justify-center text-sm font-medium disabled:opacity-50"
             >
               <Cpu className="w-4 h-4 mr-2" />
               {loading ? 'Analyzing with AI...' : 'Auto-fill with Ollama AI'}
             </button>
          </div>
        )}
      </div>

      <div className="p-4 border-t bg-gray-50 flex flex-col space-y-2">
        {isInbox && isError && (
          <>
            <button
              onClick={handleRetry}
              disabled={loading}
              className="w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors flex items-center justify-center font-bold shadow-md disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Erneut versuchen
            </button>
            <button
              onClick={onMoveToProcessing}
              disabled={loading}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center font-bold shadow-md disabled:opacity-50"
            >
              <LayoutGrid className="w-5 h-5 mr-2" />
              Manuell nach Sortieren
            </button>
          </>
        )}
        {isInbox && !isError && (
          <p className="text-center text-sm text-gray-400 py-2 italic">
            {isProcessing ? processingText : 'Warte auf automatische Verarbeitung\u2026'}
          </p>
        )}
        {!isInbox && (
          <button
            onClick={handleSave}
            disabled={isProcessing || loading}
            className={`w-full py-3 px-4 text-white rounded-lg transition-colors flex items-center justify-center font-bold shadow-md disabled:opacity-50 ${
              isArchive ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            <Save className="w-5 h-5 mr-2" />
            {isArchive ? 'Metadaten aktualisieren' : 'Speichern & Archivieren'}
          </button>
        )}
      </div>
    </div>
  );
};

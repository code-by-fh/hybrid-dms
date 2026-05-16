import React, { useState, useEffect } from 'react';
import { X, Folder, Save, Trash2, FileText } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [inboxPath, setInboxPath] = useState('');
  const [processingPath, setProcessingPath] = useState('');
  const [archivePath, setArchivePath] = useState('');
  const [excludeFolders, setExcludeFolders] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const [logPath, setLogPath] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.getSettings().then(settings => {
      setInboxPath(settings.INBOX_PATH);
      setProcessingPath(settings.PROCESSING_PATH);
      setArchivePath(settings.ARCHIVE_PATH || '');
      setExcludeFolders(settings.EXCLUDE_FOLDERS ? settings.EXCLUDE_FOLDERS.join(', ') : '');
      setOllamaUrl(settings.OLLAMA_URL || 'http://localhost:11434');
      setOllamaModel(settings.OLLAMA_MODEL || 'llama3.2');
      (window.electronAPI as any).getLogPath().then((p: string) => setLogPath(p || ''));
      setLoading(false);
    });
  }, []);

  const handlePickPath = async (setter: (path: string) => void) => {
    const path = await window.electronAPI.openDirectoryDialog();
    if (path) {
      setter(path);
    }
  };

  const handleSave = async () => {
    await window.electronAPI.updateSettings({
      INBOX_PATH: inboxPath,
      PROCESSING_PATH: processingPath,
      ARCHIVE_PATH: archivePath,
      EXCLUDE_FOLDERS: excludeFolders,
      OLLAMA_URL: ollamaUrl,
      OLLAMA_MODEL: ollamaModel,
    });
    if (logPath) {
      await (window.electronAPI as any).setLogPath(logPath);
    }
    onClose();
  };

  if (loading) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b flex items-center justify-between bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800 flex items-center">
            <Folder className="w-6 h-6 mr-2 text-blue-600" />
            Konfiguration & Pfade
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Inbox Pfad (Überwachung)</label>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={inboxPath} 
                  onChange={e => setInboxPath(e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                />
                <button 
                  onClick={() => handlePickPath(setInboxPath)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg border transition-colors flex items-center"
                >
                  <Folder className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Hier werden neue Dokumente automatisch erkannt.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Processing Pfad (Sortieren)</label>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={processingPath} 
                  onChange={e => setProcessingPath(e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                />
                <button 
                  onClick={() => handlePickPath(setProcessingPath)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg border transition-colors flex items-center"
                >
                  <Folder className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Temporärer Ordner während der Metadaten-Erfassung.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Archive Pfad (Index)</label>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={archivePath} 
                  onChange={e => setArchivePath(e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                />
                <button 
                  onClick={() => handlePickPath(setArchivePath)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg border transition-colors flex items-center"
                >
                  <Folder className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Wurzelverzeichnis deines digitalen Archivs.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Ausgeschlossene Ordner (Kommagetrennt)</label>
              <textarea 
                value={excludeFolders} 
                onChange={e => setExcludeFolders(e.target.value)}
                rows={2}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                placeholder="node_modules, .git, Temp"
              />
              <p className="text-xs text-gray-500 mt-1">Diese Ordnernamen oder Pfade werden beim Archiv-Scan ignoriert.</p>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center">
                KI & Ollama Konfiguration
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Ollama API URL</label>
                  <input 
                    type="text" 
                    value={ollamaUrl} 
                    onChange={e => setOllamaUrl(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                    placeholder="http://localhost:11434"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Ollama Modell</label>
                  <input 
                    type="text" 
                    value={ollamaModel} 
                    onChange={e => setOllamaModel(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                    placeholder="llama3.2"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Die KI wird zur automatischen Dokumentenanalyse und Verschlagwortung genutzt.</p>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center">
                <FileText className="w-4 h-4 mr-2 text-blue-600" />
                Protokoll & Logs
              </h3>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Log-Datei Pfad</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={logPath}
                    onChange={e => setLogPath(e.target.value)}
                    className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                    placeholder="Standardpfad wird automatisch verwendet"
                  />
                  <button
                    onClick={() => handlePickPath(setLogPath)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg border transition-colors flex items-center"
                  >
                    <Folder className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Pfad zur Log-Datei (max. ~95 MB, wird danach rotiert).</p>
              </div>
              <button
                onClick={() => (window.electronAPI as any).openLogFile()}
                className="mt-3 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg border transition-colors flex items-center text-sm font-medium text-gray-700"
              >
                <FileText className="w-4 h-4 mr-2" />
                Log-Datei öffnen
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end space-x-4">
          <button 
            onClick={onClose}
            className="px-6 py-2 border rounded-lg hover:bg-gray-100 transition-colors font-medium text-gray-600"
          >
            Abbrechen
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center shadow-md"
          >
            <Save className="w-4 h-4 mr-2" />
            Einstellungen speichern
          </button>
        </div>
      </div>
    </div>
  );
};

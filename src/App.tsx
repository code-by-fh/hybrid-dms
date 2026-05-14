import { useState, useEffect } from 'react'
import { FileDashboard } from './renderer/components/FileDashboard'
import { Sidebar } from './renderer/components/Sidebar'
import { SettingsModal } from './renderer/components/SettingsModal'
import { NavSidebar } from './renderer/components/NavSidebar'
import type { ViewType } from './renderer/components/NavSidebar'
import { ArchiveTree } from './renderer/components/ArchiveTree'
import { Search, Filter, RefreshCw, Folder } from 'lucide-react'

export interface DocumentType {
  id: number;
  hash: string;
  last_path: string;
  tags: string;
  metadata: string;
  status: string;
  indexed_at: string;
}

function App() {
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [selectedDoc, setSelectedDoc] = useState<DocumentType | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [currentView, setCurrentView] = useState<ViewType>('inbox')
  const [searchQuery, setSearchQuery] = useState('')
  const [settings, setSettings] = useState<any>(null)
  const [ollamaStatus, setOllamaStatus] = useState(false)

  useEffect(() => {
    // Initial load
    if (window.electronAPI) {
      window.electronAPI.getDocuments().then(docs => setDocuments(docs))
      window.electronAPI.getSettings().then(setSettings)
      
      // Listen for document changes
      window.electronAPI.onDocumentsChanged(() => {
        window.electronAPI.getDocuments().then(docs => {
          setDocuments(docs);
        });
      });
      
      // Check Ollama status
      const checkOllama = () => {
        window.electronAPI.checkOllamaStatus().then(setOllamaStatus);
      };
      checkOllama();
      const interval = setInterval(checkOllama, 10000); // every 10s
      return () => clearInterval(interval);
    }
  }, [isSettingsOpen])

  const handleMoveToProcessing = async (hash: string) => {
    await window.electronAPI.moveToProcessing(hash);
    window.electronAPI.getDocuments().then(setDocuments);
    setSelectedDoc(null);
  };

  const handleSaveAndMove = async (tags: string, metadata: any) => {
    if (!selectedDoc) return;
    
    await window.electronAPI.saveAndMove({
      hash: selectedDoc.hash,
      tags,
      metadata
    });
    
    // Refresh or update state optimistically
    window.electronAPI.getDocuments().then(setDocuments);
    setSelectedDoc(null);
  };

  const filteredDocuments = documents.filter(doc => {
    if (!settings) return true;

    // Filter by view based on physical path
    if (currentView === 'inbox') {
      return doc.last_path.startsWith(settings.INBOX_PATH);
    }
    if (currentView === 'sort') {
      return doc.last_path.startsWith(settings.PROCESSING_PATH);
    }
    if (currentView === 'archive') {
      return doc.last_path.startsWith(settings.ARCHIVE_PATH);
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const fileName = doc.last_path.toLowerCase();
      const tags = doc.tags.toLowerCase();
      const metadata = doc.metadata.toLowerCase();
      return fileName.includes(q) || tags.includes(q) || metadata.includes(q);
    }
    return true;
  });

  const getTitle = () => {
    switch(currentView) {
      case 'inbox': return 'Inbox (Neu)';
      case 'sort': return 'Dokumente sortieren';
      case 'archive': return 'Digitales Archiv';
    }
  };

  const getCurrentPath = () => {
    if (!settings) return 'Lädt...';
    switch(currentView) {
      case 'inbox': return settings.INBOX_PATH;
      case 'sort': return settings.PROCESSING_PATH;
      case 'archive': return settings.ARCHIVE_PATH;
    }
  };

  // Calculate counts
  let inboxCount = 0;
  let sortCount = 0;
  let archiveCount = 0;

  if (settings) {
    documents.forEach(doc => {
      if (doc.last_path.startsWith(settings.INBOX_PATH)) inboxCount++;
      else if (doc.last_path.startsWith(settings.PROCESSING_PATH)) sortCount++;
      else if (doc.last_path.startsWith(settings.ARCHIVE_PATH)) archiveCount++;
    });
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Global Navigation */}
      <NavSidebar 
        currentView={currentView} 
        onViewChange={(v) => {
          setCurrentView(v);
          setSelectedDoc(null);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        inboxCount={inboxCount}
        sortCount={sortCount}
        archiveCount={archiveCount}
        ollamaStatus={ollamaStatus}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b px-8 py-5 flex items-center justify-between shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{getTitle()}</h1>
            <div className="flex items-center text-[11px] text-gray-400 mt-1 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100 w-fit">
              <Folder className="w-3 h-3 mr-1" />
              {getCurrentPath()}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text"
                placeholder="Volltextsuche..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-gray-100 border-transparent border focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 rounded-xl outline-none w-64 transition-all"
              />
            </div>
            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-500" title="Filter">
              <Filter className="w-5 h-5" />
            </button>
            <button 
              onClick={() => window.electronAPI.getDocuments().then(docs => setDocuments(docs))}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-blue-600 transition-colors" 
              title="Aktualisieren"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-8">
          {currentView === 'archive' && settings ? (
            <ArchiveTree 
              documents={filteredDocuments} 
              archivePath={settings.ARCHIVE_PATH} 
              onSelectDocument={setSelectedDoc}
              selectedDoc={selectedDoc}
            />
          ) : (
            <FileDashboard 
              documents={filteredDocuments} 
              selectedDoc={selectedDoc} 
              onSelect={setSelectedDoc}
              isInbox={currentView === 'inbox'}
            />
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}

      {/* Sidebar for Metadata */}
      {selectedDoc && (
        <div className="w-[450px] border-l bg-white shadow-2xl flex flex-col z-20 animate-in slide-in-from-right duration-300">
          <Sidebar 
            document={selectedDoc} 
            isInbox={currentView === 'inbox'}
            isArchive={currentView === 'archive'}
            onSave={handleSaveAndMove}
            onMoveToProcessing={() => handleMoveToProcessing(selectedDoc.hash)}
            onClose={() => setSelectedDoc(null)}
          />
        </div>
      )}
    </div>
  )
}

export default App

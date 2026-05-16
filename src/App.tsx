import { useState, useEffect, useRef } from 'react'
import { FileDashboard } from './renderer/components/FileDashboard'
import { Sidebar } from './renderer/components/Sidebar'
import { SettingsModal } from './renderer/components/SettingsModal'
import { NavSidebar } from './renderer/components/NavSidebar'
import type { ViewType } from './renderer/components/NavSidebar'
import { ArchiveTree } from './renderer/components/ArchiveTree'
import { Search, Filter, RefreshCw, Folder } from 'lucide-react'
import { PdfViewerModal } from './renderer/components/PdfViewerModal'

export interface DocumentType {
  id: number;
  uuid: string;
  hash: string;
  last_path: string;
  tags: string;
  metadata: string;
  status: string;
  indexed_at: string;
}

function App() {
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const documentsRef = useRef<DocumentType[]>([])
  const [selectedDoc, setSelectedDoc] = useState<DocumentType | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [currentView, setCurrentView] = useState<ViewType>('inbox')
  const [searchQuery, setSearchQuery] = useState('')
  const [settings, setSettings] = useState<any>(null)
  const [ollamaStatus, setOllamaStatus] = useState(false)
  const [pdfViewerDoc, setPdfViewerDoc] = useState<DocumentType | null>(null)
  const [crawlerRunning, setCrawlerRunning] = useState(false)
  const [ftsResults, setFtsResults] = useState<DocumentType[] | null>(null)
  const [reanalyzingDocIds, setReanalyzingDocIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    // Initial load
    if (window.electronAPI) {
      window.electronAPI.getDocuments().then(docs => { setDocuments(docs); documentsRef.current = docs; })
      window.electronAPI.getSettings().then(setSettings)
      
      // Listen for document changes
      window.electronAPI.onDocumentsChanged(() => {
        window.electronAPI.getDocuments().then(docs => {
          setDocuments(docs);
          documentsRef.current = docs;
        });
      });
      
      // Check Ollama status
      const checkOllama = () => {
        window.electronAPI.checkOllamaStatus().then(setOllamaStatus);
      };
      checkOllama();
      const interval = setInterval(checkOllama, 30000); // every 30s

      // Crawler status
      ;(window.electronAPI as any).getCrawlerStatus().then((s: { running: boolean }) => setCrawlerRunning(s.running));
      ;(window.electronAPI as any).onCrawlerStatusChanged((status: 'running' | 'idle') => {
        setCrawlerRunning(status === 'running');
      });

      ;(window.electronAPI as any).onOpenDocumentByUuid?.((uuid: string) => {
        const doc = documentsRef.current.find(d => d.uuid === uuid);
        if (doc) setSelectedDoc(doc);
      });

      return () => clearInterval(interval);
    }
  }, [isSettingsOpen])

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setFtsResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await (window.electronAPI as any).searchDocuments(searchQuery);
      setFtsResults(results);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleMoveToProcessing = async (hash: string) => {
    await window.electronAPI.moveToProcessing(hash);
    window.electronAPI.getDocuments().then(setDocuments);
    setSelectedDoc(null);
  };

  const handleReanalyzeStart = (id: number) => {
    setReanalyzingDocIds(prev => new Set(prev).add(id));
  };

  const handleReanalyzeEnd = (id: number) => {
    setReanalyzingDocIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const handleRunCrawler = async () => {
    setCrawlerRunning(true);
    await (window.electronAPI as any).runCrawler();
  };

  const handleSaveAndMove = async (tags: string[], metadata: any) => {
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

  const filteredDocuments = ftsResults !== null
    ? ftsResults
    : documents.filter(doc => {
        if (!settings) return true;
        if (currentView === 'inbox') return doc.last_path.startsWith(settings.INBOX_PATH);
        if (currentView === 'sort') return doc.last_path.startsWith(settings.PROCESSING_PATH);
        if (currentView === 'archive') return doc.last_path.startsWith(settings.ARCHIVE_PATH);
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
    <div className="flex h-screen bg-bg-app text-text-main font-sans overflow-hidden transition-colors duration-300">
      {/* Global Navigation */}
      <NavSidebar
        currentView={currentView}
        onViewChange={(v) => {
          setCurrentView(v);
          setSelectedDoc(null);
          setSearchQuery('');
          setFtsResults(null);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        inboxCount={inboxCount}
        sortCount={sortCount}
        archiveCount={archiveCount}
        ollamaStatus={ollamaStatus}
        crawlerRunning={crawlerRunning}
        onRunCrawler={handleRunCrawler}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-bg-surface border-b border-border-base px-8 py-5 flex items-center justify-between shadow-sm z-10 transition-colors duration-300">
          <div>
            <h1 className="text-2xl font-bold text-text-main">{getTitle()}</h1>
            {searchQuery ? (
              <p className="text-xs text-accent-primary mt-1">
                {filteredDocuments.length} Ergebnisse aus allen Bereichen
              </p>
            ) : (
              <div className="flex items-center text-[11px] text-text-subtle mt-1 font-mono bg-bg-app px-2 py-0.5 rounded border border-border-base w-fit">
                <Folder className="w-3 h-3 mr-1" />
                {getCurrentPath()}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle group-focus-within:text-accent-primary transition-colors" />
              <input 
                type="text"
                placeholder="Volltextsuche..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-bg-app border-border-base border focus:bg-bg-surface focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/10 rounded-xl outline-none w-64 transition-all text-text-main"
              />
            </div>
            <button className="p-2 hover:bg-bg-app rounded-lg text-text-subtle transition-colors" title="Filter">
              <Filter className="w-5 h-5" />
            </button>
            <button 
              onClick={() => window.electronAPI.getDocuments().then(docs => setDocuments(docs))}
              className="p-2 hover:bg-bg-app rounded-lg text-text-subtle hover:text-accent-primary transition-colors" 
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
              reanalyzingDocIds={reanalyzingDocIds}
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
        <div className="w-[450px] border-l border-border-base bg-bg-surface shadow-2xl flex flex-col z-20 animate-in slide-in-from-right duration-300">
          <Sidebar
            document={selectedDoc}
            isInbox={currentView === 'inbox'}
            isArchive={currentView === 'archive'}
            onSave={handleSaveAndMove}
            onMoveToProcessing={() => handleMoveToProcessing(selectedDoc.hash)}
            onOpenPdf={() => setPdfViewerDoc(selectedDoc)}
            onClose={() => setSelectedDoc(null)}
            onReanalyzeStart={handleReanalyzeStart}
            onReanalyzeEnd={handleReanalyzeEnd}
          />
        </div>
      )}
      {pdfViewerDoc && (
        <PdfViewerModal
          filePath={pdfViewerDoc.last_path}
          fileName={pdfViewerDoc.last_path.split(/[\\/]/).pop() ?? ''}
          onClose={() => setPdfViewerDoc(null)}
        />
      )}
    </div>
  )
}

export default App

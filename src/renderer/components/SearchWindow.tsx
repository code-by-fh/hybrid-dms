import React, { useState, useEffect, useRef } from 'react';
import { Search, FileText } from 'lucide-react';

interface SearchResult {
  uuid: string;
  last_path: string;
  tags: string;
  metadata: string;
  snippet: string;
}

export const SearchWindow: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await (window.electronAPI as any).searchDocuments(query);
        setResults(res);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const handleOpen = (result: SearchResult) => {
    (window.electronAPI as any).openDocumentFromTray(result.uuid);
  };

  const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

  const meta = (r: SearchResult) => {
    try {
      const m = JSON.parse(r.metadata || '{}');
      return [m.date, m.sender, m.docType].filter(Boolean).join(' · ');
    } catch { return ''; }
  };

  return (
    <div className="flex flex-col h-screen bg-bg-surface text-text-main font-sans select-none">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-base bg-bg-app">
        <Search className="w-4 h-4 text-text-subtle shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Dokument suchen…"
          className="flex-1 bg-transparent outline-none text-text-main placeholder:text-text-subtle text-sm"
          onKeyDown={e => { if (e.key === 'Escape') window.close(); }}
        />
        {loading && <div className="w-3 h-3 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />}
      </div>

      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && query.trim().length >= 2 && !loading && (
          <p className="text-center text-text-subtle text-xs py-8">Keine Ergebnisse</p>
        )}
        {results.map(r => (
          <button
            key={r.uuid}
            onClick={() => handleOpen(r)}
            className="w-full text-left px-3 py-2.5 hover:bg-bg-app border-b border-border-base last:border-0 transition-colors"
          >
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-accent-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{fileName(r.last_path)}</p>
                {meta(r) && <p className="text-xs text-text-subtle truncate">{meta(r)}</p>}
                {r.snippet && (
                  <p
                    className="text-xs text-text-subtle mt-0.5 line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: r.snippet }}
                  />
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

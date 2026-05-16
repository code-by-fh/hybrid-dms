import React, { useState, useEffect, useCallback } from 'react';
import { Folder } from 'lucide-react';

interface StepFolderPathsProps {
  initialInbox: string;
  initialSortieren: string;
  initialArchiv: string;
  onChange: (data: { inbox: string; sortieren: string; archiv: string }) => void;
  onValidChange: (valid: boolean) => void;
}

export const StepFolderPaths: React.FC<StepFolderPathsProps> = ({
  initialInbox,
  initialSortieren,
  initialArchiv,
  onChange,
  onValidChange,
}) => {
  const [inbox, setInbox] = useState(initialInbox);
  const [sortieren, setSortieren] = useState(initialSortieren);
  const [archiv, setArchiv] = useState(initialArchiv);

  // Compute validity: all three paths must be non-empty
  const computeValid = useCallback((): boolean => {
    return inbox.trim().length > 0 && sortieren.trim().length > 0 && archiv.trim().length > 0;
  }, [inbox, sortieren, archiv]);

  // Notify parent of changes
  const notifyChange = useCallback(
    (inboxPath: string, sortierenPath: string, archivPath: string) => {
      onChange({ inbox: inboxPath, sortieren: sortierenPath, archiv: archivPath });
      const isValid = inboxPath.trim().length > 0 && sortierenPath.trim().length > 0 && archivPath.trim().length > 0;
      onValidChange(isValid);
    },
    [onChange, onValidChange],
  );

  // Initial validity signal
  useEffect(() => {
    onValidChange(computeValid());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle folder picker for Inbox
  const handlePickInbox = async () => {
    try {
      const result: string | null = await window.electronAPI.openDirectoryDialog();
      if (result) {
        setInbox(result);
        notifyChange(result, sortieren, archiv);
      }
    } catch {
      // Silently ignore — user cancelled or dialog failed
    }
  };

  // Handle folder picker for Sortieren
  const handlePickSortieren = async () => {
    try {
      const result: string | null = await window.electronAPI.openDirectoryDialog();
      if (result) {
        setSortieren(result);
        notifyChange(inbox, result, archiv);
      }
    } catch {
      // Silently ignore — user cancelled or dialog failed
    }
  };

  // Handle folder picker for Archiv
  const handlePickArchiv = async () => {
    try {
      const result: string | null = await window.electronAPI.openDirectoryDialog();
      if (result) {
        setArchiv(result);
        notifyChange(inbox, sortieren, result);
      }
    } catch {
      // Silently ignore — user cancelled or dialog failed
    }
  };

  const folderRowClass = 'flex flex-col gap-2';
  const labelClass = 'text-xs font-semibold text-text-main';
  const rowContainerClass = 'flex items-center gap-2';
  const inputClass = 'flex-1 px-4 py-2 border border-border-base rounded-lg bg-bg-surface text-text-main outline-none text-sm font-mono';
  const buttonClass = 'px-3 py-2 bg-bg-app hover:bg-border-base border border-border-base rounded-lg transition-colors flex items-center gap-2';

  return (
    <div className="flex flex-col gap-6">
      {/* Inbox */}
      <div className={folderRowClass}>
        <label className={labelClass}>Inbox</label>
        <span className="text-xs text-text-subtle">Neue PDFs werden hier automatisch erkannt.</span>
        <div className={rowContainerClass}>
          <input type="text" readOnly value={inbox} className={inputClass} />
          <button onClick={handlePickInbox} className={buttonClass}>
            <Folder className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sortieren */}
      <div className={folderRowClass}>
        <label className={labelClass}>Sortieren</label>
        <span className="text-xs text-text-subtle">Zwischenspeicher vor der manuellen Prüfung.</span>
        <div className={rowContainerClass}>
          <input type="text" readOnly value={sortieren} className={inputClass} />
          <button onClick={handlePickSortieren} className={buttonClass}>
            <Folder className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Archiv */}
      <div className={folderRowClass}>
        <label className={labelClass}>Archiv</label>
        <span className="text-xs text-text-subtle">Wurzelverzeichnis des digitalen Archivs.</span>
        <div className={rowContainerClass}>
          <input type="text" readOnly value={archiv} className={inputClass} />
          <button onClick={handlePickArchiv} className={buttonClass}>
            <Folder className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

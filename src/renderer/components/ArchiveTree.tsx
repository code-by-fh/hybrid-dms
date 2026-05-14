import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder, FileText, Pencil, Check, X as XIcon } from 'lucide-react';
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DocumentType } from '../../App';

interface TreeNode {
  name: string;
  path: string;
  absolutePath?: string;
  isDirectory: boolean;
  children: { [key: string]: TreeNode };
  document?: DocumentType;
}

interface ArchiveTreeProps {
  documents: DocumentType[];
  archivePath: string;
  onSelectDocument: (doc: DocumentType) => void;
  selectedDoc: DocumentType | null;
}

// --- Draggable File Item ---
interface DraggableFileItemProps {
  node: TreeNode;
  level: number;
  isSelected: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect: (doc: DocumentType) => void;
  onRenameStart: (node: TreeNode) => void;
  onRenameChange: (val: string) => void;
  onRenameConfirm: (node: TreeNode) => void;
  onRenameCancel: () => void;
}

const DraggableFileItem: React.FC<DraggableFileItemProps> = ({
  node,
  level,
  isSelected,
  isRenaming,
  renameValue,
  onSelect,
  onRenameStart,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: node.document!.hash,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ paddingLeft: `${level * 1.5 + 1.75}rem`, opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-center py-1.5 px-2 rounded-md transition-colors group ${
        isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
      }`}
    >
      {/* Drag handle on the icon */}
      <span
        {...listeners}
        {...attributes}
        className="cursor-grab mr-2 flex-shrink-0 focus:outline-none"
        title="Ziehen zum Verschieben"
      >
        <FileText className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
      </span>

      {isRenaming ? (
        <div className="flex items-center flex-1 gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameConfirm(node);
              if (e.key === 'Escape') onRenameCancel();
            }}
            className="flex-1 text-sm border border-blue-400 rounded px-1.5 py-0.5 outline-none bg-white"
          />
          <button
            onClick={() => onRenameConfirm(node)}
            className="text-green-600 hover:text-green-700 p-0.5"
            title="Bestätigen"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={onRenameCancel}
            className="text-gray-400 hover:text-red-500 p-0.5"
            title="Abbrechen"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <span
            className={`text-sm flex-1 cursor-pointer truncate ${
              isSelected ? 'font-semibold text-blue-700' : 'text-gray-600'
            }`}
            onClick={() => node.document && onSelect(node.document)}
            title={node.name}
          >
            {node.name}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRenameStart(node);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-blue-600 transition-opacity ml-1 flex-shrink-0"
            title="Umbenennen"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
};

// --- Droppable Folder ---
interface DroppableFolderProps {
  node: TreeNode;
  level: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const DroppableFolder: React.FC<DroppableFolderProps> = ({
  node,
  level,
  isExpanded,
  onToggle,
  children,
}) => {
  const droppableId = node.absolutePath || node.path;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div
      ref={setNodeRef}
      className={`select-none rounded-md transition-colors ${
        isOver ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset' : ''
      }`}
    >
      <div
        className="flex items-center py-1.5 px-2 hover:bg-gray-100 cursor-pointer rounded-md"
        style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
        onClick={onToggle}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500 mr-1 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 mr-1 flex-shrink-0" />
        )}
        <Folder
          className={`w-4 h-4 mr-2 flex-shrink-0 ${isOver ? 'text-blue-500' : 'text-yellow-500'}`}
        />
        <span className="text-sm font-medium text-gray-700 truncate">{node.name}</span>
      </div>
      {isExpanded && <div className="flex flex-col">{children}</div>}
    </div>
  );
};

// --- Main ArchiveTree Component ---
export const ArchiveTree: React.FC<ArchiveTreeProps> = ({
  documents,
  archivePath,
  onSelectDocument,
  selectedDoc,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']));
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Normalize archivePath to use forward slashes for consistent comparison
  const normalizedArchivePath = archivePath.replace(/\\/g, '/');

  // Build tree from documents
  const tree = useMemo(() => {
    const root: TreeNode = { name: 'Root', path: '/', isDirectory: true, children: {} };

    documents.forEach((doc) => {
      const normalizedDocPath = doc.last_path.replace(/\\/g, '/');
      if (!normalizedDocPath.startsWith(normalizedArchivePath)) return;

      // Get relative path
      let relativePath = normalizedDocPath.substring(normalizedArchivePath.length);
      if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
        relativePath = relativePath.substring(1);
      }

      const parts = relativePath.split(/[/\\]/);
      let current = root;
      let currentRelPath = '';

      parts.forEach((part, index) => {
        currentRelPath += '/' + part;
        const isFile = index === parts.length - 1;

        if (!current.children[part]) {
          // Build absolute path for drag-and-drop targets
          const absolutePath = archivePath.replace(/\\/g, '/') + currentRelPath;
          current.children[part] = {
            name: part,
            path: currentRelPath,
            absolutePath: absolutePath,
            isDirectory: !isFile,
            children: {},
            document: isFile ? doc : undefined,
          };
        }
        current = current.children[part];
      });
    });

    return root;
  }, [documents, archivePath, normalizedArchivePath]);

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const handleRenameStart = (node: TreeNode) => {
    setRenamingPath(node.path);
    setRenameValue(node.name);
  };

  const handleRenameConfirm = async (node: TreeNode) => {
    if (!node.document || !renameValue.trim() || renameValue.trim() === node.name) {
      setRenamingPath(null);
      return;
    }
    try {
      await window.electronAPI.renameFile({
        hash: node.document.hash,
        newName: renameValue.trim(),
      });
    } catch (e) {
      console.error('Rename failed:', e);
    } finally {
      setRenamingPath(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    try {
      await window.electronAPI.moveFile({
        hash: active.id as string,
        targetDir: over.id as string,
      });
    } catch (e) {
      console.error('Move file failed:', e);
    }
  };

  const renderNode = (node: TreeNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.path);

    // Skip the dummy root itself, just render children
    if (node.path === '/') {
      return Object.values(node.children).map((child) => renderNode(child, 0));
    }

    if (node.isDirectory) {
      return (
        <DroppableFolder
          key={node.path}
          node={node}
          level={level}
          isExpanded={isExpanded}
          onToggle={() => toggleFolder(node.path)}
        >
          {Object.values(node.children).map((child) => renderNode(child, level + 1))}
        </DroppableFolder>
      );
    }

    // File node
    const isSelected = selectedDoc?.hash === node.document?.hash;
    const isRenaming = renamingPath === node.path;

    return (
      <DraggableFileItem
        key={node.path}
        node={node}
        level={level}
        isSelected={isSelected}
        isRenaming={isRenaming}
        renameValue={renameValue}
        onSelect={onSelectDocument}
        onRenameStart={handleRenameStart}
        onRenameChange={setRenameValue}
        onRenameConfirm={handleRenameConfirm}
        onRenameCancel={() => setRenamingPath(null)}
      />
    );
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="bg-white rounded-xl shadow-sm border overflow-auto p-4 h-full">
        <div className="flex flex-col">{renderNode(tree)}</div>
        {Object.keys(tree.children).length === 0 && (
          <div className="text-center py-10 text-gray-500 text-sm">
            Keine Dokumente im Archiv gefunden.
          </div>
        )}
      </div>
    </DndContext>
  );
};

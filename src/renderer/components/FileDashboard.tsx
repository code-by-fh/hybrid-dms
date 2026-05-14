import React from 'react';
import type { DocumentType } from '../../App';
import { File, Clock, Tag as TagIcon, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface FileDashboardProps {
  documents: DocumentType[];
  selectedDoc: DocumentType | null;
  onSelect: (doc: DocumentType) => void;
  isInbox?: boolean;
}

export const FileDashboard: React.FC<FileDashboardProps> = ({ documents, selectedDoc, onSelect }) => {
  return (
    <div className="bg-white rounded-lg shadow border overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b text-gray-600 text-sm">
            <th className="py-3 px-4 font-semibold">File</th>
            <th className="py-3 px-4 font-semibold">Status</th>
            <th className="py-3 px-4 font-semibold">Tags</th>
            <th className="py-3 px-4 font-semibold">Added</th>
          </tr>
        </thead>
        <tbody>
          {documents.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-12 text-center text-gray-500">
                <div className="flex flex-col items-center justify-center">
                  <File className="w-12 h-12 text-gray-300 mb-3" />
                  <p>No documents found in Inbox.</p>
                </div>
              </td>
            </tr>
          ) : (
            documents.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id;
              const tagsArray = doc.tags ? JSON.parse(doc.tags) : [];
              const isNew = doc.status === 'new';
              const isOcrProcessing = doc.status === 'ocr_processing';
              const isAiProcessing = doc.status === 'ai_processing';
              const isError = doc.status === 'error';
              const isProcessing = isOcrProcessing || isAiProcessing;

              return (
                <tr 
                  key={doc.id} 
                  onClick={() => onSelect(doc)}
                  className={`border-b last:border-b-0 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded ${isNew ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                        <File className="w-5 h-5" />
                      </div>
                      <span className="font-medium truncate max-w-[200px]" title={doc.last_path}>
                        {doc.last_path.split(/[\\/]/).pop()}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {isOcrProcessing ? (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800 animate-pulse">
                        <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> OCR Scanning
                      </span>
                    ) : isAiProcessing ? (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">
                        <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> AI Analyzing
                      </span>
                    ) : isError ? (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                        <AlertCircle className="w-3 h-3 mr-1" /> Fehler
                      </span>
                    ) : isNew ? (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                        <AlertCircle className="w-3 h-3 mr-1" /> Needs Action
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" /> Processed
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 flex-wrap">
                      {tagsArray.slice(0, 2).map((tag: string, i: number) => (
                         <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 border">
                           <TagIcon className="w-3 h-3 mr-1" /> {tag}
                         </span>
                      ))}
                      {tagsArray.length > 2 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 border">
                          +{tagsArray.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-sm">
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-1.5" />
                      {new Date(doc.indexed_at).toLocaleDateString()}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

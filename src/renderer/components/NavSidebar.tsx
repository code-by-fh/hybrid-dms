import React from 'react';
import { Inbox, LayoutGrid, Archive, Settings } from 'lucide-react';

export type ViewType = 'inbox' | 'sort' | 'archive';

interface NavSidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onOpenSettings: () => void;
  inboxCount: number;
  sortCount: number;
  archiveCount: number;
  ollamaStatus: boolean;
}

export const NavSidebar: React.FC<NavSidebarProps> = ({ currentView, onViewChange, onOpenSettings, inboxCount, sortCount, archiveCount, ollamaStatus }) => {
  const navItems = [
    { id: 'inbox', label: 'Inbox', icon: Inbox, count: inboxCount },
    { id: 'sort', label: 'Sortieren', icon: LayoutGrid, count: sortCount },
    { id: 'archive', label: 'Archiv', icon: Archive, count: archiveCount },
  ];


  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-full shadow-2xl">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center">
          <LayoutGrid className="w-6 h-6 mr-2 text-blue-400" />
          Hybrid DMS
        </h1>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id as ViewType)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 group ${
              currentView === item.id 
                ? 'bg-blue-600 text-white shadow-lg' 
                : 'hover:bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <div className="flex items-center">
              <item.icon className={`w-5 h-5 mr-3 ${currentView === item.id ? 'text-white' : 'group-hover:text-blue-400'}`} />
              <span className="font-medium">{item.label}</span>
            </div>
            {item.count !== undefined && item.count > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                currentView === item.id ? 'bg-white text-blue-600' : 'bg-blue-500 text-white'
              }`}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <button 
          onClick={onOpenSettings}
          className="w-full flex items-center px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-all group"
        >
          <Settings className="w-5 h-5 mr-3 group-hover:rotate-45 transition-transform duration-300" />
          <span className="font-medium">Einstellungen</span>
        </button>
        <div className="mt-4 px-4 py-2 bg-gray-800/50 rounded-lg">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Ollama KI Status</p>
          <div className="flex items-center mt-1">
            <div className={`w-2 h-2 rounded-full mr-2 ${ollamaStatus ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></div>
            <span className="text-xs text-gray-400">{ollamaStatus ? 'KI Verbunden' : 'KI Offline'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

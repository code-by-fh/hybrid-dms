import React from 'react';
import { Inbox, LayoutGrid, Archive, Settings, Sun, Moon, RefreshCw } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export type ViewType = 'inbox' | 'sort' | 'archive';

interface NavSidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onOpenSettings: () => void;
  inboxCount: number;
  sortCount: number;
  archiveCount: number;
  ollamaStatus: boolean;
  crawlerRunning: boolean;
  onRunCrawler: () => void;
}

export const NavSidebar: React.FC<NavSidebarProps> = ({ currentView, onViewChange, onOpenSettings, inboxCount, sortCount, archiveCount, ollamaStatus, crawlerRunning, onRunCrawler }) => {
  const { theme, toggleTheme } = useTheme();
  const navItems = [
    { id: 'inbox', label: 'Inbox', icon: Inbox, count: inboxCount },
    { id: 'sort', label: 'Sortieren', icon: LayoutGrid, count: sortCount },
    { id: 'archive', label: 'Archiv', icon: Archive, count: archiveCount },
  ];


  return (
    <div className="w-64 bg-bg-surface border-r border-border-base flex flex-col h-full shadow-xl transition-colors duration-300">
      <div className="p-6 border-b border-border-base">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center">
          <LayoutGrid className="w-6 h-6 mr-2 text-accent-primary" />
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
                ? 'bg-accent-primary text-white shadow-lg' 
                : 'hover:bg-bg-app text-text-subtle hover:text-text-main'
            }`}
          >
            <div className="flex items-center">
              <item.icon className={`w-5 h-5 mr-3 ${currentView === item.id ? 'text-white' : 'group-hover:text-accent-primary'}`} />
              <span className="font-medium">{item.label}</span>
            </div>
            {item.count !== undefined && item.count > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                currentView === item.id ? 'bg-white text-accent-primary' : 'bg-accent-primary text-white'
              }`}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-border-base space-y-2">
        <button 
          onClick={toggleTheme}
          className="w-full flex items-center px-4 py-3 rounded-lg hover:bg-bg-app text-text-subtle hover:text-text-main transition-all group"
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5 mr-3 group-hover:text-indigo-500 transition-colors" />
          ) : (
            <Sun className="w-5 h-5 mr-3 group-hover:text-yellow-400 transition-colors" />
          )}
          <span className="font-medium">Design wechseln</span>
        </button>

        <button
          onClick={onRunCrawler}
          disabled={crawlerRunning}
          className="w-full flex items-center px-4 py-3 rounded-lg hover:bg-bg-app text-text-subtle hover:text-text-main transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-5 h-5 mr-3 flex-shrink-0 ${crawlerRunning ? 'animate-spin text-accent-primary' : 'group-hover:text-accent-primary'}`} />
          <div className="flex flex-col items-start">
            <span className="font-medium leading-tight">{crawlerRunning ? 'Läuft…' : 'Archiv scannen'}</span>
            <span className="text-[10px] leading-tight mt-0.5 opacity-60">Archiv auf neue Dateien prüfen</span>
          </div>
        </button>

        <button
          onClick={onOpenSettings}
          className="w-full flex items-center px-4 py-3 rounded-lg hover:bg-bg-app text-text-subtle hover:text-text-main transition-all group"
        >
          <Settings className="w-5 h-5 mr-3 group-hover:rotate-45 transition-transform duration-300" />
          <span className="font-medium">Einstellungen</span>
        </button>
        
        <div className="mt-4 px-4 py-2 bg-bg-app/50 rounded-lg border border-border-base">
          <p className="text-[10px] text-text-subtle uppercase tracking-wider font-bold">KI Status</p>
          <div className="flex items-center mt-1">
            <div className={`w-2 h-2 rounded-full mr-2 ${ollamaStatus ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></div>
            <span className="text-xs text-text-subtle">{ollamaStatus ? 'KI Verbunden' : 'KI Offline'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

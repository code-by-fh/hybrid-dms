import React from 'react';
import ReactDOM from 'react-dom/client';
import { SearchWindow } from './renderer/components/SearchWindow';
import './index.css';

ReactDOM.createRoot(document.getElementById('search-root')!).render(
  <React.StrictMode>
    <SearchWindow />
  </React.StrictMode>
);

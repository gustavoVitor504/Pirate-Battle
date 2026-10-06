import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { audio } from './game/audio/AudioManager';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Sounds download in the background from the start, so menus and the first match have them.
audio.preload();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

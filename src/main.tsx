import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Fonte empacotada junto: o aplicativo abre igual sem internet e sem CDN.
import '@fontsource-variable/inter/index.css';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado em index.html.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Ponte entre o processo principal e a interface.
 *
 * Expõe o mínimo necessário: saber que estamos no aplicativo de computador e
 * receber os comandos do menu. Nada de Node, nada de sistema de arquivos — se
 * a página for comprometida, não há o que alcançar daqui.
 *
 * CommonJS de propósito: preloads em modo `sandbox` não aceitam ESM.
 */

const { contextBridge, ipcRenderer } = require('electron');

/** @type {Set<(path: string) => void>} */
const navegarOuvintes = new Set();
/** @type {Set<() => void>} */
const atualizarOuvintes = new Set();

ipcRenderer.on('nosso-lar:navegar', (_event, path) => {
  if (typeof path === 'string') {
    for (const ouvinte of navegarOuvintes) ouvinte(path);
  }
});

ipcRenderer.on('nosso-lar:atualizar', () => {
  for (const ouvinte of atualizarOuvintes) ouvinte();
});

contextBridge.exposeInMainWorld('nossoLar', {
  /** Marca que estamos dentro do aplicativo de computador. */
  isDesktop: true,

  /** 'win32' | 'darwin' | 'linux' */
  platform: process.platform,

  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },

  /** Menu "Ir para" → troca de rota sem recarregar a página. */
  onNavigate(callback) {
    if (typeof callback !== 'function') return () => {};
    navegarOuvintes.add(callback);
    return () => navegarOuvintes.delete(callback);
  },

  /** Menu "Atualizar dados" (Ctrl/Cmd+R) → recarrega do banco, não a janela. */
  onRefresh(callback) {
    if (typeof callback !== 'function') return () => {};
    atualizarOuvintes.add(callback);
    return () => atualizarOuvintes.delete(callback);
  },
});

/**
 * Nosso Lar — processo principal do aplicativo de computador.
 *
 * Entrega a mesma interface web dentro de uma janela nativa, com as travas de
 * segurança do Electron ligadas:
 *
 *  · `contextIsolation` e `sandbox` ativos, `nodeIntegration` desligado — a
 *    página não alcança o Node.
 *  · Os arquivos são servidos por um protocolo próprio (`app://`) em vez de
 *    `file://`. Isso dá uma origem de verdade, então `localStorage` persiste,
 *    o roteamento por caminho funciona e o Supabase aceita as requisições.
 *  · Content-Security-Policy restritiva, com conexão liberada apenas para o
 *    Supabase.
 *  · Navegação externa e `window.open` saem para o navegador padrão.
 *
 * CommonJS de propósito (`.cjs` porque o pacote é `type: module`): o carregador
 * ESM do Electron 33 ainda tropeça ao importar o módulo `electron`.
 */

const { app, BrowserWindow, Menu, dialog, net, protocol, shell } = require('electron');
const { readFile, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { extname, join, normalize, resolve, sep } = require('node:path');
const { pathToFileURL } = require('node:url');

const here = __dirname;
const projectRoot = resolve(here, '..');
const distDir = join(projectRoot, 'dist');

// `npm run desktop:dev` passa --dev; a variável de ambiente também vale.
const isDev =
  !app.isPackaged && (process.argv.includes('--dev') || process.env.NOSSO_LAR_DEV === '1');
const devServerUrl = process.env.NOSSO_LAR_DEV_URL ?? 'http://localhost:5173';
const appOrigin = 'app://local';

/** Endereços do Supabase liberados na CSP (cobre qualquer projeto hospedado). */
const supabaseHosts =
  process.env.NOSSO_LAR_SUPABASE_HOSTS ??
  'https://*.supabase.co wss://*.supabase.co https://*.supabase.in wss://*.supabase.in';

const CSP = [
  "default-src 'self'",
  // O bundle do Vite injeta estilos em tempo de execução.
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${supabaseHosts}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/* ─────────────────────── Posição e tamanho da janela ────────────────────── */

const stateFile = () => join(app.getPath('userData'), 'window-state.json');

async function loadWindowState() {
  try {
    const raw = await readFile(stateFile(), 'utf8');
    const state = JSON.parse(raw);
    if (typeof state?.width === 'number' && typeof state?.height === 'number') return state;
  } catch {
    /* primeira execução, ou arquivo ilegível */
  }
  return { width: 1280, height: 860 };
}

async function saveWindowState(window) {
  if (!window || window.isDestroyed()) return;
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
  try {
    await writeFile(
      stateFile(),
      JSON.stringify({ ...bounds, maximized: window.isMaximized() }, null, 2),
      'utf8',
    );
  } catch {
    /* não é motivo para incomodar quem está usando */
  }
}

/* ───────────────── Protocolo app:// servindo a pasta dist ───────────────── */

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);

    // Impede sair da pasta dist por "../" no caminho.
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    let target = join(distDir, relative);
    if (!target.startsWith(distDir + sep) && target !== distDir) {
      return new Response('Caminho inválido.', { status: 403 });
    }

    // Rota do React Router: sem extensão e sem arquivo, devolve o index.
    if (!extname(target) || !existsSync(target)) {
      target = join(distDir, 'index.html');
    }

    if (!existsSync(target)) {
      return new Response(
        'Build não encontrado. Rode "npm run build" antes de abrir o aplicativo.',
        { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } },
      );
    }

    const response = await net.fetch(pathToFileURL(target).toString());
    const headers = new Headers(response.headers);
    headers.set('content-type', MIME[extname(target)] ?? 'application/octet-stream');
    headers.set('content-security-policy', CSP);
    headers.set('x-content-type-options', 'nosniff');

    return new Response(response.body, { status: 200, headers });
  });
}

/* ────────────────────────────── Menu ────────────────────────────────────── */

function buildMenu(window) {
  const go = (path) => () => {
    window?.webContents.send('nosso-lar:navegar', path);
  };

  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: `Sobre o ${app.name}` },
              { type: 'separator' },
              { role: 'hide', label: `Ocultar ${app.name}` },
              { role: 'hideOthers', label: 'Ocultar outros' },
              { role: 'unhide', label: 'Mostrar tudo' },
              { type: 'separator' },
              { role: 'quit', label: `Encerrar ${app.name}` },
            ],
          },
        ]
      : []),
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Atualizar dados',
          accelerator: 'CmdOrCtrl+R',
          click: () => window?.webContents.send('nosso-lar:atualizar'),
        },
        { type: 'separator' },
        process.platform === 'darwin'
          ? { role: 'close', label: 'Fechar janela' }
          : { role: 'quit', label: 'Sair' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
    {
      label: 'Ir para',
      submenu: [
        { label: 'Painel', accelerator: 'CmdOrCtrl+1', click: go('/') },
        { label: 'Checklist', accelerator: 'CmdOrCtrl+2', click: go('/checklist') },
        { label: 'Compras', accelerator: 'CmdOrCtrl+3', click: go('/compras') },
        { label: 'Itens pendentes', accelerator: 'CmdOrCtrl+4', click: go('/pendentes') },
        { label: 'Financeiro', accelerator: 'CmdOrCtrl+5', click: go('/financeiro') },
        { label: 'Relatórios', accelerator: 'CmdOrCtrl+6', click: go('/relatorios') },
        { label: 'Configurações', accelerator: 'CmdOrCtrl+,', click: go('/configuracoes') },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { role: 'resetZoom', label: 'Tamanho original' },
        { role: 'zoomIn', label: 'Aumentar' },
        { role: 'zoomOut', label: 'Diminuir' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        ...(isDev ? [{ role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' }] : []),
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre o Nosso Lar',
          click: () => {
            dialog.showMessageBox(window, {
              type: 'info',
              title: 'Nosso Lar',
              message: `Nosso Lar ${app.getVersion()}`,
              detail:
                'Nosso enxoval, nossos planos.\n\n' +
                'Os dados ficam no Supabase do casal e são sincronizados entre os dispositivos.\n\n' +
                `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
              buttons: ['Fechar'],
            });
          },
        },
        {
          label: 'Pasta de dados do aplicativo',
          click: () => shell.openPath(app.getPath('userData')),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ───────────────────────────── A janela ─────────────────────────────────── */

async function createWindow() {
  const state = await loadWindowState();

  const window = new BrowserWindow({
    ...state,
    minWidth: 380,
    minHeight: 560,
    show: false,
    backgroundColor: '#EFECE4',
    title: 'Nosso Lar',
    icon: join(projectRoot, 'build', 'icon.png'),
    autoHideMenuBar: process.platform !== 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });

  if (state.maximized) window.maximize();

  window.once('ready-to-show', () => window.show());

  // Links externos abrem no navegador padrão, nunca dentro do aplicativo.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? devServerUrl : appOrigin;
    if (!url.startsWith(allowed)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  // Nenhuma permissão do navegador é necessária neste aplicativo.
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  let saveTimer = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saveWindowState(window), 400);
  };
  window.on('resize', scheduleSave);
  window.on('move', scheduleSave);
  window.on('close', () => void saveWindowState(window));

  window.webContents.on('render-process-gone', (_event, details) => {
    dialog.showErrorBox(
      'O aplicativo parou',
      `A janela foi encerrada (${details.reason}). Abra o Nosso Lar novamente — ` +
        'seus dados estão salvos no banco, nada foi perdido.',
    );
  });

  buildMenu(window);

  // `npm run desktop:verify`: abre, espera a interface assentar, confere e sai.
  // Serve para validar o empacotamento em CI, sem ninguém precisar clicar.
  if (!app.isPackaged && process.argv.includes('--smoke')) {
    window.webContents.once('did-finish-load', async () => {
      const sonda = `(() => ({
        montou: !!document.querySelector('#root')?.firstElementChild,
        titulo: document.title,
        origem: location.origin,
        ponte: window.nossoLar?.isDesktop === true,
        naApp: !!document.querySelector('nav[aria-label=\\"Seções do sistema\\"], main'),
        texto: (document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
      }))()`;

      try {
        let report = await window.webContents.executeJavaScript(sonda);

        // A primeira pintura costuma ser o estado de carregamento. No primeiro
        // uso de um aparelho há ainda a sessão a abrir e o espaço a nascer,
        // com as 208 linhas do enxoval — por isso o orçamento é generoso.
        const etapas = [];
        for (let tentativa = 0; tentativa < 60 && /Carregando|Verificando|Preparando|Abrindo/i.test(report.texto); tentativa += 1) {
          if (etapas[etapas.length - 1] !== report.texto) etapas.push(report.texto);
          await new Promise((resolve) => setTimeout(resolve, 500));
          report = await window.webContents.executeJavaScript(sonda);
        }

        // Antes bastava a janela montar algo: um ecrã de erro passava como
        // sucesso. Agora é preciso ter chegado ao painel.
        const ok =
          report.montou && report.ponte && report.origem === appOrigin && report.naApp;
        console.log(JSON.stringify({ ok, etapas, ...report }, null, 2));
        app.exit(ok ? 0 : 1);
      } catch (error) {
        console.error('Falha na verificação:', error);
        app.exit(1);
      }
    });
  }

  if (isDev) {
    await window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    await window.loadURL(`${appOrigin}/index.html`);
  }

  return window;
}

/* ─────────────────────────── Ciclo de vida ──────────────────────────────── */

// Uma instância só: abrir de novo traz a janela existente para a frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('br.com.nossolar.app'); // agrupa na barra de tarefas do Windows
    registerAppProtocol();
    await createWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
  });

  app.on('window-all-closed', () => {
    // No macOS o aplicativo segue ativo até o usuário encerrar de fato.
    if (process.platform !== 'darwin') app.quit();
  });
}

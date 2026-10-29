#!/usr/bin/env node
/**
 * Lançador do aplicativo de computador.
 *
 * Existe por um motivo prático: terminais embutidos em editores (o do VS Code,
 * por exemplo) deixam `ELECTRON_RUN_AS_NODE=1` no ambiente. Com essa variável
 * ligada, o binário do Electron roda como se fosse o Node puro — a janela nunca
 * abre e o erro que aparece ("Cannot read properties of undefined") não diz o
 * que está acontecendo. Aqui a variável é removida antes de iniciar.
 *
 * Uso: node scripts/desktop.mjs [--dev] [--smoke]
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** Caminho do executável do Electron. */
let electronPath;
try {
  electronPath = require('electron');
} catch {
  console.error('Electron não está instalado. Rode "npm install" antes.');
  process.exit(1);
}

if (typeof electronPath !== 'string' || !existsSync(electronPath)) {
  console.error(
    'Binário do Electron não encontrado.\n' +
      'Se a instalação foi bloqueada, rode: npm approve-scripts electron && npm install',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const isDev = args.includes('--dev');

if (!isDev && !existsSync(join(root, 'dist', 'index.html'))) {
  console.error('Build não encontrado. Rode "npm run build" antes, ou use "npm run desktop:dev".');
  process.exit(1);
}

// A limpeza que justifica este arquivo.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [root, ...args], {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('error', (error) => {
  console.error('Não foi possível iniciar o Electron:', error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Electron encerrado pelo sinal ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

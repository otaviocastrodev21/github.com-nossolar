#!/usr/bin/env node
/**
 * Gera os ícones do aplicativo a partir de uma única fonte vetorial.
 *
 *   public/icons/*.png      ícones do PWA (inclui a variante "maskable")
 *   public/favicon.svg      favicon vetorial
 *   public/apple-touch-icon.png
 *   build/icon.png          1024×1024, base do empacotador
 *   build/icon.ico          Windows (16…256 em um só arquivo)
 *   build/icon.icns         macOS (128…1024)
 *
 * Usa @resvg/resvg-wasm: rasterização por WebAssembly, sem compilador nativo,
 * então o comando roda igual em Windows, macOS e Linux.
 *
 * Uso: node scripts/gen-icons.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ───────────────────────────── A marca ──────────────────────────────────── */

const CREAM = '#F7F6F2';
const GREIGE = '#D6D0C6';
const WOOD = '#C6A77D';
const INK = '#242424';
const OLIVE = '#5C643F';

/**
 * @param {object} options
 * @param {'rounded'|'full'} options.shape  recorte do fundo
 * @param {number} options.inset            folga do desenho, em fração do lado
 */
function brandSvg({ shape = 'rounded', inset = 0.14 } = {}) {
  const S = 1024;
  const radius = shape === 'rounded' ? 224 : 0;

  // O traço cresce com a escala do desenho, para o peso visual não mudar.
  const scale = 1 - inset * 2;
  const stroke = 56 * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="${radius}" ry="${radius}" fill="${CREAM}"/>
  ${
    shape === 'rounded'
      ? `<rect x="6" y="6" width="${S - 12}" height="${S - 12}" rx="${radius - 6}" ry="${radius - 6}"
           fill="none" stroke="${GREIGE}" stroke-width="12"/>`
      : ''
  }
  <g transform="translate(${S / 2} ${S / 2}) scale(${scale}) translate(${-S / 2} ${-S / 2})"
     fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M176 486 512 206l336 280" stroke="${WOOD}"/>
    <path d="M288 452v366h448V452" stroke="${INK}"/>
    <path d="M400 636l92 92 164-192" stroke="${OLIVE}"/>
  </g>
</svg>`;
}

/* ─────────────────────── Rasterização (SVG → PNG) ───────────────────────── */

await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));

/** @returns {{ png: Buffer, rgba: Buffer, size: number }} */
function raster(svg, size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const rendered = resvg.render();
  return {
    png: Buffer.from(rendered.asPng()),
    rgba: Buffer.from(rendered.pixels),
    size,
  };
}

/* ───────────── Codificador PNG (para o ICO, que precisa de 32bpp) ───────── */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Codifica RGBA cru em PNG (cor tipo 6, 8 bits, sem filtro). */
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filtro adaptativo
  ihdr[12] = 0; // sem entrelaçamento

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro "None" na linha
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ──────────────────── Contêineres ICO (Windows) e ICNS (macOS) ──────────── */

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo 1 = ícone
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;

  entries.forEach((entry, index) => {
    const at = index * 16;
    directory[at] = entry.size >= 256 ? 0 : entry.size; // 0 significa 256
    directory[at + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[at + 2] = 0; // paleta
    directory[at + 3] = 0; // reservado
    directory.writeUInt16LE(1, at + 4); // planos de cor
    directory.writeUInt16LE(32, at + 6); // bits por pixel
    directory.writeUInt32LE(entry.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

function buildIcns(entries) {
  const blocks = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, 'latin1');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });

  const total = 8 + blocks.reduce((sum, block) => sum + block.length, 0);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 4, 'latin1');
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...blocks]);
}

/* ──────────────────────────── Geração ───────────────────────────────────── */

const iconsDir = join(root, 'public', 'icons');
const buildDir = join(root, 'build');
mkdirSync(iconsDir, { recursive: true });
mkdirSync(buildDir, { recursive: true });

const written = [];
const write = (path, data) => {
  writeFileSync(path, data);
  written.push([path.replace(root, '').replace(/^[\\/]/, '').replace(/\\/g, '/'), data.length]);
};

// Fonte vetorial: o favicon e o ícone do manifesto.
const roundedSvg = brandSvg({ shape: 'rounded', inset: 0.05 });
const maskableSvg = brandSvg({ shape: 'full', inset: 0.19 }); // respeita a zona segura de 80%

write(join(root, 'public', 'favicon.svg'), Buffer.from(roundedSvg, 'utf8'));
write(join(iconsDir, 'icon.svg'), Buffer.from(roundedSvg, 'utf8'));

// PWA e navegador.
for (const size of [64, 192, 512]) {
  write(join(iconsDir, `icon-${size}.png`), raster(roundedSvg, size).png);
}
for (const size of [192, 512]) {
  write(join(iconsDir, `maskable-${size}.png`), raster(maskableSvg, size).png);
}
write(join(root, 'public', 'apple-touch-icon.png'), raster(brandSvg({ shape: 'full', inset: 0.1 }), 180).png);
write(join(root, 'public', 'favicon.ico'), buildIco(
  [16, 24, 32, 48, 64, 128, 256].map((size) => {
    const { rgba } = raster(roundedSvg, size);
    return { size, png: encodePng(rgba, size) };
  }),
));

// Empacotador do desktop.
write(join(buildDir, 'icon.png'), raster(roundedSvg, 1024).png);
write(join(buildDir, 'icon.ico'), buildIco(
  [16, 24, 32, 48, 64, 128, 256].map((size) => {
    const { rgba } = raster(roundedSvg, size);
    return { size, png: encodePng(rgba, size) };
  }),
));
write(join(buildDir, 'icon.icns'), buildIcns(
  [
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 32],
    ['ic12', 64],
    ['ic13', 256],
    ['ic14', 512],
  ].map(([type, size]) => {
    const { rgba } = raster(roundedSvg, size);
    return { type, png: encodePng(rgba, size) };
  }),
));

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const width = Math.max(...written.map(([path]) => path.length));
for (const [path, bytes] of written) {
  console.log(`  ${path.padEnd(width)}  ${kb(bytes).padStart(9)}`);
}
console.log(`\n✓ ${written.length} arquivos de ícone gerados`);

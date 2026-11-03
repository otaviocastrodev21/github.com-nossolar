import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { unitFor } from './format';
import { useIsPhone, useMediaQuery } from './media';

describe('unitFor', () => {
  it('fica no singular de 1 até 2 (exclusive), como em português', () => {
    expect(unitFor(1, 'jogo')).toBe('jogo');
    expect(unitFor(1.5, 'unidade')).toBe('unidade');
    expect(unitFor(0.5, 'pacote')).toBe('pacote');
  });

  it('vai ao plural a partir de 2 e no zero', () => {
    expect(unitFor(2, 'jogo')).toBe('jogos');
    expect(unitFor(6, 'unidade')).toBe('unidades');
    expect(unitFor(0, 'peça')).toBe('peças');
  });

  it('respeita os plurais irregulares da lista de unidades', () => {
    expect(unitFor(2, 'par')).toBe('pares');
    expect(unitFor(3, 'embalagem')).toBe('embalagens');
    expect(unitFor(1, 'par')).toBe('par');
  });
});

describe('useMediaQuery', () => {
  it('sem matchMedia (jsdom), responde a versão larga', () => {
    const original = window.matchMedia;
    // @ts-expect-error — simula o ambiente sem a API
    delete window.matchMedia;
    try {
      expect(renderHook(() => useMediaQuery('(max-width: 600px)')).result.current).toBe(false);
      expect(renderHook(() => useIsPhone()).result.current).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

  it('segue o matchMedia quando ele existe', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      expect(renderHook(() => useIsPhone()).result.current).toBe(true);
      expect(renderHook(() => useMediaQuery('(min-width: 1px)')).result.current).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});

import { describe, expect, it } from 'vitest';
import { compactSearchText, normalizeSearchText, smartSearchScore } from './smartSearch';

describe('smartSearch', () => {
  it('normaliza acentos, caixa e pontuação', () => {
    expect(normalizeSearchText('Clínica São José LTDA')).toBe('clinica sao jose ltda');
    expect(compactSearchText('12.345.678/0001-90')).toBe('12345678000190');
  });

  it('ranqueia correspondências parciais e fora de ordem', () => {
    const score = smartSearchScore(['Clínica São José', 'Goiânia GO', '123'], 'jose clinica');
    expect(score).toBeGreaterThan(0);
  });

  it('aceita pequenos erros de digitação em nomes', () => {
    const score = smartSearchScore(['Hospital Santa Marta'], 'snta marta');
    expect(score).toBeGreaterThan(0);
  });

  it('interpreta buscas por contexto de ID ou código', () => {
    expect(smartSearchScore(['CLIPED', 24], 'cliente id 24')).toBeGreaterThan(0);
    expect(smartSearchScore(['CLIPED', 24], 'código 24')).toBeGreaterThan(0);
  });
});

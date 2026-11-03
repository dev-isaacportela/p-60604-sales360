import { describe, expect, it } from 'vitest';
import { normalizeCurrencyInput, parseCurrencyInput } from './metas.utils';

describe('normalizeCurrencyInput', () => {
  it('campo vazio nao vira zero', () => {
    // Regressao: devolver '0' aqui fazia o Salvar gravar meta zero para todo
    // vendedor que o coordenador nao editou.
    expect(normalizeCurrencyInput('')).toBe('');
    expect(normalizeCurrencyInput('   ')).toBe('');
    expect(parseCurrencyInput('')).toBeNull();
  });

  it('le o formato pt-BR', () => {
    expect(parseCurrencyInput('1.500,50')).toBe(1500.5);
    expect(parseCurrencyInput('150.000')).toBe(150000);
    expect(parseCurrencyInput('1.234.567,89')).toBe(1234567.89);
    expect(parseCurrencyInput('0,5')).toBe(0.5);
  });

  it('le ponto como decimal sem inflar o valor em 100x', () => {
    // Regressao: '1500.50' virava 150050 porque todo ponto era removido.
    expect(parseCurrencyInput('1500.50')).toBe(1500.5);
    expect(parseCurrencyInput('1500.5')).toBe(1500.5);
    expect(parseCurrencyInput('0.75')).toBe(0.75);
  });

  it('trata milhar com ponto sem confundir com decimal', () => {
    expect(parseCurrencyInput('1.500')).toBe(1500);
    expect(parseCurrencyInput('12.345.678')).toBe(12345678);
  });

  it('aceita zero explicito', () => {
    // Zerar a meta e uma acao legitima (vendedor de ferias, por exemplo).
    expect(parseCurrencyInput('0')).toBe(0);
    expect(parseCurrencyInput('R$ 0,00')).toBe(0);
  });

  it('ignora simbolos e espacos', () => {
    expect(parseCurrencyInput('R$ 1.500,50')).toBe(1500.5);
    expect(parseCurrencyInput(' 2.000 ')).toBe(2000);
  });

  it('devolve null para texto sem numero', () => {
    expect(parseCurrencyInput('abc')).toBeNull();
    expect(parseCurrencyInput('--')).toBeNull();
  });

  it('preserva negativo', () => {
    expect(parseCurrencyInput('-1.500,50')).toBe(-1500.5);
  });
});

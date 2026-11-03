// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTema } from './useTema';
import { aplicarTema, definirTema } from '../lib/theme';

/** Um botao igual ao do header: o rotulo diz o que o icone mostraria. */
function BotaoDeTema() {
  const { escuro, alternar } = useTema();
  return (
    <button onClick={alternar} data-testid="botao">
      {escuro ? 'clarear' : 'escurecer'}
    </button>
  );
}

function rotulo() {
  return screen.getByTestId('botao').textContent;
}

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-tema');
  document.documentElement.className = '';
});

describe('useTema: o botao le o tema da TELA', () => {
  it('nasce com o tema que ja esta na tela, nao com o salvo', () => {
    // Dentro do painel: a tela esta escura e o salvo da pessoa e claro.
    localStorage.setItem('sales360:tema', 'claro');
    aplicarTema('escuro');

    render(<BotaoDeTema />);

    expect(rotulo()).toBe('clarear');
  });

  it('confere a tela no mount: troca entre o render e o efeito nao passa batido', () => {
    aplicarTema('claro');

    // O painel avisa no onLoad do iframe, que pode cair justo depois do primeiro
    // render e antes do efeito do hook ouvir. Era aqui que o icone nascia
    // invertido: tela escura com o icone de escurecer.
    function PainelAvisaNoRender() {
      aplicarTema('escuro');
      return null;
    }

    render(
      <>
        <BotaoDeTema />
        <PainelAvisaNoRender />
      </>,
    );

    expect(document.documentElement.dataset.tema).toBe('escuro');
    expect(rotulo()).toBe('clarear');
  });

  it('acompanha a troca que vem depois', () => {
    aplicarTema('claro');
    render(<BotaoDeTema />);
    expect(rotulo()).toBe('escurecer');

    act(() => definirTema('escuro'));

    expect(rotulo()).toBe('clarear');
  });

  it('o clique inverte o que esta na tela e grava a escolha', () => {
    localStorage.setItem('sales360:tema', 'claro');
    aplicarTema('escuro');
    render(<BotaoDeTema />);

    act(() => screen.getByTestId('botao').click());

    expect(document.documentElement.dataset.tema).toBe('claro');
    expect(localStorage.getItem('sales360:tema')).toBe('claro');
    expect(rotulo()).toBe('escurecer');
  });
});

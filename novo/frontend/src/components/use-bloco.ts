// Carga de um bloco de tela (RF-005 da 010): cada bloco tem a sua consulta e
// a sua falha; um bloco que falha não derruba o resto da tela (C-026).

import { useCallback, useEffect, useState } from 'react'
import { acao, linhasAfetadas } from '@/lib/mitra-api'
import type { SERVER_FUNCTIONS } from '@/lib/server-functions'

export function useBloco<T>(carregar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState(false)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    setErro(false)
    carregar()
      .then(r => vivo && setDados(r))
      .catch(falha => {
        console.error('carga de bloco', falha)
        if (vivo) setErro(true)
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao])

  const recarregar = useCallback(() => setVersao(v => v + 1), [])
  return { dados, erro, recarregar }
}

/** Gravação por SF SQL: linhas afetadas (RNT-013); 0 = o servidor recusou. */
export async function gravar(chave: keyof typeof SERVER_FUNCTIONS, input: Record<string, unknown>): Promise<number> {
  return linhasAfetadas(await acao(chave, input))
}

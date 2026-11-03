// Confirmação das ações da RN-025 (spec 010) e bloco que falhou (RF-005).
// O servidor só é chamado no botão de confirmar; cancelar não grava nada.

import { useState } from 'react'
import type { ReactNode } from 'react'
import { MSG_BLOCO } from '@/lib/gestao'
import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, PanelBody, Stack,
} from './page'

export interface PedidoConfirmacao {
  titulo: string
  texto: string
  botao: string
  perigo: boolean
  executar: () => Promise<void>
  /** Campo a mais no miolo (o motivo do bloqueio, RN-022). */
  extra?: ReactNode
}

export function Confirmacao({ pedido, onFechar }: { pedido: PedidoConfirmacao | null; onFechar: () => void }) {
  const [executando, setExecutando] = useState(false)

  async function confirmar() {
    if (!pedido) return
    setExecutando(true)
    try {
      await pedido.executar()
    } finally {
      setExecutando(false)
      onFechar()
    }
  }

  return (
    <Dialog open={!!pedido} onOpenChange={aberto => !aberto && !executando && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pedido?.titulo}</DialogTitle>
          <DialogDescription>Confirme para continuar.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Stack>
            <p>{pedido?.texto}</p>
            {pedido?.extra}
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={executando}>
            Cancelar
          </Button>
          <Button variant={pedido?.perigo ? 'danger' : 'primary'} onClick={confirmar} disabled={executando}>
            {executando ? 'Aguarde…' : pedido?.botao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Miolo de um Panel cuja consulta falhou. */
export function BlocoFalhou() {
  return (
    <PanelBody>
      <Alert tone="error">{MSG_BLOCO}</Alert>
    </PanelBody>
  )
}

/** Caixa de marcar com rótulo (papéis, seções). Desabilitada em vez de escondida (design.md, anti-padrões). */
export function Marcador({ rotulo, marcado, desabilitado, onMudar }: {
  rotulo: string
  marcado: boolean
  desabilitado?: boolean
  onMudar: (marcado: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-ink has-disabled:text-ink-secondary">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={marcado}
        disabled={desabilitado}
        onChange={e => onMudar(e.target.checked)}
      />
      {rotulo}
    </label>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  Eye,
  FileText,
  MoreVertical,
  Package2,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { callSF, callSFMutation, SF, formatCurrency, getBrasiliaTimestamp } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import DropdownMenu from '../components/ui/DropdownMenu';
import Select from '../components/ui/Select';
import FotoProduto from '../components/FotoProduto';
import { carregarFotos, fotoDoProduto, useFotosProdutos } from '../lib/fotosProduto';

const BENENUTRI_LOGO_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWEAAABnCAYAAADR0fN+AAAACXBIWXMAAAsSAAALEgHS3X78AAANSElEQVR4nO3dT3bixhYG8M8+ntu9AtgBfguIrB5EU/NWYPVQoyYraLyCkEk0bHkFj55q0rI2EHsFD1bwzAr8BlW0MQapSuiqCvH9zslJYgpxEeJSqr9nr6+vqBKlwTWAKwDIk7KoLExERFbOdiXhKA1CABMAtzue8wxglidlJhoZEdEJeJeEozQYAsgA3ABYAZgDeNL/XAEIAYwBDAAsAYzzpHzqMmAioj65WP+HbnYoAFwCuIeq7b5slZ8DmERpEAOYQdWW4y4CJSLqo7PX11dEaXCFjdoua7dERN1Y14RnUE0Mn5mAiYi6c/b7378NAfwXwEOelHEbB9U16zBPyvnG/48BDAHMNxO9bgYZrsvuOd7eMtuPRWkwBnC9UaSwGdWhjzfe+NNTVWxERIe4wFvCmbV43AmAbwDOdFLMoNqaAdXkMdkoO16XrTjeOrZdyXAGAFEaLPTjg63Hv0Vp8AhgUlXL1z8Uc6hOSUCNAhnpx54BxLxLIKK2nUONeFhJJBjdgfcfAAuopo6zPCknlU9qZgjVqXgF4AuAT3lSngH4BNXJeA2g0KM/dsV5pZ9/o8t/ypPyWh/jy/r4upZMRNSaC6jEVZmAozSY6HLb5jXJewZVowx3jLRo0wBqSN27TkX9mtMoDeYA/oGqkYd74hxB/VAUmw/kSZlFafAElaRne55PRNTIeV0BXfv7E6rJYPufuiaMS6jbeMkEvLa3uUH//R7AzXZtVteO76DaxIuK5892PZ+I6BAXAF5QUbvTCehDe22UBoXB8R+6akc1mMGXQf1wjPG+5h/qf9f9oMz2PJ+IqLFz6AkaQjW8qcAxd3msK5An5WLPQ0P9eGVi1bX5pW1gRERVzvE24mDa9sErEl/bhoceQHfO1dkeeUFEdJBznSj/AnCrh5Mdo8G+kQ9rG+9tsfVQof9d+d437hS6aN8mohOx7pibQo1iyPQKal1aAO+S5Du6hnqDj8lzW12b7hRvixL9ojvjlng/dnnf8wHVtkxE1Ipz4Fd7Z6z/9jNKg2nV7bkestZWG/IcKjnOtmuzG+N3gfrkdxulwYcyURpc6SFqIwDTPSM1JgBGURpku963Pu4tgPuORnoQ0YnYXsryCirZ3UIlxgJvS1kOoRLvGGro2d6lLKM0mAL4pic71NK173UNNdOvew31wzAA8EeelDtruhujNBZQQ82W+lgvUGObYx3vX1UTRaI0mAH4qp+/jiHciKG1ad1ERGtVi7rHeEu4mx4BZFVDwnRNeZonpUln1/o519BjcTf+vIQa/1u1rkQBAHlShnqG3gR6urH2A2pZzsIghjFUs8Pm85dQ7yUzeBtERFZ2JuFtOikvbEY7RGkwbDo6Qr/ek8mt/2YSbvJabcRARNSUURL2mVQSJiLqQu20ZSIiksMkTETkUB+SMNtsiehoXdQX8V6M3ctsEhF57+g75oiIjlkfmiOIiI4WkzARkUNMwkREDjEJExE5xCRMROQQkzARkUNMwkREDjEJExE5dAGoZSfRwmaZu5is42tKLzovsSu0qZe6XZnXTLaJOuTcmJ4L09eQvAYMGS2Vavi+jT+nPa8xRP25sLkWTGJutGyqQaym5zW0fe0W1cYofX26yFPr1zz7/e/frqG3vW8riB3Wu3TMAcwbXmzrrY5GNUWl7d3lY01vh3RncKwfAGLb82F5Lmp3BNHHW0D2GjDxr6rEZvm+7/OknNoGoDcXKGB2Lr7ULfZvEfMzgNDmWjCMdaWPW3VeM5hdr1IqY7T8TA6No0B3eeohT8r4HGo3C+k3dwm1ZdJ3AAu9/ZGtGO4TMFCzToWuUZhe0Ld420DUxvbuIVXuDGo5E7hPwEDNjtewe9/fGu4ebvN9+G5QJoNZzCO87adYS9cMC9THegmg2LcbueX1KuUS1Rv1dpGj1nEcmqesv5su2oQvob4gRdVmojv0dZGeJomCzPhwbm2uW5tKxhDmiekSbpuajlHTPGXNZcfcDSx++Xts4Lg9rs/upL9A1Hviecr16IhRwyp/38SuA+gxH2rDdNxE85TrJAyoKv/QdRCOMVHI4bmlNojlKR+SMKAas0/ZZcNOJKp3yx95aonId9SXJMwExCYJSby+qA2xxEF9ScIDdqDgludATOw6AOoFkSGyviRhwO1MOF+wxiZjxCYJaoPESCafkvCx1AIld3eOBY99DOaCxz71foed9NTZB8dhrHDCn0+T3ZY/1zx+BZVMbi2Pe412v4R1cTbS5hzzHW6iNBiazPV3TOLcHrTeg4ExTviLXiVPylhPXTbx0+LQzzA750brW1gwuT6HULNVBy2+biPWSdgwCc2jNJjDPhG3RjhZShqjegqnc0d6bgdRGlwLJ/qjZbHQk81hX1xcKxbvZQ7gCY4TsWRzhNeJxGOx6wB6jDVh+kUv0JO5jkMsCR9pbckHI71qFLWPHZ/kHZ865uhN7DqAnuKkGPIOk7CfmCjk8NySV5iE/cSV1eRwZTXyCpOwv2LXAfQYa8PkDSZhfzFRyOG5JW8wCfuLnUhyuLIaeYNJ2G+x6wB6jD9w5AUmYb9xZTU5sesAiAAm4WPAGpsMrqxGXmAS9l/sOoAe4zRmck4sCXPqbWtuWGMTw7sMck6yJswLvD08lzIGrCyQa03WE66kO5JiAN/aPvYJi8FV6aRMwCYfcsg6CUdp8CoRCIBFmwdrIc7nPCl9qSWNfFoLt4Vz+5AnZdxGLC3gXQY55VPHnBcJZsMoSgOfOm5i1wG06C5Kg9h1EBonxZBTviThR19qeVu6GKO7NCzXt0Qx7OA1ng3LxZJBEFXxIQmf9CZ/UCv7myRirqxmz7QdnZNiTpfzz911El4CCD2tBXfJdIPTWDKIHlrAvDbctzsNqqFHxsSu42h9dIShJYBpnpSZo9f3TQbgq0E5Jgp7MwDfDcrF8GC/MTqcwR3jEGp39xjApXA4tVwl4QGAaZQGYCIG8qR8itLgGcCopig7kezNYZaEOSmmP366DsCGy+aIAYDvURpkDmPwSWZYLhaMoXf0jro/DIvzB44657pNGFDDlaaug/CAabvwLboZWdAnNm3uzjtqyF8Su8j7kISB0x4dAQDIk3IB4NGw+J1gKL2jm7xWBkVHqG8SotNl2slrxZckfOnh8KsVzGtQbck6fj1XntH9NOyuP0vqn0zioE065u5rHr+CalsbWB43BFA0iGefujjrzB0MnTPtRHLt0HM70221XZqDdxDU3Aq+JOE8Kad1ZXQbbwGHt3YmcfomT8qXKA1+QLX7eutIz+08SoMl7CsHRIAaUitScRBpjtDBTiWOfQIy1wH0GJskqImHPCnFms8k24QLwWP3Vp6Uc5h1IpG9zHUAdHTEV/wTS8IO2vz6hDU2AbqNX6SHm3pnCeDfXSy56svoCHovcx1Aj2WuA6CjMNV3peJcTVumCnlSFuxEEjMH8KfrIEhOnpRn23/Ti/X8Y3GYEB39YLMm7C82SQiwnBRDPaGbomz6WkKhUD5gEvYX95STk7kOgJwoLMp2tgksk7CndI2NnUgyeJdxmmw/91AiiG1Mwn7LXAfQR5Yrq1F/FJblQ4EYPmAS9htrbHIy1wFQt/TdpemejgCTMOmLhjU2AZwUc7IKi7KXXbQLMwn7j7VhOTy3p6ewLC++0L9YEuZWMa1hopCTuQ6AOudd55xkTTgUPPbJ0J1ID67j6CO9S4JNG6E4i8pLJ8On+kZ/n2xGHd1IxbImkoR1OwrHubaHtWE5vp3beZQGlVss6e/XtJtweqmwKSy94YT1tOUoDYqaIldoto5wqwv+GMTZ1KTrxd71WrgreLA9NyB2bl8AxA4WfsoAfO34NauMAPwvSoN9s/qafr/oTQG7z3wMwVUhm6wdIVU9bzuxScU5RvuxmvBpZwjJc5sJHXunPCmfojR4hn+Jre1zzFUN3xSW5UOBGH7xaXQEL5Jqp9C8M3T0upngsReCxzbmYKsub+m7LZv1Q0Z1TUSH8CYJ8yKpps+PV51IPSLZLuzDdc3p7x8VluVDgRgA+JOEOSHBjG+dSL0gPCnGh8+scB2AhwrL8qFADAD8ScI+XKjH4BSaJFwRuQY9WTozc/z63tHDE22ITdrwIQkv86TMXAdxDLiymijJioDLH89HNvXtZXP3M5CagOZDEhafFtgzmesA+khyUoxep8JFk9sKQOzgdY9FYVk+FIjBeRL+wl9pa5nrAHpMsjYco9u7mBWAUN890W6FZflQIAZnSXgF4DObIexxLVw5kiur6c8tRDdT0JdQCZgVnAq+bHl0jm6H0CwB3AMYNmgYP5YLagG7D7bJ+8osyq5QP1a17vGuLGoetzlXJu97l8yirFXNNk/KF72F+mfI/JAuAfyRJ+VQMAHbvOe2YrA5ju3dRmZR1mTjXetr9Oz19RVRGswgtyBIATURozj0wojSIIb7Nq7aacsWa2dkTe8GLF7DaJq18DVgwmjassU10Hh6ueFrHDzNWk8ACKHO+xDNJqsUaOn7ZULHnEFNn67ylCflpMXXNbk+G30mURpMYNY3ZfSebK/R/wNBgIT5CzD8CwAAAABJRU5ErkJggg==';

interface Produto {
  PRODUCT_ID: number;
  CODPROD: number;
  CODIGO: string;
  NOME: string;
  CATEGORIA: string;
  PRECO_TABELA: number;
  CUSTO_STD: number;
  CUSTO_POLICY: number | null;
  CUSTO_APLICADO: number;
  TIPO_CUSTO: string;
}

interface ItemMix {
  produtoId: number;
  nome: string;
  codigo: string;
  categoria: string;
  quantidade: number;
  custoUnitario: number;
  tipoCusto: string;
  custoId?: string;
  custoLabel?: string;
  opcoesCusto?: CustoOpcao[];
  custoAlerta?: string;
  margemPercent: number;
  precoVenda: number;
  precoConcorrente: number;
}

interface CustoOpcao {
  custoId: string;
  label: string;
  custo: number;
  tipoCusto: string;
}

interface MixResumo {
  ID: number;
  NOME: string;
  DESCRICAO: string;
  ID_CLIENTE: number;
  ID_USUARIO_CRIACAO: number;
  DT_CRIACAO: string;
  TOTAL_CUSTO: number;
  TOTAL_VENDA: number;
  MARGEM_MEDIA: number;
  CLIENTE: string;
  ENVIADO_HISTORICO?: number;
  DT_ENVIO_HISTORICO?: string;
}

interface MixVisualizacao {
  mix: MixResumo;
  nomeMix: string;
  descricaoMix: string;
  itens: ItemMix[];
}

const MIX_PAGE_SIZE = 20;

// O catalogo de custos nao expoe preco de tabela (PRECO_TABELA vem 0), entao o produto
// entra com esta margem e a executiva ajusta item a item no campo "Margem Bruta %".
const MARGEM_PADRAO = 30;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function calcPrecoByMargem(custo: number, margemPercent: number) {
  const margem = clamp(margemPercent, 0, 95);
  const divisor = 1 - margem / 100;
  if (divisor <= 0) {
    return custo;
  }
  return custo / divisor;
}

function calcMargemByPreco(custo: number, preco: number) {
  if (preco <= 0) {
    return 0;
  }
  return ((preco - custo) / preco) * 100;
}

function getMargemTone(margem: number) {
  if (margem >= 30) return { color: '#0b8f3f', label: 'Saudável' };
  if (margem >= 20) return { color: '#a26a00', label: 'Atenção' };
  return { color: '#b42318', label: 'Baixa' };
}

type OrdenacaoItens = 'INCLUSAO' | 'MARGEM_ASC' | 'MARGEM_DESC' | 'SUBTOTAL_DESC';

const ORDENACOES: { value: OrdenacaoItens; label: string }[] = [
  { value: 'INCLUSAO', label: 'Ordem de inclusão' },
  { value: 'MARGEM_ASC', label: 'Menor margem' },
  { value: 'MARGEM_DESC', label: 'Maior margem' },
  { value: 'SUBTOTAL_DESC', label: 'Maior subtotal' },
];

// Grade unica da tabela de itens: header, linhas e rodape de totais leem daqui, de
// forma que nao existe mais duas listas de colunas para manter em sincronia.
const COLS_BASE = '36px minmax(232px,2.4fr) minmax(96px,1fr) 72px minmax(104px,1.1fr) minmax(72px,0.7fr) minmax(80px,0.8fr) minmax(108px,1fr)';
const COLS_COMPARATIVO = ' minmax(128px,1.1fr) minmax(84px,0.9fr)';
const COLS_SUBTOTAL = ' minmax(112px,1.2fr)';
const COLS_FIM = ' 44px';

// Soma das larguras minimas de cada modo, usada como piso do container rolavel.
// Divisoria que separa o subtotal (fim da conta) das colunas de apoio do concorrente.
const APOIO_BORDA = { borderLeft: '1px dashed var(--color-border)' };

const LARGURA_MINIMA_TABELA = 984;
const LARGURA_MINIMA_TABELA_COMPARATIVO = 1208;

function getItemGridColumns(comparativo: boolean) {
  // O concorrente vem depois do subtotal: e informacao de apoio, nao entra na conta do mix.
  return `${COLS_BASE}${COLS_SUBTOTAL}${comparativo ? COLS_COMPARATIVO : ''}${COLS_FIM}`;
}

// Faixas do CMV do concorrente: quanto menor, melhor o nosso custo contra o dele.
function getCmvTone(cmv: number) {
  if (cmv <= 0) return { color: 'var(--color-text-secondary)', bg: 'var(--color-surface-container)' };
  if (cmv <= 70) return { color: '#0b8f3f', bg: '#e7f6ea' };
  if (cmv <= 85) return { color: '#a26a00', bg: '#fdf3e3' };
  return { color: '#b42318', bg: '#fdecea' };
}

// Os params de SF SQL entram na query por substituicao de texto: toda string precisa
// ter as aspas simples duplicadas antes de ser enviada, senao quebra (ou injeta) o SQL.
function escapeSqlParam(value: unknown) {
  return String(value ?? '').replace(/'/g, "''");
}

// Payload dos itens consumido por JSON_TABLE nas SFs mixCriar/mixAtualizar.
// Campos numericos vao como numero e TIPO_CUSTO e reduzido a [A-Z_], de forma que
// o JSON resultante jamais contenha aspas simples.
function serializarItens(itens: ItemMix[]) {
  return JSON.stringify(
    itens.map((item) => ({
      p: Number(item.produtoId) || 0,
      q: Math.max(1, Number(item.quantidade) || 1),
      t: String(item.tipoCusto || 'SEM_CUSTO').toUpperCase().replace(/[^A-Z_]/g, '') || 'SEM_CUSTO',
      c: round2(Number(item.custoUnitario) || 0),
      m: round2(Number(item.margemPercent) || 0),
      v: round2(Number(item.precoVenda) || 0),
      k: round2(Number(item.precoConcorrente) || 0),
      x: item.precoConcorrente > 0 && item.precoVenda > 0
        ? round2((item.custoUnitario / item.precoConcorrente) * 100)
        : null,
    })),
  );
}

// Excel pt-BR abre CSV com ponto e virgula; texto vai sempre entre aspas para nao
// quebrar em nomes de produto que contenham o separador.
function csvCelula(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function csvNumero(value: number) {
  return `"${(Number(value) || 0).toFixed(2).replace('.', ',')}"`;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function SimulacaoPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [mixes, setMixes] = useState<MixResumo[]>([]);
  const [usuarioLogadoId, setUsuarioLogadoId] = useState<number>(0);

  const [clienteId, setClienteId] = useState('');
  const [mixNome, setMixNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [produtoBusca, setProdutoBusca] = useState('');
  const [tipoCustoSelecionado, setTipoCustoSelecionado] = useState<'PADRAO' | 'ESPECIAL'>('PADRAO');
  const [itens, setItens] = useState<ItemMix[]>([]);

  // Layout: o construtor e o historico dividem a rota em abas, para a tela nao virar
  // uma pagina unica com duas tabelas grandes empilhadas.
  const [abaAtiva, setAbaAtiva] = useState<'builder' | 'historico'>('builder');
  // Colunas de concorrencia entram sob demanda: sem elas a tabela cabe em 1366px.
  const [modoComparativo, setModoComparativo] = useState(false);
  const [buscaItens, setBuscaItens] = useState('');
  const [ordenacaoItens, setOrdenacaoItens] = useState<OrdenacaoItens>('INCLUSAO');
  const [exportMenuAberto, setExportMenuAberto] = useState(false);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null);
  const catalogoInputRef = useRef<HTMLInputElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [loadingCostProductId, setLoadingCostProductId] = useState<number | null>(null);
  const [costAlert, setCostAlert] = useState('');
  const [custosMinutos, setCustosMinutos] = useState<number | null>(null);
  const [mixParaExcluir, setMixParaExcluir] = useState<MixResumo | null>(null);
  const [excluindoMix, setExcluindoMix] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const [loadingProdutos, setLoadingProdutos] = useState(false);
  const [loadingMixes, setLoadingMixes] = useState(false);
  const [duplicatingMixId, setDuplicatingMixId] = useState<number | null>(null);
  const [sendingHistoryMixId, setSendingHistoryMixId] = useState<number | null>(null);
  // Chave = `${escopo}-${mix.ID}`: a mesma linha e renderizada em dois lugares (cartao mobile
  // e linha da tabela). Guardar so o ID abriria os dois menus ao mesmo tempo — como cada um
  // vive num portal no body, o menu irmao considerava o clique do outro como "clique fora",
  // fechava tudo no mousedown e o click nunca chegava no item.
  const [activeActionsKey, setActiveActionsKey] = useState<string | null>(null);
  const [editingMixId, setEditingMixId] = useState<number | null>(null);
  const [visualizacao, setVisualizacao] = useState<MixVisualizacao | null>(null);
  // Guardamos o produtoId (nao o indice): remover um item nao pode fazer o menu
  // aberto passar a apontar para outra linha.
  const [activeCostMenuId, setActiveCostMenuId] = useState<number | null>(null);
  const [costMenuAnchor, setCostMenuAnchor] = useState<HTMLElement | null>(null);
  const [loadingOpcoesId, setLoadingOpcoesId] = useState<number | null>(null);
  const [activeActionsAnchor, setActiveActionsAnchor] = useState<HTMLElement | null>(null);
  const [mixPage, setMixPage] = useState(0);
  const [mixHasNextPage, setMixHasNextPage] = useState(false);

  // O sync do cache de custos NAO e disparado pela tela: a SF e do tipo JAVASCRIPT e
  // executa DDL/DML, o que a plataforma nega para acesso BUSINESS (o vendedor recebia
  // BUSINESS_ACCESS_DENIED). Ele roda por cron a cada 30min; aqui so lemos a idade do
  // cache para avisar quando os custos estiverem velhos.
  async function carregarStatusCustos() {
    const linha = (await callSF(SF.mixStatusCustos, {}))[0];
    if (!linha) return;

    const minutos = Number(linha.MINUTOS_DESDE_SINCRONIZACAO);
    if (!Number.isFinite(minutos)) return;

    setCustosMinutos(minutos);
  }

  async function loadCatalogo() {
    const [clientesResp, usuarioResp] = await Promise.allSettled([
      callSF(SF.mixCarteiraClientes, { busca: '', limit: '500', offset: '0' }),
      callSF(SF.dadosUsuarioLogado, {}),
    ]);

    if (clientesResp.status === 'fulfilled') {
      setClientes(clientesResp.value);
      setClienteId((current) => {
        if (!current) return current;
        return clientesResp.value.some((cliente: any) => String(cliente.ID) === current) ? current : '';
      });
    }

    if (clientesResp.status === 'rejected') {
      addToast('error', 'Não foi possível carregar a sua carteira de clientes.');
    }

    if (usuarioResp.status === 'fulfilled') {
      const idUsuario = Number((usuarioResp.value?.[0] as any)?.ID || 0);
      setUsuarioLogadoId(Number.isFinite(idUsuario) ? idUsuario : 0);
    }
  }

  const loadMixes = useCallback(async (page = 0) => {
    setLoadingMixes(true);
    try {
      // Pedimos MIX_PAGE_SIZE + 1 para saber se existe proxima pagina sem uma SF de contagem.
      const rows = await callSF(SF.mixListar, {
        clienteId: '',
        usuarioId: '',
        limit: String(MIX_PAGE_SIZE + 1),
        offset: String(page * MIX_PAGE_SIZE),
      });

      setMixHasNextPage(rows.length > MIX_PAGE_SIZE);
      setMixes(
        rows.slice(0, MIX_PAGE_SIZE).map((row: any) => ({
          ...row,
          TOTAL_CUSTO: Number(row.TOTAL_CUSTO || 0),
          TOTAL_VENDA: Number(row.TOTAL_VENDA || 0),
          MARGEM_MEDIA: Number(row.MARGEM_MEDIA || 0),
        })),
      );
      setMixPage(page);
    } finally {
      setLoadingMixes(false);
    }
  }, []);

  useEffect(() => {
    Promise.allSettled([loadCatalogo(), loadMixes(), carregarStatusCustos()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const busca = produtoBusca.trim();
    if (!clienteId || busca.length < 1) {
      setProdutos([]);
      setLoadingProdutos(false);
      return;
    }

    let cancelled = false;
    setLoadingProdutos(true);
    const timeout = window.setTimeout(async () => {
      try {
        const rows = await callSF(SF.mixCatalogoProdutosCustos, {
          busca,
          clienteId,
          filialId: '',
          limit: '20',
          offset: '0',
        });

        if (cancelled) return;
        setProdutos(
          rows.map((p: any) => ({
            ...p,
            PRODUCT_ID: Number(p.PRODUCT_ID || p.CODPROD || 0),
            CODPROD: Number(p.CODPROD || p.PRODUCT_ID || 0),
            CODIGO: String(p.CODIGO || p.CODPROD || p.PRODUCT_ID || ''),
            NOME: String(p.NOME || 'Produto'),
            CATEGORIA: String(p.CATEGORIA || ''),
            PRECO_TABELA: Number(p.PRECO_TABELA || 0),
            CUSTO_STD: Number(p.CUSTO_STD || 0),
            CUSTO_POLICY: p.CUSTO_POLICY != null ? Number(p.CUSTO_POLICY) : null,
            CUSTO_APLICADO: Number(p.CUSTO_APLICADO || 0),
            TIPO_CUSTO: p.TIPO_CUSTO || 'SEM_CUSTO',
          })),
        );
      } finally {
        if (!cancelled) setLoadingProdutos(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [produtoBusca, clienteId]);

  const produtosFiltrados = useMemo(() => produtos.slice(0, 8), [produtos]);
  // Fotos chegam depois do texto e nunca atrasam a lista (mesma regra do Pricing Hub).
  const fotoDe = useFotosProdutos([
    ...produtosFiltrados.map((p) => p.CODPROD),
    ...itens.map((item) => item.produtoId),
    ...(visualizacao?.itens || []).map((item) => item.produtoId),
  ]);

  function clearBuilder() {
    setClienteId('');
    setMixNome('');
    setDescricao('');
    setProdutoBusca('');
    setItens([]);
    setEditingMixId(null);
    setBuscaItens('');
    setOrdenacaoItens('INCLUSAO');
  }

  async function buscarOpcoesCusto(produto: Produto): Promise<CustoOpcao[]> {
    const opcoesLocais: CustoOpcao[] = produto.CUSTO_STD > 0
      ? [{
          custoId: `PADRAO:${produto.CODPROD || produto.PRODUCT_ID}`,
          label: 'Custo padrão salvo no sistema',
          custo: produto.CUSTO_STD,
          tipoCusto: 'PADRAO',
        }]
      : [];

    try {
      // Casamento de custo especial e apenas por cliente (codcli); filial nao participa.
      const rows = await callSF(SF.mixCustosDisponiveis, {
        codprod: String(produto.CODPROD || produto.PRODUCT_ID),
        clienteId,
      });
      const opcoesEspeciais = rows
        .filter((row: any) => String(row.TIPO_CUSTO || '').toUpperCase() === 'ESPECIAL')
        .map((row: any) => ({
          custoId: String(row.CUSTO_ID || `${row.TIPO_CUSTO}:${row.CODPROD}`),
          label: String(row.LABEL || row.POLITICA_NOME || row.TIPO_CUSTO || 'Custo'),
          custo: Number(row.CUSTO || 0),
          tipoCusto: String(row.TIPO_CUSTO || 'SEM_CUSTO'),
        }));

      return [...opcoesLocais, ...opcoesEspeciais];
    } catch (error) {
      console.error('Falha ao consultar opções de custo:', error);
    }

    return opcoesLocais;
  }

  function escolherOpcaoCusto(opcoes: CustoOpcao[]) {
    const preferida = tipoCustoSelecionado === 'ESPECIAL'
      ? opcoes.find((opcao) => opcao.tipoCusto === 'ESPECIAL')
      : opcoes.find((opcao) => opcao.tipoCusto === 'PADRAO');
    return preferida || opcoes[0] || null;
  }

  async function addProduto(produto: Produto) {
    if (!clienteId || !produto) return;

    if (itens.some((item) => item.produtoId === produto.PRODUCT_ID)) {
      addToast('error', 'Este produto já está no mix.');
      return;
    }

    setLoadingCostProductId(produto.PRODUCT_ID);
    setCostAlert('');

    let opcoesCusto: CustoOpcao[] = [];
    try {
      opcoesCusto = await buscarOpcoesCusto(produto);
    } catch (error) {
      console.error('Falha ao consultar custos do produto:', error);
      addToast('error', 'Não foi possível consultar os custos deste produto.');
    } finally {
      setLoadingCostProductId(null);
    }

    const custoReal = escolherOpcaoCusto(opcoesCusto);

    const custoAlerta = custoReal
      ? ''
      : 'Nenhum custo disponível para este produto. Produto adicionado com custo zero.';

    if (custoAlerta) {
      setCostAlert(`${produto.CODIGO} - ${produto.NOME}: ${custoAlerta}`);
    }

    const custoAplicado = custoReal?.custo || 0;

    const margemDoPrecoTabela = round2(clamp(calcMargemByPreco(custoAplicado, produto.PRECO_TABELA), 0, 95));
    const margemInicial = margemDoPrecoTabela > 0 ? margemDoPrecoTabela : MARGEM_PADRAO;
    const precoVenda = calcPrecoByMargem(custoAplicado, margemInicial);

    setItens((prev) => [
      ...prev,
      {
        produtoId: produto.PRODUCT_ID,
        nome: produto.NOME,
        codigo: produto.CODIGO,
        categoria: produto.CATEGORIA,
        quantidade: 1,
        custoUnitario: custoAplicado,
        tipoCusto: custoReal?.tipoCusto || 'SEM_CUSTO',
        custoId: custoReal?.custoId || 'SEM_CUSTO',
        custoLabel: custoReal?.label || 'Sem custo disponível',
        opcoesCusto,
        custoAlerta,
        margemPercent: margemInicial,
        precoVenda,
        precoConcorrente: 0,
      },
    ]);

    setProdutoBusca('');
  }

  function updateQuantidade(index: number, quantidade: number) {
    setItens((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              quantidade: Math.max(1, Number.isFinite(quantidade) ? quantidade : 1),
            }
          : item,
      ),
    );
  }

  function updateMargem(index: number, margem: number) {
    const margemNormalizada = round2(clamp(Number.isFinite(margem) ? margem : 0, 0, 95));
    setItens((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              margemPercent: margemNormalizada,
              precoVenda: calcPrecoByMargem(item.custoUnitario, margemNormalizada),
            }
          : item,
      ),
    );
  }

  // Preco digitado manda: a margem bruta e recalculada a partir dele (pode ficar negativa se o preco ficar abaixo do custo).
  function updatePrecoVenda(index: number, preco: number) {
    const precoNormalizado = Math.max(0, Number.isFinite(preco) ? preco : 0);
    setItens((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              precoVenda: precoNormalizado,
              margemPercent: round2(calcMargemByPreco(item.custoUnitario, precoNormalizado)),
            }
          : item,
      ),
    );
  }

  function updateCustoSelecionado(index: number, custoId: string) {
    setItens((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const opcao = item.opcoesCusto?.find((custo) => custo.custoId === custoId);
        if (!opcao) return item;
        return {
          ...item,
          custoUnitario: opcao.custo,
          tipoCusto: opcao.tipoCusto,
          custoId: opcao.custoId,
          custoLabel: opcao.label,
          custoAlerta: '',
          precoVenda: calcPrecoByMargem(opcao.custo, item.margemPercent),
        };
      }),
    );
    setActiveCostMenuId(null);
  }

  // Um mix carregado do banco nao traz as opcoes de custo (a SF de itens so devolve o
  // custo gravado). Buscamos sob demanda, ao abrir o menu, para nao disparar N chamadas
  // de SF ao abrir a tela de edicao.
  async function abrirMenuCusto(item: ItemMix, index: number, anchor: HTMLElement) {
    setCostMenuAnchor(anchor);
    setActiveCostMenuId(item.produtoId);

    if (item.opcoesCusto) return;

    setLoadingOpcoesId(item.produtoId);
    try {
      const opcoes = await buscarOpcoesCusto({
        PRODUCT_ID: item.produtoId,
        CODPROD: item.produtoId,
        CODIGO: item.codigo,
        NOME: item.nome,
        CATEGORIA: item.categoria,
        PRECO_TABELA: 0,
        CUSTO_STD: item.custoUnitario,
        CUSTO_POLICY: null,
        CUSTO_APLICADO: item.custoUnitario,
        TIPO_CUSTO: item.tipoCusto,
      });
      setItens((prev) => prev.map((atual, i) => (i === index ? { ...atual, opcoesCusto: opcoes } : atual)));
    } catch (error) {
      console.error('Falha ao carregar opções de custo:', error);
      addToast('error', 'Não foi possível carregar as opções de custo deste produto.');
      setItens((prev) => prev.map((atual, i) => (i === index ? { ...atual, opcoesCusto: [] } : atual)));
    } finally {
      setLoadingOpcoesId(null);
    }
  }

  function renderCostDropdown(item: ItemMix, idx: number) {
    const isOpen = activeCostMenuId === item.produtoId;
    const opcoes = item.opcoesCusto || [];
    const carregando = loadingOpcoesId === item.produtoId;

    return (
      <div className="inline-flex w-full justify-end">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={(event) => {
            if (isOpen) {
              setActiveCostMenuId(null);
              return;
            }
            abrirMenuCusto(item, idx, event.currentTarget);
          }}
          className="inline-flex min-h-8 w-full items-center justify-end gap-1 rounded-md px-2 text-right text-xs font-semibold transition"
          style={{ color: item.custoAlerta ? '#b45309' : 'var(--color-text)' }}
        >
          <span className="truncate">{formatCurrency(item.custoUnitario)}</span>
          <ChevronDown size={13} className="shrink-0 opacity-60" />
        </button>

        <DropdownMenu
          open={isOpen}
          onClose={() => setActiveCostMenuId(null)}
          anchorEl={costMenuAnchor}
          align="right"
          width={288}
        >
          {carregando ? (
            <div className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              Carregando custos...
            </div>
          ) : opcoes.length ? (
            opcoes.map((opcao) => (
              <button
                key={opcao.custoId}
                type="button"
                role="menuitem"
                onClick={() => updateCustoSelecionado(idx, opcao.custoId)}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-[var(--color-surface-container)]"
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  {formatCurrency(opcao.custo)} · {opcao.tipoCusto === 'ESPECIAL' ? 'Especial' : 'Padrão'}
                </span>
                <span className="truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>{opcao.label}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              Sem custos disponíveis
            </div>
          )}
        </DropdownMenu>
      </div>
    );
  }

  function updateConcorrente(index: number, concorrente: number) {
    setItens((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              precoConcorrente: Math.max(0, Number.isFinite(concorrente) ? concorrente : 0),
            }
          : item,
      ),
    );
  }

  function removeItem(index: number) {
    setItens((prev) => {
      const alvo = prev[index];
      if (alvo && activeCostMenuId === alvo.produtoId) {
        setActiveCostMenuId(null);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function getSubtotal(item: ItemMix) {
    return item.quantidade * item.precoVenda;
  }

  function getCustoTotalItem(item: ItemMix) {
    return item.quantidade * item.custoUnitario;
  }

  function getCmvItem(item: ItemMix) {
    if (item.precoVenda <= 0) return 0;
    return (item.custoUnitario / item.precoVenda) * 100;
  }

  // Mark up sobre o custo: quanto o preco de venda esta acima do custo, em %.
  function getMarkupItem(item: ItemMix) {
    if (item.custoUnitario <= 0) return 0;
    return ((item.precoVenda - item.custoUnitario) / item.custoUnitario) * 100;
  }

  function getCmvConcorrente(item: ItemMix) {
    if (item.precoConcorrente <= 0) return 0;
    return (item.custoUnitario / item.precoConcorrente) * 100;
  }

  const totais = useMemo(() => {
    const result = itens.reduce(
      (acc, item) => {
        acc.itens += 1;
        acc.unidades += item.quantidade;
        acc.custoTotal += getCustoTotalItem(item);
        acc.vendaTotal += getSubtotal(item);
        return acc;
      },
      { itens: 0, unidades: 0, custoTotal: 0, vendaTotal: 0 },
    );

    const margemMedia = result.vendaTotal > 0 ? ((result.vendaTotal - result.custoTotal) / result.vendaTotal) * 100 : 0;
    const cmvTotal = result.vendaTotal > 0 ? (result.custoTotal / result.vendaTotal) * 100 : 0;
    const markupTotal = result.custoTotal > 0 ? ((result.vendaTotal - result.custoTotal) / result.custoTotal) * 100 : 0;

    return {
      ...result,
      margemMedia,
      margemTone: getMargemTone(margemMedia),
      cmvTotal,
      markupTotal,
    };
  }, [itens]);

  // A tabela pode ser filtrada/ordenada, mas os handlers de edicao continuam indexando
  // o array original — por isso a view carrega o indice real de cada item.
  const itensView = useMemo(() => {
    const termo = buscaItens.trim().toLowerCase();
    const base = itens
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) =>
        !termo
        || item.nome.toLowerCase().includes(termo)
        || String(item.codigo).toLowerCase().includes(termo));

    if (ordenacaoItens === 'MARGEM_ASC') {
      return [...base].sort((a, b) => a.item.margemPercent - b.item.margemPercent);
    }
    if (ordenacaoItens === 'MARGEM_DESC') {
      return [...base].sort((a, b) => b.item.margemPercent - a.item.margemPercent);
    }
    if (ordenacaoItens === 'SUBTOTAL_DESC') {
      return [...base].sort((a, b) => getSubtotal(b.item) - getSubtotal(a.item));
    }
    return base;
  }, [itens, buscaItens, ordenacaoItens]);

  async function loadItensMix(simulacaoId: number): Promise<ItemMix[]> {
    const rows = await callSF(SF.mixItens, { mixId: String(simulacaoId) });
    return rows.map((row: any) => {
      const custo = Number(row.CUSTO_UNITARIO || 0);
      const margem = clamp(Number(row.MARGEM_PERCENT || 0), 0, 95);
      const precoVenda = Number(row.PRECO_VENDA || 0);
      return {
        produtoId: Number(row.ID_PRODUTO || 0),
        nome: row.PRODUTO || row.NOME || 'Produto',
        codigo: row.CODIGO || '',
        categoria: row.CATEGORIA || '',
        quantidade: Number(row.QUANTIDADE || 1),
        custoUnitario: custo,
        tipoCusto: row.TIPO_CUSTO || 'PADRAO',
        // O preco gravado manda (pode ter sido digitado): a margem sai dele, como na tela.
        margemPercent: round2(precoVenda > 0 ? calcMargemByPreco(custo, precoVenda) : margem),
        precoVenda,
        precoConcorrente: Number(row.PRECO_CONCORRENTE || 0),
      };
    });
  }

  async function openVisualizacao(mix: MixResumo) {
    try {
      const itensMix = await loadItensMix(mix.ID);
      setVisualizacao({
        mix,
        nomeMix: mix.NOME || `Mix #${mix.ID}`,
        descricaoMix: mix.DESCRICAO || '',
        itens: itensMix,
      });
    } catch (error) {
      console.error('Falha ao abrir mix:', error);
      addToast('error', 'Não foi possível carregar os itens deste mix.');
    }
  }

  async function excluirMix(mix: MixResumo) {
    setExcluindoMix(true);
    try {
      const ok = await callSFMutation(SF.mixExcluir, { mixId: String(mix.ID) });
      if (!ok) {
        addToast('error', 'Não foi possível excluir este mix.');
        return;
      }

      if (editingMixId === mix.ID) {
        clearBuilder();
      }
      if (visualizacao?.mix.ID === mix.ID) {
        setVisualizacao(null);
      }
      setMixParaExcluir(null);
      addToast('success', `Mix "${mix.NOME || `Mix #${mix.ID}`}" excluído.`);
      await loadMixes();
    } catch (error) {
      console.error('Falha ao excluir mix:', error);
      addToast('error', 'Não foi possível excluir este mix.');
    } finally {
      setExcluindoMix(false);
    }
  }

  async function duplicarMix(mix: MixResumo) {
    if (duplicatingMixId) return;

    setDuplicatingMixId(mix.ID);
    try {
      const itensMix = await loadItensMix(mix.ID);
      const nomeCopia = `${mix.NOME || `Mix #${mix.ID}`} - Cópia`;

      const criado = await callSFMutation(SF.mixCriar, {
        nome: escapeSqlParam(nomeCopia),
        descricao: escapeSqlParam(mix.DESCRICAO || ''),
        clienteId: String(mix.ID_CLIENTE || ''),
        totalCusto: Number(mix.TOTAL_CUSTO || 0).toFixed(2),
        totalVenda: Number(mix.TOTAL_VENDA || 0).toFixed(2),
        margemMedia: Number(mix.MARGEM_MEDIA || 0).toFixed(2),
        dtCriacao: getBrasiliaTimestamp(),
        itensJson: serializarItens(itensMix),
      });

      if (!criado) {
        addToast('error', 'Não foi possível duplicar este mix.');
        return;
      }

      const novoMixId = Number((await callSF(SF.mixUltimoCriado, {}))[0]?.ID || 0);
      if (novoMixId) {
        setAbaAtiva('builder');
        setEditingMixId(novoMixId);
        setClienteId(String(mix.ID_CLIENTE || ''));
        setMixNome(nomeCopia);
        setDescricao(mix.DESCRICAO || '');
        setItens(itensMix);
      }

      addToast('success', 'Mix duplicado. A cópia já está aberta para edição.');
      await loadMixes();
    } catch (error) {
      console.error('Falha ao duplicar mix:', error);
      addToast('error', 'Não foi possível duplicar este mix.');
    } finally {
      setDuplicatingMixId(null);
    }
  }

  async function editarMix(mix: MixResumo) {
    let itensMix: ItemMix[] = [];
    try {
      itensMix = await loadItensMix(mix.ID);
    } catch (error) {
      console.error('Falha ao carregar mix para edição:', error);
      addToast('error', 'Não foi possível carregar os itens deste mix.');
      return;
    }
    setAbaAtiva('builder');
    setEditingMixId(mix.ID);
    setClienteId(String(mix.ID_CLIENTE || ''));
    setMixNome(mix.NOME || `Mix #${mix.ID}`);
    setDescricao(mix.DESCRICAO || '');
    setItens(itensMix);
    setBuscaItens('');
    setOrdenacaoItens('INCLUSAO');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function enviarMixParaHistorico(mix: MixResumo) {
    if (sendingHistoryMixId || usuarioLogadoId <= 0) return;

    setSendingHistoryMixId(mix.ID);
    try {
      const now = getBrasiliaTimestamp();

      const enviado = await callSFMutation(SF.mixEnviarHistorico, { mixId: String(mix.ID), dtEnvio: now });
      if (!enviado) {
        addToast('error', 'Não foi possível enviar o mix para o histórico.');
        return;
      }

      addToast('success', 'Mix enviado para o histórico do cliente.');
      await loadMixes();
    } catch (error) {
      console.error('Falha ao enviar mix para o histórico:', error);
      addToast('error', 'Não foi possível enviar o mix para o histórico.');
    } finally {
      setSendingHistoryMixId(null);
    }
  }

  async function saveSimulacao() {
    if (!clienteId || !mixNome.trim() || !itens.length || usuarioLogadoId <= 0) {
      return;
    }

    setSaving(true);
    try {
      // Cabecalho e itens sao gravados numa unica SF: nao existe mais a janela em que
      // os itens antigos ja foram apagados e os novos ainda nao entraram.
      const payload = {
        nome: escapeSqlParam(mixNome.trim()),
        descricao: escapeSqlParam(descricao.trim()),
        clienteId: String(Number(clienteId)),
        totalCusto: totais.custoTotal.toFixed(2),
        totalVenda: totais.vendaTotal.toFixed(2),
        margemMedia: totais.margemMedia.toFixed(2),
        itensJson: serializarItens(itens),
      };

      const ok = editingMixId
        ? await callSFMutation(SF.mixAtualizar, { ...payload, mixId: String(editingMixId) })
        : await callSFMutation(SF.mixCriar, { ...payload, dtCriacao: getBrasiliaTimestamp() });

      if (!ok) {
        addToast('error', 'Não foi possível salvar este mix.');
        return;
      }

      addToast('success', editingMixId ? 'Mix atualizado com sucesso.' : 'Mix salvo com sucesso.');
      clearBuilder();
      await loadMixes();
    } catch (error) {
      console.error('Falha ao salvar mix:', error);
      addToast('error', 'Não foi possível salvar este mix.');
    } finally {
      setSaving(false);
    }
  }

  function renderPrint(mixData: MixVisualizacao, printWindow: Window) {
    const totalVenda = mixData.itens.reduce((sum, item) => sum + getSubtotal(item), 0);
    const totalUnidades = mixData.itens.reduce((sum, item) => sum + item.quantidade, 0);
    const ticketMedio = totalUnidades > 0 ? totalVenda / totalUnidades : 0;
    const dataCriacao = String(mixData.mix.DT_CRIACAO || '').slice(0, 10) || 'Sem data';
    const nomeMix = escapeHtml(mixData.nomeMix);
    const cliente = escapeHtml(mixData.mix.CLIENTE || 'Cliente não informado');
    const descricao = escapeHtml(mixData.descricaoMix);

    const linhas = mixData.itens
      .map(
        (item, index) => `
          <tr>
            <td class="rank">${String(index + 1).padStart(2, '0')}</td>
            <td class="code">${escapeHtml(item.codigo || '-')}</td>
            <td class="foto">${fotoImpressa(item.produtoId)}</td>
            <td>
              <strong>${escapeHtml(item.nome)}</strong>
              <span>${escapeHtml(item.categoria || 'Sem categoria')}</span>
            </td>
            <td class="numeric">${item.quantidade}</td>
            <td class="numeric">${formatCurrency(item.precoVenda)}</td>
            <td class="numeric strong">${formatCurrency(getSubtotal(item))}</td>
          </tr>
        `,
      )
      .join('');

    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Mix ${nomeMix}</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              background: #ffffff;
              color: #1f2b1d;
              font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page { background: #ffffff; padding: 0; }
            .hero {
              border-bottom: 2px solid #2f8f3a;
              padding: 0 0 18px;
            }
            .brand { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
            .brand-logo { width: 178px; height: auto; display: block; }
            .doc-label { color: #5d665a; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-align: right; text-transform: uppercase; }
            h1 { margin: 24px 0 8px; color: #1f2b1d; font-size: 28px; line-height: 1.08; letter-spacing: -0.03em; }
            .subtitle { color: #5f675c; font-size: 13px; line-height: 1.5; }
            .meta { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; color: #5f675c; font-size: 12px; }
            .meta strong { color: #1f2b1d; }
            .summary { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #dfe7db; border-radius: 14px; overflow: hidden; margin: 18px 0 18px; }
            .kpi { background: #ffffff; padding: 14px 16px; border-left: 1px solid #dfe7db; }
            .kpi:first-child { border-left: none; }
            .kpi .label { color: #6c7569; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
            .kpi .value { margin-top: 7px; color: #1f2b1d; font-size: 20px; font-weight: 900; letter-spacing: -0.03em; }
            .kpi.primary .value { color: #2f8f3a; }
            .section-title { margin: 18px 0 8px; display: flex; align-items: end; justify-content: space-between; gap: 16px; }
            .section-title h2 { margin: 0; color: #1f2b1d; font-size: 15px; letter-spacing: -0.01em; }
            .section-title p { margin: 0; color: #6c7569; font-size: 10px; }
            table { width: 100%; border-collapse: collapse; background: #ffffff; }
            thead { display: table-header-group; }
            th { background: #f4f7f2; color: #51604d; text-align: left; font-size: 9px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; padding: 10px 8px; border-bottom: 1px solid #dfe7db; }
            td { color: #263022; padding: 10px 8px; font-size: 10px; border-bottom: 1px solid #edf2e9; vertical-align: top; }
            td strong { display: block; color: #1f2b1d; font-size: 12px; line-height: 1.25; }
            td span { display: block; margin-top: 3px; color: #758071; font-size: 10px; }
            .rank { width: 36px; color: #7a8575; font-weight: 900; }
            .code { width: 74px; color: #52604d; font-weight: 800; }
            .foto { width: 56px; padding-top: 6px; padding-bottom: 6px; }
            .foto img { display: block; width: 44px; height: 44px; object-fit: contain; }
            .numeric { text-align: right; white-space: nowrap; }
            .strong { color: #1b1c1a; font-weight: 900; }
            .footer { margin-top: 18px; display: flex; align-items: center; justify-content: space-between; color: #717a6d; font-size: 10px; }
            @media print {
              body { background: #ffffff; }
              .page { background: #ffffff; }
              .hero, .kpi, table { break-inside: avoid; }
              tr { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <main class="page">
            <section class="hero">
              <div class="brand">
                <div class="brand-mark">
                  <div>
                    <img class="brand-logo" src="${BENENUTRI_LOGO_DATA_URI}" alt="Grupo Benenutri" />
                  </div>
                </div>
                <div class="doc-label">Proposta Comercial<br />Mix Builder</div>
              </div>
              <h1>${nomeMix}</h1>
              <div class="subtitle">Mix comercial preparado para <strong>${cliente}</strong>${descricao ? ` com a seguinte observação: ${descricao}` : '.'}</div>
              <div class="meta">
                <span><strong>Cliente:</strong> ${cliente}</span>
                <span><strong>Data:</strong> ${escapeHtml(dataCriacao)}</span>
                <span><strong>Produtos:</strong> ${mixData.itens.length}</span>
                <span><strong>Unidades:</strong> ${totalUnidades}</span>
              </div>
            </section>

            <section class="summary">
              <div class="kpi primary"><div class="label">Valor Final</div><div class="value">${formatCurrency(totalVenda)}</div></div>
              <div class="kpi"><div class="label">Unidades</div><div class="value">${totalUnidades}</div></div>
              <div class="kpi"><div class="label">Preço Médio</div><div class="value">${formatCurrency(ticketMedio)}</div></div>
            </section>

            <section class="section-title">
              <h2>Composição do Mix</h2>
              <p>Valores unitários e subtotal por item</p>
            </section>

            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Código</th>
                  <th></th>
                  <th>Produto</th>
                  <th class="numeric">Qtd</th>
                  <th class="numeric">Preço Venda</th>
                  <th class="numeric">Subtotal</th>
                </tr>
              </thead>
              <tbody>${linhas}</tbody>
            </table>

            <div class="footer">
              <span>Documento gerado pelo Sales 360 para uso comercial.</span>
              <span>${cliente} · ${escapeHtml(dataCriacao)}</span>
            </div>
          </main>
        </body>
      </html>
    `);

    printWindow.document.close();

    // Imprime quando as fotos carregaram (ou falharam), com teto de 8 s: foto nunca segura o PDF.
    const imagens = Array.from(printWindow.document.images);
    const fotosProntas = Promise.all(
      imagens.map((img) => (img.complete ? null : new Promise((pronto) => { img.onload = pronto; img.onerror = pronto; }))),
    );
    void Promise.race([fotosProntas, new Promise((pronto) => window.setTimeout(pronto, 8000))]).then(() => {
      printWindow.focus();
      printWindow.print();
    });
  }

  // Produto sem foto fica com o espaco em branco, sem rotulo, alinhado com os demais.
  function fotoImpressa(produtoId: number) {
    const url = fotoDoProduto(produtoId);
    return url ? `<img src="${escapeHtml(url)}" alt="" />` : '';
  }

  async function imprimirMix(mix: MixResumo) {
    // A janela precisa ser aberta de forma sincrona, ainda dentro do gesto do usuario.
    // Abrir depois de um await faz o bloqueador de pop-up cancelar a impressao.
    const printWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!printWindow) {
      addToast('error', 'Libere os pop-ups deste site para gerar o PDF do mix.');
      return;
    }

    printWindow.document.write('<html><body style="font-family:Inter,Arial,sans-serif;padding:24px;color:#5f675c">Preparando o mix para impressão...</body></html>');

    try {
      const itensMix = await loadItensMix(mix.ID);
      await carregarFotos(itensMix.map((item) => item.produtoId));
      renderPrint(
        {
          mix,
          nomeMix: mix.NOME || `Mix #${mix.ID}`,
          descricaoMix: mix.DESCRICAO || '',
          itens: itensMix,
        },
        printWindow,
      );
    } catch (error) {
      console.error('Falha ao imprimir mix:', error);
      printWindow.close();
      addToast('error', 'Não foi possível gerar o PDF deste mix.');
    }
  }

  // Monta um MixResumo sintetico a partir do que esta na tela, para reaproveitar o
  // mesmo layout de impressao dos mixes ja salvos sem precisar gravar antes.
  function montarMixAtual(): MixVisualizacao {
    const cliente = clientes.find((c) => String(c.ID) === clienteId);
    const nome = mixNome.trim() || 'Mix sem nome';
    return {
      mix: {
        ID: editingMixId || 0,
        NOME: nome,
        DESCRICAO: descricao.trim(),
        ID_CLIENTE: Number(clienteId) || 0,
        ID_USUARIO_CRIACAO: usuarioLogadoId,
        DT_CRIACAO: getBrasiliaTimestamp(),
        TOTAL_CUSTO: totais.custoTotal,
        TOTAL_VENDA: totais.vendaTotal,
        MARGEM_MEDIA: totais.margemMedia,
        CLIENTE: cliente?.NOME_FANTASIA || 'Cliente nao informado',
      },
      nomeMix: nome,
      descricaoMix: descricao.trim(),
      itens,
    };
  }

  async function imprimirMixAtual() {
    if (!itens.length) return;
    // A janela precisa abrir dentro do gesto do usuario; aqui nao ha await antes dela.
    const printWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!printWindow) {
      addToast('error', 'Libere os pop-ups deste site para gerar o PDF do mix.');
      return;
    }
    await carregarFotos(itens.map((item) => item.produtoId));
    renderPrint(montarMixAtual(), printWindow);
  }

  function exportarCsvMixAtual() {
    if (!itens.length) return;

    const cabecalho = ['#', 'Codigo', 'Produto', 'Categoria', 'Custo Unitario', 'Quantidade', 'Preco Venda', 'CMV %', 'Mark up %', 'Margem Bruta %', 'Preco Concorrente', 'Subtotal'];
    const linhas = itens.map((item, index) => [
      csvCelula(index + 1),
      csvCelula(item.codigo),
      csvCelula(item.nome),
      csvCelula(item.categoria || ''),
      csvNumero(item.custoUnitario),
      csvCelula(item.quantidade),
      csvNumero(item.precoVenda),
      csvNumero(getCmvItem(item)),
      csvNumero(getMarkupItem(item)),
      csvNumero(item.margemPercent),
      csvNumero(item.precoConcorrente),
      csvNumero(getSubtotal(item)),
    ].join(';'));

    const totalLinha = [
      csvCelula(''), csvCelula(''), csvCelula('TOTAL'), csvCelula(''),
      csvNumero(totais.custoTotal),
      csvCelula(totais.unidades),
      csvCelula(''),
      csvNumero(totais.cmvTotal),
      csvNumero(totais.markupTotal),
      csvNumero(totais.margemMedia),
      csvCelula(''),
      csvNumero(totais.vendaTotal),
    ].join(';');

    const csv = [cabecalho.map(csvCelula).join(';'), ...linhas, totalLinha].join('\r\n');
    // BOM para o Excel reconhecer os acentos.
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const nomeArquivo = `${(mixNome.trim() || 'mix').replace(/[^\w-]+/g, '-').toLowerCase()}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addToast('success', 'Planilha do mix exportada.');
  }

  function focarCatalogo() {
    const campo = catalogoInputRef.current;
    if (!campo) return;
    campo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campo.focus();
  }

  function renderMixActionsMenu(mix: MixResumo, escopo: 'mobile' | 'row', align: 'left' | 'right' = 'right') {
    const menuKey = `${escopo}-${mix.ID}`;
    const isOpen = activeActionsKey === menuKey;
    const itemClassName = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition hover:bg-[var(--color-surface-container)] disabled:cursor-not-allowed disabled:opacity-50';

    async function runAction(action: () => void | Promise<void>) {
      setActiveActionsKey(null);
      await action();
    }

    return (
      <div className="inline-flex">
        <button
          type="button"
          onClick={(event) => {
            if (isOpen) {
              setActiveActionsKey(null);
              return;
            }
            setActiveActionsAnchor(event.currentTarget);
            setActiveActionsKey(menuKey);
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-[var(--color-surface-container)]"
          title="Mais opções"
          aria-label="Mais opções do mix"
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <MoreVertical size={16} />
        </button>

        <DropdownMenu
          open={isOpen}
          onClose={() => setActiveActionsKey(null)}
          anchorEl={activeActionsAnchor}
          align={align}
          width={224}
        >
          <button type="button" role="menuitem" onClick={() => runAction(() => openVisualizacao(mix))} className={itemClassName}>
            <Eye size={15} /> Visualizar
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(() => editarMix(mix))} className={itemClassName}>
            <Pencil size={15} /> Editar Mix
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(() => duplicarMix(mix))} disabled={duplicatingMixId === mix.ID} className={itemClassName}>
            <Copy size={15} /> Duplicar Mix
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(() => enviarMixParaHistorico(mix))} disabled={sendingHistoryMixId === mix.ID || usuarioLogadoId <= 0} className={itemClassName}>
            <Send size={15} /> Enviar ao Histórico
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(() => imprimirMix(mix))} className={itemClassName}>
            <Printer size={15} /> Imprimir/PDF
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(() => setMixParaExcluir(mix))} className={`${itemClassName} text-red-600 hover:bg-red-50`}>
            <Trash2 size={15} /> Excluir
          </button>
        </DropdownMenu>
      </div>
    );
  }

  useEffect(() => {
    if (!visualizacao) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setVisualizacao(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visualizacao]);

  function renderMixPagination() {
    if (loadingMixes || (mixPage === 0 && !mixHasNextPage)) return null;

    const primeiro = mixPage * MIX_PAGE_SIZE + 1;
    const ultimo = mixPage * MIX_PAGE_SIZE + mixes.length;
    const botao = 'inline-flex h-9 items-center gap-1 rounded-full px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';

    return (
      <div
        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Exibindo {primeiro}-{ultimo}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={botao}
            style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text)' }}
            disabled={mixPage === 0}
            onClick={() => loadMixes(mixPage - 1)}
          >
            <ChevronLeft size={15} /> Anterior
          </button>
          <button
            type="button"
            className={botao}
            style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text)' }}
            disabled={!mixHasNextPage}
            onClick={() => loadMixes(mixPage + 1)}
          >
            Próxima <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  const clientesOptions = useMemo(
    () => clientes.map((cliente: any) => ({
      value: String(cliente.ID),
      label: `${cliente.ID} - ${cliente.NOME_FANTASIA}`,
      searchText: `${cliente.ID} ${cliente.NOME_FANTASIA} ${cliente.RAZAO_SOCIAL || ''}`,
    })),
    [clientes],
  );

  const canSave = Boolean(clienteId && mixNome.trim() && itens.length && usuarioLogadoId > 0);
  // O botao desabilitado nao dizia o que faltava; a mensagem acompanha o mesmo criterio.
  const motivoBloqueioSalvar = !clienteId
    ? 'Selecione o cliente'
    : !mixNome.trim()
      ? 'Informe o nome do mix'
      : !itens.length
        ? 'Adicione ao menos um produto'
        : usuarioLogadoId > 0 ? '' : 'Usuário não identificado';

  const gridColunas = getItemGridColumns(modoComparativo);
  const mostrarResultadosCatalogo = Boolean(clienteId) && produtoBusca.trim().length >= 1;
  const mostrarControlesLista = itens.length > 5;

  return (
    <div className="animate-fadeIn pb-24">
      {/* Sem overflow-hidden: o dropdown do Select de cliente e absoluto e era recortado pela
          borda do card. Nenhum filho pinta fundo ate os cantos, entao o raio continua limpo. */}
      <div className="rounded-2xl ambient-float" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
              <Package2 size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-extrabold" style={{ color: 'var(--color-text)' }}>Mix Builder</h1>
              <p className="label-ui text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>SIMULADOR DE MARGENS</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {editingMixId ? (
              <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: '#eef3ff', color: '#2e5cc4' }}>
                Editando Mix #{editingMixId}
                <button
                  type="button"
                  onClick={clearBuilder}
                  title="Cancelar edição"
                  aria-label="Cancelar edição"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full transition hover:bg-white/70"
                >
                  <X size={12} />
                </button>
              </span>
            ) : null}

            <div className="flex h-10 items-center gap-1 rounded-full p-1" style={{ backgroundColor: 'var(--color-surface-container)' }}>
              {([
                { key: 'builder', label: 'Construtor', badge: itens.length },
                { key: 'historico', label: 'Meus Mix', badge: 0 },
              ] as const).map((aba) => {
                const active = abaAtiva === aba.key;
                return (
                  <button
                    key={aba.key}
                    type="button"
                    onClick={() => setAbaAtiva(aba.key)}
                    className="inline-flex h-8 items-center gap-2 rounded-full px-4 text-sm font-semibold transition"
                    style={{
                      backgroundColor: active ? 'var(--color-surface)' : 'transparent',
                      color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
                      boxShadow: active ? '0 1px 3px rgba(27,28,26,0.10)' : 'none',
                    }}
                  >
                    {aba.label}
                    {aba.badge > 0 ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
                        {aba.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {abaAtiva === 'builder' ? (
          <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-3">
                <label className="mb-1 block text-xs label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  Cliente <span className="text-red-500">*</span>
                </label>
                <Select
                  value={clienteId}
                  onChange={setClienteId}
                  placeholder="Selecione o cliente..."
                  searchable
                  searchPlaceholder="Buscar cliente..."
                  options={clientesOptions}
                />
              </div>

              <div className="min-w-0 xl:col-span-3">
                <label className="mb-1 block text-xs label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  Nome do Mix <span className="text-red-500">*</span>
                </label>
                <input
                  value={mixNome}
                  onChange={(e) => setMixNome(e.target.value)}
                  placeholder="Ex.: Campanha de Verão"
                  className="h-[38px] w-full rounded-lg px-3 text-sm outline-none placeholder:text-[var(--color-text-secondary)]"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div className="min-w-0 sm:col-span-2 xl:col-span-6">
                <label className="mb-1 block text-xs label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Descrição</label>
                <input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Opcional: detalhes deste mix..."
                  className="h-[38px] w-full rounded-lg px-3 text-sm outline-none placeholder:text-[var(--color-text-secondary)]"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {abaAtiva === 'builder' ? (
        <div className="mt-4 space-y-4">
          <div className="overflow-hidden rounded-2xl ambient-float" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div
              className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center"
              style={{ borderBottom: mostrarResultadosCatalogo ? '1px solid var(--color-border)' : 'none' }}
            >
              <div className="min-w-0 lg:w-52 lg:shrink-0">
                <h2 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>Catálogo de produtos</h2>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Clique no produto para incluir</p>
              </div>

              <div className="flex h-[38px] shrink-0 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-surface-container)', border: '1px solid var(--color-border)' }}>
                {(['PADRAO', 'ESPECIAL'] as const).map((tipo) => {
                  const active = tipoCustoSelecionado === tipo;
                  return (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setTipoCustoSelecionado(tipo)}
                      className="px-4 text-xs font-semibold transition"
                      style={{
                        backgroundColor: active ? 'var(--color-primary)' : 'transparent',
                        color: active ? '#fff' : 'var(--color-text-secondary)',
                      }}
                    >
                      {tipo === 'PADRAO' ? 'Custo padrão' : 'Custo especial'}
                    </button>
                  );
                })}
              </div>

              <div
                className="flex h-[38px] min-w-0 flex-1 items-center rounded-lg px-3"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  opacity: clienteId ? 1 : 0.6,
                }}
              >
                <Search size={16} className="mr-2 shrink-0 text-[var(--color-text-secondary)]" />
                <input
                  ref={catalogoInputRef}
                  value={produtoBusca}
                  disabled={!clienteId}
                  onChange={(e) => setProdutoBusca(e.target.value)}
                  placeholder={clienteId ? 'Buscar produto por nome ou código...' : 'Selecione um cliente para liberar o catálogo de custos'}
                  className="w-full bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-secondary)] disabled:cursor-not-allowed"
                />
                {produtoBusca ? (
                  <button
                    type="button"
                    onClick={() => setProdutoBusca('')}
                    aria-label="Limpar busca"
                    className="ml-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-container)]"
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>
            </div>

            {mostrarResultadosCatalogo ? (
              <div className="max-h-[280px] overflow-y-auto px-3 py-2">
                {loadingProdutos ? (
                  <p className="px-1 py-5 text-center text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    Buscando produtos na gestão de custos...
                  </p>
                ) : !produtosFiltrados.length ? (
                  <p className="px-1 py-5 text-center text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    Nenhum produto encontrado para "{produtoBusca.trim()}".
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {produtosFiltrados.map((p) => {
                      const jaNoMix = itens.some((item) => item.produtoId === p.PRODUCT_ID);
                      const carregandoCusto = loadingCostProductId === p.PRODUCT_ID;
                      return (
                        <button
                          key={p.PRODUCT_ID}
                          type="button"
                          disabled={jaNoMix || Boolean(loadingCostProductId)}
                          onClick={() => addProduto(p)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:border-[var(--color-primary-light)] hover:bg-[var(--color-surface-container)] disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: 'var(--color-surface-lowest)',
                            border: '1px solid var(--color-border)',
                            opacity: jaNoMix ? 0.6 : 1,
                          }}
                        >
                          <FotoProduto url={fotoDe(p.CODPROD)} nome={p.NOME} tocavel={false} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{p.NOME}</span>
                            <span className="block truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                              Cód: {p.CODIGO}{p.CATEGORIA ? ` · ${p.CATEGORIA}` : ''}
                            </span>
                          </span>
                          {jaNoMix ? (
                            <span className="shrink-0 text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>No mix</span>
                          ) : carregandoCusto ? (
                            <span className="shrink-0 text-[11px] font-semibold" style={{ color: 'var(--color-primary)' }}>Custo...</span>
                          ) : (
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
                              <Plus size={15} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {custosMinutos !== null && custosMinutos > 120 ? (
            <div className="flex items-start gap-2 rounded-2xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                Custos sincronizados há {custosMinutos >= 1440
                  ? `${Math.floor(custosMinutos / 1440)} dia(s)`
                  : `${Math.floor(custosMinutos / 60)}h`}. Os valores podem estar desatualizados.
              </span>
            </div>
          ) : null}

          {costAlert ? (
            <div className="flex items-start gap-2 rounded-2xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{costAlert}</span>
            </div>
          ) : null}

              <div className="rounded-2xl ambient-float" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>Itens do mix</h2>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {totais.itens} produto(s) · {totais.unidades} unidade(s)
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {mostrarControlesLista ? (
                      <>
                        <div className="flex h-[38px] items-center rounded-lg px-3" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                          <Search size={15} className="mr-2 shrink-0 text-[var(--color-text-secondary)]" />
                          <input
                            value={buscaItens}
                            onChange={(e) => setBuscaItens(e.target.value)}
                            placeholder="Filtrar itens..."
                            className="w-32 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-secondary)] sm:w-40"
                          />
                        </div>
                        <Select
                          className="w-48"
                          value={ordenacaoItens}
                          onChange={(value) => setOrdenacaoItens(value as OrdenacaoItens)}
                          options={ORDENACOES}
                        />
                      </>
                    ) : null}

                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={exportMenuAberto}
                      disabled={!itens.length}
                      onClick={(event) => {
                        if (exportMenuAberto) {
                          setExportMenuAberto(false);
                          return;
                        }
                        setExportMenuAnchor(event.currentTarget);
                        setExportMenuAberto(true);
                      }}
                      className="inline-flex h-[38px] items-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                      title={itens.length ? 'Exportar este mix' : 'Adicione produtos para exportar'}
                    >
                      <Download size={15} /> Exportar
                    </button>

                    <DropdownMenu
                      open={exportMenuAberto}
                      onClose={() => setExportMenuAberto(false)}
                      anchorEl={exportMenuAnchor}
                      align="right"
                      width={236}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setExportMenuAberto(false); imprimirMixAtual(); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition hover:bg-[var(--color-surface-container)]"
                      >
                        <Printer size={15} /> Imprimir / PDF
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setExportMenuAberto(false); exportarCsvMixAtual(); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition hover:bg-[var(--color-surface-container)]"
                      >
                        <FileSpreadsheet size={15} /> Exportar planilha (CSV)
                      </button>
                    </DropdownMenu>

                    <button
                      type="button"
                      onClick={() => setModoComparativo((atual) => !atual)}
                      className="inline-flex h-[38px] items-center gap-2 rounded-lg px-3 text-sm font-semibold transition"
                      style={{
                        backgroundColor: modoComparativo ? 'var(--color-primary)' : 'var(--color-surface)',
                        border: `1px solid ${modoComparativo ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        color: modoComparativo ? '#fff' : 'var(--color-text-secondary)',
                      }}
                      title="Mostrar colunas de preço do concorrente"
                    >
                      <ArrowLeftRight size={15} /> Comparativo
                    </button>
                  </div>
                </div>

                <div className="space-y-3 px-3 py-3 md:hidden">
                  {itensView.map(({ item, idx }) => {
                    const subtotal = getSubtotal(item);
                    const cmv = getCmvItem(item);
                    const cmvConc = getCmvConcorrente(item);
                    const tone = getMargemTone(item.margemPercent);
                    return (
                      <article
                        key={`mobile-${item.produtoId}`}
                        className="rounded-2xl p-3"
                        style={{
                          backgroundColor: 'var(--color-surface-lowest)',
                          border: `1px solid ${item.margemPercent < 20 ? '#f4c7c3' : 'var(--color-border)'}`,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <FotoProduto url={fotoDe(item.produtoId)} nome={item.nome} tamanho="md" />
                            <div className="min-w-0">
                              <p className="text-base font-semibold text-[var(--color-text)]">{idx + 1}. {item.nome}</p>
                              <p className="text-xs text-[var(--color-text-secondary)]">Cód: {item.codigo}</p>
                              {item.custoAlerta ? <p className="mt-1 text-xs font-semibold text-orange-700">Custo zero: verificar fonte de custos</p> : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            aria-label={`Remover ${item.nome}`}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div className="mt-3 text-sm">
                          <span className="text-[var(--color-text-secondary)]">Custo:</span>
                          <div className="mt-1">{renderCostDropdown(item, idx)}</div>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                            Quantidade
                            <input
                              type="number"
                              min={1}
                              value={item.quantidade}
                              onChange={(e) => updateQuantidade(idx, Number(e.target.value || 1))}
                              className="mt-1 h-10 w-full rounded-lg px-2 text-right text-sm"
                              style={{ backgroundColor: 'var(--color-surface-container)', border: '1px solid var(--color-border)' }}
                            />
                          </label>
                          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                            Preço venda
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.precoVenda.toFixed(2)}
                              onChange={(e) => updatePrecoVenda(idx, Number(e.target.value || 0))}
                              className="mt-1 h-10 w-full rounded-lg px-2 text-right text-sm font-semibold"
                              style={{ backgroundColor: 'var(--color-surface-container)', border: '1px solid var(--color-border)' }}
                            />
                          </label>
                          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                            Margem Bruta %
                            <input
                              type="number"
                              min={0}
                              max={95}
                              step={0.01}
                              value={item.margemPercent.toFixed(2)}
                              onChange={(e) => updateMargem(idx, Number(e.target.value || 0))}
                              className="mt-1 h-10 w-full rounded-lg px-2 text-right text-sm font-semibold"
                              style={{ backgroundColor: 'var(--color-surface-container)', border: '1px solid var(--color-border)', color: tone.color }}
                            />
                          </label>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-[var(--color-text-secondary)]">CMV:</span> <strong>{cmv.toFixed(1)}%</strong></div>
                          <div><span className="text-[var(--color-text-secondary)]">Mark up:</span> <strong>{getMarkupItem(item).toFixed(1)}%</strong></div>
                          <div className="col-span-2 text-right text-base font-bold text-green-700">{formatCurrency(subtotal)}</div>
                        </div>

                        {modoComparativo ? (
                          <div className="mt-3 grid grid-cols-2 items-end gap-2 border-t border-dashed pt-3 text-sm" style={{ borderColor: 'var(--color-border)' }}>
                            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                              Preço concorrente
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={item.precoConcorrente || ''}
                                onChange={(e) => updateConcorrente(idx, Number(e.target.value || 0))}
                                className="mt-1 h-10 w-full rounded-lg px-2 text-right text-sm"
                                style={{ backgroundColor: 'var(--color-surface-container)', border: '1px solid var(--color-border)' }}
                              />
                            </label>
                            <div className="pb-2 text-right">
                              <span className="text-[var(--color-text-secondary)]">CMV Conc.:</span>{' '}
                              <strong>{item.precoConcorrente > 0 ? `${cmvConc.toFixed(1)}%` : '—'}</strong>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                  {!itens.length ? (
                    <div className="flex flex-col items-center rounded-2xl px-4 py-10 text-center" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text-secondary)' }}>
                        <Package2 size={22} />
                      </span>
                      <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Nenhum produto no mix ainda</p>
                      <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        {clienteId ? 'Use o catálogo acima para incluir produtos.' : 'Selecione um cliente para liberar o catálogo de custos.'}
                      </p>
                      <button
                        type="button"
                        onClick={focarCatalogo}
                        className="mt-3 inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition"
                        style={{ backgroundColor: 'var(--color-primary)' }}
                      >
                        <Search size={15} /> Buscar produtos
                      </button>
                    </div>
                  ) : null}
                  {itens.length > 0 && !itensView.length ? (
                    <div className="rounded-2xl px-4 py-10 text-center text-sm" style={{ backgroundColor: 'var(--color-surface-lowest)', color: 'var(--color-text-secondary)' }}>
                      Nenhum item corresponde ao filtro.
                    </div>
                  ) : null}
                </div>

                <div className="hidden md:block">
                  <div className="max-h-[60vh] overflow-auto rounded-b-2xl">
                    <div style={{ minWidth: modoComparativo ? LARGURA_MINIMA_TABELA_COMPARATIVO : LARGURA_MINIMA_TABELA }}>
                    <div
                      className="sticky top-0 z-10 grid items-center px-3 py-2.5 text-[11px] label-ui font-semibold"
                      style={{
                        gridTemplateColumns: gridColunas,
                        backgroundColor: 'var(--color-surface-container)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      <div>#</div>
                      <div>Produto</div>
                      <div className="text-right">Custo Unit.</div>
                      <div className="text-center">Qtd</div>
                      <div className="text-right">Preço Venda</div>
                      <div className="text-right" title="Custo ÷ preço de venda">CMV</div>
                      <div className="text-right" title="(Preço de venda − custo) ÷ custo">Mark up</div>
                      <div className="text-right" title="(Preço de venda − custo) ÷ preço de venda">Margem Bruta %</div>
                      <div className="text-right">Subtotal</div>
                      {modoComparativo ? <div className="ml-3 pl-3 text-right" style={APOIO_BORDA} title="Só referência: não entra nos totais do mix">Concorrente</div> : null}
                      {modoComparativo ? <div className="text-center">CMV Conc.</div> : null}
                      <div />
                    </div>

                    <div style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
                      {itensView.map(({ item, idx }, posicao) => {
                        const subtotal = getSubtotal(item);
                        const cmv = getCmvItem(item);
                        const cmvConc = getCmvConcorrente(item);
                        const tone = getMargemTone(item.margemPercent);
                        const cmvConcTone = getCmvTone(cmvConc);
                        const markup = getMarkupItem(item);
                        const margemBaixa = item.margemPercent < 20;
                        return (
                          <div
                            key={item.produtoId}
                            className="grid items-center px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-surface-low)]"
                            style={{
                              gridTemplateColumns: gridColunas,
                              color: 'var(--color-text)',
                              borderTop: posicao === 0 ? 'none' : '1px solid var(--color-border)',
                              backgroundColor: margemBaixa ? '#fdf6f5' : undefined,
                            }}
                          >
                            <div className="text-[var(--color-text-secondary)]">{idx + 1}</div>

                            <div className="flex min-w-0 items-center gap-3 pr-3">
                              <FotoProduto url={fotoDe(item.produtoId)} nome={item.nome} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[var(--color-text)]" title={item.nome}>{item.nome}</p>
                                <p className="truncate text-xs text-[var(--color-text-secondary)]">Cód: {item.codigo}</p>
                                {item.custoAlerta ? <p className="mt-0.5 text-xs font-semibold text-orange-700">Custo zero: verificar fonte</p> : null}
                              </div>
                            </div>

                            <div>{renderCostDropdown(item, idx)}</div>

                            <div className="text-center">
                              <input
                                type="number"
                                min={1}
                                value={item.quantidade}
                                aria-label={`Quantidade de ${item.nome}`}
                                onChange={(e) => updateQuantidade(idx, Number(e.target.value || 1))}
                                className="h-9 w-14 rounded-lg text-center text-sm"
                                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                              />
                            </div>

                            <div className="flex justify-end">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={item.precoVenda.toFixed(2)}
                                aria-label={`Preço de venda de ${item.nome}`}
                                onChange={(e) => updatePrecoVenda(idx, Number(e.target.value || 0))}
                                className="h-9 w-[104px] rounded-lg px-2 text-right text-sm font-semibold"
                                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                              />
                            </div>

                            <div className="text-right text-sm tabular-nums">{cmv.toFixed(1)}%</div>

                            <div className="text-right text-sm tabular-nums">{markup.toFixed(1)}%</div>

                            <div className="flex justify-end">
                              <input
                                type="number"
                                min={0}
                                max={95}
                                step={0.01}
                                value={item.margemPercent.toFixed(2)}
                                aria-label={`Margem bruta de ${item.nome}`}
                                onChange={(e) => updateMargem(idx, Number(e.target.value || 0))}
                                className="h-9 w-[84px] rounded-lg px-2 text-right text-sm font-semibold"
                                style={{ backgroundColor: 'var(--color-surface)', border: `1px solid ${margemBaixa ? '#e8b4ae' : 'var(--color-border)'}`, color: tone.color }}
                              />
                            </div>

                            <div className="text-right text-sm font-bold" style={{ color: '#0b8f3f' }}>{formatCurrency(subtotal)}</div>

                            {modoComparativo ? (
                              <div className="ml-3 pl-3 text-right" style={APOIO_BORDA}>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={item.precoConcorrente || ''}
                                  placeholder="0,00"
                                  aria-label={`Preço do concorrente para ${item.nome}`}
                                  onChange={(e) => updateConcorrente(idx, Number(e.target.value || 0))}
                                  className="h-9 w-24 rounded-lg px-2 text-right text-sm"
                                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                                />
                              </div>
                            ) : null}

                            {modoComparativo ? (
                              <div className="text-center">
                                {item.precoConcorrente > 0 ? (
                                  <span className="rounded-full px-2 py-1 text-xs font-bold" style={{ backgroundColor: cmvConcTone.bg, color: cmvConcTone.color }}>
                                    {cmvConc.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>—</span>
                                )}
                              </div>
                            ) : null}

                            <div className="text-right">
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                aria-label={`Remover ${item.nome}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-container)] hover:text-red-600"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {!itens.length ? (
                        <div className="flex flex-col items-center px-4 py-14 text-center">
                          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text-secondary)' }}>
                            <Package2 size={22} />
                          </span>
                          <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Nenhum produto no mix ainda</p>
                          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            {clienteId ? 'Use o catálogo acima para incluir produtos.' : 'Selecione um cliente para liberar o catálogo de custos.'}
                          </p>
                          <button
                            type="button"
                            onClick={focarCatalogo}
                            className="mt-3 inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition"
                            style={{ backgroundColor: 'var(--color-primary)' }}
                          >
                            <Search size={15} /> Buscar produtos
                          </button>
                        </div>
                      ) : null}

                      {itens.length > 0 && !itensView.length ? (
                        <div className="px-4 py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                          Nenhum item corresponde ao filtro "{buscaItens.trim()}".
                        </div>
                      ) : null}
                    </div>

                    {itens.length ? (
                      <div
                        className="sticky bottom-0 z-10 grid items-center px-3 py-2.5 text-sm font-bold"
                        style={{
                          gridTemplateColumns: gridColunas,
                          backgroundColor: 'var(--color-surface-container)',
                          borderTop: '1px solid var(--color-border)',
                          color: 'var(--color-text)',
                        }}
                      >
                        <div />
                        <div className="text-xs label-ui" style={{ color: 'var(--color-text-secondary)' }}>Total do mix</div>
                        <div className="text-right">{formatCurrency(totais.custoTotal)}</div>
                        <div className="text-center">{totais.unidades}</div>
                        <div />
                        <div className="text-right tabular-nums">{totais.cmvTotal.toFixed(1)}%</div>
                        <div className="text-right tabular-nums">{totais.markupTotal.toFixed(1)}%</div>
                        <div className="text-right" style={{ color: totais.margemTone.color }}>{totais.margemMedia.toFixed(2)}%</div>
                        <div className="text-right" style={{ color: '#0b8f3f' }}>{formatCurrency(totais.vendaTotal)}</div>
                        {modoComparativo ? <div className="ml-3 h-full" style={APOIO_BORDA} /> : null}
                        {modoComparativo ? <div /> : null}
                        <div />
                      </div>
                    ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 z-20 mt-4 rounded-2xl glass-floating px-3 py-3 sm:px-4" style={{ border: '1px solid var(--color-border)' }}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
                    <div className="min-w-0 rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
                      <p className="text-[11px] label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Itens</p>
                      <p className="truncate text-xl font-display font-extrabold tabular-nums" style={{ color: 'var(--color-text)' }}>{totais.itens}</p>
                      <p className="truncate text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{totais.unidades} unidades</p>
                    </div>
                    <div className="min-w-0 rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
                      <p className="text-[11px] label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Custo Total</p>
                      <p className="truncate text-xl font-display font-extrabold tabular-nums" style={{ color: 'var(--color-text)' }} title={formatCurrency(totais.custoTotal)}>{formatCurrency(totais.custoTotal)}</p>
                    </div>
                    <div className="min-w-0 rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
                      <p className="text-[11px] label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Venda Total</p>
                      <p className="truncate text-xl font-display font-extrabold tabular-nums" style={{ color: '#0b8f3f' }} title={formatCurrency(totais.vendaTotal)}>{formatCurrency(totais.vendaTotal)}</p>
                    </div>
                    <div className="min-w-0 rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--color-surface-lowest)' }} title="(Venda total − custo total) ÷ custo total">
                      <p className="text-[11px] label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Mark up Médio</p>
                      <p className="truncate text-xl font-display font-extrabold tabular-nums" style={{ color: 'var(--color-text)' }}>{totais.markupTotal.toFixed(2)}%</p>
                      <p className="truncate text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>sobre o custo</p>
                    </div>
                    <div className="min-w-0 rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
                      <p className="text-[11px] label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Margem Bruta Média</p>
                      <p className="truncate text-xl font-display font-extrabold tabular-nums" style={{ color: totais.margemTone.color }}>{totais.margemMedia.toFixed(2)}%</p>
                      <p className="truncate text-[11px] label-ui font-semibold" style={{ color: totais.margemTone.color }}>{totais.margemTone.label}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch gap-1 lg:items-end">
                    <button
                      type="button"
                      onClick={() => saveSimulacao()}
                      disabled={saving || !canSave}
                      title={motivoBloqueioSalvar || undefined}
                      className="btn-pill-primary inline-flex h-11 w-full items-center justify-center gap-2 px-6 text-base font-semibold disabled:opacity-50 lg:w-auto lg:min-w-52"
                    >
                      <Save size={19} /> {saving ? 'Salvando...' : editingMixId ? 'Salvar alterações' : 'Salvar Mix'}
                    </button>
                    {motivoBloqueioSalvar ? (
                      <span className="text-center text-[11px] font-semibold lg:text-right" style={{ color: 'var(--color-text-secondary)' }}>
                        {motivoBloqueioSalvar} para salvar
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl ambient-float" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Meus Mix</h2>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Histórico de simulações criadas, com ações de visualizar, duplicar, enviar ao histórico e imprimir.</p>
            </div>
            <button
              type="button"
              onClick={() => loadMixes(mixPage)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold sm:w-auto"
              style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text)' }}
            >
              <FileText size={15} /> Atualizar
            </button>
          </div>

          <div className="space-y-3 px-3 py-4 md:hidden">
            {loadingMixes ? (
              <div className="rounded-2xl px-4 py-10 text-center text-sm" style={{ backgroundColor: 'var(--color-surface-lowest)', color: 'var(--color-text-secondary)' }}>Carregando mixes...</div>
            ) : null}
            {!loadingMixes && mixes.length === 0 ? (
              <div className="rounded-2xl px-4 py-10 text-center text-sm" style={{ backgroundColor: 'var(--color-surface-lowest)', color: 'var(--color-text-secondary)' }}>Nenhum mix salvo ainda.</div>
            ) : null}
            {!loadingMixes && mixes.map((mix) => {
              const margemTone = getMargemTone(Number(mix.MARGEM_MEDIA || 0));
              return (
                <article key={`mobile-mix-${mix.ID}`} className="rounded-2xl p-3" style={{ backgroundColor: 'var(--color-surface-lowest)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text-secondary)]">#{mix.ID}</p>
                      <p className="text-base font-semibold text-[var(--color-text)]">{mix.NOME || `Mix #${mix.ID}`}</p>
                      <p className="text-sm text-[var(--color-text-secondary)]">{mix.CLIENTE}</p>
                    </div>
                    <span className="rounded-full px-2 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--color-surface-container)', color: margemTone.color }}>{Number(mix.MARGEM_MEDIA || 0).toFixed(2)}%</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-[var(--color-text-secondary)]">Data:</span> <strong>{String(mix.DT_CRIACAO || '').slice(0, 10)}</strong></div>
                    <div><span className="text-[var(--color-text-secondary)]">Venda:</span> <strong>{formatCurrency(Number(mix.TOTAL_VENDA || 0))}</strong></div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    {renderMixActionsMenu(mix, 'mobile')}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto px-4 py-4 md:block">
            <div className="min-w-[900px] overflow-hidden rounded-2xl" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
              <div
                className="grid items-center px-4 py-3 text-[11px] label-ui font-semibold"
                style={{
                  gridTemplateColumns: '70px minmax(200px,1.3fr) minmax(170px,1fr) 110px 120px 100px 72px',
                  backgroundColor: 'var(--color-surface-container)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <div>ID</div>
                <div>Mix</div>
                <div>Cliente</div>
                <div>Data</div>
                <div className="text-right">Venda</div>
                <div className="text-right">Margem</div>
                <div className="text-right">Ações</div>
              </div>

              {loadingMixes ? (
                <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>Carregando mixes...</div>
              ) : null}

              {!loadingMixes && mixes.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>Nenhum mix salvo ainda.</div>
              ) : null}

              {!loadingMixes && mixes.map((mix, idx) => {
                const margemTone = getMargemTone(Number(mix.MARGEM_MEDIA || 0));
                return (
                  <div
                    key={mix.ID}
                    className="grid items-center px-4 py-3 text-sm transition-colors hover:bg-[var(--color-surface-low)]"
                    style={{
                      gridTemplateColumns: '70px minmax(200px,1.3fr) minmax(170px,1fr) 110px 120px 100px 72px',
                      borderTop: idx === 0 ? 'none' : '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <div className="font-semibold">#{mix.ID}</div>
                    <div className="min-w-0 pr-3">
                      <p className="truncate font-semibold text-[var(--color-text)]">{mix.NOME || `Mix #${mix.ID}`}</p>
                      {mix.DESCRICAO ? (
                        <p className="truncate text-xs text-[var(--color-text-secondary)]">{mix.DESCRICAO}</p>
                      ) : null}
                    </div>
                    <div className="truncate">{mix.CLIENTE}</div>
                    <div>{String(mix.DT_CRIACAO || '').slice(0, 10)}</div>
                    <div className="text-right font-semibold" style={{ color: '#0b8f3f' }}>{formatCurrency(Number(mix.TOTAL_VENDA || 0))}</div>
                    <div className="text-right font-semibold" style={{ color: margemTone.color }}>{Number(mix.MARGEM_MEDIA || 0).toFixed(2)}%</div>
                    <div className="flex items-center justify-end">
                      {renderMixActionsMenu(mix, 'row')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {renderMixPagination()}
        </div>
      )}

      {visualizacao ? (
        <div
          className="animate-fadeIn fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setVisualizacao(null);
          }}
        >
          <div className="animate-scaleIn flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-2xl" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
            <div className="flex items-start justify-between gap-3 px-4 py-4 sm:items-center sm:px-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="min-w-0">
                <h3 className="font-display text-2xl font-extrabold sm:text-3xl" style={{ color: 'var(--color-text)' }}>{visualizacao.nomeMix}</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Cliente: {visualizacao.mix.CLIENTE}</p>
              </div>
              <button type="button" onClick={() => setVisualizacao(null)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--color-surface-container)]">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4 xl:grid-cols-4" style={{ backgroundColor: 'var(--color-surface-low)' }}>
              <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
                <p className="text-[11px] label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Itens</p>
                <p className="text-2xl font-display font-extrabold">{visualizacao.itens.length}</p>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
                <p className="text-[11px] label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Unidades</p>
                <p className="text-2xl font-display font-extrabold">{visualizacao.itens.reduce((sum, item) => sum + item.quantidade, 0)}</p>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
                <p className="text-[11px] label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Valor Final</p>
                <p className="text-xl font-display font-extrabold text-green-700 sm:text-2xl">{formatCurrency(Number(visualizacao.mix.TOTAL_VENDA || 0))}</p>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
                <p className="text-[11px] label-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Criado em</p>
                <p className="text-lg font-semibold">{String(visualizacao.mix.DT_CRIACAO || '').slice(0, 10)}</p>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-4 py-4 sm:px-5">
              <div className="space-y-3 md:hidden">
                {visualizacao.itens.map((item, idx) => (
                  <article key={`mobile-view-${item.produtoId}-${idx}`} className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-lowest)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-start gap-3">
                      <FotoProduto url={fotoDe(item.produtoId)} nome={item.nome} tamanho="md" />
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--color-text)]">{item.nome}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">Cód: {item.codigo}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div><span style={{ color: 'var(--color-text-secondary)' }}>Qtd:</span> <strong>{item.quantidade}</strong></div>
                      <div><span style={{ color: 'var(--color-text-secondary)' }}>Preço:</span> <strong>{formatCurrency(item.precoVenda)}</strong></div>
                      <div className="col-span-2 text-right font-semibold text-green-700">{formatCurrency(getSubtotal(item))}</div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden rounded-xl md:block" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
                <div className="grid grid-cols-12 px-3 py-2 text-[11px] label-ui font-semibold" style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text-secondary)' }}>
                  <div className="col-span-5">Produto</div>
                  <div className="col-span-2 text-right">Qtd</div>
                  <div className="col-span-3 text-right">Preço</div>
                  <div className="col-span-2 text-right">Subtotal</div>
                </div>
                {visualizacao.itens.map((item, idx) => (
                  <div key={`${item.produtoId}-${idx}`} className="grid grid-cols-12 px-3 py-3 text-sm" style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--color-border)' }}>
                    <div className="col-span-5 flex min-w-0 items-center gap-3">
                      <FotoProduto url={fotoDe(item.produtoId)} nome={item.nome} />
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--color-text)]">{item.nome}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">Cód: {item.codigo}</p>
                      </div>
                    </div>
                    <div className="col-span-2 text-right">{item.quantidade}</div>
                    <div className="col-span-3 text-right">{formatCurrency(item.precoVenda)}</div>
                    <div className="col-span-2 text-right font-semibold text-green-700">{formatCurrency(getSubtotal(item))}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-5" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={() => duplicarMix(visualizacao.mix)}
                disabled={duplicatingMixId === visualizacao.mix.ID}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-50 sm:w-auto"
                style={{ backgroundColor: '#eef3ff', color: '#2e5cc4' }}
              >
                <Copy size={15} /> Duplicar Mix
              </button>
              <button
                type="button"
                onClick={() => enviarMixParaHistorico(visualizacao.mix)}
                disabled={sendingHistoryMixId === visualizacao.mix.ID || usuarioLogadoId <= 0}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-50 sm:w-auto"
                style={{ backgroundColor: '#e7f6ea', color: '#1f7d3f' }}
              >
                <Send size={15} /> Enviar ao Histórico
              </button>
              <button
                type="button"
                onClick={() => imprimirMix(visualizacao.mix)}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold sm:w-auto"
                style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text)' }}
              >
                <Printer size={15} /> Imprimir/PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={Boolean(mixParaExcluir)}
        onClose={() => setMixParaExcluir(null)}
        onConfirm={() => mixParaExcluir && excluirMix(mixParaExcluir)}
        loading={excluindoMix}
        title="Excluir mix"
        message={`Excluir "${mixParaExcluir?.NOME || `Mix #${mixParaExcluir?.ID ?? ''}`}" e todos os seus itens? Esta ação não pode ser desfeita.`}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Athenes — Exportador completo do conjunto bibliográfico para CSV (RFC 4180).
 *
 * Exporta metadados bibliográficos, pastas/coleções, campos completos do Zotero,
 * variáveis personalizadas do pesquisador e dados de estudo/fichamento/PDF.
 * Sem dependências externas; inclui BOM UTF-8 por padrão para abrir corretamente no Excel pt-BR.
 */
import { normalizarMapaVariaveis } from './athenes_variaveis_referencia.js';

const CAMPOS_ZOTERO_COBERTOS = new Set([
  'title', 'date', 'publicationTitle', 'bookTitle', 'proceedingsTitle', 'journalAbbreviation',
  'publisher', 'place', 'volume', 'issue', 'pages', 'DOI', 'ISBN', 'ISSN', 'url', 'language',
  'abstractNote', 'itemType', 'key'
]);

const ROTULOS_STATUS_LEITURA = {
  nao_lido: 'Não lido',
  em_leitura: 'Em leitura',
  lendo: 'Em leitura',
  lido: 'Lido',
  favorito: 'Favorito'
};

/** Escapa uma célula conforme RFC 4180 para o separador escolhido. */
export function escaparCelulaCsv(valor, separador = ';') {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  const precisaAspas = texto.includes(separador) || texto.includes('"') || texto.includes('\n') || texto.includes('\r');
  if (!precisaAspas) return texto;
  return `"${texto.replace(/"/g, '""')}"`;
}

/** Formata a lista de autores de um artigo como "Sobrenome, Prenome; Sobrenome2, Prenome2". */
export function formatarAutoresCsv(artigo) {
  const lista = artigo?.autores;
  if (Array.isArray(lista) && lista.length) {
    return lista.map(a => {
      if (!a) return '';
      if (typeof a === 'string') return a.trim();
      const sob = String(a.sobrenome || a.lastName || a.name || '').trim();
      const pre = String(a.prenome || a.firstName || '').trim();
      return sob && pre ? `${sob}, ${pre}` : (sob || pre);
    }).filter(Boolean).join('; ');
  }
  if (typeof lista === 'string') return lista.trim();
  if (Array.isArray(artigo?.criadores) && artigo.criadores.length) {
    return artigo.criadores.map(c => {
      const sob = String(c?.lastName || c?.name || '').trim();
      const pre = String(c?.firstName || '').trim();
      return sob && pre ? `${sob}, ${pre}` : (sob || pre);
    }).filter(Boolean).join('; ');
  }
  return '';
}

function primeiroAutorCsv(artigo) {
  const completo = formatarAutoresCsv(artigo);
  if (!completo) return '';
  return completo.split(';')[0].trim();
}

function textoLimpo(v) {
  return String(v ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairListaTexto(valor) {
  if (Array.isArray(valor)) {
    return valor.map(item => (typeof item === 'object' && item !== null ? (item.tag || item.nome || item.label || '') : item))
      .map(s => String(s || '').trim())
      .filter(Boolean);
  }
  if (typeof valor === 'string' && valor.trim()) {
    return valor.split(/[;,]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function resolverPastasTexto(artigo, mapaPastas) {
  const ids = new Set();
  if (artigo?.pastaId) ids.add(String(artigo.pastaId));
  if (Array.isArray(artigo?.pastasIds)) {
    for (const pid of artigo.pastasIds) if (pid) ids.add(String(pid));
  }
  const nomes = [];
  const obterNome = (id) => {
    if (!mapaPastas) return '';
    if (mapaPastas instanceof Map) return mapaPastas.get(id) || '';
    return mapaPastas[id] || '';
  };
  for (const id of ids) {
    const n = obterNome(id);
    if (n) nomes.push(String(n));
    else if (id === 'pasta_bib_raiz' || id === 'todas') nomes.push('Coleção Principal');
  }
  if (!nomes.length && Array.isArray(artigo?.colecoesZotero) && artigo.colecoesZotero.length) {
    for (const c of artigo.colecoesZotero) {
      const n = obterNome(String(c)) || String(c);
      if (n) nomes.push(n);
    }
  }
  return [...new Set(nomes)].join('; ');
}

function artigoPossuiPdf(artigo) {
  if (!artigo || artigo.pdfVerificadoInvalido) return false;
  if (artigo.pdfBlobUrl || artigo.temPdfLocal || artigo.pdfDataUrl) return true;
  const id = String(artigo.driveFileId || '').trim();
  return Boolean(id) && !/^drive_pdf_/.test(id);
}

function extrairNotasPagina(fichamento) {
  const mapa = fichamento?.notasPagina;
  if (!mapa || typeof mapa !== 'object') return [];
  const saida = [];
  for (const [pag, lista] of Object.entries(mapa)) {
    if (!Array.isArray(lista)) continue;
    for (const nota of lista) {
      const txt = textoLimpo(typeof nota === 'string' ? nota : (nota?.texto || nota?.conteudo || nota?.nota || ''));
      if (txt) saida.push(`p. ${pag}: ${txt}`);
    }
  }
  return saida;
}

function extrairCitacoesMarcadas(fichamento) {
  const lista = Array.isArray(fichamento?.citacoesMarcadas) ? fichamento.citacoesMarcadas : [];
  return lista.map(c => {
    const txt = textoLimpo(typeof c === 'string' ? c : (c?.texto || c?.trecho || c?.citacao || ''));
    if (!txt) return '';
    const pag = c?.pagina || c?.pag;
    return pag ? `(p. ${pag}) ${txt}` : txt;
  }).filter(Boolean);
}

/** Constrói um mapa `{ pastaId -> caminhoCompleto }` a partir da árvore de pastas de bibliografia. */
export function construirMapaCaminhosPastas(pastas = []) {
  const mapa = new Map();
  const visitar = (lista, prefixo = '') => {
    for (const p of lista || []) {
      if (!p?.id) continue;
      const nome = String(p.nome || p.label || p.id).trim();
      const caminho = prefixo ? `${prefixo} > ${nome}` : nome;
      mapa.set(String(p.id), caminho);
      if (p.chaveZotero) mapa.set(String(p.chaveZotero), caminho);
      if (Array.isArray(p.subpastas) && p.subpastas.length) visitar(p.subpastas, caminho);
    }
  };
  visitar(pastas);
  return mapa;
}

/**
 * Converte um registro do módulo de Relações (`src/core/athenes_relacoes.js`) para um objeto
 * compatível com `exportarBibliografiaParaCsv`, preservando `raw` quando presente.
 */
export function registroRelacaoParaArtigoCsv(registro) {
  if (!registro) return null;
  if (registro.raw && typeof registro.raw === 'object') {
    const pastaPaths = registro.meta?.folderPaths;
    if (Array.isArray(pastaPaths) && pastaPaths.length && !registro.raw._pastasResolvidasCsv) {
      return { ...registro.raw, _pastasResolvidasCsv: pastaPaths.join('; ') };
    }
    return registro.raw;
  }
  const f = registro.fields || {};
  const m = registro.meta || {};
  const t = registro.text || {};
  return {
    id: registro.id || '',
    titulo: f.title || registro.label || '',
    autores: Array.isArray(f.author) ? f.author : (f.author ? [f.author] : []),
    ano: f.year || m.year || '',
    publicacao: f.venue || '',
    editora: f.publisher || '',
    local: f.location || '',
    itemTypeZotero: f.type || '',
    doi: f.doi || '',
    idioma: f.language || '',
    palavrasChave: [...extrairListaTexto(f.keywords), ...extrairListaTexto(f.tags)],
    resumoOriginal: t.abstract || '',
    statusLeitura: m.statusLeitura || f.statusLeitura || '',
    corCapa: m.corCapaHex || f.corCapa || '',
    variaveisPersonalizadas: m.variaveis || {},
    _pastasResolvidasCsv: Array.isArray(m.folderPaths) ? m.folderPaths.join('; ') : extrairListaTexto(f.folder).join('; ')
  };
}

/**
 * Exporta um conjunto de artigos bibliográficos para texto CSV (RFC 4180).
 *
 * @param {Array<object>} artigos Lista de artigos selecionados para exportação.
 * @param {{
 *   separador?: ';' | ',',
 *   comBom?: boolean,
 *   incluirMetadados?: boolean,
 *   incluirCamposZotero?: boolean,
 *   incluirVariaveis?: boolean,
 *   incluirEstudo?: boolean,
 *   mapaPastas?: Map<string,string> | Record<string,string> | null
 * }} [opcoes]
 * @returns {{ csv: string, colunas: string[], totalLinhas: number, separador: string }}
 */
export function exportarBibliografiaParaCsv(artigos = [], opcoes = {}) {
  const {
    separador = ';',
    comBom = true,
    incluirMetadados = true,
    incluirCamposZotero = true,
    incluirVariaveis = true,
    incluirEstudo = true,
    mapaPastas = null
  } = opcoes;

  const sep = separador === ',' ? ',' : ';';
  const lista = Array.isArray(artigos) ? artigos.filter(Boolean) : [];

  const chavesZoteroExtras = [];
  if (incluirCamposZotero) {
    const vistas = new Set();
    for (const art of lista) {
      const cz = art?.camposZotero;
      if (!cz || typeof cz !== 'object') continue;
      for (const [k, v] of Object.entries(cz)) {
        if (CAMPOS_ZOTERO_COBERTOS.has(k) || vistas.has(k)) continue;
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          vistas.add(k);
          chavesZoteroExtras.push(k);
        }
      }
    }
    chavesZoteroExtras.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  const chavesVariaveis = [];
  if (incluirVariaveis) {
    const vistas = new Set();
    for (const art of lista) {
      const vars = normalizarMapaVariaveis(art?.variaveisPersonalizadas);
      for (const k of Object.keys(vars)) {
        if (!vistas.has(k)) {
          vistas.add(k);
          chavesVariaveis.push(k);
        }
      }
    }
    chavesVariaveis.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  const colunas = [];
  if (incluirMetadados) {
    colunas.push(
      'ID', 'Chave Zotero', 'Tipo', 'Título', 'Autores', 'Primeiro Autor', 'Ano',
      'Publicação / Periódico', 'Editora', 'Local', 'Volume', 'Número', 'Páginas',
      'DOI', 'ISBN', 'ISSN', 'URL', 'Idioma', 'Palavras-chave / Tags',
      'Pastas / Coleções', 'Resumo'
    );
  }
  for (const k of chavesZoteroExtras) colunas.push(`Zotero: ${k}`);
  for (const k of chavesVariaveis) colunas.push(`Variável: ${k}`);
  if (incluirEstudo) {
    colunas.push(
      'Status de Leitura', 'Cor da Capa', 'Possui PDF', 'Arquivo PDF', 'Google Drive ID',
      'Resumo Pessoal', 'Notas de Metodologia', 'Qtd. Citações Marcadas', 'Citações Marcadas',
      'Qtd. Notas de Página', 'Notas de Página', 'Atualizado em', 'Último Acesso em'
    );
  }

  const linhas = [colunas.map(c => escaparCelulaCsv(c, sep)).join(sep)];

  for (const art of lista) {
    const cz = (art?.camposZotero && typeof art.camposZotero === 'object') ? art.camposZotero : {};
    const fich = (art?.fichamento && typeof art.fichamento === 'object') ? art.fichamento : {};
    const vars = incluirVariaveis ? normalizarMapaVariaveis(art?.variaveisPersonalizadas) : {};
    const celulas = [];

    if (incluirMetadados) {
      const tags = [...new Set([
        ...extrairListaTexto(art.palavrasChave),
        ...extrairListaTexto(art.tags)
      ])].join('; ');
      const pastasTexto = art._pastasResolvidasCsv || resolverPastasTexto(art, mapaPastas);
      celulas.push(
        art.id || '',
        art.chaveZotero || art.chave || cz.key || '',
        art.itemTypeZotero || art.itemType || art.tipo || cz.itemType || '',
        textoLimpo(art.titulo || cz.title || ''),
        formatarAutoresCsv(art),
        primeiroAutorCsv(art),
        art.ano || cz.date || '',
        art.publicacao || art.revista || cz.publicationTitle || cz.bookTitle || cz.proceedingsTitle || '',
        art.editora || art.publisher || cz.publisher || '',
        art.local || art.cidade || cz.place || '',
        art.volume || cz.volume || '',
        art.numero || cz.issue || '',
        art.paginas || cz.pages || '',
        art.doi || art.DOI || cz.DOI || '',
        art.isbn || cz.ISBN || '',
        art.issn || cz.ISSN || '',
        art.url || cz.url || '',
        art.idioma || art.language || cz.language || '',
        tags,
        pastasTexto,
        textoLimpo(art.resumoOriginal || art.resumo || art.abstractNote || cz.abstractNote || '')
      );
    }

    for (const k of chavesZoteroExtras) {
      const val = cz[k];
      celulas.push(Array.isArray(val) ? val.join('; ') : textoLimpo(val ?? ''));
    }

    for (const k of chavesVariaveis) {
      const val = vars[k];
      celulas.push(Array.isArray(val) ? val.join(' | ') : String(val ?? ''));
    }

    if (incluirEstudo) {
      const citacoes = extrairCitacoesMarcadas(fich);
      const notasPag = extrairNotasPagina(fich);
      const statusRaw = String(art.statusLeitura || '').trim();
      const statusLabel = ROTULOS_STATUS_LEITURA[statusRaw] || statusRaw || 'Não lido';
      const temPdf = artigoPossuiPdf(art);
      const driveId = /^drive_pdf_/.test(String(art.driveFileId || '')) ? '' : String(art.driveFileId || '').trim();

      celulas.push(
        statusLabel,
        art.corCapa || '',
        temPdf ? 'Sim' : 'Não',
        art.driveFileName || '',
        driveId,
        textoLimpo(fich.resumoPessoal || ''),
        textoLimpo(fich.metodologiaNotas || ''),
        citacoes.length,
        citacoes.join(' | '),
        notasPag.length,
        notasPag.join(' | '),
        art.atualizadoEm || '',
        art.ultimoAcessoEm || ''
      );
    }

    linhas.push(celulas.map(c => escaparCelulaCsv(c, sep)).join(sep));
  }

  const corpo = linhas.join('\r\n');
  const csv = (comBom ? '\uFEFF' : '') + corpo;
  return { csv, colunas, totalLinhas: lista.length, separador: sep };
}

/** Gera e inicia o download do arquivo `.csv` no navegador. */
export function baixarBibliografiaCsv(artigos, opcoes = {}) {
  const resultado = exportarBibliografiaParaCsv(artigos, opcoes);
  const data = new Date().toISOString().slice(0, 10);
  const nomeBase = String(opcoes.nomeArquivo || `athenes-bibliografia-${data}`)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\.csv$/i, '')
    .slice(0, 100);
  const blob = new Blob([resultado.csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nomeBase}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return resultado;
}

// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Athenes — Variáveis personalizadas e metadados editoriais de referências.
 * Módulo puro em ES Modules para classificação (ex.: Inclusão/Exclusão), cores e status de leitura.
 */
import { lerConta, gravarConta, chaveConta } from './athenes_conta.js';

export const CHAVE_CATALOGO_VARIAVEIS = 'athenes_variaveis_catalogo';
const memoriaCatalogoPorConta = new Map();

const CHAVES_PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

export const PRESETS_VARIAVEIS_REFERENCIA = Object.freeze([
  Object.freeze({
    id: 'triagem',
    nome: 'Triagem (Inclusão / Exclusão)',
    tipo: 'selecao',
    opcoes: Object.freeze(['Incluído', 'Excluído', 'Talvez', 'Pendente'])
  }),
  Object.freeze({
    id: 'relevancia',
    nome: 'Relevância',
    tipo: 'selecao',
    opcoes: Object.freeze(['Alta', 'Média', 'Baixa'])
  }),
  Object.freeze({
    id: 'tipo_estudo',
    nome: 'Tipo de estudo',
    tipo: 'selecao',
    opcoes: Object.freeze(['Empírico', 'Teórico', 'Revisão', 'Estudo de caso'])
  }),
  Object.freeze({
    id: 'qualidade',
    nome: 'Qualidade metodológica',
    tipo: 'selecao',
    opcoes: Object.freeze(['Aprovado', 'Com ressalvas', 'Rejeitado'])
  })
]);

const MAPA_CORES_CAPA = new Map([
  ['#314F79', 'Azul'],
  ['#1E3A5F', 'Azul'],
  ['#FF6B2C', 'Laranja'],
  ['#1E5641', 'Verde'],
  ['#0D9488', 'Verde-água'],
  ['#7E22CE', 'Roxo'],
  ['#7C3AED', 'Roxo'],
  ['#B45309', 'Âmbar'],
  ['#C2410C', 'Terracota'],
  ['#475569', 'Grafite'],
  ['#0284C7', 'Azul céu'],
  ['#DC2626', 'Vermelho']
]);

function limparTextoSeguro(valor, maxLen = 120) {
  return String(valor ?? '').normalize('NFC').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

export function slugVariavel(nome) {
  const limpo = limparTextoSeguro(nome, 100);
  if (!limpo || CHAVES_PROIBIDAS.has(limpo.toLowerCase())) return '';
  const semPrefixo = limpo.startsWith('var:') ? limpo.slice(4) : limpo;
  if (!semPrefixo || CHAVES_PROIBIDAS.has(semPrefixo.toLowerCase())) return '';
  const slug = semPrefixo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  if (!slug || CHAVES_PROIBIDAS.has(slug)) return '';
  return slug;
}

export function campoIdVariavel(nomeOuId) {
  const s = slugVariavel(nomeOuId);
  return s ? `var:${s}` : '';
}

function normalizarListaOpcoes(opcoes) {
  const entrada = Array.isArray(opcoes)
    ? opcoes
    : typeof opcoes === 'string'
      ? opcoes.split(/[,\n;]+/)
      : [];
  const visto = new Set();
  const saida = [];
  for (const item of entrada) {
    const txt = limparTextoSeguro(item, 80);
    if (!txt) continue;
    const k = txt.toLocaleLowerCase('pt-BR');
    if (visto.has(k)) continue;
    visto.add(k);
    saida.push(txt);
    if (saida.length >= 60) break;
  }
  return saida;
}

export function normalizarMapaVariaveis(raw) {
  const saida = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return saida;
  for (const chave of Object.keys(raw)) {
    if (CHAVES_PROIBIDAS.has(chave) || CHAVES_PROIBIDAS.has(chave.toLowerCase())) continue;
    const nome = limparTextoSeguro(chave, 80);
    if (!nome || !slugVariavel(nome)) continue;
    const valBruto = raw[chave];
    if (Array.isArray(valBruto)) {
      const lista = normalizarListaOpcoes(valBruto);
      if (lista.length) saida[nome] = lista;
    } else {
      const texto = limparTextoSeguro(valBruto, 160);
      if (texto) saida[nome] = texto;
    }
  }
  return saida;
}

function normalizarDefinicaoCatalogo(def) {
  if (!def || typeof def !== 'object') return null;
  const nome = limparTextoSeguro(def.nome || def.label || '', 80);
  const id = slugVariavel(def.id || nome);
  if (!nome || !id) return null;
  const opcoes = normalizarListaOpcoes(def.opcoes);
  const tipo = def.tipo === 'texto' || (!opcoes.length && def.tipo !== 'selecao') ? 'texto' : 'selecao';
  return { id, nome, tipo, opcoes };
}

export function salvarCatalogoVariaveis(catalogo = []) {
  const lista = [];
  const vistos = new Set();
  for (const raw of (Array.isArray(catalogo) ? catalogo : [])) {
    const norm = normalizarDefinicaoCatalogo(raw);
    if (!norm || vistos.has(norm.id)) continue;
    vistos.add(norm.id);
    lista.push(norm);
    if (lista.length >= 100) break;
  }
  const serializado = JSON.stringify(lista);
  memoriaCatalogoPorConta.set(chaveConta(CHAVE_CATALOGO_VARIAVEIS), serializado);
  try {
    gravarConta(CHAVE_CATALOGO_VARIAVEIS, serializado);
  } catch (_) {
    // ambiente sem storage persistente
  }
  return lista;
}

export function obterCatalogoVariaveis(artigos = []) {
  const mapa = new Map();
  const adicionar = (raw) => {
    const norm = normalizarDefinicaoCatalogo(raw);
    if (!norm) return null;
    const existente = mapa.get(norm.id);
    if (!existente) {
      mapa.set(norm.id, { ...norm, opcoes: [...norm.opcoes] });
      return mapa.get(norm.id);
    }
    const opcoesVistas = new Set(existente.opcoes.map(o => o.toLocaleLowerCase('pt-BR')));
    for (const op of norm.opcoes) {
      const k = op.toLocaleLowerCase('pt-BR');
      if (!opcoesVistas.has(k)) {
        opcoesVistas.add(k);
        existente.opcoes.push(op);
      }
    }
    if (existente.opcoes.length > 0) existente.tipo = 'selecao';
    return existente;
  };

  try {
    const salvo = lerConta(CHAVE_CATALOGO_VARIAVEIS) ?? memoriaCatalogoPorConta.get(chaveConta(CHAVE_CATALOGO_VARIAVEIS)) ?? null;
    if (salvo) {
      const parsed = JSON.parse(salvo);
      if (Array.isArray(parsed)) parsed.forEach(adicionar);
    }
  } catch (_) {
    // ignora JSON corrompido
  }

  for (const art of (Array.isArray(artigos) ? artigos : [])) {
    const vars = normalizarMapaVariaveis(art?.variaveisPersonalizadas);
    for (const [nome, valor] of Object.entries(vars)) {
      const valores = Array.isArray(valor) ? valor : [valor];
      const def = adicionar({ nome, opcoes: valores });
      if (def) {
        for (const v of valores) {
          const k = v.toLocaleLowerCase('pt-BR');
          if (!def.opcoes.some(o => o.toLocaleLowerCase('pt-BR') === k)) {
            def.opcoes.push(v);
          }
        }
      }
    }
  }

  return [...mapa.values()];
}

export function registrarVariavelNoCatalogo({ nome, tipo = 'selecao', opcoes = [] } = {}, artigos = []) {
  const atual = obterCatalogoVariaveis(artigos);
  const nova = normalizarDefinicaoCatalogo({ nome, tipo, opcoes });
  if (!nova) return null;

  const existente = atual.find(v => v.id === nova.id);
  if (existente) {
    const vistas = new Set(existente.opcoes.map(o => o.toLocaleLowerCase('pt-BR')));
    for (const op of nova.opcoes) {
      const k = op.toLocaleLowerCase('pt-BR');
      if (!vistas.has(k)) {
        vistas.add(k);
        existente.opcoes.push(op);
      }
    }
    if (existente.opcoes.length) existente.tipo = 'selecao';
    salvarCatalogoVariaveis(atual);
    return existente;
  }

  atual.push(nova);
  salvarCatalogoVariaveis(atual);
  return nova;
}

export function definirVariavelNoArtigo(art, nome, valor) {
  if (!art || typeof art !== 'object') return false;
  const nomeLimpo = limparTextoSeguro(nome, 80);
  if (!nomeLimpo || !slugVariavel(nomeLimpo)) return false;

  const mapa = normalizarMapaVariaveis(art.variaveisPersonalizadas);
  const slugAlvo = slugVariavel(nomeLimpo);
  let chaveExistente = nomeLimpo;
  for (const k of Object.keys(mapa)) {
    if (slugVariavel(k) === slugAlvo) {
      chaveExistente = k;
      break;
    }
  }

  if (Array.isArray(valor)) {
    const lista = normalizarListaOpcoes(valor);
    if (!lista.length) {
      delete mapa[chaveExistente];
    } else {
      mapa[chaveExistente] = lista;
    }
  } else {
    const txt = limparTextoSeguro(valor, 160);
    if (!txt) {
      delete mapa[chaveExistente];
    } else {
      mapa[chaveExistente] = txt;
    }
  }

  art.variaveisPersonalizadas = mapa;
  art.atualizadoEm = new Date().toISOString();
  return true;
}

export function removerVariavelDoArtigo(art, nome) {
  if (!art || typeof art !== 'object') return false;
  const slugAlvo = slugVariavel(nome);
  if (!slugAlvo) return false;
  const mapa = normalizarMapaVariaveis(art.variaveisPersonalizadas);
  let mudou = false;
  for (const k of Object.keys(mapa)) {
    if (slugVariavel(k) === slugAlvo || k === nome) {
      delete mapa[k];
      mudou = true;
    }
  }
  art.variaveisPersonalizadas = mapa;
  if (mudou) art.atualizadoEm = new Date().toISOString();
  return mudou;
}

export function obterNomeCorCapa(hex) {
  const bruto = limparTextoSeguro(hex, 24).toUpperCase();
  if (!bruto) return 'Azul';
  let normalizado = bruto;
  if (/^#[0-9A-F]{3}$/.test(bruto)) {
    normalizado = '#' + bruto.slice(1).split('').map(c => c + c).join('');
  }
  if (MAPA_CORES_CAPA.has(normalizado)) {
    return MAPA_CORES_CAPA.get(normalizado);
  }
  return normalizado;
}

export function obterRotuloStatusLeitura(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'lendo') return 'Lendo';
  if (s === 'fichado' || s === 'lido') return 'Fichado';
  return 'Não lido';
}

export function artigoFoiLido(art) {
  const st = String(art?.statusLeitura || '').trim().toLowerCase();
  const stAlt = String(art?.status || '').trim().toLowerCase();
  if (st === 'fichado' || stAlt === 'lido') return 'Lido';
  if (st === 'lendo' || stAlt === 'lendo') return 'Em leitura';
  return 'Não lido';
}

export function ehArtigoLidoSimNao(art) {
  return artigoFoiLido(art) === 'Lido' ? 'Sim' : 'Não';
}

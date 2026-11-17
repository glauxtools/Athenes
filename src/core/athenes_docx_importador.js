// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Importador de templates .docx → template Athenes (esqueleto: estilos + mestras + seções de exemplo, sem o texto do arquivo).
 *
 * Lê word/document.xml, styles.xml, settings.xml, header/footer e as relações. Em vez de criar um estilo para
 * cada formatação encontrada (o Word acumula dezenas), agrupa por ASSINATURA TIPOGRÁFICA e consolida em poucos
 * estilos canônicos: corpo, títulos por nível, citação longa, legenda/fonte (unificados), nota de rodapé,
 * referências e capa isolada. Negrito/itálico inline NÃO viram estilo: só vale a formatação que domina o parágrafo.
 */
import { abrirZip } from './athenes_zip_leitor.js';
import { parseXml, filhos, primeiro, attr, textoDe, descendentes } from './athenes_xml_mini.js';
import { criarModelosPaginaPadrao, criarNovoBloco, criarElementoMestra, gerarId } from './athenes_documento.js';
import { sanitizarTemplate } from './athenes_templates.js';

export const MAX_ESTILOS_CANONICOS = 8;
const TW_MM = 56.693;
const mm = (tw) => Math.round((Number(tw) / TW_MM) * 10) / 10;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ligado = (no) => !!no && !['0', 'false', 'off', 'none'].includes(String(attr(no, 'w:val') ?? 'true').toLowerCase());

// ------------------------------------------------------------------ fontes

const FONTES = [
  [/times/i, 'times'], [/arial|helvetica|liberation sans/i, 'arial'], [/georgia/i, 'georgia'], [/garamond/i, 'garamond'],
  [/cambria/i, 'cambria'], [/calibri|carlito/i, 'calibri'], [/aptos/i, 'aptos'], [/consolas|courier|mono/i, 'consolas'], [/nunito/i, 'nunito']
];
const SERIFADAS = /serif|palatino|book antiqua|century|bookman|minion|baskerville|didot|constantia|cambria|garamond|georgia|times|libre baskerville|merriweather/i;

export function mapearFonteDocx(nome) {
  const n = String(nome || '').trim();
  if (!n) return { id: 'nunito', exata: true };
  for (const [re, id] of FONTES) if (re.test(n)) return { id, exata: true };
  return { id: SERIFADAS.test(n) && !/sans/i.test(n) ? 'times' : 'arial', exata: false, original: n };
}

// ------------------------------------------------------------------ leitura de propriedades

function lerPPr(pPr) {
  const o = {};
  if (!pPr) return o;
  const jc = attr(primeiro(pPr, 'w:jc'), 'w:val');
  if (jc) o.jc = jc;
  const sp = primeiro(pPr, 'w:spacing');
  if (sp) {
    o.antes = num(sp.a['w:before']); o.depois = num(sp.a['w:after']);
    o.linha = num(sp.a['w:line']); o.regraLinha = sp.a['w:lineRule'];
  }
  const ind = primeiro(pPr, 'w:ind');
  if (ind) {
    o.esq = num(ind.a['w:left'] ?? ind.a['w:start']); o.dir = num(ind.a['w:right'] ?? ind.a['w:end']);
    o.primeira = num(ind.a['w:firstLine']); o.deslocado = num(ind.a['w:hanging']);
    if (o.deslocado) o.primeira = 0;
  }
  const ol = primeiro(pPr, 'w:outlineLvl');
  if (ol) o.outline = num(attr(ol, 'w:val'));
  if (primeiro(pPr, 'w:keepNext')) o.keepNext = true;
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

function lerRPr(rPr) {
  const o = {};
  if (!rPr) return o;
  const f = primeiro(rPr, 'w:rFonts');
  if (f) { const nome = f.a['w:ascii'] || f.a['w:hAnsi'] || f.a['w:cs'] || f.a['w:eastAsia']; if (nome) o.fonte = nome; }
  const sz = primeiro(rPr, 'w:sz');
  if (sz) o.tam = num(attr(sz, 'w:val')) / 2;
  const b = primeiro(rPr, 'w:b'); if (b) o.b = ligado(b);
  const i = primeiro(rPr, 'w:i'); if (i) o.i = ligado(i);
  const u = primeiro(rPr, 'w:u'); if (u) o.u = ligado(u);
  const caps = primeiro(rPr, 'w:caps'); if (caps) o.caps = ligado(caps);
  const cor = attr(primeiro(rPr, 'w:color'), 'w:val');
  if (cor) o.cor = /^[0-9a-fA-F]{6}$/.test(cor) ? `#${cor.toUpperCase()}` : null; // 'auto' = sem cor própria
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !Number.isNaN(v)));
}

const mesclar = (...partes) => Object.assign({}, ...partes.map(p => Object.fromEntries(Object.entries(p || {}).filter(([, v]) => v !== undefined))));

function lerEstilos(xml) {
  const raiz = parseXml(xml);
  const dd = primeiro(raiz, 'w:docDefaults');
  const padraoR = lerRPr(primeiro(primeiro(dd, 'w:rPrDefault'), 'w:rPr'));
  const padraoP = lerPPr(primeiro(primeiro(dd, 'w:pPrDefault'), 'w:pPr'));
  const mapa = new Map();
  let padraoId = null;
  for (const s of filhos(raiz, 'w:style')) {
    if (s.a['w:type'] !== 'paragraph') continue;
    const id = s.a['w:styleId'];
    mapa.set(id, { id, nome: attr(primeiro(s, 'w:name'), 'w:val') || id, baseId: attr(primeiro(s, 'w:basedOn'), 'w:val'), p: lerPPr(primeiro(s, 'w:pPr')), r: lerRPr(primeiro(s, 'w:rPr')) });
    if (s.a['w:default'] === '1') padraoId = id;
  }
  const cache = new Map();
  const resolver = (id, vistos = new Set()) => {
    if (cache.has(id)) return cache.get(id);
    const e = mapa.get(id);
    if (!e || vistos.has(id)) return {};
    vistos.add(id);
    const base = e.baseId ? resolver(e.baseId, vistos) : {};
    const r = mesclar(base, e.p, e.r);
    cache.set(id, r);
    return r;
  };
  return { mapa, padrao: mesclar(padraoP, padraoR), padraoId, resolver };
}

// ------------------------------------------------------------------ documento

function lerSecao(sectPr) {
  if (!sectPr) return null;
  const sz = primeiro(sectPr, 'w:pgSz'), mg = primeiro(sectPr, 'w:pgMar'), cols = primeiro(sectPr, 'w:cols');
  const refs = filhos(sectPr, 'w:headerReference').concat(filhos(sectPr, 'w:footerReference')).map(r => ({ tipo: r.n.includes('header') ? 'cab' : 'rod', modo: r.a['w:type'] || 'default', rid: r.a['r:id'] }));
  return {
    w: num(sz?.a['w:w']), h: num(sz?.a['w:h']), orient: sz?.a['w:orient'],
    mg: mg ? { t: num(mg.a['w:top']), r: num(mg.a['w:right']), b: num(mg.a['w:bottom']), l: num(mg.a['w:left']), cab: num(mg.a['w:header']), rod: num(mg.a['w:footer']) } : null,
    colunas: num(cols?.a['w:num']) || 1, espacoCols: num(cols?.a['w:space']), refs,
    tituloDistinto: ligado(primeiro(sectPr, 'w:titlePg'))
  };
}

function analisarCorpo(xml, est) {
  const raiz = parseXml(xml);
  const corpo = primeiro(raiz, 'w:body') || raiz;
  const paragrafos = [];
  const secoes = [];
  let secaoIdx = 0, tabelas = 0, notasRef = 0, imagens = 0;

  const processar = (p) => {
    const pPr = primeiro(p, 'w:pPr');
    const direto = lerPPr(pPr);
    const sectPr = primeiro(pPr, 'w:sectPr');
    const styleId = attr(primeiro(pPr, 'w:pStyle'), 'w:val') || est.padraoId;
    const runs = descendentes(p, 'w:r').map(r => {
      const partes = [];
      for (const f of filhos(r)) {
        if (f.n === 'w:t') partes.push({ s: textoDe(f) });
        else if (f.n === 'w:tab') partes.push({ s: '\t' });
        else if (f.n === 'w:br' && f.a['w:type'] !== 'page') partes.push({ br: true });
        else if (f.n === 'w:footnoteReference' || f.n === 'w:endnoteReference') notasRef++;
      }
      return {
        props: lerRPr(primeiro(r, 'w:rPr')), partes, texto: partes.map(x => x.s || '').join(''),
        quebra: descendentes(r, 'w:br').some(b => b.a['w:type'] === 'page')
      };
    });
    const desenhos = desenhosDe(p);
    imagens += desenhos.length;
    const texto = runs.map(r => r.texto).join('');
    const chars = texto.replace(/\s+/g, ' ').trim().length;
    const quebraDepois = runs.some(r => r.quebra);
    // formatação que DOMINA o parágrafo (≥70% dos caracteres); trechos em negrito/itálico no meio não contam
    const dominante = {};
    if (chars) {
      for (const chave of ['fonte', 'tam', 'b', 'i', 'u', 'caps', 'cor']) {
        const pesos = new Map();
        for (const r of runs) { const n = r.texto.length; if (n) { const v = r.props[chave] === undefined ? '\u0000herda' : String(r.props[chave]); pesos.set(v, (pesos.get(v) || 0) + n); } }
        const [v, w] = [...pesos.entries()].sort((a, b) => b[1] - a[1])[0] || [];
        if (v !== undefined && v !== '\u0000herda' && w >= 0.7 * texto.length) {
          const orig = runs.find(r => String(r.props[chave]) === v)?.props[chave];
          dominante[chave] = orig;
        }
      }
    }
    const estilo = est.resolver(styleId);
    const efetivo = mesclar(est.padrao, estilo, direto, dominante);
    paragrafos.push({
      texto, chars, styleId, nomeEstilo: est.mapa.get(styleId)?.nome || styleId || '(sem estilo)', efetivo, runs,
      desenhos, secaoIdx, quebraDepois, quebraAntes: ligado(primeiro(pPr, 'w:pageBreakBefore')), fimSecao: !!sectPr
    });
    if (sectPr) { secoes[secaoIdx] = { ...lerSecao(sectPr), chars: 0 }; secaoIdx++; }
  };
  const visitar = (no) => {
    for (const f of filhos(no)) {
      if (f.n === 'w:p') processar(f);
      else if (f.n === 'w:tbl') {
        tabelas++;
        paragrafos.push({ tabela: f, secaoIdx, chars: 0 });
      }
      else if (f.n === 'w:sdt') visitar(primeiro(f, 'w:sdtContent') || f);
    }
  };
  visitar(corpo);
  const finalSect = lerSecao(primeiro(corpo, 'w:sectPr'));
  if (finalSect) secoes[secaoIdx] = { ...finalSect, chars: 0 };
  for (const p of paragrafos) if (secoes[p.secaoIdx]) secoes[p.secaoIdx].chars += p.chars;
  const herdadas = new Map();
  for (const secao of secoes) {
    if (!secao) continue;
    for (const ref of secao.refs) herdadas.set(`${ref.tipo}:${ref.modo}`, ref);
    secao.refs = [...herdadas.values()];
  }
  return { paragrafos, secoes, tabelas, notasRef, imagens };
}

// ------------------------------------------------------------------ papéis

const modaPonderada = (itens, chave, peso) => {
  const m = new Map();
  for (const it of itens) m.set(chave(it), (m.get(chave(it)) || 0) + peso(it));
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

function detectarCapa(ps) {
  const uteis = ps.filter(p => p.chars > 0);
  if (uteis.length < 4) return new Set();
  const capa = [];
  for (const p of ps) {
    if (p.tabela) return new Set();
    if (p.chars > 250 || /^(heading|titulo \d|título \d)/i.test(semAcento(p.nomeEstilo)) || p.efetivo.outline !== undefined) { return new Set(); }
    if (p.chars > 0) capa.push(p);
    if (p.quebraDepois || p.fimSecao) return capa.length && capa.length <= 15 ? new Set(capa) : new Set();
    if (capa.length > 15) return new Set();
  }
  return new Set();
}

function classificar(ps) {
  const comTexto = ps.filter(p => p.chars > 0);
  const corpoRef = comTexto.filter(p => p.chars >= 40);
  const tamCorpo = Number(modaPonderada(corpoRef.length ? corpoRef : comTexto, p => p.efetivo.tam ?? 11, p => p.chars)) || 11;
  const capa = detectarCapa(ps);
  const out = new Map();
  const nivelNomeado = [];
  for (const p of comTexto) {
    const nome = semAcento(p.nomeEstilo);
    const e = p.efetivo;
    let papel = null, nivel = null, forma = null;
    const h = /^(heading|titulo)\s*(\d)/.exec(nome);
    if (capa.has(p)) papel = 'capa';
    else if (/^(toc|sumario|table of contents|indice|contents)/.test(nome) || /^(header|footer|cabecalho|rodape)$/.test(nome)) papel = 'ignorar';
    else if (h) { papel = 'titulo'; nivel = Math.min(6, Number(h[2])); }
    else if (e.outline !== undefined && e.outline <= 5 && p.chars <= 200) { papel = 'titulo'; nivel = e.outline + 1; }
    else if (/footnote|nota de rodape/.test(nome)) papel = 'nota';
    else if (/caption|legenda/.test(nome)) papel = 'legenda';
    else if (/bibliograph|referencia/.test(nome)) papel = 'referencias';
    else if (/quote|citacao/.test(nome)) papel = 'citacao';
    else if (/^(fonte|source)\s*:/i.test(p.texto.trim()) && p.chars <= 250) papel = 'fonte';
    else if (/^(figura|fig\.|tabela|quadro|grafico|table|figure)\s*\d+/i.test(semAcento(p.texto.trim())) && p.chars <= 160 && (e.tam ?? tamCorpo) <= tamCorpo + 0.5) papel = 'legenda';
    else if ((e.esq || 0) / TW_MM >= 20 && p.chars >= 60 && ((e.tam ?? tamCorpo) <= tamCorpo - 0.5 || e.i)) papel = 'citacao';
    else if (e.b && (e.tam ?? tamCorpo) >= tamCorpo + 1.5 && p.chars <= 140) { papel = 'titulo'; forma = 'tam'; }
    else if (e.b && p.chars <= 100 && /^\d+(\.\d+)*\.?\s+\S/.test(p.texto.trim())) { papel = 'titulo'; nivel = (p.texto.trim().match(/^\d+(\.\d+)*/)[0].split('.').length); }
    // linha curta, toda em negrito e sem ponto final: título de seção (MAIÚSCULAS = nível acima de "Mista")
    else if (e.b && p.chars >= 3 && p.chars <= 80 && !/[.:;,!?]$/.test(p.texto.trim()) && !/^[(\[]/.test(p.texto.trim())) { papel = 'titulo'; forma = p.texto.trim() === p.texto.trim().toUpperCase() && /[A-ZÀ-Ý]/.test(p.texto) ? 'caps' : 'misto'; }
    else papel = 'corpo';
    out.set(p, { papel, nivel, forma });
    if (papel === 'titulo' && nivel) nivelNomeado.push({ nivel, tam: e.tam ?? tamCorpo });
  }
  // títulos achados só pela aparência: nível pelo tamanho (o mais próximo de um título já nomeado, senão pela ordem de tamanho)
  const sem = [...out.entries()].filter(([, v]) => v.papel === 'titulo' && !v.nivel);
  if (sem.length) {
    const tamanhos = [...new Set(sem.filter(([, v]) => v.forma === 'tam').map(([p]) => Math.round((p.efetivo.tam ?? tamCorpo) * 2) / 2))].sort((a, b) => b - a);
    const base = Math.max(tamanhos.length, ...nivelNomeado.map(n => n.nivel), 0);
    for (const [p, v] of sem) {
      const t = p.efetivo.tam ?? tamCorpo;
      if (v.forma === 'caps') v.nivel = Math.min(4, base + 1);
      else if (v.forma === 'misto') v.nivel = Math.min(4, base + 2);
      else if (nivelNomeado.length) v.nivel = nivelNomeado.map(n => ({ n: n.nivel, d: Math.abs(n.tam - t) })).sort((a, b) => a.d - b.d)[0].n;
      else v.nivel = Math.min(4, tamanhos.indexOf(Math.round(t * 2) / 2) + 1);
    }
  }
  return { papeis: out, tamCorpo };
}

// ------------------------------------------------------------------ estilos canônicos

const ALINHAMENTO = { left: 'esquerda', start: 'esquerda', center: 'centro', right: 'direita', end: 'direita', both: 'justificado', distribute: 'justificado' };

function assinatura(e, tamPad) {
  return [semAcento(e.fonte || ''), Math.round((e.tam ?? tamPad) * 2) / 2, !!e.b, !!e.i, !!e.caps, e.jc || 'left', Math.round((e.esq || 0) / TW_MM / 2), Math.round((e.primeira || 0) / TW_MM), Math.round((e.deslocado || 0) / TW_MM)].join('|');
}

function estiloDe(id, nome, e, tamPad, extra = {}) {
  const tam = e.tam ?? tamPad;
  const f = mapearFonteDocx(e.fonte);
  let entrelinha = 1;
  if (e.linha) entrelinha = e.regraLinha === 'exact' || e.regraLinha === 'atLeast' ? (e.linha / 20) / tam : e.linha / 240;
  const base = {
    id, nome, tipo: 'paragrafo', fonte: f.id, tamanho_pt: tam, peso: e.b ? 700 : 400, cor: e.cor || '#1F2733',
    italico: !!e.i, sublinhado: !!e.u, caixa_alta: !!e.caps, alinhamento: ALINHAMENTO[e.jc] || 'esquerda',
    entrelinha: Math.min(3, Math.max(1, Math.round(entrelinha * 100) / 100)),
    ...((e.linha && (e.regraLinha === 'exact' || e.regraLinha === 'atLeast')) ? { entrelinha_tipo: e.regraLinha === 'exact' ? 'exatamente' : 'pelo_menos', entrelinha_pt: Math.round(e.linha / 20 * 10) / 10 } : {}),
    espaco_antes_pt: Math.round((e.antes || 0) / 20 * 10) / 10, espaco_depois_pt: Math.round((e.depois || 0) / 20 * 10) / 10,
    recuo_primeira_linha_mm: mm(e.primeira || 0), recuo_esquerdo_mm: mm(e.esq || 0), recuo_deslocado_mm: mm(e.deslocado || 0),
    espacamento_letras_em: 0, hifenizacao: false, ...extra
  };
  if (e.dir) base.recuo_direito_mm = mm(e.dir);
  return { estilo: base, fonte: f };
}

export function consolidarEstilos(ps, papeis, tamCorpo, { autoHifen = false } = {}) {
  // níveis de título sempre consecutivos (1, 2, 3…), mesmo que o arquivo pule um nível
  const usados = [...new Set([...papeis.values()].filter(v => v.papel === 'titulo').map(v => v.nivel))].sort((a, b) => a - b);
  for (const v of papeis.values()) if (v.papel === 'titulo') v.nivel = usados.indexOf(v.nivel) + 1;
  const grupos = new Map(); // papel(+nivel) → paragraphs
  const tamCapa = Math.max(0, ...[...papeis].filter(([, v]) => v.papel === 'capa').map(([p]) => p.efetivo.tam ?? tamCorpo));
  for (const [p, v] of papeis) {
    if (v.papel === 'ignorar') continue;
    // a capa tem o título (maior fonte) e as informações (autores, instituição, eixo) — dois estilos, isolados do resto
    const chave = v.papel === 'titulo' ? `titulo${v.nivel}` : (v.papel === 'capa' && (p.efetivo.tam ?? tamCorpo) < tamCapa - 0.4 ? 'capa_info' : v.papel);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  }
  if (!grupos.has('corpo')) grupos.set('corpo', []);

  // texto secundário (resumo, referências…): outro tamanho, bem representado, vira um segundo estilo de corpo
  {
    const corpo = grupos.get('corpo');
    const tamDominante = Number(modaPonderada(corpo, p => Math.round((p.efetivo.tam ?? tamCorpo) * 2) / 2, p => p.chars));
    const porTam = new Map();
    for (const p of corpo) { const t = Math.round((p.efetivo.tam ?? tamCorpo) * 2) / 2; if (Math.abs(t - tamDominante) >= 1) { const g = porTam.get(t) || []; g.push(p); porTam.set(t, g); } }
    const [, maior] = [...porTam.entries()].sort((a, b) => b[1].reduce((x, p) => x + p.chars, 0) - a[1].reduce((x, p) => x + p.chars, 0))[0] || [];
    if (maior && maior.length >= 3) { grupos.set('corpo_2', maior); grupos.set('corpo', corpo.filter(p => !maior.includes(p))); }
  }

  const naoTitulo = [...grupos.keys()].filter(k => !k.startsWith('titulo') && k !== 'fonte').length + (grupos.has('fonte') && !grupos.has('legenda') ? 1 : 0);
  let niveis = [...grupos.keys()].filter(k => k.startsWith('titulo')).map(k => Number(k.slice(6))).sort((a, b) => a - b);
  const orcamento = Math.max(2, MAX_ESTILOS_CANONICOS - naoTitulo);
  const permitidos = niveis.slice(0, orcamento);
  const ultimoPermitido = permitidos.at(-1);
  for (const n of niveis.slice(orcamento)) { grupos.get(`titulo${ultimoPermitido}`).push(...grupos.get(`titulo${n}`)); grupos.delete(`titulo${n}`); }
  // sem espaço no orçamento, "referências" é tratada como corpo
  if (naoTitulo + permitidos.length > MAX_ESTILOS_CANONICOS && grupos.has('referencias')) { grupos.get('corpo').push(...grupos.get('referencias')); grupos.delete('referencias'); }
  // legenda e fonte viram UM estilo
  const unificado = [...(grupos.get('legenda') || []), ...(grupos.get('fonte') || [])];
  grupos.delete('fonte'); grupos.delete('legenda');
  if (unificado.length) grupos.set('legenda', unificado);

  const estilos = [], relatorio = [], fontesSubstituidas = new Map(), mapaParagrafo = new Map();
  const nomes = { capa_info: 'Capa — Informações', corpo_2: 'Texto Secundário', corpo: 'Corpo do Texto', citacao: 'Citação Longa', legenda: 'Legenda / Fonte', nota: 'Nota de Rodapé', referencias: 'Referências', capa: 'Capa' };
  const idDe = { capa_info: 'capa_info', corpo_2: 'corpo_2', corpo: 'corpo', citacao: 'citacao_direta', legenda: 'legenda', nota: 'nota_rodape', referencias: 'referencias', capa: 'capa' };
  const ordem = ['capa', 'capa_info', ...[...grupos.keys()].filter(k => k.startsWith('titulo')).sort(), 'corpo', 'corpo_2', 'citacao', 'legenda', 'nota', 'referencias'];

  for (const chave of ordem) {
    const lista = grupos.get(chave);
    if (!lista) continue;
    const sigs = new Map();
    for (const p of lista) {
      const s = assinatura(p.efetivo, tamCorpo);
      const g = sigs.get(s) || { peso: 0, n: 0, p };
      g.peso += Math.max(p.chars, 1); g.n++; sigs.set(s, g);
    }
    // a capa é isolada: vale o título (maior fonte), não a linha mais longa; os demais, a formatação que mais aparece
    const dominante = [...sigs.values()].sort(chave === 'capa' ? (a, b) => (b.p.efetivo.tam ?? tamCorpo) - (a.p.efetivo.tam ?? tamCorpo) : (a, b) => b.peso - a.peso)[0];
    const ehTitulo = chave.startsWith('titulo');
    const id = ehTitulo ? chave : idDe[chave];
    const nome = ehTitulo ? `Título ${chave.slice(6)}` : nomes[chave];
    const e = dominante?.p.efetivo || {};
    let { estilo, fonte } = estiloDe(id, nome, e, tamCorpo, ehTitulo ? { manter_com_proximo: true } : (chave === 'corpo' && autoHifen ? { hifenizacao: true } : {}));
    if (chave === 'legenda') estilo.nome = 'Legenda / Fonte (unificado)';
    if (ehTitulo && !e.b) estilo.peso = 600;
    if (!fonte.exata) fontesSubstituidas.set(fonte.original, fonte.id);
    estilos.push(estilo);
    lista.forEach(p => mapaParagrafo.set(p, id));
    relatorio.push({
      id, nome: estilo.nome, paragrafos: lista.length, assinaturas: sigs.size, variantesAbsorvidas: sigs.size - 1,
      origem: [...new Set(lista.map(p => p.nomeEstilo))].slice(0, 6)
    });
    if (chave === 'legenda') estilos.push({ ...estilo, id: 'fonte_citada', nome: 'Fonte (alias do estilo unificado)' });
  }
  // dois estilos com a MESMA tipografia (fonte, tamanho, peso, itálico, caixa, cor e recuos) são uma coisa só: o alinhamento e o
  // espaçamento de cada parágrafo já ficam no bloco. Fica o de maior prioridade; a capa nunca é absorvida (é isolada de propósito).
  const chaveTipografica = (e) => [e.fonte, Math.round(e.tamanho_pt * 2) / 2, e.peso >= 600, e.italico, e.caixa_alta, (e.cor || '').toLowerCase(), Math.round(e.recuo_esquerdo_mm / 5), Math.round(e.recuo_deslocado_mm / 5)].join('|');
  const prioridade = (id) => (id.startsWith('titulo') ? 0 : id === 'corpo' ? 1 : id === 'corpo_2' ? 2 : id === 'capa' ? 99 : id === 'capa_info' ? 50 : 10);
  const ordenados = [...estilos].filter(e => e.id !== 'fonte_citada').sort((a, b) => prioridade(a.id) - prioridade(b.id));
  const mantidos = new Map();
  for (const e of ordenados) {
    if (e.id === 'capa') continue;
    const k = chaveTipografica(e);
    const destino = mantidos.get(k);
    if (!destino || e.id.startsWith('titulo')) { if (!destino) mantidos.set(k, e); continue; } // níveis de título nunca se fundem entre si (estrutura/sumário)
    const rel = relatorio.find(r => r.id === destino.id), absorvido = relatorio.find(r => r.id === e.id);
    rel.paragrafos += absorvido.paragrafos;
    rel.absorveu = [...(rel.absorveu || []), absorvido.nome];
    rel.origem = [...new Set([...rel.origem, ...absorvido.origem])].slice(0, 6);
    for (const [p, id] of mapaParagrafo) if (id === e.id) mapaParagrafo.set(p, destino.id);
    estilos.splice(estilos.findIndex(x => x.id === e.id), 1);
    relatorio.splice(relatorio.findIndex(x => x.id === e.id), 1);
  }
  return { estilos, relatorio, fontesSubstituidas, mapaParagrafo };
}

// ------------------------------------------------------------------ páginas, cabeçalho e rodapé

function formatoDe(w, h) {
  const [a, b] = [Math.min(w, h), Math.max(w, h)];
  const perto = (x, y) => Math.abs(x - y) <= 80;
  if (perto(a, 11906) && perto(b, 16838)) return { formato: 'A4' };
  if (perto(a, 12240) && perto(b, 15840)) return { formato: 'Letter' };
  if (perto(a, 16838) && perto(b, 23811)) return { formato: 'A3' };
  return { formato: 'Personalizado', dimensoes_personalizadas: { w_mm: mm(a), h_mm: mm(b) } };
}

function mestraDeSecao(base, sec, hf, { hifen } = {}) {
  const m = JSON.parse(JSON.stringify(base));
  if (sec?.w && sec?.h) {
    Object.assign(m, formatoDe(sec.w, sec.h));
    m.orientacao = sec.orient === 'landscape' || sec.w > sec.h ? 'paisagem' : 'retrato';
  }
  if (sec?.mg && sec.mg.t !== undefined) m.margens_mm = { t: mm(sec.mg.t), r: mm(sec.mg.r), b: mm(sec.mg.b), l: mm(sec.mg.l) };
  if (sec?.colunas > 1) m.grade = { colunas: Math.min(4, sec.colunas), gap_mm: sec.espacoCols ? mm(sec.espacoCols) : 6 };
  else m.grade = { colunas: 1, gap_mm: 0 };
  const areaMestra = (a, distTw) => {
    if (!a) return { ativo: false, zonas: { esquerda: '', centro: '', direita: '' } };
    const f = mapearFonteDocx(a.estilo.fonte);
    return {
      ativo: true, zonas: a.zonas, multilinha: Object.values(a.zonas).some(z => z.includes('\n')), fonte: f.id, tamanho_pt: Math.min(24, Math.max(6, a.estilo.tam || 9)), peso: a.estilo.b ? 700 : 400,
      cor: a.estilo.cor || '#64748B', entrelinha: 1.2, linha_divisoria: false, distancia_borda_mm: Math.min(40, Math.max(0, mm(distTw || 0)))
    };
  };
  m.cabecalho = areaMestra(hf.cab, sec?.mg?.cab);
  m.rodape = areaMestra(hf.rod, sec?.mg?.rod);
  // o número da página vem do campo PAGE do Word: no mesmo lugar (zona e área) e só o número, como no arquivo
  const comPagina = hf.rod?.usaPagina ? ['rodape', hf.rod] : (hf.cab?.usaPagina ? ['cabecalho', hf.cab] : null);
  if (comPagina) m.numeracao_pagina = { ativo: true, local: comPagina[0], horizontal: comPagina[1].zonaPagina || 'direita', formato: 'apenas_numero', mascara: '{p}', prefixo: '', sufixo: '', estilo: 'arabico', iniciar_em: 1, continuar: true, ocultar_primeira: false };
  else m.numeracao_pagina = { ativo: false, local: 'rodape', horizontal: 'direita', formato: 'apenas_numero', mascara: '{p}', prefixo: '', sufixo: '', estilo: 'arabico', iniciar_em: 1, continuar: true, ocultar_primeira: false };
  m.elementos_recorrentes = [];
  const larg = sec?.w ? sec.w / TW_MM : 210;
  const alt = sec?.h ? sec.h / TW_MM : 297;
  for (const img of hf.imagens || []) {
    const margL = m.margens_mm.l, margR = m.margens_mm.r;
    const escala = Math.min(1, larg / img.largura_mm, alt / img.altura_mm);
    const largura = img.largura_mm * escala, altura = img.altura_mm * escala;
    // x: pela margem e pelo alinhamento do parágrafo, somando o recuo dele (recuo negativo avança para fora da margem)
    const xAlinhado = img.largura_mm >= larg - 1 ? 0
      : (img.alinhamento === 'direita' ? larg - margR - largura - (img.ind_dir_mm || 0)
        : (img.alinhamento === 'centro' ? (larg - largura) / 2 + (img.ind_esq_mm || 0) / 2 - (img.ind_dir_mm || 0) / 2 : margL + (img.ind_esq_mm || 0)));
    const posicionar = (pos, bases, padrao, limite, tamanho) => {
      if (!pos) return padrao;
      const [ini, fim] = bases[pos.ref] || [padrao, padrao + tamanho];
      const alvo = pos.alin === 'center' ? (ini + fim - tamanho) / 2
        : ['right', 'bottom', 'outside'].includes(pos.alin) ? fim - tamanho : ini + pos.offset;
      return alvo >= 0 && alvo + tamanho <= limite + 0.5 ? alvo : padrao;
    };
    const x = posicionar(img.h, { page: [0, larg], margin: [margL, larg - margR], column: [margL, larg - margR] }, xAlinhado, larg, largura);
    const y = posicionar(img.v, {
      page: [0, alt], margin: [m.margens_mm.t, alt - m.margens_mm.b],
      paragraph: [img.y_mm, img.y_mm + altura], line: [img.y_mm, img.y_mm + altura]
    }, img.y_mm, alt, altura);
    const el = criarElementoMestra('foto_capa', {
      titulo: img.tipo === 'rod' ? 'Imagem do rodapé' : 'Imagem do cabeçalho',
      x_mm: Math.max(0, Math.min(larg - largura, x)), y_mm: Math.max(0, Math.min(alt - altura, y)),
      largura_mm: largura, altura_mm: altura, url: img.url, sangria: false,
      camada: img.atras ? 'fundo' : 'frente', ajuste: 'contain'
    });
    m.elementos_recorrentes.push(el);
    if (!img.ancorada) {
      if (img.tipo === 'rod') m.margens_mm.b = Math.max(m.margens_mm.b, Math.ceil(alt - el.y_mm + 3));
      else m.margens_mm.t = Math.max(m.margens_mm.t, Math.ceil(el.y_mm + altura + 3));
    }
  }
  void hifen;
  return m;
}

/** Texto de um parágrafo com os campos do Word trocados por variáveis do Athenes ({pagina}, {total}); o resultado em cache do campo é descartado. */
function textoComCampos(p) {
  const partes = [];
  let campo = null;
  const campoParaVariavel = (instr) => (/\bNUMPAGES\b/.test(instr) ? '{total}' : /\bPAGE\b/.test(instr) ? '{pagina}' : '');
  const visitar = (no) => {
    for (const f of filhos(no)) {
      if (f.n === 'w:fldSimple') { partes.push(campoParaVariavel(f.a['w:instr'] || '')); continue; }
      if (f.n === 'w:r') {
        for (const x of filhos(f)) {
          if (x.n === 'w:fldChar') {
            const t = x.a['w:fldCharType'];
            if (t === 'begin') campo = { instr: '', fase: 'instr' };
            else if (t === 'separate' && campo) { campo.fase = 'res'; partes.push(campoParaVariavel(campo.instr)); }
            else if (t === 'end') { if (campo?.fase === 'instr') partes.push(campoParaVariavel(campo.instr)); campo = null; }
          } else if (x.n === 'w:instrText' && campo?.fase === 'instr') campo.instr += textoDe(x);
          else if (x.n === 'w:t' && !(campo?.fase === 'res')) partes.push(textoDe(x));
          else if (x.n === 'w:tab' && !campo) partes.push('\t');
        }
      } else visitar(f); // hiperlink, sdt, ins…
    }
  };
  visitar(p);
  if (campo?.fase === 'instr') partes.push(campoParaVariavel(campo.instr)); // campo sem 'separate'/'end' (arquivo gerado por outra ferramenta)
  return partes.join('');
}

/** Cabeçalho/rodapé do Word → zonas do Athenes (uma linha por parágrafo; jc ou tabulação escolhem a zona) + tipografia. */
function areaDeParte(arvore) {
  const linhas = [];
  let estilo = null, usaPagina = false, zonaPagina = null;
  for (const p of descendentes(arvore, 'w:p')) {
    const txt = textoComCampos(p);
    if (!txt.replace(/\t/g, '').trim()) continue;
    const jc = attr(primeiro(primeiro(p, 'w:pPr'), 'w:jc'), 'w:val');
    const base = { center: 'centro', right: 'direita', end: 'direita' }[jc] || 'esquerda';
    const ordem = ['esquerda', 'centro', 'direita'];
    const linha = { esquerda: '', centro: '', direita: '' };
    let zona = ordem.indexOf(base);
    for (const pedaco of txt.split('\t')) { if (pedaco.trim()) { linha[ordem[Math.min(2, zona)]] += pedaco.trim(); } zona++; }
    if (/\{pagina\}/.test(txt)) { usaPagina = true; zonaPagina = zonaPagina || ordem.find(k => linha[k].includes('{pagina}')); }
    linhas.push(linha);
    // tipografia da área: o 1º valor encontrado de cada propriedade nos trechos do cabeçalho/rodapé (o resultado em cache de um campo costuma vir sem formatação)
    estilo = estilo || {};
    for (const r of descendentes(p, 'w:r')) for (const [k, v] of Object.entries(lerRPr(primeiro(r, 'w:rPr')))) if (estilo[k] === undefined) estilo[k] = v;
  }
  if (!linhas.length) return null;
  const zonas = {};
  for (const k of ['esquerda', 'centro', 'direita']) zonas[k] = linhas.map(l => l[k]).join('\n').replace(/\n+$/, '');
  return { zonas, usaPagina, zonaPagina, estilo: estilo || {} };
}

const TIPOS_IMAGEM = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', webp: 'webp', bmp: 'bmp' };

function bytesParaDataUrl(bytes, mime) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:image/${mime};base64,${btoa(bin)}`;
}

function desenhosDe(no) {
  return filhos(no).flatMap(f => {
    if (f.n === 'w:drawing' || f.n === 'w:pict') return [f];
    if (f.n === 'mc:AlternateContent') {
      const desenhos = desenhosDe(primeiro(f, 'mc:Choice'));
      return desenhos.length ? desenhos : desenhosDe(primeiro(f, 'mc:Fallback'));
    }
    return desenhosDe(f);
  });
}

function leitorDeMidias(zip, prepararImagem) {
  const relacoes = new Map(), cache = new Map();
  const relacoesDe = (parte) => {
    if (!relacoes.has(parte)) {
      const i = parte.lastIndexOf('/') + 1;
      const caminho = `${parte.slice(0, i)}_rels/${parte.slice(i)}.rels`;
      relacoes.set(parte, zip.texto(caminho).then(xml => new Map((xml ? descendentes(parseXml(xml), 'Relationship') : [])
        .filter(x => x.a.TargetMode !== 'External').map(x => [x.a.Id, x.a.Target]))));
    }
    return relacoes.get(parte);
  };
  const alvoDe = async (parte, id) => {
    const alvo = (await relacoesDe(parte)).get(id);
    if (!alvo || /[:\\?#]/.test(alvo)) return null;
    const pilha = alvo.startsWith('/') ? [] : parte.split('/').slice(0, -1);
    for (const pedaco of alvo.split('/')) {
      if (!pedaco || pedaco === '.') continue;
      if (pedaco === '..') { if (!pilha.length) return null; pilha.pop(); }
      else pilha.push(pedaco);
    }
    const caminho = pilha.join('/');
    return zip.existe(caminho) ? caminho : null;
  };
  return {
    alvoDe,
    async carregar(d, parte) {
      const ancora = primeiro(d, 'wp:anchor');
      const ext = primeiro(ancora || primeiro(d, 'wp:inline'), 'wp:extent');
      const vml = descendentes(d, 'v:imagedata')[0];
      const id = attr(descendentes(d, 'a:blip')[0], 'r:embed') || attr(vml, 'r:id');
      if (!id) return null;
      const estiloVml = attr(descendentes(d, 'v:shape')[0], 'style') || '';
      const medidaVml = (chave) => {
        const m = new RegExp(`(?:^|;)\\s*${chave}\\s*:\\s*([\\d.]+)(pt|mm|cm|in|px)`, 'i').exec(estiloVml);
        return m ? Number(m[1]) * { pt: 25.4 / 72, mm: 1, cm: 10, in: 25.4, px: 25.4 / 96 }[m[2].toLowerCase()] : 0;
      };
      const largura_mm = ext ? Number(ext.a.cx) / 36000 : medidaVml('width');
      const altura_mm = ext ? Number(ext.a.cy) / 36000 : medidaVml('height');
      if (![largura_mm, altura_mm].every(n => Number.isFinite(n) && n > 0)) return null;
      const caminho = await alvoDe(parte, id);
      const mime = caminho && TIPOS_IMAGEM[caminho.split('.').at(-1).toLowerCase()];
      if (!mime || typeof mime !== 'string') return null;
      if (!cache.has(caminho)) {
        cache.set(caminho, zip.ler(caminho).then(async bytes => {
          const url = bytesParaDataUrl(bytes, mime);
          return prepararImagem ? await prepararImagem(url) : url;
        }));
      }
      const pos = (eixo) => {
        const p = primeiro(ancora, `wp:position${eixo}`);
        return p && { ref: p.a.relativeFrom, offset: Number(textoDe(primeiro(p, 'wp:posOffset'))) / 36000 || 0, alin: textoDe(primeiro(p, 'wp:align')) };
      };
      return { largura_mm, altura_mm, url: await cache.get(caminho), ancorada: !!ancora,
        atras: ancora?.a.behindDoc === '1', h: pos('H'), v: pos('V') };
    }
  };
}

async function lerCabecalhoRodape(zip, midias, sec, modoRef, est) {
  const r = { cab: null, rod: null, imagens: [] };
  for (const ref of (sec?.refs || []).filter(x => x.modo === modoRef)) {
    const caminho = await midias.alvoDe('word/document.xml', ref.rid);
    if (!caminho) continue;
    const arvore = parseXml(await zip.texto(caminho));
    r[ref.tipo] = areaDeParte(arvore);
    const PT_MM = 25.4 / 72;
    const imagens = [];
    let y = 0;
    for (const par of descendentes(arvore, 'w:p')) {
      const pPr = primeiro(par, 'w:pPr');
      const ef = mesclar(est.padrao, est.resolver(attr(primeiro(pPr, 'w:pStyle'), 'w:val') || est.padraoId), lerPPr(pPr));
      const tamMarca = lerRPr(primeiro(pPr, 'w:rPr')).tam ?? ef.tam ?? 11;
      let alturaLinha = tamMarca * 1.22 * PT_MM;
      y += (ef.antes || 0) / 20 * PT_MM;
      for (const d of desenhosDe(par)) {
        const img = await midias.carregar(d, caminho);
        if (!img) continue;
        imagens.push({ ...img, tipo: ref.tipo, y_mm: y,
          alinhamento: { center: 'centro', right: 'direita', end: 'direita' }[ef.jc] || 'esquerda',
          ind_esq_mm: mm(ef.esq || 0), ind_dir_mm: mm(ef.dir || 0) });
        if (!img.ancorada) alturaLinha = Math.max(alturaLinha, img.altura_mm);
      }
      y += alturaLinha + (ef.depois || 0) / 20 * PT_MM;
    }
    const borda = mm(sec?.mg?.[ref.tipo] || 0);
    const alturaPagina = sec?.h ? sec.h / TW_MM : 297;
    for (const img of imagens) {
      img.y_mm += ref.tipo === 'cab' ? borda : alturaPagina - borda - (img.ancorada ? Math.max(img.altura_mm, y) : y);
      r.imagens.push(img);
    }
  }
  return r;
}

// ------------------------------------------------------------------ importação

const escHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * HTML do parágrafo. Trechos com negrito/itálico/sublinhado que o parágrafo não tem viram um trecho de ESTILO cadastrado
 * (`idEnfase(f)` devolve o id do estilo), nunca tags de formatação.
 */
function htmlDoParagrafo(p, idEnfase = () => null) {
  const e = p.efetivo;
  const pedacos = [];
  for (const r of p.runs) {
    const f = { b: !!r.props.b && !e.b, i: !!r.props.i && !e.i, u: !!r.props.u && !e.u };
    for (const parte of r.partes) {
      if (parte.br) { pedacos.push({ br: true }); continue; }
      if (!parte.s) continue;
      const ult = pedacos[pedacos.length - 1];
      if (ult && !ult.br && ult.b === f.b && ult.i === f.i && ult.u === f.u) ult.s += parte.s;
      else pedacos.push({ ...f, s: parte.s });
    }
  }
  const html = pedacos.map(x => {
    if (x.br) return '<br>';
    const t = escHtml(x.s).replace(/\t/g, '&emsp;');
    const estiloId = (x.b || x.i || x.u) ? idEnfase(x) : null;
    return estiloId ? `<span class="ath-estilo-span" data-estilo-id="${estiloId}">${t}</span>` : t;
  }).join('');
  return html.replace(/^(<br>)+|(<br>)+$/g, '').trim();
}

const PAGINA_QUEBRA = () => criarNovoBloco('quebra_pagina', {});

function blocoDaTabela(tabela) {
  const grade = filhos(primeiro(tabela, 'w:tblGrid'), 'w:gridCol').map(c => num(c.a['w:w']) || 1);
  const linhasWord = filhos(tabela, 'w:tr');
  const linhas = linhasWord.map(linha => filhos(linha, 'w:tc').flatMap(celula => {
    const conteudo = descendentes(celula, 'w:p').map(textoComCampos).join('\n');
    const span = num(attr(primeiro(primeiro(celula, 'w:tcPr'), 'w:gridSpan'), 'w:val')) || 1;
    return [conteudo, ...Array(Math.min(100, Math.max(0, Math.trunc(span) - 1))).fill('')];
  }));
  const colunasQtd = linhas.reduce((n, l) => Math.max(n, l.length), grade.length);
  if (!colunasQtd || !linhas.length) return null;
  const completar = (l, valor) => Array.from({ length: colunasQtd }, (_, i) => l[i] ?? valor);
  const comCabecalho = ligado(primeiro(primeiro(linhasWord[0], 'w:trPr'), 'w:tblHeader'));
  const colunas = completar(comCabecalho ? linhas.shift() : [], '');
  const bloco = criarNovoBloco('tabela', {
    colunas, linhas: linhas.map(l => completar(l, '')), com_cabecalho: comCabecalho, larguras_relativas: completar(grade, 1)
  });
  bloco.titulo = '';
  bloco.fonte = '';
  return bloco;
}

/** Blocos com o conteúdo do arquivo: capa numa seção própria, páginas separadas por quebras, cada parágrafo no seu estilo. */
async function montarConteudo(paragrafos, secoes, papeis, cons, temCapa, secCapa, midias) {
  const estilosPorId = new Map(cons.estilos.map(e => [e.id, e]));
  const capa = [], grupos = new Map();
  let naCapa = temCapa;
  let imagensImportadas = 0;
  const derivados = new Map();
  const estiloDerivado = (base, ajustes, rotulo = 'variação') => {
    if (!Object.keys(ajustes).length) return base.id;
    const chave = base.id + JSON.stringify(ajustes);
    if (!derivados.has(chave)) {
      const id = `${base.id}__v${derivados.size + 1}`;
      cons.estilos.push({ ...base, ...ajustes, id, nome: `${base.nome} (${rotulo} ${derivados.size + 1})` });
      estilosPorId.set(id, cons.estilos.at(-1));
      derivados.set(chave, id);
    }
    return derivados.get(chave);
  };
  for (const p of paragrafos) {
    if (secCapa && p.secaoIdx > 0) naCapa = false;
    const ehCapa = naCapa;
    if (!ehCapa && !grupos.has(p.secaoIdx)) grupos.set(p.secaoIdx, []);
    const alvo = ehCapa ? capa : grupos.get(p.secaoIdx);
    if (p.tabela) {
      const tabela = blocoDaTabela(p.tabela);
      if (tabela) alvo.push(tabela);
      continue;
    }
    if (p.quebraAntes && !ehCapa && alvo.length && alvo.at(-1).tipo !== 'quebra_pagina') alvo.push(PAGINA_QUEBRA());
    const id = cons.mapaParagrafo.get(p);
    if (p.chars && id) {
      alvo.push(blocoDeTexto(p, id));
    }
    const sec = secoes[p.secaoIdx];
    const larguraUtilMm = sec?.w ? mm(sec.w - (sec.mg?.l || 0) - (sec.mg?.r || 0)) : 160;
    for (const desenho of p.desenhos) {
      const img = await midias.carregar(desenho, 'word/document.xml');
      if (!img) continue;
      const largura_pct = Math.min(100, 100 * img.largura_mm / Math.max(1, larguraUtilMm));
      alvo.push(criarNovoBloco('figura', {
        src: img.url, itens: [{ id: gerarId('fig_item'), url: img.url, legenda_sub: '' }],
        mostrar_titulo: false, mostrar_legenda: false, mostrar_fonte: false,
        largura_modo: largura_pct < 100 ? 'pct' : 'corpo', largura_pct,
        alinhamento_bloco: { center: 'centro', right: 'direita', end: 'direita' }[p.efetivo.jc] || 'esquerda'
      }));
      imagensImportadas++;
    }
    if (p.quebraDepois && !ehCapa && alvo.length && alvo.at(-1).tipo !== 'quebra_pagina') alvo.push(PAGINA_QUEBRA());
    if (p.quebraDepois && ehCapa && !secCapa) naCapa = false;
  }
  for (const blocos of grupos.values()) if (blocos.at(-1)?.tipo === 'quebra_pagina') blocos.pop();
  return { capa, grupos, imagensImportadas };

  function blocoDeTexto(p, id) {
    const est = estilosPorId.get(id);
    const e = p.efetivo;
    const enfase = (f) => estiloDerivado(est, { ...(f.b ? { peso: 700 } : {}), ...(f.i ? { italico: true } : {}), ...(f.u ? { sublinhado: true } : {}) }, 'ênfase');
    const dados = { estiloId: id, texto: htmlDoParagrafo(p, enfase) };
    const rotulo = papeis.get(p);
    const mmv = (tw) => mm(tw || 0);
    // diferenças em relação ao estilo canônico viram um ESTILO derivado (nunca sobrescrita no bloco): fidelidade sem formatação direta
    const ajustes = {};
    const alin = ALINHAMENTO[e.jc] || 'esquerda';
    if (alin !== est.alinhamento) ajustes.alinhamento = alin;
    if (Math.abs(mmv(e.primeira) - est.recuo_primeira_linha_mm) > 0.5) ajustes.recuo_primeira_linha_mm = mmv(e.primeira);
    if (Math.abs(mmv(e.esq) - est.recuo_esquerdo_mm) > 0.5) ajustes.recuo_esquerdo_mm = mmv(e.esq);
    const antes = Math.round((e.antes || 0) / 20 * 10) / 10, depois = Math.round((e.depois || 0) / 20 * 10) / 10;
    if (Math.abs(antes - est.espaco_antes_pt) > 0.5) ajustes.espaco_antes_pt = antes;
    if (Math.abs(depois - est.espaco_depois_pt) > 0.5) ajustes.espaco_depois_pt = depois;
    const f = mapearFonteDocx(e.fonte);
    if (f.id !== est.fonte) ajustes.fonte = f.id;
    if (e.cor && e.cor !== est.cor) ajustes.cor = e.cor;
    if (e.b && est.peso < 600) ajustes.peso = 700; // negrito do parágrafo inteiro que o estilo não tem
    if (rotulo?.papel !== 'titulo') dados.estiloId = estiloDerivado(est, ajustes); // títulos mantêm o estilo do nível (sumário e numeração dependem dele)
    const bloco = rotulo?.papel === 'titulo'
      ? criarNovoBloco('titulo', { ...dados, nivel: Number(id.slice(6)) || 1 })
      : criarNovoBloco('paragrafo', dados);
    bloco.texto = dados.texto;
    return bloco;
  }
}

const placeholders = { 1: 'Título de nível 1', 2: 'Título de nível 2', 3: 'Título de nível 3', 4: 'Título de nível 4', 5: 'Título de nível 5', 6: 'Título de nível 6' };

/** Importa o .docx (Uint8Array/ArrayBuffer) e devolve { template, relatorio }. */
export async function importarTemplateDocx(dados, { nome = '', incluirConteudo = false, prepararImagem } = {}) {
  const zip = abrirZip(dados);
  if (!zip.existe('word/document.xml')) throw new Error('Arquivo inválido: não contém word/document.xml (não é um .docx).');
  const est = zip.existe('word/styles.xml') ? lerEstilos(await zip.texto('word/styles.xml')) : { mapa: new Map(), padrao: {}, padraoId: null, resolver: () => ({}) };
  const { paragrafos, secoes, tabelas, notasRef, imagens: imgsCorpo } = analisarCorpo(await zip.texto('word/document.xml'), est);
  const comTexto = paragrafos.filter(p => p.chars > 0);
  if (!comTexto.length) throw new Error('O documento está vazio: não há parágrafos para analisar.');

  const settings = zip.existe('word/settings.xml') ? parseXml(await zip.texto('word/settings.xml')) : null;
  const autoHifen = !!settings && ligado(primeiro(settings, 'w:autoHyphenation'));
  const { papeis, tamCorpo } = classificar(paragrafos);
  const cons = consolidarEstilos(paragrafos, papeis, tamCorpo, { autoHifen });

  // páginas: a seção com mais texto é a do corpo; a capa só tem mestra própria quando existe e difere
  const secCorpo = secoes.filter(Boolean).sort((a, b) => b.chars - a.chars)[0] || null;
  const temCapa = cons.estilos.some(e => e.id === 'capa');
  const secCapa = temCapa && secoes[0] && secoes[0] !== secCorpo ? secoes[0] : null;
  const base = criarModelosPaginaPadrao('abnt');
  const midias = leitorDeMidias(zip, prepararImagem);
  const corpoBase = base.find(m => m.id === 'corpo');
  const montarMestra = async (baseMestra, secao, modo) =>
    mestraDeSecao(baseMestra, secao, await lerCabecalhoRodape(zip, midias, secao, modo, est));
  const mestraCorpo = await montarMestra(corpoBase, secCorpo, 'default');
  const mestras = [];
  if (temCapa) {
    const capaBase = base.find(m => m.id === 'capa');
    const secao = secCapa || secCorpo;
    const modo = secao?.tituloDistinto ? 'first' : (secCapa ? 'default' : null);
    mestras.push(await montarMestra(capaBase, secao, modo));
  }
  mestras.push(mestraCorpo);

  // seções de exemplo: um bloco por estilo canônico (mostra a identidade visual; sem texto do arquivo)
  const ids = new Set(cons.estilos.map(e => e.id));
  const blocosCorpo = [];
  for (let n = 1; n <= 6; n++) if (ids.has(`titulo${n}`)) blocosCorpo.push(criarNovoBloco('titulo', { nivel: n, texto: placeholders[n], estiloId: `titulo${n}` }));
  blocosCorpo.push(criarNovoBloco('paragrafo', { texto: 'Texto de exemplo no estilo de corpo. Substitua pelo conteúdo do seu documento.', estiloId: 'corpo' }));
  if (ids.has('citacao_direta')) blocosCorpo.push(criarNovoBloco('citacao', { texto: 'Citação longa de exemplo.', autor: 'AUTOR', ano: '2025' }));
  if (ids.has('legenda')) blocosCorpo.push(criarNovoBloco('paragrafo', { texto: 'Figura 1 — Legenda de exemplo', estiloId: 'legenda' }), criarNovoBloco('paragrafo', { texto: 'Fonte: elaborado pelo autor (2025).', estiloId: 'fonte_citada' }));
  const secoesTpl = [];
  let imagensImportadas = 0;
  if (incluirConteudo) {
    const { capa, grupos, imagensImportadas: total } = await montarConteudo(paragrafos, secoes, papeis, cons, temCapa, secCapa, midias);
    imagensImportadas = total;
    if (temCapa && capa.length) secoesTpl.push({ nome: 'Capa', mestraId: 'capa', blocos: capa });
    for (const [idx, blocos] of grupos) {
      if (!blocos.length) continue;
      const secao = secoes[idx];
      let mestra = mestraCorpo;
      if (secao && secao !== secCorpo) {
        mestra = await montarMestra(corpoBase, secao, 'default');
        mestra.id = `word-secao-${idx + 1}`;
        mestra.nome = `Seção ${idx + 1} do Word`;
        mestras.push(mestra);
      }
      secoesTpl.push({ nome: mestra.nome, mestraId: mestra.id, blocos });
    }
    if (!secoesTpl.length) secoesTpl.push({ nome: 'Corpo do Texto', mestraId: 'corpo', blocos: blocosCorpo });
  } else {
    if (temCapa) secoesTpl.push({ nome: 'Capa', mestraId: 'capa', blocos: [criarNovoBloco('paragrafo', { texto: 'Título do documento', estiloId: 'capa' })] });
    secoesTpl.push({ nome: 'Corpo do Texto', mestraId: 'corpo', blocos: blocosCorpo });
  }

  const titulo = String(nome || '').replace(/\.docx$/i, '').trim() || 'Template importado do Word';
  const avisos = [];
  for (const [de, para] of cons.fontesSubstituidas) avisos.push(`Fonte "${de}" não está no Athenes: usada "${para}" no lugar (importe a fonte em Fontes para fidelidade total).`);
  if (tabelas) avisos.push(incluirConteudo
    ? 'As tabelas foram convertidas em blocos editáveis. Mesclagem de células e estilos do Word podem mudar.'
    : `${tabelas} tabela(s) omitida(s) no modo de importação só do layout.`);
  if (imgsCorpo > imagensImportadas) avisos.push(`${imgsCorpo - imagensImportadas} imagem(ns) do corpo omitida(s) pelo modo de importação ou por formato não suportado.`);
  if (notasRef && incluirConteudo) avisos.push(`${notasRef} nota(s) de rodapé do arquivo não foram importadas.`);
  if (!zip.existe('word/styles.xml')) avisos.push('O arquivo não tem styles.xml: os estilos foram deduzidos só da formatação direta.');
  const original = new Set(comTexto.map(p => p.styleId)).size;
  const template = sanitizarTemplate({
    id: gerarId('tpl'), titulo, conteudoImportado: !!incluirConteudo, descricao: `Importado de Word: ${cons.estilos.filter(e => e.id !== 'fonte_citada').length} estilos canônicos a partir de ${original} estilos do arquivo.`,
    categoria: 'user_custom', perfil: 'abnt', tipoDoc: 'artigo',
    config: { pagina: { formato: mestraCorpo.formato, orientacao: mestraCorpo.orientacao, margens_mm: mestraCorpo.margens_mm }, mestras, estilos: cons.estilos },
    secoes: secoesTpl
  });
  const canonicos = cons.relatorio.length;
  return {
    template,
    relatorio: {
      paragrafos: comTexto.length, estilosNoArquivo: original,
      assinaturasDistintas: new Set(comTexto.map(p => assinatura(p.efetivo, tamCorpo))).size,
      estilosCanonicos: canonicos, estilos: cons.relatorio, fontesSubstituidas: Object.fromEntries(cons.fontesSubstituidas),
      hifenizacaoAutomatica: autoHifen, avisos
    }
  };
}

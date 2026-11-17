// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarDocumento, criarNovoBloco, repaginarDocumento, colocarBloco } from '../src/core/athenes_documento.js';
import { normalizarColunasTexto, cssColunasTexto } from '../src/core/athenes_colunas_texto.js';
import { textoPlano } from '../src/core/athenes_fragmentos.js';
import { gerarDocumentoHtmlPdf } from '../src/core/athenes_export_pdf.js';
import { exportarPacoteEstilo, validarPacoteEstilo, aplicarPacoteEstilo, obterPromptIaParaExtracaoDeLayout } from '../src/core/athenes_pacote_estilo.js';

test('um parágrafo mantém suas colunas no modelo, na folha e no PDF', () => {
  const bloco = criarNovoBloco('paragrafo', { texto: 'Texto de exemplo. '.repeat(60), colunas_texto: 2, espaco_colunas_mm: 7 });
  assert.deepEqual(normalizarColunasTexto(bloco), { colunas: 2, espacoMm: 7 });
  assert.equal(cssColunasTexto(bloco), 'column-count:2;column-gap:7mm;column-fill:balance;');
  const doc = criarDocumento();
  doc.secoes.find(s => s.mestraId === 'corpo').blocos.push(bloco);
  repaginarDocumento(doc);
  const html = gerarDocumentoHtmlPdf(doc);
  assert.match(html, /column-count:2;column-gap:7mm;column-fill:balance;/);
  assert.equal(doc.secoes.find(s => s.mestraId === 'corpo').blocos.filter(b => b.id === bloco.id).length, 1, 'permanece um bloco editável');
});

test('parágrafo longo continua em páginas sem perder as colunas', () => {
  const doc = criarDocumento();
  const bloco = criarNovoBloco('paragrafo', { texto: 'Pesquisa acadêmica em fluxo contínuo. '.repeat(450), colunas_texto: 2 });
  const secao = doc.secoes.find(s => s.mestraId === 'corpo');
  secao.blocos.push(bloco);
  repaginarDocumento(doc);
  const fragmentos = doc.paginas.filter(p => p.secaoId === secao.id).flatMap(p => p.blocos || []).filter(b => b.id === bloco.id);
  assert.ok(fragmentos.length >= 2, 'o texto continua na página seguinte');
  assert.ok(fragmentos.every(f => f.colunas_texto === 2));
  assert.equal(fragmentos.map(f => textoPlano(f.texto)).join(''), textoPlano(bloco.texto), 'a paginação preserva todo o texto na ordem');
  assert.equal(secao.blocos.filter(b => b.id === bloco.id).length, 1, 'a fonte editável não é dividida em blocos');
});

test('tema compartilha o layout de colunas e mantém compatibilidade com temas antigos', () => {
  const origem = criarDocumento();
  origem.secoes.find(s => s.mestraId === 'corpo').blocos.push(criarNovoBloco('paragrafo', { texto: 'Texto', colunas_texto: 3, espaco_colunas_mm: 6 }));
  const pacote = exportarPacoteEstilo(origem);
  assert.deepEqual(pacote.layout_padrao_texto, { colunas: 3, espacoMm: 6 });
  const validado = validarPacoteEstilo(pacote);
  assert.equal(validado.valido, true);
  const destino = criarDocumento();
  const bloco = criarNovoBloco('paragrafo', { texto: 'Destino' });
  destino.secoes.find(s => s.mestraId === 'corpo').blocos.push(bloco);
  aplicarPacoteEstilo(destino, validado.pacote, { aplicarNosBlocosExistentes: true });
  assert.equal(bloco.colunas_texto, 3);
  assert.equal(bloco.espaco_colunas_mm, 6);
  const legado = { ...pacote };
  delete legado.layout_padrao_texto;
  bloco.colunas_texto = 2;
  aplicarPacoteEstilo(destino, legado, { aplicarNosBlocosExistentes: true });
  assert.equal(bloco.colunas_texto, 2, 'tema antigo não redefine as colunas');
  assert.match(obterPromptIaParaExtracaoDeLayout(), /layout_padrao_texto/);
});

test('ordenação coloca qualquer tipo de bloco após o anterior escolhido', () => {
  const doc = criarDocumento();
  const secao = doc.secoes.find(s => s.mestraId === 'corpo');
  const texto = criarNovoBloco('paragrafo', { texto: 'Texto' });
  const imagem = criarNovoBloco('figura', { titulo: 'Imagem' });
  const tabela = criarNovoBloco('tabela', { titulo: 'Tabela' });
  secao.blocos.push(texto, imagem, tabela);
  assert.equal(colocarBloco(doc, tabela.id, texto.id, 'depois'), true);
  assert.deepEqual(secao.blocos.slice(-3).map(b => b.id), [texto.id, tabela.id, imagem.id]);
});

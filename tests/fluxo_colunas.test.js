// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { colocarBloco, criarNovoBloco, repaginarDocumento } from '../src/core/athenes_documento.js';
import { criarFluxoDeColunas, faixasDoFluxo } from '../src/core/athenes_fluxo_colunas.js';
import { textoPlano } from '../src/core/athenes_fragmentos.js';
import { criarDocumentoEmBranco, criarDocumentoDeTemplate } from '../src/core/athenes_templates.js';
import { exportarPacoteEstilo, aplicarPacoteEstilo, validarPacoteEstilo } from '../src/core/athenes_pacote_estilo.js';
import { templateDeTema } from '../src/core/athenes_template_de_tema.js';

test('encaixe retorna a uma coluna anterior e conflitos de largura aguardam todas as colunas da faixa', () => {
  const fluxo = criarFluxoDeColunas();
  fluxo.posicionar({ col: 1, span: 4 }, 20);
  fluxo.posicionar({ col: 5, span: 5 }, 80);
  fluxo.posicionar({ col: 10, span: 3 }, 30);
  assert.deepEqual(fluxo.posicionar({ col: 1, span: 4 }, 25), { fimDoBloco: 45, alturaTotal: 80 });
  assert.equal(fluxo.posicionar({ col: 3, span: 7 }, 15).fimDoBloco, 95);
  assert.equal(fluxo.posicionar({ col: 1, span: 12 }, 10).fimDoBloco, 105);
});

test('o sucessor encaixado mantém a ordem e usa o espaço livre antes da quebra de página', () => {
  const doc = criarDocumentoEmBranco();
  const [a, b, c, d] = [
    [1, 6, 510], [7, 6, 40], [1, 12, 290], [1, 12, 60]
  ].map(([col, span, altura_pt]) => criarNovoBloco('espaco', { col, span, altura_pt }));
  a.grupo = b.grupo = 'primeira-linha';
  doc.secoes[0].blocos = [a, b, d, c];
  assert.equal(colocarBloco(doc, c.id, b.id, 'encaixar'), true);
  assert.deepEqual(doc.secoes[0].blocos, [a, b, c, d]);
  assert.deepEqual([c.col, c.span], [7, 6]);
  assert.deepEqual(faixasDoFluxo([a, b, c, d]).map(f => f.map(x => x.blocos)), [[[a], [b, c]], [[d]]]);
  assert.equal(doc.paginas.length, 1);
  doc.fluxo_colunas = false;
  repaginarDocumento(doc);
  assert.ok(doc.paginas.length > 1, 'as linhas legadas continuam ocupando a soma das alturas');
});

test('um texto mais alto que a página continua na mesma largura sem perder conteúdo', () => {
  const doc = criarDocumentoEmBranco();
  doc.fluxo_colunas = true;
  const b = criarNovoBloco('paragrafo', { col: 8, span: 5, texto: 'Texto longo com palavras. '.repeat(220) });
  doc.secoes[0].blocos = [b];
  repaginarDocumento(doc);
  const visiveis = doc.paginas.flatMap(p => p.blocos);
  assert.ok(visiveis.length > 1);
  assert.ok(visiveis.every(f => f.col === 8 && f.span === 5));
  assert.equal(visiveis.map(f => textoPlano(f.texto)).join(''), textoPlano(b.texto));
});

test('tema e template transferem a opção de encaixe sem redefinir a opção ao aplicar um tema antigo', () => {
  const doc = criarDocumentoEmBranco();
  doc.fluxo_colunas = true;
  const tema = exportarPacoteEstilo(doc);
  assert.equal(validarPacoteEstilo(JSON.stringify(tema)).pacote.configuracaoGlobal.fluxo_colunas, true);
  const novo = criarDocumentoDeTemplate(templateDeTema(tema));
  assert.equal(novo.fluxo_colunas, true);
  delete tema.configuracaoGlobal.fluxo_colunas;
  aplicarPacoteEstilo(novo, tema);
  assert.equal(novo.fluxo_colunas, true);
});

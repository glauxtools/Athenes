// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { ZoteroClient, separarColecoesDaLixeira, tirarColecoesDaLixeira } from '../src/core/athenes_zotero.js';
import { aplicarEspelhoZotero, descartarColecoesQueSairamDoZotero, RAIZ_BIBLIOGRAFIA, PASTA_BIBLIOGRAFIA_LOCAL } from '../src/core/athenes_zotero_pastas.js';

test('coleções na Lixeira do Zotero (e as filhas delas) não viram pastas', () => {
  const { ativas, naLixeira } = separarColecoesDaLixeira([
    { key: 'MEST', data: { name: 'MESTRADO' } },
    { key: 'FASE4', data: { name: 'bibliografia-fase4-texto', deleted: true } },
    { key: 'FILHA', data: { name: 'filha da apagada', parentCollection: 'FASE4' } },
    { key: 'NETA', data: { name: 'neta', parentCollection: 'FILHA' } },
    { key: 'LEIT', data: { name: 'LEITURA', parentCollection: 'MEST' } }
  ]);
  assert.deepEqual(ativas.map(c => c.key), ['MEST', 'LEIT']);
  assert.deepEqual([...naLixeira].sort(), ['FASE4', 'FILHA', 'NETA']);
});

test('a obra continua; só sai das coleções que estão na Lixeira', () => {
  const item = { chave: 'A', colecoes: ['FASE4', 'BIB'] };
  assert.deepEqual(tirarColecoesDaLixeira(item, new Set(['FASE4'])).colecoes, ['BIB']);
  assert.equal(tirarColecoesDaLixeira(item, new Set()), item);
});

test('leitura da biblioteca ignora coleções e itens na Lixeira sem acusar coleções incompletas', async () => {
  const client = new ZoteroClient({ userId: '1', apiKey: 'chave' });
  const colecoes = [
    { key: 'BIB', data: { name: 'BIBLIOGRAFIA' } },
    { key: 'FASE4', data: { name: 'bibliografia-fase4-texto', deleted: true } }
  ];
  const itens = [
    { key: 'I1', data: { itemType: 'journalArticle', title: 'Artigo em BIB e na coleção apagada', collections: ['BIB', 'FASE4'] } },
    { key: 'I2', data: { itemType: 'journalArticle', title: 'Só na coleção apagada', collections: ['FASE4'] } },
    { key: 'I3', data: { itemType: 'journalArticle', title: 'Item na Lixeira', collections: ['BIB'], deleted: 1 } }
  ];
  const fetchImpl = async url => {
    const lista = new URL(url).pathname.endsWith('/collections') ? colecoes : itens;
    return new Response(JSON.stringify(lista), { headers: { 'Total-Results': String(lista.length), 'Last-Modified-Version': '7' } });
  };
  const r = await client.lerBibliotecaParaEspelho({ fetchImpl });
  assert.deepEqual(r.colecoes.map(c => c.key), ['BIB']);
  assert.deepEqual(r.itens.map(i => i.titulo || i.chave).length, 2);
  assert.deepEqual(r.itens.find(i => i.chave === 'I1').colecoes, ['BIB']);
  assert.deepEqual(r.itens.find(i => i.chave === 'I2').colecoes, []); // fica em "sem coleção", não some
});

test('coleção que saiu do Zotero e ficou vazia some; com obra ou criada no Athenes, fica em "Só no Athenes"', () => {
  const pastas = [{
    id: RAIZ_BIBLIOGRAFIA, nome: 'Bibliografia & Leituras', tipo: 'bibliografia', origem: 'minhas', subpastas: [
      { id: 'zot_col_BIB', nome: 'BIBLIOGRAFIA', zoteroKey: 'BIB', subpastas: [] },
      { id: 'zot_col_FASE4', nome: 'bibliografia-fase4-texto', zoteroKey: 'FASE4', driveId: 'drv1', subpastas: [] },
      { id: 'zot_col_VELHA', nome: 'coleção antiga com obra local', zoteroKey: 'VELHA', subpastas: [] },
      { id: 'pasta_minha', nome: 'Criada no Athenes', subpastas: [] }
    ]
  }];
  const espelho = { biblioteca: 'u1', versao: '7', sincronizadoEm: '2026-11-26T00:00:00Z', colecoes: [{ key: 'BIB', nome: 'BIBLIOGRAFIA', parentCollection: false }] };
  const esp = aplicarEspelhoZotero(pastas, espelho);
  const artigos = [
    { id: 'a1', pastasIds: ['zot_col_BIB'] },
    { id: 'a2', pastaId: 'zot_col_VELHA' } // obra só do Athenes guardada nessa pasta
  ];
  const { pastas: limpas, removidas } = descartarColecoesQueSairamDoZotero(esp.pastas, artigos);
  assert.deepEqual(removidas, [{ id: 'zot_col_FASE4', driveId: 'drv1', nome: 'bibliografia-fase4-texto' }]);
  const raiz = limpas.find(p => p.id === RAIZ_BIBLIOGRAFIA);
  assert.deepEqual(raiz.subpastas.filter(p => p.id !== PASTA_BIBLIOGRAFIA_LOCAL).map(p => p.id), ['zot_col_BIB']);
  const local = raiz.subpastas.find(p => p.id === PASTA_BIBLIOGRAFIA_LOCAL);
  assert.deepEqual(local.subpastas.map(p => p.id).sort(), ['pasta_minha', 'zot_col_VELHA']);
});

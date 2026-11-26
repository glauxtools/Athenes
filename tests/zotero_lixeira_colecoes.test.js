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

test('pasta vazia que veio do Drive (coleção antiga) some daqui sem ir para a lixeira do Drive', () => {
  const pastas = [{
    id: RAIZ_BIBLIOGRAFIA, nome: 'Bibliografia & Leituras', subpastas: [
      { id: 'zot_col_BIB', nome: 'BIBLIOGRAFIA', zoteroKey: 'BIB', subpastas: [] },
      { id: PASTA_BIBLIOGRAFIA_LOCAL, nome: 'Só no Athenes', subpastas: [
        { id: 'drive_D1', nome: 'bibliografia-fase4-texto', driveId: 'D1', subpastas: [] },
        { id: 'drive_D2', nome: 'pasta do Drive com obra', driveId: 'D2', subpastas: [] }
      ] }
    ]
  }];
  const { removidas, pastas: limpas } = descartarColecoesQueSairamDoZotero(pastas, [{ id: 'x', pastasIds: ['drive_D2'] }]);
  assert.deepEqual(removidas, [{ id: 'drive_D1', driveId: 'D1', nome: 'bibliografia-fase4-texto', lixeira: true }]);
  const local = limpas[0].subpastas.find(p => p.id === PASTA_BIBLIOGRAFIA_LOCAL);
  assert.deepEqual(local.subpastas.map(p => p.id), ['drive_D2']);
});

test('com o Zotero espelhado, pasta que sobrou no Drive não volta para "Bibliografia & Leituras"', async () => {
  const m = new Map();
  globalThis.localStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } };
  const { importarPastasDoDrive } = await import('../src/core/athenes_drive_sync.js');
  const resp = corpo => ({ ok: true, status: 200, json: async () => corpo, text: async () => JSON.stringify(corpo) });
  const filhos = {
    RAIZ: [{ id: 'FB', name: 'Bibliografia & Leituras' }, { id: 'FR', name: 'Relatórios & Artigos' }],
    FB: [{ id: 'FBIB', name: 'BIBLIOGRAFIA' }, { id: 'FVELHA', name: 'bibliografia-fase4-texto' }],
    FR: [{ id: 'FTESE', name: 'Tese' }], FBIB: [], FVELHA: [], FTESE: []
  };
  const fetchImpl = async url => {
    const q = decodeURIComponent(new URL(url).searchParams.get('q') || '');
    if (/name = 'Athenes'/.test(q)) return resp({ files: [{ id: 'RAIZ', name: 'Athenes' }] });
    const pai = /'([^']+)' in parents/.exec(q)?.[1];
    return resp({ files: filhos[pai] || [] });
  };
  const pastas = [
    { id: RAIZ_BIBLIOGRAFIA, nome: 'Bibliografia & Leituras', tipo: 'bibliografia', origem: 'minhas', zoteroEspelho: { biblioteca: 'u1', colecoes: [] }, subpastas: [
      { id: 'zot_col_BIB', nome: 'BIBLIOGRAFIA', zoteroKey: 'BIB', subpastas: [] }
    ] },
    { id: 'pasta_rel_raiz', nome: 'Relatórios & Artigos', tipo: 'relatorios', origem: 'minhas', subpastas: [] }
  ];
  await importarPastasDoDrive('T', { fetchImpl, pastas });
  const bib = pastas.find(p => p.id === RAIZ_BIBLIOGRAFIA);
  assert.deepEqual(bib.subpastas.map(p => p.nome), ['BIBLIOGRAFIA'], 'a coleção apagada no Zotero não volta pelo Drive');
  assert.equal(bib.subpastas[0].driveId, 'FBIB', 'a coleção que existe continua ligada à pasta do Drive');
  assert.ok(pastas.find(p => p.id === 'pasta_rel_raiz').subpastas.some(p => p.nome === 'Tese'), 'fora da bibliografia nada muda');
});

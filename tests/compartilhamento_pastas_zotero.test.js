// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { selecionarPasta, restaurarPastaAtiva } from '../src/ui/athenes_estudo_artigos_pastas.js';
import { ZoteroClient } from '../src/core/athenes_zotero.js';
import { EstudoArtigosView } from '../src/ui/athenes_estudo_artigos.js';

function criarStorageMemoria() {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, String(v)),
    removeItem: (k) => mapa.delete(k)
  };
}

test('selecionarPasta preserva pastas compartilhadas (pasta_bib_*, compartilhados_comigo e zotero_grupos_macro) sem resetar para todas', () => {
  const storage = criarStorageMemoria();
  const pastaCinpar = {
    id: 'pasta_bib_zot_col_CINPAR_12345678',
    nome: 'CINPAR 2026',
    origem: 'compartilhada_nuvem',
    subpastas: [
      { id: 'pasta_bib_zot_col_CINPAR_12345678::sub::sub1', nome: 'Subpasta A', origem: 'compartilhada_nuvem', subpastas: [] }
    ]
  };
  const macroZot = {
    id: 'zotero_grupos_macro',
    nome: 'Grupos do Zotero',
    origem: 'zotero_grupo',
    subpastas: [
      { id: 'zot_grp_999', nome: 'Grupo Patrimônio', origem: 'zotero_grupo', subpastas: [] }
    ]
  };
  const pastas = [pastaCinpar, macroZot];

  assert.equal(selecionarPasta(pastaCinpar.id, { pastas, storage }), pastaCinpar.id);
  assert.equal(selecionarPasta(pastaCinpar.subpastas[0].id, { pastas, storage }), pastaCinpar.subpastas[0].id);
  assert.equal(selecionarPasta('compartilhados_comigo', { pastas, storage }), 'compartilhados_comigo');
  assert.equal(selecionarPasta('zotero_grupos_macro', { pastas, storage }), 'zotero_grupos_macro');
  assert.equal(selecionarPasta('zot_grp_999', { pastas, storage }), 'zot_grp_999');

  // Mesmo se pastas ainda estiver vazia na carga inicial, IDs de pastas compartilhadas não voltam para 'todas'
  assert.equal(selecionarPasta(pastaCinpar.id, { pastas: [], storage }), pastaCinpar.id);
  storage.setItem('athenes_bib_pasta_ativa', pastaCinpar.id);
  assert.equal(restaurarPastaAtiva({ pastas: [], storage }), pastaCinpar.id);
});

test('Pasta compartilhada pelo Athenes com artigos do Zotero permanece isolada em COMPARTILHADAS COMIGO (não vira grupo Zotero)', () => {
  const fakeView = Object.create(EstudoArtigosView.prototype);
  fakeView.artigos = Array.from({ length: 10 }, (_, i) => ({
    id: `local_${i}`,
    titulo: `Meu Artigo ${i}`,
    pastaId: 'pasta_bib_raiz'
  }));
  fakeView.artigosCompartilhados = Array.from({ length: 3 }, (_, i) => ({
    id: `zot_CINPAR_${i}`,
    chaveZotero: `KEY${i}`,
    titulo: `Artigo CINPAR ${i}`,
    compartilhadoComigo: true,
    proprietarioExterno: true,
    pastaCompartilhadaId: 'pasta_bib_cinpar_abc',
    pastasCompartilhadasIds: ['pasta_bib_cinpar_abc'],
    pastaOriginalId: i === 0 ? 'sub_a' : 'cinpar_root'
  }));
  fakeView.artigosGruposZotero = [];
  fakeView.gruposZoteroRecebidos = [];

  const pastasMap = new Map([[
    'pasta_bib_cinpar_abc',
    {
      id: 'pasta_bib_cinpar_abc',
      pastaOriginalId: 'cinpar_root',
      nome: 'CINPAR 2026',
      origem: 'compartilhada_nuvem',
      origemZotero: true,
      zoteroKey: 'CINPARKEY',
      permissao: 'leitura',
      proprietario: { nome: 'Jefferson' },
      subpastasBrutas: [{ id: 'sub_a', nome: 'Eixo 1', subpastas: [] }]
    }
  ]]);

  fakeView.pastasCompartilhadasRecebidas = fakeView.reconstruirArvorePastasCompartilhadas(pastasMap);
  assert.equal(fakeView.pastasCompartilhadasRecebidas.length, 1);
  assert.equal(fakeView.pastasCompartilhadasRecebidas[0].id, 'pasta_bib_cinpar_abc');
  assert.equal(fakeView.pastasCompartilhadasRecebidas[0].nome, 'CINPAR 2026');
  assert.equal(fakeView.pastasCompartilhadasRecebidas[0].subpastas.length, 1);
  assert.equal(fakeView.contarArtigosPastaCompartilhada('pasta_bib_cinpar_abc'), 3);
  assert.equal(fakeView.contarArtigosPastaCompartilhada('pasta_bib_cinpar_abc::sub::sub_a'), 1);
  assert.equal(fakeView.artigosAvulsosCompartilhados().length, 0);
});

test('ZoteroClient.lerGruposCompartilhados e montarArvoreGruposZotero constroem pasta macro Grupos do Zotero com subpastas', async () => {
  const client = new ZoteroClient({ userId: '12345', apiKey: 'fake_key' });
  const fakeFetch = async (url) => {
    if (url.includes('/users/12345/groups')) {
      return {
        ok: true,
        headers: new Headers(),
        json: async () => [{ id: 777, data: { name: 'Grupo HBIM' } }]
      };
    }
    if (url.includes('/groups/777/collections')) {
      return {
        ok: true,
        headers: new Headers({ 'Total-Results': '2' }),
        json: async () => [
          { key: 'COL_PAI', data: { name: 'Patrimônio', parentCollection: false } },
          { key: 'COL_FILHA', data: { name: 'Laser Scan', parentCollection: 'COL_PAI' } }
        ]
      };
    }
    if (url.includes('/groups/777/items/top')) {
      return {
        ok: true,
        headers: new Headers({ 'Total-Results': '2' }),
        json: async () => [
          { key: 'ITEM1', data: { itemType: 'journalArticle', title: 'Artigo HBIM 1', collections: ['COL_FILHA'], creators: [] } },
          { key: 'ITEM2', data: { itemType: 'journalArticle', title: 'Artigo HBIM 2', collections: [], creators: [] } }
        ]
      };
    }
    return { ok: false, status: 404, headers: new Headers(), json: async () => [] };
  };

  const grupos = await client.lerGruposCompartilhados({ fetchImpl: fakeFetch });
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].nome, 'Grupo HBIM');
  assert.equal(grupos[0].colecoes.length, 2);
  assert.equal(grupos[0].itens.length, 2);

  const fakeView = Object.create(EstudoArtigosView.prototype);
  fakeView.artigosCompartilhados = [];
  fakeView.pastasCompartilhadasRecebidas = [];
  const { pastas, artigos } = fakeView.montarArvoreGruposZotero(grupos);
  fakeView.gruposZoteroRecebidos = pastas;
  fakeView.artigosGruposZotero = artigos;

  assert.equal(pastas.length, 1);
  assert.equal(pastas[0].id, 'zotero_grupos_macro');
  assert.equal(pastas[0].subpastas[0].id, 'zot_grp_777');
  assert.equal(pastas[0].subpastas[0].subpastas[0].id, 'zot_grp_777::col::COL_PAI');
  assert.equal(pastas[0].subpastas[0].subpastas[0].subpastas[0].id, 'zot_grp_777::col::COL_FILHA');
  assert.equal(fakeView.contarArtigosPastaCompartilhada('zotero_grupos_macro'), 2);
  assert.equal(fakeView.contarArtigosPastaCompartilhada('zot_grp_777'), 2);
  assert.equal(fakeView.contarArtigosPastaCompartilhada('zot_grp_777::col::COL_PAI'), 1);
  assert.equal(fakeView.contarArtigosPastaCompartilhada('zot_grp_777::col::COL_FILHA'), 1);
});

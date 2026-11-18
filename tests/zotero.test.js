// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ZoteroClient } from '../src/core/athenes_zotero.js';

describe('Athenes — Cliente Zotero e Leitura', () => {
  it('evita ler os artigos novamente quando o Zotero confirma a versão da biblioteca', async () => {
    const client = new ZoteroClient({ userId: '1' });
    const leitura = await client.lerBibliotecaParaEspelho({
      versaoConhecida: { biblioteca: client.getBaseUrl(), versao: '42' },
      fetchImpl: async (url, opcoes) => {
        assert.equal(new URL(url).pathname, '/users/1/collections');
        assert.equal(opcoes.headers['If-Modified-Since-Version'], '42');
        return new Response(null, { status: 304 });
      }
    });
    assert.equal(leitura, null);
  });
  it('lê todas as coleções e itens da biblioteca conectada e recusa uma página parcial', async () => {
    const client = new ZoteroClient({ userId: '1', apiKey: 'chave' });
    const colecoes = Array.from({ length: 101 }, (_, i) => ({ key: `C${i}`, data: { name: `Coleção ${i}`, parentCollection: i ? 'C0' : false } }));
    const itens = Array.from({ length: 103 }, (_, i) => ({ key: `I${i}`, data: { itemType: 'journalArticle', title: `Artigo ${i}`, collections: ['C100'] } }));
    const chamadas = [];
    const fetchImpl = async url => {
      const u = new URL(url);
      chamadas.push(u.pathname);
      const lista = u.pathname.endsWith('/collections') ? colecoes : itens;
      const inicio = Number(u.searchParams.get('start'));
      return new Response(JSON.stringify(lista.slice(inicio, inicio + 100)), { headers: {
        'Total-Results': String(lista.length), 'Last-Modified-Version': '40'
      } });
    };
    const r = await client.lerBibliotecaParaEspelho({ fetchImpl });
    assert.equal(r.colecoes.length, 101);
    assert.equal(r.itens.length, 103);
    assert.deepEqual(r.itens.at(-1).colecoes, ['C100']);
    assert.deepEqual(chamadas, ['/users/1/collections', '/users/1/collections', '/users/1/items/top', '/users/1/items/top']);
    await assert.rejects(client.lerBibliotecaParaEspelho({ fetchImpl: async url => {
      return new URL(url).searchParams.get('start') === '100' ? new Response('falha', { status: 503 }) : fetchImpl(url);
    } }), /503/);
  });
  it('inicializa cliente com parâmetros corretos e gera URLs oficiais', () => {
    const client = new ZoteroClient({
      userId: '1234567',
      apiKey: 'xyzKeySecret123',
      isGroup: false
    });

    assert.equal(client.getBaseUrl(), 'https://api.zotero.org/users/1234567');
    const headers = client.getHeaders();
    assert.equal(headers['Zotero-API-Version'], '3');
    assert.equal(headers['Zotero-API-Key'], 'xyzKeySecret123');
  });

  it('normaliza item da Zotero API para o padrão do Athenes', () => {
    const client = new ZoteroClient();
    const itemBruto = {
      key: 'ABCD1234',
      version: 12,
      data: {
        itemType: 'journalArticle',
        title: 'Algoritmos de Diagramação para Publicação Científica',
        creators: [
          { lastName: 'Mendes', firstName: 'Roberta' },
          { lastName: 'Castro', firstName: 'Eduardo' }
        ],
        publicationTitle: 'Computação Gráfica e Documentos',
        volume: '14',
        issue: '3',
        pages: '45-60',
        date: '2024-05-10',
        DOI: '10.5555/cgd.2024.14',
        abstractNote: 'Este trabalho apresenta novos algoritmos de diagramação em blocos.',
        tags: [{ tag: 'diagramação' }, { tag: 'artigos' }],
        collections: ['COL1', 'COL2']
      }
    };

    const norm = client.normalizarItemZotero(itemBruto);
    assert.equal(norm.id, 'ABCD1234');
    assert.equal(norm.tipo, 'artigo_periodico');
    assert.equal(norm.titulo, 'Algoritmos de Diagramação para Publicação Científica');
    assert.equal(norm.ano, '2024');
    assert.equal(norm.autores.length, 2);
    assert.equal(norm.autores[0].sobrenome, 'Mendes');
    assert.equal(norm.doi, '10.5555/cgd.2024.14');
    assert.equal(norm.palavrasChave.length, 2);
  });

  it('permite carregar itens via BibTeX em modo offline', () => {
    const client = new ZoteroClient();
    const bib = `@book{turing1950, author={Turing, Alan}, title={Computing Machinery and Intelligence}, year={1950}}`;
    const itens = client.importarBibTeX(bib);

    assert.equal(itens.length, 1);
    assert.equal(client.cacheItens.size, 1);
    assert.ok(client.cacheItens.has('turing1950'));
  });
});

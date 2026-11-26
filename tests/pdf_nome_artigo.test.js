import test from 'node:test';
import assert from 'node:assert/strict';
import { nomePdfDoArtigo, renomearArquivoNoDrive } from '../src/core/athenes_drive_sync.js';

test('nome do PDF vem do título do artigo', () => {
  assert.equal(nomePdfDoArtigo({ titulo: 'Optimal design of a cavity' }), 'Optimal design of a cavity.pdf');
});

test('tira marcação do Zotero e caracteres que o Drive/Windows não aceitam', () => {
  assert.equal(
    nomePdfDoArtigo({ titulo: 'Sound <i>absorbers</i>: A/B test? "best" <sub>2</sub>' }),
    'Sound absorbers A B test best 2.pdf'
  );
});

test('não termina em ponto e corta títulos longos numa palavra', () => {
  assert.equal(nomePdfDoArtigo({ titulo: 'Proceedings of the 9th Conference...' }), 'Proceedings of the 9th Conference.pdf');
  const longo = 'palavra '.repeat(40).trim();
  const nome = nomePdfDoArtigo({ titulo: longo });
  assert.ok(nome.length <= 124, nome);
  assert.ok(nome.endsWith('palavra.pdf'), nome);
});

test('sem título não inventa nome', () => {
  assert.equal(nomePdfDoArtigo({ titulo: '' }), '');
  assert.equal(nomePdfDoArtigo({ titulo: 'Artigo sem título' }), '');
  assert.equal(nomePdfDoArtigo(null), '');
});

test('renomear no Drive é um PATCH só do nome, no mesmo ID (o vínculo continua)', async () => {
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    return { ok: true, status: 200, json: async () => ({ id: 'abc123XYZ_-', name: JSON.parse(opcoes.body).name }) };
  };
  const r = await renomearArquivoNoDrive('abc123XYZ_-', 'Novo nome.pdf', 'tok', { fetchImpl });
  assert.deepEqual(r, { id: 'abc123XYZ_-', name: 'Novo nome.pdf' });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].opcoes.method, 'PATCH');
  assert.match(chamadas[0].url, /\/files\/abc123XYZ_-\?/);
  assert.deepEqual(JSON.parse(chamadas[0].opcoes.body), { name: 'Novo nome.pdf' }); // não mexe em pasta nem conteúdo
  assert.equal(chamadas[0].opcoes.headers.Authorization, 'Bearer tok');
});

test('não chama o Drive para IDs locais, sem nome ou sem token', async () => {
  let chamou = false;
  const fetchImpl = async () => { chamou = true; return { ok: true, json: async () => ({}) }; };
  assert.equal(await renomearArquivoNoDrive('drive_pdf_1', 'x.pdf', 'tok', { fetchImpl }), null);
  assert.equal(await renomearArquivoNoDrive('abc', '', 'tok', { fetchImpl }), null);
  assert.equal(await renomearArquivoNoDrive('abc', 'x.pdf', '', { fetchImpl }), null);
  assert.equal(chamou, false);
});

test('arquivo que não existe mais (404) não quebra nem apaga o vínculo', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({ error: { message: 'not found' } }) });
  assert.equal(await renomearArquivoNoDrive('sumiu123456', 'x.pdf', 'tok', { fetchImpl }), null);
});

// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mesclarLista, pdfFoiRecusado } from '../src/core/athenes_lista_sincronizada.js';
import { aplicarFilhosZoteroAoArtigo, codificarMetadadosNotaZotero } from '../src/core/athenes_zotero_anexos_notas.js';

const itemDe = (r, id) => (r.valor?.itens || r.itens || []).find(a => String(a.id) === id);

test('PDF desvinculado num computador não volta pela cópia antiga do servidor', () => {
  const servidor = { itens: [{ id: 'a1', titulo: 'T', driveFileId: 'ERRADO123456', driveFileName: 'errado.pdf', atualizadoEm: '2026-11-26T08:00:00Z' }], excluidos: {} };
  const local = { itens: [{ id: 'a1', titulo: 'T', driveFileId: '', driveFileName: '', pdfsRecusados: ['ERRADO123456'], pdfDesvinculadoEm: '2026-11-26T09:00:00Z', atualizadoEm: '2026-11-26T09:00:00Z' }], excluidos: {} };
  const r = mesclarLista(servidor, local);
  const a = itemDe(r, 'a1');
  assert.ok(a, JSON.stringify(Object.keys(r)));
  assert.equal(a.driveFileId, '', 'o arquivo recusado não é religado');
  assert.ok(pdfFoiRecusado(a, 'ERRADO123456'));
});

test('a cópia mais nova sem PDF ainda recebe um PDF legítimo da outra (não recusado)', () => {
  const servidor = { itens: [{ id: 'a1', titulo: 'T', driveFileId: 'CERTO1234567', driveFileName: 'certo.pdf', atualizadoEm: '2026-11-26T08:00:00Z' }], excluidos: {} };
  const local = { itens: [{ id: 'a1', titulo: 'T', driveFileId: '', atualizadoEm: '2026-11-26T09:00:00Z' }], excluidos: {} };
  assert.equal(itemDe(mesclarLista(servidor, local), 'a1').driveFileId, 'CERTO1234567');
});

test('a lista de recusados passa de um computador para o outro', () => {
  const servidor = { itens: [{ id: 'a1', titulo: 'T', driveFileId: 'CERTO1234567', pdfsRecusados: ['ERRADO123456'], atualizadoEm: '2026-11-26T09:00:00Z' }], excluidos: {} };
  const local = { itens: [{ id: 'a1', titulo: 'T', driveFileId: 'CERTO1234567', atualizadoEm: '2026-11-26T08:00:00Z' }], excluidos: {} };
  assert.deepEqual(itemDe(mesclarLista(servidor, local), 'a1').pdfsRecusados, ['ERRADO123456']);
});

test('a nota "Fichamento Athenes" do Zotero não religa o PDF desvinculado', () => {
  const html = `<h2>Fichamento Athenes</h2><!--ATHENES_FICHAMENTO_B64:${codificarMetadadosNotaZotero({ driveFileId: 'ERRADO123456', driveFileName: 'errado.pdf' })}-->`;
  const filhos = { anexos: new Map(), notas: new Map([['K1', [{ chave: 'N1', html }]]]), anotacoes: new Map() };
  const recusou = { id: 'a1', chaveZotero: 'K1', driveFileId: '', pdfsRecusados: ['ERRADO123456'] };
  aplicarFilhosZoteroAoArtigo(recusou, 'K1', filhos);
  assert.equal(recusou.driveFileId, '');
  const semPdf = { id: 'a2', chaveZotero: 'K1', driveFileId: '' };
  aplicarFilhosZoteroAoArtigo(semPdf, 'K1', filhos);
  assert.equal(semPdf.driveFileId, 'ERRADO123456', 'sem recusa, a nota continua restaurando o vínculo (outro aparelho)');
});

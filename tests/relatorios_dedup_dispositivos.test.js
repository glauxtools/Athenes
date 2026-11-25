// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mesclarPerfil, entradaDoDocumento } from '../src/core/athenes_perfil_servidor.js';
import { deduplicarDocumentos, definir, gravarDocumento, listar, reiniciar } from '../src/core/athenes_repositorio.js';
import { enviarDocumentoAoDrive } from '../src/core/athenes_drive_sync.js';
import { criarDocumento } from '../src/core/athenes_documento.js';

test('mesclarPerfil unifica entrada sem driveFileId (i:id) com entrada que ganhou driveFileId (f:fileId)', () => {
  const servidor = {
    pastas: [],
    documentos: [
      { id: 'doc_rel_1', titulo: 'Relatório Técnico', tipoDoc: 'relatorio', pastaId: 'pasta_rel_raiz', driveFileId: '', salvoNuvem: true, atualizadoEm: '2026-11-25T10:00:00Z', conteudoEm: '' }
    ],
    excluidos: {}
  };
  const local = {
    pastas: [],
    documentos: [
      { id: 'doc_rel_1', titulo: 'Relatório Técnico', tipoDoc: 'relatorio', pastaId: 'pasta_rel_raiz', driveFileId: 'DRV_111', driveFolderId: 'FLD_1', salvoNuvem: false, dataModificacao: '2026-11-25T10:01:00Z', driveSincronizadoEm: '2026-11-25T10:01:00Z' }
    ],
    excluidos: {}
  };
  const r = mesclarPerfil(servidor, local);
  assert.equal(r.indice.documentos.length, 1, 'não deve duplicar quando o mesmo id ganha driveFileId');
  assert.equal(r.indice.documentos[0].id, 'doc_rel_1');
  assert.equal(r.indice.documentos[0].driveFileId, 'DRV_111');
  assert.equal(r.indice.documentos[0].salvoNuvem, true);
  assert.deepEqual(r.adicionar, []);
});

test('mesclarPerfil limpa duplicatas ja existentes no servidor (mesmo id com 2 driveFileIds ou i:id + f:id)', () => {
  const servidorSujo = {
    pastas: [],
    documentos: [
      { id: 'doc_rel_2', titulo: 'Relatório A', tipoDoc: 'relatorio', pastaId: 'p1', driveFileId: '', salvoNuvem: true, atualizadoEm: '2026-11-25T09:00:00Z', conteudoEm: '' },
      { id: 'doc_rel_2', titulo: 'Relatório A', tipoDoc: 'relatorio', pastaId: 'p1', driveFileId: 'DRV_OLD', salvoNuvem: true, atualizadoEm: '2026-11-25T09:30:00Z', conteudoEm: '2026-11-25T09:30:00Z' },
      { id: 'doc_rel_2', titulo: 'Relatório A (editado PC 2)', tipoDoc: 'relatorio', pastaId: 'p1', driveFileId: 'DRV_NEW', salvoNuvem: true, atualizadoEm: '2026-11-25T10:00:00Z', conteudoEm: '2026-11-25T10:00:00Z' }
    ],
    excluidos: {}
  };
  const r = mesclarPerfil(servidorSujo, { pastas: [], documentos: [], excluidos: {} });
  assert.equal(r.indice.documentos.length, 1);
  assert.equal(r.indice.documentos[0].driveFileId, 'DRV_NEW');
  assert.equal(r.indice.documentos[0].titulo, 'Relatório A (editado PC 2)');
  assert.equal(r.mudouServidor, true);
});

test('mesclarPerfil remove copia local temporaria drive_XXX quando o documento canonico ja existe localmente', () => {
  const dCanon = { id: 'doc_rel_3', titulo: 'Relatório 3', tipoDoc: 'relatorio', pastaId: 'p1', driveFileId: 'DRV_3', dataModificacao: '2026-11-25T10:00:00Z', driveSincronizadoEm: '2026-11-25T10:00:00Z' };
  const dTemp = { id: 'drive_DRV_3', titulo: 'Relatório 3', tipoDoc: 'relatorio', pastaId: 'p1', driveFileId: 'DRV_3', dataModificacao: '2026-11-25T10:00:00Z', driveSincronizadoEm: '2026-11-25T10:00:00Z', precisaCarregarConteudo: true };
  const servidor = { pastas: [], documentos: [entradaDoDocumento(dCanon)], excluidos: {} };
  const r = mesclarPerfil(servidor, { pastas: [], documentos: [dTemp, dCanon], excluidos: {} });
  assert.equal(r.indice.documentos.length, 1);
  assert.equal(r.indice.documentos[0].id, 'doc_rel_3');
  assert.deepEqual(r.remover, ['drive_DRV_3']);
});

test('deduplicarDocumentos e repositorio nunca permitem duplicatas por id ou driveFileId em memoria', () => {
  reiniciar();
  const lista = deduplicarDocumentos([
    { id: 'drive_F1', titulo: 'Relatório', driveFileId: 'F1', precisaCarregarConteudo: true, dataModificacao: '2026-11-25T09:00:00Z' },
    { id: 'doc_1', titulo: 'Relatório Completo', driveFileId: 'F1', precisaCarregarConteudo: false, dataModificacao: '2026-11-25T10:00:00Z', secoes: [] },
    { id: 'doc_1', titulo: 'Relatório Antigo', driveFileId: '', precisaCarregarConteudo: true, dataModificacao: '2026-11-25T08:00:00Z' }
  ]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, 'doc_1');
  assert.equal(lista[0].driveFileId, 'F1');
  assert.equal(lista[0].precisaCarregarConteudo, false);

  definir([
    { id: 'drive_F2', titulo: 'Outro', driveFileId: 'F2', precisaCarregarConteudo: true },
    { id: 'doc_2', titulo: 'Outro Real', driveFileId: 'F2', precisaCarregarConteudo: false }
  ]);
  assert.equal(listar().length, 1);
  assert.equal(listar()[0].id, 'doc_2');

  gravarDocumento({ id: 'doc_2', titulo: 'Outro Editado', driveFileId: 'F2', secoes: [] });
  assert.equal(listar().length, 1);
  assert.equal(listar()[0].titulo, 'Outro Editado');
  reiniciar();
});

test('enviarDocumentoAoDrive reaproveita arquivo existente no Drive por appProperties.athenesDocId em vez de criar duplicata', async () => {
  const m = new Map();
  globalThis.localStorage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };

  const pastas = [
    { id: 'pasta_rel_raiz', nome: 'Relatórios & Artigos', tipo: 'relatorios', origem: 'minhas', driveId: 'PASTA_REL_DRV', subpastas: [] }
  ];
  const arquivosDrive = [
    { id: 'DRV_JA_EXISTE', name: 'Relatorio.athenes', parents: ['PASTA_REL_DRV'], appProperties: { athenesDocId: 'doc_multi_pc' } }
  ];
  let postsUpload = 0;
  let patchesUpload = 0;

  const fetchImpl = async (url, op = {}) => {
    const u = new URL(url);
    const metodo = op.method || 'GET';
    const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });

    if (u.pathname === '/drive/v3/files' && metodo === 'GET') {
      const q = u.searchParams.get('q') || '';
      if (q.includes("key='athenesDocId'")) {
        const val = /value='([^']+)'/.exec(q)?.[1];
        const achados = arquivosDrive.filter(f => f.appProperties?.athenesDocId === val);
        return json({ files: achados.map(f => ({ id: f.id, parents: f.parents })) });
      }
      return json({ files: [{ id: 'RAIZ_ATH', name: 'Athenes' }] });
    }
    if (u.pathname.startsWith('/drive/v3/files/') && metodo === 'GET') {
      const fid = decodeURIComponent(u.pathname.split('/').pop());
      const f = arquivosDrive.find(x => x.id === fid);
      return f ? json({ id: f.id, parents: f.parents, trashed: false }) : json({}, 404);
    }
    if (u.pathname.startsWith('/upload/drive/v3/files')) {
      if (metodo === 'PATCH') {
        patchesUpload++;
        const fid = decodeURIComponent(u.pathname.split('/').pop());
        return json({ id: fid });
      }
      postsUpload++;
      return json({ id: 'DRV_DUPLICADO_ERRADO' });
    }
    return json({ id: 'PASTA_REL_DRV' });
  };

  // Dispositivo B tem o documento sem driveFileId preenchido, mas o Dispositivo A já subiu com appProperties.athenesDocId
  const docSemDriveId = criarDocumento({ id: 'doc_multi_pc', titulo: 'Relatório Multi-PC' });
  docSemDriveId.id = 'doc_multi_pc';
  docSemDriveId.pastaId = 'pasta_rel_raiz';
  docSemDriveId.driveFileId = '';

  await enviarDocumentoAoDrive(docSemDriveId, 'tk', { fetchImpl, pastas });
  assert.equal(postsUpload, 0, 'não deve fazer POST criando arquivo duplicado no Drive');
  assert.equal(patchesUpload, 1, 'deve fazer PATCH no arquivo já existente encontrado por athenesDocId');
  assert.equal(docSemDriveId.driveFileId, 'DRV_JA_EXISTE');
});

import { mesclarExclusoesDoServidor, idsExcluidos, registrarExclusoes } from '../src/core/athenes_drive_sync.js';
import { montarEstadoLocal } from '../src/core/athenes_perfil_local.js';
import { removerDoLegado } from '../src/core/athenes_repositorio.js';
import { _reiniciarContaEmMemoria } from '../src/core/athenes_conta.js';

test('documento legado sem driveFileId excluido no PC NAO ressuscita no celular (exclusao mais nova vence)', () => {
  const servidor = {
    pastas: [],
    documentos: [
      { id: 'doc_arqcon', titulo: 'ARQ.CON', tipoDoc: 'artigo', pastaId: 'p1', driveFileId: 'F_ARQ', atualizadoEm: '2026-11-17T10:00:00Z', conteudoEm: '2026-11-17T10:00:00Z' }
    ],
    excluidos: {
      'i:doc_diag_legado': '2026-11-25T10:00:00Z',
      'i:doc_editado_depois': '2026-11-25T10:00:00Z'
    }
  };
  const celular = {
    pastas: [],
    documentos: [
      { id: 'doc_diag_legado', titulo: 'Relatório Técnico de Diagnóstico', tipoDoc: 'relatorio', dataModificacao: '2026-11-02T10:00:00Z' },
      { id: 'doc_editado_depois', titulo: 'Editado Depois', tipoDoc: 'artigo', dataModificacao: '2026-11-26T10:00:00Z' }
    ],
    excluidos: {}
  };
  const r = mesclarPerfil(servidor, celular);
  assert.deepEqual(r.remover, ['doc_diag_legado'], 'doc antigo de 02/11 sem driveFileId deve ser removido no celular');
  assert.ok('i:doc_diag_legado' in r.indice.excluidos, 'a exclusão do PC não pode ser apagada do servidor');
  assert.ok(!r.indice.documentos.some(d => d.id === 'doc_diag_legado'), 'doc excluído não volta ao índice');
  assert.ok(r.indice.documentos.some(d => d.id === 'doc_editado_depois'), 'edição genuinamente posterior à exclusão continua vencendo');
});

test('exclusoes do servidor sao propagadas para idsExcluidos local, montarEstadoLocal envia i:+f: e removerDoLegado limpa localStorage', () => {
  const m = new Map();
  globalThis.localStorage = {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    key: i => [...m.keys()][i],
    get length() { return m.size; }
  };
  _reiniciarContaEmMemoria();

  // Simula PC excluindo um documento com driveFileId: montarEstadoLocal deve emitir tanto i: quanto f:
  registrarExclusoes([{ id: 'doc_x', driveFileId: 'DRV_X' }]);
  const estadoPc = montarEstadoLocal([]);
  assert.ok('i:doc_x' in estadoPc.excluidos && 'f:DRV_X' in estadoPc.excluidos);

  // Simula celular recebendo exclusão de documento compartilhado do servidor + limpando legado
  m.set('athenes_docs_indice', JSON.stringify([{ id: 'doc_velho', titulo: 'Velho' }, { id: 'doc_fica', titulo: 'Fica' }]));
  const qtd = mesclarExclusoesDoServidor({ 'i:doc_comp_teste': '2026-11-25T10:00:00Z', 'i:doc_velho': '2026-11-25T10:00:00Z' });
  assert.equal(qtd, 2);
  assert.ok(idsExcluidos().has('doc_comp_teste'));

  const removidos = removerDoLegado(['doc_velho']);
  assert.equal(removidos, 1);
  const restante = JSON.parse(m.get('athenes_docs_indice'));
  assert.deepEqual(restante.map(d => d.id), ['doc_fica']);
});

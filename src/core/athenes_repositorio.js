// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Athenes — Documentos na MEMÓRIA da sessão (nada de documento gravado no navegador).
 *
 * Onde os documentos vivem de verdade: o índice no servidor (o que existe, onde fica, o que mudou) e o conteúdo no Google Drive
 * da pessoa (e uma cópia na nuvem protegida). Aqui fica só a lista aberta durante o uso; ao recarregar a página ela é refeita a
 * partir do servidor, e o conteúdo de cada documento é baixado quando ele é aberto.
 *
 * Os dados que versões anteriores gravavam no navegador (`athenes_docs_indice`) são lidos UMA vez para não perder nada, e só
 * são apagados depois de confirmado que todos os documentos estão no Drive.
 */
import { lerConta, removerConta, obterContaAtiva } from './athenes_conta.js';
import { sanearDocumentoEstilos } from './athenes_estilo_exclusivo.js';

const CHAVE_LEGADO = 'athenes_docs_indice';
const memoria = { conta: undefined, docs: [], legadoLido: false };

function garantirConta() {
  const conta = obterContaAtiva?.() || '';
  if (memoria.conta !== conta) Object.assign(memoria, { conta, docs: [], legadoLido: false }); // outra conta: nada da anterior vaza
}

/**
 * Remove duplicatas em uma lista de documentos (mesmo `id` ou mesmo `driveFileId`),
 * preservando a cópia com conteúdo carregado / id canônico (não `drive_...`) / data mais recente.
 */
export function deduplicarDocumentos(lista = []) {
  if (!Array.isArray(lista) || lista.length <= 1) return Array.isArray(lista) ? [...lista] : [];
  const ehTemp = (id) => String(id || '').startsWith('drive_');
  const escolherMelhor = (a, b) => {
    const score = (d) =>
      (d.precisaCarregarConteudo ? 0 : 4) +
      (!ehTemp(d.id) ? 2 : 0) +
      (d.driveFileId ? 1 : 0);
    const sa = score(a), sb = score(b);
    let vencedor = a, perdedor = b;
    if (sb > sa || (sb === sa && (b.dataModificacao || '') > (a.dataModificacao || ''))) {
      vencedor = b; perdedor = a;
    }
    const id = ehTemp(vencedor.id) && !ehTemp(perdedor.id) ? perdedor.id : vencedor.id;
    return {
      ...vencedor,
      id,
      driveFileId: vencedor.driveFileId || perdedor.driveFileId || undefined,
      driveFolderId: vencedor.driveFolderId || perdedor.driveFolderId || undefined,
      pastaId: vencedor.pastaId || perdedor.pastaId || undefined,
      salvoNuvem: Boolean(vencedor.salvoNuvem || perdedor.salvoNuvem)
    };
  };

  const saida = [];
  for (const doc of lista) {
    if (!doc) continue;
    const idStr = String(doc.id || '');
    const idx = saida.findIndex(x =>
      (idStr && String(x.id || '') === idStr) ||
      (doc.driveFileId && x.driveFileId && x.driveFileId === doc.driveFileId)
    );
    if (idx >= 0) saida[idx] = escolherMelhor(saida[idx], doc);
    else saida.push(doc);
  }
  return saida;
}

export function listar() { garantirConta(); return memoria.docs; }
export function definir(lista) { garantirConta(); memoria.docs = deduplicarDocumentos(Array.isArray(lista) ? lista : []); }
export function reiniciar() { Object.assign(memoria, { conta: undefined, docs: [], legadoLido: false }); }

/** Insere ou substitui um documento na lista da sessão (mais recente primeiro), sem duplicar por id ou driveFileId. */
export function gravarDocumento(doc) {
  garantirConta();
  sanearDocumentoEstilos(doc); // documento antigo vindo do servidor/Drive: só estilos, sem sobrescritas
  const idStr = String(doc.id);
  let i = memoria.docs.findIndex(d => String(d.id) === idStr);
  if (i < 0 && doc.driveFileId) {
    i = memoria.docs.findIndex(d => d.driveFileId === doc.driveFileId);
  }
  if (i >= 0) {
    memoria.docs[i] = doc;
    // Remove eventuais cópias secundárias que compartilhem o mesmo id ou driveFileId
    memoria.docs = memoria.docs.filter((d, idx) => idx === i || (String(d.id) !== idStr && (!doc.driveFileId || d.driveFileId !== doc.driveFileId)));
  } else {
    memoria.docs.unshift(doc);
  }
}

function lerLegado() {
  try { const v = JSON.parse(lerConta(CHAVE_LEGADO) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Há documentos de versões antigas ainda guardados no navegador? */
export const legadoPendente = () => lerLegado().length > 0;

/** Traz para a memória (uma vez por sessão e conta) os documentos que versões antigas deixaram no navegador. Devolve quantos. */
export function carregarLegadoUmaVez() {
  garantirConta();
  if (memoria.legadoLido) return 0;
  memoria.legadoLido = true;
  const antigos = lerLegado();
  for (const d of antigos) if (!memoria.docs.some(x => String(x.id) === String(d.id))) memoria.docs.push(d);
  return antigos.length;
}

/**
 * Apaga do navegador a cópia antiga, mas SÓ se todos os documentos do usuário já estiverem a salvo no Drive (`estaASalvo(doc)`).
 * Devolve true se apagou.
 */
export function removerLegadoSeSeguro(estaASalvo) {
  const antigos = lerLegado();
  if (!antigos.length) return false;
  const emMemoria = new Map(listar().map(d => [String(d.id), d]));
  // vale o documento mais novo (o da memória, que pode ter sido atualizado nesta sessão)
  const todosASalvo = antigos.every(a => {
    const d = emMemoria.get(String(a.id));
    return d ? estaASalvo(d) : true; // sumiu da lista = foi excluído de propósito
  });
  if (!todosASalvo) return false;
  removerConta(CHAVE_LEGADO);
  try {
    const ls = globalThis.localStorage;
    const chaves = Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter(k => /^athenes_doc_/.test(String(k)));
    chaves.forEach(k => ls.removeItem(k));
  } catch (_) {}
  return true;
}

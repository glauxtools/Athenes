// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Athenes — Índice do perfil no servidor: a FONTE DA VERDADE do que existe e do que vale para uma conta.
 *
 * Cada conta tem UM registro no servidor (protegido: só o dono lê e grava) com: a árvore de pastas (mesmos ids em todos os
 * computadores), a lista de documentos (título, pasta, arquivo no Drive, quando o conteúdo mudou), o que foi excluído, os ids das
 * pastas do Drive e a conexão do Zotero — toda a comunicação entre os computadores, exceto o próprio arquivo. Cada computador só LÊ esse
 * registro e mostra o que ele diz; mudanças locais são enviadas a ele e vira o estado de todos. O conteúdo dos documentos
 * continua no Drive da pessoa (o servidor guarda só o índice).
 *
 * Funções puras (`mesclarPerfil`) separadas da rede, e a rede recebe `fetchImpl` (testável sem navegador).
 */
import {aplicarEspelhoZotero,escolherEspelhoZotero,espelharColecoesNasPastas,colecoesMaisRecentes,resolverAliasPasta} from './athenes_zotero_pastas.js';
import { obterConfigSupabase } from './athenes_colaboracao.js';
import { decidirConfigZotero } from './athenes_zotero_config.js';
import { cabecalhosSupabase, lerSessaoSupabase } from './athenes_supabase_auth.js';

export const PREFIXO_ID_PERFIL = '__perfil__:';
export const idDoRegistroDoPerfil = (userId) => `${PREFIXO_ID_PERFIL}${userId}`;
export const ehRegistroDePerfil = (id) => String(id || '').startsWith(PREFIXO_ID_PERFIL);

const clone = (o) => JSON.parse(JSON.stringify(o));
const chaveExclusao = (d) => (d.driveFileId ? `f:${d.driveFileId}` : `i:${d.id}`);

/** Um documento do usuário (não compartilhado comigo) como entrada do índice. */
export function entradaDoDocumento(d) {
  return {
    id: String(d.id), titulo: d.titulo || 'Documento', subtitulo: d.subtitulo || '', tipoDoc: d.tipoDoc || 'artigo', perfilId: d.perfilId || d.perfil || 'abnt',
    pastaId: d.pastaId || '', driveFileId: d.driveFileId || '', driveFolderId: d.driveFolderId || '',
    atualizadoEm: d.dataModificacao || d.dataCriacao || '',
    conteudoEm: d.driveSincronizadoEm || '',
    salvoNuvem: Boolean(d.salvoNuvem)
  };
}

/** O documento tem alteração ainda não enviada ao Drive? */
export const temAlteracaoPendente = (d) => !d.driveFileId || !d.driveSincronizadoEm || (d.dataModificacao || '') > d.driveSincronizadoEm;

/**
 * Uma edição local só vence uma exclusão remota (`dataExclusao`) se o documento foi realmente
 * modificado DEPOIS da exclusão — documentos antigos sem `driveFileId` no cache local de outro
 * dispositivo jamais podem ressuscitar após serem excluídos em outro aparelho.
 */
const edicaoVenceExclusao = (d, dataExclusao) => {
  if (!temAlteracaoPendente(d)) return false;
  if (!dataExclusao || typeof dataExclusao !== 'string') return false;
  const mod = String(d?.dataModificacao || '');
  return Boolean(mod) && mod > dataExclusao;
};

const nomeNorm = (n) => String(n || '').trim().toLowerCase();

/**
 * Soma duas árvores de pastas. Pastas "iguais" = mesmo id, mesmo id no Drive ou mesmo nome entre irmãs (um computador pode ter
 * criado/importado a mesma pasta com outro id: isso duplicava ARTIGOS e ARQ.CON). Fica o id de quem veio primeiro (servidor) e
 * `mapa` anota { idDescartado: idMantido } para religar documentos. Pastas excluídas (e o que há dentro delas) ficam de fora.
 */
function mesclarArvore(base = [], extra = [], mapa = {}, excluidas = {}, paiId) {
  const saida = [];
  const juntar = (entrada) => {
    const id = resolverAliasPasta(entrada.id, mapa);
    if (excluidas[entrada.id] || excluidas[id] || (entrada.driveId && excluidas[entrada.driveId])) return;
    const p = { ...entrada, id, ...(paiId ? { parentId: paiId } : {}) };
    const compartilhada = q => q.origem === 'compartilhada' || q.tipo === 'compartilhada';
    const mesmaOrigem = q => compartilhada(q) === compartilhada(p);
    const chavesCompativeis = q => !q.zoteroKey || !p.zoteroKey || q.zoteroKey === p.zoteroKey;
    const mesmoDrive = q => p.driveId && q.driveId === p.driveId;
    const nomesIguais = q => nomeNorm(q.nome) === nomeNorm(p.nome);
    const importadaDoDrive = q => q.driveId && q.id === `drive_${q.driveId}`;
    const irmas = [...base, ...extra].filter(q => mesmaOrigem(q) && nomesIguais(q) && q.id !== entrada.id);
    const sombraDrive = q => !compartilhada(p) && nomesIguais(q) &&
      (!p.driveId || !q.driveId) && new Set(irmas.map(i => i.id)).size === 1 &&
      ((p.zoteroKey && importadaDoDrive(q)) || (q.zoteroKey && importadaDoDrive(p)));
    const igual = saida.find(q => q.id === p.id) ||
      saida.find(q => mesmaOrigem(q) && chavesCompativeis(q) && mesmoDrive(q)) ||
      saida.find(q => mesmaOrigem(q) && ((q.zoteroKey === p.zoteroKey && nomesIguais(q) &&
        (!(p.tipo === 'bibliografia' || q.tipo === 'bibliografia') || !p.driveId || !q.driveId)) || sombraDrive(q)));
    if (!igual) {
      const novo = { ...clone(p), subpastas: [] };
      saida.push(novo);
      novo.subpastas = mesclarArvore([], p.subpastas || [], mapa, excluidas, novo.id);
      return;
    }
    const manterColecao = !igual.zoteroKey && p.zoteroKey;
    const mantida = manterColecao ? { ...clone(p), driveId: p.driveId || igual.driveId } : igual;
    const outra = manterColecao ? igual : p;
    if (mantida.id !== outra.id) mapa[outra.id] = mantida.id;
    if (!mantida.driveId && outra.driveId) mantida.driveId = outra.driveId;
    // cor da pasta: vale a escolha mais recente (`corEm`); sem carimbo, a primeira cor conhecida
    if (outra.cor && (!mantida.cor || (outra.corEm || '') > (mantida.corEm || ''))) { mantida.cor = outra.cor; if (outra.corEm) mantida.corEm = outra.corEm; }
    mantida.subpastas = mesclarArvore(mantida.subpastas || [], outra.subpastas || [], mapa, excluidas, mantida.id);
    if (manterColecao) saida[saida.indexOf(igual)] = mantida;
  };
  for (const p of base) juntar(p);
  for (const p of extra) juntar(p);
  return saida;
}

/**
 * Junta o índice do servidor com o estado local e diz o que cada lado precisa fazer.
 *  - servidor: { pastas, documentos[], excluidos{} } ou null (primeira vez)
 *  - local:    { pastas, documentos[] (docs completos), excluidos{} (exclusões registradas aqui) }
 * Regras: exclusão vale em todos (a menos que o documento tenha alteração pendente: aí a edição vence e ele volta);
 * entre duas versões da mesma entrada vale a mais recente; pastas se somam (mesmos ids em todos os computadores).
 * Também mescla os ids das pastas do Drive (`drive`) e a conexão do Zotero (`zotero`).
 * Devolve { indice, remover[], adicionar[], atualizar[], recarregar[], pastas, aplicarDrive, aplicarZotero, mudouServidor }.
 */
export function mesclarPerfil(servidor, local) {
  const srv = servidor ? clone(servidor) : { pastas: [], documentos: [], excluidos: {} };
  const excluidos = { ...(srv.excluidos || {}), ...(local.excluidos || {}) };
  const entradas = new Map();           // chave de identidade -> entrada
  const idParaChave = new Map();        // id lógico do documento -> chave atual em `entradas`
  const chaveDe = (e) => (e.driveFileId ? `f:${e.driveFileId}` : `i:${e.id}`);
  const ehIdTemporarioDrive = (id) => String(id || '').startsWith('drive_');
  const mesclarDuasEntradas = (a, b) => {
    // Escolhe o id canônico: nunca substitui um id real por um id temporário `drive_...`
    const id = ehIdTemporarioDrive(b.id) && !ehIdTemporarioDrive(a.id)
      ? a.id
      : (ehIdTemporarioDrive(a.id) && !ehIdTemporarioDrive(b.id) ? b.id : ((b.atualizadoEm || '') >= (a.atualizadoEm || '') ? b.id : a.id));
    const conteudoEm = [a.conteudoEm, b.conteudoEm].filter(Boolean).sort().at(-1) || '';
    const bMaisNovo = (b.atualizadoEm || '') >= (a.atualizadoEm || '');
    const base = bMaisNovo ? b : a;
    const outro = bMaisNovo ? a : b;
    // Preserva driveFileId válido: se ambos têm driveFileId diferentes (criados por 2 dispositivos), fica o do conteúdo/atualização mais recente
    const driveFileId = (a.driveFileId && b.driveFileId && a.driveFileId !== b.driveFileId)
      ? ((b.conteudoEm || b.atualizadoEm || '') >= (a.conteudoEm || a.atualizadoEm || '') ? b.driveFileId : a.driveFileId)
      : (base.driveFileId || outro.driveFileId || '');
    const driveFolderId = driveFileId === b.driveFileId
      ? (b.driveFolderId || a.driveFolderId || '')
      : (a.driveFolderId || b.driveFolderId || '');
    return {
      ...base,
      id: String(id),
      driveFileId,
      driveFolderId,
      conteudoEm,
      salvoNuvem: Boolean(a.salvoNuvem || b.salvoNuvem)
    };
  };
  const guardar = (e) => {
    const idStr = String(e.id);
    const k = chaveDe(e);
    const kPorId = idParaChave.get(idStr);
    const atualPorChave = entradas.get(k) || null;
    const atualPorId = (kPorId && kPorId !== k) ? (entradas.get(kPorId) || null) : null;

    let combinado = { ...e, id: idStr };
    if (atualPorChave) combinado = mesclarDuasEntradas(atualPorChave, combinado);
    if (atualPorId) combinado = mesclarDuasEntradas(atualPorId, combinado);

    const kFinal = chaveDe(combinado);
    if (kPorId && kPorId !== kFinal) entradas.delete(kPorId);
    if (k !== kFinal) entradas.delete(k);
    if (atualPorChave && chaveDe(atualPorChave) !== kFinal) entradas.delete(chaveDe(atualPorChave));
    if (atualPorId && chaveDe(atualPorId) !== kFinal) entradas.delete(chaveDe(atualPorId));

    entradas.set(kFinal, combinado);
    idParaChave.set(String(combinado.id), kFinal);
    if (idStr !== String(combinado.id)) idParaChave.set(idStr, kFinal);
  };
  for (const e of srv.documentos || []) guardar(e);

  const proprios = (local.documentos || []).filter(d => !d.compartilhadoComigo && !d.proprietarioExterno);
  const remover = [];
  for (const d of proprios) {
    const e = entradaDoDocumento(d);
    const excl = excluidos[chaveExclusao(d)] || excluidos[`i:${d.id}`];
    if (excl) {
      if (edicaoVenceExclusao(d, excl)) { delete excluidos[chaveExclusao(d)]; delete excluidos[`i:${d.id}`]; guardar(e); } // edição posterior vence exclusão: o documento volta
      else remover.push(String(d.id));
      continue;
    }
    guardar(e);
  }
  for (const k of [...entradas.keys()]) if (excluidos[k] || excluidos[`i:${entradas.get(k).id}`]) entradas.delete(k);

  const documentos = [...entradas.values()];
  const idsLocais = new Map();
  const porArquivoLocal = new Map();
  for (const d of proprios) {
    const idStr = String(d.id);
    if (!idsLocais.has(idStr) || (idsLocais.get(idStr).precisaCarregarConteudo && !d.precisaCarregarConteudo)) idsLocais.set(idStr, d);
    if (d.driveFileId) {
      const ant = porArquivoLocal.get(d.driveFileId);
      // prefere o documento com id canônico (não `drive_...`) e já carregado
      if (!ant || (ehIdTemporarioDrive(ant.id) && !ehIdTemporarioDrive(d.id)) || (ant.precisaCarregarConteudo && !d.precisaCarregarConteudo)) {
        porArquivoLocal.set(d.driveFileId, d);
      }
    }
  }
  const adicionar = []; const atualizar = []; const recarregar = [];
  for (const e of documentos) {
    const l = idsLocais.get(String(e.id)) || (e.driveFileId && porArquivoLocal.get(e.driveFileId));
    if (!l) { adicionar.push(e); continue; }
    // Se havia cópia local duplicada com id temporário `drive_...` além da entrada canônica, remove o temporário
    if (e.driveFileId) {
      for (const d of proprios) {
        if (d !== l && d.driveFileId === e.driveFileId && String(d.id) !== String(e.id) && !remover.includes(String(d.id))) {
          remover.push(String(d.id));
        }
      }
    }
    // o conteúdo foi regravado no Drive por outro computador depois do que este tem: baixar de novo (se aqui não há edição pendente)
    if (e.conteudoEm && l.driveSincronizadoEm && e.conteudoEm > l.driveSincronizadoEm && !temAlteracaoPendente(l)) recarregar.push(String(l.id));
    if (!remover.includes(String(l.id)) && (e.atualizadoEm || '') > (l.dataModificacao || '') && !temAlteracaoPendente(l)) atualizar.push({ local: String(l.id), entrada: e });
    else if (String(l.id).startsWith('drive_') && !String(e.id).startsWith('drive_')) atualizar.push({ local: String(l.id), entrada: e });
    else if (!l.driveFileId && e.driveFileId) atualizar.push({ local: String(l.id), entrada: e });
  }

  const pastasExcluidas = { ...(srv.pastasExcluidas || {}), ...(local.pastasExcluidas || {}) };
  const mapaIds = { ...srv.idsPastasUnificados };
  let pastas = mesclarArvore(srv.pastas || [], local.pastas || [], mapaIds, pastasExcluidas);
  const espelho = escolherEspelhoZotero(srv.pastas, local.pastas);
  if (espelho) {
    const r = aplicarEspelhoZotero(pastas, espelho);
    pastas = r.pastas;
    Object.assign(mapaIds, r.idsUnificados);
  } else {
    const keysAtivas = new Set(colecoesMaisRecentes(pastas).map(c => c.key));
    const colecoes = colecoesMaisRecentes(srv.pastas, local.pastas).filter(c => keysAtivas.has(c.key));
    if (colecoes.length) {
      const r = espelharColecoesNasPastas(pastas, colecoes);
      pastas = r.pastas;
      Object.assign(mapaIds, r.idsUnificados);
    }
  }
  for(const id of Object.keys(mapaIds))mapaIds[id]=resolverAliasPasta(id,mapaIds);
  // documentos: pasta duplicada descartada → a mantida; pasta excluída → volta à pasta padrão
  for (const e of documentos) {
    if (mapaIds[e.pastaId]) e.pastaId = mapaIds[e.pastaId];
    if (pastasExcluidas[e.pastaId]) e.pastaId = '';
  }

  // ids das pastas do Drive: o primeiro computador a gravar define; os demais usam os mesmos (acaba com "cada PC com a sua pasta")
  const driveLocal = local.drive || {};
  const drive = { ...driveLocal, ...Object.fromEntries(Object.entries(srv.drive || {}).filter(([, v]) => v)) };
  const aplicarDrive = Object.entries(drive).some(([k, v]) => v && v !== driveLocal[k]) ? drive : null;

  // conexão do Zotero: vale a mudança mais recente (o computador que mudou desde a última sincronização)
  const cfgLocal = local.zotero?.cfg || null;
  const temLocal = Boolean(cfgLocal?.apiKey && cfgLocal?.userId);
  const canonZ = (c) => JSON.stringify([c?.userId || '', c?.apiKey || '', c?.username || '', Boolean(c?.isGroup)]);
  let zotero = srv.zotero || null; let aplicarZotero = null;
  const diferenteZ = !zotero || canonZ(zotero.cfg) !== canonZ(cfgLocal);
  const vencedor = !zotero ? 'local' : decidirConfigZotero(cfgLocal, zotero.cfg, { localMudou: Boolean(local.zotero?.mudou), remotoEm: zotero.atualizadoEm || '' });
  if (temLocal && diferenteZ && vencedor === 'local') zotero = { cfg: cfgLocal, atualizadoEm: cfgLocal.alteradoEm || new Date().toISOString() };
  else if (zotero?.cfg?.apiKey && canonZ(zotero.cfg) !== canonZ(cfgLocal)) aplicarZotero = { ...zotero.cfg, ...(zotero.atualizadoEm ? { alteradoEm: zotero.atualizadoEm } : {}) };

  const indice = { versao: (srv.versao || 0) + 1, pastas, documentos, excluidos, pastasExcluidas, drive, ...(zotero ? { zotero } : {}),
    ...(Object.keys(mapaIds).length ? { idsPastasUnificados: mapaIds } : {}) };
  const canon = (o) => JSON.stringify(o, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));
  const resumo = (x) => canon({ p: x.pastas || [], d: [...(x.documentos || [])].sort((m, n) => String(m.id).localeCompare(String(n.id))), e: Object.keys(x.excluidos || {}).sort(), pe: Object.keys(x.pastasExcluidas || {}).sort(), dr: x.drive || {}, a: x.idsPastasUnificados || {}, z: x.zotero?.cfg || null }); // o banco reordena as chaves do JSON
  const igual = (a, b) => resumo(a) === resumo(b);
  return { indice, remover, adicionar, atualizar, recarregar, pastas, mapaIds, pastasExcluidas, aplicarDrive, aplicarZotero, mudouServidor: !servidor || !igual(servidor, indice) };
}

// ───────────────────────────── Rede ─────────────────────────────

const urlTabela = (cfg, consulta) => `${cfg.url}/rest/v1/${cfg.tabela}?${consulta}`;

/** Lê o índice do perfil no servidor: { indice, versaoLinha } ou null (ainda não existe) ou lança (sem sessão/erro). */
export async function lerPerfilDoServidor(fetchImpl = globalThis.fetch) {
  const sessao = lerSessaoSupabase();
  if (!sessao?.user_id) throw new Error('Sem sessão da nuvem protegida.');
  const cfg = obterConfigSupabase();
  const resp = await fetchImpl(urlTabela(cfg, `id=eq.${encodeURIComponent(idDoRegistroDoPerfil(sessao.user_id))}&select=conteudo_json,atualizado_em&limit=1`), { headers: await cabecalhosSupabase(cfg, { fetchImpl }) });
  if (!resp.ok) throw new Error(`Não foi possível ler o índice do perfil (${resp.status}).`);
  const linha = (await resp.json())?.[0];
  return linha ? { indice: linha.conteudo_json || {}, versaoLinha: linha.atualizado_em } : null;
}

/**
 * Grava o índice. Com `versaoLinha` só grava se ninguém gravou antes (conflito → false e o chamador lê e mescla de novo);
 * sem ela, cria o registro. Devolve true/false.
 */
export async function gravarPerfilNoServidor(indice, versaoLinha, fetchImpl = globalThis.fetch) {
  const sessao = lerSessaoSupabase();
  if (!sessao?.user_id) throw new Error('Sem sessão da nuvem protegida.');
  const cfg = obterConfigSupabase();
  const id = idDoRegistroDoPerfil(sessao.user_id);
  const agora = new Date().toISOString();
  const corpo = { titulo: 'Índice do perfil', autor: '', norma: '', conteudo_json: { ...indice, atualizadoEm: agora }, sugestoes_json: [], atualizado_em: agora, atualizado_por: 'Athenes' };
  const cab = await cabecalhosSupabase(cfg, { fetchImpl });
  if (!versaoLinha) {
    const resp = await fetchImpl(urlTabela(cfg, ''), { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal', ...cab }, body: JSON.stringify({ id, ...corpo }) });
    if (resp.status === 409) return false; // outro computador criou primeiro
    if (!resp.ok) throw new Error(`Não foi possível criar o índice do perfil (${resp.status}).`);
    return true;
  }
  const resp = await fetchImpl(urlTabela(cfg, `id=eq.${encodeURIComponent(id)}&atualizado_em=eq.${encodeURIComponent(versaoLinha)}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation', ...cab }, body: JSON.stringify(corpo) });
  if (!resp.ok) throw new Error(`Não foi possível gravar o índice do perfil (${resp.status}).`);
  return ((await resp.json()) || []).length > 0;
}

/**
 * Um ciclo completo: lê o servidor, mescla com o estado local, grava se mudou (repete se houve conflito) e devolve o que o
 * computador precisa aplicar. `local` = { pastas, documentos, excluidos }. Lança se não houver sessão/erro de rede.
 */
export async function sincronizarPerfil(local, { fetchImpl = globalThis.fetch, tentativas = 3 } = {}) {
  const usuario = lerSessaoSupabase()?.user_id;
  const conferirSessao = () => { if (!usuario || lerSessaoSupabase()?.user_id !== usuario) throw new Error('A conta mudou durante a sincronização.'); };
  for (let i = 0; i < tentativas; i++) {
    conferirSessao();
    const atual = await lerPerfilDoServidor(fetchImpl);
    conferirSessao();
    const r = mesclarPerfil(atual?.indice || null, local);
    if (!r.mudouServidor) return { ...r, criado: !atual, gravou: false };
    if (await gravarPerfilNoServidor(r.indice, atual?.versaoLinha || '', fetchImpl)) { conferirSessao(); return { ...r, criado: !atual, gravou: true }; }
  }
  throw new Error('O índice do perfil mudou em outro computador durante a sincronização. Tente de novo.');
}

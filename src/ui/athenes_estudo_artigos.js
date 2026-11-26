import {instalarBuscaArtigo,registrarTextoPdfBuscavel} from './athenes_busca_artigo.js';
import {podeEditarRelacoes as podeEditarRelacoesDestino} from '../core/athenes_relacoes.js';
// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Athenes — Estúdio de Leitura, Risco em PDF (estilo Samsung Notes) e Fichamento Síncrono (Zotero + Google Drive).
 *
 * Recursos principais:
 * 1. Tela Cheia em 3 Colunas (.rm-conteudo / .rm-ed-grade) idêntica ao Editor de Escrita:
 *    - Coluna Esquerda 50/50 (.rm-card-meio-a-meio): Artigos do Zotero na metade superior + Páginas do PDF na metade inferior.
 *    - Coluna Central: Todas as páginas do PDF empilhadas em rolagem contínua (.rm-prev-palco) com barra flutuante (.rm-barra-blocos).
 *    - Coluna Direita: Inspetor em altura total (Resumo & Notas, Citações & Destaques, Zotero & Drive).
 * 2. Desenho Livre + Modo Linha Reta (estilo Samsung Notes):
 *    - Caneta e Marca-Texto operam à mão livre ou em Modo Linha Reta (botão "Linha Reta" na barra ou tecla Shift, com trava ortogonal 0°/90°).
 * 3. Notas Adesivas Editáveis na Folha (sem window.prompt):
 *    - Card flutuante Soft UI diretamente sobre a página do PDF; clicar em qualquer nota abre a edição de título, texto, cor e posição.
 * 4. Seleção de Texto Interativa:
 *    - Ao selecionar qualquer trecho do PDF, surge uma pílula flutuante sobre a seleção para Grifar Texto (<mark>),
 *      Salvar Citação no Zotero (p. X), Criar Nota Adesiva ou Copiar em formato ABNT.
 */

import * as bib from '../core/athenes_biblioteca_artigos.js';
import { gravarConfigZotero, lerConfigZotero } from '../core/athenes_zotero_config.js';
import { lerConta, gravarConta, obterContaAtiva } from '../core/athenes_conta.js';
import { obterTokenOuConectar, obterTokenDrive, driveConectado, sincronizarZoteroComDrive, obterOuCriarPastaDoArtigoNoDrive, moverArquivosDoArtigoNoDrive, reconciliarArtigosComDrive, moverArquivoNoDrive, removerPastaExcluida, registrarPastasExcluidas } from '../core/athenes_drive_sync.js';
import { ZoteroClient } from '../core/athenes_zotero.js';
import { obterPerfilColaborador, obterConfigGoogleDrive, salvarArquivoNoGoogleDrive, autenticarGoogleDrive, listarPdfsDoGoogleDrive, salvarDocumentoNoSupabase, obterPastasDriveLocais, salvarPastasDriveLocais, buscarPastaNaArvore } from '../core/athenes_colaboracao.js';
import { escapeHtml } from '../core/athenes_seguranca.js';
import {
  HistoricoLinear,
  clonarEstadoArtigo,
  aplicarEstadoArtigo,
  clonarEstadoCatalogo,
  restaurarEstadoCatalogo,
  classificarAtalhoHistorico
} from '../core/athenes_estudo_historico.js';
import { svgIcone } from './athenes_icones.js';
import {PainelConexoes,construirListaPastasRelacoes} from './athenes_painel_conexoes.js';
import {registrosReferencias,CAMPOS_RELACOES,camposRelacoesComVariaveis,inserirFiguraRelacoes} from '../core/athenes_relacoes.js';
import * as documentosRelacoes from '../core/athenes_repositorio.js';
import { aplicarEspelhoZotero, aplicarColecoesZoteroAosArtigos, descartarColecoesQueSairamDoZotero, escolherEspelhoZotero, artigoEstaNaPasta, artigoEstaNasPastas, remapearPastasDosArtigos, resolverAliasPasta } from '../core/athenes_zotero_pastas.js';
import { obterCatalogoVariaveis, registrarVariavelNoCatalogo, definirVariavelNoArtigo, removerVariavelDoArtigo, normalizarMapaVariaveis, slugVariavel } from '../core/athenes_variaveis_referencia.js';
import { aplicarFilhosZoteroAoArtigo } from '../core/athenes_zotero_anexos_notas.js';
import { tokenPodeLerTodoODrive, listarConteudoDoDrive, copiarPdfDoDriveParaAthenes, ESCOPOS_COM_LEITURA } from '../core/athenes_drive_navegar.js';
import { mostrarAviso } from './athenes_aviso.js';
import { ModalCompartilhar } from './athenes_compartilhar_modal.js';
import { listarCompartilhadosComigo, carregarDocumentoCompartilhado, salvarCompartilhamento } from '../core/athenes_compartilhamento.js';
import { lerSessaoSupabase } from '../core/athenes_supabase_auth.js';
import { paginaEditorialDoPdf } from '../core/athenes_pdf_identificadores.js';
import { removerPdfLocal, esquecerPdfGuardadoDoArtigo, renomearPdfDoArtigoNoDrive, PASTA_PDFS_DRIVE, artigoTemPdf, ehArtigoExemploFicticio, carregarPdfJs, obterPdfLocal, obterPdfComoDataUrl, garantirPdfDoArtigo, enviarPdfDoArtigoAoDrive, migrarPdfsLocaisParaODrive, carregarArtigosEstudo, salvarArtigosEstudo, sincronizarBibliotecaArtigosAgora, guardarSnapshotArtigosIdb, gerarHtmlNotaZoteroDoArtigo, formatarCitacaoAbntDoArtigo, definirArtigoAbertoAtivo, lerSnapshotArtigosIdb, mesclarFichamentoPreservandoDados, compartilharPdfNoDrive } from './athenes_estudo_artigos_dados.js';
import { baixarBibliografiaCsv, construirMapaCaminhosPastas } from '../core/athenes_export_bibliografia_csv.js';
import { metodosEstudoTela } from './athenes_estudo_artigos_tela.js';
import { metodosEstudoPainelDireito } from './athenes_estudo_artigos_painel_direito.js';
import { metodosEstudoAnotacoes } from './athenes_estudo_artigos_anotacoes.js';
import { metodosEstudoModais } from './athenes_estudo_artigos_modais.js';
import { metodosEstudoPastas, restaurarPastaAtiva, coletarPastasBibliografia, CORES_PASTAS_CRONOS, remapearSelecaoPastas } from './athenes_estudo_artigos_pastas.js';
import { renderizarEstante3D, fecharTodosLivros3D, tratarTecladoLivro3D, moverLivroParaPasta, calcularLivrosPorPrateleira } from './athenes_estudo_artigos_estante.js';

export { ehArtigoExemploFicticio, criarArtigosEstudoExemplo, migrarPdfsLocaisParaODrive, carregarArtigosEstudo, salvarArtigosEstudo, salvarArtigosEstudoDebounced, formatarCitacaoAbntDoArtigo, gerarHtmlNotaZoteroDoArtigo, calcularPontoFinalLinhaReta, ehBotaoBorracha } from './athenes_estudo_artigos_dados.js';

export class EstudoArtigosView {
  constructor(containerEl, opcoes = {}) {
    this.container = containerEl;
    this.opcoes = opcoes;
    this.onModoFullScreenChange = opcoes.onModoFullScreenChange || (() => {});
    this.artigos = carregarArtigosEstudo();
    this.artigosCompartilhados = [];
    this.pastasCompartilhadasRecebidas = [];
    this.gruposZoteroRecebidos = [];
    this.artigosGruposZotero = [];
    // a biblioteca vem do servidor: chegou algo de outro computador → atualiza a tela (sem interromper quem está lendo um artigo)
    this._cancelarBib = bib.aoMudarBiblioteca(() => {
      this.artigos = carregarArtigosEstudo();
      if (this.artigoAberto) {
        const atualizado = (this.artigos || []).find(a => String(a.id) === String(this.artigoAberto.id) || (this.artigoAberto.chaveZotero && a.chaveZotero === this.artigoAberto.chaveZotero));
        if (atualizado && atualizado !== this.artigoAberto) {
          mesclarFichamentoPreservandoDados(this.artigoAberto, atualizado);
          this.salvarCacheArtigoAbertoSessao(this.artigoAberto);
        }
        const colEsq = this.container?.querySelector('#athEstudioColEsq');
        if (colEsq) this.renderizarColunaEsquerdaEstudio(colEsq, this.artigoAberto, this.artigoAberto.conteudoPaginasPdf || []);
      } else {
        this.restaurarArtigoAbertoSessao();
        if (!this.artigoAberto && typeof this.renderizar === 'function') this.atualizarCatalogoSeLivre(true);
      }
    });
    this._bibliotecaInicial = bib.sincronizarBiblioteca()
      .catch(e => console.warn('[Athenes] Biblioteca no servidor:', e.message))
      .finally(() => { migrarPdfsLocaisParaODrive().catch(() => {}); }); // PDFs que ficaram só neste computador vão para o Drive assim que a biblioteca carrega
    if (typeof window !== 'undefined' && !window.__athenesOuvinteDrivePdfs) {
      window.__athenesOuvinteDrivePdfs = true;
      window.addEventListener('athenes:drive-conectado', () => {
        migrarPdfsLocaisParaODrive().catch(() => {});
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('athenes:drive-conectado', () => {
        const aberto = this.artigoAberto;
        if (aberto && !aberto.pdfBlobUrl && artigoTemPdf(aberto)) {
          this._carregandoPdf = aberto;
          this.renderizar?.();
          garantirPdfDoArtigo(aberto).then(ok => {
            if (this._carregandoPdf === aberto) this._carregandoPdf = null;
            if (this.artigoAberto === aberto && ok) this.renderizar?.();
          }).catch(() => {
            if (this._carregandoPdf === aberto) this._carregandoPdf = null;
            if (this.artigoAberto === aberto) this.renderizar?.();
          });
        }
      });
    }
    this.artigoAberto = null;
    this.paginaAtual = 1;
    this.zoomPct = 100;
    this.ferramentaAtiva = 'cursor'; // Começa com seleção de texto ou caneta; permite alternar livremente
    try {
      this.ordemReferencias = localStorage.getItem('athenes_ordem_referencias') || 'recente_desc';
    } catch (_) {
      this.ordemReferencias = 'recente_desc';
    }
    this.modoLinhaReta = false; // Quando true, Caneta e Marca-Texto fazem retas perfeitas
    this.bloquearDedoParaRolar = true; // Modo Samsung Notes ativo por padrão: Caneta escreve, Dedo rola/move e dá zoom
    this.corTinta = '#314F79';
    this.corGrifoAtiva = '#FDE047'; // Amarelo clássico por padrão; suporta verde, azul, coral, roxo, laranja
    this.espessuraTinta = 3;
    this.espessuraMarca = 18; // espessura própria do marca-texto
    this.carregarConfigPincelSalva();
    this.abaDireita = 'resumo'; // 'resumo' | 'citacoes' | 'zotero_drive'
    this.pinEditandoId = null; // ID da nota adesiva atualmente aberta para edição na folha
    this.filtroBusca = '';
    this.filtroStatus = 'todos';
    this.filtrosObra = { anoDe: '', anoAte: '', autor: '', editora: '', palavra: '' };
    this.filtrosVariaveis = {};
    this.filtroLateralEsq = '';
    this.pastaFiltroId = opcoes.pastaFiltroId || restaurarPastaAtiva({
      pastas: coletarPastasBibliografia(),
      storage: typeof sessionStorage !== 'undefined' ? sessionStorage : null
    }) || 'todas';
    this.aoMudarPastas = opcoes.aoMudarPastas || null;
    this.aoSincronizarDrive = opcoes.aoSincronizarDrive || null; // a página inicial envia pastas e documentos ao Drive // a página inicial refaz a lista de pastas quando as coleções do Zotero chegam
    this.zoteroClient = new ZoteroClient();
    this.carregarConfigZotero();
    this._historicosArtigo = new Map();
    this._aplicandoHistorico = false;
    this._historicoCatalogo = new HistoricoLinear({
      limite: 50,
      estadoInicial: clonarEstadoCatalogo(this.artigos, coletarPastasBibliografia())
    });
    this._instalarAtalhosHistoricoEstudio();
    this.hidratarSnapshotIndexedDb();
    this.restaurarArtigoAbertoSessao();
    if (!this.artigoAberto) this.renderizar();
    this._atualizacaoCatalogoPendente = null;
    if (containerEl && typeof containerEl.addEventListener === 'function' && !containerEl.dataset?.athOuvinteLivroFechado) {
      if (containerEl.dataset) containerEl.dataset.athOuvinteLivroFechado = '1';
      containerEl.addEventListener('athenes:livro-3d-fechado', () => {
        const pendente = this._atualizacaoCatalogoPendente;
        if (!pendente || this.artigoAberto || this.temLivrinhoAberto()) return;
        this._atualizacaoCatalogoPendente = null;
        if (pendente === 'renderizar') this.renderizar();
        else this.atualizarGridCatalogo();
      });
    }
    this.carregarCompartilhados();
    if (this.zoteroClient?.apiKey) this.carregarGruposZotero().catch(() => {});
    if (containerEl && typeof window !== 'undefined') {
      this._atualizarZoteroAoVoltar = () => this.sincronizarZoteroAutomaticamente();
      document.addEventListener('visibilitychange', this._atualizarZoteroAoVoltar);
      window.addEventListener('focus', this._atualizarZoteroAoVoltar);
      window.addEventListener('online', this._atualizarZoteroAoVoltar);
      this._intervaloZotero = setInterval(this._atualizarZoteroAoVoltar, 120_000);
      queueMicrotask(this._atualizarZoteroAoVoltar);
    }
  }

  abrirAnaliseRelacoes(){
    this._fecharRelacoes?.();
    const overlay=document.createElement('div');overlay.className='ath-modal-backdrop';
    const docs=documentosRelacoes.listar().filter(d=>podeEditarRelacoesDestino(d)&&!d.precisaCarregarConteudo&&d.secoes?.some(sec=>Array.isArray(sec.blocos)));
    overlay.innerHTML=`<section class="ath-modal ath-relations-modal"><header class="ath-modal-head"><h2>Análise das referências</h2><label class="ath-rel-head-dest">Inserir em <select data-rel-destination><option value="">Escolha um documento aberto</option>${docs.map(d=>`<option value="${escapeHtml(d.id)}">${escapeHtml(d.titulo||'Documento')}</option>`).join('')}</select></label><button type="button" data-rel-close aria-label="Fechar">×</button></header><div class="ath-modal-corpo" data-rel-body></div></section>`;document.body.append(overlay);
    const all=this.artigosCatalogo().filter(article=>!article.compartilhadoComigo),current=all.filter(a=>!this.pastaFiltroId||this.pastaFiltroId==='todas'||this.pastaFiltroId==='compartilhados_comigo'&&a.compartilhadoComigo||artigoEstaNaPasta(a,this.pastaFiltroId));
    const pastasArvore=obterPastasDriveLocais();
    const folders=construirListaPastasRelacoes(all,pastasArvore);
    const fieldsAll=camposRelacoesComVariaveis(all);
    const fieldsCurrent=camposRelacoesComVariaveis(current);
    const sources=[
      {
        id:'library',
        label:'Todas as referências próprias',
        fields:fieldsAll,
        defaultStages:['author','theme','year'],
        folders,
        records:(scope={})=>{
          const filtrados=scope?.folderIds?.length?all.filter(a=>artigoEstaNasPastas(a,scope.folderIds,{pastas:pastasArvore,incluirSubpastas:scope.includeSubfolders!==false})):all;
          return registrosReferencias(filtrados,{pastas:pastasArvore});
        }
      },
      {
        id:'current-folder',
        label:'Pasta atual',
        fields:fieldsCurrent,
        defaultStages:['author','theme','year'],
        records:()=>registrosReferencias(current,{pastas:pastasArvore})
      }
    ];
    if(this.pastaFiltroId==='compartilhados_comigo')sources.pop();
    const acharArtigoPorId=recId=>this.artigosCatalogo().find(a=>String(a.id||a.chaveZotero||a.chave)===String(recId));
    const panel=new PainelConexoes(overlay.querySelector('[data-rel-body]'),{referencias:all,secoes:[]},{
      sources,
      pastas:pastasArvore,
      folders,
      currentFolderId:this.pastaFiltroId||'todas',
      initial:this.analiseRelacoes,
      onCreateVariable:def=>registrarVariavelNoCatalogo(def,this.artigos),
      onOpenRecord:recId=>{
        const art=acharArtigoPorId(recId);
        if(!art)return;
        this._fecharRelacoes?.();
        if(art.compartilhadoComigo&&!this.artigos.includes(art))this.abrirArtigoCompartilhadoRecebido(art);
        else this.abrirArtigoNoEstudio(art,1);
      },
      onOpenBook:recId=>{
        const art=acharArtigoPorId(recId);
        if(!art)return;
        this._fecharRelacoes?.();
        const seletor=`[data-livro-id="${CSS.escape(String(art.id||''))}"]`;
        let livroEl=document.querySelector(seletor);
        if(!livroEl){
          this.filtroBusca='';
          const inBusca=document.getElementById('athEstudoBuscaCatalogo');
          if(inBusca)inBusca.value='';
          this.pastaFiltroId=art.pastaId||'todas';
          this.renderizarArvorePastas?.();
          this.atualizarGridCatalogo();
          livroEl=document.querySelector(seletor);
        }
        if(livroEl){
          livroEl.scrollIntoView?.({behavior:'smooth',block:'center'});
          if(!livroEl.classList?.contains('aberto'))livroEl.click();
        }
      },
      onMutateRecordVariable:(recordIds,varName,val)=>{
        const ids=new Set((recordIds||[]).map(String));
        let mudou=false;
        for(const art of this.artigos){
          if(ids.has(String(art.id||art.chaveZotero||art.chave))){
            definirVariavelNoArtigo(art,varName,val);
            salvarArtigosEstudo(this.artigos,art);
            mudou=true;
          }
        }
        if(mudou){
          this.registrarSnapshotCatalogo();
          if(!this.artigoAberto)this.atualizarGridCatalogo();
        }
      },
      onSave:data=>{this.analiseRelacoes=data;},
      onInsert:data=>{
        const doc=docs.find(d=>d.id===overlay.querySelector('[data-rel-destination]').value);
        if(!doc)throw Error('Escolha um documento aberto para inserir o gráfico.');
        const source=sources.find(s=>s.id===data.sourceId),records=source.records(data.scope||{});
        const scope=data.scope||(data.sourceId==='current-folder'&&this.pastaFiltroId&&this.pastaFiltroId!=='todas'?{folderId:this.pastaFiltroId}:undefined);
        inserirFiguraRelacoes(doc,{...data,sourceId:'library',scope,records});
        documentosRelacoes.gravarDocumento(doc);
        window.dispatchEvent(new CustomEvent('athenes:relacoes-inseridas',{detail:{doc}}));
      }
    });
    const close=()=>{panel.destroy();overlay.remove();this._fecharRelacoes=null;};this._fecharRelacoes=close;overlay.querySelector('[data-rel-close]').addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  }
  artigosCatalogo() {
    const proprios = this.artigos.filter(a => !a.compartilhadoComigo);
    return [...proprios, ...(this.artigosCompartilhados || []), ...(this.artigosGruposZotero || [])];
  }

  temLivrinhoAberto() {
    return Boolean(this.container?.querySelector?.('.ath-livro-3d.aberto, .ath-livro-fechando'));
  }

  atualizarCatalogoSeLivre(reconstruirTela = false) {
    if (this.artigoAberto) return;
    if (this.temLivrinhoAberto()) {
      this._atualizacaoCatalogoPendente = reconstruirTela ? 'renderizar' : (this._atualizacaoCatalogoPendente || 'grid');
      return;
    }
    this._atualizacaoCatalogoPendente = null;
    if (reconstruirTela) this.renderizar();
    else this.atualizarGridCatalogo();
  }

  coletarPastasCompartilhadasPlanas() {
    const planas = [{ id: 'compartilhados_comigo', nome: 'Artigos de outras pessoas', tipo: 'bibliografia', origem: 'compartilhada_nuvem' }];
    const percorrer = (lista, parentId = null) => {
      for (const p of (Array.isArray(lista) ? lista : [])) {
        if (!p?.id) continue;
        planas.push({ ...p, parentId });
        if (Array.isArray(p.subpastas) && p.subpastas.length) percorrer(p.subpastas, p.id);
      }
    };
    percorrer(this.pastasCompartilhadasRecebidas || [], null);
    percorrer(this.gruposZoteroRecebidos || [], null);
    return planas;
  }

  buscarPastaCompartilhadaRecebida(pastaId, lista = null) {
    const alvo = String(pastaId || '');
    if (!alvo) return null;
    const raizes = lista || [...(this.pastasCompartilhadasRecebidas || []), ...(this.gruposZoteroRecebidos || [])];
    for (const p of raizes) {
      if (!p) continue;
      if (String(p.id) === alvo) return p;
      if (Array.isArray(p.subpastas) && p.subpastas.length) {
        const achou = this.buscarPastaCompartilhadaRecebida(alvo, p.subpastas);
        if (achou) return achou;
      }
    }
    return null;
  }

  contarArtigosPastaCompartilhada(pastaId) {
    const pid = String(pastaId || '');
    if (!pid) return 0;
    const pool = (pid === 'zotero_grupos_macro' || pid.startsWith('zot_grp_'))
      ? (this.artigosGruposZotero || [])
      : (this.artigosCompartilhados || []);
    return pool.filter(a => this.artigoPertenceAPastaCompartilhada(a, pid)).length;
  }

  artigoPertenceAPastaCompartilhada(art, pastaId) {
    if (!art?.compartilhadoComigo || !pastaId) return false;
    const pid = String(pastaId);
    if (pid === 'zotero_grupos_macro') return Boolean(art.origemZoteroGrupo);
    if (pid.startsWith('zot_grp_')) {
      if (!art.origemZoteroGrupo) return false;
      const pasta = this.buscarPastaCompartilhadaRecebida(pid);
      if (pasta?.zoteroGroupId && String(art.zoteroGroupId || '') !== String(pasta.zoteroGroupId)) return false;
      if (pasta?.descendentesColecoes) {
        const colsArt = Array.isArray(art.zoteroGroupColecoes) ? art.zoteroGroupColecoes.map(String) : [];
        return colsArt.some(k => pasta.descendentesColecoes.has(k));
      }
      const grpId = pid.replace(/^zot_grp_/, '').split('::')[0];
      return String(art.zoteroGroupId || '') === grpId;
    }
    if (art.origemZoteroGrupo) return false;
    const pasta = this.buscarPastaCompartilhadaRecebida(pid);
    if (pasta?.pastaRaizCompartilhadaId && pasta?.descendentesOriginais) {
      const raizOk = String(art.pastaCompartilhadaId || '') === String(pasta.pastaRaizCompartilhadaId) ||
        (Array.isArray(art.pastasCompartilhadasIds) && art.pastasCompartilhadasIds.some(id => String(id) === String(pasta.pastaRaizCompartilhadaId)));
      if (!raizOk) return false;
      const origIds = [
        art.pastaOriginalId,
        art.pastaId,
        ...(Array.isArray(art.pastasOriginaisIds) ? art.pastasOriginaisIds : []),
        ...(Array.isArray(art.pastasIds) ? art.pastasIds : [])
      ].map(v => String(v || '')).filter(Boolean);
      return origIds.some(id => pasta.descendentesOriginais.has(id));
    }
    if (String(art.pastaCompartilhadaId || '') === pid) return true;
    if (Array.isArray(art.pastasCompartilhadasIds) && art.pastasCompartilhadasIds.some(id => String(id) === pid)) return true;
    return false;
  }

  artigosAvulsosCompartilhados() {
    const idsPastasRecebidas = new Set((this.pastasCompartilhadasRecebidas || []).map(p => String(p.id)));
    return (this.artigosCompartilhados || []).filter(a => {
      if (!a?.compartilhadoComigo || a.origemZoteroGrupo) return false;
      const pId = String(a.pastaCompartilhadaId || '');
      if (pId && idsPastasRecebidas.has(pId)) return false;
      if (Array.isArray(a.pastasCompartilhadasIds) && a.pastasCompartilhadasIds.some(id => idsPastasRecebidas.has(String(id)))) return false;
      return true;
    });
  }

  reconstruirArvorePastasCompartilhadas(pastasDocsMap) {
    const coletarDescendentes = (no) => {
      const s = new Set([String(no.id || '')].filter(Boolean));
      for (const f of (no.subpastas || [])) {
        for (const d of coletarDescendentes(f)) s.add(d);
      }
      return s;
    };
    const montarSubpastas = (listaSub, raizDocId, proprietario, permissao) => {
      const res = [];
      for (const sub of (Array.isArray(listaSub) ? listaSub : [])) {
        if (!sub?.id) continue;
        res.push({
          id: `${raizDocId}::sub::${sub.id}`,
          pastaOriginalId: String(sub.id),
          pastaRaizCompartilhadaId: String(raizDocId),
          descendentesOriginais: coletarDescendentes(sub),
          nome: sub.nome || 'Subpasta',
          cor: sub.cor || null,
          tipo: 'bibliografia',
          origem: 'compartilhada_nuvem',
          permissao: permissao || 'leitura',
          proprietario: proprietario || null,
          subpastas: montarSubpastas(sub.subpastas || [], raizDocId, proprietario, permissao)
        });
      }
      return res;
    };

    const pastasRecebidas = [];
    for (const p of pastasDocsMap.values()) {
      pastasRecebidas.push({
        ...p,
        origem: 'compartilhada_nuvem',
        subpastas: montarSubpastas(p.subpastasBrutas || [], p.id, p.proprietario, p.permissao)
      });
    }
    return pastasRecebidas;
  }

  montarArvoreGruposZotero(grupos = []) {
    if (!Array.isArray(grupos) || !grupos.length) {
      return { pastas: [], artigos: [] };
    }
    const subpastasGrupos = [];
    const artigosGrupos = [];

    for (const g of grupos) {
      if (!g?.id) continue;
      const gid = String(g.id);
      const cols = Array.isArray(g.colecoes) ? g.colecoes : [];
      const filhosPorPai = new Map();
      for (const c of cols) {
        const pai = c.parentCollection ? String(c.parentCollection) : '__raiz__';
        if (!filhosPorPai.has(pai)) filhosPorPai.set(pai, []);
        filhosPorPai.get(pai).push(c);
      }
      const coletarDescCols = (key) => {
        const s = new Set([String(key)]);
        for (const f of (filhosPorPai.get(String(key)) || [])) {
          for (const d of coletarDescCols(f.key)) s.add(d);
        }
        return s;
      };
      const construirCols = (paiKey) => (filhosPorPai.get(paiKey) || []).map(c => ({
        id: `zot_grp_${gid}::col::${c.key}`,
        zoteroGroupId: gid,
        zoteroKey: c.key,
        descendentesColecoes: coletarDescCols(c.key),
        nome: c.nome || 'Coleção',
        tipo: 'bibliografia',
        origem: 'zotero_grupo',
        permissao: 'leitura',
        subpastas: construirCols(String(c.key))
      }));

      subpastasGrupos.push({
        id: `zot_grp_${gid}`,
        zoteroGroupId: gid,
        nome: g.nome || `Grupo Zotero ${gid}`,
        tipo: 'bibliografia',
        origem: 'zotero_grupo',
        permissao: 'leitura',
        subpastas: construirCols('__raiz__')
      });

      for (const it of (Array.isArray(g.itens) ? g.itens : [])) {
        const base = this.converterItemZoteroParaEstudo(it, `zot_grp_${gid}`);
        artigosGrupos.push({
          ...base,
          id: `zot_grp_${gid}_${it.chave || base.id}`,
          compartilhadoComigo: true,
          proprietarioExterno: true,
          origemZoteroGrupo: true,
          zoteroGroupId: gid,
          zoteroGroupNome: g.nome || `Grupo Zotero ${gid}`,
          zoteroGroupColecoes: Array.isArray(it.colecoes) ? [...it.colecoes] : [],
          permissao: 'leitura',
          proprietario: { id: `zot_grp_${gid}`, nome: g.nome || 'Grupo Zotero' }
        });
      }
    }

    const pastas = subpastasGrupos.length ? [{
      id: 'zotero_grupos_macro',
      nome: 'Grupos do Zotero',
      icone: 'livro',
      tipo: 'bibliografia',
      origem: 'zotero_grupo',
      ehMacroZotero: true,
      permissao: 'leitura',
      subpastas: subpastasGrupos
    }] : [];

    return { pastas, artigos: artigosGrupos };
  }

  async carregarGruposZotero() {
    if (!this.zoteroClient?.apiKey || typeof this.zoteroClient.lerGruposCompartilhados !== 'function') {
      this.gruposZoteroRecebidos = [];
      this.artigosGruposZotero = [];
      return;
    }
    const conta = obterContaAtiva();
    try {
      const grupos = await this.zoteroClient.lerGruposCompartilhados();
      if (this._estudioDestruido || obterContaAtiva() !== conta) return;
      const { pastas, artigos } = this.montarArvoreGruposZotero(grupos);
      this.gruposZoteroRecebidos = pastas;
      this.artigosGruposZotero = artigos;
      if (!this.artigoAberto && this.container?.isConnected) this.atualizarCatalogoSeLivre(false);
      this.aoMudarPastas?.();
    } catch (e) {
      console.warn('[Athenes] Grupos do Zotero:', e.message);
    }
  }

  async carregarCompartilhados() {
    const conta = obterContaAtiva();
    if (!lerSessaoSupabase()?.email) {
      this.artigosCompartilhados = [];
      this.pastasCompartilhadasRecebidas = [];
      if (!this.artigoAberto && this.container?.isConnected) this.atualizarCatalogoSeLivre(false);
      this.aoMudarPastas?.();
      return;
    }
    try {
      const lista = (await listarCompartilhadosComigo()).filter(x => x.norma === 'zotero_pdf');
      const resultados = await Promise.allSettled(lista.map(x => carregarDocumentoCompartilhado(x.id)));
      if (obterContaAtiva() !== conta || !this.container?.isConnected) return;
      const porChave = new Map();
      const pastasMap = new Map();
      const adicionarPastaAoArtigo = (alvo, pastaId, pastaNome) => {
        if (!pastaId) return;
        const pid = String(pastaId);
        if (!alvo.pastaCompartilhadaId) alvo.pastaCompartilhadaId = pid;
        if (pastaNome && !alvo.pastaCompartilhadaNome) alvo.pastaCompartilhadaNome = pastaNome;
        const listaIds = Array.isArray(alvo.pastasCompartilhadasIds) ? alvo.pastasCompartilhadasIds.map(String) : [];
        if (!listaIds.includes(pid)) listaIds.push(pid);
        alvo.pastasCompartilhadasIds = listaIds;
      };
      const registrar = (artBase, doc, priorizar = false, pastaId = null, pastaNome = '') => {
        if (!artBase) return;
        const chave = String(artBase.docCompartilhadoId || artBase.id || '').trim();
        if (!chave) return;
        const existente = porChave.get(chave);
        if (existente && !priorizar) {
          adicionarPastaAoArtigo(existente, pastaId || artBase.pastaCompartilhadaId, pastaNome || artBase.pastaCompartilhadaNome);
          return;
        }
        const novo = {
          ...(existente || {}),
          ...artBase,
          compartilhadoComigo: true,
          proprietarioExterno: true,
          docCompartilhadoId: artBase.docCompartilhadoId || existente?.docCompartilhadoId || doc.id,
          permissao: doc.permissao || artBase.permissao || existente?.permissao || 'leitura',
          proprietario: doc.proprietario || artBase.proprietario || existente?.proprietario
        };
        const idsHerdados = new Set([
          ...(Array.isArray(existente?.pastasCompartilhadasIds) ? existente.pastasCompartilhadasIds : []),
          ...(Array.isArray(artBase.pastasCompartilhadasIds) ? artBase.pastasCompartilhadasIds : [])
        ].map(String).filter(Boolean));
        if (idsHerdados.size) novo.pastasCompartilhadasIds = Array.from(idsHerdados);
        adicionarPastaAoArtigo(novo, pastaId || artBase.pastaCompartilhadaId || existente?.pastaCompartilhadaId, pastaNome || artBase.pastaCompartilhadaNome || existente?.pastaCompartilhadaNome);
        porChave.set(chave, novo);
      };
      for (const r of resultados) {
        const doc = r.status === 'fulfilled' ? r.value?.doc : null;
        if (!doc) continue;
        if (doc.pastaCompartilhada || String(doc.id || '').startsWith('pasta_bib_')) {
          const nomeLimpo = doc.pastaCompartilhada?.nome || String(doc.titulo || '').replace(/^\[Pasta\]\s*/i, '').replace(/\s*\(\d+\s+obras?\)\s*$/i, '').trim() || 'Pasta compartilhada';
          pastasMap.set(String(doc.id), {
            id: String(doc.id),
            pastaOriginalId: doc.pastaCompartilhada?.pastaOriginalId || null,
            nome: nomeLimpo,
            tipo: 'bibliografia',
            origem: 'compartilhada_nuvem',
            origemZotero: Boolean(doc.pastaCompartilhada?.origemZotero || doc.pastaCompartilhada?.zoteroKey),
            zoteroKey: doc.pastaCompartilhada?.zoteroKey || null,
            permissao: doc.permissao || 'leitura',
            proprietario: doc.proprietario || null,
            driveFolderId: doc.pastaCompartilhada?.driveFolderId || null,
            subpastasBrutas: Array.isArray(doc.pastaCompartilhada?.subpastas) ? doc.pastaCompartilhada.subpastas : []
          });
          if (Array.isArray(doc.pastaCompartilhada?.artigos)) {
            for (const artPasta of doc.pastaCompartilhada.artigos) {
              registrar(artPasta, doc, false, doc.id, nomeLimpo);
            }
          }
        } else if (doc.artigoEstudo) {
          registrar(doc.artigoEstudo, doc, true, doc.artigoEstudo.pastaCompartilhadaId || null, doc.artigoEstudo.pastaCompartilhadaNome || '');
        }
      }
      this.artigosCompartilhados = Array.from(porChave.values());
      this.pastasCompartilhadasRecebidas = this.reconstruirArvorePastasCompartilhadas(pastasMap);
      if (!this.artigoAberto) this.atualizarCatalogoSeLivre(false);
      this.aoMudarPastas?.();
    } catch (e) { console.warn('[Athenes] Artigos compartilhados:', e.message); }
  }

  abrirPastaCompartilhadaRecebida(docPasta) {
    if (!docPasta) return;
    const itensPasta = Array.isArray(docPasta.pastaCompartilhada?.artigos) ? docPasta.pastaCompartilhada.artigos : [];
    const nomePasta = docPasta.pastaCompartilhada?.nome || String(docPasta.titulo || '').replace(/^\[Pasta\]\s*/i, '').replace(/\s*\(\d+\s+obras?\)\s*$/i, '').trim() || 'Pasta compartilhada';
    const pastaId = String(docPasta.id || '');
    if (itensPasta.length) {
      const porChave = new Map((this.artigosCompartilhados || []).map(a => [String(a.docCompartilhadoId || a.id || ''), a]));
      for (const artPasta of itensPasta) {
        const chave = String(artPasta.docCompartilhadoId || artPasta.id || '').trim();
        if (!chave) continue;
        const existente = porChave.get(chave);
        if (existente) {
          if (!existente.pastaCompartilhadaId) existente.pastaCompartilhadaId = pastaId;
          const ids = Array.isArray(existente.pastasCompartilhadasIds) ? existente.pastasCompartilhadasIds.map(String) : [];
          if (pastaId && !ids.includes(pastaId)) ids.push(pastaId);
          existente.pastasCompartilhadasIds = ids;
        } else {
          porChave.set(chave, {
            ...artPasta,
            compartilhadoComigo: true,
            proprietarioExterno: true,
            docCompartilhadoId: artPasta.docCompartilhadoId || pastaId,
            permissao: docPasta.permissao || artPasta.permissao || 'leitura',
            proprietario: docPasta.proprietario || artPasta.proprietario,
            pastaCompartilhadaId: pastaId,
            pastaCompartilhadaNome: nomePasta,
            pastasCompartilhadasIds: pastaId ? [pastaId] : []
          });
        }
      }
      this.artigosCompartilhados = Array.from(porChave.values());
    }
    if (pastaId && !this.buscarPastaCompartilhadaRecebida(pastaId)) {
      const mapaTemp = new Map([[pastaId, {
        id: pastaId,
        pastaOriginalId: docPasta.pastaCompartilhada?.pastaOriginalId || null,
        nome: nomePasta,
        tipo: 'bibliografia',
        origem: 'compartilhada_nuvem',
        origemZotero: Boolean(docPasta.pastaCompartilhada?.origemZotero || docPasta.pastaCompartilhada?.zoteroKey),
        zoteroKey: docPasta.pastaCompartilhada?.zoteroKey || null,
        permissao: docPasta.permissao || 'leitura',
        proprietario: docPasta.proprietario || null,
        driveFolderId: docPasta.pastaCompartilhada?.driveFolderId || null,
        subpastasBrutas: Array.isArray(docPasta.pastaCompartilhada?.subpastas) ? docPasta.pastaCompartilhada.subpastas : []
      }]]);
      const novas = this.reconstruirArvorePastasCompartilhadas(mapaTemp);
      this.pastasCompartilhadasRecebidas = [
        ...(this.pastasCompartilhadasRecebidas || []).filter(p => !novas.some(n => String(n.id) === String(p.id))),
        ...novas
      ];
    }
    this.artigoAberto = null;
    this.filtrarPorPasta(pastaId || 'compartilhados_comigo');
    this.aoMudarPastas?.();
    this.carregarCompartilhados().catch(() => {});
    const qtd = itensPasta.length;
    mostrarAviso(
      qtd ? `Pasta compartilhada "${nomePasta}" aberta (${qtd} ${qtd === 1 ? 'obra' : 'obras'}).` : `Pasta compartilhada "${nomePasta}" aberta.`,
      { tipo: 'sucesso', ms: 5000 }
    );
  }

  salvarCacheArtigoAbertoSessao(art) {
    try {
      if (typeof sessionStorage === 'undefined' || !art?.id) return;
      const copia = { ...art };
      delete copia.pdfBlobUrl;
      delete copia.pdfDataUrl;
      delete copia.pdfBlob;
      sessionStorage.setItem('athenes_estudio_artigo_cache', JSON.stringify(copia));
    } catch (_) {}
  }

  restaurarArtigoAbertoSessao() {
    try {
      if (typeof sessionStorage === 'undefined' || this.artigoAberto) return false;
      const idSalvo = this.opcoes?.artigoInicialId || sessionStorage.getItem('athenes_estudio_artigo_id');
      if (!idSalvo) return false;
      let achado = (this.artigos || []).find(a => String(a.id) === String(idSalvo) || (a.chaveZotero && String(a.chaveZotero) === String(idSalvo)));
      if (!achado) {
        const rawCache = sessionStorage.getItem('athenes_estudio_artigo_cache');
        if (rawCache) {
          const objCache = JSON.parse(rawCache);
          if (objCache && (String(objCache.id) === String(idSalvo) || (objCache.chaveZotero && String(objCache.chaveZotero) === String(idSalvo)))) {
            achado = objCache;
            if (!Array.isArray(this.artigos)) this.artigos = [];
            this.artigos.unshift(achado);
          }
        }
      }
      if (!achado) return false;
      const pagSalva = parseInt(sessionStorage.getItem('athenes_estudio_pag') || '1', 10) || 1;
      this.abrirArtigoNoEstudio(achado, pagSalva);
      return true;
    } catch (_) {
      return false;
    }
  }

  hidratarSnapshotIndexedDb() {
    lerSnapshotArtigosIdb().then(snapshot => {
      if (snapshot?.porChave) {
        let mudou = false;
        for (const a of this.artigos) {
          const dados = snapshot.porChave[String(a.id)] || (a.chaveZotero && snapshot.porChave[`zot:${a.chaveZotero}`]);
          if (dados) {
            mesclarFichamentoPreservandoDados(a, dados);
            mudou = true;
          }
        }
        if (this.artigoAberto) {
          const dadosAberto = snapshot.porChave[String(this.artigoAberto.id)] || (this.artigoAberto.chaveZotero && snapshot.porChave[`zot:${this.artigoAberto.chaveZotero}`]);
          if (dadosAberto) {
            mesclarFichamentoPreservandoDados(this.artigoAberto, dadosAberto);
            this.salvarCacheArtigoAbertoSessao(this.artigoAberto);
          }
          return;
        }
        if (!this.artigoAberto && this.restaurarArtigoAbertoSessao()) return;
        if (mudou && !this.artigoAberto) {
          this.atualizarGridCatalogo();
        }
      }
    }).catch(() => {});
  }

  carregarConfigZotero() {
    const cfg = lerConfigZotero();
    this.zoteroClient.userId = cfg.userId ? String(cfg.userId).trim() : '';
    this.zoteroClient.apiKey = cfg.apiKey ? String(cfg.apiKey).trim() : '';
    this.zoteroClient.username = cfg.username || '';
    this.zoteroClient.isGroup = Boolean(cfg.isGroup);
  }

  salvarConfigZotero(cfg = {}) {
    if (cfg.userId !== undefined) this.zoteroClient.userId = String(cfg.userId).trim();
    if (cfg.apiKey !== undefined) this.zoteroClient.apiKey = String(cfg.apiKey).trim();
    if (cfg.username !== undefined) this.zoteroClient.username = cfg.username;
    gravarConfigZotero({ userId: this.zoteroClient.userId, apiKey: this.zoteroClient.apiKey, username: this.zoteroClient.username || '', isGroup: Boolean(this.zoteroClient.isGroup) });
    // o envio à conta (servidor e Drive) é feito por athenes_zotero_conta.js, ao ouvir a mudança da chave
  }

  temZoteroConectado() {
    return Boolean(this.zoteroClient.apiKey);
  }

  filtrarPorPasta(pastaId) {
    this.pastaFiltroId = pastaId || 'todas';
    if (typeof this.selecionarPastaBib === 'function') {
      this.selecionarPastaBib(this.pastaFiltroId);
    } else if (!this.artigoAberto) {
      this.atualizarGridCatalogo();
    }
    if (this.artigoAberto) {
      const colEsq = this.container?.querySelector('#athEstudioColEsq');
      if (colEsq) {
        this.renderizarColunaEsquerdaEstudio(colEsq, this.artigoAberto, this.artigoAberto.conteudoPaginasPdf);
      }
    }
  }

  alternarModoDashboardFull(ativo) {
    const dashEl = this.container?.closest('.ath-dashboard');
    if (dashEl) {
      dashEl.classList.toggle('ath-dashboard-estudio-full', Boolean(ativo));
      const sidebar = dashEl.querySelector('#athDashSidebar');
      const banner = dashEl.querySelector('#athDashPastaBanner');
      if (sidebar) sidebar.style.display = ativo ? 'none' : '';
      if (banner) banner.style.display = ativo ? 'none' : '';
      dashEl.querySelectorAll('.ath-dash-head, .ath-dash-topbar').forEach(el => {
        el.style.display = ativo ? 'none' : '';
      });
    }
    this.onModoFullScreenChange(Boolean(ativo));
  }

  renderizar() {
    if (!this.container) return;
    this._buscaArtigo?.destroy();this._buscaArtigo=null;
    this._observadorEstante?.disconnect();
    this._observadorEstante = null;
    const palcoAntigo = this.container.querySelector('#athEstudioPalco');
    const scrollSalvo = palcoAntigo ? palcoAntigo.scrollTop : 0;
    this.liberarBitmapsDoPdf(); // ao sair da leitura (ou redesenhar), devolve já a memória de imagem das páginas: não espera o coletor de lixo

    this.carregarConfigZotero();
    this.container.innerHTML = '';

    if (this.artigoAberto) {
      const headerAcoes = document.getElementById('athHeaderAcoesZotero');
      if (headerAcoes) headerAcoes.innerHTML = '';
      this.alternarModoDashboardFull(true);
      this.renderizarEstudioPdfFullScreen(this.artigoAberto, scrollSalvo);
      const chave=String(this.artigoAberto.id)+':'+(this.artigoAberto.pdfBlobUrl||'');
      if(this._estadoBuscaArtigo?.chave!==chave)this._estadoBuscaArtigo={chave};
      this._buscaArtigo=instalarBuscaArtigo(this,this.container.querySelector('.ath-estudio-full-shell'),this.artigoAberto,this._estadoBuscaArtigo);
    } else {
      if (this._tecladoZoomHandler) {
        window.removeEventListener('keydown', this._tecladoZoomHandler);
        this._tecladoZoomHandler = null;
      }
      if (this._selectionChangeHandler) {
        document.removeEventListener('selectionchange', this._selectionChangeHandler);
        this._selectionChangeHandler = null;
      }
      this.alternarModoDashboardFull(false);
      this.renderizarCatalogoArtigos();
      this.registrarSnapshotCatalogo();
    }
  }

  _instalarAtalhosHistoricoEstudio() {
    if (typeof window === 'undefined') return;
    if (this._atalhoHistoricoEstudio) {
      window.removeEventListener('keydown', this._atalhoHistoricoEstudio);
    }
    this._atalhoHistoricoEstudio = (e) => {
      if (!this.container?.isConnected) return;
      if (this.container.closest?.('[hidden]') || this.container.style.display === 'none') return;
      if (typeof document !== 'undefined' && document.querySelector('.ath-modal-backdrop, .ath-modal-overlay')) {
        return;
      }
      const acao = classificarAtalhoHistorico(e);
      if (!acao) return;
      e.preventDefault();
      e.stopPropagation();
      if (acao === 'desfazer') this.desfazerEstudo();
      else if (acao === 'refazer') this.refazerEstudo();
    };
    window.addEventListener('keydown', this._atalhoHistoricoEstudio);
  }

  destruir() {
    this._estudioDestruido = true;
    if (this._atualizarZoteroAoVoltar) {
      clearInterval(this._intervaloZotero);
      document.removeEventListener('visibilitychange', this._atualizarZoteroAoVoltar);
      window.removeEventListener('focus', this._atualizarZoteroAoVoltar);
      window.removeEventListener('online', this._atualizarZoteroAoVoltar);
    }
    this._buscaArtigo?.destroy();this._buscaArtigo=null;
    this._fecharRelacoes?.();
    if (typeof window !== 'undefined') {
      if (this._atalhoHistoricoEstudio) {
        window.removeEventListener('keydown', this._atalhoHistoricoEstudio);
        this._atalhoHistoricoEstudio = null;
      }
      if (this._tecladoZoomHandler) {
        window.removeEventListener('keydown', this._tecladoZoomHandler);
        this._tecladoZoomHandler = null;
      }
    }
    if (typeof document !== 'undefined') {
      if (this._selectionChangeHandler) {
        document.removeEventListener('selectionchange', this._selectionChangeHandler);
        this._selectionChangeHandler = null;
      }
      if (this._fecharImportarBib) {
        document.removeEventListener('click', this._fecharImportarBib);
        this._fecharImportarBib = null;
      }
    }
    this._observadorEstante?.disconnect?.();
    this._observadorEstante = null;
    this._cancelarBib?.();
    this._cancelarBib = null;
  }

  garantirHistoricoArtigo(art) {
    if (!art?.id) return null;
    if (!this._historicosArtigo) this._historicosArtigo = new Map();
    const chave = String(art.id);
    if (!this._historicosArtigo.has(chave)) {
      this._historicosArtigo.set(chave, new HistoricoLinear({
        limite: 50,
        estadoInicial: clonarEstadoArtigo(art)
      }));
    }
    return this._historicosArtigo.get(chave);
  }

  registrarSnapshotArtigo(art = this.artigoAberto) {
    if (!art || this._aplicandoHistorico) return false;
    const hist = this.garantirHistoricoArtigo(art);
    if (!hist) return false;
    const gravou = hist.registrar(clonarEstadoArtigo(art));
    this.atualizarBotoesHistoricoEstudio(this.container);
    return gravou;
  }

  registrarSnapshotCatalogo() {
    if (this._aplicandoHistorico) return false;
    if (!this._historicoCatalogo) {
      this._historicoCatalogo = new HistoricoLinear({ limite: 50 });
    }
    return this._historicoCatalogo.registrar(
      clonarEstadoCatalogo(this.artigos, coletarPastasBibliografia())
    );
  }

  atualizarBotoesHistoricoEstudio(root = this.container) {
    if (!root) return;
    const hist = this.artigoAberto ? this.garantirHistoricoArtigo(this.artigoAberto) : null;
    const btnDesfazer = root.querySelector('#athBtnDesfazerTraco');
    const btnRefazer = root.querySelector('#athBtnRefazerTraco');
    if (btnDesfazer) btnDesfazer.disabled = !hist || !hist.podeDesfazer();
    if (btnRefazer) btnRefazer.disabled = !hist || !hist.podeRefazer();
  }

  aplicarRestauracaoArtigoNoDom(art, qtdPaginasAnterior) {
    const root = this.container;
    if (!root || !art) {
      this.renderizar();
      return;
    }
    const paginas = art.conteudoPaginasPdf || [];
    if (paginas.length !== qtdPaginasAnterior) {
      this.paginaAtual = Math.max(1, Math.min(this.paginaAtual || 1, Math.max(1, paginas.length)));
      this.renderizar();
      return;
    }

    let precisaReRenderHtml = false;
    paginas.forEach((pag, idx) => {
      const n = idx + 1;
      const colEl = root.querySelector(`[data-colunas-pag="${n}"]`);
      if (colEl) {
        if (!pag.htmlGrifado && colEl.querySelector('mark.ath-pdf-grifo-texto')) {
          precisaReRenderHtml = true;
        } else if (pag.htmlGrifado && colEl.innerHTML !== pag.htmlGrifado) {
          precisaReRenderHtml = true;
        }
      }
    });
    if (precisaReRenderHtml) {
      this.renderizar();
      return;
    }

    const inputTitulo = root.querySelector('#athInputTituloArtigoTopo');
    if (inputTitulo && inputTitulo.value !== (art.titulo || '')) {
      inputTitulo.value = art.titulo || '';
    }

    paginas.forEach((_, idx) => {
      const n = idx + 1;
      const canvas = root.querySelector(`canvas[data-canvas-pag="${n}"]`);
      if (canvas) this.redesenharCanvasTinta(canvas, art, n);
      const layerHl = root.querySelector(`[data-hl-pag="${n}"]`);
      if (layerHl) this.renderizarGrifosRetangularesDaPagina(layerHl, art, n);
      const layerPins = root.querySelector(`[data-pins-pag="${n}"]`);
      if (layerPins) this.renderizarPinsDaPagina(layerPins, art, n, root);
    });

    this.atualizarPaineisLateraisDeNotas(root, art);
    const colEsq = root.querySelector('#athEstudioColEsq');
    if (colEsq) this.renderizarColunaEsquerdaEstudio(colEsq, art, paginas);
    this.atualizarAbaCitacoesEContadores(art);
    this.atualizarBotoesHistoricoEstudio(root);
  }

  desfazerEstudo() {
    return this._navegarHistoricoEstudo('desfazer');
  }

  refazerEstudo() {
    return this._navegarHistoricoEstudo('refazer');
  }

  _navegarHistoricoEstudo(direcao) {
    if (this._aplicandoHistorico) return false;
    if (this.artigoAberto) {
      const art = this.artigoAberto;
      const hist = this.garantirHistoricoArtigo(art);
      const snap = direcao === 'desfazer' ? hist?.desfazer() : hist?.refazer();
      if (!snap) return false;
      const qtdPaginasAnterior = (art.conteudoPaginasPdf || []).length;
      this._aplicandoHistorico = true;
      try {
        aplicarEstadoArtigo(art, snap);
        salvarArtigosEstudo(this.artigos, art);
        this.salvarCacheArtigoAbertoSessao(art);
        this.aplicarRestauracaoArtigoNoDom(art, qtdPaginasAnterior);
      } finally {
        this._aplicandoHistorico = false;
      }
      this.registrarSnapshotCatalogo();
      return true;
    }

    const histCat = this._historicoCatalogo;
    const snap = direcao === 'desfazer' ? histCat?.desfazer() : histCat?.refazer();
    if (!snap) return false;
    this._aplicandoHistorico = true;
    try {
      const restaurado = restaurarEstadoCatalogo(this.artigos, snap);
      this.artigos = restaurado.artigos;
      salvarPastasDriveLocais(restaurado.pastas);
      salvarArtigosEstudo(this.artigos);
      this.aoMudarPastas?.({});
      this.renderizar();
      mostrarAviso(direcao === 'desfazer' ? 'Ação desfeita.' : 'Ação refeita.', { tipo: 'ok' });
    } finally {
      this._aplicandoHistorico = false;
    }
    return true;
  }

  /* ==========================================================================
     VISÃO 1: CATÁLOGO DE ARTIGOS VINCULADOS AO ZOTERO + CAPA DO PDF NO DRIVE
     ========================================================================== */
  renderizarCatalogoArtigos() {
    const wrap = document.createElement('div');
    wrap.className = 'ath-estudo-catalogo';

    const conectado = this.temZoteroConectado();
    const labelZotero = conectado
      ? `Zotero · ${this.zoteroClient.userId ? '#' + this.zoteroClient.userId : 'conectado'}`
      : 'Conectar Zotero';

    // O botão do Zotero fica no topo da página, ao lado de "Pasta no Drive" (sobra espaço para a busca no cabeçalho da pasta)
    const perfilTopo = document.getElementById('athBtnPerfilLoginDash');
    const tituloZotero = conectado
      ? `Zotero conectado (${this.zoteroClient.userId ? '#' + this.zoteroClient.userId : 'ativo'}): clique para ver ou trocar as credenciais`
      : 'Conectar o Zotero: inserir sua API Key e User ID';
    const htmlBotaoZotero = perfilTopo
      ? `<button type="button" class="ath-dash-btn-topo ath-dash-btn-zotero ${conectado ? 'ath-dash-btn-zotero--ok' : ''}" id="athBtnConfigurarChaveZotero" title="${escapeHtml(tituloZotero)}" aria-label="${escapeHtml(tituloZotero)}">
          ${svgIcone('zotero', 15)}<span class="ath-dash-btn-texto-drive">Zotero</span><span class="ath-dash-btn-zotero-ponto" aria-hidden="true"></span>
        </button>`
      : `<button type="button" class="ath-btn ath-btn-icone ${conectado ? 'ath-btn-zotero-ok' : ''}" id="athBtnConfigurarChaveZotero" title="${escapeHtml(tituloZotero)}" aria-label="Zotero">${svgIcone('zotero', 20)}</button>`;
    if (perfilTopo) {
      document.querySelectorAll('#athBtnConfigurarChaveZotero').forEach(b => b.remove()); // de uma renderização anterior
      perfilTopo.insertAdjacentHTML('beforebegin', htmlBotaoZotero);
    }

    const htmlBotoesAcao = `
      <button type="button" class="ath-btn ath-btn-icone" id="athBtnAnalisarRelacoes" title="Analisar relações e termos" aria-label="Analisar relações e termos">${svgIcone('grafico',18)}</button>
      ${perfilTopo ? '' : htmlBotaoZotero}

      <button type="button" class="ath-btn ath-btn-icone" id="athBtnSincronizarZoteroHub" title="Sincronizar tudo: busca os artigos novos do Zotero e envia ao Google Drive os PDFs, as pastas e as anotações" aria-label="Sincronizar Zotero e Google Drive">
        ${svgIcone('sincronizar', 17)}
      </button>

      <div class="ath-menu-importar" id="athMenuImportarBib">
        <button type="button" class="ath-btn ath-btn-icone ath-btn-importar-coluna" id="athBtnImportarBib" aria-haspopup="menu" aria-expanded="false" title="Importar ou exportar referências" aria-label="Importar ou exportar referências">
          ${svgIcone('importar', 14)}
          ${svgIcone('baixo', 8)}
        </button>
        <ul class="ath-menu-importar-lista" id="athMenuImportarBibLista" role="menu" hidden>
          <li class="ath-menu-importar-subtitulo" role="presentation">Importar</li>
          <li><button type="button" role="menuitem" data-importar-bib=".bib">${svgIcone('documento', 14)}<span><strong>BibTeX (.bib)</strong><small>Coleção exportada do Zotero</small></span></button></li>
          <li><button type="button" role="menuitem" data-importar-bib=".txt">${svgIcone('documento', 14)}<span><strong>Texto (.txt)</strong><small>Referências em formato BibTeX, em texto</small></span></button></li>
          <li class="ath-menu-importar-subtitulo" role="presentation">Exportar</li>
          <li><button type="button" role="menuitem" id="athBtnExportarBibCsv">${svgIcone('exportar_csv', 14)}<span><strong>Planilha (.csv)</strong><small>Conjunto bibliográfico da pasta</small></span></button></li>
        </ul>
        <input type="file" accept=".bib,.txt" id="athInputImportarBibEstudo" style="display:none;">
      </div>

      <button type="button" class="ath-btn ath-btn-primary ath-btn-icone" id="athBtnNovoArtigoDrive" title="Vincular Artigo & PDF" aria-label="Vincular Artigo & PDF">
        ${svgIcone('mais', 16)}
      </button>
    `;

    const containerHeaderAcoes = document.getElementById('athHeaderAcoesZotero');
    if (containerHeaderAcoes) {
      containerHeaderAcoes.innerHTML = htmlBotoesAcao;
    }

    wrap.innerHTML = `
      <div id="athBibTopoPastasWrapper"></div>

      <div class="ath-estudo-barra-topo">
        <div class="ath-bib-busca-grupo" id="athBibBuscaGrupo" style="display:flex; align-items:center; gap:8px; flex:1; max-width:620px;">
          <div class="ath-busca-box" style="flex:1;">
            ${svgIcone('busca', 16)}
            <input type="text" class="ath-input" id="athEstudoBuscaInput" value="${escapeHtml(this.filtroBusca)}" placeholder="Buscar artigo por título, autor, tag Zotero ou citação marcada...">
          </div>

          <!-- Em quais subpastas a busca também procura (só aparece quando a pasta aberta tem subpastas) -->
          <div class="ath-menu-popover-wrap" id="athMenuSubpastasBuscaWrap" hidden>
            <button type="button" class="ath-btn ath-btn-icone" id="athBtnSubpastasBusca" title="Subpastas incluídas na busca" aria-label="Subpastas incluídas na busca" aria-haspopup="menu" aria-expanded="false">
              ${svgIcone('pasta', 16)}
            </button>
            <div class="ath-menu-popover ath-menu-subpastas-busca" id="athMenuSubpastasBuscaPopover" role="menu" hidden></div>
          </div>

          <!-- Botão de Definir Ordem das Referências -->
          <div class="ath-menu-ordenar-bib" id="athMenuOrdenarBib">
            <button type="button" class="ath-btn ath-btn-icone" id="athBtnOrdenarBib" title="Definir ordem das referências" aria-label="Definir ordem das referências" aria-haspopup="menu" aria-expanded="false">
              ${svgIcone('ordenar', 17)}
            </button>
            <div class="ath-menu-ordenar-popover" id="athMenuOrdenarBibPopover" role="menu" hidden>
              <div class="ath-menu-ordenar-header">
                <strong>Ordem das Referências</strong>
              </div>
              <ul class="ath-menu-ordenar-lista" id="athListaOpcoesOrdemBib">
                <li><button type="button" role="menuitem" data-ordem-bib="recente_desc" class="${this.ordemReferencias === 'recente_desc' ? 'sel' : ''}"><span>Usado recentemente (Padrão)</span>${this.ordemReferencias === 'recente_desc' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-ordem-bib="recente_asc" class="${this.ordemReferencias === 'recente_asc' ? 'sel' : ''}"><span>Usado há mais tempo</span>${this.ordemReferencias === 'recente_asc' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-ordem-bib="titulo_asc" class="${this.ordemReferencias === 'titulo_asc' ? 'sel' : ''}"><span>Título (A → Z)</span>${this.ordemReferencias === 'titulo_asc' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-ordem-bib="titulo_desc" class="${this.ordemReferencias === 'titulo_desc' ? 'sel' : ''}"><span>Título (Z → A)</span>${this.ordemReferencias === 'titulo_desc' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-ordem-bib="autor_asc" class="${this.ordemReferencias === 'autor_asc' ? 'sel' : ''}"><span>Primeiro autor (A → Z)</span>${this.ordemReferencias === 'autor_asc' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-ordem-bib="ano_desc" class="${this.ordemReferencias === 'ano_desc' ? 'sel' : ''}"><span>Ano mais recente</span>${this.ordemReferencias === 'ano_desc' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-ordem-bib="ano_asc" class="${this.ordemReferencias === 'ano_asc' ? 'sel' : ''}"><span>Ano mais antigo</span>${this.ordemReferencias === 'ano_asc' ? svgIcone('check', 13) : ''}</button></li>
              </ul>
            </div>
          </div>

          <!-- Botão de Filtrar Referências -->
          <div class="ath-menu-popover-wrap" id="athMenuFiltrarBibWrap">
            <button type="button" class="ath-btn ath-btn-icone ${this.filtroStatus !== 'todos' ? 'ath-btn-filtro-ativo' : ''}" id="athBtnFiltrarBib" title="Filtrar referências e artigos" aria-label="Filtrar referências e artigos" aria-haspopup="menu" aria-expanded="false">
              ${svgIcone('filtro', 16)}
            </button>
            <div class="ath-menu-popover" id="athMenuFiltrarBibPopover" role="menu" hidden>
              <div class="ath-menu-popover-header">
                <strong>Filtrar Referências</strong>
              </div>
              <ul class="ath-menu-popover-lista" id="athListaOpcoesFiltroBib">
                <li><button type="button" role="menuitem" data-filtro-bib="todos" class="${this.filtroStatus === 'todos' ? 'sel' : ''}"><span>Todos os artigos (Padrão)</span>${this.filtroStatus === 'todos' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-filtro-bib="com_pdf" class="${this.filtroStatus === 'com_pdf' ? 'sel' : ''}"><span>Com arquivo PDF</span>${this.filtroStatus === 'com_pdf' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-filtro-bib="sem_pdf" class="${this.filtroStatus === 'sem_pdf' ? 'sel' : ''}"><span>Sem arquivo PDF</span>${this.filtroStatus === 'sem_pdf' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-filtro-bib="com_notas" class="${this.filtroStatus === 'com_notas' ? 'sel' : ''}"><span>Com notas ou fichamento</span>${this.filtroStatus === 'com_notas' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-filtro-bib="com_riscos" class="${this.filtroStatus === 'com_riscos' ? 'sel' : ''}"><span>Com riscos à mão livre</span>${this.filtroStatus === 'com_riscos' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-filtro-bib="com_citacoes" class="${this.filtroStatus === 'com_citacoes' ? 'sel' : ''}"><span>Com citações marcadas</span>${this.filtroStatus === 'com_citacoes' ? svgIcone('check', 13) : ''}</button></li>
                <li><button type="button" role="menuitem" data-filtro-bib="compartilhados" class="${this.filtroStatus === 'compartilhados' ? 'sel' : ''}"><span>Compartilhados comigo</span>${this.filtroStatus === 'compartilhados' ? svgIcone('check', 13) : ''}</button></li>
              </ul>
              <div class="ath-filtros-obra" aria-label="Filtros da obra">
                <strong>Dados da obra</strong>
                <div class="ath-filtros-anos"><label>Ano de <input type="number" inputmode="numeric" min="1000" max="9999" data-filtro-obra="anoDe" value="${escapeHtml(this.filtrosObra.anoDe)}"></label><label>Até <input type="number" inputmode="numeric" min="1000" max="9999" data-filtro-obra="anoAte" value="${escapeHtml(this.filtrosObra.anoAte)}"></label></div>
                <label>Autor <input type="search" data-filtro-obra="autor" value="${escapeHtml(this.filtrosObra.autor)}" placeholder="Nome ou sobrenome"></label>
                <label>Editora ou periódico <input type="search" data-filtro-obra="editora" value="${escapeHtml(this.filtrosObra.editora)}" placeholder="Nome da publicação"></label>
                <label>Palavra-chave <input type="search" data-filtro-obra="palavra" value="${escapeHtml(this.filtrosObra.palavra)}" placeholder="Tag do Zotero"></label>
                <button type="button" class="ath-filtros-limpar" data-limpar-filtros-obra>Limpar dados da obra</button>
              </div>
              <div class="ath-filtros-obra ath-filtros-variaveis" id="athFiltrosVariaveisBib" aria-label="Filtros por variáveis personalizadas"></div>
            </div>
          </div>
        </div>

        ${!containerHeaderAcoes ? `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${htmlBotoesAcao}</div>` : ''}
      </div>

      <div class="ath-artigos-zotero-grid" id="athArtigosZoteroGrid"></div>
      <div class="ath-estante-scrim" id="athEstanteScrim"></div>
    `;

    this.container.appendChild(wrap);

    const cliqueFoiArrasteOuDentroDoLivro = (ev) => {
      const d = this._ultimoPointerDownEstante;
      if (!d) return false;
      if (d.dentroLivro) return true;
      if (Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(ev?.clientX) && Number.isFinite(ev?.clientY)) {
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return true;
      }
      return false;
    };

    wrap.querySelector('#athEstanteScrim')?.addEventListener('click', (ev) => {
      if (cliqueFoiArrasteOuDentroDoLivro(ev)) return;
      fecharTodosLivros3D(this.container);
    });

    wrap.querySelector('#athArtigosZoteroGrid')?.addEventListener('contextmenu', (ev) => {
      if (ev.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      ev.preventDefault();
      ev.stopPropagation();
      const livroEl = ev.target?.closest?.('.ath-livro-3d');
      if (livroEl) {
        const idLivro = livroEl.dataset?.livroId || livroEl.getAttribute?.('data-livro-id');
        const art = this.artigosCatalogo().find(a => String(a.id) === String(idLivro));
        if (art) {
          this.abrirMenuContextoLivro(art, livroEl, ev.clientX, ev.clientY);
          return;
        }
      }
      this.abrirMenuContextoEstante(ev.clientX, ev.clientY);
    });

    if (!this._fecharEstanteGlobalConfigurado) {
      this._fecharEstanteGlobalConfigurado = true;
      this.container.addEventListener('pointerdown', (ev) => {
        this._ultimoPointerDownEstante = {
          dentroLivro: Boolean(ev.target?.closest?.('.ath-livro-3d')),
          x: ev.clientX,
          y: ev.clientY
        };
      }, true);
      this.container.addEventListener('click', (ev) => {
        if (cliqueFoiArrasteOuDentroDoLivro(ev)) return;
        if (!ev.target?.closest?.('.ath-livro-3d')) {
          fecharTodosLivros3D(this.container);
        }
      });
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' || ev.keyCode === 27) {
          const aberto = this.container?.querySelector?.('.ath-livro-3d.aberto');
          if (aberto) tratarTecladoLivro3D(ev, aberto);
          else fecharTodosLivros3D(this.container);
        }
      });
    }

    const topoPastasWrap = wrap.querySelector('#athBibTopoPastasWrapper');
    if (topoPastasWrap && typeof this.renderizarBarraPastasTopo === 'function') {
      this.renderizarBarraPastasTopo(topoPastasWrap);
    }

    const inputBusca = wrap.querySelector('#athEstudoBuscaInput');
    inputBusca?.addEventListener('input', () => {
      this.filtroBusca = inputBusca.value.trim().toLowerCase();
      this.atualizarGridCatalogo();
    });

    // O grupo de busca/ordenar/filtrar é levado para o cabeçalho da pasta no fim desta função: os menus procuram nele,
    // não no "wrap" (antes, depois da mudança, a lista de ordem não era redesenhada e a marcação ficava na opção antiga).
    const escopoBuscaBib = wrap.querySelector('#athBibBuscaGrupo') || wrap;
    const btnOrd = wrap.querySelector('#athBtnOrdenarBib');
    const popOrd = wrap.querySelector('#athMenuOrdenarBibPopover');
    const fecharOrd = () => {
      if (!popOrd) return;
      popOrd.hidden = true;
      btnOrd?.setAttribute('aria-expanded', 'false');
    };
    btnOrd?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      fecharFiltroBib();
      const abrir = popOrd.hidden;
      if (abrir) this.atualizarPopoverOrdem(escopoBuscaBib);
      popOrd.hidden = !abrir;
      btnOrd.setAttribute('aria-expanded', String(abrir));
      if (abrir) popOrd.querySelector('button')?.focus();
    });
    this.atualizarPopoverOrdem(escopoBuscaBib);
    // Popover Filtrar Referências
    const btnFiltroBib = wrap.querySelector('#athBtnFiltrarBib');
    const popFiltroBib = wrap.querySelector('#athMenuFiltrarBibPopover');
    const fecharFiltroBib = () => {
      if (!popFiltroBib) return;
      popFiltroBib.hidden = true;
      btnFiltroBib?.setAttribute('aria-expanded', 'false');
    };
    const marcarFiltroAtivo = () => {
      btnFiltroBib?.classList.toggle(
        'ath-btn-filtro-ativo',
        this.filtroStatus !== 'todos'
          || Object.values(this.filtrosObra).some(Boolean)
          || Object.keys(this.filtrosVariaveis || {}).length > 0
      );
      // Resumo do que está filtrando, no topo do menu (o menu rola e a opção marcada podia ficar fora da vista)
      const resumo = this.resumoFiltrosAtivos();
      const cab = popFiltroBib?.querySelector('.ath-menu-popover-header');
      if (cab) cab.innerHTML = `<strong>Filtrar Referências</strong><small class="ath-menu-ordenar-atual">${resumo.length ? `Ativos: <b>${escapeHtml(resumo.join(' · '))}</b>` : 'Mostrando todos os artigos'}</small>`;
      popFiltroBib?.querySelectorAll('[data-filtro-obra]').forEach(inp => inp.classList.toggle('ath-filtro-obra-preenchido', Boolean(String(inp.value || '').trim())));
      if (btnFiltroBib) {
        const dica = resumo.length ? `Filtros ativos: ${resumo.join(' · ')}` : 'Filtrar referências e artigos';
        btnFiltroBib.title = dica;
        btnFiltroBib.setAttribute('aria-label', dica);
      }
    };
    btnFiltroBib?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      fecharOrd();
      const abrir = popFiltroBib.hidden;
      if (abrir) this.atualizarPopoverFiltrosVariaveis(escopoBuscaBib, marcarFiltroAtivo);
      popFiltroBib.hidden = !abrir;
      btnFiltroBib.setAttribute('aria-expanded', String(abrir));
    });
    popFiltroBib?.querySelectorAll('[data-filtro-bib]').forEach(item => {
      item.addEventListener('click', () => {
        this.filtroStatus = item.dataset.filtroBib;
        marcarFiltroAtivo();
        popFiltroBib.querySelectorAll('[data-filtro-bib]').forEach(b => {
          const ativo = b.dataset.filtroBib === this.filtroStatus;
          b.classList.toggle('sel', ativo);
          const icon = b.querySelector('svg');
          if (ativo && !icon) b.insertAdjacentHTML('beforeend', svgIcone('check', 13));
          else if (!ativo && icon) icon.remove();
        });
        fecharFiltroBib();
        this.atualizarGridCatalogo();
      });
    });
    popFiltroBib?.querySelectorAll('[data-filtro-obra]').forEach(input => input.addEventListener('input', () => {
      this.filtrosObra[input.dataset.filtroObra] = input.value.trim();
      marcarFiltroAtivo();
      this.atualizarGridCatalogo();
    }));
    popFiltroBib?.querySelector('[data-limpar-filtros-obra]')?.addEventListener('click', () => {
      Object.keys(this.filtrosObra).forEach(chave => { this.filtrosObra[chave] = ''; });
      popFiltroBib.querySelectorAll('[data-filtro-obra]').forEach(input => { input.value = ''; });
      marcarFiltroAtivo();
      this.atualizarGridCatalogo();
    });
    this.atualizarPopoverFiltrosVariaveis(escopoBuscaBib, marcarFiltroAtivo);
    marcarFiltroAtivo();

    // Popover "Subpastas na busca": escolhe em quais pastas filhas a busca também procura
    const btnSubBusca = wrap.querySelector('#athBtnSubpastasBusca');
    const popSubBusca = wrap.querySelector('#athMenuSubpastasBuscaPopover');
    const fecharSubBusca = () => {
      if (!popSubBusca) return;
      popSubBusca.hidden = true;
      btnSubBusca?.setAttribute('aria-expanded', 'false');
    };
    btnSubBusca?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      fecharOrd();
      fecharFiltroBib();
      const abrir = popSubBusca.hidden;
      if (abrir) this.atualizarPopoverSubpastasBusca(popSubBusca);
      popSubBusca.hidden = !abrir;
      btnSubBusca.setAttribute('aria-expanded', String(abrir));
    });

    if (this._fecharMenuOrdemBib) document.removeEventListener('click', this._fecharMenuOrdemBib);
    this._fecharMenuOrdemBib = (ev) => {
      if (!ev.target.closest?.('#athMenuOrdenarBib')) fecharOrd();
      if (!ev.target.closest?.('#athMenuFiltrarBibWrap')) fecharFiltroBib();
      if (!ev.target.closest?.('#athMenuSubpastasBuscaWrap')) fecharSubBusca();
    };
    document.addEventListener('click', this._fecharMenuOrdemBib);

    const escopoBotoes = containerHeaderAcoes || wrap;
    escopoBotoes.querySelector('#athBtnAnalisarRelacoes')?.addEventListener('click',()=>this.abrirAnaliseRelacoes());

    // fica no topo da página (fora do cabeçalho da pasta): procura no documento
    (document.getElementById('athBtnConfigurarChaveZotero') || escopoBotoes.querySelector('#athBtnConfigurarChaveZotero'))?.addEventListener('click', () => {
      this.abrirModalCredenciaisZotero();
    });

    escopoBotoes.querySelector('#athBtnSincronizarZoteroHub')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      btn.classList.add('ath-girando'); btn.disabled = true;
      try { await this.sincronizarTudo(); } finally { btn.classList.remove('ath-girando'); btn.disabled = false; }
    });

    // "Importar" como lista (mesmo padrão da página inicial)
    const btnImp = escopoBotoes.querySelector('#athBtnImportarBib');
    const listaImp = escopoBotoes.querySelector('#athMenuImportarBibLista');
    const entradaBib = escopoBotoes.querySelector('#athInputImportarBibEstudo');
    const fecharImp = () => { if (!listaImp) return; listaImp.hidden = true; btnImp?.setAttribute('aria-expanded', 'false'); };
    btnImp?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const abrir = listaImp.hidden;
      listaImp.hidden = !abrir;
      btnImp.setAttribute('aria-expanded', String(abrir));
      if (abrir) listaImp.querySelector('button')?.focus();
    });
    listaImp?.querySelectorAll('[data-importar-bib]').forEach(item => item.addEventListener('click', () => {
      fecharImp();
      entradaBib.accept = item.dataset.importarBib;
      entradaBib.click();
    }));
    if (this._fecharImportarBib) document.removeEventListener('click', this._fecharImportarBib);
    this._fecharImportarBib = (ev) => { if (!ev.target.closest?.('#athMenuImportarBib')) fecharImp(); };
    document.addEventListener('click', this._fecharImportarBib);
    escopoBotoes.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && listaImp && !listaImp.hidden) { fecharImp(); btnImp?.focus(); } });

    escopoBotoes.querySelector('#athBtnExportarBibCsv')?.addEventListener('click', () => {
      fecharImp();
      this.abrirModalExportarBibliografiaCsv();
    });

    escopoBotoes.querySelector('#athInputImportarBibEstudo')?.addEventListener('change', e => {
      const arq = e.target.files?.[0];
      if (!arq) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const importados = this.zoteroClient.importarBibTeX(ev.target.result || '');
        let adicionados = 0;
        importados.forEach(item => {
          if (!this.artigos.some(a => a.titulo === item.titulo)) {
            this.artigos.unshift(this.converterItemZoteroParaEstudo(item));
            adicionados++;
          }
        });
        salvarArtigosEstudo(this.artigos);
        this.registrarSnapshotCatalogo();
        this.atualizarGridCatalogo();
      };
      reader.readAsText(arq);
    });

    escopoBotoes.querySelector('#athBtnNovoArtigoDrive')?.addEventListener('click', () => {
      this.abrirModalVincularArtigo();
    });

    // Busca, ordenar e filtrar ficam no cabeçalho fixo da pasta (ao lado dos botões de ação): assim continuam à vista
    // quando a estante rola. Os eventos já foram ligados acima; mover o elemento não os perde.
    const grupoBusca = wrap.querySelector('#athBibBuscaGrupo');
    const bannerPasta = containerHeaderAcoes?.closest?.('#athDashPastaBanner');
    if (grupoBusca && bannerPasta) {
      bannerPasta.querySelectorAll('#athBibBuscaGrupo').forEach(antigo => antigo.remove()); // de uma renderização anterior
      grupoBusca.classList.add('ath-bib-busca-no-topo');
      grupoBusca.removeAttribute('style');
      bannerPasta.insertBefore(grupoBusca, containerHeaderAcoes);
      wrap.querySelector('.ath-estudo-barra-topo')?.classList.add('ath-estudo-barra-topo-vazia');
    }

    this.atualizarGridCatalogo();
  }

  /** Textos curtos dos filtros que estão valendo (status, dados da obra e variáveis), para mostrar ao usuário. */
  resumoFiltrosAtivos() {
    const rotulosStatus = {
      com_pdf: 'Com arquivo PDF', sem_pdf: 'Sem arquivo PDF', com_notas: 'Com notas ou fichamento',
      com_riscos: 'Com riscos à mão livre', com_citacoes: 'Com citações marcadas', compartilhados: 'Compartilhados comigo'
    };
    const itens = [];
    if (this.filtroStatus && this.filtroStatus !== 'todos') itens.push(rotulosStatus[this.filtroStatus] || this.filtroStatus);
    const f = this.filtrosObra || {};
    if (f.anoDe || f.anoAte) itens.push(`Ano ${f.anoDe || '…'}–${f.anoAte || '…'}`);
    if (f.autor) itens.push(`Autor: ${f.autor}`);
    if (f.editora) itens.push(`Publicação: ${f.editora}`);
    if (f.palavra) itens.push(`Palavra-chave: ${f.palavra}`);
    for (const regra of Object.values(this.filtrosVariaveis || {})) {
      const vals = (Array.isArray(regra?.valores) ? regra.valores : (regra?.valor ? [regra.valor] : []))
        .map(v => v === '__preenchida__' ? 'Preenchida' : (v === '__vazia__' ? 'Vazia' : v));
      if (vals.length) itens.push(`${regra?.nome || 'Variável'}: ${vals.join(', ')}`);
    }
    return itens;
  }

  /** Subpastas (de qualquer nível) da pasta aberta, na árvore local; vazio para "todas" e listas especiais. */
  subpastasDaPastaAtual() {
    const pid = this.pastaFiltroId;
    if (!pid || pid === 'todas' || pid === 'compartilhados_comigo') return [];
    const pasta = buscarPastaNaArvore(obterPastasDriveLocais(), pid);
    const lista = [];
    const rec = (pastas, nivel, trilha) => {
      for (const p of pastas || []) {
        if (!p?.id) continue;
        const nome = p.nome || 'Pasta sem nome';
        lista.push({ id: p.id, nome, nivel, caminho: trilha.join(' › ') });
        rec(p.subpastas, nivel + 1, [...trilha, nome]);
      }
    };
    rec(pasta?.subpastas, 0, []);
    return lista;
  }

  /** "Mostrar sempre as obras das subpastas" (como a opção de subcoleções do Zotero), lembrado neste aparelho. */
  get mostrarSubpastasSempre() {
    try { return localStorage.getItem('athenes_bib_subpastas_sempre') === '1'; } catch (_) { return false; }
  }
  set mostrarSubpastasSempre(v) {
    try { localStorage.setItem('athenes_bib_subpastas_sempre', v ? '1' : '0'); } catch (_) {}
  }

  /** A pasta aberta não tem obra própria (só subpastas, como uma pasta "PESQUISAS" que só organiza as filhas). */
  pastaAtualSemObrasProprias() {
    const pid = String(this.pastaFiltroId || '');
    if (!pid || pid === 'todas' || pid === 'compartilhados_comigo') return false;
    return !this.artigosCatalogo().some(art => artigoEstaNaPasta(art, pid) || this.artigoPertenceAPastaCompartilhada(art, pid));
  }

  /**
   * IDs das subpastas (de qualquer nível) cujas obras também aparecem na pasta aberta, menos as desmarcadas pelo usuário.
   * Valem quando há texto na busca, quando a opção "sempre" está ligada ou quando a pasta aberta não tem obra própria.
   */
  idsSubpastasNaBusca() {
    const subs = this.subpastasDaPastaAtual();
    if (!subs.length) return [];
    if (!this.filtroBusca && !this.mostrarSubpastasSempre && !this.pastaAtualSemObrasProprias()) return [];
    const fora = this.subpastasForaDaBusca || new Set();
    return subs.map(p => p.id).filter(id => !fora.has(id));
  }

  /** Mostra o botão de subpastas só quando a pasta aberta tem pastas filhas e o marca quando alguma foi desmarcada. */
  atualizarBotaoSubpastasBusca() {
    const wrapBtn = document.getElementById('athMenuSubpastasBuscaWrap');
    if (!wrapBtn) return;
    const subs = this.subpastasDaPastaAtual();
    wrapBtn.hidden = subs.length === 0;
    const fora = this.subpastasForaDaBusca || new Set();
    const qtdFora = subs.filter(p => fora.has(p.id)).length;
    const btn = wrapBtn.querySelector('#athBtnSubpastasBusca');
    btn?.classList.toggle('ath-btn-filtro-ativo', qtdFora > 0);
    if (btn) {
      const txt = qtdFora > 0
        ? `A busca procura em ${subs.length - qtdFora} de ${subs.length} subpastas: clique para escolher`
        : `A busca também procura nas ${subs.length} subpastas: clique para escolher`;
      btn.title = txt;
      btn.setAttribute('aria-label', txt);
    }
  }

  atualizarPopoverSubpastasBusca(pop) {
    if (!pop) return;
    if (!this.subpastasForaDaBusca) this.subpastasForaDaBusca = new Set();
    const fora = this.subpastasForaDaBusca;
    const subs = this.subpastasDaPastaAtual();
    pop.innerHTML = `
      <div class="ath-menu-popover-header"><strong>Obras das subpastas</strong></div>
      <small class="ath-subpastas-busca-dica">Aparecem ao buscar e quando esta pasta não tem obra própria. Marque abaixo para mostrar sempre.</small>
      <label class="ath-subpastas-busca-item ath-subpastas-sempre">
        <input type="checkbox" data-subpastas-sempre ${this.mostrarSubpastasSempre ? 'checked' : ''}>
        <span>Mostrar sempre as obras das subpastas</span>
      </label>
      <div class="ath-subpastas-busca-acoes">
        <button type="button" data-subpastas-todas>Todas</button>
        <button type="button" data-subpastas-nenhuma>Nenhuma</button>
      </div>
      <div class="ath-subpastas-busca-lista">
        ${subs.map(p => `<label class="ath-subpastas-busca-item" style="padding-left:${8 + p.nivel * 14}px;">
          <input type="checkbox" data-subpasta-busca="${escapeHtml(p.id)}" ${fora.has(p.id) ? '' : 'checked'}>
          ${svgIcone('pasta', 13)}<span>${escapeHtml(p.nome)}</span>
        </label>`).join('')}
      </div>
    `;
    const aplicar = () => {
      this.atualizarBotaoSubpastasBusca();
      this.atualizarGridCatalogo();
    };
    pop.querySelector('[data-subpastas-sempre]')?.addEventListener('change', (ev) => {
      this.mostrarSubpastasSempre = ev.target.checked;
      aplicar();
    });
    pop.querySelectorAll('[data-subpasta-busca]').forEach(chk => chk.addEventListener('change', () => {
      if (chk.checked) fora.delete(chk.dataset.subpastaBusca);
      else fora.add(chk.dataset.subpastaBusca);
      aplicar();
    }));
    pop.querySelector('[data-subpastas-todas]')?.addEventListener('click', () => {
      subs.forEach(p => fora.delete(p.id));
      pop.querySelectorAll('[data-subpasta-busca]').forEach(chk => { chk.checked = true; });
      aplicar();
    });
    pop.querySelector('[data-subpastas-nenhuma]')?.addEventListener('click', () => {
      subs.forEach(p => fora.add(p.id));
      pop.querySelectorAll('[data-subpasta-busca]').forEach(chk => { chk.checked = false; });
      aplicar();
    });
  }

  converterItemZoteroParaEstudo(item, pastaId = 'pasta_bib_raiz') {
    return {
      id: 'zot_' + (item.id || Date.now().toString(36)),
      pastaId: item.pastaId || pastaId || 'pasta_bib_raiz',
      chaveZotero: item.chave || item.id || 'ZOTLOCAL',
      itemTypeZotero: item.itemTypeZotero || '',
      camposZotero: item.camposZotero || null,
      criadores: item.criadores || null,
      titulo: item.titulo || 'Artigo sem título',
      autores: item.autores?.length ? item.autores : [{ sobrenome: 'Autor', prenome: '' }],
      ano: item.ano || String(new Date().getFullYear()),
      publicacao: item.publicacao || item.editora || 'Periódico Acadêmico',
      editora: item.editora || '',
      volume: item.volume || '',
      numero: item.numero || '',
      paginas: item.paginas || '',
      doi: item.doi || '',
      isbn: item.isbn || item.camposZotero?.ISBN || '',
      palavrasChave: item.palavrasChave?.length ? item.palavrasChave : ['Zotero'],
      driveFileId: '',
      driveFileName: '',
      driveStatus: 'Sem PDF vinculado',
      corCapa: '#314F79',
      totalPaginas: 0,
      resumoOriginal: item.resumo || 'Resumo sincronizado da biblioteca Zotero.',
      fichamento: {
        resumoPessoal: '',
        metodologiaNotas: '',
        citacoesMarcadas: [],
        notasPagina: {},
        tracosPorPagina: {}
      },
      conteudoPaginasPdf: [] // sem PDF vinculado não há páginas: o estúdio avisa e oferece vincular
    };
  }

  atualizarPopoverOrdem(root) {
    const escopo = root || this.container;
    const lista = escopo?.querySelector('#athListaOpcoesOrdemBib');
    if (!lista) return;
    const opcoes = [
      { id: 'recente_desc', rotulo: 'Usado recentemente (Padrão)' },
      { id: 'recente_asc', rotulo: 'Usado há mais tempo' },
      { id: 'titulo_asc', rotulo: 'Título (A → Z)' },
      { id: 'titulo_desc', rotulo: 'Título (Z → A)' },
      { id: 'autor_asc', rotulo: 'Primeiro autor (A → Z)' },
      { id: 'ano_desc', rotulo: 'Ano mais recente' },
      { id: 'ano_asc', rotulo: 'Ano mais antigo' }
    ];
    const ordemAtual = this.ordemReferencias || 'recente_desc';
    const variaveis = obterCatalogoVariaveis(this.artigosCatalogo());
    const htmlPadrao = opcoes.map(op => {
      const isSel = ordemAtual === op.id;
      return `<li><button type="button" role="menuitem" data-ordem-bib="${op.id}" class="${isSel ? 'sel' : ''}"><span>${op.rotulo}</span>${isSel ? svgIcone('check', 13) : ''}</button></li>`;
    }).join('');
    const htmlVariaveis = variaveis.length
      ? `<li class="ath-menu-ordenar-subhead" role="presentation">Variáveis personalizadas</li>` + variaveis.map(v => {
        const idAsc = `var_asc:${v.nome}`;
        const idDesc = `var_desc:${v.nome}`;
        return `<li class="ath-menu-ordenar-var-row">
          <span class="ath-menu-ordenar-var-nome" title="${escapeHtml(v.nome)}">${escapeHtml(v.nome)}</span>
          <span class="ath-menu-ordenar-var-acoes">
            <button type="button" role="menuitem" data-ordem-bib="${escapeHtml(idAsc)}" class="${ordemAtual === idAsc ? 'sel' : ''}" title="Ordenar por ${escapeHtml(v.nome)} (crescente)">A→Z</button>
            <button type="button" role="menuitem" data-ordem-bib="${escapeHtml(idDesc)}" class="${ordemAtual === idDesc ? 'sel' : ''}" title="Ordenar por ${escapeHtml(v.nome)} (decrescente)">Z→A</button>
          </span>
        </li>`;
      }).join('')
      : '';
    lista.innerHTML = htmlPadrao + htmlVariaveis;

    // Deixa claro qual ordem está valendo: no topo do menu e no próprio botão (destacado quando não é a padrão)
    let rotuloAtual = opcoes.find(op => op.id === ordemAtual)?.rotulo || '';
    if (!rotuloAtual && /^var_(asc|desc):/.test(ordemAtual)) {
      const nomeVar = ordemAtual.slice(ordemAtual.indexOf(':') + 1);
      rotuloAtual = `${nomeVar} (${ordemAtual.startsWith('var_desc:') ? 'Z → A' : 'A → Z'})`;
    }
    const cabecalho = escopo.querySelector('#athMenuOrdenarBibPopover .ath-menu-ordenar-header');
    if (cabecalho) {
      cabecalho.innerHTML = `<strong>Ordem das Referências</strong>${rotuloAtual ? `<small class="ath-menu-ordenar-atual">Atual: <b>${escapeHtml(rotuloAtual)}</b></small>` : ''}`;
    }
    const btnOrdem = escopo.querySelector('#athBtnOrdenarBib');
    if (btnOrdem) {
      const naoPadrao = ordemAtual !== 'recente_desc';
      btnOrdem.classList.toggle('ath-btn-filtro-ativo', naoPadrao);
      const dica = naoPadrao ? `Ordem das referências: ${rotuloAtual}` : 'Definir ordem das referências';
      btnOrdem.title = dica;
      btnOrdem.setAttribute('aria-label', dica);
    }
    lista.querySelectorAll('[data-ordem-bib]').forEach(item => {
      item.addEventListener('click', () => {
        this.ordemReferencias = item.dataset.ordemBib;
        try { localStorage.setItem('athenes_ordem_referencias', this.ordemReferencias); } catch (_) {}
        const pop = escopo.querySelector('#athMenuOrdenarBibPopover');
        if (pop) pop.hidden = true;
        escopo.querySelector('#athBtnOrdenarBib')?.setAttribute('aria-expanded', 'false');
        this.atualizarPopoverOrdem(escopo);
        this.atualizarGridCatalogo();
      });
    });
  }

  atualizarPopoverFiltrosVariaveis(root, aoMudar = null) {
    const escopo = root || this.container;
    const box = escopo?.querySelector('#athFiltrosVariaveisBib');
    if (!box) return;
    const variaveis = obterCatalogoVariaveis(this.artigosCatalogo());
    const ativos = this.filtrosVariaveis || {};
    if (!variaveis.length) {
      box.innerHTML = `<strong>Variáveis personalizadas</strong><small style="color:#64748B;">Nenhuma variável criada ainda. Adicione variáveis no livrinho 3D.</small>`;
      return;
    }
    const listaSelecionados = (regra) => Array.isArray(regra?.valores) ? regra.valores : (regra?.valor ? [regra.valor] : []);
    const temAtivo = Object.values(ativos).some(r => listaSelecionados(r).length > 0);
    box.innerHTML = `
      <strong>Variáveis personalizadas</strong>
      <small style="color:#64748B; margin-top:-3px;">Escolha um ou mais valores por variável:</small>
      ${variaveis.map(v => {
        const slug = slugVariavel(v.nome);
        const marcados = new Set(listaSelecionados(ativos[slug]));
        const chipsOpcoes = (v.opcoes || []).map(op =>
          `<button type="button" class="ath-filtro-var-chip" data-filtro-var-chip data-slug="${escapeHtml(slug)}" data-nome="${escapeHtml(v.nome)}" data-val="${escapeHtml(op)}" aria-pressed="${marcados.has(op) ? 'true' : 'false'}">${escapeHtml(op)}</button>`
        ).join('');
        return `<div class="ath-filtro-var-grupo">
          <div class="ath-filtro-var-titulo">
            <span>${escapeHtml(v.nome)}</span>
            ${marcados.size ? `<span class="ath-filtro-var-qtd">${marcados.size}</span>` : ''}
          </div>
          <div class="ath-filtro-var-chips">
            ${chipsOpcoes}
            <button type="button" class="ath-filtro-var-chip is-meta" data-filtro-var-chip data-slug="${escapeHtml(slug)}" data-nome="${escapeHtml(v.nome)}" data-val="__preenchida__" aria-pressed="${marcados.has('__preenchida__') ? 'true' : 'false'}">Preenchida</button>
            <button type="button" class="ath-filtro-var-chip is-meta" data-filtro-var-chip data-slug="${escapeHtml(slug)}" data-nome="${escapeHtml(v.nome)}" data-val="__vazia__" aria-pressed="${marcados.has('__vazia__') ? 'true' : 'false'}">Vazia</button>
          </div>
        </div>`;
      }).join('')}
      ${temAtivo ? '<button type="button" class="ath-filtros-limpar" data-limpar-filtros-variaveis>Limpar variáveis</button>' : ''}
    `;
    box.querySelectorAll('[data-filtro-var-chip]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const slug = btn.dataset.slug;
        const nome = btn.dataset.nome;
        const val = btn.dataset.val;
        if (!this.filtrosVariaveis) this.filtrosVariaveis = {};
        const atuais = new Set(listaSelecionados(this.filtrosVariaveis[slug]));
        if (atuais.has(val)) atuais.delete(val);
        else atuais.add(val);
        if (!atuais.size) delete this.filtrosVariaveis[slug];
        else this.filtrosVariaveis[slug] = { nome, valores: [...atuais] };
        this.atualizarPopoverFiltrosVariaveis(escopo, aoMudar);
        aoMudar?.();
        this.atualizarGridCatalogo();
      });
    });
    box.querySelector('[data-limpar-filtros-variaveis]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.filtrosVariaveis = {};
      this.atualizarPopoverFiltrosVariaveis(escopo, aoMudar);
      aoMudar?.();
      this.atualizarGridCatalogo();
    });
  }

  abrirMenuContextoLivro(art, livroEl, x, y) {
    document.querySelector('.ath-menu-pasta-contexto')?.remove();
    const menu = document.createElement('div');
    menu.className = 'ath-menu-pasta-contexto ath-artigo-menu-contexto';
    menu.style.position = 'fixed';
    menu.style.zIndex = '100005';
    menu.style.top = `${Math.min(y, Math.max(8, window.innerHeight - 310))}px`;
    menu.style.left = `${Math.min(x, Math.max(8, window.innerWidth - 230))}px`;

    const estaAberto = livroEl?.classList?.contains?.('aberto');
    menu.innerHTML = `
      <button type="button" data-acao="ficha">${svgIcone('livro', 15)}<span>${estaAberto ? 'Fechar ficha (livrinho)' : 'Abrir ficha (livrinho)'}</span></button>
      <button type="button" data-acao="leitor">${svgIcone('pdf', 15)}<span>Abrir no leitor PDF</span></button>
      <button type="button" data-acao="compartilhar">${svgIcone('usuarios', 15)}<span>Compartilhar obra / PDF</span></button>
      <button type="button" data-acao="citar">${svgIcone('copiar', 15)}<span>Copiar citação ABNT</span></button>
      <button type="button" data-acao="mover">${svgIcone('pasta', 15)}<span>Mover para pasta…</span></button>
      <button type="button" data-acao="editar">${svgIcone('lapis', 15)}<span>Editar metadados / PDF</span></button>
      <button type="button" data-acao="csv">${svgIcone('exportar_csv', 15)}<span>Exportar obra (CSV)</span></button>
      ${art.compartilhadoComigo ? '' : `<hr><button type="button" data-acao="excluir" class="ath-menu-pasta-excluir">${svgIcone('lixeira', 15)}<span>Remover da biblioteca</span></button>`}
    `;

    const fechar = () => {
      menu.remove();
      document.removeEventListener('click', fechar);
      document.removeEventListener('keydown', aoEsc);
    };
    const aoEsc = (e) => { if (e.key === 'Escape') fechar(); };
    setTimeout(() => {
      document.addEventListener('click', fechar);
      document.addEventListener('keydown', aoEsc);
    }, 10);

    menu.querySelector('[data-acao="ficha"]')?.addEventListener('click', () => {
      fechar();
      if (estaAberto) fecharTodosLivros3D(this.container);
      else livroEl?.click?.();
    });
    menu.querySelector('[data-acao="leitor"]')?.addEventListener('click', () => {
      fechar();
      if (art.compartilhadoComigo && !this.artigos.includes(art)) this.abrirArtigoCompartilhadoRecebido(art);
      else this.abrirArtigoNoEstudio(art, 1);
    });
    menu.querySelector('[data-acao="compartilhar"]')?.addEventListener('click', () => {
      fechar();
      this.abrirModalCompartilharArtigo(art);
    });
    menu.querySelector('[data-acao="citar"]')?.addEventListener('click', async () => {
      fechar();
      const cit = formatarCitacaoAbntDoArtigo(art);
      try { await navigator.clipboard?.writeText?.(cit); } catch (_) {}
      mostrarAviso(`Citação copiada: ${cit}`, { tipo: 'sucesso' });
    });
    menu.querySelector('[data-acao="mover"]')?.addEventListener('click', () => {
      fechar();
      this.abrirModalMoverArtigo(art);
    });
    menu.querySelector('[data-acao="editar"]')?.addEventListener('click', () => {
      fechar();
      this.abrirModalVincularArtigo(art);
    });
    menu.querySelector('[data-acao="csv"]')?.addEventListener('click', () => {
      fechar();
      const mapaPastas = construirMapaCaminhosPastas(coletarPastasBibliografia());
      baixarBibliografiaCsv([art], { mapaPastas, nomeArquivo: art.titulo || 'obra-athenes' });
      mostrarAviso('Obra exportada em CSV.', { tipo: 'sucesso' });
    });
    menu.querySelector('[data-acao="excluir"]')?.addEventListener('click', () => {
      fechar();
      if (!confirm(`Remover "${art.titulo || 'esta obra'}" da biblioteca do Athenes?`)) return;
      this.artigos = this.artigos.filter(a => String(a.id) !== String(art.id));
      salvarArtigosEstudo(this.artigos);
      this.registrarSnapshotCatalogo?.();
      this.atualizarGridCatalogo();
      mostrarAviso('Obra removida da biblioteca.', { tipo: 'info' });
    });

    document.body.appendChild(menu);
  }

  abrirMenuContextoEstante(x, y) {
    document.querySelector('.ath-menu-pasta-contexto')?.remove();
    const menu = document.createElement('div');
    menu.className = 'ath-menu-pasta-contexto ath-artigo-menu-contexto';
    menu.style.position = 'fixed';
    menu.style.zIndex = '100005';
    menu.style.top = `${Math.min(y, Math.max(8, window.innerHeight - 230))}px`;
    menu.style.left = `${Math.min(x, Math.max(8, window.innerWidth - 230))}px`;

    const temFiltro = this.filtroStatus !== 'todos'
      || Object.values(this.filtrosObra || {}).some(Boolean)
      || Object.keys(this.filtrosVariaveis || {}).length > 0
      || Boolean(this.filtroBusca);

    menu.innerHTML = `
      <button type="button" data-acao="novo">${svgIcone('mais', 15)}<span>Vincular artigo & PDF</span></button>
      <button type="button" data-acao="csv">${svgIcone('exportar_csv', 15)}<span>Exportar bibliografia (CSV)</span></button>
      <button type="button" data-acao="relacoes">${svgIcone('grafico', 15)}<span>Analisar relações e termos</span></button>
      <button type="button" data-acao="sync">${svgIcone('sincronizar', 15)}<span>Sincronizar Zotero</span></button>
      ${temFiltro ? `<hr><button type="button" data-acao="limpar-filtros">${svgIcone('fechar', 15)}<span>Limpar filtros ativos</span></button>` : ''}
    `;

    const fechar = () => {
      menu.remove();
      document.removeEventListener('click', fechar);
      document.removeEventListener('keydown', aoEsc);
    };
    const aoEsc = (e) => { if (e.key === 'Escape') fechar(); };
    setTimeout(() => {
      document.addEventListener('click', fechar);
      document.addEventListener('keydown', aoEsc);
    }, 10);

    menu.querySelector('[data-acao="novo"]')?.addEventListener('click', () => {
      fechar();
      this.abrirModalVincularArtigo({ pastaId: this.pastaFiltroId });
    });
    menu.querySelector('[data-acao="csv"]')?.addEventListener('click', () => {
      fechar();
      this.abrirModalExportarBibliografiaCsv();
    });
    menu.querySelector('[data-acao="relacoes"]')?.addEventListener('click', () => {
      fechar();
      this.abrirAnaliseRelacoes();
    });
    menu.querySelector('[data-acao="sync"]')?.addEventListener('click', () => {
      fechar();
      this.sincronizarComZoteroApi();
    });
    menu.querySelector('[data-acao="limpar-filtros"]')?.addEventListener('click', () => {
      fechar();
      this.filtroStatus = 'todos';
      this.filtroBusca = '';
      this.filtrosObra = { anoDe: '', anoAte: '', autor: '', editora: '', palavra: '' };
      this.filtrosVariaveis = {};
      this.renderizar();
    });

    document.body.appendChild(menu);
  }

  ordenarArtigos(artigos) {
    const parseTs = (dt) => {
      const t = dt ? new Date(dt).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    const obterTimestampArt = (a) => {
      const primarios = Math.max(0, ...[
        a.ultimoAcessoEm, a.fichamento?.atualizadoEm, a.fichamento?.modificadoEm,
        a.camposZotero?.dateModified, a.dataAdicionado, a.camposZotero?.dateAdded, a.data
      ].map(parseTs));
      if (primarios > 0) return primarios;
      return Math.max(0, parseTs(a.atualizadoEm), parseTs(a.modificadoEm), parseTs(a.atualizado_em));
    };

    const obterAnoArt = (a) => {
      const match = String(a.ano || '').match(/\b(?:1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
      return match ? Number(match[0]) : 0;
    };

    const obterPrimeiroAutor = (a) => {
      const primeiro = Array.isArray(a.autores) ? a.autores[0] : a.autores;
      if (!primeiro) return '';
      return (typeof primeiro === 'string' ? primeiro :
        `${primeiro.sobrenome || primeiro.lastName || ''} ${primeiro.prenome || primeiro.firstName || primeiro.nome || ''}`)
        .trim();
    };

    const desempate = (a, b) =>
      (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR', { sensitivity: 'base' })
      || String(a.id || '').localeCompare(String(b.id || ''));

    const ordem = this.ordemReferencias || 'recente_desc';

    if (ordem.startsWith('var_asc:') || ordem.startsWith('var_desc:')) {
      const desc = ordem.startsWith('var_desc:');
      const nomeVar = ordem.slice(ordem.indexOf(':') + 1);
      const slugAlvo = slugVariavel(nomeVar);
      const obterValVar = (art) => {
        const mapa = normalizarMapaVariaveis(art?.variaveisPersonalizadas);
        for (const [k, v] of Object.entries(mapa)) {
          if (k === nomeVar || (slugAlvo && slugVariavel(k) === slugAlvo)) {
            return Array.isArray(v) ? v.join(', ').trim() : String(v ?? '').trim();
          }
        }
        return '';
      };
      const paraNumero = (s) => {
        if (!/^-?\d+(?:[.,]\d+)?$/.test(s)) return NaN;
        return Number(s.replace(',', '.'));
      };
      return artigos.slice().sort((a, b) => {
        const va = obterValVar(a);
        const vb = obterValVar(b);
        if (!va && !vb) return desempate(a, b);
        if (!va) return 1;
        if (!vb) return -1;
        const na = paraNumero(va), nb = paraNumero(vb);
        let cmp = 0;
        if (Number.isFinite(na) && Number.isFinite(nb)) cmp = na - nb;
        else cmp = va.localeCompare(vb, 'pt-BR', { sensitivity: 'base', numeric: true });
        return (desc ? -cmp : cmp) || desempate(a, b);
      });
    }

    return artigos.slice().sort((a, b) => {
      switch (ordem) {
        case 'recente_asc':
          return (obterTimestampArt(a) - obterTimestampArt(b)) || desempate(a, b);
        case 'titulo_asc':
          return (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR', { sensitivity: 'base' }) || String(a.id || '').localeCompare(String(b.id || ''));
        case 'titulo_desc':
          return (b.titulo || '').localeCompare(a.titulo || '', 'pt-BR', { sensitivity: 'base' }) || String(b.id || '').localeCompare(String(a.id || ''));
        case 'autor_asc':
          return obterPrimeiroAutor(a).localeCompare(obterPrimeiroAutor(b), 'pt-BR', { sensitivity: 'base' }) || desempate(a, b);
        case 'ano_desc':
          return ((obterAnoArt(b) || -Infinity) - (obterAnoArt(a) || -Infinity)) || desempate(a, b);
        case 'ano_asc':
          return ((obterAnoArt(a) || Infinity) - (obterAnoArt(b) || Infinity)) || desempate(a, b);
        case 'recente_desc':
        default:
          return (obterTimestampArt(b) - obterTimestampArt(a)) || desempate(a, b);
      }
    });
  }

  atualizarGridCatalogo() {
    const grid = this.container.querySelector('#athArtigosZoteroGrid');
    if (!grid) return;
    const espacamentoEstante = () => {
      if (typeof window === 'undefined' || !window.matchMedia) return 48;
      if (window.matchMedia('(max-width: 520px)').matches) return 24;
      if (window.matchMedia('(max-width: 1200px)').matches) return 38;
      return 48;
    };
    const maxPorPrateleira = calcularLivrosPorPrateleira(grid.getBoundingClientRect?.().width || grid.clientWidth, espacamentoEstante());
    this._livrosPorPrateleira = maxPorPrateleira;
    if (typeof ResizeObserver !== 'undefined' && !this._observadorEstante) {
      this._observadorEstante = new ResizeObserver(entradas => {
        const largura = entradas[0]?.contentRect?.width;
        if (!this.artigoAberto && calcularLivrosPorPrateleira(largura, espacamentoEstante()) !== this._livrosPorPrateleira) {
          this.atualizarCatalogoSeLivre(false);
        }
      });
      this._observadorEstante.observe(grid);
    }
    grid.innerHTML = '';

    this.atualizarBotaoSubpastasBusca();
    // Com texto na busca, a pasta aberta também mostra as obras das subpastas escolhidas (todas, por padrão)
    const idsSubBusca = this.idsSubpastasNaBusca();
    const filtrados = this.ordenarArtigos(this.artigosCatalogo()).filter(art => {
      if (this.pastaFiltroId && this.pastaFiltroId !== 'todas') {
        const pid = String(this.pastaFiltroId);
        if (pid === 'compartilhados_comigo') {
          if (!art.compartilhadoComigo || art.origemZoteroGrupo) return false;
          const pastasRecebidasIds = new Set((this.pastasCompartilhadasRecebidas || []).map(p => String(p.id)));
          const pIdArt = String(art.pastaCompartilhadaId || '');
          if (pIdArt && pastasRecebidasIds.has(pIdArt)) return false;
          if (Array.isArray(art.pastasCompartilhadasIds) && art.pastasCompartilhadasIds.some(id => pastasRecebidasIds.has(String(id)))) return false;
        } else if (pid === 'zotero_grupos_macro' || pid.startsWith('zot_grp_') || this.buscarPastaCompartilhadaRecebida(pid) || pid.startsWith('pasta_bib_')) {
          if (!this.artigoPertenceAPastaCompartilhada(art, pid)
            && !idsSubBusca.some(id => this.artigoPertenceAPastaCompartilhada(art, id))) return false;
        } else {
          if (art.compartilhadoComigo) return false;
          if (!artigoEstaNaPasta(art, this.pastaFiltroId)
            && !idsSubBusca.some(id => artigoEstaNaPasta(art, id))) return false;
        }
      } else if (art.compartilhadoComigo && this.filtroStatus !== 'compartilhados') {
        return false;
      }
      if (this.filtroStatus && this.filtroStatus !== 'todos') {
        if (this.filtroStatus === 'com_pdf' && !artigoTemPdf(art)) return false;
        if (this.filtroStatus === 'sem_pdf' && artigoTemPdf(art)) return false;
        if (this.filtroStatus === 'com_notas') {
          const temNota = Boolean(art.fichamento?.resumoPessoal || art.fichamento?.metodologiaNotas || (art.fichamento?.notasPagina && Object.keys(art.fichamento.notasPagina).length > 0));
          if (!temNota) return false;
        }
        if (this.filtroStatus === 'com_riscos') {
          const temRisco = Boolean(art.fichamento?.tracosPorPagina && Object.values(art.fichamento.tracosPorPagina).some(l => Array.isArray(l) && l.length > 0));
          if (!temRisco) return false;
        }
        if (this.filtroStatus === 'com_citacoes') {
          const temCit = Boolean(art.fichamento?.citacoesMarcadas && art.fichamento.citacoesMarcadas.length > 0);
          if (!temCit) return false;
        }
        if (this.filtroStatus === 'compartilhados') {
          const ehComp = Boolean(art.compartilhadoComigo || art.proprietarioExterno || art.docCompartilhadoId);
          if (!ehComp) return false;
        }
      }
      const f = this.filtrosObra;
      const ano = Number(String(art.ano || '').match(/\d{4}/)?.[0] || 0);
      if (f.anoDe && (!ano || ano < Number(f.anoDe))) return false;
      if (f.anoAte && (!ano || ano > Number(f.anoAte))) return false;
      if (f.autor && !(art.autores || []).some(a => `${a.prenome || ''} ${a.sobrenome || ''}`.toLocaleLowerCase('pt-BR').includes(f.autor.toLocaleLowerCase('pt-BR')))) return false;
      if (f.editora && !`${art.editora || art.camposZotero?.publisher || ''} ${art.publicacao || ''}`.toLocaleLowerCase('pt-BR').includes(f.editora.toLocaleLowerCase('pt-BR'))) return false;
      if (f.palavra && !(art.palavrasChave || []).some(tag => String(tag).toLocaleLowerCase('pt-BR').includes(f.palavra.toLocaleLowerCase('pt-BR')))) return false;
      const filtrosVars = Object.entries(this.filtrosVariaveis || {});
      if (filtrosVars.length) {
        const mapaVars = normalizarMapaVariaveis(art.variaveisPersonalizadas);
        for (const [slugAlvo, regra] of filtrosVars) {
          let valores = [];
          for (const [k, v] of Object.entries(mapaVars)) {
            if (slugVariavel(k) === slugAlvo || k === regra.nome) {
              valores = Array.isArray(v) ? v : [String(v)];
              break;
            }
          }
          const selecionados = Array.isArray(regra?.valores) ? regra.valores : (regra?.valor ? [regra.valor] : []);
          if (!selecionados.length) continue;
          const bateuAlgum = selecionados.some(sel => {
            if (sel === '__preenchida__') return valores.length > 0;
            if (sel === '__vazia__') return valores.length === 0;
            const alvoNorm = String(sel || '').toLocaleLowerCase('pt-BR');
            return valores.some(v => String(v).toLocaleLowerCase('pt-BR') === alvoNorm);
          });
          if (!bateuAlgum) return false;
        }
      }
      if (!this.filtroBusca) return true;
      const autoresStr = (art.autores || []).map(a => `${a.prenome} ${a.sobrenome}`).join(' ');
      const tagsStr = (art.palavrasChave || []).join(' ');
      const citStr = (art.fichamento?.citacoesMarcadas || []).map(c => c.texto).join(' ');
      const alvo = `${art.titulo} ${autoresStr} ${art.ano} ${art.publicacao} ${tagsStr} ${citStr}`.toLowerCase();
      return alvo.includes(this.filtroBusca);
    });
    this._ultimosArtigosFiltrados = filtrados;

    if (filtrados.length === 0) {
      const pastaInfo = buscarPastaNaArvore(obterPastasDriveLocais(), this.pastaFiltroId);
      const rotuloLocal = pastaInfo?.nome ? `na pasta "${pastaInfo.nome}"` : 'para este filtro';
      const estanteVazia = renderizarEstante3D([], { maxPorPrateleira });
      const cardVazio = estanteVazia.querySelector('.ath-estante-vazia-card');
      if (cardVazio) {
        cardVazio.innerHTML = `
          <p style="font-size:15px; font-weight:800; color:#1F2733; margin:0 0 6px 0;">Nenhuma obra encontrada ${escapeHtml(rotuloLocal)}</p>
          <p style="font-size:12.5px; color:#64748B; margin:0 0 14px 0;">${this.pastaFiltroId === 'compartilhados_comigo' ? 'Os artigos compartilhados com seu e-mail Google aparecerão aqui.' : 'Sincronize sua biblioteca Zotero ou vincule um novo PDF para esta pasta de bibliografia.'}</p>
          ${this.pastaFiltroId === 'compartilhados_comigo' ? '' : `<button type="button" class="ath-btn ath-btn-primary ath-btn-sm" id="athBtnVincularArtigoVazio">${svgIcone('mais', 13)} Vincular Artigo & PDF</button>`}
        `;
        cardVazio.querySelector('#athBtnVincularArtigoVazio')?.addEventListener('click', () => {
          this.abrirModalVincularArtigo({ pastaId: this.pastaFiltroId });
        });
      }
      grid.appendChild(estanteVazia);
      return;
    }

    // Com obras das subpastas na estante, ela é dividida por pasta: primeiro as da própria pasta, depois cada subpasta
    // (na ordem da árvore), cada grupo com um letreiro. Uma obra que está em várias pastas aparece em cada uma delas: a
    // prateleira de cada pasta bate com o número mostrado na árvore (antes ficava só no primeiro grupo e faltavam obras).
    let secoes = null;
    if (idsSubBusca.length) {
      const pidAtual = String(this.pastaFiltroId);
      const naPasta = (art, id) => artigoEstaNaPasta(art, id) || this.artigoPertenceAPastaCompartilhada(art, id);
      const nomeAtual = buscarPastaNaArvore(obterPastasDriveLocais(), pidAtual)?.nome || 'Esta pasta';
      const incluidas = new Set(idsSubBusca);
      const grupos = [{ id: pidAtual, titulo: nomeAtual, caminho: '', principal: true },
        ...this.subpastasDaPastaAtual().filter(p => incluidas.has(p.id)).map(p => ({ id: p.id, titulo: p.nome, caminho: p.caminho }))];
      secoes = grupos.map(g => ({ ...g, livros: filtrados.filter(art => naPasta(art, g.id)) }));
    }

    const estanteEl = renderizarEstante3D(filtrados, {
      maxPorPrateleira,
      secoes,
      callbacks: {
        onAbrirLeitor: (art) => {
          if (art.compartilhadoComigo && !this.artigos.includes(art)) {
            this.abrirArtigoCompartilhadoRecebido(art);
          } else {
            this.abrirArtigoNoEstudio(art, 1);
          }
        },
        onStatusChange: (status) => {
          salvarArtigosEstudo(this.artigos);
          this.registrarSnapshotCatalogo();
        },
        onSalvarNota: (nota) => {
          salvarArtigosEstudo(this.artigos);
          this.registrarSnapshotCatalogo();
          mostrarAviso('Anotação de fichamento salva com sucesso!', { tipo: 'ok' });
        },
        onEditarMeta: (art) => {
          this.abrirModalVincularArtigo(art);
        },
        onEditarMetadados: (art) => {
          this.abrirModalVincularArtigo(art);
        },
        onMoverPasta: (art) => {
          this.abrirModalMoverArtigo(art);
        },
        onMudarCor: (art, cor) => {
          if (cor) {
            art.corCapa = cor;
            salvarArtigosEstudo(this.artigos, art);
            this.registrarSnapshotCatalogo();
          }
        },
        onAlterarCorCapa: (art, cor) => {
          if (cor) {
            art.corCapa = cor;
            salvarArtigosEstudo(this.artigos, art);
            this.registrarSnapshotCatalogo();
          }
        },
        onAtualizarVariaveis: (art, meta = {}) => {
          const escopo = meta?.escopo || 'artigo';
          if (escopo !== 'artigo' && meta?.nome) {
            const pastasArvore = obterPastasDriveLocais();
            let alvos = [];
            if (escopo === 'todas') {
              alvos = this.artigos;
            } else if (escopo === 'pasta_atual') {
              const pAlvo = (this.pastaFiltroId && this.pastaFiltroId !== 'todas') ? this.pastaFiltroId : (art?.pastaId || '');
              alvos = pAlvo && pAlvo !== 'todas'
                ? this.artigos.filter(a => artigoEstaNasPastas(a, [pAlvo], { pastas: pastasArvore, incluirSubpastas: true }))
                : this.artigos;
            } else if (escopo === 'pastas') {
              const ids = Array.isArray(meta.pastaIds) ? meta.pastaIds : [];
              if (!ids.length) {
                mostrarAviso('Selecione ao menos uma pasta para aplicar a variável.', { tipo: 'aviso' });
                return;
              }
              alvos = this.artigos.filter(a => artigoEstaNasPastas(a, ids, { pastas: pastasArvore, incluirSubpastas: true }));
            }
            for (const alvo of alvos) {
              if (meta.remover) removerVariavelDoArtigo(alvo, meta.nome);
              else if (meta.valor) definirVariavelNoArtigo(alvo, meta.nome, meta.valor);
            }
            salvarArtigosEstudo(this.artigos, art);
            this.registrarSnapshotCatalogo();
            if (meta.remover) {
              mostrarAviso(`Variável "${meta.nome}" removida de ${alvos.length} artigo(s).`, { tipo: 'ok' });
            } else if (meta.valor) {
              mostrarAviso(`Variável "${meta.nome}" aplicada a ${alvos.length} artigo(s).`, { tipo: 'ok' });
            } else {
              mostrarAviso(`Variável "${meta.nome}" adicionada ao catálogo.`, { tipo: 'ok' });
            }
            return;
          }
          salvarArtigosEstudo(this.artigos, art);
          this.registrarSnapshotCatalogo();
        },
        obterCatalogoVariaveisFn: () => obterCatalogoVariaveis(this.artigos),
        obterPastasFn: () => construirListaPastasRelacoes(this.artigos),
        pastaAtualId: this.pastaFiltroId || 'todas'
      }
    });

    grid.appendChild(estanteEl);
  }

  abrirModalMoverArtigo(art) {
    if (!art) return;
    const pastas = coletarPastasBibliografia();
    const modalExistente = document.getElementById('athModalMoverArtigo');
    if (modalExistente) modalExistente.remove();

    const overlay = document.createElement('div');
    overlay.id = 'athModalMoverArtigo';
    overlay.className = 'ath-modal-overlay ath-modal-overlay-visivel';
    overlay.style.zIndex = '120';

    const card = document.createElement('div');
    card.className = 'ath-modal-card';
    card.style.maxWidth = '420px';
    card.style.padding = '24px';

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="margin:0; font-size:16px; font-weight:800; color:#1E293B; display:flex; align-items:center; gap:8px;">${svgIcone('pasta', 17)} Mover para Pasta</h3>
        <button type="button" class="ath-btn ath-btn-sm ath-btn-fechar" id="athBtnFecharMover" style="border:none; background:transparent; font-size:18px; cursor:pointer;">&times;</button>
      </div>
      <p style="font-size:12.5px; color:#64748B; margin:0 0 16px 0;">Selecione o destino para <strong>${escapeHtml(art.titulo || 'esta obra')}</strong>:</p>
      <div id="athListaPastasDestino" style="display:flex; flex-direction:column; gap:8px; max-height:260px; overflow-y:auto; margin-bottom:18px;">
        <button type="button" class="ath-btn ath-btn-soft" data-pasta-dest="todas" style="text-align:left; padding:8px 12px; font-size:12.5px; font-weight:700;">
          ${svgIcone('livro', 16)} Estante Geral (Raiz)
        </button>
        ${pastas.map(p => `
          <button type="button" class="ath-btn ath-btn-soft" data-pasta-dest="${escapeHtml(p.id)}" style="text-align:left; padding:8px 12px; font-size:12.5px; font-weight:700; display:flex; align-items:center; gap:8px;">
            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${escapeHtml(p.cor || '#314F79')};"></span>
            ${escapeHtml(p.nome)}
          </button>
        `).join('')}
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    card.querySelector('#athBtnFecharMover')?.addEventListener('click', fechar);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });

    card.querySelectorAll('[data-pasta-dest]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.dataset.pastaDest;
        moverLivroParaPasta(art.id, pId, this.artigos, pastas);
        salvarArtigosEstudo(this.artigos);
        this.registrarSnapshotCatalogo();
        moverArquivosDoArtigoNoDrive(art, pId).catch(() => {});
        fechar();
        this.atualizarGridCatalogo();
        mostrarAviso('Obra movida com sucesso!', { tipo: 'ok' });
      });
    });
  }

  abrirArtigoCompartilhadoRecebido(art) {
    if (!art) return;
    const existente = this.artigos.find(a => a.id === art.id || (art.chaveZotero && a.chaveZotero === art.chaveZotero));
    if (existente) {
      mesclarFichamentoPreservandoDados(existente, art);
      salvarArtigosEstudo(this.artigos, existente);
      this.abrirArtigoNoEstudio(existente);
    } else {
      this.artigos.unshift(art);
      salvarArtigosEstudo(this.artigos, art);
      this.abrirArtigoNoEstudio(art);
    }
  }

  async abrirModalCompartilharPasta(pastaId) {
    const arvore = obterPastasDriveLocais();
    const pasta = buscarPastaNaArvore(arvore, pastaId) || coletarPastasBibliografia().find(p => p && p.id === pastaId);
    if (!pasta) return;
    const obras = this.artigosCatalogo().filter(a => !a.compartilhadoComigo && artigoEstaNasPastas(a, [pastaId], { pastas: arvore, incluirSubpastas: true }));
    const sessao = lerSessaoSupabase();
    const idSufixo = sessao?.user_id ? `_${sessao.user_id.slice(0, 8)}` : '';
    const perfil = obterPerfilColaborador();
    const mapaNomesPastas = new Map();
    const indexarNomesPastas = (lista) => {
      for (const p of (Array.isArray(lista) ? lista : [])) {
        if (!p?.id) continue;
        mapaNomesPastas.set(String(p.id), p.nome || 'Pasta');
        if (Array.isArray(p.subpastas)) indexarNomesPastas(p.subpastas);
      }
    };
    indexarNomesPastas(arvore);
    const serializarSubpastas = (lista) => (Array.isArray(lista) ? lista : []).filter(p => p?.id).map(p => ({
      id: String(p.id),
      nome: p.nome || 'Subpasta',
      cor: p.cor || null,
      origemZotero: Boolean(p.origemZotero || p.zoteroKey || /^zot_col_/.test(String(p.id))),
      zoteroKey: p.zoteroKey || null,
      subpastas: serializarSubpastas(p.subpastas || [])
    }));
    const subpastasSerializadas = serializarSubpastas(pasta.subpastas || []);
    const sanitizarArtigoParaPasta = (art) => {
      const { pdfBlobUrl, pdfBlob, pdfDataUrl, ...resto } = art || {};
      const origId = resto.pastaId || null;
      return {
        ...resto,
        pastaOriginalId: origId,
        pastaOriginalNome: origId ? (mapaNomesPastas.get(String(origId)) || '') : '',
        pastasOriginaisIds: Array.isArray(resto.pastasIds) ? [...resto.pastasIds] : (origId ? [origId] : [])
      };
    };
    const proprietarioInfo = {
      id: sessao?.user_id || '',
      nome: perfil?.nome || (sessao?.email ? sessao.email.split('@')[0] : 'Pesquisador'),
      email: sessao?.email || perfil?.email || '',
      conta: sessao?.email || perfil?.email || ''
    };
    const docPasta = {
      id: `pasta_bib_${pasta.id}${idSufixo}`,
      titulo: `[Pasta] ${pasta.nome || 'Bibliografia'} (${obras.length} ${obras.length === 1 ? 'obra' : 'obras'})`,
      autor: proprietarioInfo.nome,
      proprietario: proprietarioInfo,
      norma: 'zotero_pdf',
      secoes: [],
      compartilhamento: pasta.compartilhamento || null,
      pastaCompartilhada: {
        pastaOriginalId: pasta.id,
        nome: pasta.nome || 'Bibliografia',
        origemZotero: Boolean(pasta.origemZotero || pasta.zoteroKey || /^zot_col_/.test(String(pasta.id))),
        zoteroKey: pasta.zoteroKey || null,
        driveFolderId: pasta.driveId || null,
        subpastas: subpastasSerializadas,
        artigos: obras.map(sanitizarArtigoParaPasta)
      }
    };

    new ModalCompartilhar(docPasta, perfil, {
      aoSalvar: async ({ pessoas, publico }) => {
        pasta.compartilhamento = { pessoas, publico };
        salvarPastasDriveLocais(arvore);
        const arrPessoas = Object.entries(pessoas || {}).map(([email, papel]) => ({ email, papel }));
        const token = await obterTokenDrive().catch(() => null);
        if (token) {
          const driveFolderId = pasta.driveId || await obterOuCriarPastaDoArtigoNoDrive(pastaId, token).catch(() => null);
          if (driveFolderId) {
            pasta.driveId = driveFolderId;
            salvarPastasDriveLocais(arvore);
            await compartilharPdfNoDrive(driveFolderId, { pessoas: arrPessoas, publico: Boolean(publico) }, token).catch(() => {});
          }
        }
        let compartilhados = 0;
        let pdfsLiberados = 0;
        const artigosResumoPasta = [];
        for (const art of obras) {
          let idAtualDrive = String(art.driveFileId || '').trim();
          let pdfLocalBlob = null;
          if (!idAtualDrive || /^drive_pdf_/.test(idAtualDrive)) {
            pdfLocalBlob = await obterPdfLocal(art.id).catch(() => null);
            if (token && pdfLocalBlob) {
              await enviarPdfDoArtigoAoDrive(art, pdfLocalBlob).catch(() => {});
              idAtualDrive = String(art.driveFileId || '').trim();
            }
          }
          if (idAtualDrive && !/^drive_pdf_/.test(idAtualDrive)) {
            const okDrive = await compartilharPdfNoDrive(idAtualDrive, { pessoas: arrPessoas, publico: true }, token).catch(() => false);
            if (okDrive) pdfsLiberados++;
          }
          let pdfDataUrlFallback = null;
          if ((!idAtualDrive || /^drive_pdf_/.test(idAtualDrive)) && pdfLocalBlob && pdfLocalBlob.size <= 6 * 1024 * 1024) {
            pdfDataUrlFallback = await obterPdfComoDataUrl(art.id).catch(() => null);
            if (pdfDataUrlFallback) pdfsLiberados++;
          }
          let idDoc = art.docCompartilhadoId || `artigo_${art.id || 'ref'}${idSufixo}`;
          art.docCompartilhadoId = idDoc;
          art.compartilhamento = { pessoas, publico };
          const artPayload = {
            ...sanitizarArtigoParaPasta(art),
            ...(pdfDataUrlFallback ? { pdfDataUrl: pdfDataUrlFallback } : {}),
            compartilhamento: { pessoas, publico },
            pastaCompartilhadaId: docPasta.id,
            pastaCompartilhadaNome: pasta.nome || 'Bibliografia'
          };
          const docRef = {
            id: idDoc,
            titulo: `[Artigo] ${art.titulo || 'Referência'}`,
            autor: (art.autores || []).map(a => `${a.prenome || ''} ${a.sobrenome || ''}`.trim()).filter(Boolean).join(', ') || 'Autor',
            proprietario: proprietarioInfo,
            norma: 'zotero_pdf',
            secoes: [],
            artigoEstudo: artPayload
          };
          try {
            await salvarDocumentoNoSupabase(docRef, perfil);
          } catch (errSave) {
            if (String(errSave?.message || '').includes('42501') || String(errSave?.message || '').includes('row-level security')) {
              idDoc = `${idDoc}_${Math.random().toString(36).slice(2, 7)}`;
              docRef.id = idDoc;
              art.docCompartilhadoId = idDoc;
              docRef.artigoEstudo.docCompartilhadoId = idDoc;
              await salvarDocumentoNoSupabase(docRef, perfil).catch(() => {});
            }
          }
          await salvarCompartilhamento(docRef.id, { pessoas, publico }).catch(() => {});
          artigosResumoPasta.push({
            ...sanitizarArtigoParaPasta(art),
            docCompartilhadoId: docRef.id,
            pastaCompartilhadaId: docPasta.id,
            pastaCompartilhadaNome: pasta.nome || 'Bibliografia'
          });
          compartilhados++;
        }
        docPasta.pastaCompartilhada = {
          id: docPasta.id,
          pastaOriginalId: pasta.id,
          nome: pasta.nome || 'Bibliografia',
          origemZotero: Boolean(pasta.origemZotero || pasta.zoteroKey || /^zot_col_/.test(String(pasta.id))),
          zoteroKey: pasta.zoteroKey || null,
          driveFolderId: pasta.driveId || null,
          subpastas: subpastasSerializadas,
          compartilhamento: { pessoas, publico },
          artigos: artigosResumoPasta
        };
        await salvarDocumentoNoSupabase(docPasta, perfil).catch(() => {});
        await salvarCompartilhamento(docPasta.id, { pessoas, publico }).catch(() => {});
        salvarArtigosEstudo(this.artigos);
        sincronizarBibliotecaArtigosAgora();
        const detalhePdf = pdfsLiberados ? ` e ${pdfsLiberados} ${pdfsLiberados === 1 ? 'PDF liberado' : 'PDFs liberados'}` : '';
        mostrarAviso(`Pasta "${pasta.nome}" compartilhada (${compartilhados} ${compartilhados === 1 ? 'obra' : 'obras'}${detalhePdf})!`, { tipo: 'sucesso', ms: 6000 });
      }
    });
  }

  async abrirModalCompartilharArtigo(art) {
    if (!art) return;

    // Se o artigo tem PDF local mas ainda não subiu para o Google Drive, garante o upload antes de compartilhar
    const idAtualDrive = String(art.driveFileId || '').trim();
    if (!idAtualDrive || /^drive_pdf_/.test(idAtualDrive)) {
      const local = await obterPdfLocal(art.id);
      if (local) {
        await enviarPdfDoArtigoAoDrive(art, local).catch(() => {});
      }
    }

    if (!art.pdfDataUrl) {
      const dUrl = await obterPdfComoDataUrl(art.id);
      if (dUrl) art.pdfDataUrl = dUrl;
    }

    // Garante que o arquivo PDF no Google Drive já tenha permissão compartilhada ativa
    if (art.driveFileId && !/^drive_pdf_/.test(String(art.driveFileId))) {
      compartilharPdfNoDrive(art.driveFileId, { publico: true }).catch(() => {});
    }

    const sessao = lerSessaoSupabase();
    const idSufixo = sessao?.user_id ? `_${sessao.user_id.slice(0, 8)}` : '';
    const idDoc = art.docCompartilhadoId || `artigo_${art.id || 'ref'}${idSufixo}`;
    const docRef = {
      id: idDoc,
      titulo: `[Artigo] ${art.titulo || 'Referência'}`,
      autor: (art.autores || []).map(a => `${a.prenome || ''} ${a.sobrenome || ''}`.trim()).filter(Boolean).join(', ') || 'Autor',
      norma: 'zotero_pdf',
      secoes: [],
      artigoEstudo: art
    };
    art.docCompartilhadoId = docRef.id;
    salvarArtigosEstudo(this.artigos, art);

    new ModalCompartilhar(docRef, obterPerfilColaborador(), {
      aoSalvar: async ({ pessoas, publico }) => {
        art.compartilhamento = { pessoas, publico };
        docRef.artigoEstudo = { ...art, compartilhamento: { pessoas, publico } };
        salvarArtigosEstudo(this.artigos, art);
        if (art.driveFileId) {
          const arrPessoas = Object.entries(pessoas || {}).map(([email, papel]) => ({ email, papel }));
          await compartilharPdfNoDrive(art.driveFileId, { pessoas: arrPessoas, publico: true });
        }
        await salvarDocumentoNoSupabase(docRef, obterPerfilColaborador()).catch(() => {});
        mostrarAviso('Permissões de acesso salvas com sucesso!', { tipo: 'ok' });
      }
    });
  }

  abrirArtigoNoEstudio(art, paginaInicial = 1) {
    const trocouArtigo = this.artigoAberto && String(this.artigoAberto.id) !== String(art?.id);
    if (art?.id) {
      art.ultimoAcessoEm = new Date().toISOString();
      if (!art.compartilhadoComigo || this.artigos.includes(art)) {
        // A leitura altera a ordem recente sem marcar o fichamento como editado.
        bib.definirArtigos(this.artigos);
        guardarSnapshotArtigosIdb(this.artigos).catch(() => {});
      }
    }
    definirArtigoAbertoAtivo(art);
    this.artigoAberto = art;
    this.garantirHistoricoArtigo(art);
    this.paginaAtual = Math.max(1, parseInt(paginaInicial, 10) || 1);
    this.pinEditandoId = null;
    try {
      if (typeof sessionStorage !== 'undefined' && art?.id) {
        const idAnterior = sessionStorage.getItem('athenes_estudio_artigo_id');
        if (trocouArtigo || (idAnterior && String(idAnterior) !== String(art.id))) {
          sessionStorage.removeItem('athenes_estudio_scroll');
        }
        sessionStorage.setItem('athenes_estudio_artigo_id', String(art.id));
        sessionStorage.setItem('athenes_estudio_pag', String(this.paginaAtual));
        sessionStorage.setItem('athenes_nav_tela', 'estudio');
        sessionStorage.setItem('athenes_dash_aba', 'artigos_zotero');
        this.salvarCacheArtigoAbertoSessao(art);
      }
    } catch (_) {}
    if (typeof window !== 'undefined' && window.history && art?.id) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('tela', 'estudio');
        url.searchParams.set('artigo', String(art.id));
        window.history.replaceState(null, '', url.pathname + url.search);
      } catch (_) {}
    }
    if (typeof window !== 'undefined') {
      if (window.scrollY > 0) window.scrollTo?.(0, 0);
      if (typeof document !== 'undefined') {
        if (document.documentElement?.scrollTop > 0) document.documentElement.scrollTop = 0;
        if (document.body?.scrollTop > 0) document.body.scrollTop = 0;
      }
    }
    this._carregandoPdf = !art.pdfBlobUrl && artigoTemPdf(art) ? art : null; // PDF no Drive: "Carregando…" em vez de aviso de "sem PDF"
    if (!art.pdfBlobUrl) {
      garantirPdfDoArtigo(art).then(carregou => {
        if (this._carregandoPdf === art) this._carregandoPdf = null;
        if (this.artigoAberto === art) this.renderizar();
        return carregou;
      }).catch(() => {
        if (this._carregandoPdf === art) this._carregandoPdf = null;
        if (this.artigoAberto === art) this.renderizar();
      });
    }
    this.renderizar();
  }

  /* ==========================================================================
     VISÃO 2: ESTÚDIO EM TELA CHEIA (TODAS AS PÁGINAS EMPILHADAS + 3 COLUNAS)
     ========================================================================== */
  atualizarEstadoFerramentasNoDom(root) {
    root.querySelectorAll('[data-tool]').forEach(b => {
      b.classList.toggle('ativo', b.dataset.tool === this.ferramentaAtiva);
    });
    const btnReta = root.querySelector('#athBtnModoLinhaReta');
    if (btnReta) {
      btnReta.classList.toggle('ativo', this.modoLinhaReta);
      btnReta.setAttribute('aria-pressed', this.modoLinhaReta ? 'true' : 'false');
    }
    const btnDedo = root.querySelector('#athBtnDedoRola');
    if (btnDedo) {
      btnDedo.classList.toggle('ativo', Boolean(this.bloquearDedoParaRolar));
      btnDedo.setAttribute('aria-pressed', this.bloquearDedoParaRolar ? 'true' : 'false');
      btnDedo.title = this.bloquearDedoParaRolar
        ? 'Modo Samsung Notes ATIVO: Caneta Stylus escreve · Dedo apenas rola e dá zoom (clique para desenhar com o dedo)'
        : 'Desenhar com o Dedo: Dedo e caneta riscam (clique para ativar modo Samsung Notes)';
    }
    this.salvarConfigPincelAtual();
    root.querySelectorAll('.ath-pdf-ink-canvas').forEach(canvas => {
      canvas.style.pointerEvents = this.ferramentaAtiva === 'cursor' ? 'none' : 'auto';
      canvas.style.cursor = this.ferramentaAtiva === 'cursor' ? 'text' : 'crosshair';
      canvas.style.touchAction = 'none';
    });
    // Seletor de espessura: só aparece com Caneta ou Marca-Texto, com valores próprios de cada ferramenta
    const grupoEsp = root.querySelector('#athEspessuras');
    if (grupoEsp) {
      const ehMarca = this.ferramentaAtiva === 'marcatexto';
      const ehCaneta = this.ferramentaAtiva === 'caneta';
      grupoEsp.hidden = !(ehMarca || ehCaneta);
      const valores = ehMarca ? [10, 18, 28, 40] : [2, 3, 6, 10];
      const atual = ehMarca ? this.espessuraMarca : this.espessuraTinta;
      grupoEsp.querySelectorAll('[data-esp]').forEach((b, i) => {
        const v = valores[i];
        b.dataset.esp = String(v);
        b.title = `Espessura ${v} px`;
        b.setAttribute('aria-label', `Espessura ${v} px`);
        b.classList.toggle('on', v === atual);
        const barra = b.querySelector('span');
        if (barra) barra.style.height = `${Math.max(2, Math.min(14, Math.round(v / (ehMarca ? 3 : 1))))}px`;
      });
    }
    const lbl = root.querySelector('#athLabelModoRisco');
    if (lbl) {
      lbl.textContent = `${this.rotuloFerramenta(this.ferramentaAtiva)}${this.modoLinhaReta && (this.ferramentaAtiva === 'caneta' || this.ferramentaAtiva === 'marcatexto') ? ' (Linha Reta)' : ''}`;
    }
  }

  /* ==========================================================================
     RENDERIZAÇÃO DE TODAS AS PÁGINAS EMPILHADAS NO PALCO CENTRAL
     ========================================================================== */
  /** Abre o PDF com pdf.js, mede cada página e prepara uma folha por página. */
  async carregarPdfReal(art) {
    const url = art.pdfBlobUrl;
    if (!this._pdfDocs) this._pdfDocs = new Map();
    if (!this._pdfFalhou) this._pdfFalhou = new Set();
    if (this._pdfDocs.has(url)) return true;
    try {
      const lib = await carregarPdfJs();
      const doc = await lib.getDocument({ url }).promise;
      const n = doc.numPages;
      const dims = await Promise.all(Array.from({ length: n }, async (_, i) => {
        const v = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
        return { w: v.width, h: v.height };
      }));
      const atuais = art.conteudoPaginasPdf || [];
      const qtdReais = atuais.filter(p => p.real).length;
      if (!atuais.length || !atuais[0]?.real || qtdReais !== n) {
        const pagsReais = dims.map((_, i) => ({
          numero: i + 1,
          real: true,
          cabecalho: '',
          titulo: `Folha ${i + 1} do PDF`,
          autores: '',
          paragrafos: []
        }));
        const extras = atuais.filter(p => p.extra);
        extras.forEach((ext, idx) => {
          ext.numero = n + idx + 1;
        });
        art.conteudoPaginasPdf = [...pagsReais, ...extras];
      }
      art.totalPaginas = art.conteudoPaginasPdf.length;
      const histArt = this._historicosArtigo?.get(String(art.id));
      if (histArt && histArt.pilha.length === 1 && histArt.indice === 0) {
        histArt.pilha[0] = JSON.stringify(clonarEstadoArtigo(art));
      }
      this._pdfDocs.set(url, { doc, dims, n });
      return true;
    } catch (err) {
      console.warn('Athenes — falha ao abrir PDF com pdf.js:', err);
      this._pdfFalhou.add(url);
      return false;
    }
  }

  /**
   * Pixels reais do bitmap por pixel de CSS da folha (nitidez do texto). Considera a tela (mínimo 2x, para o texto não ficar serrilhado
   * em tela comum), o zoom (ampliar pede mais pixels) e um teto de memória por página (~16 megapixels).
   */
  fatorQualidadePdf(altura = 1123) {
    const zoom = Math.max(1, (this.zoomPct || 100) / 100);
    const desejado = Math.max(window.devicePixelRatio || 1, 2) * zoom;
    const teto = Math.sqrt(16e6 / (794 * Math.max(1, altura)));
    return Math.max(1, Math.min(desejado, teto, 6));
  }

  async renderizarPaginaPdfReal(info, folha, numPag) {
    if (!folha) return;
    const alturaCss = Math.round(794 * info.dims[numPag - 1].h / info.dims[numPag - 1].w);
    const fator = this.fatorQualidadePdf(alturaCss);
    // já desenhada nesta definição: nada a fazer; desenhada em outra (zoom mudou): refaz só o bitmap
    if (folha.dataset.renderizada === '1' && Math.abs(Number(folha.dataset.qualidade || 0) - fator) < 0.2) return;
    const token = (folha._tokenRender = (folha._tokenRender || 0) + 1);
    folha.dataset.renderizada = '1';
    try {
      const page = await info.doc.getPage(numPag);
      const d = info.dims[numPag - 1];
      const escala = 794 / d.w;
      const viewport = page.getViewport({ scale: escala });
      const cv = folha.querySelector('.ath-pdf-render-canvas');
      if (!cv) return;
      // desenha fora da tela e só então troca: a página não pisca em branco ao mudar o zoom
      const novo = document.createElement('canvas');
      novo.width = Math.floor(viewport.width * fator);
      novo.height = Math.floor(viewport.height * fator);
      await page.render({
        canvasContext: novo.getContext('2d'),
        viewport,
        transform: [fator, 0, 0, fator, 0, 0]
      }).promise;
      if (token !== folha._tokenRender || !folha.isConnected) return; // outra renderização mais nova assumiu
      cv.width = novo.width; cv.height = novo.height;
      cv.getContext('2d').drawImage(novo, 0, 0);
      novo.width = 0; novo.height = 0; // o canvas de trabalho não fica esperando o coletor de lixo
      folha.dataset.qualidade = String(fator);
      if (folha.dataset.textoPronto === '1') return; // a camada de texto não depende do zoom

      folha.dataset.textoPronto = '1';
      const camada = folha.querySelector('.ath-pdf-text-layer');
      if (camada) {
        camada.style.setProperty('--scale-factor', String(escala));
        camada.style.setProperty('--total-scale-factor', String(escala));
        const lib = await carregarPdfJs();
        const textContent = await page.getTextContent();
        const camadaPdf=new lib.TextLayer({
          textContentSource: textContent,
          container: camada,
          viewport
        });
        await camadaPdf.render();
        registrarTextoPdfBuscavel(camada,textContent.items,camadaPdf.textDivs);

        let endOfContent = camada.querySelector('.endOfContent');
        if (!endOfContent) {
          endOfContent = document.createElement('div');
          endOfContent.className = 'endOfContent';
          camada.append(endOfContent);
        }
        camada.addEventListener('mousedown', () => {
          camada.classList.add('selecting');
        });

        // Detecta número editorial real da página (ex.: p. 253 em vez de apenas p. 17 do PDF)
        const itensTxt = (textContent.items || [])
          .map(it => String(it.str || '').trim())
          .filter(Boolean);
        const candidatos = [...itensTxt.slice(0, 6), ...itensTxt.slice(-6)];
        for (const cand of candidatos) {
          if (/^\d{1,5}$/.test(cand)) {
            const numEditorial = parseInt(cand, 10);
            const paginaValida = paginaEditorialDoPdf(this.artigoAberto, numPag, info.n, numEditorial);
            if (paginaValida && paginaValida !== numPag) {
              folha.dataset.pagEditorial = String(paginaValida);
            }
            break;
          }
        }
      }
    } catch (err) {
      console.warn('Athenes — falha ao desenhar página do PDF:', err);
    }
  }

  /** Zera todos os bitmaps de página do PDF (um canvas de tamanho zero libera a memória na hora) e desliga os observadores de rolagem. */
  liberarBitmapsDoPdf() {
    this._obsPerto?.disconnect(); this._obsLonge?.disconnect();
    this._obsPerto = null; this._obsLonge = null;
    clearTimeout(this._tZoomQualidade);
    this.container?.querySelectorAll('.ath-pdf-render-canvas').forEach(cv => { cv.width = 0; cv.height = 0; });
    this.container?.querySelectorAll('.ath-pdf-folha-container').forEach(f => { f._tokenRender = (f._tokenRender || 0) + 1; });
  }

  /** Páginas muito longe da tela largam o bitmap (um PDF de 30 páginas em alta definição passaria de 1 GB); voltam a ser desenhadas ao se aproximar. */
  liberarBitmapDaFolha(folha) {
    const cv = folha?.querySelector('.ath-pdf-render-canvas');
    if (!cv || folha.dataset.renderizada !== '1') return;
    folha._tokenRender = (folha._tokenRender || 0) + 1;
    cv.width = 1; cv.height = 1;
    folha.dataset.renderizada = '';
    folha.dataset.qualidade = '';
  }

  definirPaginaAtivaSilencioso(numPag, root) {
    if (this.paginaAtual === numPag) return;
    this.paginaAtual = numPag;
    if (!root) return;
    const totalPags = this.artigoAberto?.conteudoPaginasPdf?.length || 1;
    const indBarra = root.querySelector('#athIndicadorPagBarra');
    if (indBarra) {
      const numEditorial = paginaEditorialDoPdf(this.artigoAberto, numPag, this._pdfDocs?.get(this.artigoAberto?.pdfBlobUrl)?.n);
      indBarra.textContent = numEditorial ? `Pág. ${numEditorial} · PDF ${numPag}/${totalPags}` : `Pág. ${numPag} de ${totalPags}`;
    }

    root.querySelectorAll('.ath-pdf-folha-container').forEach(el => {
      el.classList.toggle('pagina-ativa', parseInt(el.dataset.numPagina, 10) === numPag);
    });
    root.querySelectorAll('.ath-pdf-etiqueta-pagina').forEach(el => {
      el.classList.toggle('ativa', parseInt(el.dataset.etiquetaPag, 10) === numPag);
    });
    root.querySelectorAll('[data-ir-pagina-esq]').forEach(li => {
      li.classList.toggle('sel', parseInt(li.dataset.irPaginaEsq, 10) === numPag);
    });
  }

  rolarParaPagina(numPag, root) {
    this.definirPaginaAtivaSilencioso(numPag, root);
    const wrapPag = root?.querySelector(`[data-wrap-pagina="${numPag}"]`);
    const palco = root?.querySelector('#athEstudioPalco');
    if (wrapPag && palco) {
      try {
        const palcoRect = palco.getBoundingClientRect();
        const wrapRect = wrapPag.getBoundingClientRect();
        const diferenca = wrapRect.top - palcoRect.top;
        palco.scrollTo({
          top: palco.scrollTop + diferenca - 16,
          behavior: 'smooth'
        });
      } catch (_) {}
    }
    // Garante que o documento/window não seja deslocado para cima mantendo a barra de topo 100% visível
    if (typeof window !== 'undefined') {
      if (window.scrollY > 0) window.scrollTo(0, 0);
      if (document.documentElement?.scrollTop > 0) document.documentElement.scrollTop = 0;
      if (document.body?.scrollTop > 0) document.body.scrollTop = 0;
    }
  }

  /* ==========================================================================
     PAINEL DE NOTAS ADESIVAS EDITÁVEIS NA FOLHA (SEM WINDOW.PROMPT)
     Suporta: Minimizar (—), Tamanho Compacto (P/M), Arrastar e Sem Cortar Borda
     ========================================================================== */
  atualizarPaineisLateraisDeNotas(root, art) {
    if (!root) return;
    this.renderizarColunaEsquerdaEstudio(root.querySelector('#athEstudioColEsq'), art, art.conteudoPaginasPdf);
    this.renderizarPainelDireitoEstudio(root.querySelector('#athEstudioPainelCorpo'), art);
    (art.conteudoPaginasPdf || []).forEach((_, idx) => {
      const pg = idx + 1;
      const statsEl = root.querySelector(`[data-stats-pag="${pg}"]`);
      if (statsEl) {
        const nRiscos = (art.fichamento.tracosPorPagina?.[pg] || []).length;
        const nNotas = (art.fichamento.notasPagina?.[pg] || []).length;
        statsEl.textContent = `${nRiscos} risco(s) · ${nNotas} nota(s)`;
      }
    });
  }

  criarNotaAdesivaNaPagina(art, numPag, xPct = 52, yPct = 25, textoInicial = '', root = null) {
    const perfil = obterPerfilColaborador();
    if (!art.fichamento.notasPagina) art.fichamento.notasPagina = {};
    if (!Array.isArray(art.fichamento.notasPagina[numPag])) {
      art.fichamento.notasPagina[numPag] = [];
    }
    const novoPin = {
      id: 'pin_' + Date.now().toString(36),
      xPct: Math.max(3, Math.min(60, xPct)),
      yPct: Math.max(3, Math.min(82, yPct)),
      titulo: perfil.nome || 'Nota de Leitura',
      texto: textoInicial || '',
      cor: this.corTinta === '#314F79' ? '#F59E0B' : this.corTinta,
      autor: perfil.nome || 'Autor',
      minimizado: false,
      tamanho: 'normal'
    };
    art.fichamento.notasPagina[numPag].push(novoPin);
    this.pinEditandoId = novoPin.id;
    salvarArtigosEstudo(this.artigos);
    this.registrarSnapshotArtigo(art);

    if (root) {
      const layer = root.querySelector(`[data-pins-pag="${numPag}"]`);
      this.renderizarPinsDaPagina(layer, art, numPag, root);
      this.atualizarPaineisLateraisDeNotas(root, art);
    } else {
      this.renderizar();
    }
  }

  renderizarGrifosRetangularesDaPagina(layerEl, art, numPag) {
    if (!layerEl) return;
    layerEl.innerHTML = '';
    const grifos = art.fichamento?.grifosPorPagina?.[numPag] || [];
    grifos.forEach(g => {
      const div = document.createElement('div');
      div.className = 'ath-pdf-hl-rect';
      div.style.left = `${g.xPct}%`;
      div.style.top = `${g.yPct}%`;
      div.style.width = `${g.wPct}%`;
      div.style.height = `${g.hPct}%`;
      div.style.background = g.cor || 'rgba(250, 204, 21, 0.45)';
      layerEl.appendChild(div);
    });
  }

  /* ==========================================================================
     SELEÇÃO DE TEXTO INTERATIVA (GRIFAR TRECHO, CITAR NO ZOTERO, CRIAR NOTA)
     ========================================================================== */
  /* ==========================================================================
     MODAL ELEGANTE PARA CRIAR OU EDITAR CITAÇÃO DO PDF (SEM WINDOW.PROMPT)
     ========================================================================== */
  atualizarAbaCitacoesEContadores(art) {
    if (!this.container) {
      this.renderizar();
      return;
    }
    const qtdCit = art.fichamento?.citacoesMarcadas?.length || 0;
    this.container.querySelectorAll('.ath-estudio-aba').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.aba === this.abaDireita);
      if (btn.dataset.aba === 'citacoes') {
        btn.textContent = `Citações (${qtdCit})`;
      }
    });
    this.renderizarPainelDireitoEstudio(this.container.querySelector('#athEstudioPainelCorpo'), art);
    this.renderizarColunaEsquerdaEstudio(this.container.querySelector('#athEstudioColEsq'), art, art.conteudoPaginasPdf);
  }

  adicionarFolhaExtraNoPdf(art, paginasPdf) {
    const lista = Array.isArray(art.conteudoPaginasPdf) && art.conteudoPaginasPdf.length > 0 ? art.conteudoPaginasPdf : paginasPdf;
    const novoNum = lista.length + 1;
    lista.push({
      numero: novoNum,
      extra: true,
      cabecalho: `${(art.titulo || 'Artigo').slice(0, 55)} · Folha de Anotações Manuscritas #${novoNum}`,
      titulo: `FOLHA DE RASCUNHO E ESQUEMAS VISUAIS (PÁGINA ${novoNum})`,
      autores: 'Espaço livre estilo Samsung Notes para esquemas, mapas mentais e notas sobre o artigo',
      paragrafos: [
        'Use a Caneta, o Marca-Texto, a Linha Reta ou as Notas Adesivas para desenhar esquemas, diagramas e fixar anotações nesta folha complementar.'
      ]
    });
    art.conteudoPaginasPdf = lista;
    art.totalPaginas = lista.length;
    this.paginaAtual = novoNum;
    salvarArtigosEstudo(this.artigos);
    this.registrarSnapshotArtigo(art);
    this.renderizar();
    requestAnimationFrame(() => {
      this.rolarParaPagina(novoNum, this.container);
    });
  }

  /* ==========================================================================
     COLUNA ESQUERDA 50/50 COM .rm-card-meio-a-meio (IDÊNTICA À ESCRITA)
     ========================================================================== */
  /* ==========================================================================
     POPOVERS DE TOPO DO ESTÚDIO (ZOTERO API, GOOGLE DRIVE E CANETA)
     ========================================================================== */
  carregarConfigPincelSalva() {
    try {
      const salvo = typeof localStorage !== 'undefined' ? localStorage.getItem('athenes_config_pincel_v1') : null;
      if (salvo) {
        const c = JSON.parse(salvo);
        if (c.ferramentaAtiva) this.ferramentaAtiva = c.ferramentaAtiva;
        if (c.corTinta) this.corTinta = c.corTinta;
        if (c.corGrifoAtiva) this.corGrifoAtiva = c.corGrifoAtiva;
        if (c.espessuraTinta) this.espessuraTinta = c.espessuraTinta;
        if (c.espessuraMarca) this.espessuraMarca = c.espessuraMarca;
        if (typeof c.modoLinhaReta === 'boolean') this.modoLinhaReta = c.modoLinhaReta;
        if (typeof c.bloquearDedoParaRolar === 'boolean') this.bloquearDedoParaRolar = c.bloquearDedoParaRolar;
      }
    } catch (_) {}
  }

  salvarConfigPincelAtual() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('athenes_config_pincel_v1', JSON.stringify({
          ferramentaAtiva: this.ferramentaAtiva,
          corTinta: this.corTinta,
          corGrifoAtiva: this.corGrifoAtiva,
          espessuraTinta: this.espessuraTinta,
          espessuraMarca: this.espessuraMarca,
          modoLinhaReta: this.modoLinhaReta,
          bloquearDedoParaRolar: this.bloquearDedoParaRolar
        }));
      }
    } catch (_) {}
  }

  rotuloFerramenta(tool) {
    const map = {
      cursor: 'Selecionar Texto (Grifar / Citar)',
      caneta: 'Caneta de Risco',
      marcatexto: 'Marca-Texto Translúcido',
      borracha: 'Borracha de Traços',
      nota: 'Fixar Nota Adesiva Editável'
    };
    return map[tool] || tool;
  }

  /** A folha ocupa no layout o tamanho que aparece (sem sobrar espaço entre as páginas): caixa com o tamanho escalado e a folha escalada dentro. */
  aplicarEscalaNaFolha(wrap, escala) {
    const folha = wrap?.querySelector('.ath-pdf-folha-container');
    const caixa = folha?.parentElement;
    if (!folha || !caixa?.classList.contains('ath-pdf-escala')) return;
    const h = parseFloat(folha.dataset.alturaReal) || 1123;
    caixa.style.setProperty('--ath-pdf-page-height', `${h}px`);
  }

  aplicarPinchZoom(novoZoom, root, ancora, midAtualX, midAtualY) {
    const lim = Math.max(50, Math.min(250, Math.round(novoZoom * 10) / 10));
    const container = root || this.container;
    const palco = container?.querySelector('#athEstudioPalco');
    if (!palco) return;

    this.zoomPct = lim;
    const escalaNova = this.zoomPct / 100;
    palco.style.setProperty('--ath-zoom', String(escalaNova));

    if (ancora?.folha?.isConnected) {
      // A posição da folha inclui centralização, margens e a altura das páginas anteriores.
      const rect = ancora.folha.getBoundingClientRect();
      palco.scrollLeft += rect.left + ancora.x * escalaNova - midAtualX;
      palco.scrollTop += rect.top + ancora.y * escalaNova - midAtualY;
    }

    clearTimeout(this._tZoomQualidade);
    this._tZoomQualidade = setTimeout(() => {
      const obs = this._obsPerto;
      if (!obs) return;
      palco.querySelectorAll('.ath-pdf-folha-container[data-num-pagina]').forEach(f => {
        if (f.querySelector('.ath-pdf-render-canvas')) { obs.unobserve(f); obs.observe(f); }
      });
    }, 250);

    const indBarra = container.querySelector('#athBtnZoomIndicadorBarra');
    if (indBarra) {
      indBarra.textContent = `${Math.round(this.zoomPct)}%`;
    }
  }

  aplicarZoom(novoZoom, root, pontoFoco = null) {
    const lim = Math.max(50, Math.min(250, Math.round(novoZoom * 10) / 10));
    if (Math.abs(this.zoomPct - lim) < 0.05) return;
    const escalaAntiga = this.zoomPct / 100;
    this.zoomPct = lim;
    const escalaNova = this.zoomPct / 100;
    const razao = escalaNova / escalaAntiga;

    const container = root || this.container;
    const palco = container?.querySelector('#athEstudioPalco');
    if (palco) {
      // Ponto focal exato (onde estão os dedos na pinça ou o cursor do mouse)
      const fx = pontoFoco && typeof pontoFoco.x === 'number' ? pontoFoco.x : (palco.clientWidth / 2);
      const fy = pontoFoco && typeof pontoFoco.y === 'number' ? pontoFoco.y : (palco.clientHeight / 2);

      // Coordenada do conteúdo no ponto focal
      const conteudoX = palco.scrollLeft + fx;
      const conteudoY = palco.scrollTop + fy;

      palco.style.setProperty('--ath-zoom', String(escalaNova));

      // Mantém exatamente o mesmo ponto sob o foco após a nova escala
      const novoScrollX = Math.round(conteudoX * razao - fx);
      const novoScrollY = Math.round(conteudoY * razao - fy);
      palco.scrollLeft = Math.max(0, novoScrollX);
      palco.scrollTop = Math.max(0, novoScrollY);
      // a definição do texto acompanha o zoom: refaz o bitmap das páginas perto da tela (as outras, ao se aproximarem)
      clearTimeout(this._tZoomQualidade);
      this._tZoomQualidade = setTimeout(() => {
        const obs = this._obsPerto;
        if (!obs) return;
        palco.querySelectorAll('.ath-pdf-folha-container[data-num-pagina]').forEach(f => { if (f.querySelector('.ath-pdf-render-canvas')) { obs.unobserve(f); obs.observe(f); } });
      }, 220);
      const lbl = container.querySelector('#athZoomRotulo');
      if (lbl) {
        lbl.textContent = `Escala / Zoom das Folhas PDF (${Math.round(this.zoomPct)}%)`;
      }
      const indBarra = container.querySelector('#athBtnZoomIndicadorBarra');
      if (indBarra) {
        indBarra.textContent = `${Math.round(this.zoomPct)}%`;
      }
    }
  }

  /* ==========================================================================
     MOTOR DE TINTA DIGITAL + MODO LINHA RETA EM CANVAS (POR PÁGINA)
     ========================================================================== */
  apagarTracosProximos(art, numPag, x, y, raio = 6, posPct = null, folhaContainer = null, clientX = null, clientY = null) {
    if (!art || !art.fichamento) return;
    const r = Math.max(1, Number(raio) || 6);

    // 1. Apagar traços livres de caneta, marca-texto digital e linhas retas
    const lista = art.fichamento.tracosPorPagina?.[numPag];
    if (Array.isArray(lista)) {
      art.fichamento.tracosPorPagina[numPag] = lista.filter(traco => {
        const pts = traco.pontos || [];
        if (pts.length === 0) return false;
        const rEfetivo = r + ((traco.espessura || 3) / 2);

        // Distância euclidiana ponto-segmento
        const distSeg = (px, py, x1, y1, x2, y2) => {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const l2 = dx * dx + dy * dy;
          if (l2 === 0) return Math.hypot(px - x1, py - y1);
          const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
          return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
        };

        if (pts.length === 1) {
          return Math.hypot(pts[0].x - x, pts[0].y - y) > rEfetivo;
        }

        if (traco.reta && pts.length >= 2) {
          const a = pts[0];
          const b = pts[pts.length - 1];
          return distSeg(x, y, a.x, a.y, b.x, b.y) > rEfetivo;
        }

        // Para qualquer traço contínuo ou pincel livre, confere todos os segmentos adjacentes
        for (let i = 0; i < pts.length - 1; i++) {
          if (distSeg(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= rEfetivo) {
            return false;
          }
        }
        return true;
      });
    }

    // 2. Apagar grifos de seleção retangulares em PDF Real (art.fichamento.grifosPorPagina)
    if (Array.isArray(art.fichamento.grifosPorPagina?.[numPag])) {
      const qtdAntes = art.fichamento.grifosPorPagina[numPag].length;
      const alturaReal = folhaContainer ? (parseFloat(folhaContainer.dataset.alturaReal) || folhaContainer.clientHeight || 1123) : 1123;
      const larguraReal = folhaContainer ? (folhaContainer.clientWidth || 794) : 794;
      const canvasEl = folhaContainer?.querySelector?.('canvas[data-canvas-pag]');
      const larguraCanvas = canvasEl?.width || 794;
      const alturaCanvas = canvasEl?.height || Math.round(larguraCanvas * alturaReal / Math.max(1, larguraReal));
      const tolGrifo = Math.min(r, 3);
      const rectFolha = (clientX != null && clientY != null && folhaContainer && typeof folhaContainer.getBoundingClientRect === 'function')
        ? folhaContainer.getBoundingClientRect()
        : null;
      const usarTela = Boolean(rectFolha && rectFolha.width > 0 && rectFolha.height > 0);

      art.fichamento.grifosPorPagina[numPag] = art.fichamento.grifosPorPagina[numPag].filter(g => {
        // A. Quando há coordenadas reais da viewport e retângulo da folha, aplica contato exato na tela
        if (usarTela) {
          const screenX = rectFolha.left + (g.xPct / 100) * rectFolha.width;
          const screenY = rectFolha.top + (g.yPct / 100) * rectFolha.height;
          const screenW = (g.wPct / 100) * rectFolha.width;
          const screenH = (g.hPct / 100) * rectFolha.height;
          const dxScreen = Math.max(screenX - clientX, 0, clientX - (screenX + screenW));
          const dyScreen = Math.max(screenY - clientY, 0, clientY - (screenY + screenH));
          return Math.hypot(dxScreen, dyScreen) > tolGrifo;
        }

        // B. Fallback em coordenadas canônicas do canvas
        const gx = (g.xPct / 100) * larguraCanvas;
        const gy = (g.yPct / 100) * alturaCanvas;
        const gw = (g.wPct / 100) * larguraCanvas;
        const gh = (g.hPct / 100) * alturaCanvas;
        const dxCanvas = Math.max(gx - x, 0, x - (gx + gw));
        const dyCanvas = Math.max(gy - y, 0, y - (gy + gh));
        if (Math.hypot(dxCanvas, dyCanvas) <= tolGrifo) return false;

        // C. Fallback percentual proporcional estrito (apenas quando chamado sem coordenadas de tela)
        if (posPct && typeof posPct.xPct === 'number' && typeof posPct.yPct === 'number') {
          const margemXPct = (tolGrifo / Math.max(1, larguraReal)) * 100;
          const margemYPct = (tolGrifo / Math.max(1, alturaReal)) * 100;
          const dentroX = posPct.xPct >= (g.xPct - margemXPct) && posPct.xPct <= (g.xPct + g.wPct + margemXPct);
          const dentroY = posPct.yPct >= (g.yPct - margemYPct) && posPct.yPct <= (g.yPct + g.hPct + margemYPct);
          if (dentroX && dentroY) return false;
        }

        return true;
      });

      if (art.fichamento.grifosPorPagina[numPag].length !== qtdAntes) {
        if (folhaContainer) {
          const layer = folhaContainer.querySelector(`[data-grifos-pag="${numPag}"]`);
          if (layer) this.renderizarGrifosRetangularesDaPagina(layer, art, numPag);
        }
        salvarArtigosEstudo(this.artigos || [art]);
      }
    }

    // 3. Apagar grifos de texto HTML (<mark class="ath-pdf-grifo-texto">)
    const escopoBusca = folhaContainer || (typeof document !== 'undefined' ? document : null);
    if (escopoBusca) {
      const marks = Array.from(escopoBusca.querySelectorAll('mark.ath-pdf-grifo-texto, .ath-pdf-grifo-texto'));
      let alterouHtml = false;
      let ultimoColEl = null;
      const tolMark = Math.min(r, 3);

      for (const mark of marks) {
        let atingido = false;
        let verificouTela = false;

        // A. Verificação via coordenadas de tela (clientX, clientY)
        if (clientX != null && clientY != null && typeof mark.getBoundingClientRect === 'function') {
          const rects = (typeof mark.getClientRects === 'function' && mark.getClientRects().length > 0)
            ? Array.from(mark.getClientRects())
            : [mark.getBoundingClientRect()];
          for (const mRect of rects) {
            if (mRect.width === 0 && mRect.height === 0) continue;
            verificouTela = true;
            const dx = Math.max(mRect.left - clientX, 0, clientX - mRect.right);
            const dy = Math.max(mRect.top - clientY, 0, clientY - mRect.bottom);
            if (Math.hypot(dx, dy) <= tolMark) {
              atingido = true;
              break;
            }
          }
        }

        // B. Verificação geométrica relativa à folhaContainer quando não foi possível medir na tela
        if (!atingido && !verificouTela && folhaContainer && typeof mark.getBoundingClientRect === 'function' && typeof folhaContainer.getBoundingClientRect === 'function') {
          const rectFolha = folhaContainer.getBoundingClientRect();
          const canvasEl = folhaContainer.querySelector?.('canvas[data-canvas-pag]');
          const larguraRef = canvasEl?.width || folhaContainer.clientWidth || 794;
          const alturaRef = canvasEl?.height || folhaContainer.clientHeight || 1123;
          const rects = (typeof mark.getClientRects === 'function' && mark.getClientRects().length > 0)
            ? Array.from(mark.getClientRects())
            : [mark.getBoundingClientRect()];
          for (const mRect of rects) {
            if (mRect.width === 0 && mRect.height === 0) continue;
            const relX = ((mRect.left - rectFolha.left) / rectFolha.width) * larguraRef;
            const relY = ((mRect.top - rectFolha.top) / rectFolha.height) * alturaRef;
            const relW = (mRect.width / rectFolha.width) * larguraRef;
            const relH = (mRect.height / rectFolha.height) * alturaRef;
            const dx = Math.max(relX - x, 0, x - (relX + relW));
            const dy = Math.max(relY - y, 0, y - (relY + relH));
            if (Math.hypot(dx, dy) <= tolMark) {
              atingido = true;
              break;
            }
          }
        }

        // C. Fallback para document.elementsFromPoint se o cursor estiver diretamente sobre o grifo
        if (!atingido && clientX != null && clientY != null && typeof document !== 'undefined' && typeof document.elementsFromPoint === 'function') {
          const elementos = document.elementsFromPoint(clientX, clientY) || [];
          if (elementos.includes(mark) || elementos.some(el => el.closest?.('mark.ath-pdf-grifo-texto') === mark)) {
            atingido = true;
          }
        }

        if (atingido && mark.parentNode) {
          const colEl = mark.closest('[data-colunas-pag]') || mark.closest('.ath-pdf-folha-texto');
          if (colEl) ultimoColEl = colEl;
          const parent = mark.parentNode;
          if (typeof mark.replaceWith === 'function') {
            mark.replaceWith(...(mark.childNodes || []));
          } else {
            while (mark.firstChild) {
              const child = mark.firstChild;
              if (typeof mark.removeChild === 'function') {
                mark.removeChild(child);
              } else {
                mark.firstChild = null;
              }
              parent.insertBefore(child, mark);
            }
            if (typeof parent.removeChild === 'function') {
              parent.removeChild(mark);
            }
          }
          if (typeof parent.normalize === 'function') parent.normalize();
          alterouHtml = true;
        }
      }

      if (alterouHtml) {
        const nPag = parseInt(folhaContainer?.dataset?.numPagina, 10) || numPag;
        const artAtivo = this.artigos?.find(a => a.id === art.id) || art;
        if (artAtivo.conteudoPaginasPdf?.[nPag - 1]) {
          if (ultimoColEl) {
            artAtivo.conteudoPaginasPdf[nPag - 1].htmlGrifado = ultimoColEl.innerHTML;
          }
        }
        if (this.artigoAberto?.conteudoPaginasPdf?.[nPag - 1] && ultimoColEl) {
          this.artigoAberto.conteudoPaginasPdf[nPag - 1].htmlGrifado = ultimoColEl.innerHTML;
        }
        salvarArtigosEstudo(this.artigos || [artAtivo]);
      }
    }
  }

  redesenharCanvasTinta(canvas, art, numPag = this.paginaAtual) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const tracos = art.fichamento?.tracosPorPagina?.[numPag] || [];
    tracos.forEach(tr => {
      const pts = tr.pontos || [];
      if (pts.length === 0) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = tr.cor || '#314F79';
      ctx.lineWidth = tr.espessura || 3;
      ctx.globalAlpha = tr.tipo === 'marcatexto' ? 0.36 : 0.92;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) {
        ctx.lineTo(pts[0].x + 0.5, pts[0].y + 0.5);
      } else {
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  /* ==========================================================================
     PAINEL LATERAL DIREITO DO ESTÚDIO: RESUMO, CITAÇÕES E VÍNCULO ZOTERO+DRIVE
     ========================================================================== */
  /* ==========================================================================
     MODAL DE CONFIGURAÇÃO RÁPIDA DE CREDENCIAIS DO ZOTERO (API KEY + USER ID)
     ========================================================================== */
  async sincronizarArtigoComDriveEZotero(art, btnEl = null, statusEl = null) {
    if (this._sincronizandoArtigo) return;
    this._sincronizandoArtigo = true;

    definirArtigoAbertoAtivo(art);
    salvarArtigosEstudo(this.artigos, art);

    const ehBotaoIcone = Boolean(btnEl && (btnEl.classList.contains('rm-ic-bt') || !btnEl.querySelector('span')));
    const txtOriginal = btnEl ? btnEl.innerHTML : '';
    const tituloOriginal = btnEl ? (btnEl.getAttribute('title') || '') : '';
    const ariaLabelOriginal = btnEl ? (btnEl.getAttribute('aria-label') || '') : '';

    if (btnEl) {
      if (ehBotaoIcone) {
        btnEl.classList.add('ath-salvando');
        btnEl.classList.remove('ath-salvo', 'ath-salvar-erro');
        btnEl.setAttribute('aria-busy', 'true');
        btnEl.setAttribute('title', 'Salvando alterações...');
        btnEl.setAttribute('aria-label', 'Salvando alterações...');
      } else {
        btnEl.disabled = true;
        const span = btnEl.querySelector('span');
        if (span) span.textContent = 'Salvando...';
        else btnEl.textContent = 'Salvando...';
      }
    }

    const resultados = [];

    try {
      try {
        await bib.sincronizarBiblioteca();
        resultados.push('Biblioteca sincronizada ✓');
      } catch (_) {}

      const htmlNotaZotero = gerarHtmlNotaZoteroDoArtigo(art);
      if (this.temZoteroConectado() && art.chaveZotero) {
        try {
          const resZot = await this.zoteroClient.sincronizarNotaFilhaNoZotero({
            parentItemKey: art.chaveZotero,
            noteKey: art.notaZoteroKey || null,
            htmlNota: htmlNotaZotero,
            tags: ['Athenes', 'Fichamento PDF', ...(art.palavrasChave || []).slice(0, 3)],
            artigoMetadados: art
          });
          if (resZot.parentKey) art.chaveZotero = resZot.parentKey;
          if (resZot.noteKey) art.notaZoteroKey = resZot.noteKey;
          if (this.zoteroClient.userId) {
            this.salvarConfigZotero({ userId: this.zoteroClient.userId });
          }
          if (resZot.ok) resultados.push('Zotero ✓');
        } catch (e) {
          console.warn('[Athenes] Zotero sync nota:', e.message);
        }
      }

      try {
        const sessaoSync = lerSessaoSupabase();
        const idSufixoSync = sessaoSync?.user_id ? `_${sessaoSync.user_id.slice(0, 8)}` : '';
        const idDocSync = art.docCompartilhadoId || `artigo_${art.id || 'ref'}${idSufixoSync}`;
        art.docCompartilhadoId = idDocSync;
        await salvarDocumentoNoSupabase({
          id: idDocSync,
          titulo: `[Fichamento PDF] ${art.titulo}`,
          autor: (art.autores || []).map(a => `${a.prenome || ''} ${a.sobrenome || ''}`.trim()).filter(Boolean).join(', ') || 'Autor',
          norma: 'zotero_pdf',
          secoes: [],
          artigoEstudo: art
        });
        resultados.push('Nuvem Supabase ✓');
      } catch (_) {}

      const driveCfg = obterConfigGoogleDrive();
      if (driveCfg.accessToken || driveCfg.clientId) {
        try {
          const token = await obterTokenOuConectar(driveCfg);
          const pastaDriveArtigoId = await obterOuCriarPastaDoArtigoNoDrive(art.pastaId, token).catch(() => driveCfg.pastaId || null);
          const salvoDrive = await salvarArquivoNoGoogleDrive({
            nomeArquivo: `${(art.driveFileName || 'Artigo').replace(/\.pdf$/i, '')}.athenes-pdf.json`,
            conteudoBlobOuTexto: art,
            accessToken: token,
            pastaId: pastaDriveArtigoId || driveCfg.pastaId || null,
            driveFileId: art.driveAnnotationFileId || null
          });
          if (salvoDrive?.id) art.driveAnnotationFileId = salvoDrive.id;

          // Se o PDF ainda não está salvo no Google Drive, faz o upload para a pasta indicada
          if (!art.driveFileId) {
            const pdfBlob = await obterPdfLocal(art.id) || art.pdfBlob;
            if (pdfBlob) {
              const nomePdf = art.driveFileName || `${(art.titulo || 'artigo').slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
              const salvoPdf = await salvarArquivoNoGoogleDrive({
                nomeArquivo: nomePdf,
                conteudoBlobOuTexto: pdfBlob,
                mimeType: 'application/pdf',
                accessToken: token,
                pastaId: pastaDriveArtigoId || driveCfg.pastaId || null
              });
              if (salvoPdf?.id) {
                art.driveFileId = salvoPdf.id;
                art.driveFileName = salvoPdf.name || nomePdf;
                art.driveStatus = 'PDF no Google Drive';
              }
            }
          }
          if (pastaDriveArtigoId) {
            art.driveFolderId = pastaDriveArtigoId;
            if (art.driveFileId && !String(art.driveFileId).startsWith('drive_pdf_')) {
              await moverArquivoNoDrive(art.driveFileId, pastaDriveArtigoId, token).catch(() => {});
            }
          }
          resultados.push('Google Drive ✓');
        } catch (_) {}
      }

      salvarArtigosEstudo(this.artigos, art);

      if (btnEl) {
        if (ehBotaoIcone) {
          btnEl.classList.remove('ath-salvando');
          btnEl.classList.add('ath-salvo');
          btnEl.removeAttribute('aria-busy');
          btnEl.setAttribute('title', 'Salvo com sucesso!');
          btnEl.setAttribute('aria-label', 'Salvo com sucesso!');

          if (this._timerFeedbackSalvar) clearTimeout(this._timerFeedbackSalvar);
          this._timerFeedbackSalvar = setTimeout(() => {
            btnEl.classList.remove('ath-salvo');
            btnEl.setAttribute('title', tituloOriginal || 'Salvar alterações');
            btnEl.setAttribute('aria-label', ariaLabelOriginal || 'Salvar');
            this._timerFeedbackSalvar = null;
          }, 1800);
        } else {
          btnEl.disabled = false;
          const span = btnEl.querySelector('span');
          if (span) span.textContent = 'Salvo ✓';
          else btnEl.textContent = 'Salvo ✓';
          setTimeout(() => {
            if (span) span.textContent = 'Sincronizar agora';
            else btnEl.innerHTML = txtOriginal;
          }, 1800);
        }
      }

      if (statusEl) {
        statusEl.textContent = resultados.join(' · ');
      }
      mostrarAviso('Alterações, riscos e citações salvos com sucesso!', { tipo: 'ok' });

    } catch (err) {
      console.error('[Athenes] Falha ao sincronizar artigo:', err);

      if (btnEl) {
        if (ehBotaoIcone) {
          btnEl.classList.remove('ath-salvando', 'ath-salvo');
          btnEl.classList.add('ath-salvar-erro');
          btnEl.removeAttribute('aria-busy');
          btnEl.setAttribute('title', 'Erro ao salvar. Clique para tentar novamente.');
          btnEl.setAttribute('aria-label', 'Erro ao salvar. Tentar novamente.');

          if (this._timerFeedbackSalvar) clearTimeout(this._timerFeedbackSalvar);
          this._timerFeedbackSalvar = setTimeout(() => {
            btnEl.classList.remove('ath-salvar-erro');
            btnEl.setAttribute('title', tituloOriginal || 'Salvar alterações');
            btnEl.setAttribute('aria-label', ariaLabelOriginal || 'Salvar');
            this._timerFeedbackSalvar = null;
          }, 3000);
        } else {
          btnEl.disabled = false;
          const span = btnEl.querySelector('span');
          if (span) span.textContent = 'Erro ao salvar';
          else btnEl.textContent = 'Erro ao salvar';
          setTimeout(() => {
            if (span) span.textContent = 'Sincronizar agora';
            else btnEl.innerHTML = txtOriginal;
          }, 3000);
        }
      }

      if (statusEl) {
        statusEl.style.color = '#B91C1C';
        statusEl.textContent = `Atenção: ${err.message || 'Falha na sincronização'}`;
      }
      mostrarAviso(`Erro ao salvar: ${err.message || 'verifique sua conexão.'}`, { tipo: 'erro' });

    } finally {
      this._sincronizandoArtigo = false;
    }
  }

  async sincronizarZoteroAutomaticamente() {
    if (this._estudioDestruido || !this.container?.isConnected || document.hidden || navigator.onLine === false) return;
    await this._bibliotecaInicial;
    if (this._estudioDestruido || !this.container?.isConnected || document.hidden) return;
    this.carregarConfigZotero();
    if (!this.zoteroClient.apiKey || this._sincronizacaoZotero || Date.now() - (this._ultimaConsultaAutomaticaZotero || 0) < 30_000) return;
    this._ultimaConsultaAutomaticaZotero = Date.now();
    try { await this.sincronizarComZoteroApi({ silencioso: true, automatico: true }); }
    catch (e) { console.warn('[Athenes] Sincronização automática do Zotero:', e.message); }
  }

  /**
   * Botão "Sincronizar": faz as duas coisas de uma vez. Primeiro busca no Zotero os artigos novos (com as coleções, anexos e
   * notas); depois leva ao Google Drive as pastas, os documentos, os PDFs que só estão neste aparelho e os nomes dos PDFs.
   * Sem nenhum dos dois conectados, abre a conexão do Zotero.
   */
  async sincronizarTudo() {
    const temZotero = this.temZoteroConectado();
    const temDrive = driveConectado();
    if (!temZotero && !temDrive) {
      this.abrirModalCredenciaisZotero();
      return;
    }
    if (temZotero) {
      try { await this.sincronizarComZoteroApi(); } catch (e) { console.warn('[Athenes] Zotero:', e?.message || e); }
    }
    if (!temDrive) {
      mostrarAviso('Zotero sincronizado. Conecte o Google Drive para guardar também os PDFs e as anotações na nuvem.', { tipo: 'info', ms: 5000 });
      return;
    }
    try {
      await this.aoSincronizarDrive?.(); // pastas e documentos (página inicial)
      const pdfs = await migrarPdfsLocaisParaODrive(); // PDFs deste aparelho, organização nas pastas e nomes dos PDFs
      await sincronizarBibliotecaArtigosAgora();
      mostrarAviso(`${temZotero ? 'Zotero e ' : ''}Google Drive sincronizados${pdfs ? ` · ${pdfs} PDF(s) conferido(s) no Drive` : ''}.`, { tipo: 'ok', ms: 4000 });
    } catch (e) {
      mostrarAviso(`Google Drive: ${e?.message || e}`, { tipo: 'aviso', ms: 6000 });
    }
  }

  sincronizarComZoteroApi(opcoes) {
    this._sincronizacaoZotero ??= this._sincronizarBibliotecaZotero(opcoes).finally(() => { this._sincronizacaoZotero = null; });
    return this._sincronizacaoZotero;
  }

  async _sincronizarBibliotecaZotero({ silencioso = false, automatico = false } = {}) {
    this.carregarConfigZotero();
    if (!this.zoteroClient.apiKey) {
      if (!silencioso) this.abrirModalCredenciaisZotero();
      return;
    }

    if (this.artigoAtivo && ehArtigoExemploFicticio(this.artigoAtivo)) {
      this.artigoAtivo = null;
    }

    const conta = obterContaAtiva();
    const chaveApi = this.zoteroClient.apiKey;
    let leitura;
    try {
      leitura = await this.zoteroClient.lerBibliotecaParaEspelho({ versaoConhecida: automatico ? this._zoteroVerificado : undefined });
    } catch (e) {
      if (automatico) console.warn('[Athenes] Zotero:', e.message);
      else if (obterContaAtiva() === conta) mostrarAviso(e.message, { tipo: 'aviso' });
      return;
    }
    if (!leitura || this._estudioDestruido || obterContaAtiva() !== conta || lerConfigZotero().apiKey !== chaveApi) return;
    const { itens, ...espelho } = leitura;
    if (this.zoteroClient.userId) {
      this.salvarConfigZotero({ userId: this.zoteroClient.userId });
    }

    const pastas = obterPastasDriveLocais();
    const anterior = escolherEspelhoZotero(pastas);
    const vigente = anterior?.biblioteca === espelho.biblioteca
      ? escolherEspelhoZotero(pastas, [{ id: 'pasta_bib_raiz', zoteroEspelho: espelho }]) : espelho;
    if (vigente.biblioteca === espelho.biblioteca && Number(vigente.versao) > Number(espelho.versao)) return;
    for (const col of vigente.colecoes) removerPastaExcluida(`zot_col_${col.key}`);
    const esp = aplicarEspelhoZotero(pastas, vigente);
    // A biblioteca pode ter recebido artigos de outro dispositivo enquanto o Zotero respondia.
    this.artigos = carregarArtigosEstudo().filter(a => !ehArtigoExemploFicticio(a));
    remapearPastasDosArtigos(this.artigos, esp.idsUnificados);
    this.pastaFiltroId = resolverAliasPasta(this.pastaFiltroId, esp.idsUnificados);
    remapearSelecaoPastas(esp.idsUnificados);
    if (esp.mudou) salvarPastasDriveLocais(esp.pastas);

    let novos = 0;
    itens.forEach(it => {
      const existente = this.artigos.find(a => !a.compartilhadoComigo && !a.proprietarioExterno &&
        (!a.zoteroBiblioteca || a.zoteroBiblioteca === vigente.biblioteca) &&
        (a.chaveZotero === it.chave || (!a.chaveZotero && a.titulo === it.titulo)));
      if (existente) {
        existente.chaveZotero = it.chave;
        existente.itemTypeZotero = it.itemTypeZotero || existente.itemTypeZotero || '';
        existente.camposZotero = it.camposZotero || existente.camposZotero || null; // informações do Zotero atualizadas a cada sincronização
        existente.criadores = it.criadores || existente.criadores || null;
        if (!existente.doi && it.doi) existente.doi = it.doi;
        if (!existente.isbn && it.isbn) existente.isbn = it.isbn;
        if (!existente.paginas && it.paginas) existente.paginas = it.paginas;
        return;
      }
      const novo = this.converterItemZoteroParaEstudo(it);
      if (this.artigos.some(a => a.id === novo.id)) novo.id = `${novo.id}_${vigente.biblioteca.split('/').slice(-2).join('_')}`;
      this.artigos.unshift(novo);
      novos++;
    });
    const { removidos } = aplicarColecoesZoteroAosArtigos(this.artigos, itens, esp.mapa, vigente);
    // Coleções apagadas no Zotero (ou na Lixeira dele) que ficaram sem obra nenhuma somem também daqui; com obras, ficam em "Só no Athenes"
    const limpeza = descartarColecoesQueSairamDoZotero(obterPastasDriveLocais(), this.artigos);
    if (limpeza.removidas.length) {
      salvarPastasDriveLocais(limpeza.pastas);
      registrarPastasExcluidas(limpeza.removidas); // outro aparelho não as recria; a pasta no Drive só vai à lixeira se estiver vazia
      if (limpeza.removidas.some(r => r.id === this.pastaFiltroId)) this.pastaFiltroId = 'todas';
    }
    const houveMudancaCatalogo = novos > 0 || (removidos?.length || 0) > 0 || (esp.criadas?.length || 0) > 0 || limpeza.removidas.length > 0;
    salvarArtigosEstudo(this.artigos);
    if (automatico && !this.artigoAberto && houveMudancaCatalogo) this.atualizarCatalogoSeLivre(true);
    if (automatico) this.aoMudarPastas?.({ pastasNovas: esp.criadas });
    // PDFs vinculados, notas e anotações de PDF do Zotero (só metadados: o arquivo é baixado sob demanda)
    try {
      const filhos = await this.zoteroClient.listarFilhos();
      if (this._estudioDestruido || obterContaAtiva() !== conta) return;
      this.artigos = carregarArtigosEstudo();
      this.artigos.forEach(a => { if (a.zoteroBiblioteca === vigente.biblioteca) aplicarFilhosZoteroAoArtigo(a, a.chaveZotero, filhos); });
      salvarArtigosEstudo(this.artigos);
      this._zoteroVerificado = espelho;
    } catch (e) { console.warn('[Athenes] Anexos e notas do Zotero:', e.message); }
    if (this._estudioDestruido || obterContaAtiva() !== conta) return;
    this.carregarGruposZotero().catch(() => {});
    if (!automatico) obterTokenDrive().then(tok => {
      if (tok && obterContaAtiva() === conta) {
        reconciliarArtigosComDrive(this.artigos.filter(a => a.zoteroBiblioteca === vigente.biblioteca), tok).catch(() => {});
      }
    });
    if (!automatico) this.aoMudarPastas?.({ pastasNovas: esp.criadas });
    if (!automatico) this.renderizar();
    else if (!this.artigoAberto && houveMudancaCatalogo) this.atualizarCatalogoSeLivre(true);
    if (!silencioso) {
      if (!itens || itens.length === 0) {
        alert(
          `Conexão ativa com sua conta Zotero (${this.zoteroClient.username || 'User'} · ID #${this.zoteroClient.userId || 'OK'}).\n\n` +
          `A nuvem online do Zotero (zotero.org) retornou 0 itens para esta conta.\n` +
          `• Se os seus artigos estão no Zotero Desktop do seu computador, clique no ícone redondo verde "Sincronizar com zotero.org" no canto superior direito do Zotero Desktop.\n` +
          `• Ou use o botão "Importar .bib" no topo para carregar sua coleção instantaneamente!`
        );
      } else {
        alert(`Sincronização Zotero concluída! ${novos} novo(s) artigo(s) trazido(s)${removidos?.length ? `, ${removidos.length} excluído(s) removido(s)` : ''} (${itens.length} itens lidos).`);
      }
    }
  }

  /**
   * Desfaz o vínculo do PDF com a referência (vinculou o arquivo errado). O arquivo NÃO é apagado do Drive nem do Zotero: só deixa de
   * estar ligado a este artigo, que volta a "sem PDF" e pode receber outro. Citações, notas e riscos já feitos ficam guardados.
   */
  async desvincularPdfDoArtigo(art) {
    if (!art) return false;
    const marcas = (art.fichamento?.citacoesMarcadas?.length || 0) + Object.values(art.fichamento?.notasPagina || {}).reduce((t, l) => t + (l?.length || 0), 0) + Object.values(art.fichamento?.tracosPorPagina || {}).reduce((t, l) => t + (l?.length || 0), 0);
    const aviso = `Desvincular o PDF "${art.driveFileName || 'deste artigo'}" da referência?\n\nO arquivo continua no seu Drive (nada é apagado) e você poderá vincular outro PDF.${marcas ? `\n\nAs ${marcas} marcação(ões) já feitas (citações, notas e riscos) ficam guardadas, mas estão ligadas às páginas do PDF antigo.` : ''}`;
    if (!window.confirm(aviso)) return false;
    const url = art.pdfBlobUrl;
    this._pdfDocs?.delete(url);
    if (url) { try { URL.revokeObjectURL(url); } catch (_) {} }
    this._pdfFalhou?.clear();
    // o arquivo desvinculado fica "recusado" para este artigo: nem a nota do Zotero, nem outro computador, nem a busca automática o religam
    const idAntigo = String(art.driveFileId || '').trim();
    if (idAntigo && !/^drive_pdf_/.test(idAntigo)) {
      art.pdfsRecusados = [...new Set([...(art.pdfsRecusados || []), idAntigo])].slice(-20);
    }
    art.pdfDesvinculadoEm = new Date().toISOString();
    art.pdfBlobUrl = null; art.temPdfLocal = false; art.pdfBlob = null;
    art.driveFileId = ''; art.driveFileName = ''; art.driveStatus = 'Sem PDF vinculado';
    art.conteudoPaginasPdf = []; art.totalPaginas = 0; // as páginas vinham do arquivo antigo
    await esquecerPdfGuardadoDoArtigo(art); // todas as cópias deste aparelho (pelo artigo e pela chave do Zotero): sem isso o arquivo voltava
    salvarArtigosEstudo(this.artigos, art);
    sincronizarBibliotecaArtigosAgora();
    this.paginaAtual = 1;
    this.renderizar();
    mostrarAviso('PDF desvinculado. Escolha outro arquivo quando quiser.', { tipo: 'info', ms: 5000 });
    return true;
  }

  /** Escolhe um PDF no Drive e o liga ao artigo (a cópia já está na pasta do Athenes): abre na folha e guarda o vínculo. */
  escolherPdfNoDrive(art) {
    this.abrirModalEscolherPdfDoGoogleDrive(async (arq) => {
      const urlAntiga = art.pdfBlobUrl;
      if (urlAntiga) { this._pdfDocs?.delete(urlAntiga); try { URL.revokeObjectURL(urlAntiga); } catch (_) {} }
      art.driveFileName = arq.name;
      art.driveFileId = arq.id;
      art.driveStatus = 'PDF no Google Drive';
      art.pdfBlobUrl = null;
      art.conteudoPaginasPdf = []; art.totalPaginas = 0;
      // escolheu este arquivo: deixa de ser recusado; e a cópia de um PDF anterior guardada aqui não pode abrir no lugar dele
      if (Array.isArray(art.pdfsRecusados)) art.pdfsRecusados = art.pdfsRecusados.filter(id => id !== String(arq.id));
      delete art.pdfDesvinculadoEm;
      await esquecerPdfGuardadoDoArtigo(art);
      if (this._pdfFalhou) this._pdfFalhou.clear();
      salvarArtigosEstudo(this.artigos, art);
      sincronizarBibliotecaArtigosAgora();
      this.renderizar();
      garantirPdfDoArtigo(art).then(ok => { if (ok) this.renderizar(); });
      // o arquivo (a cópia na pasta do Athenes) ganha o nome do artigo; o ID não muda, então o vínculo continua
      renomearPdfDoArtigoNoDrive(art).then(ok => { if (ok && this.artigoAberto === art) this.renderizar(); });
    });
  }

  /**
   * Navega por TODAS as pastas do Google Drive (Meu Drive, Compartilhados comigo e a pasta do Athenes), com busca por nome. Ao escolher
   * um PDF de fora do Athenes, ele é COPIADO para a pasta do Athenes (o original não é tocado) e `onEscolhido({ id, name })` recebe a
   * cópia. Ler as pastas do resto do Drive exige o acesso de leitura, pedido aqui na primeira vez (o Athenes sozinho só vê o que criou).
   */
  async abrirModalEscolherPdfDoGoogleDrive(onEscolhido) {
    const cfg = obterConfigGoogleDrive();
    const modal = document.createElement('div');
    modal.className = 'ath-modal-backdrop';
    modal.innerHTML = `
      <div class="ath-modal ath-drive-nav" style="max-width:640px; width:94vw;">
        <div class="ath-modal-head">
          <h2>Escolher PDF do Google Drive</h2>
          <button type="button" class="ath-btn ath-btn-icon" id="athModalEscPdfDriveFechar" aria-label="Fechar">${svgIcone('fechar', 16)}</button>
        </div>
        <div class="ath-modal-corpo">
          <div class="ath-dn-abas" role="tablist">
            <button type="button" role="tab" class="on" data-aba="meu">Meu Drive</button>
            <button type="button" role="tab" data-aba="comigo">Compartilhados comigo</button>
            <button type="button" role="tab" data-aba="athenes">Pasta do Athenes</button>
          </div>
          <input type="search" class="ath-input ath-dn-busca" placeholder="Buscar PDF ou pasta pelo nome em todo o Drive…" aria-label="Buscar no Drive">
          <nav class="ath-dn-trilha" aria-label="Caminho"></nav>
          <div class="ath-dn-status" role="status" aria-live="polite">Conectando ao seu Google Drive…</div>
          <div class="ath-dn-lista"></div>
          <button type="button" class="ath-btn ath-btn-sm ath-dn-mais" hidden>Carregar mais</button>
        </div>
        <div class="ath-modal-foot">
          <small class="ath-dn-dica">O PDF escolhido é copiado para a pasta do Athenes; o original fica onde está.</small>
          <button type="button" class="ath-btn" id="athModalEscPdfDriveCancelar">Fechar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const fechar = () => modal.remove();
    modal.querySelector('#athModalEscPdfDriveFechar').addEventListener('click', fechar);
    modal.querySelector('#athModalEscPdfDriveCancelar').addEventListener('click', fechar);
    modal.addEventListener('click', e => { if (e.target === modal) fechar(); });

    const q = (s) => modal.querySelector(s);
    const statusEl = q('.ath-dn-status'); const listaEl = q('.ath-dn-lista'); const trilhaEl = q('.ath-dn-trilha'); const maisEl = q('.ath-dn-mais'); const buscaEl = q('.ath-dn-busca');
    const estado = { aba: 'meu', trilha: [{ id: 'root', nome: 'Meu Drive' }], busca: '', proximo: '', req: 0, itens: { pastas: [], pdfs: [] } };
    const aviso = (t, erro = false) => { statusEl.style.color = erro ? '#B42318' : '#314F79'; statusEl.textContent = t; };
    const fmtTam = (n) => { const b = Number(n) || 0; return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b ? `${Math.max(1, Math.round(b / 1024))} KB` : ''; };
    const fmtData = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR'); };

    const desenharTrilha = () => {
      trilhaEl.hidden = estado.aba !== 'meu' || Boolean(estado.busca);
      trilhaEl.innerHTML = estado.trilha.map((p, i) => i === estado.trilha.length - 1
        ? `<strong>${escapeHtml(p.nome)}</strong>`
        : `<button type="button" data-nivel="${i}">${escapeHtml(p.nome)}</button><span aria-hidden="true">›</span>`).join('');
      trilhaEl.querySelectorAll('[data-nivel]').forEach(b => b.addEventListener('click', () => { estado.trilha = estado.trilha.slice(0, Number(b.dataset.nivel) + 1); carregar(); }));
    };

    const desenharLista = () => {
      const { pastas, pdfs } = estado.itens;
      if (!pastas.length && !pdfs.length) { listaEl.innerHTML = '<div class="ath-dn-vazio">Nada por aqui: nenhuma pasta nem PDF.</div>'; return; }
      listaEl.innerHTML = [
        ...pastas.map((p, i) => `<button type="button" class="ath-dn-item ath-dn-pasta" data-pasta="${i}"><span class="ath-dn-ic">${svgIcone('pasta', 16)}</span><span class="ath-dn-nome">${escapeHtml(p.name)}</span><span class="ath-dn-seta" aria-hidden="true">›</span></button>`),
        ...pdfs.map((a, i) => `<div class="ath-dn-item ath-dn-pdf"><span class="ath-dn-ic">${svgIcone('pdf', 16)}</span><span class="ath-dn-nome" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}<small>${[fmtData(a.modifiedTime), fmtTam(a.size)].filter(Boolean).join(' · ')}</small></span><button type="button" class="ath-btn ath-btn-primary ath-btn-sm" data-pdf="${i}">${estado.aba === 'athenes' ? 'Usar este PDF' : 'Copiar e usar'}</button></div>`)
      ].join('');
      listaEl.querySelectorAll('[data-pasta]').forEach(b => b.addEventListener('click', () => { const p = estado.itens.pastas[Number(b.dataset.pasta)]; buscaEl.value = ''; estado.busca = ''; estado.trilha.push({ id: p.id, nome: p.name }); carregar(); }));
      listaEl.querySelectorAll('[data-pdf]').forEach(b => b.addEventListener('click', () => escolher(estado.itens.pdfs[Number(b.dataset.pdf)], b)));
    };

    const pedirPermissao = () => {
      statusEl.textContent = '';
      listaEl.innerHTML = `<div class="ath-dn-permissao">
        <strong>Permitir que o Athenes leia as pastas do seu Drive</strong>
        <p>Por padrão o Athenes só enxerga o que ele mesmo criou. Para escolher um PDF que está em qualquer pasta sua, o Google pede uma permissão de <b>somente leitura</b>. O Athenes não altera nem apaga nada nos seus arquivos: ele apenas copia o PDF escolhido para a pasta do Athenes.</p>
        <button type="button" class="ath-btn ath-btn-primary" data-permitir>Permitir leitura do Drive</button>
      </div>`;
      listaEl.querySelector('[data-permitir]').addEventListener('click', async (e) => {
        e.currentTarget.disabled = true; aviso('Abrindo a autorização do Google…');
        try { await autenticarGoogleDrive(cfg.clientId, ESCOPOS_COM_LEITURA); carregar(); }
        catch (err) { aviso(`Não foi possível autorizar: ${err.message || err}`, true); pedirPermissao(); }
      });
    };

    const carregar = async ({ mais = false } = {}) => {
      desenharTrilha(); maisEl.hidden = true;
      if (!mais) { listaEl.innerHTML = ''; estado.itens = { pastas: [], pdfs: [] }; estado.proximo = ''; }
      const req = ++estado.req; // resposta de uma consulta antiga (troca rápida de aba/pasta) é descartada
      aviso(mais ? 'Carregando mais…' : 'Listando seu Google Drive…');
      try {
        const token = await obterTokenOuConectar(obterConfigGoogleDrive());
        if (estado.aba !== 'athenes' && !(await tokenPodeLerTodoODrive(token))) { if (req === estado.req) pedirPermissao(); return; } // só com `drive.file` a lista viria vazia
        let r;
        if (estado.aba === 'athenes') {
          const pdfs = await listarPdfsDoGoogleDrive(token);
          r = { pastas: [], pdfs, proximo: '' };
        } else {
          r = await listarConteudoDoDrive(token, { pastaId: estado.trilha[estado.trilha.length - 1].id, busca: estado.busca, compartilhados: estado.aba === 'comigo', pageToken: mais ? estado.proximo : '' });
        }
        if (req !== estado.req) return;
        estado.itens = { pastas: [...estado.itens.pastas, ...r.pastas], pdfs: [...estado.itens.pdfs, ...r.pdfs] };
        estado.proximo = r.proximo;
        maisEl.hidden = !r.proximo;
        const n = estado.itens.pdfs.length; const m = estado.itens.pastas.length;
        aviso(estado.busca ? `${n} PDF(s) e ${m} pasta(s) com "${estado.busca}"` : `${m} pasta(s) e ${n} PDF(s)`);
        desenharLista();
      } catch (err) {
        if (req !== estado.req) return;
        if (err.semPermissao && estado.aba !== 'athenes') { pedirPermissao(); return; }
        aviso(`Não foi possível listar o Drive: ${err.message || err}. Use "Selecionar PDF no computador" se preferir.`, true);
      }
    };

    const escolher = async (arq, botao) => {
      if (!arq) return;
      if (estado.aba === 'athenes') { onEscolhido?.({ id: arq.id, name: arq.name }); fechar(); return; }
      modal.querySelectorAll('button').forEach(b => { b.disabled = true; });
      aviso(`Copiando "${arq.name}" para a pasta do Athenes…`);
      try {
        const token = await obterTokenOuConectar(obterConfigGoogleDrive());
        const copia = await copiarPdfDoDriveParaAthenes(token, arq, { pastaNome: PASTA_PDFS_DRIVE });
        onEscolhido?.({ id: copia.id, name: copia.name, jaExistia: copia.jaExistia });
        fechar();
      } catch (err) {
        modal.querySelectorAll('button').forEach(b => { b.disabled = false; });
        aviso(`Não foi possível copiar o PDF: ${err.message || err}`, true);
      }
    };

    modal.querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => {
      estado.aba = b.dataset.aba; estado.busca = ''; buscaEl.value = ''; estado.trilha = [{ id: 'root', nome: 'Meu Drive' }];
      modal.querySelectorAll('[data-aba]').forEach(x => x.classList.toggle('on', x === b));
      buscaEl.disabled = estado.aba === 'athenes';
      carregar();
    }));
    let tBusca = null;
    buscaEl.addEventListener('input', () => { clearTimeout(tBusca); tBusca = setTimeout(() => { estado.busca = buscaEl.value.trim(); carregar(); }, 350); });
    maisEl.addEventListener('click', () => carregar({ mais: true }));

    carregar();
  }

}

Object.assign(EstudoArtigosView.prototype, metodosEstudoTela, metodosEstudoPainelDireito, metodosEstudoAnotacoes, metodosEstudoModais, metodosEstudoPastas);

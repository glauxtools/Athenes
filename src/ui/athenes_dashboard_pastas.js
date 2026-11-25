// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Athenes — Dashboard: árvore de pastas da lateral e banner da pasta.
 * Métodos da classe DashboardView (usam `this`); são acrescentados ao prototype em athenes_dashboard.js.
 */
import { obterPastasDriveLocais, removerPastaDriveLocal, buscarPastaNaArvore } from '../core/athenes_colaboracao.js';
import { registrarPastasExcluidas } from '../core/athenes_drive_sync.js';
import { artigoEstaNaPasta, PASTA_BIBLIOGRAFIA_LOCAL } from '../core/athenes_zotero_pastas.js';
import { escapeHtml } from '../core/athenes_seguranca.js';
import { carregarArtigosEstudo } from './athenes_estudo_artigos.js';
import { svgIcone } from './athenes_icones.js';

const CHAVE_PASTAS_RECOLHIDAS = 'athenes_dash_pastas_recolhidas';

function criarLinhaPasta(id, nome, icone, quantidade, selecionada) {
  const item = document.createElement('div');
  item.className = `ath-pasta-item${selecionada ? ' active' : ''}`;
  item.dataset.pastaLateral = id;
  item.innerHTML = `
    <span class="ath-pasta-seta-espaco" aria-hidden="true"></span>
    <button type="button" class="ath-pasta-link" title="${escapeHtml(nome)}"${selecionada ? ' aria-current="true"' : ''}>
      <span class="ath-pasta-icone">${svgIcone(icone, 14)}</span>
      <span class="ath-pasta-nome">${escapeHtml(nome)}</span>
      <span class="ath-pasta-badge">${quantidade}</span>
    </button>`;
  return item;
}

export const metodosDashboardPastas = {
  alternarDrawerPastas() {
    const sidebar = this.container?.querySelector('#athDashSidebar');
    const scrim = this.container?.querySelector('#athDashScrim');
    if (!sidebar) return;
    const abrir = !sidebar.classList.contains('ath-aberto');
    sidebar.classList.toggle('ath-aberto', abrir);
    scrim?.classList.toggle('ath-aberto', abrir);
  },

  fecharDrawerPastas() {
    const sidebar = this.container?.querySelector('#athDashSidebar');
    const scrim = this.container?.querySelector('#athDashScrim');
    sidebar?.classList.remove('ath-aberto');
    scrim?.classList.remove('ath-aberto');
  },

  abrirDrawerPastas() {
    const sidebar = this.container?.querySelector('#athDashSidebar');
    const scrim = this.container?.querySelector('#athDashScrim');
    sidebar?.classList.add('ath-aberto');
    scrim?.classList.add('ath-aberto');
  },
  renderizarPastasLateral() {
    const listaEl = this.container.querySelector('#athDashPastasLista');
    if (!listaEl) return;
    const rolagem = listaEl.scrollTop;
    const botaoFocado = document.activeElement;
    const itemFocado = listaEl.contains(botaoFocado) ? botaoFocado.closest('[data-pasta-lateral]') : null;
    const selecao = `${this.abaAtiva}:${this.pastaAtivaId}`;
    const revelarSelecao = selecao !== this._selecaoLateralRenderizada;
    this._selecaoLateralRenderizada = selecao;
    if (!this._pastasLateralRecolhidas) {
      let salvas;
      try { salvas = JSON.parse(localStorage.getItem(CHAVE_PASTAS_RECOLHIDAS)); } catch {}
      this._pastasLateralRecolhidas = new Set(Array.isArray(salvas) ? salvas : []);
    }
    listaEl.innerHTML = '';

    const ehAbaBib = this.abaAtiva === 'artigos_zotero';
    const raizEspelhada = ehAbaBib && this.pastasDrive.find(p => p.zoteroEspelho);

    // 1. Item Todas as Pastas (Visão Geral da Aba Ativa)
    const totalItens = ehAbaBib
      ? (this.estudoView?.artigosCatalogo?.() || carregarArtigosEstudo()).length
      : this.documentos.length;
    const rotuloTodas = ehAbaBib
      ? 'Todas as Bibliografias'
      : 'Todos os Documentos';
    const iconeTodas = ehAbaBib ? 'livro' : 'pasta';

    const itemTodas = criarLinhaPasta('todas', rotuloTodas, iconeTodas, totalItens, this.pastaAtivaId === 'todas');
    itemTodas.querySelector('.ath-pasta-link').addEventListener('click', () => this.selecionarPasta('todas'));
    listaEl.appendChild(itemTodas);

    // 2. Seção Minhas Pastas (Google Drive) - Estritamente filtrada por tipo da aba ativa
    const tituloMinhas = document.createElement('div');
    tituloMinhas.className = 'ath-dash-grupo-titulo';
    tituloMinhas.textContent = ehAbaBib
      ? (raizEspelhada ? 'Coleções do Zotero' : 'Pastas de Bibliografia (Drive)')
      : 'Pastas de Documentos (Drive)';
    listaEl.appendChild(tituloMinhas);

    const minhasPastas = this.pastasDrive.filter(p => {
      if (p.origem === 'compartilhada') return false;
      if (ehAbaBib) {
        return p.tipo === 'bibliografia' || p.id === 'pasta_bib_raiz';
      } else {
        return p.tipo === 'relatorios' || p.id === 'pasta_rel_raiz';
      }
    });

    if (minhasPastas.length === 0) {
      const avisoVazio = document.createElement('div');
      avisoVazio.style.cssText = 'font-size:11px; color:#94A3B8; padding:6px 8px; font-style:italic;';
      avisoVazio.textContent = ehAbaBib ? 'Nenhuma pasta de bibliografia.' : 'Nenhuma pasta de documentos.';
      listaEl.appendChild(avisoVazio);
    } else {
      for (const pasta of minhasPastas) {
        const local = pasta.zoteroEspelho && pasta.subpastas?.find(p => p.id === PASTA_BIBLIOGRAFIA_LOCAL);
        if (local) {
          const colecoes = pasta.subpastas.filter(p => p.id !== local.id);
          this.montarItemPastaComSubpastas(listaEl, { ...pasta, subpastas: colecoes }, 0, false, revelarSelecao);
          const tituloLocal = document.createElement('div');
          tituloLocal.className = 'ath-dash-grupo-titulo';
          tituloLocal.textContent = 'Bibliografia local';
          listaEl.appendChild(tituloLocal);
          this.montarItemPastaComSubpastas(listaEl, local, 0, false, revelarSelecao);
          continue;
        }
        this.montarItemPastaComSubpastas(listaEl, pasta, 0, false, revelarSelecao);
      }
    }

    // 3. Seção Pastas Compartilhadas Comigo - Estritamente filtrada por tipo da aba ativa
    const compartilhadas = this.pastasDrive.filter(p => {
      if (p.origem !== 'compartilhada') return false;
      if (ehAbaBib) {
        return p.tipo === 'bibliografia' || p.tipo === 'compartilhada';
      } else {
        return p.tipo === 'relatorios' || p.tipo === 'compartilhada';
      }
    });

    const tituloComp = document.createElement('div');
    tituloComp.className = 'ath-dash-grupo-titulo';
    tituloComp.textContent = 'Compartilhadas Comigo';
    listaEl.appendChild(tituloComp);

    {
      const qtd = ehAbaBib
        ? (this.estudoView?.artigosCompartilhados || []).length
        : this.documentos.filter(d => d.compartilhadoComigo).length;
      const rotuloComigo = ehAbaBib ? 'Artigos de outras pessoas' : 'Documentos de outras pessoas';
      const itemComigo = criarLinhaPasta('compartilhados_comigo', rotuloComigo, 'usuarios', qtd, this.pastaAtivaId === 'compartilhados_comigo');
      itemComigo.querySelector('.ath-pasta-link').addEventListener('click', () => this.selecionarPasta('compartilhados_comigo'));
      listaEl.appendChild(itemComigo);
    }

    if (compartilhadas.length === 0) {
      const avisoVazio = document.createElement('div');
      avisoVazio.style.cssText = 'font-size:11px; color:#94A3B8; padding:6px 8px; font-style:italic;';
      avisoVazio.textContent = ehAbaBib
        ? 'Nenhuma pasta de bibliografia compartilhada vinculada.'
        : 'Nenhuma pasta de relatórios compartilhada vinculada.';
      listaEl.appendChild(avisoVazio);
    } else {
      for (const pasta of compartilhadas) {
        this.montarItemPastaComSubpastas(listaEl, pasta, 0, true, revelarSelecao);
      }
    }
    listaEl.scrollTop = rolagem;
    if (itemFocado && getComputedStyle(listaEl.closest('.ath-dash-sidebar') || listaEl).visibility === 'visible') {
      const linha = listaEl.querySelector(`[data-pasta-lateral="${CSS.escape(itemFocado.dataset.pastaLateral)}"]`);
      const classe = [...botaoFocado.classList].find(nome => nome === 'ath-pasta-link' || nome === 'ath-pasta-seta' || nome === 'ath-pasta-acao');
      if (classe) linha?.querySelector(`.${classe}`)?.focus({ preventScroll: true });
    }
  },

  montarItemPastaComSubpastas(container, pasta, nivel = 0, ehCompartilhada = false, revelarSelecao = false) {
    const ativo = (this.pastaAtivaId === pasta.id);
    
    const ehAbaBib = this.abaAtiva === 'artigos_zotero';
    let count = 0;
    if (ehAbaBib) {
      const artigos = this.estudoView?.artigos || carregarArtigosEstudo();
      count = artigos.filter(a => artigoEstaNaPasta(a, pasta.id)).length;
    } else {
      count = this.documentos.filter(d => {
        const pId = this.pastaEfetivaDoDoc(d);
        return pId === pasta.id;
      }).length;
    }

    const iconeNome = pasta.icone || (pasta.tipo === 'bibliografia' ? 'livro' : (pasta.tipo === 'relatorios' ? 'documento' : (ehCompartilhada ? 'usuarios' : 'pasta')));
    const no = document.createElement('div');
    no.className = 'ath-pasta-no';
    const item = criarLinhaPasta(pasta.id, pasta.nome, iconeNome, count, ativo);
    item.classList.toggle('ath-pasta-item-raiz', nivel === 0);
    if (/^#[\da-f]{6}$/i.test(pasta.cor || '')) item.style.setProperty('--ath-cor-pasta-lateral', pasta.cor);
    item.querySelector('.ath-pasta-link').addEventListener('click', () => this.selecionarPasta(pasta.id));
    if (ehCompartilhada || this.pastaPodeSerExcluida(pasta)) {
      const acao = document.createElement('button');
      acao.type = 'button';
      acao.className = `ath-pasta-acao ${ehCompartilhada ? 'ath-btn-remover-comp' : 'ath-btn-excluir-pasta'}`;
      acao.title = ehCompartilhada ? 'Desvincular pasta compartilhada' : 'Excluir pasta';
      acao.setAttribute('aria-label', `${acao.title} ${pasta.nome}`);
      acao.innerHTML = svgIcone(ehCompartilhada ? 'fechar' : 'lixeira', 13);
      item.appendChild(acao);
      if (!ehCompartilhada) acao.addEventListener('click', () => this.excluirPasta(pasta));
      else acao.addEventListener('click', () => {
        if (confirm(`Deseja desvincular a pasta compartilhada "${pasta.nome}"?`)) {
          const todas = [];
          const coletar = (p) => {
            todas.push({ id: p.id, driveId: p.driveId || p.id, nome: p.nome, lixeira: true });
            (p.subpastas || []).forEach(coletar);
          };
          coletar(pasta);

          const ids = new Set(todas.map(p => p.id));
          let mudouDocs = false;
          for (const d of (this.documentos || [])) {
            if (ids.has(d.pastaId)) {
              d.pastaId = undefined;
              mudouDocs = true;
            }
          }
          if (mudouDocs) {
            this.salvarDocumentosLocais?.();
          }

          registrarPastasExcluidas(todas);
          removerPastaDriveLocal(pasta.id);
          this.pastasDrive = obterPastasDriveLocais();
          if (ids.has(this.pastaAtivaId)) this.pastaAtivaId = 'todas';
          this.renderizarPastasLateral();
          this.renderizarBannerPasta();
          if (this.abaAtiva === 'escrita') this.atualizarGrid();
          else this.estudoView?.filtrarPorPasta?.(this.pastaAtivaId);
          this.agendarPerfil?.(200);
        }
      });
    }

    no.appendChild(item);
    container.appendChild(no);
    item.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.abrirMenuContextoPastaLateral(pasta, ehCompartilhada, ev.clientX, ev.clientY);
    });
    if (!ehAbaBib) this.arquivos.tornarAlvoDeSolta(item, pasta.id);

    if (Array.isArray(pasta.subpastas) && pasta.subpastas.length > 0) {
      const recolhidas = this._pastasLateralRecolhidas;
      if (revelarSelecao && recolhidas.has(pasta.id) && buscarPastaNaArvore(pasta.subpastas, this.pastaAtivaId)) recolhidas.delete(pasta.id);
      const filhos = document.createElement('div');
      filhos.className = nivel < 6 ? 'ath-pasta-filhos' : 'ath-pasta-filhos ath-pasta-filhos-compactos';
      const seta = document.createElement('button');
      seta.type = 'button';
      seta.className = 'ath-pasta-seta';
      seta.innerHTML = svgIcone('baixo', 14);
      const atualizarSeta = () => {
        filhos.hidden = recolhidas.has(pasta.id);
        const rotulo = `${filhos.hidden ? 'Expandir' : 'Recolher'} subpastas de ${pasta.nome}`;
        seta.setAttribute('aria-expanded', String(!filhos.hidden));
        seta.setAttribute('aria-label', rotulo);
        seta.title = rotulo;
      };
      seta.addEventListener('click', () => {
        if (filhos.hidden) recolhidas.delete(pasta.id);
        else recolhidas.add(pasta.id);
        atualizarSeta();
        try { localStorage.setItem(CHAVE_PASTAS_RECOLHIDAS, JSON.stringify([...recolhidas])); } catch {}
      });
      item.querySelector('.ath-pasta-seta-espaco').replaceWith(seta);
      no.appendChild(filhos);
      atualizarSeta();
      for (const sub of pasta.subpastas) {
        this.montarItemPastaComSubpastas(filhos, sub, nivel + 1, ehCompartilhada, revelarSelecao);
      }
    }
  },

  abrirMenuContextoPastaLateral(pasta, ehCompartilhada, x, y) {
    if (!pasta) return;
    document.querySelector('.ath-menu-pasta-contexto')?.remove();
    const ehAbaBib = this.abaAtiva === 'artigos_zotero';
    const podeExcluir = this.pastaPodeSerExcluida?.(pasta);

    const menu = document.createElement('div');
    menu.className = 'ath-menu-pasta-contexto ath-artigo-menu-contexto';
    menu.style.position = 'fixed';
    menu.style.zIndex = '100005';
    menu.style.top = `${Math.min(y, Math.max(8, window.innerHeight - 230))}px`;
    menu.style.left = `${Math.min(x, Math.max(8, window.innerWidth - 220))}px`;

    const itens = [
      `<button type="button" data-acao="abrir">${svgIcone('pasta', 15)}<span>Abrir pasta</span></button>`
    ];
    if (!ehCompartilhada && ehAbaBib) {
      itens.push(`<button type="button" data-acao="compartilhar">${svgIcone('usuarios', 15)}<span>Compartilhar pasta</span></button>`);
      itens.push(`<button type="button" data-acao="cor">${svgIcone('pincel', 15)}<span>Alterar cor</span></button>`);
    } else if (!ehCompartilhada && pasta.driveId) {
      itens.push(`<button type="button" data-acao="abrir-drive">${svgIcone('drive', 15)}<span>Abrir no Google Drive</span></button>`);
    }
    if (!ehCompartilhada) {
      itens.push(`<button type="button" data-acao="subpasta">${svgIcone('mais', 15)}<span>Nova subpasta</span></button>`);
    }
    if (ehCompartilhada) {
      itens.push('<hr>');
      itens.push(`<button type="button" data-acao="desvincular" class="ath-menu-pasta-excluir">${svgIcone('fechar', 15)}<span>Desvincular pasta</span></button>`);
    } else if (podeExcluir) {
      itens.push('<hr>');
      itens.push(`<button type="button" data-acao="excluir" class="ath-menu-pasta-excluir">${svgIcone('lixeira', 15)}<span>Excluir pasta</span></button>`);
    }
    menu.innerHTML = itens.join('');

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

    menu.querySelector('[data-acao="abrir"]')?.addEventListener('click', () => {
      fechar();
      this.selecionarPasta(pasta.id);
    });
    menu.querySelector('[data-acao="compartilhar"]')?.addEventListener('click', () => {
      fechar();
      this.estudoView?.abrirModalCompartilharPasta?.(pasta.id);
    });
    menu.querySelector('[data-acao="cor"]')?.addEventListener('click', () => {
      fechar();
      this.estudoView?.abrirModalAlterarCorPasta?.(pasta.id);
    });
    menu.querySelector('[data-acao="abrir-drive"]')?.addEventListener('click', () => {
      fechar();
      window.open(`https://drive.google.com/drive/folders/${encodeURIComponent(pasta.driveId)}`, '_blank', 'noopener,noreferrer');
    });
    menu.querySelector('[data-acao="subpasta"]')?.addEventListener('click', () => {
      fechar();
      this.abrirModalNovaSubpasta?.(pasta.id);
    });
    menu.querySelector('[data-acao="excluir"]')?.addEventListener('click', () => {
      fechar();
      this.excluirPasta?.(pasta);
    });
    menu.querySelector('[data-acao="desvincular"]')?.addEventListener('click', () => {
      fechar();
      this.container?.querySelector(`[data-pasta-lateral="${CSS.escape(pasta.id)}"] .ath-btn-remover-comp`)?.click();
    });

    document.body.appendChild(menu);
  },

  renderizarBannerPasta() {
    const bannerEl = this.container.querySelector('#athDashPastaBannerInfo');
    if (!bannerEl) return;

    const ehAbaBib = this.abaAtiva === 'artigos_zotero';

    if (this.pastaAtivaId === 'todas') {
      if (!ehAbaBib) {
        bannerEl.innerHTML = `
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
              ${svgIcone('pasta', 18)}
              <div style="min-width:0;">
              <strong style="display:block; font-size:13px; color:#1E293B;">Todas as Pastas de Documentos (Visão Geral)</strong>
              <small style="font-size:11px; color:#64748B;">Exibindo todos os documentos locais e sincronizados (${this.documentos.length} no total)</small>
            </div>
          </div>
        `;
      } else {
        const totalArtigos = (this.estudoView?.artigosCatalogo?.() || carregarArtigosEstudo()).length;
        bannerEl.innerHTML = `
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
              ${svgIcone('livro', 18)}
              <div style="min-width:0;">
              <strong style="display:block; font-size:13px; color:#1E293B;">Todas as Pastas de Bibliografia & Leituras</strong>
              <small style="font-size:11px; color:#64748B;">Exibindo todos os artigos, fichamentos e PDFs vinculados (${totalArtigos} no total)</small>
            </div>
          </div>
        `;
      }
    } else {
      const pastaInfo = buscarPastaNaArvore(this.pastasDrive, this.pastaAtivaId) || {
        nome: this.pastaAtivaId === 'compartilhados_comigo' ? 'Compartilhados comigo' : 'Pasta Selecionada',
        tipo: ehAbaBib ? 'bibliografia' : 'relatorios'
      };

      if (!ehAbaBib) {
        const docsNaPasta = this.documentos.filter(d => {
          const pId = this.pastaEfetivaDoDoc(d);
          return pId === this.pastaAtivaId;
        });

        bannerEl.innerHTML = `
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
              ${svgIcone('pasta', 20)}
            <div style="min-width:0;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:11px; font-weight:700; color:#64748B; text-transform:uppercase;">Pasta de Documentos:</span>
                <strong style="font-size:13.5px; color:#314F79; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${escapeHtml(pastaInfo.nome)}</strong>
                <span class="ath-badge ath-badge-info" style="font-size:10px;">${pastaInfo.origem === 'compartilhada' ? 'Compartilhada' : 'Minha Pasta'}</span>
              </div>
              <small style="font-size:11px; color:#64748B; display:block; margin-top:1px;">
                ${docsNaPasta.length} documento(s) nesta pasta · Mostrando apenas relatórios e artigos selecionados
              </small>
            </div>
          </div>
        `;
      } else {
        const artigos = this.estudoView?.artigosCatalogo?.() || carregarArtigosEstudo();
        const artigosNaPasta = artigos.filter(a => this.pastaAtivaId === 'compartilhados_comigo' ? a.compartilhadoComigo : artigoEstaNaPasta(a, this.pastaAtivaId));

        bannerEl.innerHTML = `
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
              ${svgIcone('livro', 20)}
            <div style="min-width:0;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:11px; font-weight:700; color:#64748B; text-transform:uppercase;">Pasta de Bibliografia:</span>
                <strong style="font-size:13.5px; color:#314F79; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${escapeHtml(pastaInfo.nome)}</strong>
                <span class="ath-badge ath-badge-info" style="font-size:10px;">${pastaInfo.origem === 'compartilhada' ? 'Compartilhada' : 'Minha Pasta'}</span>
              </div>
              <small style="font-size:11px; color:#64748B; display:block; margin-top:1px;">
                ${artigosNaPasta.length} artigo(s) / fichamento(s) nesta pasta · Mostrando apenas bibliografia selecionada
              </small>
            </div>
          </div>
        `;
      }
    }

  }
};

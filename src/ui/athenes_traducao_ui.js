// SPDX-License-Identifier: GPL-3.0-or-later
import { IDIOMAS_TRADUCAO, traduzirTextoAcademico } from '../core/athenes_traducao.js';
import { salvarArtigosEstudo } from './athenes_estudo_artigos_dados.js';
import { svgIcone } from './athenes_icones.js';

let balaoAtual = null;

function instalarRedimensionamento(balao, ret, signal) {
  const alca = balao.querySelector('.ath-traducao-redimensionar');
  const margem = 12;
  const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
  const posicionar = (x, y, w, h) => {
    balao.style.left = `${limitar(x, margem, innerWidth - w - margem)}px`;
    balao.style.top = `${limitar(y, margem, innerHeight - h - margem)}px`;
  };
  const inicial = balao.getBoundingClientRect();
  const alturaPrevista = Math.max(inicial.height, Math.min(420, innerHeight - 2 * margem));
  posicionar(ret.left, ret.bottom + 9, inicial.width, alturaPrevista);
  const posicao = balao.getBoundingClientRect();
  const ladoX = posicao.left + posicao.width / 2 > innerWidth / 2 ? -1 : 1;
  const ladoY = posicao.top + alturaPrevista / 2 > innerHeight / 2 ? -1 : 1;
  alca.classList.toggle('ath-traducao-alca-esquerda', ladoX < 0);
  alca.classList.toggle('ath-traducao-alca-topo', ladoY < 0);
  balao.classList.toggle('ath-traducao-reserva-topo', ladoY < 0);
  balao.classList.toggle('ath-traducao-reserva-esquerda', ladoX < 0);

  const dimensionar = (base, largura, altura) => {
    const maxW = Math.max(1, innerWidth - 2 * margem);
    const maxH = Math.max(1, innerHeight - 2 * margem);
    const w = limitar(largura, Math.min(250, maxW), maxW);
    const h = limitar(altura, Math.min(190, maxH), maxH);
    balao.classList.add('ath-traducao-ajustado');
    balao.style.width = `${w}px`;
    balao.style.height = `${h}px`;
    posicionar(ladoX < 0 ? base.right - w : base.left, ladoY < 0 ? base.bottom - h : base.top, w, h);
  };
  let arrasto = null;
  alca.addEventListener('pointerdown', e => {
    if (e.button !== 0 || arrasto) return;
    arrasto = { id: e.pointerId, x: e.clientX, y: e.clientY, base: balao.getBoundingClientRect() };
    alca.setPointerCapture(e.pointerId);
    alca.focus({ preventScroll: true });
    e.preventDefault();
  });
  alca.addEventListener('pointermove', e => {
    if (arrasto?.id !== e.pointerId) return;
    const { base, x, y } = arrasto;
    dimensionar(base, base.width + (e.clientX - x) * ladoX, base.height + (e.clientY - y) * ladoY);
  });
  alca.addEventListener('lostpointercapture', () => { arrasto = null; });
  alca.addEventListener('keydown', e => {
    const direcao = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!direcao) return;
    e.preventDefault();
    e.stopPropagation();
    const base = balao.getBoundingClientRect();
    dimensionar(base, base.width + direcao[0] * ladoX * 24, base.height + direcao[1] * ladoY * 24);
  });
  window.addEventListener('resize', () => {
    const base = balao.getBoundingClientRect();
    posicionar(base.left, base.top, base.width, base.height);
  }, { signal });
  const observador = new ResizeObserver(() => {
    const base = balao.getBoundingClientRect();
    posicionar(base.left, base.top, base.width, base.height);
  });
  observador.observe(balao);
  signal.addEventListener('abort', () => observador.disconnect(), { once: true });
}

export function salvarTraducaoComoNota(view, root, art, original, traduzido, destino) {
  const nota = `Tradução para ${IDIOMAS_TRADUCAO[destino]}\n${traduzido}\n\nOriginal: ${original}`;
  if (!Array.isArray(art.pinnedNotes)) art.pinnedNotes = [];
  art.pinnedNotes.push(nota);
  if (!art.fichamento || typeof art.fichamento !== 'object') art.fichamento = {};
  art.fichamento.metodologiaNotas = [art.fichamento.metodologiaNotas, nota].filter(Boolean).join('\n\n');
  art.atualizadoEm = new Date().toISOString();
  art.fichamento.atualizadoEm = art.atualizadoEm;
  const campo = root?.querySelector?.('#athEstudoMetodoNotas');
  if (campo) campo.value = art.fichamento.metodologiaNotas;
  salvarArtigosEstudo(view.artigos, art);
  view.registrarSnapshotArtigo?.(art);
  return nota;
}

export function mostrarBalaoTraducao({ texto, destino = 'pt', ancora, aoSalvarNota }) {
  balaoAtual?.fechar();
  const controlador = new AbortController();
  const balao = document.createElement('section');
  balao.className = 'ath-traducao-balao';
  balao.setAttribute('role', 'status');
  balao.innerHTML = `
    <div class="ath-traducao-cabecalho"><span>${svgIcone('globo', 15)} Tradução · ${IDIOMAS_TRADUCAO[destino]}</span><button type="button" class="ath-traducao-fechar" aria-label="Fechar tradução">${svgIcone('fechar', 15)}</button></div>
    <p class="ath-traducao-original"></p>
    <p class="ath-traducao-motor" aria-live="polite"></p>
    <div class="ath-traducao-resultado" aria-live="polite">Traduzindo…</div>
    <div class="ath-traducao-acoes"><button type="button" data-acao="copiar" disabled>${svgIcone('copiar', 14)} Copiar tradução</button><button type="button" data-acao="nota" disabled>${svgIcone('mais', 14)} Inserir no fichamento</button></div>
    <button type="button" class="ath-traducao-redimensionar" aria-label="Redimensionar painel de tradução" title="Arraste ou use as setas do teclado para ajustar o tamanho"></button>`;
  balao.querySelector('.ath-traducao-original').textContent = texto;
  const ret = ancora?.getBoundingClientRect?.() || ancora || { left: 16, bottom: 70 };
  document.body.append(balao);
  instalarRedimensionamento(balao, ret, controlador.signal);
  let traduzido = '';
  const fechar = () => { controlador.abort(); balao.remove(); if (balaoAtual?.elemento === balao) balaoAtual = null; };
  const painel = { fechar, elemento: balao };
  balaoAtual = painel;
  balao.querySelector('.ath-traducao-fechar').addEventListener('click', fechar);
  balao.querySelector('[data-acao="copiar"]').addEventListener('click', async ev => {
    if (!traduzido) return;
    await navigator.clipboard.writeText(traduzido);
    ev.currentTarget.textContent = 'Copiado';
  });
  balao.querySelector('[data-acao="nota"]').addEventListener('click', ev => {
    if (!traduzido) return;
    aoSalvarNota?.(traduzido);
    ev.currentTarget.textContent = 'Salvo no fichamento';
    ev.currentTarget.disabled = true;
  });
  traduzirTextoAcademico(texto, {
    destino, signal: controlador.signal,
    aoMotor: motor => {
      if (balao.isConnected) balao.querySelector('.ath-traducao-motor').textContent =
        motor === 'basico' ? 'Modo gratuito com limite diário de uso.' : motor === 'local' ? 'Tradução local no navegador.' : '';
    }
  }).then(resultado => {
    if (!balao.isConnected) return;
    traduzido = resultado;
    balao.querySelector('.ath-traducao-resultado').textContent = resultado;
    balao.querySelectorAll('.ath-traducao-acoes button').forEach(botao => { botao.disabled = false; });
  }).catch(erro => {
    if (controlador.signal.aborted) return;
    balao.querySelector('.ath-traducao-resultado').textContent = erro.message || 'Não foi possível traduzir.';
  });
  return painel;
}

export function configurarTraducaoEstudio(view, root, art) {
  const botao = root.querySelector('#athBtnTraduzirPagina');
  const idioma = root.querySelector('#athIdiomaTraducao');
  if (!botao || !idioma) return;
  botao.addEventListener('click', async () => {
    const pagina = root.querySelector(`.ath-pdf-folha-container[data-num-pagina="${view.paginaAtual}"]`);
    if (!pagina) return;
    const anterior = pagina.querySelector('.ath-pdf-traducao-pagina');
    if (anterior) { anterior.controladorTraducao?.abort(); anterior.remove(); botao.setAttribute('aria-pressed', 'false'); return; }
    const controlador = new AbortController();
    const camadaTexto = pagina.querySelector('.ath-pdf-folha-texto');
    const texto = camadaTexto?.classList.contains('ath-pdf-text-layer')
      ? [...camadaTexto.querySelectorAll('span')].map(el => el.textContent).filter(Boolean).join(' ')
      : camadaTexto?.innerText?.trim();
    const painel = document.createElement('div');
    painel.className = 'ath-pdf-traducao-pagina';
    painel.controladorTraducao = controlador;
    painel.innerHTML = `<div class="ath-pdf-traducao-topo"><strong>${svgIcone('globo', 16)} Página ${view.paginaAtual} · ${IDIOMAS_TRADUCAO[idioma.value]}</strong><button type="button">Ver original</button></div><p class="ath-traducao-motor" aria-live="polite"></p><div class="ath-pdf-traducao-corpo" aria-live="polite">Traduzindo página…</div>`;
    pagina.append(painel);
    botao.setAttribute('aria-pressed', 'true');
    const fechar = () => { controlador.abort(); painel.remove(); botao.setAttribute('aria-pressed', 'false'); };
    painel.querySelector('button').addEventListener('click', fechar);
    if (!texto) { painel.querySelector('.ath-pdf-traducao-corpo').textContent = 'Esta página não contém texto selecionável para traduzir.'; return; }
    try {
      const traduzido = await traduzirTextoAcademico(texto, {
        destino: idioma.value,
        signal: controlador.signal,
        aoMotor: motor => {
          if (painel.isConnected) painel.querySelector('.ath-traducao-motor').textContent =
            motor === 'basico' ? 'Modo gratuito com limite diário de uso.' : motor === 'local' ? 'Tradução local no navegador.' : '';
        },
        aoProgresso: (concluidos, total) => {
          if (painel.isConnected && total > 1) painel.querySelector('.ath-pdf-traducao-corpo').textContent = `Traduzindo página… ${concluidos}/${total} trechos`;
        }
      });
      if (painel.isConnected) painel.querySelector('.ath-pdf-traducao-corpo').textContent = traduzido;
    } catch (erro) {
      if (painel.isConnected && !controlador.signal.aborted) painel.querySelector('.ath-pdf-traducao-corpo').textContent = erro.message || 'Não foi possível traduzir esta página.';
    }
  });

  // Seleções em campos e no resumo do fichamento também oferecem tradução contextual.
  const inspecao = root.querySelector('#athEstudioColDir');
  let acao = null;
  const mostrarAcao = () => {
    acao?.remove(); acao = null;
    const ativo = document.activeElement;
    let texto = '';
    let ancora = null;
    if (ativo?.matches?.('textarea, input[type="text"]') && inspecao.contains(ativo)) {
      texto = ativo.value.slice(ativo.selectionStart, ativo.selectionEnd).trim();
      ancora = ativo.getBoundingClientRect();
    } else {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && inspecao.contains(sel.anchorNode)) {
        texto = sel.toString().trim();
        ancora = sel.getRangeAt(0).getBoundingClientRect();
      }
    }
    if (texto.length < 2) return;
    acao = document.createElement('button');
    acao.type = 'button';
    acao.className = 'ath-traducao-acao-flutuante';
    acao.innerHTML = `${svgIcone('globo', 14)} Traduzir seleção`;
    acao.style.left = `${Math.max(12, Math.min(window.innerWidth - 180, ancora.left))}px`;
    acao.style.top = `${Math.max(12, ancora.top - 40)}px`;
    document.body.append(acao);
    acao.addEventListener('pointerdown', ev => ev.preventDefault());
    acao.addEventListener('click', () => {
      mostrarBalaoTraducao({ texto, destino: idioma.value, ancora: acao, aoSalvarNota: resultado => salvarTraducaoComoNota(view, root, art, texto, resultado, idioma.value) });
      acao.remove(); acao = null;
    });
  };
  inspecao.addEventListener('mouseup', mostrarAcao);
  inspecao.addEventListener('pointerup', ev => { if (ev.pointerType !== 'mouse') setTimeout(mostrarAcao, 120); });
  inspecao.addEventListener('keyup', mostrarAcao);
  inspecao.addEventListener('select', mostrarAcao, true);
  let selecaoTimer = null;
  const verificarSelecaoInspetor = () => {
    clearTimeout(selecaoTimer);
    selecaoTimer = setTimeout(mostrarAcao, 120);
  };
  document.addEventListener('selectionchange', verificarSelecaoInspetor);
  root.addEventListener('pointerdown', ev => { if (acao && !ev.target.closest('.ath-traducao-acao-flutuante')) { acao.remove(); acao = null; } });
  return () => {
    document.removeEventListener('selectionchange', verificarSelecaoInspetor);
    clearTimeout(selecaoTimer);
    acao?.remove();
    balaoAtual?.remove();
    balaoAtual = null;
  };
}

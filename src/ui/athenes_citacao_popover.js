// SPDX-License-Identifier: GPL-3.0-or-later
/** Controles de citação exibidos apenas no editor, sem afetar a página exportada. */
import { ESTILOS_CITACAO, eEstiloNumerico, estiloDoDocumento, formatarCitacaoTexto, indiceNaLista } from '../core/athenes_citacao.js';

let fecharAtual = null;

export function fecharPopoverCitacao() {
  fecharAtual?.();
  fecharAtual = null;
}

export function abrirPopoverCitacao({ ancora, referencia, doc, aoAplicar }) {
  fecharPopoverCitacao();
  const estiloDoc = estiloDoDocumento(doc).estilo;
  const estiloInicial = ancora.dataset.citEstilo || (estiloDoc === 'zotero' ? 'abnt' : estiloDoc);
  const formatoInicial = ancora.dataset.citFormato || (/^\(/.test(ancora.textContent.trim()) ? 'parentese' : 'narrativa');
  const paginaInicial = ancora.dataset.citPagina || /\bp\.\s*([\d\u2013\-]+)/i.exec(ancora.textContent)?.[1] || '';
  const painel = document.createElement('div');
  painel.className = 'ath-citacao-popover';
  painel.setAttribute('role', 'dialog');
  painel.setAttribute('aria-label', 'Editar citação');
  const topo = document.createElement('div');
  topo.className = 'ath-citacao-popover-topo';
  const titulo = document.createElement('strong');
  titulo.textContent = 'Editar citação';
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'ath-citacao-popover-fechar';
  fechar.setAttribute('aria-label', 'Fechar');
  fechar.textContent = '×';
  topo.append(titulo, fechar);
  const obra = document.createElement('p');
  obra.className = 'ath-citacao-popover-obra';
  obra.textContent = referencia.titulo || 'Referência sem título';
  const formulario = document.createElement('form');
  formulario.innerHTML = '<label>Formato <select name="formato"><option value="parentese">Entre parênteses</option><option value="narrativa">No texto (narrativa)</option></select></label><label>Estilo <select name="estilo"></select></label><label>Página citada <input name="pagina" type="text" inputmode="text" placeholder="Opcional" maxlength="40"></label><div class="ath-citacao-popover-previa" aria-live="polite"></div><button type="submit" class="ath-citacao-popover-aplicar">Aplicar</button>';
  const estiloEl = formulario.elements.estilo;
  for (const estilo of ESTILOS_CITACAO.filter(e => !e.externo)) {
    estiloEl.add(new Option(estilo.rotulo, estilo.id));
  }
  estiloEl.value = estiloInicial === 'zotero' ? 'abnt' : estiloInicial;
  formulario.elements.formato.value = formatoInicial;
  formulario.elements.pagina.value = paginaInicial;
  const atualizarPrevia = () => {
    const formato = formulario.elements.formato.value;
    const estilo = estiloEl.value;
    formulario.elements.formato.disabled = eEstiloNumerico(estilo);
    formulario.querySelector('.ath-citacao-popover-previa').textContent = formatarCitacaoTexto(referencia, {
      estilo, formato, pagina: formulario.elements.pagina.value.trim(), indice: indiceNaLista(doc, referencia)
    });
  };
  formulario.addEventListener('input', atualizarPrevia);
  formulario.addEventListener('change', atualizarPrevia);
  formulario.addEventListener('submit', ev => {
    ev.preventDefault();
    aoAplicar({ estilo: estiloEl.value, formato: formulario.elements.formato.value, pagina: formulario.elements.pagina.value.trim() });
    fecharPopoverCitacao();
  });
  painel.append(topo, obra, formulario);
  document.body.appendChild(painel);
  const r = ancora.getBoundingClientRect();
  const w = painel.offsetWidth;
  const h = painel.offsetHeight;
  painel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  painel.style.top = `${r.bottom + h + 8 <= window.innerHeight ? r.bottom + 8 : Math.max(8, r.top - h - 8)}px`;
  const fora = ev => { if (!painel.contains(ev.target) && !ancora.contains(ev.target)) fecharPopoverCitacao(); };
  const escape = ev => { if (ev.key === 'Escape') fecharPopoverCitacao(); };
  fecharAtual = () => {
    document.removeEventListener('pointerdown', fora, true);
    document.removeEventListener('keydown', escape, true);
    painel.remove();
  };
  fechar.addEventListener('click', fecharPopoverCitacao);
  document.addEventListener('pointerdown', fora, true);
  document.addEventListener('keydown', escape, true);
  atualizarPrevia();
  estiloEl.focus();
  return painel;
}

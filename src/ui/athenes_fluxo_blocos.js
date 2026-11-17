// SPDX-License-Identifier: GPL-3.0-or-later

const SVG = 'http://www.w3.org/2000/svg';
const ponto = (x, y) => ({ x, y });
let contador = 0;

function caminhoArredondado(pontos) {
  const vertices = pontos.filter((p, i) => !i || p.x !== pontos[i - 1].x || p.y !== pontos[i - 1].y);
  const coord = p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const aproximar = (origem, destino, d) => {
    const proporcao = d / distancia(origem, destino);
    return ponto(origem.x + (destino.x - origem.x) * proporcao, origem.y + (destino.y - origem.y) * proporcao);
  };
  let d = `M ${coord(vertices[0])}`;
  for (let i = 1; i < vertices.length - 1; i++) {
    const anterior = vertices[i - 1], atual = vertices[i], seguinte = vertices[i + 1];
    const raio = Math.min(8, distancia(anterior, atual) / 2, distancia(atual, seguinte) / 2);
    d += ` L ${coord(aproximar(atual, anterior, raio))} Q ${coord(atual)} ${coord(aproximar(atual, seguinte, raio))}`;
  }
  return `${d} L ${coord(vertices.at(-1))}`;
}

function rota(a, b) {
  const porta = (caixa, lado) => (caixa.top + caixa.bottom) / 2 + lado * Math.min(5, (caixa.bottom - caixa.top) / 5);
  const yA = porta(a, 1), yB = porta(b, -1);
  const mesmaFolha = a.folha === b.folha;
  const paraDireita = a.right < b.left;
  const paraEsquerda = b.right < a.left;
  const ladoALado = a.top < b.bottom && b.top < a.bottom;
  if (mesmaFolha && (paraDireita || paraEsquerda) && (ladoALado || (a.grupo && a.grupo === b.grupo))) {
    const inicio = paraDireita ? a.right + 1 : a.left - 1;
    const fim = paraDireita ? b.left - 1 : b.right + 1;
    const meio = (inicio + fim) / 2;
    return [ponto(inicio, yA), ponto(meio, yA), ponto(meio, yB), ponto(fim, yB)];
  }

  if (mesmaFolha && Math.abs(a.left - b.left) < 1 && a.right === b.right) {
    const x = a.left - (a.left <= a.linha.left + 1 && b.left <= b.linha.left + 1 ? 14 : 8);
    return [ponto(a.left - 2, yA), ponto(x, yA), ponto(x, yB), ponto(b.left - 2, yB)];
  }

  if (a.faixa && b.faixa && a.faixa !== b.faixa) {
    // As mudanças de coluna acontecem no vão entre faixas, sem cruzar a área de texto.
    const portaLateral = (caixa, y) => {
      const direita = caixa.right >= caixa.faixa.right - 1 && caixa.left > caixa.faixa.left + 1;
      const borda = direita ? caixa.right : caixa.left;
      const lado = direita ? 1 : -1;
      return { porta: ponto(borda + lado * 2, y), corredor: borda + lado * 6 };
    };
    const inicio = portaLateral(a, yA);
    const fim = portaLateral(b, yB);
    const y = (a.faixa.bottom + b.faixa.top) / 2;
    return [inicio.porta, ponto(inicio.corredor, yA), ponto(inicio.corredor, y),
      ponto(fim.corredor, y), ponto(fim.corredor, yB), fim.porta];
  }

  const x = Math.min(a.linha.left, b.linha.left) - 14;
  const destino = ponto(b.left - 2, yB);
  if (a.left <= a.linha.left + 1) {
    return [ponto(a.left - 2, yA), ponto(x, yA), ponto(x, yB), destino];
  }

  // Sai do último bloco da linha pelo vão abaixo das colunas e segue pela margem.
  const saida = Math.min(a.right - 3, a.left + 12);
  const limite = mesmaFolha ? b.linha.top : a.folha.bottom;
  const y = a.linha.bottom + Math.max(2, Math.min(10, (limite - a.linha.bottom) / 2));
  return [ponto(saida, a.bottom), ponto(saida, y), ponto(x, y), ponto(x, yB), destino];
}

/** Desenha o fluxo na camada do editor a partir da ordem das páginas, sem tocar no documento. */
export function montarFluxoDeBlocos(palco, entradas, grades) {
  if (entradas.length < 2) return null;
  const svg = document.createElementNS(SVG, 'svg');
  const seta = `ath-fluxo-seta-${++contador}`;
  svg.classList.add('ath-fluxo-blocos');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs><marker id="${seta}" markerWidth="6" markerHeight="7" refX="5" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1.3 4.6 3.5 1 5.7" class="ath-fluxo-ponta"/></marker></defs><g></g>`;
  const grupo = svg.lastElementChild;
  palco.appendChild(svg);

  let frame = null;
  const redesenhar = () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const palcoRect = palco.getBoundingClientRect();
      const dx = palco.scrollLeft - palcoRect.left - palco.clientLeft;
      const dy = palco.scrollTop - palcoRect.top - palco.clientTop;
      const folhas = new Map(), linhas = new Map(), faixas = new Map();
      const caixas = entradas.map(({ el, bloco, folha }) => {
        if (!folhas.has(folha)) folhas.set(folha, { bottom: folha.getBoundingClientRect().bottom + dy });
        const r = el.getBoundingClientRect();
        const elFaixa = el.closest('.ath-encaixe-faixa');
        if (elFaixa && !faixas.has(elFaixa)) {
          const rf = elFaixa.getBoundingClientRect();
          faixas.set(elFaixa, { left: rf.left + dx, right: rf.right + dx, top: rf.top + dy, bottom: rf.bottom + dy });
        }
        const caixa = { id: bloco._frag?.origemId || bloco.id, grupo: bloco.grupo, folha: folhas.get(folha),
          faixa: faixas.get(elFaixa),
          left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy };
        const chave = bloco.grupo ? `${folha.dataset.paginaId}:${bloco.grupo}` : el;
        if (!linhas.has(chave)) linhas.set(chave, { left: caixa.left, top: caixa.top, bottom: caixa.bottom });
        const linha = linhas.get(chave);
        linha.left = Math.min(linha.left, caixa.left);
        linha.top = Math.min(linha.top, caixa.top);
        linha.bottom = Math.max(linha.bottom, caixa.bottom);
        caixa.linha = linha;
        return caixa;
      });
      const caminhos = [];
      for (let i = 1; i < caixas.length; i++) {
        const a = caixas[i - 1], b = caixas[i];
        if (a.id === b.id) continue;
        const path = document.createElementNS(SVG, 'path');
        path.setAttribute('d', caminhoArredondado(rota(a, b)));
        path.setAttribute('marker-end', `url(#${seta})`);
        caminhos.push(path);
      }
      grupo.replaceChildren(...caminhos);
    });
  };
  const observer = new ResizeObserver(redesenhar);
  observer.observe(palco);
  grades.forEach(grade => observer.observe(grade));
  palco.addEventListener('input', redesenhar);
  redesenhar();

  return {
    redesenhar,
    destruir() {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      palco.removeEventListener('input', redesenhar);
      svg.remove();
    }
  };
}

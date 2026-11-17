// SPDX-License-Identifier: GPL-3.0-or-later

export function fluxoColunasAtivo(doc, mestra) {
  return doc?.fluxo_colunas === true && mestra?.modo_aplicacao !== 'fixa' && Number(mestra?.grade?.colunas || 1) === 1;
}

export function intervaloDoBloco(bloco) {
  const inteiro = (valor, padrao) => Number.isFinite(Number(valor)) ? Math.trunc(Number(valor)) : padrao;
  const inicio = Math.max(1, Math.min(12, inteiro(bloco.col || 1, 1)));
  const span = Math.max(1, Math.min(13 - inicio, inteiro(bloco.span || 12, 12)));
  return { inicio, fim: inicio + span };
}

export function larguraDoBlocoNoFluxo(bloco, larguraPt, gapPt) {
  const { inicio, fim } = intervaloDoBloco(bloco);
  const span = fim - inicio;
  return Math.max(1, (larguraPt - 11 * gapPt) * span / 12 + (span - 1) * gapPt);
}

/** Uma faixa contém colunas com intervalos disjuntos. Um conflito de largura abre outra faixa. */
export function criarFluxoDeColunas() {
  const faixas = [];
  let alturaDasFaixasAnteriores = 0;
  let alturaDaFaixa = 0;
  return {
    faixas,
    posicionar(bloco, altura = 0, simular = false) {
      const { inicio, fim } = intervaloDoBloco(bloco);
      const atual = faixas.at(-1);
      const sobreposta = atual?.find(c => inicio < c.fim && fim > c.inicio);
      const mesmaColuna = sobreposta?.inicio === inicio && sobreposta.fim === fim;
      const novaFaixa = !atual || (sobreposta && !mesmaColuna) || (inicio === 1 && fim === 13);
      const topo = alturaDasFaixasAnteriores + (novaFaixa ? alturaDaFaixa : 0);
      const baseColuna = (!novaFaixa && mesmaColuna ? sobreposta.altura : 0) + altura;
      const totalFaixa = Math.max(novaFaixa ? 0 : alturaDaFaixa, baseColuna);
      if (!simular) {
        if (novaFaixa) faixas.push([]);
        const coluna = !novaFaixa && mesmaColuna ? sobreposta : { inicio, fim, altura: 0, blocos: [] };
        if (coluna !== sobreposta) faixas.at(-1).push(coluna);
        coluna.blocos.push(bloco);
        coluna.altura = baseColuna;
        alturaDasFaixasAnteriores = topo;
        alturaDaFaixa = totalFaixa;
      }
      return { fimDoBloco: topo + baseColuna, alturaTotal: topo + totalFaixa };
    }
  };
}

export function faixasDoFluxo(blocos) {
  const fluxo = criarFluxoDeColunas();
  for (const bloco of blocos) fluxo.posicionar(bloco);
  return fluxo.faixas;
}

// SPDX-License-Identifier: GPL-3.0-or-later
/** Colunas internas de um único bloco de texto, iguais na folha e no PDF. */
export function normalizarColunasTexto(bloco = {}) {
  const n = Number(bloco.colunas_texto);
  const gap = Number(bloco.espaco_colunas_mm);
  return {
    colunas: Number.isFinite(n) ? Math.min(3, Math.max(1, Math.round(n))) : 1,
    espacoMm: Number.isFinite(gap) ? Math.min(20, Math.max(0, gap)) : 5
  };
}

export function cssColunasTexto(bloco) {
  const { colunas, espacoMm } = normalizarColunasTexto(bloco);
  return colunas > 1 ? `column-count:${colunas};column-gap:${espacoMm}mm;column-fill:balance;` : '';
}

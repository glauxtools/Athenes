// SPDX-License-Identifier: GPL-3.0-or-later
import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRESETS_VARIAVEIS_REFERENCIA,
  slugVariavel,
  campoIdVariavel,
  normalizarMapaVariaveis,
  obterCatalogoVariaveis,
  salvarCatalogoVariaveis,
  registrarVariavelNoCatalogo,
  definirVariavelNoArtigo,
  removerVariavelDoArtigo,
  obterNomeCorCapa,
  artigoFoiLido,
  ehArtigoLidoSimNao
} from '../src/core/athenes_variaveis_referencia.js';

import { coletarIdsDescendentesPasta, artigoEstaNasPastas } from '../src/core/athenes_zotero_pastas.js';
import { registrosReferencias, camposRelacoesComVariaveis } from '../src/core/athenes_relacoes.js';
import {
  analyzeRelations,
  evaluateFilterChain,
  computeConnectionChain
} from '../src/relations/analysis.js';
import {
  renderRelations,
  isFixedLayout,
  sortStageNodes
} from '../src/relations/render.js';
import { installRelationDrag } from '../src/relations/drag.js';
import { renderizarFolhaInterna } from '../src/ui/athenes_estudo_artigos_estante.js';

describe('Variáveis personalizadas, filtros combinados e gráficos de relações fixos', () => {
  it('1. Variáveis: slug seguro contra prototype pollution, catálogo, definição e remoção', () => {
    assert.equal(slugVariavel('__proto__'), '');
    assert.equal(slugVariavel('constructor'), '');
    assert.equal(slugVariavel('prototype'), '');
    assert.equal(campoIdVariavel('Triagem (Inclusão / Exclusão)'), 'var:triagem_inclusao_exclusao');

    const perigoso = JSON.parse('{"__proto__":{"polluted":true},"Triagem":"Incluído","constructor":"bad","  ":""}');
    const limpo = normalizarMapaVariaveis(perigoso);
    assert.equal(Object.prototype.polluted, undefined);
    assert.deepEqual(Object.keys(limpo), ['Triagem']);

    const art = { id: 'a1', titulo: 'Obra A' };
    assert.equal(definirVariavelNoArtigo(art, 'Triagem', 'Incluído'), true);
    assert.equal(art.variaveisPersonalizadas.Triagem, 'Incluído');
    assert.ok(art.atualizadoEm);

    const def = registrarVariavelNoCatalogo(PRESETS_VARIAVEIS_REFERENCIA[0], [art]);
    assert.equal(def.opcoes.includes('Excluído'), true);

    const catalogo = obterCatalogoVariaveis([art]);
    assert.ok(catalogo.some(c => c.nome === 'Triagem' || c.opcoes.includes('Incluído')));

    assert.equal(removerVariavelDoArtigo(art, 'Triagem'), true);
    assert.deepEqual(art.variaveisPersonalizadas, {});
    salvarCatalogoVariaveis([]);
  });

  it('2. Metadados Athenes: cor da capa, lido/não lido, variáveis e pastas recursivas', () => {
    assert.equal(obterNomeCorCapa('#314F79'), 'Azul');
    assert.equal(obterNomeCorCapa('#FF6B2C'), 'Laranja');
    assert.equal(obterNomeCorCapa('#1e5641'), 'Verde');

    const pastas = [
      {
        id: 'p_raiz',
        nome: 'Mestrado',
        subpastas: [
          { id: 'p_sub1', nome: 'Acústica', subpastas: [{ id: 'p_neto', nome: 'Teatros', subpastas: [] }] }
        ]
      },
      { id: 'p_outra', nome: 'Outras', subpastas: [] }
    ];
    const desc = coletarIdsDescendentesPasta(pastas, 'p_raiz');
    assert.deepEqual([...desc], ['p_raiz', 'p_sub1', 'p_neto']);

    const artigos = [
      {
        id: '1',
        titulo: 'Teatro A',
        autores: ['Silva'],
        ano: 2024,
        pastaId: 'p_neto',
        corCapa: '#1E5641',
        statusLeitura: 'fichado',
        variaveisPersonalizadas: { Triagem: 'Incluído' }
      },
      {
        id: '2',
        titulo: 'Teatro B',
        autores: ['Souza'],
        ano: 2025,
        pastaId: 'p_sub1',
        corCapa: '#FF6B2C',
        statusLeitura: 'nao_lido',
        variaveisPersonalizadas: { Triagem: 'Excluído' }
      },
      {
        id: '3',
        titulo: 'Teatro C',
        autores: ['Lima'],
        ano: 2026,
        pastaId: 'p_outra',
        corCapa: '#1E5641',
        statusLeitura: 'fichado',
        variaveisPersonalizadas: { Triagem: 'Incluído' }
      }
    ];

    assert.equal(artigoFoiLido(artigos[0]), 'Lido');
    assert.equal(ehArtigoLidoSimNao(artigos[0]), 'Sim');
    assert.equal(ehArtigoLidoSimNao(artigos[1]), 'Não');

    const filtradosComSub = artigos.filter(a => artigoEstaNasPastas(a, ['p_raiz'], { pastas, incluirSubpastas: true }));
    assert.deepEqual(filtradosComSub.map(a => a.id), ['1', '2']);
    const filtradosSemSub = artigos.filter(a => artigoEstaNasPastas(a, ['p_raiz'], { pastas, incluirSubpastas: false }));
    assert.equal(filtradosSemSub.length, 0);

    const campos = camposRelacoesComVariaveis(artigos);
    assert.ok(campos.some(c => c.id === 'corCapa'));
    assert.ok(campos.some(c => c.id === 'lido'));
    assert.ok(campos.some(c => c.id === 'var:triagem'));

    const recs = registrosReferencias(artigos, { pastas });
    assert.equal(recs[0].fields.corCapa, 'Verde');
    assert.equal(recs[0].fields.lido, 'Sim');
    assert.equal(recs[0].fields.folder[0], 'Teatros');
    assert.equal(recs[0].fields['var:triagem'], 'Incluído');
  });

  it('3. Cadeia de filtros (E / OU): combina inclusão/exclusão, cor e status lido', () => {
    const rows = [
      { id: '1', fields: { author: 'Ana', theme: 'Acústica', year: '2024', corCapa: 'Azul', lido: 'Sim', 'var:triagem': 'Incluído' } },
      { id: '2', fields: { author: 'Bia', theme: 'Acústica', year: '2025', corCapa: 'Laranja', lido: 'Sim', 'var:triagem': 'Excluído' } },
      { id: '3', fields: { author: 'Caio', theme: 'Acústica', year: '2026', corCapa: 'Azul', lido: 'Não', 'var:triagem': 'Incluído' } }
    ];

    const graphAnd = analyzeRelations(rows, {
      stages: ['author', 'theme', 'year'],
      filterCombinator: 'and',
      filters: [
        { field: 'var:triagem', operator: 'neq', values: ['Excluído'] },
        { field: 'lido', operator: 'eq', values: ['Sim'] },
        { field: 'corCapa', operator: 'eq', values: ['Azul'] }
      ]
    });
    assert.equal(graphAnd.stats.processed, 1);
    assert.equal(graphAnd.stats.filteredOut, 2);
    assert.ok(graphAnd.nodes.some(n => n.label === 'Ana'));
    assert.ok(!graphAnd.nodes.some(n => n.label === 'Bia'));

    assert.equal(
      evaluateFilterChain(rows[1], [
        { field: 'corCapa', operator: 'eq', values: ['Azul'] },
        { field: 'lido', operator: 'eq', values: ['Sim'] }
      ], 'or'),
      true
    );
  });

  it('4. Sankey / Temporal fixo: ordenação por coluna, fitas preenchidas e bloqueio de arrasto solto', () => {
    assert.equal(isFixedLayout('sankey'), true);
    assert.equal(isFixedLayout('temporal'), true);
    assert.equal(isFixedLayout('force'), false);

    const nodesUnsorted = [
      { id: 'b', label: 'Beta', value: 2 },
      { id: 'a', label: 'Alfa', value: 8 },
      { id: 'y1', label: '2020', value: 1 }
    ];
    assert.deepEqual(sortStageNodes(nodesUnsorted, 'alpha_asc').map(n => n.label), ['2020', 'Alfa', 'Beta']);
    assert.deepEqual(sortStageNodes(nodesUnsorted, 'alpha_desc').map(n => n.label), ['Beta', 'Alfa', '2020']);
    assert.deepEqual(sortStageNodes(nodesUnsorted, 'freq_desc').map(n => n.label), ['Alfa', 'Beta', '2020']);
    assert.deepEqual(sortStageNodes(nodesUnsorted, 'freq_asc').map(n => n.label), ['2020', 'Beta', 'Alfa']);
    assert.deepEqual(sortStageNodes(nodesUnsorted, 'num_desc').map(n => n.label), ['2020', 'Beta', 'Alfa']);

    const rows = [
      { id: 'r1', fields: { author: 'Ana', theme: 'T1', year: '2026' } },
      { id: 'r2', fields: { author: 'Ana', theme: 'T2', year: '2024' } },
      { id: 'r3', fields: { author: 'Bruno', theme: 'T1', year: '2022' } }
    ];
    const g = analyzeRelations(rows, {
      stages: ['author', 'theme', 'year'],
      stageOrders: ['alpha_asc', 'freq_desc', 'num_asc'],
      yearField: 'year'
    });
    const svg = renderRelations(g, { layout: 'sankey' });
    assert.match(svg, /class="rel-edge rel-ribbon"/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);

    const listeners = {};
    const mockViewport = {
      addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
      removeEventListener() {},
      setPointerCapture() {},
      hasPointerCapture: () => false
    };
    const fakeNode = { dataset: { relationNode: g.nodes[0].id }, setAttribute() {}, querySelector: () => null };
    const mockDrawing = {
      querySelector: () => null,
      querySelectorAll: () => []
    };
    const drag = installRelationDrag(mockViewport, mockDrawing, { layout: () => 'sankey' });
    let dispatched = false;
    fakeNode.dispatchEvent = () => { dispatched = true; };
    const targetNodeEvt = { button: 0, pointerId: 1, clientX: 10, clientY: 10, target: { closest: sel => sel === '[data-relation-node]' ? fakeNode : null }, preventDefault() {} };
    listeners.pointerdown[0](targetNodeEvt);
    listeners.pointermove[0]({ pointerId: 1, clientX: 60, clientY: 80 });
    assert.equal(fakeNode.attributes, undefined); // sem transform translate aplicado
    listeners.pointerup[0]({ pointerId: 1, type: 'pointerup' });
    assert.equal(dispatched, false, 'arrastar longo em layout fixo não altera transform');
    listeners.pointerdown[0](targetNodeEvt);
    listeners.pointerup[0]({ pointerId: 1, type: 'pointerup' });
    assert.equal(dispatched, true, 'clique simples em layout fixo dispara relation-select');
    drag.destroy();
  });

  it('5. Cadeia completa de conexões ao clicar e layout tree / arc / LOD sem bugs', () => {
    const rows = [
      { id: 'p1', fields: { author: 'Ana', theme: 'Salas', year: '2024' } },
      { id: 'p2', fields: { author: 'Bruno', theme: 'Salas', year: '2025' } }
    ];
    const g = analyzeRelations(rows, { stages: ['author', 'theme', 'year'] });
    const anaNode = g.nodes.find(n => n.label === 'Ana');
    const chain = computeConnectionChain(g, { type: 'node', id: anaNode.id });
    const labelsNaCadeia = chain.connectedNodes.map(n => n.label).sort();
    assert.deepEqual(labelsNaCadeia, ['2024', 'Ana', 'Salas'], 'Cadeia deve seguir somente a linhagem real do registro p1');

    const treeSvg = renderRelations(g, { layout: 'tree' });
    assert.doesNotMatch(treeSvg, /Q460 310/);
    assert.match(treeSvg, /data-relation-layout="tree"/);

    // Rede grande (>65 nós) mantém rótulos secundários .rel-label-detail para aparecer ao dar zoom
    const bigRows = Array.from({ length: 40 }, (_, i) => ({
      id: `b${i}`,
      fields: { author: `Autor_${i}`, theme: `Tema_${i}`, year: String(2000 + (i % 5)) }
    }));
    const bigGraph = analyzeRelations(bigRows, { stages: ['author', 'theme', 'year'] });
    const bigSvg = renderRelations(bigGraph, { layout: 'force', labels: true });
    assert.match(bigSvg, /class="rel-label rel-label-detail"/);
  });

  it('6. Livrinho 3D: virar para Página 2 (Variáveis), criar/selecionar variáveis e preservar Página 1', () => {
    salvarCatalogoVariaveis([]);
    const ref = {
      id: 'livro_var_1',
      titulo: 'Manual Acústica',
      autores: [{ sobrenome: 'Ribeiro' }],
      ano: 2026,
      statusLeitura: 'lendo',
      corCapa: '#314F79'
    };
    let atualizado = 0;
    const folha = renderizarFolhaInterna(ref, {
      onEditarMeta: () => {},
      onMoverPasta: () => {},
      onAtualizarVariaveis: () => { atualizado++; },
      obterCatalogoVariaveisFn: () => obterCatalogoVariaveis([ref])
    });

    // Preserva exatamente os seletores e quantidades canônicas na Página 1
    assert.equal(folha.querySelectorAll('.ath-status-btn').length, 3);
    assert.equal(folha.querySelectorAll('.ath-folha-cor-amostra').length, 6);
    assert.equal(folha.querySelectorAll('.ath-folha-acoes-secundarias button').length, 2);

    const pagFicha = folha.querySelector('[data-folha-pagina="ficha"]');
    const pagVars = folha.querySelector('[data-folha-pagina="variaveis"]');
    const btnProx = folha.querySelector('.ath-folha-pag-btn-prox');
    const btnAnt = folha.querySelector('.ath-folha-pag-btn-ant');
    assert.ok(pagFicha && pagVars && btnProx && btnAnt);
    assert.notEqual(pagFicha.style.display, 'none');
    assert.equal(pagVars.style.display, 'none');

    // Passar para Página 2 ("Variáveis")
    btnProx.dispatchEvent({ type: 'click', stopPropagation() {} });
    assert.equal(pagFicha.style.display, 'none');
    assert.notEqual(pagVars.style.display, 'none');

    // Usar preset + Triagem e escolher opção "Excluído"
    const presetTriagem = folha.querySelectorAll('.ath-folha-var-preset-btn')[0];
    presetTriagem.dispatchEvent({ type: 'click', stopPropagation() {} });
    const chips = folha.querySelectorAll('.ath-folha-var-chip');
    const chipExcluido = chips.find(c => c.textContent === 'Excluído');
    assert.ok(chipExcluido, 'Preset Triagem deve renderizar chip Excluído');
    chipExcluido.dispatchEvent({ type: 'click', stopPropagation() {} });
    assert.equal(ref.variaveisPersonalizadas['Triagem (Inclusão / Exclusão)'], 'Excluído');
    assert.equal(atualizado, 1);

    // Adicionar variável customizada nova
    const inputs = folha.querySelectorAll('.ath-folha-var-input');
    inputs[0].value = 'Amostra';
    inputs[1].value = '12 salas';
    inputs[2].value = '12 salas, 24 salas';
    const btnAdd = folha.querySelector('.ath-folha-var-btn-add');
    btnAdd.dispatchEvent({ type: 'click', stopPropagation() {} });
    assert.equal(ref.variaveisPersonalizadas.Amostra, '12 salas');
    assert.equal(atualizado, 2);

    // Voltar para Página 1 ("Ficha")
    btnAnt.dispatchEvent({ type: 'click', stopPropagation() {} });
    assert.notEqual(pagFicha.style.display, 'none');
    assert.equal(pagVars.style.display, 'none');
    salvarCatalogoVariaveis([]);
  });

  it('7. Livrinho 3D: aplicar variável para pasta atual ou pastas escolhidas', () => {
    salvarCatalogoVariaveis([]);
    const ref = { id: 'livro_p1', titulo: 'Artigo 1', pastaId: 'pasta_b' };
    const chamadas = [];
    const folha = renderizarFolhaInterna(ref, {
      pastaAtualId: 'pasta_a',
      obterPastasFn: () => [
        { id: 'pasta_a', nome: 'MESTRADO', nivel: 0, count: 10 },
        { id: 'pasta_b', nome: 'SCOPUS', nivel: 1, count: 4 }
      ],
      onAtualizarVariaveis: (_art, meta) => { chamadas.push(meta); }
    });

    folha.querySelector('.ath-folha-pag-btn-prox').dispatchEvent({ type: 'click', stopPropagation() {} });
    const selEscopo = folha.querySelector('.ath-folha-var-escopo');
    assert.ok(selEscopo, 'Seletor de escopo deve existir');

    // Escolher pasta atual
    selEscopo.value = 'pasta_atual';
    selEscopo.dispatchEvent({ type: 'change' });
    const inputs = folha.querySelectorAll('.ath-folha-var-input');
    inputs[0].value = 'Triagem';
    inputs[1].value = 'Pendente';
    folha.querySelector('.ath-folha-var-btn-add').dispatchEvent({ type: 'click', stopPropagation() {} });
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].escopo, 'pasta_atual');
    assert.deepEqual(chamadas[0].pastaIds, ['pasta_a']);
    assert.equal(chamadas[0].nome, 'Triagem');
    assert.equal(chamadas[0].valor, 'Pendente');

    // Escolher pastas específicas
    selEscopo.value = 'pastas';
    selEscopo.dispatchEvent({ type: 'change' });
    const checkboxes = folha.querySelectorAll('.ath-folha-var-pasta-item input');
    assert.equal(checkboxes.length, 2);
    assert.equal(checkboxes[0].checked, true); // pastaAtualId pré-marcada
    checkboxes[1].checked = true;
    inputs[0].value = 'Relevância';
    inputs[1].value = 'Alta';
    folha.querySelector('.ath-folha-var-btn-add').dispatchEvent({ type: 'click', stopPropagation() {} });
    assert.equal(chamadas.length, 2);
    assert.equal(chamadas[1].escopo, 'pastas');
    assert.deepEqual(chamadas[1].pastaIds, ['pasta_a', 'pasta_b']);
    assert.equal(chamadas[1].valor, 'Alta');
    salvarCatalogoVariaveis([]);
  });
});

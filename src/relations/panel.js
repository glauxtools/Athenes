// SPDX-License-Identifier: GPL-3.0-or-later
import {installRelationDrag} from './drag.js';
import {
  analyzeRelations,
  normalizeAnalysis,
  computeConnectionChain,
  STAGE_ORDER_OPTIONS,
  FILTER_OPERATORS
} from './analysis.js';
import {renderRelations,RELATION_LAYOUTS,normalizeRelationStyle,isFixedLayout,esc} from './render.js';
import {downloadSvg,downloadBlob} from './download.js';
import {downloadMenuMarkup,databaseIcon} from './controls.js';
import {
  PRESETS_VARIAVEIS_REFERENCIA,
  campoIdVariavel,
  obterCatalogoVariaveis,
  registrarVariavelNoCatalogo
} from '../core/athenes_variaveis_referencia.js';

const ZOOM_MIN=.12;
const ZOOM_MAX=25;
const clampZoom=z=>Math.min(ZOOM_MAX,Math.max(ZOOM_MIN,Number(z)||1));

const icon=path=>`<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${path}</svg>`;
const plus=icon('<path d="M10 4v12M4 10h12"/>'),close=icon('<path d="m5 5 10 10M15 5 5 15"/>');
const layoutIcon=id=>icon(['sankey','temporal'].includes(id)?'<path d="M3 3v14M17 3v14M4 5c6 0 6 10 12 10M4 15c6 0 6-10 12-10"/>':id==='arc'?'<path d="M3 15c0-13 14-13 14 0M7 15c0-7 6-7 6 0"/>':id==='clusters'?'<circle cx="5" cy="5" r="3"/><circle cx="15" cy="15" r="3"/><path d="m7 7 6 6"/>':'<circle cx="10" cy="10" r="2"/><circle cx="3" cy="4" r="1.5"/><circle cx="17" cy="4" r="1.5"/><circle cx="15" cy="17" r="1.5"/><path d="m4 5 5 4m2 0 5-4m-5 7 3 4"/>');
const opts=(values,selected)=>values.map(([id,label])=>`<option value="${esc(id)}" ${String(id)===String(selected)?'selected':''}>${esc(label)}</option>`).join('');

function groupedFieldOptions(fields=[],selected=''){
  const groups={variavel:[],athenes:[],meta:[]};
  for(const f of fields){
    const g=f.group==='variavel'?'variavel':(f.group==='athenes'?'athenes':'meta');
    groups[g].push(f);
  }
  const renderGrp=(titulo,itens)=>itens.length?`<optgroup label="${esc(titulo)}">${opts(itens.map(f=>[f.id,f.label]),selected)}</optgroup>`:'';
  return renderGrp('Variáveis personalizadas',groups.variavel)+renderGrp('Athenes (Leitura, Cor, Pastas)',groups.athenes)+renderGrp('Metadados da referência',groups.meta);
}

export function createRelationPanel(container,{sources=[],initial={},onSave,onInsert,onChange,onCreateVariable,onMutateRecordVariable,currentFolderId='todas',title='Análise de relações',readonly=false}={}){
  if(readonly&&initial.linked===false&&initial.snapshot){
    sources=[{id:initial.sourceId,label:'Instantâneo salvo',fields:initial.snapshotFields||(initial.config?.stages||[]).map((id,index)=>({id,label:initial.snapshot.config.stageLabels?.[index]||id})),records:()=>initial.snapshotRecords||[]}];
  }
  let source=sources.find(s=>s.id===initial.sourceId)||sources[0];
  let config=normalizeAnalysis(initial.config||{});
  let style=normalizeRelationStyle(initial.style||{});
  let graph=null,zoom=1,pan={x:0,y:0},timer=null,activeSelection=null,folderSearch='';
  let draggingStageIdx=null;

  if(!source){container.textContent='Nenhuma fonte de dados disponível.';return {destroy(){}};}
  if(!config.stages.length)config.stages=source.defaultStages||source.fields.slice(0,3).map(f=>f.id);
  config.stageOrders=config.stages.map((_,i)=>config.stageOrders?.[i]||'auto');
  if(!config.textFields.length)config.textFields=source.fields.filter(f=>f.text).map(f=>f.id);
  if(!config.folderIds.length&&initial.scope?.folderIds?.length)config.folderIds=[...initial.scope.folderIds];
  else if(!config.folderIds.length&&initial.scope?.folderId&&initial.scope.folderId!=='todas')config.folderIds=[initial.scope.folderId];

  container.innerHTML=`
  <div class="relation-panel">
    <form class="rel-controls">
      <h3>${esc(title)}</h3>
      <label>Fonte dos dados
        <select name="source">${opts(sources.map(s=>[s.id,s.label]),source.id)}</select>
      </label>

      <fieldset data-rel-folders-box hidden>
        <legend>Pastas / Diretórios</legend>
        <div class="rel-folder-mode">
          <label><input type="radio" name="folderScope" value="all"> Diretório inteiro</label>
          <label><input type="radio" name="folderScope" value="selected"> Escolher pastas</label>
        </div>
        <label><input type="checkbox" name="includeSubfolders" ${config.includeSubfolders!==false?'checked':''}> Incluir subpastas automaticamente</label>
        <div data-rel-folders-picker hidden>
          <div class="rel-mini-actions">
            <button type="button" data-rel-action="folders-all">Todas</button>
            <button type="button" data-rel-action="folders-clear">Limpar</button>
            <button type="button" data-rel-action="folders-current">Pasta atual</button>
          </div>
          <input type="search" data-rel-folder-search placeholder="Buscar pasta...">
          <div class="rel-folder-list" data-rel-folder-list></div>
        </div>
      </fieldset>

      <label>Análise
        <select name="mode">${opts([['fields','Relações entre campos'],['terms','Termos recorrentes nos textos']],config.mode)}</select>
      </label>

      <div data-rel-fields>
        <div class="rel-sec-head">
          <strong>Sequenciador de colunas</strong>
          <small>Defina ordem das etapas e como cada coluna ordena os nós.</small>
        </div>
        <div data-rel-stages></div>
        <button type="button" data-rel-action="stage-add">${plus} Adicionar coluna / variável</button>
        <label>Medida
          <select name="measure"><option value="">Contagem de registros</option>${opts(source.fields.filter(f=>f.numeric).map(f=>[f.id,f.label]),config.measure)}</select>
        </label>
        <label>Contagem
          <select name="counting">${opts([['fractional','Dividir o peso entre combinações'],['full','Contar cada combinação']],config.counting)}</select>
        </label>
      </div>

      <div data-rel-terms>
        <strong>Texto para analisar</strong>
        <div data-rel-text-fields></div>
        <label>Contexto<select name="context">${opts([['document','Mesmo registro / documento'],['paragraph','Mesmo parágrafo']],config.context)}</select></label>
        <label>Expressões completas<textarea name="phrases" rows="2" placeholder="Uma expressão por linha">${esc(config.phrases.join('\n'))}</textarea></label>
        <label>Ignorar palavras<textarea name="ignoredTerms" rows="2" placeholder="Uma palavra por linha">${esc(config.ignoredTerms.join('\n'))}</textarea></label>
        <label>Unir termos equivalentes<textarea name="synonyms" rows="2" placeholder="termo = forma preferida">${esc(Object.entries(config.synonyms).map(([a,b])=>a+' = '+b).join('\n'))}</textarea></label>
        <small>Contagem por presença: repetir o termo no mesmo registro não aumenta o peso. Uma ligação indica ocorrência conjunta, não causalidade.</small>
      </div>

      <fieldset class="rel-var-manager" data-rel-variables-box>
        <legend>Variáveis personalizadas</legend>
        <div class="rel-mini-actions">
          <button type="button" data-rel-action="var-toggle">${plus} Nova variável</button>
          <button type="button" data-rel-action="var-preset-triagem" title="Cria variável Incluído / Excluído">+ Triagem (Inc/Exc)</button>
        </div>
        <div class="rel-var-creator" data-rel-var-creator hidden>
          <label>Nome da variável<input type="text" data-rel-var-name placeholder="Ex.: Decisão, Relevância, País"></label>
          <label>Opções (separadas por vírgula)<input type="text" data-rel-var-options placeholder="Ex.: Incluído, Excluído, Talvez"></label>
          <div class="rel-mini-actions">
            <button type="button" data-rel-action="var-create" class="rel-btn-primary">Criar variável</button>
            <button type="button" data-rel-action="var-cancel">Cancelar</button>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Cadeia de filtros</legend>
        <div class="rel-filter-top">
          <label>Combinar
            <select name="filterCombinator">${opts([['and','Todas as regras (E)'],['or','Qualquer regra (OU)']],config.filterCombinator)}</select>
          </label>
        </div>
        <div class="rel-mini-actions">
          <button type="button" data-rel-action="filter-add">${plus} Regra</button>
          <button type="button" data-rel-action="filter-quick-color">+ Cor</button>
          <button type="button" data-rel-action="filter-quick-read">+ Lido</button>
          <button type="button" data-rel-action="filter-quick-var">+ Variável</button>
        </div>
        <div class="rel-filter-chain" data-rel-filter-chain></div>
        <div class="rel-compact-2col">
          <label>Freq. mínima<input name="minimum" type="number" min="1" max="1000" value="${config.minimum}"></label>
          <label>Força ligação<input name="minLink" type="number" min="0" step="any" value="${config.minLink}"></label>
        </div>
        <label>Campo do ano<select name="yearField"><option value="">Sem filtro temporal</option>${opts(source.fields.map(f=>[f.id,f.label]),config.yearField)}</select></label>
        <div class="rel-date-range"><label>De<input name="startYear" type="number" placeholder="Ano" value="${config.startYear||''}"></label><label>Até<input name="endYear" type="number" placeholder="Ano" value="${config.endYear||''}"></label></div>
        <label>Registros selecionados<select name="scope">${opts([['all','Todos desta fonte'],['selected','Selecionar registros']],config.selectedIds.length?'selected':'all')}</select></label>
        <div data-rel-records></div>
      </fieldset>

      <fieldset>
        <legend>Visualização</legend>
        <label>Cor por<select name="colorField"><option value="">Comunidades automáticas</option>${groupedFieldOptions(source.fields,config.colorField)}</select></label>
        <div class="rel-layouts">${RELATION_LAYOUTS.map(([id,label])=>`<button type="button" data-rel-layout="${id}" title="${esc(label)}${isFixedLayout(id)?' (layout fixo)':''}" aria-label="${esc(label)}" aria-pressed="${id===style.layout}">${layoutIcon(id)}<span>${esc(label)}</span></button>`).join('')}</div>
        <label><input name="labels" type="checkbox" ${style.labels?'checked':''}> Mostrar rótulos</label>
        <label>Tamanho dos nós<input name="nodeScale" type="range" min=".5" max="2" step=".1" value="${style.nodeScale}"></label>
      </fieldset>

      <div class="rel-save-actions">
        ${onSave?'<button type="button" data-rel-action="save">Salvar configuração</button>':''}
        ${onInsert?'<button type="button" data-rel-action="insert">Inserir no documento</button>':''}
        ${onSave||onInsert?`<label><input type="checkbox" name="linked" ${initial.linked===false?'':'checked'}> Manter vinculado aos dados</label>`:''}
      </div>
      <p data-rel-error role="alert"></p>
    </form>

    <section class="rel-result">
      <div class="rel-view-tools" role="toolbar" aria-label="Controles do mapa">
        <button data-rel-action="zoom-in" type="button" title="Aproximar (até 2500%)" aria-label="Aproximar">+</button>
        <button data-rel-action="zoom-out" type="button" title="Afastar" aria-label="Afastar">−</button>
        <span class="rel-zoom-pct" data-rel-zoom-pct>100%</span>
        <button data-rel-action="fit" type="button">Enquadrar</button>
        <button data-rel-action="clear-selection" type="button" data-rel-clear-sel hidden>Limpar seleção</button>
        <span class="rel-tools-spacer"></span>
        ${downloadMenuMarkup(format=>`data-rel-action="${format}"`)}
        <button class="visual-icon-button" data-rel-action="json" type="button" title="Baixar dados e configuração" aria-label="Baixar dados e configuração">${databaseIcon}</button>
      </div>
      <p class="rel-summary" aria-live="polite"></p>
      <div class="rel-viewport" tabindex="0" aria-label="Mapa de conexões; use roda do mouse, pinça ou botões para ampliar">
        <div class="rel-drawing"></div>
      </div>
    </section>

    <aside class="rel-sidebar-info" aria-label="Inspetor de conexões e registros">
      <div class="rel-inspect" aria-live="polite">
        <div class="rel-inspect-empty">
          <strong>Inspetor de cadeia e registros</strong>
          <p>Clique em qualquer nó ou ligação do gráfico para destacar toda a cadeia de conexões e visualizar os detalhes das referências aqui.</p>
        </div>
      </div>
      <div class="rel-chain-panel" data-rel-chain hidden></div>
      <div class="rel-records-inspect" data-rel-records-inspect hidden></div>
      <details class="rel-term-ranking" hidden>
        <summary>Termos mais frequentes</summary>
        <small>Número de registros em que cada termo aparece, contado uma vez por registro.</small>
        <ol></ol>
      </details>
      <div class="rel-warnings"></div>
    </aside>
  </div>`;

  const root=container.querySelector('.relation-panel');
  const form=root.querySelector('form');
  const viewport=root.querySelector('.rel-viewport');
  const drawing=root.querySelector('.rel-drawing');
  const value=name=>form.elements.namedItem(name)?.value||'';
  const lines=name=>value(name).split(/[\n;]+/).map(s=>s.trim()).filter(Boolean);
  const error=message=>{root.querySelector('[data-rel-error]').textContent=message||'';};

  let allSourceRecords=[];
  let scopedRecords=[];
  const getScopedRecords=()=>{
    const useFolders=source.folders?.length&&config.folderIds.length;
    allSourceRecords=typeof source.records==='function'?source.records({}):[];
    scopedRecords=useFolders
      ?(typeof source.records==='function'?source.records({folderIds:config.folderIds,includeSubfolders:config.includeSubfolders}):[])
      :allSourceRecords;
    return scopedRecords;
  };
  let records=getScopedRecords();

  const nodeDrag=installRelationDrag(viewport,drawing,{layout:()=>style.layout});

  function fieldDiscreteValues(fieldId){
    const def=source.fields.find(f=>f.id===fieldId);
    const pool=new Map();
    const add=v=>{
      const t=String(v??'').trim();
      if(!t)return;
      const k=t.toLocaleLowerCase('pt-BR');
      if(!pool.has(k))pool.set(k,{label:t,count:0});
      pool.get(k).count++;
    };
    if(Array.isArray(def?.options))def.options.forEach(add);
    for(const r of allSourceRecords){
      const raw=r.fields?.[fieldId];
      for(const v of (Array.isArray(raw)?raw:[raw]))add(v);
    }
    return [...pool.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'pt-BR')).slice(0,40);
  }

  function renderFoldersUI(){
    const box=root.querySelector('[data-rel-folders-box]');
    const folders=source.folders||[];
    box.hidden=!folders.length;
    if(!folders.length)return;
    const mode=config.folderIds.length?'selected':'all';
    const rAll=form.querySelector('input[name="folderScope"][value="all"]');
    const rSel=form.querySelector('input[name="folderScope"][value="selected"]');
    if(rAll)rAll.checked=mode==='all';
    if(rSel)rSel.checked=mode==='selected';
    const picker=root.querySelector('[data-rel-folders-picker]');
    picker.hidden=mode!=='selected';
    const q=folderSearch.trim().toLocaleLowerCase('pt-BR');
    const visiveis=folders.filter(f=>!q||String(f.nome||'').toLocaleLowerCase('pt-BR').includes(q));
    root.querySelector('[data-rel-folder-list]').innerHTML=visiveis.map(f=>`
      <label class="rel-folder-item" style="padding-left:${8+(f.nivel||0)*14}px">
        <input type="checkbox" data-rel-folder-id="${esc(f.id)}" ${config.folderIds.includes(String(f.id))?'checked':''}>
        <span class="rel-folder-dot" style="background:${esc(f.cor||'#314F79')}"></span>
        <span class="rel-folder-name">${esc(f.nome)}</span>
        <small>${f.count??''}</small>
      </label>
    `).join('')||'<small>Nenhuma pasta encontrada.</small>';
  }

  function renderStagesUI(){
    const fields=source.fields;
    const listEl=root.querySelector('[data-rel-stages]');
    listEl.innerHTML=config.stages.map((id,i)=>{
      const ord=config.stageOrders?.[i]||'auto';
      return `
        ${i>0?'<div class="rel-stage-arrow" aria-hidden="true">↓</div>':''}
        <div class="rel-stage-card" draggable="true" data-stage-index="${i}">
          <div class="rel-stage">
            <span class="rel-stage-num" title="Arraste para reordenar">${i+1}</span>
            <select data-rel-stage-field aria-label="Variável da etapa ${i+1}">${groupedFieldOptions(fields,id)}</select>
            <button type="button" data-rel-action="stage-up" title="Mover para cima" aria-label="Mover variável para cima">↑</button>
            <button type="button" data-rel-action="stage-down" title="Mover para baixo" aria-label="Mover variável para baixo">↓</button>
            <button type="button" data-rel-action="stage-remove" title="Remover coluna" aria-label="Remover variável">${close}</button>
          </div>
          <label class="rel-stage-order-row">
            <span>Ordem da coluna</span>
            <select data-rel-stage-order aria-label="Ordenamento da coluna ${i+1}">${opts(STAGE_ORDER_OPTIONS,ord)}</select>
          </label>
        </div>`;
    }).join('');
  }

  function renderFilterChainUI(){
    const chainEl=root.querySelector('[data-rel-filter-chain]');
    if(!config.filters.length){
      chainEl.innerHTML='<small class="rel-filter-empty">Nenhuma regra na cadeia. Adicione regras acima para filtrar por cor, status lido, pasta ou variáveis (ex.: excluir “Excluído”).</small>';
      return;
    }
    const combLabel=config.filterCombinator==='or'?'OU':'E';
    chainEl.innerHTML=config.filters.map((rule,idx)=>{
      const noValues=rule.operator==='empty'||rule.operator==='not_empty';
      const discrete=noValues?[]:fieldDiscreteValues(rule.field);
      const selectedKeys=new Set((rule.values||[]).map(v=>v.toLocaleLowerCase('pt-BR')));
      const freeText=rule.values.join(', ');
      return `
        ${idx>0?`<div class="rel-filter-joiner"><span>${combLabel}</span></div>`:''}
        <div class="rel-filter-rule" data-filter-index="${idx}">
          <div class="rel-filter-rule-head">
            <select data-rel-filter-field aria-label="Campo do filtro ${idx+1}">${groupedFieldOptions(source.fields,rule.field)}</select>
            <button type="button" data-rel-filter-remove="${idx}" aria-label="Remover filtro" title="Remover filtro">${close}</button>
          </div>
          <select data-rel-filter-op aria-label="Operador do filtro ${idx+1}">${opts(FILTER_OPERATORS,rule.operator)}</select>
          ${noValues?'':`
            <div class="rel-filter-values" data-rel-filter-values>
              ${discrete.length&&discrete.length<=24?`<div class="rel-filter-chips">${discrete.map(d=>`<button type="button" class="rel-chip-btn ${selectedKeys.has(d.label.toLocaleLowerCase('pt-BR'))?'is-on':''}" data-rel-filter-chip="${esc(d.label)}" aria-pressed="${selectedKeys.has(d.label.toLocaleLowerCase('pt-BR'))}">${esc(d.label)} <small>${d.count}</small></button>`).join('')}</div>`:''}
              <input type="text" data-rel-filter-input value="${esc(freeText)}" placeholder="Valores separados por vírgula..." aria-label="Valores do filtro">
            </div>
          `}
        </div>`;
    }).join('');
  }

  function fieldsUI(){
    renderFoldersUI();
    renderStagesUI();
    renderFilterChainUI();
    root.querySelector('[data-rel-text-fields]').innerHTML=source.fields.filter(f=>f.text).map(f=>`<label><input type="checkbox" data-rel-text-field="${esc(f.id)}" ${config.textFields.includes(f.id)?'checked':''}> ${esc(f.label)}</label>`).join('');
    root.querySelector('[data-rel-records]').innerHTML=records.slice(0,2000).map(r=>`<label><input type="checkbox" data-rel-record="${esc(r.id)}" ${config.selectedIds.includes(String(r.id))?'checked':''}> ${esc(r.label||r.id)}</label>`).join('');
  }

  function readStagesFromDom(){
    const cards=[...root.querySelectorAll('[data-rel-stages] .rel-stage-card')];
    const stages=cards.map(c=>c.querySelector('[data-rel-stage-field]')?.value).filter(Boolean);
    const stageOrders=cards.map(c=>c.querySelector('[data-rel-stage-order]')?.value||'auto');
    return {stages,stageOrders};
  }

  function readFiltersFromDom(){
    return [...root.querySelectorAll('[data-rel-filter-chain] .rel-filter-rule')].map((card,i)=>{
      const field=card.querySelector('[data-rel-filter-field]')?.value||'';
      const operator=card.querySelector('[data-rel-filter-op]')?.value||'eq';
      const input=card.querySelector('[data-rel-filter-input]');
      const values=input?input.value.split(/[,\n;]+/).map(s=>s.trim()).filter(Boolean):(config.filters[i]?.values||[]);
      return {id:config.filters[i]?.id||`flt-${i+1}`,field,operator,values};
    }).filter(r=>r.field);
  }

  function read(){
    const synonyms=Object.fromEntries(lines('synonyms').map(s=>{const i=s.indexOf('=');return i>0?[s.slice(0,i).trim(),s.slice(i+1).trim()]:['',''];}).filter(([a,b])=>a&&b));
    const {stages,stageOrders}=readStagesFromDom();
    const filters=readFiltersFromDom();
    const folderScope=form.querySelector('input[name="folderScope"]:checked')?.value||'all';
    const folderIds=folderScope==='selected'?[...root.querySelectorAll('[data-rel-folder-id]:checked')].map(e=>e.dataset.relFolderId):[];
    const includeSubfolders=form.elements.namedItem('includeSubfolders')?.checked??true;
    const stageLabels=stages.map(id=>source.fields.find(f=>f.id===id)?.label||id);
    config=normalizeAnalysis({
      mode:value('mode'),
      colorField:value('colorField'),
      stages,
      stageOrders,
      stageLabels,
      textFields:[...root.querySelectorAll('[data-rel-text-field]:checked')].map(e=>e.dataset.relTextField),
      context:value('context'),
      counting:value('counting'),
      measure:value('measure'),
      minimum:value('minimum'),
      minLink:value('minLink'),
      phrases:lines('phrases'),
      ignoredTerms:lines('ignoredTerms'),
      synonyms,
      yearField:value('yearField'),
      startYear:value('startYear'),
      endYear:value('endYear'),
      selectedIds:value('scope')==='selected'?[...root.querySelectorAll('[data-rel-record]:checked')].map(e=>e.dataset.relRecord):[],
      filters,
      filterCombinator:value('filterCombinator'),
      folderIds,
      includeSubfolders
    });
    style={...style,labels:form.elements.namedItem('labels').checked,nodeScale:Number(value('nodeScale'))};
    return {
      sourceId:source.id,
      config,
      style,
      scope:folderIds.length?{folderIds,includeSubfolders}:undefined,
      linked:form.elements.namedItem('linked')?.checked??initial.linked!==false
    };
  }

  const transform=()=>{
    drawing.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
    drawing.style.setProperty('--rel-label-damp',String(Math.pow(Math.max(1,zoom),0.62)));
    drawing.classList.toggle('is-zoom-detail',zoom>=1.55);
    drawing.classList.toggle('is-zoom-deep',zoom>=3.1);
    const pctEl=root.querySelector('[data-rel-zoom-pct]');
    if(pctEl)pctEl.textContent=`${Math.round(zoom*100)}%`;
  };

  function fitToViewport(){
    const svg=drawing.querySelector('svg');
    const rect=viewport.getBoundingClientRect();
    if(!svg||!rect.width||!rect.height){zoom=1;pan={x:0,y:0};transform();return;}
    const vb=svg.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
    const vbW=vb?.[2]||920,vbH=vb?.[3]||620;
    const scaleX=rect.width/vbW,scaleY=rect.height/vbH;
    // Mantém leitura nítida sem microescala excessiva em Sankeys muito altos
    zoom=clampZoom(Math.min(1,Math.max(0.28,Math.min(scaleX,scaleY)*0.96)));
    pan={x:0,y:0};
    transform();
  }

  function applyChainHighlight(selection){
    const svg=drawing.querySelector('svg');
    const clearBtn=root.querySelector('[data-rel-clear-sel]');
    if(clearBtn)clearBtn.hidden=!selection;
    if(!svg||!graph)return;
    const allNodes=svg.querySelectorAll('[data-relation-node]');
    const allEdges=svg.querySelectorAll('[data-relation-edge]');
    for(const el of [...allNodes,...allEdges]){
      el.classList.remove('is-selected','is-chain','is-chain-direct');
    }
    if(!selection){
      svg.classList.remove('has-selection');
      return null;
    }
    const chain=computeConnectionChain(graph,selection);
    svg.classList.add('has-selection');
    for(const el of allNodes){
      const id=el.dataset.relationNode;
      if(selection.type==='node'&&id===selection.id)el.classList.add('is-selected');
      if(chain.nodeIds.has(id))el.classList.add('is-chain');
      if(chain.directNodeIds.has(id))el.classList.add('is-chain-direct');
    }
    for(const el of allEdges){
      const k=el.dataset.relationEdge;
      if(selection.type==='edge'&&k===JSON.stringify([selection.source,selection.target]))el.classList.add('is-selected');
      if(chain.edgeKeys.has(k))el.classList.add('is-chain');
      if(chain.directEdgeKeys.has(k))el.classList.add('is-chain-direct');
    }
    return chain;
  }

  function renderInspector(selection,chain){
    const inspectBox=root.querySelector('.rel-inspect');
    const chainBox=root.querySelector('[data-rel-chain]');
    const recBox=root.querySelector('[data-rel-records-inspect]');

    if(!selection||!graph){
      inspectBox.innerHTML=`
        <div class="rel-inspect-empty">
          <strong>Inspetor de cadeia e registros</strong>
          <p>Clique em qualquer nó ou ligação do gráfico para destacar toda a cadeia de conexões e visualizar os registros detalhados aqui.</p>
        </div>`;
      chainBox.hidden=true;chainBox.innerHTML='';
      recBox.hidden=true;recBox.innerHTML='';
      return;
    }

    const item=selection.type==='node'
      ?graph.nodes.find(n=>n.id===selection.id)
      :graph.links.find(l=>l.source===selection.source&&l.target===selection.target);
    if(!item){renderInspector(null,null);return;}

    const stageLabel=selection.type==='node'
      ?(graph.config?.stageLabels?.[item.stage]||graph.config?.stages?.[item.stage]||`Etapa ${(item.stage||0)+1}`)
      :'Ligação entre etapas';
    const stageField=selection.type==='node'?graph.config?.stages?.[item.stage]:'';
    const canQuickFilter=Boolean(selection.type==='node'&&stageField&&item.label);

    inspectBox.innerHTML=`
      <div class="rel-inspect-head">
        <div>
          <span class="rel-inspect-kicker">${esc(stageLabel)}</span>
          <strong>${esc(selection.type==='node'?item.label:`${item.source} → ${item.target}`)}</strong>
        </div>
        <span class="rel-inspect-badge">${item.recordCount??item.value} reg.</span>
      </div>
      <div class="rel-inspect-meta">Peso acumulado: ${Number(item.value).toLocaleString('pt-BR',{maximumFractionDigits:2})}</div>
      <div class="rel-mini-actions">
        ${canQuickFilter?`<button type="button" data-rel-action="filter-from-node" data-filter-field="${esc(stageField)}" data-filter-val="${esc(item.label)}">Filtrar por este item</button>`:''}
        <button type="button" data-rel-action="clear-selection">Limpar seleção</button>
      </div>`;

    if(chain&&chain.connectedNodes.length){
      const byStage=new Map();
      for(const n of chain.connectedNodes){
        const st=n.stage||0;
        if(!byStage.has(st))byStage.set(st,[]);
        byStage.get(st).push(n);
      }
      const stagesSorted=[...byStage.keys()].sort((a,b)=>a-b);
      chainBox.hidden=false;
      if(graph.config?.mode==='fields'&&stagesSorted.length>1){
        chainBox.innerHTML=`
          <div class="rel-side-title">Cadeia de conexões (${chain.connectedNodes.length} nós · ${chain.connectedLinks.length} elos)</div>
          <div class="rel-chain-stages">
            ${stagesSorted.map(st=>{
              const tituloEtapa=graph.config?.stageLabels?.[st]||graph.config?.stages?.[st]||`Etapa ${st+1}`;
              const lista=byStage.get(st).slice(0,25);
              return `<div class="rel-chain-stage">
                <span class="rel-chain-stage-lbl">${esc(tituloEtapa)}</span>
                <div class="rel-chain-chips">${lista.map(n=>`<button type="button" class="rel-chain-chip ${n.id===selection.id?'is-active':''}" data-chain-select-node="${esc(n.id)}">${esc(n.label)} <small>${n.value}</small></button>`).join('')}</div>
              </div>`;
            }).join('')}
          </div>`;
      }else{
        const diretos=chain.connectedNodes.filter(n=>n.id!==selection.id&&chain.directNodeIds.has(n.id));
        const estendidos=chain.connectedNodes.filter(n=>n.id!==selection.id&&!chain.directNodeIds.has(n.id));
        chainBox.innerHTML=`
          <div class="rel-side-title">Cadeia de conexões (${chain.connectedNodes.length} nós · ${chain.connectedLinks.length} elos)</div>
          ${diretos.length?`<div class="rel-chain-stage"><span class="rel-chain-stage-lbl">Conexões diretas (${diretos.length})</span><div class="rel-chain-chips">${diretos.slice(0,25).map(n=>`<button type="button" class="rel-chain-chip" data-chain-select-node="${esc(n.id)}">${esc(n.label)} <small>${n.value}</small></button>`).join('')}</div></div>`:''}
          ${estendidos.length?`<div class="rel-chain-stage"><span class="rel-chain-stage-lbl">Cadeia estendida (${estendidos.length})</span><div class="rel-chain-chips">${estendidos.slice(0,25).map(n=>`<button type="button" class="rel-chain-chip is-ext" data-chain-select-node="${esc(n.id)}">${esc(n.label)} <small>${n.value}</small></button>`).join('')}</div></div>`:''}`;
      }
    }else{
      chainBox.hidden=true;chainBox.innerHTML='';
    }

    const recMap=new Map(records.map(r=>[String(r.id),r]));
    const recItems=item.records.map(id=>recMap.get(String(id))||{id,label:id,fields:{},meta:{}});
    const varsCatalogo=source.fields.filter(f=>f.group==='variavel');
    recBox.hidden=false;
    recBox.innerHTML=`
      <div class="rel-side-title">Registros de origem (${item.recordCount??item.value})</div>
      ${onMutateRecordVariable&&varsCatalogo.length&&recItems.length?`
        <div class="rel-batch-var" data-rel-batch-var>
          <small>Classificar estes ${recItems.length} registro(s):</small>
          <div class="rel-batch-row">
            <select data-rel-batch-field>${opts(varsCatalogo.map(v=>[v.varName,v.varName]),varsCatalogo[0].varName)}</select>
            <input type="text" data-rel-batch-val placeholder="Valor (ex.: Excluído)">
            <button type="button" data-rel-action="batch-var-apply">Aplicar</button>
          </div>
        </div>
      `:''}
      <ul class="rel-records-cards">
        ${recItems.map(r=>{
          const meta=r.meta||{};
          const corHex=meta.corCapaHex||'';
          const statusTxt=r.fields?.statusLeitura||'';
          const autores=(meta.authors||r.fields?.author||[]).slice(0,2).join(', ');
          const ano=meta.year||r.fields?.year||'';
          const varsEntries=Object.entries(meta.variaveis||{});
          return `<li class="rel-record-card">
            <div class="rel-record-top">
              ${corHex?`<span class="rel-rec-color" style="background:${esc(corHex)}" title="Cor: ${esc(r.fields?.corCapa||corHex)}"></span>`:''}
              <strong title="${esc(r.label)}">${esc(r.label||r.id)}</strong>
            </div>
            <div class="rel-record-sub">${[autores,ano,statusTxt].filter(Boolean).map(esc).join(' · ')}</div>
            ${varsEntries.length?`<div class="rel-record-vars">${varsEntries.map(([k,v])=>`<span><b>${esc(k)}:</b> ${esc(Array.isArray(v)?v.join(', '):v)}</span>`).join('')}</div>`:''}
          </li>`;
        }).join('')}
      </ul>
      ${item.records.length<(item.recordCount??item.value)?'<small class="rel-side-note">Exibindo os primeiros 100 registros.</small>':''}`;
  }

  function update(){
    error('');
    const data=read();
    records=getScopedRecords();
    root.querySelector('[data-rel-fields]').hidden=config.mode!=='fields';
    root.querySelector('[data-rel-terms]').hidden=config.mode!=='terms';
    root.querySelector('[data-rel-records]').hidden=value('scope')!=='selected';
    if(config.mode==='fields'&&config.stages.length<2){error('Selecione ao menos duas variáveis.');return;}
    if(config.mode==='terms'&&!config.textFields.length){error('Selecione ao menos um campo de texto.');return;}
    if(value('scope')==='selected'&&!config.selectedIds.length){error('Selecione ao menos um registro.');return;}

    graph=readonly&&initial.linked===false&&initial.snapshot?structuredClone(initial.snapshot):analyzeRelations(records,config);
    const ranking=root.querySelector('.rel-term-ranking');
    ranking.hidden=config.mode!=='terms';
    ranking.querySelector('ol').innerHTML=graph.nodes.slice().sort((a,b)=>b.value-a.value).slice(0,30).map(n=>`<li><span>${esc(n.label)}</span><strong>${n.value}</strong></li>`).join('');
    graph.config.stageLabels=config.stages.map(id=>source.fields.find(f=>f.id===id)?.label||id);

    drawing.innerHTML=renderRelations(graph,style);
    nodeDrag.apply();

    const activeFilterCount=config.filters.length;
    const filteredTxt=graph.stats.filteredOut?` · ${graph.stats.filteredOut} excluídos por filtros`:'';
    root.querySelector('.rel-summary').textContent=`${graph.stats.processed} registros analisados · ${graph.nodes.length} nós · ${graph.links.length} ligações${activeFilterCount?` · ${activeFilterCount} filtro(s)`:''}${filteredTxt}`;
    root.querySelector('.rel-warnings').innerHTML=graph.warnings.map(w=>`<p>${esc(w)}</p>`).join('');

    if(activeSelection){
      const chain=applyChainHighlight(activeSelection);
      renderInspector(activeSelection,chain);
    }else{
      applyChainHighlight(null);
      renderInspector(null,null);
    }
    onChange?.({...data,graph});
  }

  function refreshSourceFieldsSelects(){
    const fields=source.fields;
    form.elements.measure.innerHTML='<option value="">Contagem de registros</option>'+opts(fields.filter(f=>f.numeric).map(f=>[f.id,f.label]),config.measure);
    form.elements.colorField.innerHTML='<option value="">Comunidades automáticas</option>'+groupedFieldOptions(fields,config.colorField);
    form.elements.yearField.innerHTML='<option value="">Sem filtro temporal</option>'+opts(fields.map(f=>[f.id,f.label]),config.yearField);
  }

  function selectItem(selection){
    activeSelection=selection;
    const chain=applyChainHighlight(activeSelection);
    renderInspector(activeSelection,chain);
  }

  if(readonly){
    form.hidden=true;
    root.classList.add('is-readonly');
  }
  fieldsUI();
  update();
  transform();

  form.addEventListener('submit',e=>e.preventDefault());
  form.addEventListener('input',e=>{
    if(e.target.matches('[data-rel-folder-search]')){
      folderSearch=e.target.value||'';
      renderFoldersUI();
      return;
    }
    clearTimeout(timer);
    timer=setTimeout(update,180);
  });
  form.addEventListener('change',event=>{
    clearTimeout(timer);
    if(event.target.name==='source'){
      source=sources.find(s=>s.id===value('source'));
      records=getScopedRecords();
      config={...config,stages:source.defaultStages||source.fields.slice(0,3).map(f=>f.id),stageOrders:(source.defaultStages||[]).map(()=>'auto'),textFields:source.fields.filter(f=>f.text).map(f=>f.id),selectedIds:[],folderIds:[],filters:[]};
      refreshSourceFieldsSelects();
      fieldsUI();
      activeSelection=null;
    }else if(event.target.name==='folderScope'){
      if(event.target.value==='all'){
        config.folderIds=[];
      }else if(!config.folderIds.length&&currentFolderId&&currentFolderId!=='todas'){
        config.folderIds=[currentFolderId];
      }else if(!config.folderIds.length&&source.folders?.[0]?.id){
        config.folderIds=[source.folders[0].id];
      }
      renderFoldersUI();
    }else if(event.target.matches('[data-rel-folder-id]')||event.target.name==='includeSubfolders'){
      if(event.target.matches('[data-rel-folder-id]')){
        config.folderIds=[...root.querySelectorAll('[data-rel-folder-id]:checked')].map(e=>e.dataset.relFolderId);
      }
      if(event.target.name==='includeSubfolders')config.includeSubfolders=event.target.checked;
      records=getScopedRecords();
      root.querySelector('[data-rel-records]').innerHTML=records.slice(0,2000).map(r=>`<label><input type="checkbox" data-rel-record="${esc(r.id)}" ${config.selectedIds.includes(String(r.id))?'checked':''}> ${esc(r.label||r.id)}</label>`).join('');
    }else if(event.target.matches('[data-rel-filter-field],[data-rel-filter-op],[name="filterCombinator"]')){
      const card=event.target.closest('.rel-filter-rule');
      if(card){
        const idx=Number(card.dataset.filterIndex);
        if(config.filters[idx]){
          config.filters[idx].field=card.querySelector('[data-rel-filter-field]')?.value||config.filters[idx].field;
          config.filters[idx].operator=card.querySelector('[data-rel-filter-op]')?.value||config.filters[idx].operator;
        }
      }
      if(event.target.name==='filterCombinator')config.filterCombinator=event.target.value==='or'?'or':'and';
      renderFilterChainUI();
    }
    update();
  });

  // Drag & drop para reordenar etapas no sequenciador
  const stagesContainer=root.querySelector('[data-rel-stages]');
  stagesContainer.addEventListener('dragstart',e=>{
    if(e.target.closest('select,button'))return;
    const card=e.target.closest('.rel-stage-card');
    if(!card)return;
    draggingStageIdx=Number(card.dataset.stageIndex);
    card.classList.add('is-dragging');
    e.dataTransfer?.setData('text/plain',String(draggingStageIdx));
  });
  stagesContainer.addEventListener('dragover',e=>{
    if(draggingStageIdx===null)return;
    const card=e.target.closest('.rel-stage-card');
    if(!card)return;
    e.preventDefault();
  });
  stagesContainer.addEventListener('drop',e=>{
    const card=e.target.closest('.rel-stage-card');
    if(draggingStageIdx===null||!card)return;
    e.preventDefault();
    const targetIdx=Number(card.dataset.stageIndex);
    if(Number.isInteger(targetIdx)&&targetIdx!==draggingStageIdx){
      const cur=readStagesFromDom();
      const [movedField]=cur.stages.splice(draggingStageIdx,1);
      const [movedOrd]=cur.stageOrders.splice(draggingStageIdx,1);
      cur.stages.splice(targetIdx,0,movedField);
      cur.stageOrders.splice(targetIdx,0,movedOrd);
      config.stages=cur.stages;config.stageOrders=cur.stageOrders;
      renderStagesUI();
      update();
    }
    draggingStageIdx=null;
  });
  stagesContainer.addEventListener('dragend',()=>{
    draggingStageIdx=null;
    stagesContainer.querySelectorAll('.is-dragging').forEach(c=>c.classList.remove('is-dragging'));
  });

  const addFilterRule=(fieldId,operator='eq',values=[])=>{
    const fId=fieldId||source.fields.find(f=>f.group==='variavel')?.id||source.fields[0]?.id||'author';
    config.filters.push({id:`flt-${Date.now().toString(36)}`,field:fId,operator,values:[...values]});
    renderFilterChainUI();
    update();
  };

  const criarVariavelRapida=async ({nome,opcoes})=>{
    const criada=onCreateVariable
      ?await onCreateVariable({nome,tipo:'selecao',opcoes})
      :registrarVariavelNoCatalogo({nome,tipo:'selecao',opcoes});
    if(!criada)return;
    const fieldId=campoIdVariavel(criada.nome);
    if(!source.fields.some(f=>f.id===fieldId)){
      source.fields.push({id:fieldId,label:`Variável · ${criada.nome}`,group:'variavel',varName:criada.nome,options:[...criada.opcoes]});
    }
    refreshSourceFieldsSelects();
    fieldsUI();
    update();
  };

  root.addEventListener('click',async event=>{
    const chip=event.target.closest('[data-rel-filter-chip]');
    if(chip){
      const card=chip.closest('.rel-filter-rule');
      const idx=Number(card?.dataset?.filterIndex);
      const val=chip.dataset.relFilterChip;
      if(Number.isInteger(idx)&&config.filters[idx]){
        const cur=config.filters[idx].values||[];
        const exists=cur.some(v=>v.toLocaleLowerCase('pt-BR')===val.toLocaleLowerCase('pt-BR'));
        config.filters[idx].values=exists
          ?cur.filter(v=>v.toLocaleLowerCase('pt-BR')!==val.toLocaleLowerCase('pt-BR'))
          :[...cur,val];
        renderFilterChainUI();
        update();
      }
      return;
    }

    const rmFilter=event.target.closest('[data-rel-filter-remove]');
    if(rmFilter){
      const idx=Number(rmFilter.dataset.relFilterRemove);
      if(Number.isInteger(idx)){
        config.filters.splice(idx,1);
        renderFilterChainUI();
        update();
      }
      return;
    }

    const chainNodeBtn=event.target.closest('[data-chain-select-node]');
    if(chainNodeBtn){
      selectItem({type:'node',id:chainNodeBtn.dataset.chainSelectNode});
      return;
    }

    const layoutBtn=event.target.closest('[data-rel-layout]');
    if(layoutBtn){
      nodeDrag.reset();
      style.layout=layoutBtn.dataset.relLayout;
      root.querySelectorAll('[data-rel-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b===layoutBtn)));
      update();
      return;
    }

    const button=event.target.closest('[data-rel-action]');
    if(!button)return;
    const action=button.dataset.relAction;

    if(action.startsWith('stage-')){
      const card=button.closest('.rel-stage-card');
      const cur=readStagesFromDom();
      config.stages=cur.stages;config.stageOrders=cur.stageOrders;
      if(action==='stage-add'&&config.stages.length<6){
        const next=source.fields.find(f=>!config.stages.includes(f.id))?.id||source.fields[0]?.id;
        if(next){config.stages.push(next);config.stageOrders.push('auto');}
      }else if(card){
        const idx=Number(card.dataset.stageIndex);
        if(action==='stage-up'&&idx>0){
          [config.stages[idx-1],config.stages[idx]]=[config.stages[idx],config.stages[idx-1]];
          [config.stageOrders[idx-1],config.stageOrders[idx]]=[config.stageOrders[idx],config.stageOrders[idx-1]];
        }else if(action==='stage-down'&&idx<config.stages.length-1){
          [config.stages[idx+1],config.stages[idx]]=[config.stages[idx],config.stages[idx+1]];
          [config.stageOrders[idx+1],config.stageOrders[idx]]=[config.stageOrders[idx],config.stageOrders[idx+1]];
        }else if(action==='stage-remove'&&config.stages.length>1){
          config.stages.splice(idx,1);config.stageOrders.splice(idx,1);
        }
      }
      renderStagesUI();
      update();
      return;
    }

    if(action==='folders-all'){
      config.folderIds=(source.folders||[]).map(f=>String(f.id));
      renderFoldersUI();update();return;
    }
    if(action==='folders-clear'){
      config.folderIds=[];
      renderFoldersUI();update();return;
    }
    if(action==='folders-current'){
      config.folderIds=currentFolderId&&currentFolderId!=='todas'?[String(currentFolderId)]:[];
      renderFoldersUI();update();return;
    }

    if(action==='var-toggle'||action==='var-cancel'){
      const box=root.querySelector('[data-rel-var-creator]');
      box.hidden=!box.hidden;
      return;
    }
    if(action==='var-preset-triagem'){
      const triagem=PRESETS_VARIAVEIS_REFERENCIA[0];
      await criarVariavelRapida(triagem);
      return;
    }
    if(action==='var-create'){
      const nome=root.querySelector('[data-rel-var-name]')?.value?.trim();
      const opcoes=(root.querySelector('[data-rel-var-options]')?.value||'').split(/[,\n;]+/).map(s=>s.trim()).filter(Boolean);
      if(!nome){error('Informe um nome para a variável.');return;}
      await criarVariavelRapida({nome,opcoes});
      root.querySelector('[data-rel-var-name]').value='';
      root.querySelector('[data-rel-var-options]').value='';
      root.querySelector('[data-rel-var-creator]').hidden=true;
      return;
    }

    if(action==='filter-add'){addFilterRule();return;}
    if(action==='filter-quick-color'){addFilterRule('corCapa','eq',[]);return;}
    if(action==='filter-quick-read'){addFilterRule('lido','eq',['Sim']);return;}
    if(action==='filter-quick-var'){
      const varField=source.fields.find(f=>f.group==='variavel');
      if(varField)addFilterRule(varField.id,'neq',varField.options?.includes('Excluído')?['Excluído']:[]);
      else{
        await criarVariavelRapida(PRESETS_VARIAVEIS_REFERENCIA[0]);
        addFilterRule(campoIdVariavel(PRESETS_VARIAVEIS_REFERENCIA[0].nome),'neq',['Excluído']);
      }
      return;
    }
    if(action==='filter-from-node'){
      const ff=button.dataset.filterField,fv=button.dataset.filterVal;
      if(ff&&fv)addFilterRule(ff,'eq',[fv]);
      return;
    }
    if(action==='clear-selection'){
      selectItem(null);
      return;
    }
    if(action==='batch-var-apply'&&onMutateRecordVariable&&activeSelection){
      const varName=root.querySelector('[data-rel-batch-field]')?.value;
      const val=root.querySelector('[data-rel-batch-val]')?.value?.trim();
      const item=activeSelection.type==='node'
        ?graph?.nodes.find(n=>n.id===activeSelection.id)
        :graph?.links.find(l=>l.source===activeSelection.source&&l.target===activeSelection.target);
      if(varName&&item?.records?.length){
        await onMutateRecordVariable(item.records,varName,val||'');
        records=getScopedRecords();
        update();
      }
      return;
    }

    if(action==='zoom-in'||action==='zoom-out'){
      const old=zoom;
      zoom=clampZoom(zoom*(action==='zoom-in'?1.32:1/1.32));
      const ratio=zoom/old;
      pan={x:pan.x*ratio,y:pan.y*ratio};
      transform();
      return;
    }
    if(action==='fit'){fitToViewport();return;}

    try{
      if(['save','insert','svg','png','json'].includes(action)){
        clearTimeout(timer);update();
        if(root.querySelector('[data-rel-error]').textContent)return;
        button.closest('details')?.removeAttribute('open');
      }
      if(action==='save'||action==='insert'){
        if(action==='save')await onSave?.(read(),graph);
        else await onInsert?.({...read(),graph,svg:root.querySelector('.rel-drawing svg').outerHTML,linked:form.elements.namedItem('linked').checked});
      }else if(action==='svg'||action==='png'){
        await downloadSvg(root.querySelector('.rel-drawing svg'),title,action);
      }else if(action==='json'){
        downloadBlob(new Blob([JSON.stringify({configuration:read(),graph},null,2)],{type:'application/json'}),'analise-relacoes.json');
      }
    }catch(e){error(e.message);}
  });

  const inspectHandler=event=>{
    const target=event.target.closest('[data-relation-node],[data-relation-edge]');
    if(!target||!graph)return;
    if(target.dataset.relationNode){
      selectItem({type:'node',id:target.dataset.relationNode});
    }else if(target.dataset.relationEdge){
      const [sourceId,targetId]=JSON.parse(target.dataset.relationEdge);
      selectItem({type:'edge',source:sourceId,target:targetId});
    }
  };
  drawing.addEventListener('click',inspectHandler);
  drawing.addEventListener('relation-select',inspectHandler);
  drawing.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();inspectHandler(event);}
    if(event.key==='Escape'){selectItem(null);}
  });

  let drag=null,panMoved=false;
  viewport.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    const node=e.target.closest('[data-relation-node]');
    if(node&&!isFixedLayout(style.layout))return;
    panMoved=false;
    drag={x:e.clientX-pan.x,y:e.clientY-pan.y,startX:e.clientX,startY:e.clientY,onNode:Boolean(node)};
  });
  viewport.addEventListener('pointermove',e=>{
    if(!drag)return;
    if(!panMoved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<=4)return;
    panMoved=true;
    if(!viewport.hasPointerCapture?.(e.pointerId))viewport.setPointerCapture?.(e.pointerId);
    pan={x:e.clientX-drag.x,y:e.clientY-drag.y};
    transform();
  });
  viewport.addEventListener('pointerup',e=>{
    if(!panMoved&&drag&&!drag.onNode&&!e.target.closest('[data-relation-node],[data-relation-edge]')){
      selectItem(null);
    }
    drag=null;
  });
  viewport.addEventListener('pointercancel',()=>{drag=null;panMoved=false;});
  viewport.addEventListener('click',e=>{if(panMoved){e.stopImmediatePropagation();panMoved=false;}},true);

  const zoomAtClientPoint=(nextZoom,clientX,clientY)=>{
    const rect=viewport.getBoundingClientRect();
    const old=zoom;
    zoom=clampZoom(nextZoom);
    const ratio=zoom/old;
    const cx=clientX-rect.left-rect.width/2;
    const cy=clientY-rect.top-rect.height/2;
    pan={x:cx-(cx-pan.x)*ratio,y:cy-(cy-pan.y)*ratio};
    transform();
  };

  const wheel=e=>{
    e.preventDefault();
    const rect=viewport.getBoundingClientRect();
    const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?rect.height:1);
    zoomAtClientPoint(zoom*Math.exp(-delta*.0022),e.clientX,e.clientY);
  };
  viewport.addEventListener('wheel',wheel,{passive:false});

  let touchPinch=null;
  const onTouchStart=e=>{
    if(e.touches?.length===2){
      const t0=e.touches[0],t1=e.touches[1];
      const dist=Math.hypot(t0.clientX-t1.clientX,t0.clientY-t1.clientY);
      if(dist>8){
        touchPinch={dist,zoomBase:zoom,midX:(t0.clientX+t1.clientX)/2,midY:(t0.clientY+t1.clientY)/2};
      }
    }
  };
  const onTouchMove=e=>{
    if(touchPinch&&e.touches?.length===2){
      if(e.cancelable)e.preventDefault();
      const t0=e.touches[0],t1=e.touches[1];
      const dist=Math.hypot(t0.clientX-t1.clientX,t0.clientY-t1.clientY);
      const midX=(t0.clientX+t1.clientX)/2,midY=(t0.clientY+t1.clientY)/2;
      pan={x:pan.x+(midX-touchPinch.midX),y:pan.y+(midY-touchPinch.midY)};
      touchPinch.midX=midX;touchPinch.midY=midY;
      zoomAtClientPoint(touchPinch.zoomBase*(dist/touchPinch.dist),midX,midY);
    }
  };
  const onTouchEnd=e=>{if(!e.touches||e.touches.length<2)touchPinch=null;};
  viewport.addEventListener('touchstart',onTouchStart,{passive:true});
  viewport.addEventListener('touchmove',onTouchMove,{passive:false});
  viewport.addEventListener('touchend',onTouchEnd,{passive:true});

  return {
    getGraph:()=>graph,
    getConfiguration:read,
    refreshRecords(){records=getScopedRecords();fieldsUI();update();},
    destroy(){
      clearTimeout(timer);
      nodeDrag.destroy();
      viewport.removeEventListener('wheel',wheel);
      viewport.removeEventListener('touchstart',onTouchStart);
      viewport.removeEventListener('touchmove',onTouchMove);
      viewport.removeEventListener('touchend',onTouchEnd);
      container.replaceChildren();
    }
  };
}

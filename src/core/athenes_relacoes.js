// SPDX-License-Identifier: GPL-3.0-or-later
import {analyzeRelations} from '../relations/analysis.js';
import {renderRelations,normalizeRelationStyle} from '../relations/render.js';
import {criarNovoBloco} from './athenes_documento.js';
import {artigoEstaNaPasta,artigoEstaNasPastas,RAIZ_BIBLIOGRAFIA} from './athenes_zotero_pastas.js';
import {
  campoIdVariavel,
  normalizarMapaVariaveis,
  obterCatalogoVariaveis,
  obterNomeCorCapa,
  obterRotuloStatusLeitura,
  ehArtigoLidoSimNao
} from './athenes_variaveis_referencia.js';

const plain=s=>String(s??'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:p|div)>/gi,'\n\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
const terms=v=>list(v).flatMap(t=>typeof t==='string'?t.split(/[;\n]+/):[t.tag||t.name||'']).map(t=>t.trim()).filter(t=>t&&!['zotero','não informado','nao informado'].includes(t.toLowerCase()));
const list=v=>Array.isArray(v)?v:v?[v]:[];
const name=a=>typeof a==='string'?a:[a.prenome||a.firstName,a.sobrenome||a.lastName||a.name].filter(Boolean).join(' ');
export const podeEditarRelacoes=doc=>!!doc&&!['leitura','comentario'].includes(doc.permissao)&&(!(doc.compartilhadoComigo||doc.proprietarioExterno)||['edicao','admin','dono'].includes(doc.permissao));
const annotation=n=>typeof n==='string'?n:[n?.texto,n?.text,n?.comentario,n?.conteudo,n?.html].filter(Boolean).join('\n');

export const CAMPOS_RELACOES=[
  {id:'author',label:'Autores',group:'meta'},
  {id:'theme',label:'Temas · palavras-chave e etiquetas',group:'meta'},
  {id:'keywords',label:'Palavras-chave',text:true,group:'meta'},
  {id:'tags',label:'Etiquetas do Zotero',text:true,group:'meta'},
  {id:'publisher',label:'Editora',group:'meta'},
  {id:'language',label:'Idioma',group:'meta'},
  {id:'doi',label:'DOI',group:'meta'},
  {id:'year',label:'Ano',group:'meta'},
  {id:'venue',label:'Publicação',group:'meta'},
  {id:'type',label:'Tipo de obra',group:'meta'},
  {id:'location',label:'Local de publicação',group:'meta'},
  {id:'title',label:'Título',text:true,group:'meta'},
  {id:'abstract',label:'Resumo',text:true,group:'meta'},
  {id:'notes',label:'Fichamentos / notas',text:true,group:'meta'},
  {id:'fulltext',label:'Texto do artigo · quando disponível',text:true,group:'meta'},
  {id:'folder',label:'Pasta / Coleção',group:'athenes'},
  {id:'statusLeitura',label:'Status de leitura',group:'athenes'},
  {id:'lido',label:'Lido (Sim / Não)',group:'athenes'},
  {id:'corCapa',label:'Cor da capa',group:'athenes'},
  {id:'temPdf',label:'PDF vinculado',group:'athenes'},
  {id:'temNotas',label:'Possui fichamento / notas',group:'athenes'}
];

export function camposRelacoesComVariaveis(referencias=[],catalogo=null){
  const vars=Array.isArray(catalogo)?catalogo:obterCatalogoVariaveis(referencias);
  const camposVars=vars.map(v=>({
    id:campoIdVariavel(v.nome),
    label:`Variável · ${v.nome}`,
    group:'variavel',
    varName:v.nome,
    options:[...(v.opcoes||[])]
  })).filter(c=>c.id);
  return [...CAMPOS_RELACOES,...camposVars];
}

function mapearPastasPorId(pastas=[]){
  const mapa=new Map();
  const visitar=itens=>{
    for(const p of list(itens)){
      if(!p?.id)continue;
      mapa.set(String(p.id),p);
      if(Array.isArray(p.subpastas))visitar(p.subpastas);
    }
  };
  visitar(pastas);
  return mapa;
}

function artigoTemPdfSeguro(r){
  if(!r||r.pdfVerificadoInvalido)return false;
  if(r.pdfBlobUrl||r.temPdfLocal||r.pdfDataUrl)return true;
  const id=String(r.driveFileId||'').trim();
  return Boolean(id)&&!/^drive_pdf_/.test(id);
}

export function registrosReferencias(referencias=[],opcoes={}){
  const mapaPastas=mapearPastasPorId(opcoes?.pastas||[]);
  return referencias.map((r,i)=>{
    const authors=list(r.autores?.length?r.autores:r.criadores?.length?r.criadores:r.creators).map(name).filter(Boolean);
    const keywords=terms(r.palavrasChave||r.keywords||r.camposZotero?.keywords);
    const tags=terms(r.tags);
    const themes=[...new Set([...keywords,...tags])];
    const year=String(r.ano||r.date||r.camposZotero?.date||'').match(/\b\d{4}\b/)?.[0]||'';
    const title=r.titulo||r.title||'(Sem título)';
    const notes=plain([r.quickSummary,r.fichamento?.resumoPessoal,r.fichamento?.metodologiaNotas,...list(r.fichamento?.notas),...Object.values(r.fichamento?.notasPagina||{}).flatMap(list),...list(r.fichamento?.citacoesMarcadas),...list(r.notasZotero)].filter(Boolean).map(annotation).join('\n\n'));
    const folderIds=[...new Set((Array.isArray(r.pastasIds)&&r.pastasIds.length?r.pastasIds:[r.pastaId||RAIZ_BIBLIOGRAFIA]).map(String))];
    const folderNames=folderIds.map(pid=>mapaPastas.get(pid)?.nome||(pid===RAIZ_BIBLIOGRAFIA?'Coleção Principal':'')).filter(Boolean);
    const statusRotulo=obterRotuloStatusLeitura(r.statusLeitura||r.status);
    const lidoRotulo=ehArtigoLidoSimNao(r);
    const corHex=r.corCapa||'#314F79';
    const corRotulo=obterNomeCorCapa(corHex);
    const temPdf=artigoTemPdfSeguro(r)?'Com PDF':'Sem PDF';
    const temNotas=notes.trim()?'Com notas':'Sem notas';
    const variaveis=normalizarMapaVariaveis(r.variaveisPersonalizadas);
    const camposVariaveis={};
    for(const [nomeVar,valVar] of Object.entries(variaveis)){
      const idCampo=campoIdVariavel(nomeVar);
      if(idCampo)camposVariaveis[idCampo]=valVar;
    }
    return {
      id:String(r.id||r.chaveZotero||r.chave||`ref-${i}`),
      label:title,
      omitEmptyFields:['theme','keywords','tags'],
      fields:{
        author:authors,
        theme:themes,
        keywords,
        tags,
        publisher:r.editora||r.publisher||r.camposZotero?.publisher||'',
        language:r.idioma||r.language||r.camposZotero?.language||'',
        doi:r.doi||r.DOI||r.camposZotero?.DOI||'',
        year,
        venue:r.publicacao||r.revista||r.editora||r.camposZotero?.publicationTitle||'',
        type:r.tipo||r.itemType||r.itemTypeZotero||'',
        location:r.local||r.cidade||r.camposZotero?.place||'',
        title,
        folder:folderNames,
        statusLeitura:statusRotulo,
        lido:lidoRotulo,
        corCapa:corRotulo,
        temPdf,
        temNotas,
        ...camposVariaveis
      },
      meta:{
        folderIds,
        corCapaHex:corHex,
        statusLeitura:r.statusLeitura||'nao_lido',
        variaveis,
        year,
        authors:authors.slice(0,4)
      },
      text:{
        title,
        keywords:keywords.join('; '),
        tags:tags.join('; '),
        fulltext:plain(r.textoCompleto||r.textoExtraido||list(r.conteudoPaginasPdf).filter(p=>!p.extra).map(p=>p.htmlGrifado||p.texto||list(p.paragrafos).join('\n\n')).join('\n\n')),
        abstract:plain(r.resumoOriginal||r.resumo||r.abstractNote||r.camposZotero?.abstractNote||''),
        notes
      }
    };
  });
}

export function registrosDocumento(doc){
  return (doc?.secoes||[]).flatMap((s,i)=>(s.blocos||[]).filter(b=>!b.itens?.some(item=>item.relationAnalysis)).map(b=>{
    const content=plain([b.texto,b.titulo,b.expressao,b.formula,b.notas,...list(b.itens).map(annotation),...list(b.colunas),...list(b.linhas).flat().map(annotation)].filter(Boolean).join('\n\n'));
    return {id:b.id,label:content.slice(0,100),fields:{section:s.titulo||s.nome||`Seção ${i+1}`,type:b.tipo},text:{text:content}};
  }).filter(r=>r.text.text.trim()));
}

export function fontesRelacoes(doc,biblioteca=[],opcoes={}){
  const pastas=opcoes.pastas||[];
  const camposBib=camposRelacoesComVariaveis(biblioteca,opcoes.catalogo);
  const camposDocRef=camposRelacoesComVariaveis(doc?.referencias||[],opcoes.catalogo);
  return [
    {id:'document-references',label:'Referências deste documento',fields:camposDocRef,defaultStages:['author','theme','year'],records:()=>registrosReferencias(doc?.referencias||[],{pastas})},
    {id:'library',label:'Biblioteca de referências disponível',fields:camposBib,defaultStages:['author','theme','year'],folders:opcoes.folders||[],records:(scope={})=>{const filtrados=scope?.folderIds?.length?biblioteca.filter(a=>artigoEstaNasPastas(a,scope.folderIds,{pastas,incluirSubpastas:scope.includeSubfolders!==false})):biblioteca;return registrosReferencias(filtrados,{pastas});}},
    {id:'document-text',label:'Texto do relatório / documento',fields:[{id:'section',label:'Seção'},{id:'type',label:'Tipo de bloco'},{id:'text',label:'Texto',text:true}],defaultStages:['section','type'],records:()=>registrosDocumento(doc)}
  ];
}

export function graficoRelacaoDoItem(item,doc){
  const binding=item.relationAnalysis;
  if(!binding)return item.content;
  let records=binding.records||[];
  if(binding.sourceId==='document-references')records=registrosReferencias(doc?.referencias||[]);
  if(binding.sourceId==='document-text')records=registrosDocumento(doc);
  const graph=binding.linked?analyzeRelations(records,binding.config):binding.graph;
  if(!graph)return item.content;
  const fields=fontesRelacoes(doc).find(source=>source.id===binding.sourceId)?.fields||CAMPOS_RELACOES;
  graph.config.stageLabels=graph.config.stages.map((id,idx)=>fields.find(f=>f.id===id)?.label||binding.config?.stageLabels?.[idx]||id);
  return renderRelations(graph,{...normalizeRelationStyle(doc?.estilo_relacoes||{primary:'#314F79'}),...binding.style});
}

export function registrosDoVinculo(records,binding){
  const selected=new Set(binding.config?.selectedIds||[]);
  return records.filter(record=>!selected.size||selected.has(String(record.id))).slice(0,2000);
}

export function inserirFiguraRelacoes(doc,{sourceId,config,style,graph,svg,linked,records=[],scope},secao){
  if(!podeEditarRelacoes(doc))throw Error('Este documento não permite inserir figuras.');
  const target=secao||doc.secoes?.find(s=>s.blocos);
  if(!target)throw Error('Abra um documento com uma seção para inserir a análise.');
  const b=criarNovoBloco('figura',{semanticRole:'chart',titulo:'Mapa de relações',legenda_geral:`${graph.stats.processed} registros analisados. ${config.mode==='terms'?'Coocorrência por presença no registro.':'Relações entre '+config.stages.join(' → ')+'.'}`,fonte:'Fonte: elaborado a partir dos dados selecionados.',itens:[{id:'rel_'+Date.now().toString(36),sourceType:'svg_code',content:svg,url:'',legenda_sub:'Relações entre dados',relationAnalysis:{sourceId,config,style,scope,linked:!!linked,records:sourceId==='library'?registrosDoVinculo(records,{config}):[],...(!linked?{graph}: {})}}]});
  target.blocos.push(b);
  doc.dataModificacao=new Date().toISOString();
  doc.estilo_relacoes=normalizeRelationStyle(style);
  return b;
}

export function sincronizarRelacoesBiblioteca(doc,biblioteca,pastas=[]){
  if(!podeEditarRelacoes(doc))return false;
  let changed=false;
  for(const sec of doc?.secoes||[])for(const b of sec.blocos||[])for(const item of b.itens||[]){
    const binding=item.relationAnalysis;
    if(binding?.linked&&binding.sourceId==='library'){
      let scoped=biblioteca;
      if(Array.isArray(binding.scope?.folderIds)&&binding.scope.folderIds.length){
        scoped=biblioteca.filter(article=>artigoEstaNasPastas(article,binding.scope.folderIds,{pastas,incluirSubpastas:binding.scope.includeSubfolders!==false}));
      }else if(binding.scope?.folderId){
        scoped=biblioteca.filter(article=>artigoEstaNaPasta(article,binding.scope.folderId));
      }
      const records=registrosDoVinculo(registrosReferencias(scoped,{pastas}),binding);
      if(JSON.stringify(binding.records)!==JSON.stringify(records)){
        binding.records=records;
        changed=true;
      }
    }
  }
  return changed;
}

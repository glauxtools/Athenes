// SPDX-License-Identifier: GPL-3.0-or-later
import {normalizeRelationStyle} from '../relations/render.js';
import {createRelationPanel} from '../relations/panel.js';
import {fontesRelacoes,inserirFiguraRelacoes,podeEditarRelacoes} from '../core/athenes_relacoes.js';
import {obterArtigos,definirArtigos} from '../core/athenes_biblioteca_artigos.js';
import {obterPastasDriveLocais} from '../core/athenes_colaboracao.js';
import {artigoEstaNasPastas,caminhoDaPasta} from '../core/athenes_zotero_pastas.js';
import {definirVariavelNoArtigo,registrarVariavelNoCatalogo} from '../core/athenes_variaveis_referencia.js';
import {coletarPastasBibliografia} from './athenes_estudo_artigos_pastas.js';

export function construirListaPastasRelacoes(artigos=[],pastasArvore=obterPastasDriveLocais()){
  const lista=coletarPastasBibliografia(pastasArvore);
  return lista.map(p=>({
    id:p.id,
    nome:p.nome||'Pasta',
    cor:p.cor||'#314F79',
    nivel:Math.max(0,caminhoDaPasta(lista,p.id).length-1),
    count:artigos.filter(a=>artigoEstaNasPastas(a,[p.id],{pastas:pastasArvore,incluirSubpastas:true})).length
  }));
}

export class PainelConexoes {
  constructor(containerEl,documento,opcoes={}){this.container=containerEl;this.doc=documento;this.opcoes=opcoes;this.renderizar();}
  setDocumento(doc){this.doc=doc;this.renderizar();}
  renderizar(){
    this.panel?.destroy();
    if(typeof document!=='undefined'&&!document.querySelector('link[data-relations-css]')){
      const css=document.createElement('link');
      css.rel='stylesheet';
      css.href=new URL('../relations/panel.css',import.meta.url).href;
      css.dataset.relationsCss='';
      document.head.append(css);
    }
    const biblioteca=obterArtigos();
    const pastasArvore=this.opcoes.pastas||obterPastasDriveLocais();
    const folders=this.opcoes.folders||construirListaPastasRelacoes(biblioteca,pastasArvore);
    const sources=this.opcoes.sources||fontesRelacoes(this.doc,biblioteca,{pastas:pastasArvore,folders});
    const readonly=this.opcoes.readonly||!podeEditarRelacoes(this.doc);
    this.panel=createRelationPanel(this.container,{
      sources,
      readonly,
      currentFolderId:this.opcoes.currentFolderId||'todas',
      initial:this.opcoes.initial||this.doc?.analise_relacoes||{style:{primary:'#314F79',font:'Nunito, sans-serif',...this.doc?.estilo_relacoes}},
      onCreateVariable:this.opcoes.onCreateVariable||(def=>registrarVariavelNoCatalogo(def,obterArtigos())),
      onMutateRecordVariable:this.opcoes.onMutateRecordVariable||((recordIds,varName,val)=>{
        const lista=obterArtigos();
        const ids=new Set((recordIds||[]).map(String));
        let mudou=false;
        for(const art of lista){
          if(ids.has(String(art.id||art.chaveZotero||art.chave))){
            definirVariavelNoArtigo(art,varName,val);
            mudou=true;
          }
        }
        if(mudou)definirArtigos(lista);
      }),
      onSave:readonly?undefined:this.opcoes.onSave||(data=>{this.doc.analise_relacoes=data;this.doc.estilo_relacoes=normalizeRelationStyle(data.style);this.opcoes.onChange?.();}),
      onInsert:readonly?undefined:this.opcoes.onInsert||(!readonly?data=>{const source=sources.find(s=>s.id===data.sourceId);inserirFiguraRelacoes(this.doc,{...data,records:source?.records(data.scope||{}).slice(0,2000)||[]});this.opcoes.onChange?.();}:undefined)
    });
  }
  destroy(){this.panel?.destroy();}
}

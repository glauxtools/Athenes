// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Athenes — Coleções do Zotero como pastas de bibliografia (mesmos nomes e a mesma hierarquia). Funções puras: recebem a árvore de
 * pastas e a lista de coleções e devolvem a árvore nova e o mapa chave-da-coleção → id-da-pasta.
 */
export const RAIZ_BIBLIOGRAFIA = 'pasta_bib_raiz';
export const PASTA_BIBLIOGRAFIA_LOCAL = 'pasta_bib_so_athenes';

export function pastaDoEspelhoZotero(espelho, pasta) {
  return Boolean(espelho && pasta && pasta.origem !== 'compartilhada' &&
    (pasta.id === RAIZ_BIBLIOGRAFIA || espelho.colecoes.some(c => c.key === pasta.zoteroKey)));
}

export function caminhoDaPasta(pastas,id){
  const mapa=new Map(pastas.map(p=>[p.id,p])),caminho=[],vistos=new Set();let atual=mapa.get(id);
  while(atual&&!vistos.has(atual.id)){vistos.add(atual.id);caminho.unshift(atual);atual=mapa.get(atual.parentId);}
  return caminho;
}
export function pastasDoNivel(pastas,id='todas'){
  const raiz=pastas.find(p=>p.id===RAIZ_BIBLIOGRAFIA),atual=pastas.find(p=>p.id===id);
  if(!atual)return pastas.filter(p=>!p.parentId||p.parentId===raiz?.id);
  const filhas=pastas.filter(p=>p.parentId===id);
  return filhas.length?[atual,...filhas]:pastas.filter(p=>p.parentId===atual.parentId);
}

const copiar = (x) => JSON.parse(JSON.stringify(x));

function acharNaArvore(lista, teste) {
  for (const p of lista || []) {
    if (teste(p)) return p;
    const f = acharNaArvore(p.subpastas, teste);
    if (f) return f;
  }
  return null;
}

/** Coleções do pai para os filhos (uma coleção só aparece depois do seu pai; pai desconhecido vira raiz). */
export function ordenarColecoes(colecoes) {
  const lista = (colecoes || []).filter(c => c?.key);
  const chaves = new Set(lista.map(c => c.key));
  const pais=new Map(lista.map(c=>[c.key,c.parentCollection&&chaves.has(c.parentCollection)?c.parentCollection:'']));
  const porChave=new Map(lista.map(c=>[c.key,c]));
  for(const c of lista){
    const caminho=[],indices=new Map();let atual=c.key;
    while(atual&&!indices.has(atual)){indices.set(atual,caminho.length);caminho.push(atual);atual=pais.get(atual);}
    if(atual){const ciclo=caminho.slice(indices.get(atual));ciclo.sort((a,b)=>String(porChave.get(a).estruturaEm||'').localeCompare(String(porChave.get(b).estruturaEm||''))||a.localeCompare(b));pais.set(ciclo[0],'');}
  }
  const filhosDe = new Map();
  for (const c of lista) {
    const pai = pais.get(c.key);
    if (!filhosDe.has(pai)) filhosDe.set(pai, []);
    filhosDe.get(pai).push(c);
  }
  const saida = []; const visto = new Set();
  const visitar = (pai) => {
    for (const c of (filhosDe.get(pai) || []).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))) {
      if (visto.has(c.key)) continue;
      visto.add(c.key); saida.push({ ...c, parentCollection: pai || false }); visitar(c.key);
    }
  };
  visitar('');
  return saida;
}

/**
 * Cria (ou renomeia) uma pasta de bibliografia para cada coleção do Zotero, sob a raiz "Bibliografia & Leituras", respeitando
 * as coleções-mãe. Não apaga nada: coleção que sumiu do Zotero deixa a pasta como está.
 * Devolve { pastas, mapa: Map(chave → id da pasta), criadas, renomeadas }.
 */
// Extract the newest known Zotero hierarchy before merging local/server trees.
export function colecoesMaisRecentes(...arvores) {
  const mapa = new Map(),nomes=new Map();
  const visitar = (lista, pai) => { for (const p of lista || []) {
    if (p.zoteroKey) {
      const c = { key:p.zoteroKey, nome:p.nome, parentCollection:p.zoteroParentKey ?? pai?.zoteroKey ?? false, estruturaEm:p.zoteroEstruturaEm || '',nomeEm:p.zoteroNomeEm||p.zoteroEstruturaEm||'' };
      if(!nomes.has(c.key)||c.nomeEm>nomes.get(c.key).nomeEm)nomes.set(c.key,c);
      if (!mapa.has(c.key) || c.estruturaEm > mapa.get(c.key).estruturaEm) mapa.set(c.key,c);
    }
    visitar(p.subpastas,p);
  }};
  arvores.forEach(a=>visitar(a,null));return [...mapa.values()].map(c=>({...c,nome:nomes.get(c.key).nome,nomeEm:nomes.get(c.key).nomeEm}));
}

function retirarColecao(lista,key,paiId='',encontradas=[]) {
  for(let i=lista.length-1;i>=0;i--){const p=lista[i];
    if(p.zoteroKey===key){encontradas.unshift({pasta:p,paiId});lista.splice(i,1);}
    else retirarColecao(p.subpastas||[],key,p.id,encontradas);
  }
  return encontradas;
}
function unirFilhas(base,extra){
  for(const p of extra||[]){const igual=base.find(q=>q.id===p.id);if(!igual)base.push(p);else unirFilhas(igual.subpastas||=([]),p.subpastas);}
}
export function espelharColecoesNasPastas(pastas, colecoes, {agora=new Date().toISOString()}={}) {
  const arvore = copiar(pastas || []);
  let raiz = acharNaArvore(arvore, p => p.id === RAIZ_BIBLIOGRAFIA);
  if (!raiz) { raiz = { id: RAIZ_BIBLIOGRAFIA, nome: 'Bibliografia & Leituras', tipo: 'bibliografia', origem: 'minhas', icone: 'livro', subpastas: [] }; arvore.push(raiz); }
  const mapa = new Map(),idsUnificados={};let criadas=0,renomeadas=0,movidas=0;
  for (const c of ordenarColecoes(colecoes)) {
    const nome=String(c.nome||'Coleção sem nome').trim();
    const existentes=retirarColecao(arvore,c.key);
    const pai=(c.parentCollection?acharNaArvore(arvore,p=>p.id===mapa.get(c.parentCollection)):raiz)||raiz;
    let pasta=existentes[0]?.pasta,alterada=false;
    if(!pasta){pasta={id:`zot_col_${c.key}`,nome,tipo:'bibliografia',origem:'minhas',origemZotero:true,zoteroKey:c.key,subpastas:[]};criadas++;alterada=true;}
    else {
      if(pasta.nome!==nome){pasta.nome=nome;renomeadas++;pasta.zoteroNomeEm=c.nomeEm||agora;}
      if(existentes[0].paiId!==pai.id){movidas++;alterada=true;}
      for(const outra of existentes.slice(1)){if(outra.pasta.id!==pasta.id)idsUnificados[outra.pasta.id]=pasta.id;unirFilhas(pasta.subpastas||=([]),outra.pasta.subpastas);if(!pasta.driveId&&outra.pasta.driveId)pasta.driveId=outra.pasta.driveId;}
    }
    if((c.nomeEm||'')>(pasta.zoteroNomeEm||''))pasta.zoteroNomeEm=c.nomeEm;
    if(!pasta.zoteroNomeEm)pasta.zoteroNomeEm=c.nomeEm||c.estruturaEm||(alterada?agora:'');
    pasta.parentId=pai.id;pasta.zoteroParentKey=c.parentCollection||false;
    if(alterada)pasta.zoteroEstruturaEm=c.estruturaEm||agora;
    else if((c.estruturaEm||'')>(pasta.zoteroEstruturaEm||''))pasta.zoteroEstruturaEm=c.estruturaEm;
    else if(!pasta.zoteroEstruturaEm)pasta.zoteroEstruturaEm='';
    (pai.subpastas||=[]).push(pasta);mapa.set(c.key,pasta.id);
  }
  return {pastas:arvore,mapa,criadas,renomeadas,movidas,idsUnificados,mudou:JSON.stringify(arvore)!==JSON.stringify(pastas||[])};
}

/** A versão mais recente do Zotero prevalece sobre uma árvore antiga de outro dispositivo. */
export function escolherEspelhoZotero(...arvores) {
  return arvores.map(arvore => arvore?.find(p => p.id === RAIZ_BIBLIOGRAFIA)?.zoteroEspelho).filter(Boolean)
    .reduce((atual, espelho) => {
      if (!atual) return espelho;
      if (atual.biblioteca === espelho.biblioteca && atual.versao && espelho.versao) {
        return Number(espelho.versao) > Number(atual.versao) ? espelho : atual;
      }
      return espelho.sincronizadoEm > atual.sincronizadoEm ? espelho : atual;
    }, null);
}

/** Mantém a árvore do Zotero fiel e guarda pastas locais ou antigas em um ramo próprio. */
export function aplicarEspelhoZotero(pastas, espelho) {
  const resultado = espelharColecoesNasPastas(pastas, espelho.colecoes, { agora: espelho.sincronizadoEm });
  const raiz = resultado.pastas.find(p => p.id === RAIZ_BIBLIOGRAFIA);
  const ativas = new Set(resultado.mapa.values());
  const originais = raiz.subpastas || [];
  const local = originais.find(p => p.id === PASTA_BIBLIOGRAFIA_LOCAL) || {
    id: PASTA_BIBLIOGRAFIA_LOCAL, parentId: raiz.id, nome: 'Só no Athenes', tipo: 'bibliografia', origem: 'minhas', icone: 'pasta', subpastas: []
  };
  local.subpastas ||= [];
  const recolher = lista => lista.filter(pasta => {
    if (pasta.id === PASTA_BIBLIOGRAFIA_LOCAL) return false;
    if (ativas.has(pasta.id)) {
      pasta.subpastas = recolher(pasta.subpastas || []);
      return true;
    }
    unirFilhas(local.subpastas, [{ ...pasta, parentId: local.id }]);
    return false;
  });
  raiz.subpastas = [...recolher(originais), local];
  raiz.zoteroEspelho = espelho;
  resultado.mudou = JSON.stringify(resultado.pastas) !== JSON.stringify(pastas || []);
  return resultado;
}

/** As referências retornadas pelo Zotero seguem suas coleções. A biblioteca local permanece disponível. */
export function aplicarColecoesZoteroAosArtigos(artigos, itens, mapa, { biblioteca, sincronizadoEm }) {
  const porChave = new Map(itens.map(item => [item.chave, item]));
  const pastasEspelhadas = new Set(mapa.values());
  for (const artigo of artigos) {
    if (artigo.compartilhadoComigo || artigo.proprietarioExterno) continue;
    const item = porChave.get(artigo.chaveZotero);
    if (item && (!artigo.zoteroBiblioteca || artigo.zoteroBiblioteca === biblioteca)) {
      const ids = pastasDoItemZotero(item.colecoes, mapa);
      artigo.pastaId = ids[0];
      artigo.pastasIds = ids;
      artigo.colecoesZotero = item.colecoes || [];
      artigo.zoteroBiblioteca = biblioteca;
      artigo.zoteroColecoesEm = sincronizadoEm;
      porChave.delete(artigo.chaveZotero);
    } else {
      const anteriores = artigo.pastasIds?.length ? artigo.pastasIds : [artigo.pastaId || RAIZ_BIBLIOGRAFIA];
      const ids = anteriores.filter(id => id !== RAIZ_BIBLIOGRAFIA && !pastasEspelhadas.has(id));
      if (ids.length !== anteriores.length) {
        artigo.pastasIds = ids.length ? ids : [PASTA_BIBLIOGRAFIA_LOCAL];
        artigo.pastaId = artigo.pastasIds.includes(artigo.pastaId) ? artigo.pastaId : artigo.pastasIds[0];
        artigo.zoteroColecoesEm = sincronizadoEm;
      }
      if (artigo.zoteroBiblioteca === biblioteca) {
        artigo.zoteroBiblioteca = '';
        artigo.zoteroColecoesEm = sincronizadoEm;
      }
    }
  }
}

export function resolverAliasPasta(id,aliases={}){
  const vistos=new Set();let atual=id;
  while(Object.hasOwn(aliases,atual)&&aliases[atual]&&!vistos.has(atual)){vistos.add(atual);atual=aliases[atual];}
  return atual;
}
export function remapearPastasDosArtigos(artigos,aliases={}){
  let mudou=false;
  for(const a of artigos||[]){
    if(a.compartilhadoComigo||a.proprietarioExterno)continue;
    const id=resolverAliasPasta(a.pastaId,aliases);
    if(id!==a.pastaId){a.pastaId=id;mudou=true;}
    if(Array.isArray(a.pastasIds)){const ids=[...new Set(a.pastasIds.map(id=>resolverAliasPasta(id,aliases)))];if(JSON.stringify(ids)!==JSON.stringify(a.pastasIds)){a.pastasIds=ids;mudou=true;}}
  }
  return mudou;
}

/** Ids das pastas de um item (uma por coleção do Zotero a que ele pertence; sem coleção, a raiz). */
export function pastasDoItemZotero(colecoesDoItem, mapa) {
  const ids = [...new Set((colecoesDoItem || []).map(k => mapa?.get(k)).filter(Boolean))];
  return ids.length ? ids : [RAIZ_BIBLIOGRAFIA];
}

/** O artigo está nesta pasta? (um item do Zotero pode estar em várias coleções.) */
export function artigoEstaNaPasta(art, pastaId) {
  const ids = Array.isArray(art?.pastasIds) && art.pastasIds.length ? art.pastasIds : [art?.pastaId || RAIZ_BIBLIOGRAFIA];
  return ids.includes(pastaId);
}

// SPDX-License-Identifier: GPL-3.0-or-later
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palette=['#315887','#288a79','#d57c37','#8459a6','#bd5271','#47a4ae','#b6a03f','#677c98'];
export const RELATION_LAYOUTS=[['force','Rede orgânica'],['clusters','Comunidades'],['radial','Radial'],['star','Centro e anéis'],['circle','Circular'],['ellipse','Elíptica'],['bundled','Feixes radiais'],['tree','Ramificações'],['sphere','Esfera · projeção'],['arc','Arcos'],['sankey','Sankey / aluvial'],['temporal','Fluxo temporal'],['timeline','Série temporal']];
export const FIXED_LAYOUTS=new Set(['sankey','temporal','arc','timeline']);
const FLOW_LAYOUTS=new Set(['sankey','temporal']);
export const isFixedLayout=layout=>FIXED_LAYOUTS.has(layout);

const ORDER_LABELS={
  auto:'Automática',
  freq_desc:'Maior volume ↓',
  freq_asc:'Menor volume ↑',
  alpha_asc:'A → Z',
  alpha_desc:'Z → A',
  num_asc:'Cronológica ↑',
  num_desc:'Cronológica ↓',
  barycenter:'Menor cruzamento'
};

const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2});
const safeColor=c=>/^#[0-9a-f]{6}$/i.test(c||'')?c:palette[0];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cleanFont=v=>String(v||'Arial, sans-serif').replace(/[^\p{L}\p{N}\s,._-]/gu,'').slice(0,100)||'Arial, sans-serif';
export function normalizeRelationStyle(raw={}){
  const gRaw=raw.gravity;
  const scRaw=raw.sizeContrast;
  const gravity=gRaw===undefined||gRaw===null||gRaw===''?1:clamp(Number(gRaw),0,3);
  const sizeContrast=scRaw===undefined||scRaw===null||scRaw===''?1:clamp(Number(scRaw),0,2);
  return {
    layout:RELATION_LAYOUTS.some(([id])=>id===raw.layout)?raw.layout:'force',
    primary:safeColor(raw.primary),
    labels:raw.labels!==false,
    nodeScale:clamp(Number(raw.nodeScale)||1,.5,2),
    edgeOpacity:clamp(Number(raw.edgeOpacity)||.25,.05,.9),
    sizeContrast:Number.isFinite(sizeContrast)?sizeContrast:1,
    repulsion:clamp(Number(raw.repulsion)||1,.2,3),
    attraction:clamp(Number(raw.attraction)||1,.2,3),
    gravity:Number.isFinite(gravity)?gravity:1,
    font:cleanFont(raw.font)
  };
}

export function communities(graph){
  const ns=graph.nodes,adj=new Map(ns.map(n=>[n.id,new Map()])),groups=new Map(ns.map(n=>[n.id,n.id])),degree=new Map(ns.map(n=>[n.id,0]));
  for(const l of graph.links){if(!adj.has(l.source)||!adj.has(l.target)||l.source===l.target)continue;adj.get(l.source).set(l.target,(adj.get(l.source).get(l.target)||0)+l.value);adj.get(l.target).set(l.source,(adj.get(l.target).get(l.source)||0)+l.value);degree.set(l.source,degree.get(l.source)+l.value);degree.set(l.target,degree.get(l.target)+l.value);}
  const m=[...degree.values()].reduce((a,b)=>a+b,0)||1;
  for(let pass=0;pass<20;pass++){let changed=false;for(const n of ns){const totals=new Map();for(const node of ns)if(node.id!==n.id)totals.set(groups.get(node.id),(totals.get(groups.get(node.id))||0)+degree.get(node.id));const weights=new Map();for(const [id,w]of adj.get(n.id))weights.set(groups.get(id),(weights.get(groups.get(id))||0)+w);let best=groups.get(n.id),score=0;for(const [g,w]of weights){const q=w-degree.get(n.id)*(totals.get(g)||0)/m;if(q>score+1e-10){score=q;best=g;}}if(best!==groups.get(n.id)){groups.set(n.id,best);changed=true;}}if(!changed)break;}
  const unique=[...new Set(groups.values())].sort();return new Map([...groups].map(([id,g])=>[id,unique.indexOf(g)]));
}

export function relationPositions(graph,layout='force',style={}){
  const repMul=clamp(Number(style?.repulsion)||1,.2,3);
  const attMul=clamp(Number(style?.attraction)||1,.2,3);
  const gravMul=Number.isFinite(Number(style?.gravity))?clamp(Number(style.gravity),0,3):1;
  const contrast=Number.isFinite(Number(style?.sizeContrast))?clamp(Number(style.sizeContrast),0,2):1;
  const labels=[...new Set(graph.nodes.map(n=>n.group).filter(Boolean))].sort(),nodes=graph.nodes.map(n=>({...n,groupLabel:n.group})),groups=labels.length?new Map(nodes.map(n=>[n.id,Math.max(0,labels.indexOf(n.group))])):communities(graph),groupCount=Math.max(0,...groups.values())+1,degree=new Map(nodes.map(n=>[n.id,0])),adj=new Map(nodes.map(n=>[n.id,[]]));
  for(const l of graph.links){if(!adj.has(l.source)||!adj.has(l.target)||l.source===l.target)continue;adj.get(l.source).push(l.target);adj.get(l.target).push(l.source);degree.set(l.source,degree.get(l.source)+l.value);degree.set(l.target,degree.get(l.target)+l.value);}
  const root=[...nodes].sort((a,b)=>degree.get(b.id)-degree.get(a.id)||a.id.localeCompare(b.id))[0],levels=new Map();if(root){levels.set(root.id,0);const queue=[root.id];while(queue.length){const id=queue.shift();for(const other of adj.get(id)){if(!levels.has(other)){levels.set(other,levels.get(id)+1);queue.push(other);}}}}
  const isolated=nodes.filter(n=>(degree.get(n.id)||0)===0);
  const isolatedIdx=new Map(isolated.map((n,k)=>[n.id,k]));
  nodes.forEach((n,i)=>{
    const angle=i/Math.max(1,nodes.length)*Math.PI*2-Math.PI/2;
    n.group=groups.get(n.id)||0;
    const connScore=Math.max(1,degree.get(n.id)||n.value||1);
    n.r=contrast<=0.05?6:3.5+Math.pow(connScore,0.5*contrast)*(1.5+0.5*contrast);
    n.x=460+Math.cos(angle)*300;n.y=310+Math.sin(angle)*230;
    if(layout==='circle'){n.x=460+Math.cos(angle)*230;n.y=310+Math.sin(angle)*230;}
    if(layout==='ellipse')n.y=310+Math.sin(angle)*160;
    if(layout==='sphere'){const z=1-2*(i+.5)/nodes.length,a=i*Math.PI*(3-Math.sqrt(5));n.x=460+300*Math.sqrt(Math.max(0,1-z*z))*Math.cos(a);n.y=310+240*z;n.r*=.6+.4*(1+Math.sin(a))/2;}
    if(layout==='arc'){n.x=nodes.length===1?460:60+i*800/Math.max(1,nodes.length-1);n.y=500;}
    if(['radial','star','tree'].includes(layout)){const level=levels.get(n.id)??3,count=nodes.filter(a=>(levels.get(a.id)??3)===level).length,index=nodes.slice(0,i).filter(a=>(levels.get(a.id)??3)===level).length,a=index/Math.max(1,count)*Math.PI*2;n.x=level?460+Math.cos(a)*(layout==='star'?220:Math.min(260,level*85)):460;n.y=level?310+Math.sin(a)*(layout==='star'?220:Math.min(245,level*85)):310;if(layout==='tree'){n.x=70+level*180;n.y=50+(index+.5)*500/Math.max(1,count);}}
    if(['force','clusters'].includes(layout)){
      const a=n.group/groupCount*Math.PI*2;
      if((degree.get(n.id)||0)===0){
        const ringA=(isolatedIdx.get(n.id)||0)/Math.max(1,isolated.length)*Math.PI*2-Math.PI/2;
        n.x=460+Math.cos(ringA)*385;n.y=305+Math.sin(ringA)*240;
      }else{
        n.x=460+Math.cos(a)*165+Math.cos(angle)*42;n.y=305+Math.sin(a)*165+Math.sin(angle)*42;
      }
      n.vx=0;n.vy=0;
    }
  });
  if(['force','clusters'].includes(layout)){
    const connected=nodes.filter(n=>(degree.get(n.id)||0)>0);
    const byId=new Map(connected.map(n=>[n.id,n]));
    for(let step=0;step<180;step++){
      const heat=1-step/210;
      for(let i=0;i<connected.length;i++)for(let j=i+1;j<connected.length;j++){const a=connected[i],b=connected[j],dx=a.x-b.x||.1,dy=a.y-b.y||.1,dist=Math.max(8,Math.hypot(dx,dy)),f=(580*repMul)/(dist*dist);a.vx+=dx/dist*f;a.vy+=dy/dist*f;b.vx-=dx/dist*f;b.vy-=dy/dist*f;}
      for(const l of graph.links){const a=byId.get(l.source),b=byId.get(l.target);if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y,dist=Math.max(1,Math.hypot(dx,dy)),force=(dist-65)*(.012*attMul)*Math.min(3,Math.sqrt(l.value));a.vx+=dx/dist*force;a.vy+=dy/dist*force;b.vx-=dx/dist*force;b.vy-=dy/dist*force;}
      for(const n of connected){const angle=n.group/groupCount*Math.PI*2,tx=layout==='clusters'?460+Math.cos(angle)*185:460,ty=layout==='clusters'?305+Math.sin(angle)*175:305;n.vx+=(tx-n.x)*(.005*gravMul);n.vy+=(ty-n.y)*(.005*gravMul);n.x=clamp(n.x+clamp(n.vx,-8,8)*heat,70,850);n.y=clamp(n.y+clamp(n.vy,-8,8)*heat,55,550);n.vx*=.65;n.vy*=.65;}
    }
    if(connected.length>1){
      const xs=connected.map(n=>n.x),ys=connected.map(n=>n.y),loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys),maxSpanX=isolated.length?620:740,maxSpanY=isolated.length?380:450,factor=Math.min(maxSpanX/Math.max(80,hiX-loX),maxSpanY/Math.max(80,hiY-loY));
      for(const n of connected){n.x=460+(n.x-(loX+hiX)/2)*factor;n.y=305+(n.y-(loY+hiY)/2)*factor;}
    }
  }
  if(layout==='tree'){const high=Math.max(1,...nodes.map(n=>n.x));for(const n of nodes)n.x=50+(n.x-50)/(high-50||1)*800;}
  return nodes;
}

const text=(x,y,value,attrs='')=>`<text x="${x}" y="${y}" font-size="12" fill="currentColor" ${attrs}>${esc(value)}</text>`;

const parseNumLabel=label=>{
  const str=String(label??'').trim();
  const yearMatch=str.match(/^(?:1\d{3}|20\d{2}|21\d{2})$/);
  if(yearMatch)return Number(yearMatch[0]);
  const numMatch=str.replace(',','.').match(/^-?\d+(?:\.\d+)?/);
  return numMatch?Number(numMatch[0]):NaN;
};

export function resolveStageOrderMode(stageNodes,rawMode='auto',{stageIndex=0,stageField='',yearField=''}={}){
  if(rawMode&&rawMode!=='auto')return rawMode;
  if(yearField&&stageField===yearField)return 'num_asc';
  const total=stageNodes.length;
  if(total>0){
    const yearLike=stageNodes.filter(n=>/\b(?:1\d{3}|20\d{2}|21\d{2})\b/.test(String(n.label||''))).length;
    if(yearLike/total>=0.8)return 'num_asc';
  }
  return stageIndex===0?'freq_desc':'barycenter';
}

export function sortStageNodes(stageNodes,mode='auto',{stageIndex=0,neighborCenters=null,neighborLinksByNode=null,stageField='',yearField='',sums=null}={}){
  const resolved=resolveStageOrderMode(stageNodes,mode,{stageIndex,stageField,yearField});
  const weightOf=n=>(sums?.get(n.id)??(Number(n.value)||0));
  const byFreqDesc=(a,b)=>(weightOf(b)-weightOf(a))||(b.value-a.value)||a.label.localeCompare(b.label,'pt-BR');

  if(resolved==='freq_desc')return [...stageNodes].sort(byFreqDesc);
  if(resolved==='freq_asc')return [...stageNodes].sort((a,b)=>(weightOf(a)-weightOf(b))||(a.value-b.value)||a.label.localeCompare(b.label,'pt-BR'));
  if(resolved==='alpha_asc')return [...stageNodes].sort((a,b)=>a.label.localeCompare(b.label,'pt-BR',{sensitivity:'base'}));
  if(resolved==='alpha_desc')return [...stageNodes].sort((a,b)=>b.label.localeCompare(a.label,'pt-BR',{sensitivity:'base'}));
  if(resolved==='num_asc'||resolved==='num_desc'){
    const dir=resolved==='num_asc'?1:-1;
    return [...stageNodes].sort((a,b)=>{
      const na=parseNumLabel(a.label),nb=parseNumLabel(b.label),fa=Number.isFinite(na),fb=Number.isFinite(nb);
      if(fa&&fb&&na!==nb)return (na-nb)*dir;
      if(fa!==fb)return fa?-1:1;
      return a.label.localeCompare(b.label,'pt-BR')*dir;
    });
  }
  if(resolved==='barycenter'&&neighborCenters&&neighborLinksByNode){
    const baryScore=n=>{
      const edges=neighborLinksByNode.get(n.id)||[];
      let wSum=0,ySum=0;
      for(const e of edges){
        const cy=neighborCenters.get(e.other);
        if(Number.isFinite(cy)){wSum+=e.weight;ySum+=cy*e.weight;}
      }
      return wSum>0?ySum/wSum:Infinity;
    };
    const scores=new Map(stageNodes.map(n=>[n.id,baryScore(n)]));
    return [...stageNodes].sort((a,b)=>{
      const sa=scores.get(a.id),sb=scores.get(b.id);
      if(Number.isFinite(sa)&&Number.isFinite(sb)&&Math.abs(sa-sb)>1e-6)return sa-sb;
      if(Number.isFinite(sa)!==Number.isFinite(sb))return Number.isFinite(sa)?-1:1;
      return byFreqDesc(a,b);
    });
  }
  return [...stageNodes].sort(byFreqDesc);
}

function flowSvg(graph,style){
  const stages=[...new Set(graph.nodes.map(n=>n.stage))].sort((a,b)=>a-b);
  if(!stages.length)return {parts:'',height:620,width:920};

  const outSums=new Map(),inSums=new Map();
  const outByNode=new Map(),inByNode=new Map();
  for(const l of graph.links){
    outSums.set(l.source,(outSums.get(l.source)||0)+l.value);
    inSums.set(l.target,(inSums.get(l.target)||0)+l.value);
    if(!outByNode.has(l.source))outByNode.set(l.source,[]);
    if(!inByNode.has(l.target))inByNode.set(l.target,[]);
    outByNode.get(l.source).push(l);
    inByNode.get(l.target).push(l);
  }
  const sums=new Map(graph.nodes.map(n=>[n.id,Math.max(1,outSums.get(n.id)||0,inSums.get(n.id)||0)]));

  const leftPad=195,rightPad=195,barW=14;
  const colGap=stages.length>1?Math.max(255,Math.round(Math.max(520,(stages.length-1)*270)/(stages.length-1))):0;
  const viewWidth=Math.max(920,leftPad+rightPad+barW+Math.max(0,stages.length-1)*colGap);

  const maxColSum=Math.max(1,...stages.map(s=>graph.nodes.filter(n=>n.stage===s).reduce((acc,n)=>acc+sums.get(n.id),0)));
  const unit=Math.max(4,Math.min(28,480/maxColSum));
  const minNodeH=6,gap=10,yStart=62;

  const nodesByStage=new Map(stages.map(s=>[s,graph.nodes.filter(n=>n.stage===s)]));
  const resolvedModes=stages.map((s,j)=>resolveStageOrderMode(nodesByStage.get(s)||[],graph.config?.stageOrders?.[j]||'auto',{stageIndex:j,stageField:graph.config?.stages?.[s]||'',yearField:graph.config?.yearField||''}));

  const centers=new Map();
  const orderedByStage=new Map();

  const layoutColumnY=(s,list,x)=>{
    let y=yStart;
    const placed=[];
    for(const n of list){
      const h=Math.max(minNodeH,sums.get(n.id)*unit);
      centers.set(n.id,y+h/2);
      placed.push({...n,x,y,h});
      y+=h+gap;
    }
    return {placed,bottomY:y};
  };

  // Pass 1: esquerda -> direita
  const colX=j=>stages.length===1?Math.round(viewWidth/2-barW/2):leftPad+j*colGap;
  for(let j=0;j<stages.length;j++){
    const s=stages[j],ns=nodesByStage.get(s)||[];
    const mode=resolvedModes[j];
    const adjPrev=new Map(ns.map(n=>[n.id,(inByNode.get(n.id)||[]).map(l=>({other:l.source,weight:l.value}))]));
    const sorted=sortStageNodes(ns,mode,{stageIndex:j,neighborCenters:centers,neighborLinksByNode:adjPrev,stageField:graph.config?.stages?.[s]||'',yearField:graph.config?.yearField||'',sums});
    orderedByStage.set(s,sorted);
    layoutColumnY(s,sorted,colX(j));
  }

  // Pass 2 & 3 (refinamento apenas em colunas com modo barycenter)
  if(resolvedModes.some(m=>m==='barycenter')){
    for(let j=stages.length-2;j>=0;j--){
      if(resolvedModes[j]!=='barycenter')continue;
      const s=stages[j],ns=orderedByStage.get(s)||[];
      const adjNext=new Map(ns.map(n=>[n.id,(outByNode.get(n.id)||[]).map(l=>({other:l.target,weight:l.value}))]));
      const sorted=sortStageNodes(ns,'barycenter',{stageIndex:j,neighborCenters:centers,neighborLinksByNode:adjNext,sums});
      orderedByStage.set(s,sorted);
      layoutColumnY(s,sorted,colX(j));
    }
    for(let j=1;j<stages.length;j++){
      if(resolvedModes[j]!=='barycenter')continue;
      const s=stages[j],ns=orderedByStage.get(s)||[];
      const adjPrev=new Map(ns.map(n=>[n.id,(inByNode.get(n.id)||[]).map(l=>({other:l.source,weight:l.value}))]));
      const sorted=sortStageNodes(ns,'barycenter',{stageIndex:j,neighborCenters:centers,neighborLinksByNode:adjPrev,sums});
      orderedByStage.set(s,sorted);
      layoutColumnY(s,sorted,colX(j));
    }
  }

  const map=new Map(),parts=[];
  let maxBottomY=600;
  for(let j=0;j<stages.length;j++){
    const s=stages[j],x=colX(j),sorted=orderedByStage.get(s)||[];
    const {placed,bottomY}=layoutColumnY(s,sorted,x);
    if(bottomY>maxBottomY)maxBottomY=bottomY;
    for(const item of placed)map.set(item.id,{...item,group:j,stageIndex:j});

    const titleTxt=graph.config?.stageLabels?.[s]||graph.config?.stages?.[s]||`Etapa ${s+1}`;
    const anchor=stages.length>1&&j===0?'end':(j===stages.length-1?'start':'middle');
    const titleX=anchor==='end'?x+barW:(anchor==='start'?x:x+barW/2);
    parts.push(`<text class="rel-col-title" x="${titleX}" y="26" font-size="12" font-weight="700" text-anchor="${anchor}" fill="currentColor">${esc(titleTxt)}</text>`);
    parts.push(`<text class="rel-col-order" x="${titleX}" y="42" font-size="10" text-anchor="${anchor}" fill="#64758c">${esc(ORDER_LABELS[resolvedModes[j]]||'Automática')}</text>`);
  }

  const height=Math.max(640,Math.ceil(maxBottomY+50));

  if(style.layout==='temporal'){
    const stage=graph.config?.stages?.indexOf(graph.config.yearField);
    if(stage<0||stage===undefined){
      return {parts:text(30,80,'Selecione o campo do ano e inclua-o nas etapas para o fluxo temporal.'),height:240,width:920};
    }
    const years=[...map.values()].filter(n=>n.stage===stage);
    if(years.length){
      const x=years[0].x+barW/2;
      parts.push(`<line x1="${x}" y1="48" x2="${x}" y2="${height-28}" stroke="#526783" stroke-dasharray="3 4"/>`);
      for(const n of years)parts.push(`<line data-relation-guide="${esc(n.id)}" x1="${x-10}" y1="${n.y+n.h/2}" x2="${x+10}" y2="${n.y+n.h/2}" stroke="#243a59" stroke-width="2"/>`);
    }
  }

  // Fitas Sankey ordenadas e proporcionais à altura exata de cada barra (sem overflow nem cruzamentos locais)
  const outAnchors=new Map(),inAnchors=new Map();
  for(const [srcId,linksOut]of outByNode.entries()){
    const src=map.get(srcId);if(!src)continue;
    const total=linksOut.reduce((acc,l)=>acc+l.value,0)||1;
    const ordered=[...linksOut].sort((a,b)=>((centers.get(a.target)||0)-(centers.get(b.target)||0))||a.target.localeCompare(b.target));
    let cursor=src.y;
    for(const l of ordered){
      const h=(l.value/total)*src.h;
      outAnchors.set(JSON.stringify([l.source,l.target]),{y0:cursor,y1:cursor+h});
      cursor+=h;
    }
  }
  for(const [tgtId,linksIn]of inByNode.entries()){
    const tgt=map.get(tgtId);if(!tgt)continue;
    const total=linksIn.reduce((acc,l)=>acc+l.value,0)||1;
    const ordered=[...linksIn].sort((a,b)=>((centers.get(a.source)||0)-(centers.get(b.source)||0))||a.source.localeCompare(b.source));
    let cursor=tgt.y;
    for(const l of ordered){
      const h=(l.value/total)*tgt.h;
      inAnchors.set(JSON.stringify([l.source,l.target]),{y0:cursor,y1:cursor+h});
      cursor+=h;
    }
  }

  for(const l of graph.links){
    const a=map.get(l.source),b=map.get(l.target);
    if(!a||!b)continue;
    const k=JSON.stringify([l.source,l.target]);
    const oa=outAnchors.get(k)||{y0:a.y,y1:a.y+a.h};
    const ib=inAnchors.get(k)||{y0:b.y,y1:b.y+b.h};
    const x0=a.x+barW,x1=b.x,mid=(x0+x1)/2;
    const d=`M${x0.toFixed(1)} ${oa.y0.toFixed(1)}C${mid.toFixed(1)} ${oa.y0.toFixed(1)},${mid.toFixed(1)} ${ib.y0.toFixed(1)},${x1.toFixed(1)} ${ib.y0.toFixed(1)}L${x1.toFixed(1)} ${ib.y1.toFixed(1)}C${mid.toFixed(1)} ${ib.y1.toFixed(1)},${mid.toFixed(1)} ${oa.y1.toFixed(1)},${x0.toFixed(1)} ${oa.y1.toFixed(1)}Z`;
    const cor=palette[a.stage%palette.length];
    parts.push(`<path class="rel-edge rel-ribbon" data-relation-edge="${esc(k)}" data-source="${esc(l.source)}" data-target="${esc(l.target)}" d="${d}" fill="${cor}" fill-opacity="0.34" stroke="${cor}" stroke-opacity="0.16" stroke-width="0.6"><title>${esc(a.label)} → ${esc(b.label)}: ${fmt(l.value)} (${l.recordCount} registros)</title></path>`);
  }

  for(const n of map.values()){
    const cor=palette[n.stage%palette.length];
    const isFirst=n.stageIndex===0&&stages.length>1;
    const isLast=n.stageIndex===stages.length-1;
    const lx=isFirst?n.x-10:n.x+barW+(isLast?10:8);
    const anchor=isFirst?'end':'start';
    const fullLabel=String(n.label||'');
    const shortLabel=fullLabel.length>28?fullLabel.slice(0,26)+'…':fullLabel;
    const cls=isFirst||isLast?'rel-label rel-label-flow':'rel-label rel-label-flow-mid';
    parts.push(`<g data-relation-node="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(fullLabel)}: ${n.value} registros"><title>${esc(fullLabel)} · ${n.value} registros</title><rect x="${n.x}" y="${n.y.toFixed(1)}" width="${barW}" height="${n.h.toFixed(1)}" rx="2" fill="${cor}"/><text class="${cls}" x="${lx}" y="${(n.y+n.h/2+4).toFixed(1)}" font-size="11.5" text-anchor="${anchor}" fill="currentColor">${esc(shortLabel)}</text></g>`);
  }

  return {parts:parts.join(''),height,width:viewWidth};
}

function timelineSvg(graph,style){
  const width=920,height=640;
  const rawPts=Array.isArray(graph.timeline)&&graph.timeline.length
    ?graph.timeline.map(p=>({year:Number(p.year),val:Number(graph.config?.measure?p.weight:p.count)||0,count:Number(p.count)||0}))
    :graph.nodes
      .map(n=>({year:Number(String(n.label||'').match(/^(1\d{3}|20\d{2}|21\d{2})$/)?.[1]),val:Number(n.value)||0,count:Number(n.value)||0}))
      .filter(p=>Number.isInteger(p.year));

  if(!rawPts.length){
    return {parts:text(30,90,'Nenhum dado temporal com ano válido encontrado nos registros selecionados.'),height:220,width};
  }

  const nodeByYear=new Map();
  for(const n of graph.nodes){
    const yMatch=String(n.label||'').match(/^(1\d{3}|20\d{2}|21\d{2})$/);
    if(yMatch)nodeByYear.set(Number(yMatch[1]),n.id);
  }

  const byYear=new Map();
  for(const p of rawPts){
    if(!Number.isInteger(p.year))continue;
    const prev=byYear.get(p.year)||{year:p.year,val:0,count:0};
    byYear.set(p.year,{year:p.year,val:prev.val+p.val,count:prev.count+p.count});
  }
  const yearsSorted=[...byYear.keys()].sort((a,b)=>a-b);
  const minY=yearsSorted[0],maxY=yearsSorted[yearsSorted.length-1];
  const span=maxY-minY+1;
  const series=[];
  if(span<=120){
    for(let y=minY;y<=maxY;y++)series.push(byYear.get(y)||{year:y,val:0,count:0});
  }else{
    for(const y of yearsSorted)series.push(byYear.get(y));
  }

  const maxVal=Math.max(1,...series.map(s=>s.val));
  const yTop=58,yBot=296,xLeft=58,xRight=892;
  const plotW=xRight-xLeft,plotH=yBot-yTop;
  const xAt=y=>series.length<=1?(xLeft+xRight)/2:xLeft+((y-minY)/Math.max(1,maxY-minY))*plotW;
  const yAt=v=>yBot-(Math.max(0,v)/maxVal)*plotH;

  // Segmentação em períodos (décadas ou subperíodos equilibrados)
  const periodColors=['#0284c7','#16a34a','#eab308','#ea580c','#dc2626','#7c3aed'];
  const periods=[];
  if(span>20){
    let pStart=Math.floor((minY-1)/10)*10+1;
    while(pStart<=maxY){
      const pEnd=pStart+9;
      const pts=series.filter(s=>s.year>=pStart&&s.year<=pEnd);
      if(pts.length)periods.push({label:`${Math.max(minY,pStart)}–${Math.min(maxY,pEnd)}`,pts});
      pStart+=10;
    }
  }else{
    const groups=span<=4?1:(span<=9?2:(span<=14?3:4));
    const step=Math.ceil(series.length/groups);
    for(let i=0;i<series.length;i+=step){
      const pts=series.slice(i,i+step);
      if(pts.length)periods.push({label:pts.length>1?`${pts[0].year}–${pts[pts.length-1].year}`:String(pts[0].year),pts});
    }
  }

  const parts=[];
  const titleMetric=graph.config?.measure?'Valor acumulado por ano':'Publicações por ano';
  parts.push(`<text x="${xLeft}" y="26" font-size="14" font-weight="800" fill="#1e3a5f">Evolução temporal por períodos (${minY}–${maxY})</text>`);
  parts.push(`<text x="${xLeft}" y="42" font-size="11" fill="#64758c">${esc(titleMetric)} · linha anual, área sombreada em torno da média do período</text>`);

  // Grade horizontal e eixos
  const yTicks=4;
  for(let t=0;t<=yTicks;t++){
    const v=(maxVal/yTicks)*t,yy=yAt(v);
    parts.push(`<line x1="${xLeft}" y1="${yy.toFixed(1)}" x2="${xRight}" y2="${yy.toFixed(1)}" stroke="#e9eff6" stroke-width="1"/>`);
    parts.push(`<text x="${xLeft-8}" y="${(yy+3.5).toFixed(1)}" font-size="10" text-anchor="end" fill="#64758c">${fmt(v)}</text>`);
  }
  const xStep=Math.max(1,Math.ceil(series.length/8));
  for(let i=0;i<series.length;i+=xStep){
    const xx=xAt(series[i].year);
    parts.push(`<line x1="${xx.toFixed(1)}" y1="${yTop}" x2="${xx.toFixed(1)}" y2="${yBot}" stroke="#f1f5f9" stroke-width="1"/>`);
    parts.push(`<text x="${xx.toFixed(1)}" y="${yBot+16}" font-size="10" text-anchor="middle" fill="#64758c">${series[i].year}</text>`);
  }

  // Linha tracejada de referência (valor mais recente)
  const lastVal=series[series.length-1]?.val||0;
  const yRef=yAt(lastVal);
  parts.push(`<line x1="${xLeft}" y1="${yRef.toFixed(1)}" x2="${xRight}" y2="${yRef.toFixed(1)}" stroke="#334155" stroke-width="1.2" stroke-dasharray="5 4"/>`);

  // Curvas e áreas por período
  periods.forEach((per,idx)=>{
    const col=periodColors[idx%periodColors.length];
    const pts=per.pts;
    const mean=pts.reduce((s,p)=>s+p.val,0)/Math.max(1,pts.length);
    const yMean=yAt(mean);
    const coords=pts.map(p=>[xAt(p.year),yAt(p.val)]);
    const lineD=coords.map(([x,y],k)=>`${k===0?'M':'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const baseD=`${lineD} L${coords[coords.length-1][0].toFixed(1)} ${yBot} L${coords[0][0].toFixed(1)} ${yBot} Z`;
    const meanD=`${lineD} L${coords[coords.length-1][0].toFixed(1)} ${yMean.toFixed(1)} L${coords[0][0].toFixed(1)} ${yMean.toFixed(1)} Z`;

    parts.push(`<path d="${baseD}" fill="${col}" fill-opacity="0.12" pointer-events="none"/>`);
    parts.push(`<path d="${meanD}" fill="${col}" fill-opacity="0.32" pointer-events="none"/>`);
    parts.push(`<line x1="${coords[0][0].toFixed(1)}" y1="${yMean.toFixed(1)}" x2="${coords[coords.length-1][0].toFixed(1)}" y2="${yMean.toFixed(1)}" stroke="${col}" stroke-width="1" stroke-dasharray="2 2" opacity="0.7"/>`);
    parts.push(`<path d="${lineD}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`);

    // Pílula com média do período
    const midX=(coords[0][0]+coords[coords.length-1][0])/2;
    const pillTxt=`${per.label}: ${fmt(mean)}`;
    const pillW=Math.max(72,pillTxt.length*6.2+14);
    const pillX=clamp(midX,xLeft+pillW/2,xRight-pillW/2);
    parts.push(`<rect x="${(pillX-pillW/2).toFixed(1)}" y="${yBot-22}" width="${pillW.toFixed(1)}" height="18" rx="4" fill="${col}"/>`);
    parts.push(`<text x="${pillX.toFixed(1)}" y="${yBot-9}" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">${esc(pillTxt)}</text>`);

    // Pontos interativos dos anos com registros
    for(const p of pts){
      if(p.count<=0)continue;
      const cx=xAt(p.year),cy=yAt(p.val),nid=nodeByYear.get(p.year);
      const attrs=nid?`data-relation-node="${esc(nid)}" tabindex="0" role="button"`:'';
      parts.push(`<g ${attrs}><title>${p.year}: ${fmt(p.val)} (${p.count} reg.)</title><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.6" fill="${col}" stroke="#fff" stroke-width="1.3"/></g>`);
    }
  });

  // Painel inferior: Densidade estimada (KDE) por período + rug ticks
  const kTop=378,kBot=576,kH=kBot-kTop;
  parts.push(`<text x="${xLeft}" y="352" font-size="13.5" font-weight="800" fill="#1e3a5f">Densidade estimada dos valores anuais</text>`);
  parts.push(`<text x="${xLeft}" y="368" font-size="11" fill="#64758c">Distribuição por período e marcas individuais na base (rug plot)</text>`);
  parts.push(`<line x1="${xLeft}" y1="${kBot}" x2="${xRight}" y2="${kBot}" stroke="#cbd5e1" stroke-width="1"/>`);

  const samples=64;
  const bw=Math.max(0.5,maxVal*0.09);
  const densityCurves=periods.map((per,idx)=>{
    const vals=per.pts.map(p=>p.val);
    const pts=[];
    let peakD=0,peakX=xLeft;
    for(let s=0;s<=samples;s++){
      const xv=(s/samples)*maxVal;
      let sum=0;
      for(const v of vals){
        const z=(xv-v)/bw;
        sum+=Math.exp(-0.5*z*z);
      }
      const d=sum/(Math.max(1,vals.length)*bw*Math.sqrt(2*Math.PI));
      const px=xLeft+(s/samples)*plotW;
      if(d>peakD){peakD=d;peakX=px;}
      pts.push({px,d});
    }
    return {per,idx,pts,peakD,peakX};
  });
  const maxD=Math.max(1e-6,...densityCurves.map(c=>c.peakD));
  const placedKdeLabels=[];

  for(const c of densityCurves){
    const col=periodColors[c.idx%periodColors.length];
    const coords=c.pts.map(p=>[p.px,kBot-(p.d/maxD)*(kH-24)]);
    const lineD=coords.map(([x,y],k)=>`${k===0?'M':'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const areaD=`${lineD} L${xRight} ${kBot} L${xLeft} ${kBot} Z`;
    parts.push(`<path d="${areaD}" fill="${col}" fill-opacity="0.28" pointer-events="none"/>`);
    parts.push(`<path d="${lineD}" fill="none" stroke="${col}" stroke-width="1.6" opacity="0.85"/>`);

    // Rótulo do pico sem sobreposição (busca em 2D dentro da área útil do KDE)
    const lblW=Math.max(66,c.per.label.length*7.4),lblH=15;
    const minLx=xLeft+lblW/2+2,maxLx=xRight-lblW/2-2;
    const baseY=kBot-(c.peakD/maxD)*(kH-24)-8;
    let bestLx=clamp(c.peakX,minLx,maxLx),bestLy=clamp(baseY,kTop+10,kBot-6),placed=false;
    for(const dy of [0,-16,18,34,-32,50]){
      for(const dx of [0,84,-84,168,-168,252]){
        const candX=clamp(c.peakX+dx,minLx,maxLx);
        const candY=clamp(baseY+dy,kTop+10,kBot-6);
        const x1=candX-lblW/2-3,x2=candX+lblW/2+3,y1=candY-lblH,y2=candY+2;
        if(!placedKdeLabels.some(b=>x1<b.x2&&x2>b.x1&&y1<b.y2&&y2>b.y1)){
          bestLx=candX;bestLy=candY;placed=true;break;
        }
      }
      if(placed)break;
    }
    placedKdeLabels.push({x1:bestLx-lblW/2-3,x2:bestLx+lblW/2+3,y1:bestLy-lblH,y2:bestLy+2});
    parts.push(`<text class="rel-label" x="${bestLx.toFixed(1)}" y="${bestLy.toFixed(1)}" font-size="12" font-weight="800" text-anchor="middle" fill="${col}">${esc(c.per.label)}</text>`);

    // Rug ticks na base
    for(const p of c.per.pts){
      const rx=xLeft+(p.val/maxVal)*plotW;
      parts.push(`<line x1="${rx.toFixed(1)}" y1="${kBot+3}" x2="${rx.toFixed(1)}" y2="${kBot+13}" stroke="${col}" stroke-width="1.4" opacity="0.7"/>`);
    }
  }
  for(let t=0;t<=yTicks;t++){
    const v=(maxVal/yTicks)*t,rx=xLeft+(v/maxVal)*plotW;
    parts.push(`<text x="${rx.toFixed(1)}" y="${kBot+27}" font-size="10" text-anchor="middle" fill="#64758c">${fmt(v)}</text>`);
  }

  return {parts:parts.join(''),height,width};
}

const cache=new Map();
export function renderRelations(graph,rawStyle={}){
  const style=normalizeRelationStyle(rawStyle),cacheKey=JSON.stringify([graph,style]);
  if(cache.has(cacheKey))return cache.get(cacheKey);

  let parts=[],height=620,width=920;
  const isTimeline=style.layout==='timeline';
  const flow=FLOW_LAYOUTS.has(style.layout);
  if((flow||isTimeline)&&graph.config?.mode==='terms'&&!graph.timeline?.length)return `<svg xmlns="http://www.w3.org/2000/svg" class="relation-map-svg" data-relation-layout="${esc(style.layout)}" data-relation-height="200" data-relation-width="920" viewBox="0 0 920 200">${text(25,80,'Selecione relações entre campos para gerar um fluxo.')}</svg>`;

  if(isTimeline){
    const tl=timelineSvg(graph,style);
    parts=[tl.parts];
    height=tl.height;
    width=tl.width;
  }else if(flow){
    const f=flowSvg(graph,style);
    parts=[f.parts];
    height=f.height;
    width=f.width||920;
  }else{
    const nodes=relationPositions(graph,style.layout,style),byId=new Map(nodes.map(n=>[n.id,n]));
    if(style.layout==='clusters'){
      for(const group of new Set(nodes.map(n=>n.group))){
        const ns=nodes.filter(n=>n.group===group&&graph.links.some(l=>l.source===n.id||l.target===n.id));
        if(!ns.length)continue;
        const x=ns.reduce((s,n)=>s+n.x,0)/ns.length,y=ns.reduce((s,n)=>s+n.y,0)/ns.length,rx=Math.max(30,...ns.map(n=>Math.abs(n.x-x)+n.r+15)),ry=Math.max(30,...ns.map(n=>Math.abs(n.y-y)+n.r+15));
        parts.push(`<ellipse data-relation-halo="${esc(JSON.stringify(ns.map(n=>n.id)))}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${palette[group%palette.length]}" opacity=".07" pointer-events="none"/>`);
      }
    }
    for(const l of graph.links){
      const a=byId.get(l.source),b=byId.get(l.target);
      if(!a||!b||a.id===b.id)continue;
      let d=`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      if(style.layout==='arc'){
        const ctrlY=Math.max(24,500-Math.abs(a.x-b.x)*.55);
        d=`M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${((a.x+b.x)/2).toFixed(1)} ${ctrlY.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      }else if(style.layout==='tree'){
        const midX=(a.x+b.x)/2;
        d=`M${a.x.toFixed(1)} ${a.y.toFixed(1)}C${midX.toFixed(1)} ${a.y.toFixed(1)},${midX.toFixed(1)} ${b.y.toFixed(1)},${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      }else if(style.layout==='bundled'){
        d=`M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q460 310 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      }
      const k=JSON.stringify([l.source,l.target]);
      parts.push(`<path class="rel-edge" data-relation-edge="${esc(k)}" data-source="${esc(l.source)}" data-target="${esc(l.target)}" d="${d}" fill="none" stroke="${palette[a.group%palette.length]}" stroke-width="${Math.min(8,1+Math.log2(l.value+1)).toFixed(2)}" opacity="${style.edgeOpacity}"><title>${esc(a.label)} — ${esc(b.label)}: ${fmt(l.value)}</title></path>`);
    }
    const boxes=[];
    nodes.forEach((n,i)=>{
      const maxR=28+Math.max(0,(style.sizeContrast||1)-1)*18;
      const radius=Math.min(maxR,n.r)*style.nodeScale,fullLabel=String(n.label||''),label=fullLabel.length>26?fullLabel.slice(0,24)+'…':fullLabel,w=label.length*6.5;
      let caption='';
      if(style.labels){
        let placedPrimary=false;
        if(nodes.length<65||i<25){
          const candidates=[[n.x-w/2,n.y+radius+5],[n.x-w/2,n.y-radius-20],[n.x+radius+7,n.y-7],[n.x-radius-w-7,n.y-7]];
          for(const [x,y]of candidates){
            const box={x,y,w,h:15};
            if(x<4||x+w>916||y<4||y+15>height-5||boxes.some(b=>x<b.x+b.w&&x+w>b.x&&y<b.y+b.h&&y+15>b.y))continue;
            boxes.push(box);
            caption=`<text class="rel-label rel-label-primary" x="${x.toFixed(1)}" y="${(y+12).toFixed(1)}" font-size="11.5" fill="currentColor">${esc(label)}</text>`;
            placedPrimary=true;
            break;
          }
        }
        if(!placedPrimary){
          const detailLabel=fullLabel.length>34?fullLabel.slice(0,32)+'…':fullLabel;
          const dw=Math.min(130,detailLabel.length*4.6);
          const dx=n.x-dw/2,dy=n.y+radius+2;
          const collides=boxes.some(b=>dx<b.x+b.w&&dx+dw>b.x&&dy<b.y+b.h&&dy+12>b.y);
          if(!collides){
            boxes.push({x:dx,y:dy,w:dw,h:12});
            caption=`<text class="rel-label rel-label-detail" x="${n.x.toFixed(1)}" y="${(n.y+radius+13).toFixed(1)}" font-size="11" text-anchor="middle" fill="currentColor">${esc(detailLabel)}</text>`;
          }else{
            caption=`<text class="rel-label rel-label-hover" x="${n.x.toFixed(1)}" y="${(n.y+radius+13).toFixed(1)}" font-size="11" text-anchor="middle" fill="currentColor">${esc(detailLabel)}</text>`;
          }
        }
      }
      parts.push(`<g data-relation-node="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(fullLabel)}: ${n.value} registros"><title>${esc(fullLabel)} · ${n.value} registros · comunidade ${n.group+1}</title><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${n.group===0?style.primary:palette[n.group%palette.length]}" stroke="white" stroke-width="1.5"/>${caption}</g>`);
    });
  }

  if(!graph.nodes.length)parts=[text(30,80,'Nenhuma relação com os filtros selecionados.')];
  const networkHeight=height;

  const svg=`<svg xmlns="http://www.w3.org/2000/svg" class="relation-map-svg" data-relation-layout="${esc(style.layout)}" data-relation-height="${networkHeight}" data-relation-width="${width}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mapa de relações" style="color:#243a59;font-family:${esc(style.font)}">${parts.join('')}</svg>`;
  if(cache.size>=8)cache.delete(cache.keys().next().value);
  cache.set(cacheKey,svg);
  return svg;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {stepNetwork} from '../src/relations/physics.js';
import {renderRelations,RELATION_LAYOUTS} from '../src/relations/render.js';
test('todos os layouts têm reação elástica sem perder a referência de sua estrutura',()=>{
 for(const [layout] of RELATION_LAYOUTS){
  const nodes=[{id:'a',x:200,y:200,base:{x:150,y:200}},{id:'b',x:350,y:200,base:{x:350,y:200}}];
  stepNetwork(nodes,[{source:'a',target:'b'}],'a',1,{layout});
  assert.equal(nodes[0].x,200);assert.notEqual(nodes[1].x,350,layout);
  assert.ok(nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)),layout);
 }
});
test('fluxos altos usam os limites do próprio SVG e preservam nós abaixo de 600px',()=>{
 const nodes=[{id:'a',x:100,y:1200,base:{x:100,y:1200},marginY:80},{id:'b',x:800,y:1200,base:{x:800,y:1200},marginY:80}];
 for(let i=0;i<30;i++)stepNetwork(nodes,[{source:'a',target:'b'}],null,1,{layout:'temporal',height:1800});
 assert.ok(nodes.every(n=>n.y>1100&&n.y<1720));
});
test('repulsão afasta nós próximos e a mola atrai vizinhos distantes',()=>{
 const close=[{id:'a',x:450,y:300},{id:'b',x:460,y:300}];stepNetwork(close,[]);assert.ok(close[1].x-close[0].x>10);
 const linked=[{id:'a',x:100,y:300},{id:'b',x:800,y:300}];stepNetwork(linked,[{source:'a',target:'b'}]);assert.ok(linked[1].x-linked[0].x<700);
});
test('o nó arrastado fica preso ao cursor e a simulação permanece finita',()=>{
 const nodes=[{id:'a',x:450,y:300},{id:'b',x:450,y:300}];
 for(let i=0;i<200;i++)stepNetwork(nodes,[{source:'a',target:'b'}],'a');
 assert.equal(nodes[0].x,450);assert.equal(nodes[0].y,300);
 assert.ok(nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&n.x>=30&&n.x<=890));
});
test('redes force/clusters expandem a área de distribuição sem aprisionar nós nas bordas de 920x620',()=>{
 const nodes=Array.from({length:140},(_,i)=>({id:`n${i}`,label:`Nó ${i}`,value:10,group:i%4}));
 const links=Array.from({length:120},(_,i)=>({source:`n${i}`,target:`n${(i+1)%100}`,value:2}));
 const svg=renderRelations({nodes,links},{layout:'force',repulsion:2});
 const w=Number(svg.match(/data-relation-width="(\d+)"/)?.[1]||0);
 const h=Number(svg.match(/data-relation-height="(\d+)"/)?.[1]||0);
 assert.ok(w>920&&h>620,`esperado viewBox expandido além de 920x620, obtido ${w}x${h}`);
 const sim=nodes.slice(0,20).map((_,i)=>({id:`s${i}`,x:460+(i%2?2:-2),y:310+(i%3?2:-2)}));
 for(let i=0;i<180;i++)stepNetwork(sim,[],null,1,{layout:'force',width:920,height:620,repulsion:3,gravity:0});
 assert.ok(sim.some(n=>n.x<30||n.x>890||n.y<30||n.y>590),'nós livres não devem ficar presos no retângulo 920x620');
});

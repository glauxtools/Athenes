// Bounded local spring/repulsion simulation. No workers or external dependency.
export function stepNetwork(nodes,links,pinned,heat=1,{layout='force',width=920,height=610}={}){
 const anchored=!['force','clusters'].includes(layout),flow=['sankey','temporal'].includes(layout);
 const byId=new Map(nodes.map(n=>[n.id,n]));
 for(const n of nodes){n.vx=(n.vx||0)*.72;n.vy=(n.vy||0)*.72;}
 const nLen=nodes.length;
 if(nLen<=450){
  for(let i=0;i<nLen;i++)for(let j=i+1;j<nLen;j++){
   const a=nodes[i],b=nodes[j],dx=b.x-a.x||.1,dy=b.y-a.y||.1,d=Math.max(6,Math.hypot(dx,dy)),force=Math.min(3,1800/(d*d));
   a.vx-=dx/d*force;a.vy-=dy/d*force;b.vx+=dx/d*force;b.vy+=dy/d*force;
  }
 }else{
  const cell=48,grid=new Map();
  for(let i=0;i<nLen;i++){
   const cx=Math.floor(nodes[i].x/cell),cy=Math.floor(nodes[i].y/cell),k=cx*1024+cy;
   if(!grid.has(k))grid.set(k,[]);
   grid.get(k).push(i);
  }
  for(let i=0;i<nLen;i++){
   const a=nodes[i],cx=Math.floor(a.x/cell),cy=Math.floor(a.y/cell);
   for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
    const bucket=grid.get((cx+ox)*1024+(cy+oy));
    if(!bucket)continue;
    for(const j of bucket){
     if(j<=i)continue;
     const b=nodes[j],dx=b.x-a.x||.1,dy=b.y-a.y||.1,d=Math.max(6,Math.hypot(dx,dy)),force=Math.min(3,1800/(d*d));
     a.vx-=dx/d*force;a.vy-=dy/d*force;b.vx+=dx/d*force;b.vy+=dy/d*force;
    }
   }
  }
 }
 for(const link of links){const a=byId.get(link.source),b=byId.get(link.target);if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy)),rest=anchored&&a.base&&b.base?Math.max(20,Math.hypot(b.base.x-a.base.x,b.base.y-a.base.y)):85,force=(d-rest)*.008; a.vx+=dx/d*force;a.vy+=dy/d*force;b.vx-=dx/d*force;b.vy-=dy/d*force;}
 for(const n of nodes){if(n.id===pinned){n.vx=n.vy=0;continue;}const target=anchored&&n.base?n.base:{x:width/2,y:height/2};n.vx+=(target.x-n.x)*(anchored?(flow?.06:.025):.0008);n.vy+=(target.y-n.y)*(anchored?.025:.0008);const mx=n.marginX||30,my=n.marginY||30;n.x=Math.max(mx,Math.min(width-mx,n.x+Math.max(-7,Math.min(7,n.vx))*heat));n.y=Math.max(my,Math.min(height-my,n.y+Math.max(-7,Math.min(7,n.vy))*heat));}
}

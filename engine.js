// Casa Canela · motor de cálculo compartido (app web y función de Supabase)
// Proyección: promedio ponderado (40/30/20/10) o simple de los últimos 4 días iguales,
// excluyendo días atípicos por local; los ceros cuentan. Redondeo hacia arriba por local.
export const W = [0.4, 0.3, 0.2, 0.1];
export const DIAS = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
export const DCORTO = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
export const MES = ['ene','feb','mar','abr','may','jun','jul','ago','set','oct','nov','dic'];
export const PLU = {'torta entera':'tortas enteras','pie entero':'pies enteros','bandeja':'bandejas','quiche entero':'quiches enteros','unidad':'unidades','taza':'tazas'};
export const pd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); };
export const iso = d => d.toISOString().slice(0,10);
export const wdOf = s => (pd(s).getUTCDay()+6)%7;
export const addD = (s,n) => { const d = pd(s); d.setUTCDate(d.getUTCDate()+n); return iso(d); };
export const fmtD = s => { const d = pd(s); return d.getUTCDate()+' '+MES[d.getUTCMonth()]; };
export const fmtLargo = s => DIAS[wdOf(s)]+' '+fmtD(s);

// D = {locales, canales, productos, bases, insumos, fechas, ventas[k][l][c][p], atipicos:[{fecha,local,activo}], colchon, metodo}
export function createEngine(D){
  const L=D.locales, C=D.canales, PR=D.productos, BA=D.bases, IN=D.insumos;
  const INS=Object.fromEntries(IN.map(i=>[i.id,i])), BAS=Object.fromEntries(BA.map(b=>[b.id,b]));
  const PRI=Object.fromEntries(PR.map((p,i)=>[p.id,i]));
  const allL=L.map((_,i)=>i), allC=C.map((_,i)=>i);
  const baseYield=b=>Object.values(b.ing).reduce((a,q)=>a+q,0)*(1-b.merma/100);
  const baseCost=b=>Object.entries(b.ing).reduce((a,[i,q])=>a+q*INS[i].precioKg/1000,0);
  const costG={}; BA.forEach(b=>costG[b.id]=baseCost(b)/baseYield(b));
  const prodCost=p=>Object.entries(p.bases).reduce((a,[b,g])=>a+g*costG[b],0)+Object.entries(p.dir).reduce((a,[i,q])=>a+q*INS[i].precioKg/1000,0);
  const PC=PR.map(prodCost), NET=PR.map(p=>p.precio/1.18), FC=PR.map((p,i)=>PC[i]/NET[i]);
  const isAtip=(f,l)=>D.atipicos.some(a=>a.activo!==false&&a.fecha===f&&(a.local===L[l]||a.local==='Todos'));
  // Calendario de eventos: factor sobre lo proyectado para esa fecha, local y categoría
  const EVS=(D.eventos||[]).filter(e=>e.activo!==false);
  const evOf=(f,l)=>EVS.filter(e=>e.fecha===f&&(e.local==='Todos'||e.local===L[l]));
  const evF=(f,l,pi)=>evOf(f,l).reduce((a,e)=>(!e.categoria||e.categoria===PR[pi].cat)?a*e.factor:a,1);
  const n=()=>D.fechas.length;
  const last=()=>D.fechas[n()-1];

  // Proyección de una lista de fechas usando solo ventas con índice < cutoff
  function project(dates, cutoff=n()){
    const EXPL={};
    const H=dates.map(f=>{const wd=wdOf(f);return L.map((_,l)=>{
      const idx=[];for(let k=cutoff-1;k>=0&&idx.length<4;k--){if(wdOf(D.fechas[k])===wd&&!isAtip(D.fechas[k],l))idx.push(k)}
      const w=D.metodo==='s'?idx.map(()=>1):W.slice(0,idx.length);const sw=w.reduce((a,b)=>a+b,0)||1;
      EXPL[f+'|'+l]=idx.map((k,j)=>({k,w:w[j]/sw}));
      return C.map((_,c)=>PR.map((_,p)=>idx.reduce((a,k,j)=>a+D.ventas[k][l][c][p]*w[j],0)/sw*evF(f,l,p)));
    })});
    return {dates,H,EXPL};
  }
  const nextDates=(k=7,from=last())=>[...Array(k)].map((_,i)=>addD(from,i+1));
  const uLoc=(P,d,l,cs,p)=>Math.ceil(cs.reduce((a,c)=>a+P.H[d][l][c][p],0)-1e-9);
  const uDay=(P,d,p,ls=allL,cs=allC)=>ls.reduce((a,l)=>a+uLoc(P,d,l,cs,p),0);
  const salesDay=(P,d,ls=allL,cs=allC)=>PR.reduce((s,p,pi)=>s+ls.reduce((a,l)=>a+uLoc(P,d,l,cs,pi),0)*p.precio,0);

  function production(P,d,seg=+D.colchon||0){
    const prods=PR.map((p,pi)=>{
      if(p.lugar!=='Obrador')return null;
      const proj=uDay(P,d,pi);
      const per=L.map((_,l)=>Math.ceil(uLoc(P,d,l,allC,pi)*(1+seg)-1e-9));
      const need=per.reduce((a,b)=>a+b,0);
      const ent=p.porc>1?Math.ceil(need/p.porc):need;
      return {pi,p,proj,per,need,ent,porc:p.porc>1?ent*p.porc:need};
    }).filter(Boolean);
    const bases={};
    prods.forEach(o=>Object.entries(o.p.bases).forEach(([b,g])=>{bases[b]=(bases[b]||0)+g*o.porc}));
    return {prods,bases};
  }
  // Tandas: reparte lo que va a cada local según la venta por hora de los últimos 28 días
  const TD=D.tandas||[];
  function shares(pid,l,f){
    const td=wdOf(f)>=5?'fs':'lv';const cur=((D.curva||{})[pid]||{})[L[l]]||{};const h=cur[td]||{};
    const s=TD.map(t=>{let a=0;for(let x=t.desde;x<=t.hasta;x++)a+=h[x]||0;return a});const tot=s.reduce((a,b)=>a+b,0);
    return tot?s.map(x=>x/tot):TD.map((_,i)=>i===0?1:0);
  }
  function tandas(o,f){ // o = elemento de production().prods
    if(!TD.length)return null;
    const porL=L.map((_,l)=>{
      const n=o.per[l];if(o.p.porc>1)return TD.map((_,i)=>i===0?n:0); // tortas y bandejas: enteras en la primera tanda
      const sh=shares(o.p.id,l,f);const raw=sh.map(x=>x*n);const b=raw.map(Math.floor);let rest=n-b.reduce((a,x)=>a+x,0);
      raw.map((x,i)=>({i,fr:x-Math.floor(x)})).sort((a,c)=>c.fr-a.fr||a.i-c.i).forEach(z=>{if(rest>0){b[z.i]++;rest--}});return b;
    });
    const tot=TD.map((_,i)=>porL.reduce((a,r)=>a+r[i],0));
    if(o.p.porc>1){tot[0]=o.porc;}
    return {porL,tot};
  }
  // Consumo teórico de insumos por unidad vendida y por un conjunto de unidades
  const PERU=PR.map(p=>{const m={};Object.entries(p.bases).forEach(([b,g])=>{const B=BAS[b],y=baseYield(B);Object.entries(B.ing).forEach(([i,q])=>m[i]=(m[i]||0)+g/y*q)});Object.entries(p.dir).forEach(([i,q])=>m[i]=(m[i]||0)+q);return m});
  function consumo(units){const out={};units.forEach((u,pi)=>{if(u)Object.entries(PERU[pi]).forEach(([i,q])=>out[i]=(out[i]||0)+q*u)});return out}
  function unidadesVendidas(f0,f1){const u=PR.map(()=>0);D.fechas.forEach((f,k)=>{if(f>=f0&&f<=f1)allL.forEach(l=>allC.forEach(c=>PR.forEach((_,pi)=>u[pi]+=D.ventas[k][l][c][pi])))});return u}
  // Stock efectivo: stock registrado al corte (último conteo) menos lo consumido según recetas por lo vendido y lo que sobró después
  function stockEfectivo(base,desde,sobrante=[],hasta='9999-12-31'){
    const out={...base};if(!desde)return out;
    const u=unidadesVendidas(addD(desde,1),hasta);sobrante.forEach(r=>{if(r.fecha>desde&&r.fecha<=hasta&&PRI[r.producto_id]!==undefined)u[PRI[r.producto_id]]+=+r.sobrante});
    const c=consumo(u);Object.keys(out).forEach(i=>{out[i]=Math.max(0,(out[i]||0)-(c[i]||0))});return out;
  }
  function needs(P,days=P.dates.map((_,i)=>i),seg=+D.colchon||0){
    const need={};IN.forEach(i=>need[i.id]=0);
    days.forEach(d=>{
      const pr=production(P,d,seg);
      Object.entries(pr.bases).forEach(([b,g])=>{const B=BAS[b],y=baseYield(B);Object.entries(B.ing).forEach(([i,q])=>need[i]+=g/y*q)});
      pr.prods.forEach(o=>Object.entries(o.p.dir).forEach(([i,q])=>need[i]+=q*o.porc));
      PR.forEach((p,pi)=>{if(p.lugar==='Barra'){const u=uDay(P,d,pi);Object.entries(p.dir).forEach(([i,q])=>need[i]+=q*u)}});
    });
    return need;
  }
  function purchases(need,stock){
    const byP={};let total=0,items=0;
    IN.filter(i=>i.presCant>0&&need[i.id]>0).forEach(i=>{
      const st=stock[i.id]??i.stock??0, falt=Math.max(0,need[i.id]-st), packs=Math.ceil(falt/i.presCant-1e-9), costo=packs*i.presCant*i.precioKg/1000;
      const g=(byP[i.prov]=byP[i.prov]||{proveedor:i.prov,items:[],total:0});
      g.items.push({i,need:need[i.id],stock:st,falt,packs,costo});g.total+=costo;total+=costo;if(packs>0)items++;
    });
    return {grupos:Object.values(byP),total,items};
  }
  // costo y venta neta de una proyección
  function fcOf(P,days=P.dates.map((_,i)=>i)){let cs=0,ns=0;days.forEach(d=>PR.forEach((p,pi)=>{const u=uDay(P,d,pi);cs+=u*PC[pi];ns+=u*NET[pi]}));return{costo:cs,neto:ns,fc:ns?cs/ns:0}}
  // Prueba hacia atrás: últimos 7 días cargados vs. lo que se habría proyectado antes de ellos
  function backtest(){
    const N=n();if(N<35)return null;
    const cut=N-7, dates=D.fechas.slice(cut);const P=project(dates,cut);
    const dias=dates.map((f,d)=>{const k=cut+d;const real=PR.map((_,pi)=>L.reduce((a,_,l)=>a+C.reduce((b,_,c)=>b+D.ventas[k][l][c][pi],0),0));const proj=PR.map((_,pi)=>uDay(P,d,pi));return{f,real,proj}});
    let ps=0,rs=0,ae=0,ru=0;dias.forEach(x=>PR.forEach((p,pi)=>{ps+=x.proj[pi]*p.precio;rs+=x.real[pi]*p.precio;ae+=Math.abs(x.proj[pi]-x.real[pi]);ru+=x.real[pi]}));
    return {dias,ps,rs,dif:rs?ps/rs-1:0,precision:ru?1-ae/ru:0};
  }
  const realDay=(k,ls=allL,cs=allC,prodSel='all',med='s')=>{let t=0;ls.forEach(l=>cs.forEach(c=>PR.forEach((p,pi)=>{if(prodSel==='all'||prodSel==pi){const u=D.ventas[k][l][c][pi];t+=med==='u'?u:u*p.precio}})));return t};
  function trends(){const N=n();if(N<56)return[];const sum=(a,b,pi)=>{let t=0;for(let k=a;k<b;k++)allL.forEach(l=>allC.forEach(c=>t+=D.ventas[k][l][c][pi]));return t};
    return PR.map((p,pi)=>({p,g:sum(N-28,N,pi)/Math.max(1,sum(N-56,N-28,pi))-1})).sort((a,b)=>b.g-a.g)}
  return {D,L,C,PR,BA,IN,INS,BAS,PRI,allL,allC,evOf,evF,tandas,stockEfectivo,shares,TD,PERU,consumo,unidadesVendidas,baseYield,baseCost,costG,PC,NET,FC,isAtip,last,n,project,nextDates,uLoc,uDay,salesDay,production,needs,purchases,fcOf,backtest,realDay,trends};
}

// Arma el dataset del motor a partir de filas de la base de datos
export function buildDataset(rows){
  const {locales,canales,productos,producto_bases,producto_insumos,bases,base_ing,insumos,ventas,atipicos,config}=rows;
  const curva={};(rows.curva||[]).forEach(r=>{const a=((curva[r.producto_id]=curva[r.producto_id]||{})[r.local]=curva[r.producto_id][r.local]||{});(a[r.td]=a[r.td]||{})[r.hora]=+r.u});
  const L=locales.map(x=>x.nombre), C=canales.map(x=>x.nombre);
  const prods=productos.map(p=>({id:p.id,nombre:p.nombre,cat:p.categoria,precio:+p.precio,lugar:p.lugar,porc:+p.porciones,uprod:p.unidad_prod,bases:{},dir:{}}));
  const PI=Object.fromEntries(prods.map((p,i)=>[p.id,i]));
  producto_bases.forEach(r=>{if(PI[r.producto_id]!==undefined)prods[PI[r.producto_id]].bases[r.base_id]=+r.gramos});
  producto_insumos.forEach(r=>{if(PI[r.producto_id]!==undefined)prods[PI[r.producto_id]].dir[r.insumo_id]=+r.cantidad});
  const bs=bases.map(b=>({id:b.id,nombre:b.nombre,area:b.area,merma:+b.merma,vida:+b.vida_util,ing:{}}));const BI=Object.fromEntries(bs.map((b,i)=>[b.id,i]));
  base_ing.forEach(r=>bs[BI[r.base_id]].ing[r.insumo_id]=+r.cantidad);
  const ins=insumos.map(i=>({id:i.id,nombre:i.nombre,cat:i.categoria,um:i.um,precioKg:+i.precio_kg,pres:i.presentacion,presCant:+i.pres_cant,prov:i.proveedor||'—',stock:+i.stock}));
  let fechas=[];
  if(ventas.length){const f0=ventas.reduce((a,v)=>v.fecha<a?v.fecha:a,ventas[0].fecha),f1=ventas.reduce((a,v)=>v.fecha>a?v.fecha:a,ventas[0].fecha);for(let f=f0;f<=f1;f=addD(f,1))fechas.push(f)}
  const FI=Object.fromEntries(fechas.map((f,i)=>[f,i])),LI=Object.fromEntries(L.map((x,i)=>[x,i])),CI=Object.fromEntries(C.map((x,i)=>[x,i]));
  const V=fechas.map(()=>L.map(()=>C.map(()=>prods.map(()=>0))));
  ventas.forEach(v=>{const p=PI[v.producto_id];if(p!==undefined)V[FI[v.fecha]][LI[v.local]][CI[v.canal]][p]=+v.unidades});
  return {locales:L,canales:C,productos:prods,bases:bs,insumos:ins,fechas,ventas:V,
    atipicos:atipicos.map(a=>({id:a.id,fecha:a.fecha,local:a.local,motivo:a.motivo,activo:a.activo})),
    eventos:(rows.eventos||[]).map(e=>({id:e.id,fecha:e.fecha,nombre:e.nombre,local:e.local,categoria:e.categoria||null,factor:+e.factor,activo:e.activo})),
    tandas:(rows.tandas||[]).map(t=>({id:t.id,nombre:t.nombre,desde:+t.hora_desde,hasta:+t.hora_hasta,hornear:t.hornear})),curva,
    colchon:+(config.colchon??0.05),metodo:config.metodo??'w'};
}

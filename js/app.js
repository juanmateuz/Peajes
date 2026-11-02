'use strict';
const DASH_ID = 'ceb96c6d29f04f778a1eff027368be33';
const PORTALS = ['https://supertransporte.maps.arcgis.com','https://www.arcgis.com'];
const OSRM = 'https://router.project-osrm.org';
const NOMI = 'https://nominatim.openstreetmap.org';   // solo búsquedas puntuales (reverse)
const PHOTON = 'https://photon.komoot.io/api/';        // autocompletado permitido
const CO_BBOX = '-79.1,-4.3,-66.8,13.5';
const CACHE_KEY = 'peajes_cache_v1';

const $ = id => document.getElementById(id);
// fetch JSON con tiempo límite: ningún servicio externo puede dejar la app colgada
async function getJSON(url,opt={},ms=20000){ const ac=new AbortController(); const t=setTimeout(()=>ac.abort(),ms);
  try{ const r=await fetch(url,{...opt,signal:ac.signal}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
  catch(e){ throw new Error(e.name==='AbortError'?'el servicio no respondió a tiempo':e.message); } finally{ clearTimeout(t); } }
const fmt = n => n==null||isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('es-CO');
const st = (msg, cls='') => { const e=$('st'); e.className='status '+cls; e.innerHTML=msg; };
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------- Mapa ----------
const CAN_ROTATE=!!(L.Map.prototype.setBearing);
// Las líneas se dibujan con margen amplio: al girar, la pantalla rotada sigue dentro del área dibujada
// y no hay que redibujar (evita que la ruta "salte" o se corte mientras se gira).
const VEC=L.svg({padding:CAN_ROTATE?0.75:0.1});
const map = L.map('map',CAN_ROTATE?{zoomControl:false,rotate:true,touchRotate:true,shiftKeyRotate:true,bearing:0,rotateControl:false,renderer:VEC}:{zoomControl:false,renderer:VEC}).setView([4.6,-74.1],6);
L.control.zoom({position:'topright'}).addTo(map);
const ESRI='https://server.arcgisonline.com/ArcGIS/rest/services/';
const base=L.tileLayer(ESRI+'World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,keepBuffer:4,attribution:'Mapa © Esri, HERE, Garmin, OpenStreetMap'}).addTo(map);
let tileErr=0; base.on('tileerror',()=>{ if(++tileErr===8){ map.removeLayer(base); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:4,attribution:'© OpenStreetMap'}).addTo(map); } });
const tollLayer = L.featureGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const rtLayer = L.layerGroup().addTo(map);
const bubLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);

const CAR_SVG = `<svg class="car" width="46" height="46" viewBox="0 0 46 46" style="position:relative;filter:drop-shadow(0 4px 5px rgba(0,0,0,.35))">
  <defs>
    <linearGradient id="cb" x1="0" x2="1"><stop offset="0" stop-color="#1e4fd8"/><stop offset=".5" stop-color="#3f7bff"/><stop offset="1" stop-color="#1e4fd8"/></linearGradient>
    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0ff"/><stop offset="1" stop-color="#5b8fd9"/></linearGradient>
  </defs>
  <rect x="12" y="9" width="4" height="7" rx="1.6" fill="#1b1f27"/><rect x="30" y="9" width="4" height="7" rx="1.6" fill="#1b1f27"/>
  <rect x="12" y="29" width="4" height="7" rx="1.6" fill="#1b1f27"/><rect x="30" y="29" width="4" height="7" rx="1.6" fill="#1b1f27"/>
  <path d="M23 4c6.5 0 9.5 2.5 9.5 7v25c0 4-3 6-9.5 6s-9.5-2-9.5-6V11c0-4.5 3-7 9.5-7z" fill="url(#cb)" stroke="#fff" stroke-width="1.6"/>
  <ellipse cx="12.6" cy="16.4" rx="1.9" ry="1.3" fill="#1e4fd8" stroke="#fff" stroke-width=".8"/><ellipse cx="33.4" cy="16.4" rx="1.9" ry="1.3" fill="#1e4fd8" stroke="#fff" stroke-width=".8"/>
  <path d="M16.3 15.2c3.8-2.2 9.6-2.2 13.4 0l-1.3 5.6c-3.2-.9-7.6-.9-10.8 0z" fill="url(#cg)"/>
  <rect x="17.2" y="21.5" width="11.6" height="9" rx="2.6" fill="#2a5be0"/>
  <path d="M17.6 32.2c3.2.8 7.6.8 10.8 0l1 3.6c-4 1.4-8.8 1.4-12.8 0z" fill="url(#cg)" opacity=".9"/>
  <ellipse cx="17.3" cy="6.6" rx="2" ry="1.2" fill="#fff8d6"/><ellipse cx="28.7" cy="6.6" rx="2" ry="1.2" fill="#fff8d6"/>
  <rect x="16" y="40.2" width="3.4" height="1.4" rx=".7" fill="#ff4d4d"/><rect x="26.6" y="40.2" width="3.4" height="1.4" rx=".7" fill="#ff4d4d"/>
</svg>`;
const carIcon = deg => L.divIcon({className:'',iconSize:[46,46],iconAnchor:[23,23],
  html:`<div style="position:relative;width:46px;height:46px"><div class="pulse"></div><div class="carrot" style="transform:rotate(${(deg||0)+(map.getBearing?map.getBearing():0)}deg);width:46px;height:46px;transition:transform .4s">${CAR_SVG}</div></div>`});
const tollPin=(k,verified)=>L.divIcon({className:'',iconSize:[34,44],iconAnchor:[17,42],popupAnchor:[0,-38],html:`<div style="position:relative;width:34px;height:44px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))">
  <svg width="34" height="44" viewBox="0 0 34 44"><defs><linearGradient id="tp${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffa53a"/><stop offset="1" stop-color="#f06a00"/></linearGradient></defs>
  <path d="M17 1.5C8.4 1.5 1.5 8.3 1.5 16.8c0 11.3 13.4 24.2 14.4 25.1.6.6 1.6.6 2.2 0 1-.9 14.4-13.8 14.4-25.1C32.5 8.3 25.6 1.5 17 1.5z" fill="url(#tp${k})" stroke="#fff" stroke-width="2"/>
  <circle cx="17" cy="16.5" r="10" fill="#fff"/>
  <text x="17" y="21.6" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="14.5" font-weight="800" fill="#f06a00">P</text></svg>
  <span style="position:absolute;top:-6px;right:-8px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#111318;color:#fff;font:700 10.5px/18px Inter,system-ui;text-align:center;border:2px solid #fff">${k}</span>
  ${verified?'<span style="position:absolute;bottom:6px;right:-6px;width:14px;height:14px;border-radius:50%;background:#0f9d6b;color:#fff;font:700 9px/14px system-ui;text-align:center;border:2px solid #fff">✓</span>':''}
</div>`});
const endIcon = b => L.divIcon({className:'',iconSize:[18,18],iconAnchor:[9,9],html:`<div class="endpin ${b?'b':''}"></div>`});

// Tarifas Cat. I verificadas en prensa/ANI (actualizado 1-nov-2026). Solo se aplican a Categoría I.
const VERIF=[
 {k:['la pintada'],v:23900,d:'16-ene-2026',src:'ANI / El Colombiano'},
 {k:['amaga'],v:25900,d:'16-jul-2026',src:'El Colombiano'},
 {k:['copacabana','guarne'],v:18500,d:'ene-2026',src:'El Colombiano',warn:'Cambió el operador (fin de Devimed, 31-jul-2026): confirmar'},
 {k:['tunel de oriente','tunel oriente'],v:26300,d:'17-ene-2026',src:'Gobernación de Antioquia'},
 {k:['variante palmas'],v:20200,d:'17-ene-2026',src:'Gobernación de Antioquia'},
 {k:['santa elena'],v:15100,d:'17-ene-2026',src:'Gobernación de Antioquia'},
 {k:['pajarito'],v:12900,d:'17-ene-2026',src:'Gobernación de Antioquia'},
 {k:['cisneros'],v:29400,d:'16-ene-2026',src:'ANI / Portafolio'},
 {k:['trapiche'],v:20300,d:'2026',src:'Portafolio'},
 {k:['aburra'],v:24909,d:'16-ene-2026',src:'El Colombiano'},
 {k:['santagueda'],v:16200,d:'9-ene-2026',src:'Portafolio'},
 {k:['pavas'],v:16200,d:'9-ene-2026',src:'Portafolio'},
 {k:['tarapaca ii','tarapaca 2'],v:17800,d:'9-ene-2026',src:'El Colombiano',diff:true},
 {k:['tarapaca i','tarapaca 1','tarapaca'],v:17800,d:'9-ene-2026',src:'El Colombiano',diff:true},
 {k:['circasia'],v:21200,d:'9-ene-2026',src:'El Colombiano',diff:true},
 {k:['el roble'],v:12400,d:'2026',src:'Portafolio'},
 {k:['gambote'],v:12600,d:'2026',src:'Portafolio'},
 {k:['loboguerrero'],v:12400,d:'2026',src:'Portafolio'},
 {k:['media canoa','mediacanoa'],v:13200,d:'2026',src:'Portafolio'},
 {k:['cencar'],v:13200,d:'2026',src:'Portafolio'},
 {k:['la gomez'],v:16300,d:'2026',src:'Portafolio'},
 {k:['los curos'],v:7600,d:'2026',src:'Portafolio'},
 {k:['puente amarillo'],v:14300,d:'2026',src:'Portafolio'},
 {k:['gualanday'],v:15300,d:'2026',src:'Portafolio'},
 {k:['mondonedo'],v:9900,d:'2026',src:'Portafolio'},
 {k:['pipiral'],v:29100,d:'16-ene-2026',src:'El Colombiano'},
 {k:['macheta'],v:27326,d:'16-ene-2026',src:'El Colombiano'},
 {k:['naranjal'],v:17026,d:'16-ene-2026',src:'El Colombiano'},
 {k:['boqueron'],v:19864,d:'16-ene-2026',src:'El Colombiano'},
 {k:['el placer'],v:20915,d:'16-ene-2026',src:'El Colombiano'},
 {k:['puerto berrio'],v:14083,d:'16-ene-2026',src:'El Colombiano'},
 {k:['fusca','andes','unisabana'],v:16100,d:'1-jul-2026',src:'Canal Trece'},
 {k:['albarracin'],v:12400,d:'15-ene-2026',src:'El Colombiano'},
 {k:['tuta'],v:12400,d:'15-ene-2026',src:'El Colombiano'},
 {k:['turbaco'],v:5800,d:'10-ene-2026',src:'El Colombiano'},
];
const norm=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
function verifOf(t){ if(t._vf!==undefined) return t._vf; const n=' '+norm(t.name)+' ';
  t._vf=VERIF.find(e=>e.k.some(k=>n.includes(' '+k+' ')))||null; return t._vf; }
function isCatI(){ const f=FIELDS.find(x=>x.name===$('cat').value); return f&&catNum(f)===1; }
// precio usado + info
function priceOf(t,cat){
  const raw=typeof t.attrs[cat]==='number'?t.attrs[cat]:null;
  if(!isCatI()) return {v:raw,raw};
  const e=verifOf(t);
  if(!e){ const mode=$('unv')?$('unv').value:'est'; return mode==='est'?{v:UNV_EST,raw,est:true}:{v:raw,raw}; }
  if(e.diff && $('diff') && $('diff').checked) return {v:700,raw,e,isDiff:true};
  return {v:e.v,raw,e};
}
const UNV_EST=17500;
let V=null;
let TOLLS=[], FIELDS=[], NAME_F=null, A=null, B=null, ROUTES=[], SEL=0;
let ME=null, carMarker=null, watchId=null, lastMe=null;

// ---------- ArcGIS ----------
async function j(url){ const d=await getJSON(url); if(d.error) throw new Error(d.error.message||'error ArcGIS'); return d; }
async function getItem(id){ for(const p of PORTALS){ try{ return {portal:p,info:await j(`${p}/sharing/rest/content/items/${id}?f=json`)}; }catch(e){} } throw new Error('ítem '+id+' no accesible'); }
const getItemData=(portal,id)=>j(`${portal}/sharing/rest/content/items/${id}/data?f=json`);

async function discoverLayers(){
  const dash=await getItem(DASH_ID); const data=await getItemData(dash.portal,DASH_ID); const txt=JSON.stringify(data);
  const ids=[...new Set((txt.match(/[0-9a-f]{32}/g)||[]).filter(x=>x!==DASH_ID))];
  const urls=new Set((txt.match(/https?:\/\/[^"\\]+\/(FeatureServer|MapServer)(\/\d+)?/g)||[]));
  for(const id of ids){ try{
    const it=await getItem(id); const t=it.info.type||'';
    if(t==='Web Map'){ const wm=await getItemData(it.portal,id);
      for(const l of (wm.operationalLayers||[])){ if(l.url) urls.add(l.url); for(const sl of (l.layers||[])) if(sl.url) urls.add(sl.url);
        if(!l.url&&l.itemId){ try{ const li=await getItem(l.itemId); if(li.info.url) urls.add(li.info.url+(l.layerId!=null?'/'+l.layerId:'')); }catch(e){} } }
    } else if(it.info.url && /Server/.test(it.info.url)) urls.add(it.info.url);
  }catch(e){} }
  const layers=[];
  for(let u of urls){ u=u.replace(/\/$/,''); try{
    if(/\/\d+$/.test(u)){ const m=await j(u+'?f=json'); if(m.geometryType==='esriGeometryPoint') layers.push({url:u,meta:m}); }
    else{ const s=await j(u+'?f=json'); for(const l of (s.layers||[])){ try{ const m=await j(`${u}/${l.id}?f=json`); if(m.geometryType==='esriGeometryPoint') layers.push({url:`${u}/${l.id}`,meta:m}); }catch(e){} } }
  }catch(e){} }
  if(!layers.length) throw new Error('no se encontró una capa de puntos pública en el tablero');
  const pea=layers.filter(l=>/peaj/i.test(l.meta.name||'')||/peaj/i.test(l.url));
  const uniq={}; (pea.length?pea:layers).forEach(l=>uniq[l.url]=l); return Object.values(uniq);
}
async function queryAll(u){ const out=[]; let off=0;
  for(let k=0;k<50;k++){ const d=await j(`${u}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json&resultOffset=${off}&resultRecordCount=1000`);
    const f=d.features||[]; out.push(...f); if(!d.exceededTransferLimit||!f.length) break; off+=f.length; } return out; }
async function loadFromArcGIS(){
  st('Buscando la capa de peajes de Supertransporte…');
  const layers=await discoverLayers(); const all=[]; let fields=[];
  for(const l of layers){ const feats=await queryAll(l.url);
    fields=fields.concat((l.meta.fields||[]).map(f=>({name:f.name,alias:f.alias||f.name,type:f.type})));
    feats.forEach(f=>{ if(f.geometry&&isFinite(f.geometry.y)) all.push({lat:f.geometry.y,lon:f.geometry.x,attrs:f.attributes}); }); }
  const seen={}; fields=fields.filter(f=>!seen[f.name]&&(seen[f.name]=1));
  return {tolls:all,fields,source:layers.map(l=>`${esc(l.meta.name)} — ${esc(l.url)}`).join('<br>')};
}

// ---------- Archivo manual ----------
function numOr(v){ if(v==null) return v; const s=String(v).trim().replace(/\$|\s/g,''); if(/^-?[\d.]+,\d+$/.test(s)) return +s.replace(/\./g,'').replace(',','.'); if(/^-?\d{1,3}(\.\d{3})+$/.test(s)) return +s.replace(/\./g,''); return s!==''&&!isNaN(+s)?+s:v; }
function parseCSV(t){
  const h0=t.split('\n')[0]; const sep=(h0.match(/;/g)||[]).length>(h0.match(/,/g)||[]).length?';':',';
  const rows=[]; let row=[],cur='',q=false;
  for(let i=0;i<t.length;i++){ const c=t[i];
    if(q){ if(c=='"'&&t[i+1]=='"'){cur+='"';i++;} else if(c=='"') q=false; else cur+=c; }
    else if(c=='"') q=true; else if(c==sep){row.push(cur);cur='';} else if(c=='\n'){row.push(cur);rows.push(row);row=[];cur='';} else if(c!='\r') cur+=c; }
  if(cur||row.length){row.push(cur);rows.push(row);}
  const h=rows.shift().map(s=>s.trim());
  const la=h.findIndex(x=>/^(lat|latitud|latitude|y)$/i.test(x)), lo=h.findIndex(x=>/^(lon|lng|long|longitud|longitude|x)$/i.test(x));
  if(la<0||lo<0) throw new Error('el CSV necesita columnas de latitud y longitud');
  const tolls=rows.filter(r=>r.length>1).map(r=>{ const a={}; h.forEach((k,i)=>a[k]=numOr(r[i])); return {lat:+String(r[la]).replace(',','.'),lon:+String(r[lo]).replace(',','.'),attrs:a}; }).filter(t=>isFinite(t.lat)&&isFinite(t.lon));
  return {tolls,fields:h.map(k=>({name:k,alias:k,type:tolls.some(t=>typeof t.attrs[k]==='number')?'esriFieldTypeDouble':'esriFieldTypeString'})),source:'Archivo CSV'};
}
function parseGeoJSON(d){
  const tolls=(d.features||[]).filter(f=>f.geometry&&f.geometry.type==='Point').map(f=>({lon:f.geometry.coordinates[0],lat:f.geometry.coordinates[1],attrs:Object.fromEntries(Object.entries(f.properties||{}).map(([k,v])=>[k,numOr(v)]))}));
  const keys=[...new Set(tolls.flatMap(t=>Object.keys(t.attrs)))];
  return {tolls,fields:keys.map(k=>({name:k,alias:k,type:tolls.some(t=>typeof t.attrs[k]==='number')?'esriFieldTypeDouble':'esriFieldTypeString'})),source:'Archivo GeoJSON'};
}

// ---------- Dataset ----------
const ROM={i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7};
function catNum(f){ const s=(f.name+' '+(f.alias||'')).toLowerCase(); if(/espec|difer|esp\b/.test(s)) return 0;
  let m=s.match(/cat(?:egor[ií]a)?[_\s.]*(\d)\b/); if(m) return +m[1];
  m=s.match(/cat(?:egor[ií]a)?[_\s.]*(vii|vi|iv|v|iii|ii|i)\b/); return m?ROM[m[1]]:0; }
const CAT_TXT={1:'Carro, campero o camioneta',2:'Bus, buseta o microbús',3:'Camión pequeño (2 ejes)',4:'Camión grande (2 ejes)',5:'Camión de 3 o 4 ejes',6:'Tractomula de 5 ejes',7:'Tractomula de 6 ejes o más'};
const RN=['','I','II','III','IV','V','VI','VII'];
function catLabel(f){ const n=catNum(f); return n&&CAT_TXT[n] ? `${CAT_TXT[n]} · Cat. ${RN[n]}` : (f.alias&&f.alias!==f.name?f.alias:f.name.replace(/_/g,' ')); }
function score(f){ const s=(f.name+' '+f.alias).toLowerCase(); let k=0; if(/cat/.test(s))k+=5; if(/tarif|valor|precio/.test(s))k+=3; if(/(^|[^a-z])(i|1)$|cat_?i\b|cat(egoria)?\s*(i|1)\b|categoria_?1|cat1/.test(s))k+=4; if(/ii|iii|iv|vi|[2-7]/.test(s))k-=1; if(/espec|difer/.test(s))k-=3; return k; }
function applyData(d,fromCache=false){
  TOLLS=d.tolls; FIELDS=d.fields;
  const str=FIELDS.filter(f=>/String/.test(f.type));
  NAME_F=(str.find(f=>/^(nombre|peaje|nombre_peaje|nom_peaje|estacion|name)$/i.test(f.name))||str.find(f=>/peaj|nombre|estaci|name/i.test(f.name+' '+f.alias))||str[0]||{}).name;
  TOLLS.forEach(t=>t.name=(NAME_F&&t.attrs[NAME_F])||'Peaje');
  const num=FIELDS.filter(f=>/Double|Integer|Single|SmallInteger/.test(f.type)&&!/objectid|fid|^id$|lat|lon|^x$|^y$|shape|codigo|cod_|año|ano|fecha/i.test(f.name)&&TOLLS.some(t=>typeof t.attrs[f.name]==='number'&&t.attrs[f.name]>=1000));
  num.sort((a,b)=>{ const x=catNum(a), y=catNum(b); if(x&&y) return x-y; if(x) return -1; if(y) return 1; return score(b)-score(a); });
  const sel=$('cat'); sel.innerHTML='';
  if(!num.length) sel.innerHTML='<option value="">Sin campo de tarifa en los datos</option>';
  num.forEach(f=>{ const o=document.createElement('option'); o.value=f.name; o.textContent=catLabel(f); sel.appendChild(o); });
  try{ const sv=localStorage.getItem('peajes_cat'); if(sv&&num.some(f=>f.name===sv)) sel.value=sv; }catch(e){}
  applyVehToFields(VEHS.find(v=>v.id===VSEL));
  drawTolls();
  $('meta').innerHTML=`<b>${TOLLS.length}</b> peajes${fromCache?' (caché local)':''}.<br>Fuente: ${d.source}<br>Nombre: <code>${esc(NAME_F||'—')}</code> · Tarifas: ${num.map(f=>'<code>'+esc(f.name)+'</code>').join(' ')||'ninguna'}`;
  st(`${TOLLS.length} peajes cargados.`,'ok'); setTimeout(()=>{ if($('st').textContent.includes('peajes cargados')) st(''); },2500);
  if(ROUTES.length) renderResults();
}
function drawTolls(){ tollLayer.clearLayers(); TOLLS.forEach(t=>L.circleMarker([t.lat,t.lon],{radius:3.5,color:'#fff',weight:1,fillColor:'#ff8a00',fillOpacity:.9}).bindPopup(popup(t)).addTo(tollLayer)); }
function popup(t){
  const rows=Object.entries(t.attrs).filter(([k,v])=>v!==null&&v!==''&&!/objectid|shape|globalid/i.test(k)).slice(0,20)
    .map(([k,v])=>{ const f=FIELDS.find(x=>x.name===k); return `<tr><th>${esc((f&&f.alias)||k)}</th><td>${typeof v==='number'&&v>=1000?v.toLocaleString('es-CO'):esc(v)}</td></tr>`; }).join('');
  let price=''; try{ const cat=$('cat').value; if(cat){ const p=priceOf(t,cat); price=`<div style="margin:6px 0 2px;font-size:18px;font-weight:700">${fmt(p.v)} <span style="font-size:11px;font-weight:500;color:${p.e?'#0f9d6b':p.est?'#c26a00':'#8a8f9c'}">${p.e?'✓ verificado '+esc(p.e.d):p.est?'estimado':'dato del tablero'}</span></div>`; } }catch(e){}
  return `<b style="font-size:13.5px">${esc(t.name)}</b>${price}<details><summary style="font-size:11.5px;color:#8a8f9c;cursor:pointer">Ver todos los datos</summary><table>${rows}</table></details>`;
}
async function boot(force=false){
  if(!force){ try{ const c=JSON.parse(localStorage.getItem(CACHE_KEY)||'null'); if(c&&Date.now()-c.t<7*864e5&&c.d.tolls.length){ applyData(c.d,true); return; } }catch(e){} }
  try{ const d=await loadFromArcGIS(); if(!d.tolls.length) throw new Error('la capa no devolvió puntos');
    try{ localStorage.setItem(CACHE_KEY,JSON.stringify({t:Date.now(),d})); }catch(e){} applyData(d);
  }catch(e){ st(`No pude descargar los peajes (${esc(e.message)}). Revisa tu conexión o carga un archivo en “Datos y fuente”.`,'err'); }
}

// ---------- Búsqueda de lugares ----------
// Photon devuelve GeoJSON; lo normalizamos a {lat,lon,name,detail,road}
function photonItems(d){ return (d.features||[]).filter(f=>!f.properties.countrycode||f.properties.countrycode==='CO').map(f=>{ const p=f.properties;
  const detail=[p.street&&p.name!==p.street?p.street:null,p.city&&p.city!==p.name?p.city:(p.county&&p.county!==p.name?p.county:null),p.state].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
  return {lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0],name:p.name||p.street||p.city||'Lugar',detail,road:p.osm_key==='highway',
    town:p.osm_key==='place'&&/^(city|town|village|municipality)$/.test(p.osm_value||p.type||''),key:p.osm_key,val:p.osm_value}; }); }
async function photon(q,limit=6,bbox=CO_BBOX){ return photonItems(await getJSON(`${PHOTON}?q=${encodeURIComponent(q)}&limit=${limit}&bbox=${bbox}`,{},10000)); }
function setupAC(inp,box,which){
  let tm, seq=0;
  inp.addEventListener('input',()=>{ if(which==='A')A=null; else if(which==='V')V=null; else B=null; clearTimeout(tm); const q=inp.value.trim(); if(q.length<3){box.hidden=true;return;}
    tm=setTimeout(async()=>{ const my=++seq; try{
      const items=await photon(q); if(my!==seq) return; box.innerHTML='';
      items.forEach(p=>{ const e=document.createElement('div'); e.innerHTML=`<b>${esc(p.name)}</b>${esc(p.detail)}`;
        e.onclick=()=>{ setPoint(which,{lat:p.lat,lon:p.lon,label:p.name+(p.detail?', '+p.detail:''),road:p.road,town:p.town,picked:!p.road,q:p.name}); inp.value=p.name+(p.detail?', '+p.detail.split(',')[0]:''); box.hidden=true; }; box.appendChild(e); });
      box.hidden=!items.length||document.activeElement!==inp; }catch(e){ box.hidden=true; } },350); });
  document.addEventListener('click',ev=>{ if(!box.contains(ev.target)&&ev.target!==inp) box.hidden=true; });
}
// "5.2237, -74.7702" → punto exacto (no se busca como texto)
function parseCoords(q){ const m=String(q).trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)$/); if(!m) return null;
  const lat=+m[1], lon=+m[2]; return (Math.abs(lat)<=90&&Math.abs(lon)<=180)?{lat,lon,label:lat.toFixed(4)+', '+lon.toFixed(4),picked:true,exact:true}:null; }
async function geocode(q){ const pc=parseCoords(q); if(pc) return pc; const it=(await photon(q,1))[0]; if(!it) throw new Error('No encontré “'+q+'”'); return {lat:it.lat,lon:it.lon,label:it.name+(it.detail?', '+it.detail:'')}; }
async function geocodeBest(q,a,b){
  const pc=parseCoords(q); if(pc) return pc;
  const pad=.3, bb=[Math.min(a.lon,b.lon)-pad,Math.min(a.lat,b.lat)-pad,Math.max(a.lon,b.lon)+pad,Math.max(a.lat,b.lat)+pad].join(',');
  let d=await photon(q,15,bb); if(!d.length) d=await photon(q,15);
  if(!d.length) throw new Error('No encontré “'+q+'”');
  // Si el nombre coincide exacto con un municipio/pueblo, se usa ese (evita veredas, quebradas o calles homónimas)
  const nq=norm(q.split(',')[0]); const towns=d.filter(r=>r.town&&norm(r.name)===nq);
  if(towns.length) d=towns; else { const exact=d.filter(r=>norm(r.name)===nq); if(exact.length) d=exact; }
  const A2=[a.lat,a.lon], B2=[b.lat,b.lon]; let best=null, bv=1e18;
  for(const r of d){ const p=[r.lat,r.lon]; const det=hav(A2,p)+hav(p,B2)-hav(A2,B2); if(det<bv){bv=det;best=r;} }
  return {lat:best.lat,lon:best.lon,label:best.name+(best.detail?', '+best.detail:''),road:best.road,town:best.town,q,detour:bv};
}
function setPoint(w,p){ if(w==='A')A=p; else if(w==='V')V=p; else B=p; drawPins(); }
function drawPins(){ pinLayer.clearLayers();
  if(A && !A.isMe) L.marker([A.lat,A.lon],{icon:endIcon(false)}).addTo(pinLayer);
  if(V) L.marker([V.lat,V.lon],{icon:L.divIcon({className:'',iconSize:[14,14],iconAnchor:[7,7],html:'<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #111318;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>'})}).bindTooltip('Pasar por').addTo(pinLayer);
  if(B) L.marker([B.lat,B.lon],{icon:endIcon(true)}).addTo(pinLayer); }
function pointMenu(latlng){
  const p={lat:latlng.lat,lon:latlng.lng,label:latlng.lat.toFixed(4)+', '+latlng.lng.toFixed(4)};
  const html=`<div style="display:flex;flex-direction:column;gap:6px;min-width:150px">
    <b style="font-size:12px;color:#8a8f9c">Usar este punto como…</b>
    <button class="chip" data-w="A">● Salida</button><button class="chip" data-w="V">○ Pasar por aquí</button><button class="chip" data-w="B">■ Destino</button></div>`;
  const pop=L.popup({closeButton:false}).setLatLng(latlng).setContent(html).openOn(map);
  setTimeout(()=>pop.getElement().querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{
    const w=b.dataset.w; setPoint(w,{...p,picked:true,exact:true}); $(w==='A'?'orig':w==='V'?'via':'dest').value=p.label; map.closePopup(); if(A&&B) $('go').click(); }),0);
}
map.on('contextmenu',e=>pointMenu(e.latlng));
$('swap').onclick=()=>{ [A,B]=[B,A]; const v=$('orig').value; $('orig').value=$('dest').value; $('dest').value=v; if(B&&B.isMe){ B={...B,isMe:false}; } drawPins(); };

// ---------- Ubicación + carro ----------
function bearing(a,b){ const r=Math.PI/180, y=Math.sin((b[1]-a[1])*r)*Math.cos(b[0]*r), x=Math.cos(a[0]*r)*Math.sin(b[0]*r)-Math.sin(a[0]*r)*Math.cos(b[0]*r)*Math.cos((b[1]-a[1])*r); return (Math.atan2(y,x)/r+360)%360; }
// diferencia angular en (-180,180]
const angDiff=(a,b)=>((b-a+540)%360)-180;
function updateCar(lat,lon,heading,speed){
  let raw=heading;
  const slow=speed!=null && !isNaN(speed) && speed<1.5;          // < 5 km/h: el rumbo del GPS no es confiable
  if((raw==null||isNaN(raw)) && lastMe && hav(lastMe,[lat,lon])>12) raw=bearing(lastMe,[lat,lon]);
  const prev=carMarker&&carMarker._deg!=null?carMarker._deg:null;
  let deg;
  if(raw==null||isNaN(raw)||slow) deg=prev!=null?prev:0;            // detenido o sin dato: conservar rumbo
  else if(prev==null) deg=raw;
  else { const d=angDiff(prev,raw); deg=Math.abs(d)<4?prev:(prev+d*0.35+360)%360; }   // suavizado + zona muerta
  if(!lastMe || hav(lastMe,[lat,lon])>3) lastMe=[lat,lon];        // punto previo para estimar rumbo
  if(!carMarker){ carMarker=L.marker([lat,lon],{icon:carIcon(deg),zIndexOffset:5000}).addTo(map); }
  else carMarker.setLatLng([lat,lon]);
  carMarker._deg=deg;
  if(CAN_ROTATE&&HEADUP&&FOLLOW) animateBearing(-deg); else refreshCarRot();
}
// Giro animado del mapa hacia el rumbo objetivo (sin saltos)
let BEAR_TARGET=null, BEAR_RAF=null;
function animateBearing(target){
  if(!CAN_ROTATE) return;
  BEAR_TARGET=(target+360)%360;
  if(BEAR_RAF) return;
  const step=()=>{
    const cur=map.getBearing(), d=angDiff(cur,BEAR_TARGET);
    if(Math.abs(d)<0.3){ map.setBearing(BEAR_TARGET); BEAR_RAF=null; return; }
    const mv=Math.sign(d)*Math.min(Math.abs(d)*0.12, 4);          // máx. 4° por cuadro, desacelera al llegar
    map.setBearing((cur+mv+360)%360);
    BEAR_RAF=requestAnimationFrame(step);
  };
  BEAR_RAF=requestAnimationFrame(step);
}
function stopBearingAnim(){ if(BEAR_RAF){ cancelAnimationFrame(BEAR_RAF); BEAR_RAF=null; } }
function isSecure(){ return window.isSecureContext || location.protocol==='file:'; }
function showHelp(kind){
  const b=$('helpbox');
  const common=`<ol>
    <li>En Chrome toca los <b>3 puntos ⋮ → Configuración → Configuración de sitios → Ubicación</b> y actívala. Si este archivo aparece en <b>Bloqueados</b>, cámbialo a <b>Permitir</b>.</li>
    <li>En el celular: <b>Ajustes → Aplicaciones → Chrome → Permisos → Ubicación → “Permitir solo mientras se usa”</b>.</li>
    <li>Revisa que el <b>GPS / Ubicación</b> esté encendido en la barra rápida del celular.</li>
    <li>Recarga la página y vuelve a tocar <b>Mi ubicación</b>.</li></ol>`;
  const msgs={
    denied:`<b>La ubicación está bloqueada.</b> Así la activas:${common}Si aun así no funciona, tu celular no deja que los archivos guardados en el teléfono pidan la ubicación. En ese caso <b>toca el mapa donde estás</b> o escribe tu ciudad: la ruta queda igual.`,
    unavailable:`<b>No se encontró tu posición.</b> Enciende el GPS, sal a un lugar abierto o activa los datos o el Wi‑Fi, y reintenta.`,
    timeout:`<b>La ubicación tardó demasiado.</b> Revisa que el GPS esté encendido y vuelve a intentar.`,
    insecure:`<b>Este navegador no permite pedir la ubicación desde aquí.</b> Ábrelo con Chrome, o toca el mapa donde estás.`
  };
  b.innerHTML=`<div class="help"><button class="x" onclick="this.parentNode.remove()">×</button>${msgs[kind]}</div>`;
}
function locate(asOrigin=true){
  $('helpbox').innerHTML='';
  if(!navigator.geolocation||!isSecure()){ showHelp('insecure'); return; }
  st('Buscando tu ubicación…');
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude:lat,longitude:lon,heading,accuracy}=pos.coords;
    ME={lat,lon}; updateCar(lat,lon,heading,pos.coords.speed);
    if(asOrigin){ A={lat,lon,label:'Mi ubicación',isMe:true}; $('orig').value='Mi ubicación'; drawPins();
      getJSON(`${NOMI}/reverse?format=json&accept-language=es&zoom=16&lat=${lat}&lon=${lon}`,{},8000).then(d=>{ if(d&&d.display_name&&A&&A.isMe) $('orig').value='Mi ubicación · '+d.display_name.split(',').slice(0,2).join(','); }).catch(()=>{}); }
    map.setView([lat,lon],Math.max(map.getZoom(),17));
    st(`Ubicación encontrada (±${Math.round(accuracy)} m).`,'ok');
    startWatch();
  },err=>{ st(''); showHelp({1:'denied',2:'unavailable',3:'timeout'}[err.code]||'unavailable'); },
  {enableHighAccuracy:true,timeout:15000,maximumAge:30000});
}
let LIVE=false; try{ LIVE=localStorage.getItem('peajes_live')==='1'; }catch(e){}
function paintLive(){ $('fabLive').classList.toggle('on',LIVE); $('liveTxt').textContent=LIVE?'En vivo':'En vivo: no'; }
function stopWatch(){ if(watchId!=null){ navigator.geolocation.clearWatch(watchId); watchId=null; } }
function startWatch(){ if(!LIVE) return; if(watchId!=null) return;
  watchId=navigator.geolocation.watchPosition(p=>{ ME={lat:p.coords.latitude,lon:p.coords.longitude}; updateCar(ME.lat,ME.lon,p.coords.heading,p.coords.speed);
    if(A&&A.isMe){ A.lat=ME.lat; A.lon=ME.lon; } if(FOLLOW) map.panTo([ME.lat,ME.lon],{animate:true,duration:0.9,easeLinearity:1,noMoveStart:true}); checkOffRoute(ME.lat,ME.lon,p.coords.accuracy||50); },()=>{}, {enableHighAccuracy:true,maximumAge:5000}); }
let PRIO='fast';
try{ const sp=localStorage.getItem('peajes_prio'); if(sp) PRIO=sp; }catch(e){}
function paintPrio(){ document.querySelectorAll('#prio .chip').forEach(c=>c.classList.toggle('on',c.dataset.p===PRIO)); }
paintPrio();
document.querySelectorAll('#prio .chip').forEach(c=>c.onclick=()=>{ PRIO=c.dataset.p; paintPrio(); try{localStorage.setItem('peajes_prio',PRIO);}catch(e){} if(ROUTES.length) renderResults(pickByPrio(),true); });
function pickByPrio(){
  if(!ROUTES.length) return 0;
  const tol=+$('tol').value||120, cat=$('cat').value, gal=+$('gal').value, kmg=+$('kmg').value;
  const val=r=>{ if(PRIO==='short') return r.distance; if(PRIO==='fast') return r.duration;
    const hits=routeHits(r,tol); const t=cat?hits.reduce((s,h)=>s+(priceOf(h.t,cat).v||0),0):hits.length;
    return t+(gal&&kmg? r.distance/1000/kmg*gal : 0) + r.duration/1e6; };
  let b=0; ROUTES.forEach((r,i)=>{ if(val(r)<val(ROUTES[b])) b=i; }); return b;
}
// ---------- Vehículos ----------
let VEHS=[], VSEL=null, VEDIT=null, TRIP=1;
try{ VEHS=JSON.parse(localStorage.getItem('peajes_vehs')||'[]'); VSEL=localStorage.getItem('peajes_vsel'); TRIP=+(localStorage.getItem('peajes_trip')||1)||1; }catch(e){}
const saveVehs=()=>{ try{ localStorage.setItem('peajes_vehs',JSON.stringify(VEHS)); localStorage.setItem('peajes_vsel',VSEL||''); }catch(e){} };
function drawVehs(){
  $('vehs').innerHTML=VEHS.map(v=>`<button class="veh ${v.id===VSEL?'on':''}" data-id="${v.id}" type="button">${esc(v.name)}<small>Cat. ${RN[v.cat]} · ${v.kmg||'—'} km/gal</small></button>`).join('')+
    `<button class="veh add" id="vadd" type="button">＋ Agregar<small>${VEHS.length?'otro vehículo':'tu carro'}</small></button>`;
  $('vehs').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>selectVeh(b.dataset.id));
  $('vadd').onclick=()=>openVeh(null);
}
function applyVehToFields(v){
  if(!v) return;
  const opt=[...$('cat').options].find(o=>{ const f=FIELDS.find(x=>x.name===o.value); return f&&catNum(f)===+v.cat; });
  if(opt) $('cat').value=opt.value;
  $('kmg').value=v.kmg||''; $('gal').value=v.gal||'';
}
function selectVeh(id){ VSEL=(VSEL===id?null:id); saveVehs(); drawVehs(); applyVehToFields(VEHS.find(v=>v.id===VSEL)); if(ROUTES.length) renderResults(); }
function openVeh(id){
  VEDIT=id; const v=VEHS.find(x=>x.id===id)||{name:'',cat:1,fuel:'Gasolina corriente',kmg:'',gal:''};
  $('vtitle').textContent=id?'Editar vehículo':'Nuevo vehículo'; $('vname').value=v.name; $('vcat').value=v.cat; $('vfuel').value=v.fuel; $('vkmg').value=v.kmg; $('vgal').value=v.gal;
  $('vdel').style.display=id?'':'none'; $('vmodal').hidden=false;
}
$('vcancel').onclick=()=>$('vmodal').hidden=true;
$('vsave').onclick=()=>{
  const v={id:VEDIT||String(Date.now()),name:$('vname').value.trim()||'Mi vehículo',cat:+$('vcat').value,fuel:$('vfuel').value,kmg:+$('vkmg').value||'',gal:+$('vgal').value||''};
  const i=VEHS.findIndex(x=>x.id===v.id); if(i>=0) VEHS[i]=v; else VEHS.push(v);
  VSEL=v.id; saveVehs(); $('vmodal').hidden=true; drawVehs(); applyVehToFields(v); if(ROUTES.length) renderResults();
};
$('vdel').onclick=()=>{ VEHS=VEHS.filter(x=>x.id!==VEDIT); if(VSEL===VEDIT) VSEL=null; saveVehs(); $('vmodal').hidden=true; drawVehs(); if(ROUTES.length) renderResults(); };
$('vedit').onclick=e=>{ e.preventDefault(); if(VSEL) openVeh(VSEL); else if(VEHS[0]) openVeh(VEHS[0].id); else openVeh(null); };
function paintTrip(){ document.querySelectorAll('#trip button').forEach(b=>b.classList.toggle('on',+b.dataset.t===TRIP)); }
document.querySelectorAll('#trip button').forEach(b=>b.onclick=()=>{ TRIP=+b.dataset.t; paintTrip(); try{localStorage.setItem('peajes_trip',TRIP);}catch(e){} if(ROUTES.length) renderResults(); });
paintTrip(); drawVehs();

// ---------- Fuera de ruta → recalcular ----------
let OFF=0, LAST_RR=0, REROUTING=false;
function toast(msg,ms=3500){ const t=$('toast'); t.textContent=msg; t.hidden=false; clearTimeout(t._tm); t._tm=setTimeout(()=>t.hidden=true,ms); }
function distToRoute(p,c){ let best=1e12; const step=c.length>4000?2:1; for(let i=step;i<c.length;i+=step){ const d=segDist(p,c[i-step],c[i])[0]; if(d<best) best=d; } return best; }
function progressKm(p,c){ const cum=cumDist(c); let best=1e12, at=0; for(let i=1;i<c.length;i++){ const [d,f]=segDist(p,c[i-1],c[i]); if(d<best){best=d; at=cum[i-1]+f*(cum[i]-cum[i-1]);} } return at; }
function checkOffRoute(lat,lon,acc){
  if(!$('autorr').checked || !ROUTES.length || !B || REROUTING) return;
  const r=ROUTES[SEL]; if(!r) return;
  if(acc>120) return;                                   // GPS poco preciso: no decidir
  if(hav([lat,lon],[B.lat,B.lon])<300) return;          // ya llegaste
  const d=distToRoute([lat,lon],r.coords), lim=Math.max(120,acc*1.5);
  if(d<=lim){ OFF=0; return; }
  OFF++;
  if(OFF<3 || Date.now()-LAST_RR<30000) return;         // 3 lecturas seguidas y máx. 1 recálculo cada 30 s
  OFF=0; LAST_RR=Date.now(); REROUTING=true;
  toast('Te saliste de la ruta. Recalculando…');
  // si ya pasaste la parada, quitarla
  if(V){ const pv=progressKm([V.lat,V.lon],r.coords), pm=progressKm([lat,lon],r.coords); if(pm>pv || hav([lat,lon],[V.lat,V.lon])<500){ V=null; $('via').value=''; } }
  A={lat,lon,label:'Mi ubicación',isMe:true}; $('orig').value='Mi ubicación';
  calc({reroute:true});
}

let FOLLOW=false;
function setFollow(on){ FOLLOW=on; if(!on&&HEADUP){ HEADUP=false; stopBearingAnim(); if(CAN_ROTATE) animateBearing(0); } $('fabLoc').classList.toggle('on',on); syncBubbles(); }
function syncBubbles(){ const hide=FOLLOW||map.getZoom()>=15; if(hide&&map.hasLayer(bubLayer)) map.removeLayer(bubLayer); if(!hide&&!map.hasLayer(bubLayer)) map.addLayer(bubLayer); }
map.on('zoomend',()=>syncBubbles());
function centerCar(){
  if(!carMarker){ if(LIVE) locate(false); else toast('Activa “En vivo” para ver tu ubicación'); return; }
  setFollow(true);
  map.setView(carMarker.getLatLng(), Math.max(map.getZoom(),18), {animate:true});
  if(innerWidth<860) scrollTo({top:0,behavior:'smooth'});
}
map.on('dragstart',()=>setFollow(false));
// Si no hay GPS, ubicar el carro en el inicio de la ruta mirando hacia adelante
function carAtRouteStart(r){
  if(ME) return;
  const c=r.coords; if(!c||c.length<2) return;
  let k=1; while(k<c.length-1 && hav(c[0],c[k])<40) k++;
  const deg=bearing(c[0],c[k]);
  lastMe=null;
  if(!carMarker) carMarker=L.marker(c[0],{icon:carIcon(deg),zIndexOffset:5000}).addTo(map);
  else { carMarker.setLatLng(c[0]); carMarker.setIcon(carIcon(deg)); }
  carMarker._deg=deg;
}
$('geo').onclick=()=>locate(true);
function setLive(on){ LIVE=on; try{localStorage.setItem('peajes_live',on?'1':'0');}catch(e){} paintLive();
  if(on){ toast('Ubicación en vivo activada'); locate(false); } else { stopWatch(); setFollow(false); toast('Ubicación en vivo apagada: no se usa el GPS'); } }
$('fabLive').onclick=()=>setLive(!LIVE);
// sin pantalla visible no tiene sentido leer GPS: se pausa y se reanuda solo
document.addEventListener('visibilitychange',()=>{ if(document.hidden) stopWatch(); else if(LIVE&&ME) startWatch(); });
function toggleBig(){ document.body.classList.toggle('bigmap'); setTimeout(()=>map.invalidateSize(),280); if(document.body.classList.contains('bigmap')) scrollTo({top:0,behavior:'smooth'}); }
$('fabBig').onclick=toggleBig;
// ---------- Rotación ----------
let HEADUP=false;
function refreshCarRot(){ if(!carMarker) return; const el=carMarker.getElement(); const r=el&&el.querySelector('.carrot'); if(r) r.style.transform=`rotate(${(carMarker._deg||0)+(map.getBearing?map.getBearing():0)}deg)`; }
function paintCmp(){ if(!CAN_ROTATE) return; const b=map.getBearing(); const show=HEADUP||Math.abs(((b%360)+360)%360)>1;
  $('fabCmp').hidden=!show; $('cmpN').style.transform=`rotate(${b}deg)`; $('fabCmp').classList.toggle('hu',HEADUP); $('cmpTxt').textContent=HEADUP?'RUMBO':'N'; }
if(CAN_ROTATE){
  map.on('rotate',()=>{ refreshCarRot(); paintCmp(); });
  map.getContainer().addEventListener('touchstart',e=>{ if(e.touches.length>=2) stopBearingAnim(); },{passive:true});
  $('fabCmp').onclick=()=>{
    if(HEADUP){ HEADUP=false; stopBearingAnim(); animateBearing(0); toast('Norte arriba'); }
    else if(FOLLOW&&carMarker){ HEADUP=true; animateBearing(-(carMarker._deg||0)); toast('Dirección arriba: el mapa gira con tu rumbo'); }
    else { map.setBearing(0); }
    paintCmp(); };
}
$('grab').onclick=toggleBig;
paintLive();
$('fabLoc').onclick=()=>{ if(FOLLOW){ setFollow(false); return; } centerCar(); };
// Si el permiso ya estaba concedido, muestra el carro sin preguntar
try{ navigator.permissions&&navigator.permissions.query({name:'geolocation'}).then(r=>{ if(r.state==='granted' && LIVE) locate(false); }).catch(()=>{}); }catch(e){}

// ---------- Geometría ----------
const R=6371000, rad=Math.PI/180;
function segDist(p,a,b){ const k=Math.cos(p[0]*rad);
  const ax=(a[1]-p[1])*k*rad*R, ay=(a[0]-p[0])*rad*R, bx=(b[1]-p[1])*k*rad*R, by=(b[0]-p[0])*rad*R;
  const dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy; let t=L2?-(ax*dx+ay*dy)/L2:0; t=Math.max(0,Math.min(1,t)); return [Math.hypot(ax+t*dx,ay+t*dy),t]; }
function hav(a,b){ const dl=(b[0]-a[0])*rad, dn=(b[1]-a[1])*rad; const h=Math.sin(dl/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dn/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
function routeHits(r,tol){ if(!TOLLS.length) return []; const k=tol+'|'+TOLLS.length; if(r._hk!==k){ r._hits=tollsOnRoute(r.coords,tol); r._hk=k; } return r._hits; }
function tollsOnRoute(coords,tol){
  const cum=[0]; for(let i=1;i<coords.length;i++) cum.push(cum[i-1]+hav(coords[i-1],coords[i]));
  let a=90,b=-90,c=180,d=-180; coords.forEach(p=>{a=Math.min(a,p[0]);b=Math.max(b,p[0]);c=Math.min(c,p[1]);d=Math.max(d,p[1]);});
  const pad=.02, hits=[];
  for(const t of TOLLS){ if(t.lat<a-pad||t.lat>b+pad||t.lon<c-pad||t.lon>d+pad) continue;
    const p=[t.lat,t.lon]; let pass=null; const passes=[];
    for(let i=1;i<coords.length;i++){ const x=coords[i-1], y=coords[i];
      if(Math.abs(x[0]-p[0])>.05&&Math.abs(y[0]-p[0])>.05&&Math.sign(x[0]-p[0])===Math.sign(y[0]-p[0])) continue;
      const [dd,f]=segDist(p,x,y); const km=(cum[i-1]+f*(cum[i]-cum[i-1]))/1000;
      if(dd<=tol){ if(pass && km-pass.lastKm<3){ pass.lastKm=km; if(dd<pass.dist){pass.dist=dd;pass.km=km;} } else { pass={dist:dd,km,lastKm:km}; passes.push(pass); } }
    }
    passes.forEach(ps=>hits.push({t,dist:ps.dist,km:ps.km,again:passes.length>1}));
  }
  hits.sort((x,y)=>x.km-y.km);
  const out=[]; for(const h of hits){ const pv=out[out.length-1]; if(pv&&pv.t.name===h.t.name&&pv.t!==h.t&&Math.abs(pv.km-h.km)<1.5){pv.dup=(pv.dup||1)+1;continue;} out.push(h); }
  return out;
}
// ---------- Tipo de vía (Valhalla) ----------
const VALHALLA='https://valhalla1.openstreetmap.de';
const RT={ troncal:{c:'#2f6bff',n:'Troncal / autopista'}, principal:{c:'#12a150',n:'Vía principal'}, secundaria:{c:'#f59e0b',n:'Secundaria'}, calle:{c:'#7c8799',n:'Calle / local'}, destapada:{c:'#8b4513',n:'Destapada'} };
function encPoly(c,prec=6){ const f=Math.pow(10,prec); let out='',pl=0,pn=0; const enc=v=>{ v=v<0?~(v<<1):(v<<1); let s=''; while(v>=0x20){ s+=String.fromCharCode((0x20|(v&0x1f))+63); v>>=5; } return s+String.fromCharCode(v+63); };
  for(const p of c){ const la=Math.round(p[0]*f), lo=Math.round(p[1]*f); out+=enc(la-pl)+enc(lo-pn); pl=la; pn=lo; } return out; }
function decPoly(str,prec=6){ const f=Math.pow(10,prec); let i=0,la=0,lo=0; const out=[];
  while(i<str.length){ for(const k of [0,1]){ let b,sh=0,r=0; do{ b=str.charCodeAt(i++)-63; r|=(b&0x1f)<<sh; sh+=5; }while(b>=0x20); const d=(r&1)?~(r>>1):(r>>1); if(k===0) la+=d; else lo+=d; } out.push([la/f,lo/f]); } return out; }
function classify(e){
  const surf=e.surface||''; if(e.unpaved||/dirt|gravel|compacted|path|impassable/.test(surf)) return 'destapada';
  const rc=e.road_class||''; if(/motorway|trunk/.test(rc)) return 'troncal'; if(/primary/.test(rc)) return 'principal';
  if(/secondary|tertiary/.test(rc)) return 'secundaria'; return 'calle'; }
function thin(c,minD){ const out=[c[0]]; for(let i=1;i<c.length-1;i++){ if(hav(out[out.length-1],c[i])>=minD) out.push(c[i]); } out.push(c[c.length-1]); return out; }
function roadTypes(r){
  // una sola consulta por ruta aunque se pida varias veces mientras está en curso
  if(r._rt) return Promise.resolve(r._rt);
  if(!r._rtP) r._rtP=fetchRoadTypes(r).catch(e=>{ r._rtP=null; throw e; });
  return r._rtP;
}
async function fetchRoadTypes(r){
  const pts=thin(r.coords,40); const chunks=[]; let cur=[pts[0]], dist=0;
  for(let i=1;i<pts.length;i++){ cur.push(pts[i]); dist+=hav(pts[i-1],pts[i]); if(dist>90000){ chunks.push(cur); cur=[pts[i]]; dist=0; } }
  if(cur.length>1) chunks.push(cur);
  const segs=[], km={};
  for(const ch of chunks){
    const body={encoded_polyline:encPoly(ch),costing:'auto',shape_match:'map_snap',
      filters:{attributes:['edge.road_class','edge.surface','edge.unpaved','edge.length','edge.begin_shape_index','edge.end_shape_index','shape'],action:'include'}};
    const d=await getJSON(VALHALLA+'/trace_attributes',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body)},30000); if(!d.edges) throw new Error(d.error||'sin datos de vía');
    const shp=decPoly(d.shape||'');
    for(const e of d.edges){ const t=classify(e); km[t]=(km[t]||0)+(e.length||0);
      const seg=shp.slice(e.begin_shape_index,e.end_shape_index+1); if(seg.length>1){ const last=segs[segs.length-1]; if(last&&last.t===t) last.c.push(...seg.slice(1)); else segs.push({t,c:seg}); } }
    await new Promise(z=>setTimeout(z,300));
  }
  r._rt={segs,km}; return r._rt;
}
function rtBar(r){ if(!r._rt) return ''; const km=r._rt.km, tot=Object.values(km).reduce((a,b)=>a+b,0)||1;
  return '<div class="rtype">'+Object.keys(RT).filter(k=>km[k]).map(k=>`<span title="${RT[k].n}: ${km[k].toFixed(0)} km" style="width:${km[k]/tot*100}%;background:${RT[k].c}"></span>`).join('')+'</div>'+
    (km.destapada>0.5?`<div class="warnline" style="color:#8b4513">⚠ ${km.destapada.toFixed(0)} km destapados</div>`:''); }
async function paintRoadTypes(idx){
  const r=ROUTES[idx]; if(!r) return;
  try{ await roadTypes(r); }catch(e){ console.warn('Valhalla',e); $('rtlegend').innerHTML='<span class="foot">No pude obtener el tipo de vía en este momento.</span>'; return; }
  if(ROUTES[SEL]!==r) return;
  rtLayer.clearLayers();
  r._rt.segs.forEach(sg=>{ L.polyline(sg.c,{color:RT[sg.t].c,weight:6,lineCap:'round',lineJoin:'round',dashArray:sg.t==='destapada'?'8 8':null}).addTo(rtLayer); });
  const km=r._rt.km;
  $('rtlegend').innerHTML=Object.keys(RT).filter(k=>km[k]>0.05).map(k=>`<span><i style="background:${RT[k].c}"></i>${RT[k].n} · ${km[k].toFixed(0)} km</span>`).join('');
  const card=document.querySelector(`.rc[data-i="${idx}"] .rtslot`); if(card) card.innerHTML=rtBar(r);
}

// ---------- Rutas alternativas automáticas ----------
function destPt(p,brg,d){ const r=Math.PI/180, dr=d/R, b=brg*r, la=p[0]*r, lo=p[1]*r;
  const la2=Math.asin(Math.sin(la)*Math.cos(dr)+Math.cos(la)*Math.sin(dr)*Math.cos(b));
  const lo2=lo+Math.atan2(Math.sin(b)*Math.sin(dr)*Math.cos(la),Math.cos(dr)-Math.sin(la)*Math.sin(la2)); return [la2/r,lo2/r]; }
function cumDist(c){ const cum=[0]; for(let i=1;i<c.length;i++) cum.push(cum[i-1]+hav(c[i-1],c[i])); return cum; }
function sample(c,step){ const cum=cumDist(c), out=[]; let nx=0; for(let i=0;i<c.length;i++){ if(cum[i]>=nx){ out.push({p:c[i],d:cum[i]}); nx=cum[i]+step; } } return out; }
function lite(r){ return r._lite||(r._lite=thin(r.coords,150)); }
function nearAny(p,c,tol){ for(let i=1;i<c.length;i++){ if(segDist(p,c[i-1],c[i])[0]<tol) return true; } return false; }
function overlap(a,b){ const sm=sample(a,1500); if(!sm.length) return 1; let k=0; sm.forEach(x=>{ if(nearAny(x.p,b,350)) k++; }); return k/sm.length; }
function hasLoop(c){ const sm=sample(c,800); for(let i=0;i<sm.length;i++) for(let j=i+1;j<sm.length;j++){ if(sm[j].d-sm[i].d>6000 && hav(sm[i].p,sm[j].p)<250) return true; } return false; }
function pointAt(c,frac){ const cum=cumDist(c), tot=cum[cum.length-1], t=tot*frac; let i=1; while(i<c.length-1&&cum[i]<t) i++;
  const a=c[Math.max(0,i-1)], j=Math.min(c.length-1,i+15), b=c[j]; return {p:a, brg:bearing(c[Math.max(0,i-15)],b), tot}; }
async function exploreRoutes(base){
  const main=base[0]; const c=main.coords; const straight=hav([A.lat,A.lon],[B.lat,B.lon]);
  const D=Math.max(4000,Math.min(45000,straight*.15)); const found=[];
  const cands=[]; [.2,.5,.8].forEach(f=>[90,-90].forEach(side=>cands.push({f,side})));
  for(const k of cands){
    if(found.length>=3) break;
    try{
      const {p,brg}=pointAt(c,k.f); const q=destPt(p,(brg+k.side+360)%360,D);
      const rr=await osrm(A,B,'',{lat:q[0],lon:q[1]}); const r=rr&&rr[0]; if(!r) continue;
      r.coords=r.geometry.coordinates.map(x=>[x[1],x[0]]);
      if(r.duration>main.duration*1.6 || hasLoop(r.coords)) continue;
      if([...ROUTES,...found].some(o=>overlap(lite(r),lite(o))>.85 && overlap(lite(o),lite(r))>.85)) continue;
      r.label='Otra ruta'; r.auto=true; found.push(r);
    }catch(e){}
    await new Promise(z=>setTimeout(z,250));
  }
  return found;
}
function labelPoint(r){
  const others=ROUTES.filter(o=>o!==r); const sm=sample(r.coords,2500);
  if(!sm.length) return r.coords[0];
  const lo=Math.floor(sm.length*.2), hi=Math.ceil(sm.length*.8); let best=sm[Math.floor(sm.length/2)], bd=-1;
  const tot=sm[sm.length-1].d||1, avoid=[]; if(carMarker){ const c=carMarker.getLatLng(); avoid.push([c.lat,c.lng]); } if(A) avoid.push([A.lat,A.lon]); if(B) avoid.push([B.lat,B.lon]);
  const minAv=Math.max(3000,tot*.12);
  for(let i=lo;i<hi;i++){ const p=sm[i].p; if(avoid.some(a=>hav(a,p)<minAv)) continue; let m=1e12; for(const o of others){ const oc=o.coords; for(let k=0;k<oc.length;k+=Math.max(1,Math.floor(oc.length/300))) m=Math.min(m,hav(p,oc[k])); } if(!others.length) m=0; if(m>bd){bd=m;best=sm[i];} }
  return best.p;
}
async function nameRoute(r){
  // nombre por el pueblo del tramo que no comparte con la ruta principal
  const main=ROUTES.find(x=>!x.auto&&!x.forced)||ROUTES[0]; const sm=sample(lite(r),2000).filter(x=>!nearAny(x.p,lite(main),500));
  const pick=sm.length?sm[Math.floor(sm.length/2)].p:sample(r.coords,2000)[0].p;
  try{ const d=await getJSON(`${NOMI}/reverse?format=json&accept-language=es&zoom=12&lat=${pick[0]}&lon=${pick[1]}`);
    const a=d.address||{}; const n=a.town||a.village||a.city||a.municipality||a.hamlet||a.county; if(n) r.label='Por '+n; }catch(e){}
}

// ---------- Rutas ----------
async function osrm(a,b,extra='',via=null){ const pts=[a,via,b].filter(Boolean).map(p=>`${p.lon},${p.lat}`).join(';'); const d=await getJSON(`${OSRM}/route/v1/driving/${pts}?overview=full&geometries=geojson&alternatives=${via?'false':'3'}${extra}`); if(d.code!=='Ok') throw new Error(d.message||d.code); return d.routes; }
let CALC_SEQ=0;
async function calc(opt={}){
  const RR=!!opt.reroute; const seq=++CALC_SEQ; window._exTok=Symbol('cancel'); $('sorig').hidden=true; $('sdest').hidden=true; $('svia').hidden=true; $('go').textContent='Calculando…';
  try{
    if(!$('orig').value.trim()) A=null; if(!$('dest').value.trim()) B=null; if(!$('via').value.trim()) V=null;
    if(!A&&$('orig').value.trim()) A=await geocode($('orig').value.trim());
    if(!B&&$('dest').value.trim()) B=await geocode($('dest').value.trim());
    if(!A||!B){ st('Indica origen y destino.','err'); return; }
    if($('via').value.trim() && !(V&&V.exact) && (!V || V.road || (!V.town && V.picked!==true))){
      const q=(V&&V.q)||(parseCoords($('via').value)?$('via').value.trim():$('via').value.split(',')[0].trim());
      V=await geocodeBest(q,A,B);
      if(!V.road) st(`Parada: <b>${esc(V.label)}</b>. Si no es el lugar que quieres, elígelo de la lista al escribir o mantén presionado el mapa.`);
      if(V.road) st(`Para “${esc(q)}” usé el tramo que mejor queda en tu camino. Si no es el que quieres, mantén presionado el mapa justo sobre la vía y elige <b>Pasar por aquí</b>.`);
    }
    drawPins(); if(!V) st('');
    let routes=[];
    if(V){ const vr=await osrm(A,B,'',V); if(vr[0]) routes.push({...vr[0],label:V.exact?'Por tu punto':'Por '+($('via').value.split(',')[0]||'tu parada'),forced:true}); }
    routes=routes.concat((await osrm(A,B)).map((r,i)=>({...r,label:i===0?'Ruta principal':'Alternativa '+i})));
    if($('avoid').checked){ try{ const nr=await osrm(A,B,'&exclude=toll'); if(nr[0]) routes.push({...nr[0],label:'Evitando peajes'}); }catch(e){} }
    if(seq!==CALC_SEQ) return;   // llegó un cálculo más nuevo
    ROUTES=[]; for(const r of routes){ if(!ROUTES.some(x=>Math.abs(x.distance-r.distance)<500&&Math.abs(x.duration-r.duration)<120)) ROUTES.push(r); }
    ROUTES.forEach(r=>r.coords=r.geometry.coordinates.map(c=>[c[1],c[0]]));
    renderResults(ROUTES[0]&&ROUTES[0].forced?0:pickByPrio(),RR&&FOLLOW?false:true);
    if(RR){ toast('Ruta recalculada desde tu ubicación'); if(FOLLOW&&ME) map.panTo([ME.lat,ME.lon]); }
    if($('explore').checked && !V && !RR){
      const token=Symbol(); window._exTok=token;
      st('Buscando más rutas por otros corredores…');
      const extra=await exploreRoutes(ROUTES.filter(r=>!r.forced));
      if(window._exTok!==token) return;
      if(extra.length){ const selRoute=ROUTES[SEL]; ROUTES.push(...extra); ROUTES.forEach(r=>delete r._lp);
        for(const r of ROUTES.filter(x=>x.label.startsWith('Alternativa')||x.auto)){ await nameRoute(r); await new Promise(z=>setTimeout(z,1100)); if(window._exTok!==token) return; }
        renderResults(PRIO==='fast'&&selRoute?ROUTES.indexOf(selRoute):pickByPrio(),FOLLOW?false:true);
        st(`Encontré ${extra.length} ruta(s) más. Toca una tarjeta para verla.`,'ok');
      } else st('No encontré otras rutas razonables además de las mostradas.');
    }
  }catch(e){ st('No pude calcular la ruta: '+esc(e.message),'err'); }
  finally{ if(seq===CALC_SEQ){ $('go').textContent='Calcular ruta'; REROUTING=false; } }
}
$('go').onclick=()=>calc();
$('cat').onchange=()=>{ try{localStorage.setItem('peajes_cat',$('cat').value);}catch(e){} if(ROUTES.length) renderResults(); };
try{ const u=localStorage.getItem('peajes_unv'); if(u) $('unv').value=u; }catch(e){}
$('unv').onchange=()=>{ try{localStorage.setItem('peajes_unv',$('unv').value);}catch(e){} if(ROUTES.length) renderResults(); };
try{ $('diff').checked=localStorage.getItem('peajes_diff')==='1'; }catch(e){}
$('diff').onchange=()=>{ try{localStorage.setItem('peajes_diff',$('diff').checked?'1':'0');}catch(e){} if(ROUTES.length) renderResults(); };
['gal','kmg'].forEach(id=>$(id).addEventListener('input',()=>{ if(ROUTES.length) renderResults(); }));
$('tol').onchange=()=>{ if(ROUTES.length) renderResults(); };

const hm=x=>{ const m=Math.round(x/60), h=Math.floor(m/60); return h?`${h} h ${m%60} min`:`${m} min`; };
function renderResults(sel,fit){
  if(sel!=null) SEL=sel;
  const cat=$('cat').value, tol=+$('tol').value||120, gal=+$('gal').value, kmg=+$('kmg').value;
  ROUTES.forEach(r=>{ r.hits=routeHits(r,tol);
    r.missing=r.hits.filter(h=>priceOf(h.t,cat).v==null).length;
    r.tollCost=cat?r.hits.reduce((s,h)=>s+(priceOf(h.t,cat).v||0),0):null;
    r.gals=kmg?r.distance/1000/kmg:null; r.fuel=gal&&kmg?r.gals*gal:null; if(r.tollCost!=null) r.tollCost*=TRIP; if(r.fuel!=null){r.fuel*=TRIP; r.gals*=TRIP;} r.total=(r.tollCost||0)+(r.fuel||0); });
  const fastest=Math.min(...ROUTES.map(r=>r.duration)), cheapest=Math.min(...ROUTES.map(r=>r.total)), shortest=Math.min(...ROUTES.map(r=>r.distance));

  routeLayer.clearLayers(); rtLayer.clearLayers(); bubLayer.clearLayers();
  // Alternas como en Google Maps: azul claro sólido; toda la línea es tocable (zona de 40 px)
  ROUTES.forEach((r,i)=>{ if(i===SEL) return;
    const pick=e=>{ L.DomEvent.stop(e); renderResults(i,false); };
    L.polyline(r.coords,{color:'#7aa0e8',weight:9,opacity:.55,lineCap:'round',lineJoin:'round',interactive:false}).addTo(routeLayer);
    L.polyline(r.coords,{color:'#b9cff7',weight:6,opacity:1,lineCap:'round',lineJoin:'round'}).on('click',pick).addTo(routeLayer);
    L.polyline(r.coords,{color:'#000',weight:40,opacity:0,lineCap:'round'}).on('click',pick).addTo(routeLayer); });
  tollLayer.eachLayer(m=>m.setStyle({fillOpacity:.25,opacity:.25,radius:2.5}));
  const s=ROUTES[SEL];
  L.polyline(s.coords,{color:'#0b2e8a',weight:10,opacity:.9,lineCap:'round',lineJoin:'round',interactive:false}).addTo(routeLayer);
  const main=L.polyline(s.coords,{color:'#2f6bff',weight:7,lineCap:'round',lineJoin:'round',interactive:false}).addTo(routeLayer);
  s.hits.forEach((h,k)=>L.marker([h.t.lat,h.t.lon],{icon:tollPin(k+1,!!(isCatI()&&verifOf(h.t))),zIndexOffset:500}).bindPopup(popup(h.t)).addTo(routeLayer));
  carAtRouteStart(s);
  // burbujas para elegir en el mapa
  ROUTES.forEach((r,i)=>{ const lp=r._lp||(r._lp=labelPoint(r));
    const cost=r.fuel!=null?r.total:r.tollCost;
    const m=L.marker(lp,{icon:L.divIcon({className:'',iconSize:[0,0],html:`<div class="rbub ${i===SEL?'on':''}">${hm(r.duration)}<small>${(r.distance/1000).toFixed(0)} km · ${fmt(cost)}</small></div>`}),zIndexOffset:i===SEL?2200:2100});
    m.on('click',()=>renderResults(i,false)); m.addTo(bubLayer); });
  if(fit===true){ setFollow(false); const all=L.latLngBounds([]); ROUTES.forEach(r=>all.extend(L.polyline(r.coords).getBounds())); map.fitBounds(all,{padding:[50,50]}); }
  else if(fit!==false && !FOLLOW) map.fitBounds(main.getBounds(),{padding:[40,40]});
  $('startwrap').innerHTML=`<button class="startbtn" id="startnav"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 21 3l-8 18-2-8-8-2z"/></svg>${LIVE?'Iniciar y seguir el carro':'Activar en vivo y seguir el carro'}</button>
    <div style="display:flex;gap:8px;margin-top:8px"><button class="chip" id="viewall" style="flex:1">Ver ruta completa</button></div>`;
  $('startnav').onclick=()=>{ if(!LIVE && navigator.geolocation) setLive(true); centerCar(); };
  $('viewall').onclick=()=>{ setFollow(false); map.fitBounds(main.getBounds(),{padding:[40,40]}); if(innerWidth<860) scrollTo({top:0,behavior:'smooth'}); };

  $('routes').innerHTML=ROUTES.map((r,i)=>{
    const tags=(r.duration===fastest?'<span class="pill fast">Más rápida</span>':'')+(ROUTES.length>1&&r.distance===shortest?'<span class="pill short">Más corta</span>':'')+(ROUTES.length>1&&r.total===cheapest&&(r.tollCost!=null||r.fuel!=null)?'<span class="pill cheap">Más barata</span>':'');
    return `<div class="rc ${i===SEL?'sel':''}" data-i="${i}">
      <div class="top"><div><div class="time">${hm(r.duration)}</div><div class="name">${esc(r.label)}${tags}</div></div>
      <div class="cost"><b>${fmt(r.fuel!=null?r.total:r.tollCost)}</b><span>${r.fuel!=null?'peajes + combustible':'en peajes'}${TRIP===2?' · ida y vuelta':''}</span></div></div>
      <div class="meta"><span>${(r.distance/1000*TRIP).toFixed(0)} <i>km${TRIP===2?' ida y vuelta':''}</i></span><span>${r.hits.length*TRIP} <i>pasos</i></span><span>${fmt(r.tollCost)} <i>peajes</i></span>${r.fuel!=null?`<span>${fmt(r.fuel)} <i>combustible</i></span>`:''}</div>
      <div class="rtslot">${rtBar(r)}</div>
      ${r.missing?`<div class="warnline">${r.missing} peaje(s) sin tarifa para esta categoría</div>`:''}</div>`; }).join('');
  const forced=ROUTES.find(r=>r.forced), auto=ROUTES.find(r=>!r.forced);
  if(forced&&auto&&forced.distance>auto.distance*1.25) $('routes').insertAdjacentHTML('afterbegin',`<div class="status err" style="margin:0 0 4px">La parada <b>“${esc(V&&V.exact?'tu punto':$('via').value.split(',')[0])}”</b> agrega ${Math.round((forced.distance-auto.distance)/1000)} km de desvío: probablemente queda detrás de tu salida o fuera del camino. Elige un punto que esté <b>entre</b> la salida y el destino.</div>`);
  $('routes').insertAdjacentHTML('beforeend',`<p class="foot" style="margin:2px 2px 0">Los tiempos son estimados sin tráfico. Si sabes que una vía es más fluida, escríbela en <b>“Pasar por”</b> para forzar la ruta.</p>`);
  $('routes').querySelectorAll('.rc').forEach(c=>c.onclick=()=>{ renderResults(+c.dataset.i,false); if(innerWidth<860) scrollTo({top:0,behavior:'smooth'}); });
  if(s._rt){ setTimeout(()=>paintRoadTypes(SEL),0); } else { $('rtlegend').innerHTML='<span class="foot">Cargando tipo de vía…</span>'; paintRoadTypes(SEL); }
  { const v=VEHS.find(x=>x.id===VSEL); const unit=v&&v.fuel==='GNV'?'m³':'gal';
    $('summary').innerHTML=`<div class="sum"><h4><span>Resumen · ${TRIP===2?'ida y vuelta':'solo ida'}</span><span>${esc(v?v.name:'Sin vehículo')}</span></h4>
      <div class="row"><span>Distancia</span><b>${(s.distance/1000*TRIP).toFixed(0)} km</b></div>
      <div class="row"><span>Tiempo al volante</span><b>${hm(s.duration*TRIP)}</b></div>
      <div class="row"><span>Combustible${s.gals!=null?' ('+s.gals.toFixed(1)+' '+unit+')':''}</span><b>${s.fuel!=null?fmt(s.fuel):'falta rendimiento o precio'}</b></div>
      <div class="row"><span>Peajes (${s.hits.length*TRIP} pasos)</span><b>${fmt(s.tollCost)}</b></div>
      <div class="row tot"><span>Total</span><span>${fmt(s.total)}</span></div>
      <div class="note">${TRIP===2?'El regreso se calcula por la misma ruta y con los mismos peajes; algunos peajes cobran en un solo sentido, así que el valor real puede ser menor. ':''}Combustible estimado en carretera sin tráfico; en ciudad y en subidas el consumo es mayor.${v?'':' Toca <b>＋ Agregar</b> para guardar tu carro.'}</div></div>`; }

  let tl=`<h3>Peajes en el camino <span>${s.hits.length}</span></h3>`;
  if(!s.hits.length) tl+=`<p class="foot">${TOLLS.length?'No se detectaron peajes a menos de '+tol+' m de esta ruta.':'Aún no hay datos de peajes cargados.'}</p>`;
  else tl+=s.hits.map((x,k)=>`<div class="ti" data-k="${k}"><div class="n"><b>P</b></div><div><div class="nm">${esc(x.t.name)}</div><div class="sm">km ${x.km.toFixed(0)}${x.dup?' · '+x.dup+' casetas':''}${x.again?' · pasas 2 veces':''}${x.dist>60?' · a '+Math.round(x.dist)+' m de la vía':''}</div></div><div class="pr">${(()=>{ const p=priceOf(x.t,cat); if(p.est) return `${fmt(p.v)}<div class="sm" style="text-align:right;color:var(--warn)">estimado${p.raw!=null?' · datos: '+fmt(p.raw):''}</div>`;
    if(!p.e) return fmt(p.v)+'<div class="sm" style="text-align:right">sin verificar</div>';
    const chg=p.raw!=null&&p.raw!==p.v; return `${fmt(p.v)} <span title="${esc(p.e.src+' · '+p.e.d)}" style="color:var(--ok)">✓</span><div class="sm" style="text-align:right">${p.isDiff?'diferencial':esc(p.e.d)}${chg?' · datos: '+fmt(p.raw):''}</div>${p.e.warn?'<div class="sm" style="color:var(--warn);text-align:right;max-width:150px">'+esc(p.e.warn)+'</div>':''}`; })()}</div></div>`).join('')+`<div class="total"><span>Total peajes</span><span>${fmt(s.tollCost)}</span></div><p class="foot">✓ = tarifa Cat. I verificada en ANI o prensa (fecha al lado). <span style="color:var(--warn)">estimado</span> = peaje sin tarifa confirmada, calculado a $17.500. “sin verificar” = valor del tablero de Supertransporte. ${isCatI()?'':'<b>Las tarifas verificadas solo aplican a Cat. I.</b>'}</p>`;
  $('tl').innerHTML=tl;
  $('tl').querySelectorAll('.ti').forEach(e=>e.onclick=()=>{ const x=s.hits[+e.dataset.k]; map.setView([x.t.lat,x.t.lon],17); if(innerWidth<860) scrollTo({top:0,behavior:'smooth'}); });
}

// ---------- Init ----------
setupAC($('orig'),$('sorig'),'A'); setupAC($('via'),$('svia'),'V'); $('viaclr').onclick=()=>{ V=null; $('via').value=''; drawPins(); if(A&&B) $('go').click(); }; setupAC($('dest'),$('sdest'),'B');
$('file').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; const t=await f.text();
  try{ const d=/\.csv$/i.test(f.name)?parseCSV(t):parseGeoJSON(JSON.parse(t)); if(!d.tolls.length) throw new Error('sin puntos'); applyData(d); }catch(err){ st('No pude leer el archivo: '+esc(err.message),'err'); } };
$('reload').onclick=()=>boot(true);
function visibleFields(){ return FIELDS.filter(f=>!/^(objectid|fid|shape|globalid|shape_.*)$/i.test(f.name) && TOLLS.some(t=>t.attrs[f.name]!=null&&t.attrs[f.name]!=='')); }
function fmtCell(v,f){ if(v==null) return ''; if(/Date/.test(f.type)&&typeof v==='number') return new Date(v).toISOString().slice(0,10); return typeof v==='number'&&v>=1000?v.toLocaleString('es-CO'):String(v); }
function tableCSV(rows){ const fs=visibleFields(); const q=x=>{ x=x==null?'':String(x); return /[;"\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x; };
  return [fs.map(f=>q(f.alias&&f.alias!==f.name?f.name+' ('+f.alias+')':f.name)).concat(['lat','lon']).join(';')]
    .concat(rows.map(t=>fs.map(f=>q(fmtCell(t.attrs[f.name],f))).concat([t.lat.toFixed(5),t.lon.toFixed(5)]).join(';'))).join('\n'); }
function renderTbl(){
  const fs=visibleFields(), q=norm($('dq').value);
  const rows=TOLLS.filter(t=>!q||norm(Object.values(t.attrs).join(' ')).includes(q));
  $('dinfo').textContent=`${rows.length} de ${TOLLS.length} registros · ${fs.length} columnas`;
  $('dtbl').innerHTML='<tr>'+fs.map(f=>`<th title="${esc(f.name)}">${esc(f.alias&&f.alias!==f.name?f.alias+' · '+f.name:f.name)}</th>`).join('')+'</tr>'+
    rows.slice(0,500).map(t=>'<tr>'+fs.map(f=>{ const v=t.attrs[f.name]; return `<td class="${typeof v==='number'?'num':''}">${esc(fmtCell(v,f))}</td>`; }).join('')+'</tr>').join('');
  return rows;
}
async function copyText(txt,btn){ try{ await navigator.clipboard.writeText(txt); const o=btn.textContent; btn.textContent='✓ Copiado'; setTimeout(()=>btn.textContent=o,1800); }
  catch(e){ const ta=document.createElement('textarea'); ta.value=txt; ta.style.cssText='position:fixed;inset:10% 5%;z-index:4000;height:60%'; document.body.appendChild(ta); ta.select(); st('No pude copiar automáticamente: mantén presionado el texto, Seleccionar todo → Copiar. Toca fuera para cerrar.','err'); ta.onblur=()=>ta.remove(); } }
$('opentbl').onclick=()=>{ if(!TOLLS.length){ st('Aún no hay datos cargados.','err'); return; } $('dmodal').hidden=false; renderTbl(); };
$('dclose').onclick=()=>$('dmodal').hidden=true;
$('dq').oninput=renderTbl;
$('dcopy').onclick=()=>copyText(tableCSV(renderTbl()),$('dcopy'));
$('copyall').onclick=()=>{ if(!TOLLS.length){ st('Aún no hay datos cargados.','err'); return; } copyText(tableCSV(TOLLS),$('copyall')); };
$('verifl').innerHTML=VERIF.map(e=>`${esc(e.k[0].replace(/\b\w/g,c=>c.toUpperCase()))}: <b>${fmt(e.v)}</b> · ${esc(e.d)} · ${esc(e.src)}${e.warn?' · ⚠ '+esc(e.warn):''}`).join('<br>')+'<br><i>Actualizado el 1-nov-2026. Confirma antes de viajar.</i>';
boot();

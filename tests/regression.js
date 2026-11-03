const {chromium}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');
const ROOT=require('path').resolve(__dirname,'..');
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html'});r.end(d);});}).listen(8765);
const results=[];const ok=(n,c,info='')=>{results.push((c?'PASS ':'FAIL ')+n+(info?' — '+info:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:400,height:850},geolocation:{latitude:4.6,longitude:-74.1},permissions:['geolocation']});
const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
let datosCalls=0, osrmCalls=0, valhallaCalls=0, nomiCalls=0, photonCalls=0, slowOsrm=false;
const J=(r,o)=>r.fulfill({contentType:'application/json',body:JSON.stringify(o),headers:{'access-control-allow-origin':'*'}});
await p.route('**/*',async r=>{const u=r.request().url();
 if(u.startsWith('http://localhost:8765'))return r.continue();
 if(u.includes('leaflet-rotate'))return r.fulfill({body:fs.readFileSync(require.resolve('leaflet-rotate/dist/leaflet-rotate.js')),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
 if(u.includes('/items/ceb96c6d29f04f778a1eff027368be33/data'))return J(r,{widgets:[{itemId:'aaaabbbbccccddddeeeeffff00001111'}]});
 if(u.includes('/items/ceb96c6d29f04f778a1eff027368be33?'))return J(r,{type:'Dashboard'});
 if(u.includes('/items/aaaabbbbccccddddeeeeffff00001111/data'))return J(r,{operationalLayers:[{url:'https://services.arcgis.com/x/Peajes/FeatureServer/0'}]});
 if(u.includes('/items/aaaabbbbccccddddeeeeffff00001111?'))return J(r,{type:'Web Map'});
 if(u.endsWith('FeatureServer/0?f=json'))return J(r,{name:'Peajes',geometryType:'esriGeometryPoint',fields:[{name:'OBJECTID',type:'esriFieldTypeOID'},{name:'nombre',type:'esriFieldTypeString'},{name:'cat_1',type:'esriFieldTypeDouble'},{name:'cat_2',type:'esriFieldTypeDouble'}]});
 if(u.includes('/query?'))return J(r,{features:[
  {attributes:{OBJECTID:1,nombre:'AMAGÁ',cat_1:20600,cat_2:30000},geometry:{x:-74.5,y:4.75}},
  {attributes:{OBJECTID:2,nombre:'Tarapacá II',cat_1:17000,cat_2:25000},geometry:{x:-75.0,y:5.5}},
  {attributes:{OBJECTID:3,nombre:'Peaje Desconocido',cat_1:9000,cat_2:9000},geometry:{x:-74.3,y:4.675}}]});
 if(u.includes('datos.gov.co/resource/8yi9-t44c')){ datosCalls++; return J(r,[
   {peaje:'AMAGA',categoriatarifa:'I',desde:'2026-08-01T00:00:00.000',valortarifa:'25900'},
   {peaje:'AMAGA',categoriatarifa:'I',desde:'2026-01-16T00:00:00.000',valortarifa:'20600'},
   {peaje:'AMAGA',categoriatarifa:'II',desde:'2026-08-01T00:00:00.000',valortarifa:'36000'},
   {peaje:'AMAGA',categoriatarifa:'IE',desde:'2026-08-01T00:00:00.000',valortarifa:'7000'},
   {peaje:'TARAPACA II',categoriatarifa:'Categoría I',desde:'2026-08-01T00:00:00.000',valortarifa:'17800'}]); }
 if(u.includes('datos.gov.co/resource/68qj-5xux')){ datosCalls++; return J(r,[{nombre_peaje:'PEAJE DESCONOCIDO',categoria_i:'9100',categoria_ii:'11000'}]); }
 if(u.includes('photon.komoot.io')){photonCalls++;const q=decodeURIComponent(u.split('q=')[1].split('&')[0]);
   const F=(lat,lon,name,key)=>({geometry:{coordinates:[lon,lat]},properties:{name,countrycode:'CO',state:'X',osm_key:key||'place'}});
   if(q.startsWith('Honda'))return J(r,{features:[F(5.0,-74.95,'Honda','waterway'),F(5.205,-74.74,'Honda','place')].map(f=>(f.properties.osm_value=f.properties.osm_key==='place'?'town':'stream',f))});
   if(q.startsWith('Panam'))return J(r,{features:[F(9,-70,'Panamericana','highway'),F(5.5,-75.0,'Panamericana','highway'),F(3,-77,'Panamericana','highway')]});
   return J(r,{features:[q.startsWith('Bog')?F(4.6,-74.1,'Bogotá'):F(6.25,-75.57,'Medellín')]});}
 if(u.includes('nominatim')){nomiCalls++; if(u.includes('zoom=10')){ const lat=+u.split('lat=')[1].split('&')[0]; return J(r,{address:lat<5?{city:'Perímetro Urbano Bogotá'}:{town:'Perímetro Urbano Medellín',county:'Valle de Aburrá'}}); } return J(r,{address:{town:'<img src=x onerror=window.__xss=1>'}});}
 if(u.includes('valhalla')){valhallaCalls++;const bd=JSON.parse(r.request().postData());const sh=bd.encoded_polyline;let n=0,i=0;while(i<sh.length){for(const k of [0,1]){let x;do{x=sh.charCodeAt(i++)-63}while(x>=32)}n++}
   return J(r,{shape:sh,edges:[{road_class:'trunk',surface:'paved',length:100,begin_shape_index:0,end_shape_index:Math.max(1,Math.floor(n/2))},{road_class:'tertiary',unpaved:true,length:12,begin_shape_index:Math.max(1,Math.floor(n/2)),end_shape_index:n-1}]});}
 if(u.includes('project-osrm')){osrmCalls++; if(slowOsrm) await new Promise(z=>setTimeout(z,1500));
   const pts=u.split('/driving/')[1].split('?')[0].split(';').map(x=>x.split(',').map(Number));
   const dense=(arr)=>{const out=[];for(let k=1;k<arr.length;k++){const [a,b2]=[arr[k-1],arr[k]];for(let s=0;s<40;s++)out.push([a[0]+(b2[0]-a[0])*s/40,a[1]+(b2[1]-a[1])*s/40]);}out.push(arr[arr.length-1]);return out;};
   const s0=pts[0], e=pts[pts.length-1];
   if(pts.length===3)return J(r,{code:'Ok',routes:[{distance:440000+Math.round(Math.abs(pts[1][1])*100),duration:31000,geometry:{type:'LineString',coordinates:dense([s0,pts[1],e])}}]});
   const main=dense([s0,[-74.5,4.75],[-75.0,5.5],e]);const alt=dense([s0,[-74.0,5.5],e]);
   return J(r,{code:'Ok',routes:u.includes('exclude')?[{distance:480000,duration:36000,geometry:{type:'LineString',coordinates:alt}}]:[{distance:415000,duration:30000,geometry:{type:'LineString',coordinates:main}},{distance:450000,duration:33000,geometry:{type:'LineString',coordinates:alt}}]});}
 return r.fulfill({status:404});});
await p.goto('http://localhost:8765/');await p.waitForTimeout(1200);
const E=f=>p.evaluate(f);
// --- carga
ok('Carga sin errores JS', errors.length===0, errors.join(' | '));
ok('Peajes descargados del tablero', await E(()=>TOLLS.length)===3);
await p.waitForTimeout(500);
ok('Tarifas oficiales ANI/INVÍAS descargadas de datos.gov.co', datosCalls===2 && await E(()=>Object.keys(OFFICIAL).length>=3));
ok('Categorías con nombre claro', (await p.textContent('#cat')).includes('Carro, campero o camioneta · Cat. I'));
ok('Rotación disponible (SRI válido)', await E(()=>CAN_ROTATE));
ok('No hay sonda a Nominatim al cargar', nomiCalls===0, 'llamadas='+nomiCalls);
ok('GPS no se pide si En vivo está apagado', await E(()=>!LIVE && watchId===null));
// --- autocompletado Photon
await p.fill('#orig','Bogo');await p.waitForTimeout(700);
ok('Autocompletado usa Photon', photonCalls>0 && !(await p.isHidden('#sorig')));
await p.click('#sorig div');
await p.fill('#dest','Medellín');
// --- vehículo + ida y vuelta
await E(()=>showTab('vehiculo'));await p.click('#vadd');await p.fill('#vname','Mi Mazda');await p.fill('#vkmg','40');await p.fill('#vgal','16000');await p.click('#vsave');
ok('Vehículo guardado en localStorage', await E(()=>JSON.parse(localStorage.getItem('peajes_vehs')).length===1));
await E(()=>showTab('rutas'));await p.click('#trip [data-t="2"]');
await E(()=>{document.getElementById('explore').checked=true});
await p.click('#go');await p.waitForTimeout(500);
ok('Rutas calculadas', await E(()=>ROUTES.length)>=2);
const tl=await p.textContent('#tl');
ok('Amagá con tarifa verificada 25.900 (dato viejo visible)', tl.includes('$25.900') && tl.includes('datos: $20.600'));
ok('Peaje con tarifa oficial INVÍAS muestra $9.100', await E(()=>ROUTES.some(r=>r.hits.some(h=>h.t.name==='Peaje Desconocido')))? tl.includes('$9.100') : true);
const sum=await p.textContent('#summary');
const exp=await E(()=>{const s=ROUTES[SEL];return Math.round(s.distance/1000*2/40*16000 + s.hits.reduce((a,h)=>a+priceOf(h.t,'cat_1').v,0)*2)});
ok('Resumen ida y vuelta cuadra', sum.replace(/\D/g,'').includes(String(exp)), 'esperado '+exp);
// --- exploración + nombres + XSS
await p.waitForTimeout(9000);
ok('Exploración agrega rutas', await E(()=>ROUTES.some(r=>r.auto)), await p.textContent('#st'));
ok('Etiquetas externas escapadas (sin XSS)', await E(()=>!window.__xss) && (await p.innerHTML('#routes')).includes('&lt;img'));
// --- prioridad
await p.click('[data-p=short]');ok('Prioridad corta elige menos km', await E(()=>ROUTES[SEL].distance===Math.min(...ROUTES.map(r=>r.distance))));
await p.click('[data-p=fast]');
// --- diferencial
await E(()=>{showTab('ajustes')});
await p.check('#diff');ok('Tarifa diferencial aplica $700 a Tarapacá', await E(()=>priceOf(TOLLS.find(t=>t.name==='Tarapacá II'),'cat_1').v===700));
await p.uncheck('#diff'); await E(()=>showTab('rutas'));
// --- tipos de vía
await p.waitForTimeout(800);
ok('Tipo de vía pintado (leyenda)', (await p.textContent('#rtlegend')).includes('Destapada'));
// --- burbujas
await E(()=>scrollTo(0,0));
ok('Burbujas en el mapa', await E(()=>bubLayer.getLayers().length===ROUTES.length));
await E(()=>{ bubLayer.getLayers()[1].fire('click'); }); ok('Tocar burbuja selecciona ruta', await E(()=>SEL===1));
// --- cache de peajes (rendimiento)
const t0=await E(()=>{const t=performance.now();for(let k=0;k<20;k++)renderResults(null,false);return performance.now()-t;});
ok('Re-render rápido con cache', t0<1500, Math.round(t0)+' ms / 20 renders');
// --- vía (pasar por) con mejor tramo
await p.fill('#via','Panamericana');await p.click('#go');await p.waitForTimeout(800);
ok('Parada en vía elige tramo en el camino', await E(()=>V&&Math.abs(V.lat-5.5)<0.01));
await p.click('#viaclr');await p.waitForTimeout(600);
// --- carreras: dos cálculos seguidos
slowOsrm=true; const before=osrmCalls;
p.click('#go'); await p.waitForTimeout(100); await p.fill('#dest','Bogotá'); await E(()=>{B=null}); await p.fill('#dest','Medellín'); p.click('#go');
await p.waitForTimeout(5000); slowOsrm=false;
ok('Dos cálculos seguidos: gana el último y no se mezclan', await E(()=>ROUTES.length>=2 && !ROUTES.some(r=>r.auto&&!r.coords)));
// --- en vivo / seguir / burbujas ocultas / recálculo
await p.click('#fabLive');await p.waitForTimeout(600);
ok('En vivo activa GPS', await E(()=>LIVE && watchId!==null));
await p.click('#startnav');await p.waitForTimeout(400);
ok('Seguir carro oculta burbujas', await E(()=>FOLLOW && !map.hasLayer(bubLayer)));
await E(()=>{LAST_RR=0;OFF=0;}); for(let k=0;k<3;k++) await E(()=>checkOffRoute(4.4,-74.1,20)); await p.waitForTimeout(1200);
ok('Fuera de ruta recalcula desde mi ubicación', await E(()=>A.isMe && Math.abs(A.lat-4.4)<1e-6));
// --- visibilidad pausa GPS
await E(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
ok('GPS en pausa con pantalla oculta', await E(()=>watchId===null));
await E(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
ok('GPS se reanuda al volver', await E(()=>watchId!==null));
// --- brújula / rumbo
await p.waitForTimeout(300);
ok('Iniciar viaje activa modo rumbo hacia la ruta', await E(()=>HEADUP && Math.abs(angDiff(map.getBearing(), -carMarker._deg))<2), await E(()=>HEADUP+' '+map.getBearing()+' '+carMarker._deg));
await p.click('#fabCmp'); await p.waitForTimeout(1800);
ok('Brújula vuelve a norte arriba', await E(()=>!HEADUP && Math.abs(angDiff(map.getBearing(),0))<1));
await p.click('#fabLive');await p.waitForTimeout(300);
ok('Apagar En vivo detiene GPS y rumbo', await E(()=>!LIVE && watchId===null && !HEADUP));
// --- mapa grande
await p.click('#fabBig');await p.waitForTimeout(400);
ok('Mapa grande', await E(()=>document.body.classList.contains('bigmap')));
// --- tabla de datos
await E(()=>{showTab('info')});
await p.click('#opentbl'); ok('Tabla de datos', (await p.textContent('#dinfo')).includes('3 de 3'));
ok('CSV para copiar', await E(()=>tableCSV(TOLLS).split('\n').length===4));
await p.click('#dclose'); await E(()=>showTab('rutas'));
// --- menú mantener presionado
await E(()=>pointMenu(L.latLng(5,-75))); await p.waitForTimeout(100);
ok('Menú de punto en mapa', (await p.textContent('.leaflet-popup-content')).includes('Pasar por aquí'));
const hv=await E(()=>geocodeBest('Honda',{lat:5.19,lon:-75.05},{lat:5.31,lon:-74.91}));
ok('Parada con nombre de municipio elige el municipio (Honda)', hv.town && Math.abs(hv.lat-5.205)<1e-6);
await p.evaluate(()=>{ map.closePopup(); setFollow(false); renderResults(0,true); scrollTo(0,0); }); await p.waitForTimeout(300);
const tp=await E(()=>{ const c=ROUTES[1].coords; const q=c[Math.floor(c.length*0.5)]; const pp=map.latLngToContainerPoint(q); const r=map.getContainer().getBoundingClientRect(); return {x:r.left+pp.x+12,y:r.top+pp.y}; });
await p.mouse.click(tp.x,tp.y); await p.waitForTimeout(300);
ok('Tocar cerca de la línea alterna la selecciona', await E(()=>SEL===1));
// "Pasar por aquí" desde el mapa debe usar el punto exacto
let lastOsrm=''; p.on('request',rq=>{ if(rq.url().includes('project-osrm')) lastOsrm=rq.url(); });
await E(()=>{ map.closePopup(); A={lat:4.6,lon:-74.1,label:'a'}; B={lat:6.25,lon:-75.57,label:'b'}; document.getElementById('orig').value='a'; document.getElementById('dest').value='b'; document.getElementById('via').value=''; V=null; });
await E(()=>pointMenu(L.latLng(5.2237,-74.7702))); await p.waitForTimeout(150);
await p.click('.leaflet-popup-content [data-w="V"]'); await p.waitForTimeout(1500);
ok('Pasar por aquí (mapa) usa el punto exacto', await E(()=>V&&V.exact&&Math.abs(V.lat-5.2237)<1e-9) && /-74\.7702,5\.2237/.test(decodeURIComponent(await E(()=>performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes('project-osrm')).join(' ')))));
ok('La ruta por el punto queda seleccionada', await E(()=>ROUTES[SEL].forced===true && ROUTES[SEL].label.startsWith('Por tu punto')));
ok('Con parada hay varias rutas para elegir (alternativas por tramo)', await E(()=>ROUTES.filter(r=>r.forced).length>=2));
ok('Todas las rutas por parada pasan por la parada', await E(()=>ROUTES.filter(r=>r.forced).every(r=>r.coords.some(c=>hav(c,[V.lat,V.lon])<50))));
ok('Coordenadas escritas se respetan', await E(()=>{ const c=parseCoords('5.2237, -74.7702'); return c&&c.exact&&c.lon===-74.7702; }));
// arrastrar la parada recalcula por el punto nuevo
await E(()=>{ const m=pinLayer.getLayers().find(l=>l.dragging&&l.getTooltip()&&/Parada/.test(l.getTooltip().getContent())); m.setLatLng([5.5,-75.0]); m.fire('dragstart'); m.fire('dragend'); });
await p.waitForTimeout(1500);
ok('Arrastrar la parada recalcula por el nuevo punto', await E(()=>V.exact&&V.lat===5.5&&document.getElementById('via').value==='5.5000, -75.0000'&&ROUTES[SEL].forced&&ROUTES[SEL].coords.some(c=>hav(c,[5.5,-75.0])<50)));
ok('Salida, parada y destino son arrastrables', await E(()=>pinLayer.getLayers().filter(l=>l.options.draggable).length>=2));
// parada pasada del destino → aviso de ida y vuelta
await E(()=>{ V={lat:6.745,lon:-76.011,label:'x',picked:true,exact:true}; document.getElementById('via').value='6.7450, -76.0110'; });
await p.click('#go'); await p.waitForTimeout(1500);
ok('Aviso cuando la parada hace ir y volver', (await p.textContent('#routes')).includes('vaya y vuelva'));
// --- varias paradas
await E(()=>{ map.closePopup(); EXTRA=[]; drawStopList(); A={lat:4.6,lon:-74.1,label:'a'}; B={lat:6.25,lon:-75.57,label:'b'};
  V={lat:5.5,lon:-75.0,label:'5.5000, -75.0000',picked:true,exact:true}; document.getElementById('via').value=V.label; });
await p.click('#go'); await p.waitForTimeout(1200);
// agregar desde el mapa una parada ANTES de la primera (más cerca de la salida): debe quedar ordenada
await E(()=>pointMenu(L.latLng(4.75,-74.5))); await p.waitForTimeout(150);
ok('Menú ofrece "Agregar parada aquí" cuando ya hay una', (await p.textContent('.leaflet-popup-content')).includes('Agregar parada aquí'));
await p.click('.leaflet-popup-content [data-w="V"]'); await p.waitForTimeout(1500);
const legs=await E(()=>performance.getEntriesByType('resource').map(e=>decodeURIComponent(e.name)).filter(n=>n.includes('project-osrm')).map(n=>n.split('/driving/')[1].split('?')[0]));
ok('Ruta con 2 paradas en orden del viaje (tramo por tramo)', ['-74.1,4.6;-74.5,4.75','-74.5,4.75;-75,5.5','-75,5.5;-75.57,6.25'].every(x=>legs.includes(x)), legs.slice(-4).join(' | '));
ok('Lista muestra la parada adicional', await E(()=>document.querySelectorAll('#vialist input').length===1));
ok('Etiqueta "Por tus 2 paradas"', await E(()=>ROUTES[SEL].label.startsWith('Por tus 2 paradas')));
await p.click('#vialist [data-x="0"]'); await p.waitForTimeout(1200);
ok('Quitar parada adicional', await E(()=>EXTRA.length===0 && ROUTES[SEL].label.startsWith('Por tu punto')));
await E(()=>{ for(let k=0;k<3;k++) EXTRA.push({lat:5+k*0.1,lon:-74.8,label:'x',exact:true}); });
await E(()=>pointMenu(L.latLng(5.9,-75.2))); await p.waitForTimeout(150); await p.click('.leaflet-popup-content [data-w="V"]'); await p.waitForTimeout(300);
ok('Límite de 4 paradas', await E(()=>1+EXTRA.length===4));
await E(()=>{ EXTRA=[]; drawStopList(); V=null; document.getElementById('via').value=''; drawPins(); });
// toque imperfecto con el dedo
await E(()=>{ map.closePopup(); setFollow(false); V=null; EXTRA=[]; document.getElementById('via').value=''; document.getElementById('explore').checked=false; A={lat:4.6,lon:-74.1,label:'a'}; B={lat:6.25,lon:-75.57,label:'b'}; document.getElementById('orig').value='a'; document.getElementById('dest').value='b'; });
await p.click('#go'); await p.waitForTimeout(1500);
await E(()=>{ renderResults(0,true); scrollTo(0,0); map.setBearing(15); }); await p.waitForTimeout(500);
const tq=await E(()=>{ const c=ROUTES[1].coords; const q=c[Math.floor(c.length*0.5)]; const pp=map.latLngToContainerPoint(q); const r=map.getContainer().getBoundingClientRect(); return {x:r.left+pp.x+20,y:r.top+pp.y}; });
await p.mouse.move(tq.x,tq.y); await p.mouse.down(); await p.mouse.move(tq.x+6,tq.y+5,{steps:3}); await p.mouse.up(); await p.waitForTimeout(400);
ok('Toque imperfecto (se mueve 8 px, a 20 px de la línea) selecciona la ruta', await E(()=>SEL===1));
await E(()=>map.setBearing(0));
// --- Tus rutas
await E(()=>{ localStorage.removeItem('peajes_trips'); TRIPS=[]; drawTrips(); map.closePopup(); setFollow(false); V=null; EXTRA=[]; drawStopList(); document.getElementById('via').value='';
  A={lat:4.6,lon:-74.1,label:'Bogotá, Cundinamarca'}; B={lat:6.25,lon:-75.57,label:'Medellín, Antioquia'}; document.getElementById('orig').value='Bogotá'; document.getElementById('dest').value='Medellín'; });
await p.click('#go'); await p.waitForTimeout(1500);
await E(()=>renderResults(0,false)); await p.click('#savetrip'); await p.waitForTimeout(300);
await p.waitForTimeout(2500);
ok('Guardar ruta crea un viaje frecuente con nombres de municipio (sin "Perímetro Urbano")', await E(()=>TRIPS.length===1 && TRIPS[0].name==='Bogotá → Medellín' && !document.getElementById('tripsWrap').hidden), await E(()=>TRIPS[0]&&TRIPS[0].name));
await p.click('#go'); await p.waitForTimeout(1500); await E(()=>renderResults(0,false)); await p.click('#savetrip'); await p.waitForTimeout(300);
ok('Mismo viaje por la misma vía no se duplica (suma +1)', await E(()=>TRIPS.length===1 && TRIPS[0].count===2));
await E(()=>{ const i=ROUTES.findIndex((r,k)=>k>0 && overlap(lite(r),lite(ROUTES[0]))<.5); renderResults(i,false); }); await p.click('#savetrip'); await p.waitForTimeout(2600);
ok('Mismo origen/destino por otra vía se guarda aparte', await E(()=>TRIPS.length===2));
ok('Iniciar no cuenta dos veces el mismo cálculo', await E(()=>{ const n=TRIPS.reduce((a,t)=>a+t.count,0); RECORDED=CALC_SEQ; recordTrip(false); return TRIPS.reduce((a,t)=>a+t.count,0)===n; }));
// cargar el viaje por la otra vía: debe seleccionar esa como habitual
await E(()=>{ const t=TRIPS.find(x=>x.count===1); document.querySelector('#trips [data-t="'+t.id+'"]').click(); }); await p.waitForTimeout(2000);
ok('Tocar un viaje frecuente selecciona tu ruta habitual', await E(()=>{ const t=TRIPS.find(x=>x.count===1); return ROUTES[SEL].habitual && overlap(lite(ROUTES[SEL]),t.geom)>.85; }));
ok('Etiqueta ★ Tu ruta habitual', (await p.textContent('#routes')).includes('Tu ruta habitual'));
await p.click('#tripEdit'); await E(()=>{ document.querySelector('#trips [data-del]').click(); });
await p.click('#tripEdit'); await E(()=>{ scrollTo(0,0); document.body.classList.remove('bigmap'); }); await p.waitForTimeout(300); 
ok('Limpieza de nombres genéricos', await E(()=>cleanPlace('Perímetro Urbano Victoria')==='Victoria' && cleanPlace('Cabecera Municipal de Chinchiná')==='Chinchiná' && shortName({label:'Perímetro Urbano Manizales, Caldas',lat:5,lon:-75})==='Manizales'));
ok('Borrar un viaje frecuente', await E(()=>TRIPS.length===1 && JSON.parse(localStorage.getItem('peajes_trips')).length===1));
// --- Modo viaje
await E(()=>{ map.closePopup(); setFollow(false); if(LIVE) setLive(false); V=null; EXTRA=[]; drawStopList(); document.getElementById('via').value='';
  A={lat:4.6,lon:-74.1,label:'Bogotá'}; B={lat:6.25,lon:-75.57,label:'Medellín, Antioquia'}; document.getElementById('orig').value='Bogotá'; document.getElementById('dest').value='Medellín'; });
await p.click('#go'); await p.waitForTimeout(1500); await E(()=>renderResults(0,false));
await p.click('#startnav'); await p.waitForTimeout(800);
ok('Iniciar viaje: barra visible, mapa grande, siguiendo', await E(()=>NAV && !document.getElementById('navbar').hidden && document.body.classList.contains('bigmap') && FOLLOW && LIVE));
ok('Botón cambia a "Terminar viaje"', (await p.textContent('#startnav')).includes('Terminar viaje'));
ok('Carro apunta hacia adelante de la ruta aunque el GPS diga lo contrario', await E(()=>{ const c=ROUTES[SEL].coords; const q=c[Math.floor(c.length*0.05)]; const rh=routeHeadingAt(q).deg;
  for(let k=0;k<6;k++) updateCar(q[0]+Math.random()*4e-5,q[1]+Math.random()*4e-5,(rh+180)%360,null); return Math.abs(angDiff(carMarker._deg,rh))<10; }));
ok('Carro queda en la parte baja de la pantalla (camino al frente)', await E(()=>{ const ll=carMarker.getLatLng(); map.setBearing(-carMarker._deg); map.panTo(lookAhead(ll.lat,ll.lng,carMarker._deg),{animate:false}); return map.latLngToContainerPoint(ll).y > map.getSize().y*0.6; }));
// simular avance por la ruta
await E(()=>{ const c=ROUTES[SEL].coords; const q=c[Math.floor(c.length*0.1)]; ME={lat:q[0],lon:q[1]}; updateCar(q[0],q[1],null,15); paintNav(); });
const nb=await p.textContent('#navbar');
ok('Barra muestra km restantes, llegada y próximo peaje', /km ·/.test(nb) && nb.includes('Llegada') && /Próximo peaje: .+ en [\d.]+ km/.test(nb), nb.replace(/\s+/g,' '));
ok('Tramo recorrido se pinta claro hasta tu posición', await E(()=>{ const ll=doneLine.getLatLngs(); const last=ll[ll.length-1]; return ll.length>2 && hav([last.lat,last.lng],[ME.lat,ME.lon])<30 && doneLine.options.color==='#a9b3c4'; }));
await E(()=>{ const c=ROUTES[SEL].coords; const q=c[Math.floor(c.length*0.6)]; ME={lat:q[0],lon:q[1]}; updateCar(q[0],q[1],null,15); paintNav(); });
ok('El tramo recorrido avanza contigo', await E(()=>{ const ll=doneLine.getLatLngs(); const last=ll[ll.length-1]; return hav([last.lat,last.lng],[ME.lat,ME.lon])<30; }));
await p.click('#navEnd'); await p.waitForTimeout(500);
ok('Al terminar se borra el tramo recorrido', await E(()=>doneLine.getLatLngs().length===0));
ok('Terminar: sale del modo viaje y apaga el GPS que prendió', await E(()=>!NAV && document.getElementById('navbar').hidden && !LIVE && watchId===null && !FOLLOW));
ok('Botón vuelve a "Iniciar viaje"', (await p.textContent('#startnav')).includes('Iniciar viaje'));
// llegada automática
await p.click('#startnav'); await p.waitForTimeout(600);
await E(()=>{ ARRIVED=-1; checkOffRoute(6.2502,-75.5702,10); });
await p.waitForTimeout(300);
ok('Al llegar al destino termina solo', await E(()=>!NAV) && (await p.textContent('#toast')).includes('Llegaste'));
await E(()=>localStorage.setItem('peajes_trips',JSON.stringify([{id:'1',name:'Perímetro Urbano → Perímetro Urbano',from:{lat:4.6,lon:-74.1,label:'x'},to:{lat:6.25,lon:-75.57,label:'y'},stops:[],geom:[[4.6,-74.1],[6.25,-75.57]],km:415,count:3,last:1}])));
await p.reload(); await p.waitForTimeout(4500);
ok('Rutas guardadas con "Perímetro Urbano" se renombran solas', await E(()=>TRIPS[0].name==='Bogotá → Medellín' && TRIPS[0].count===3), await E(()=>TRIPS[0].name));
// --- pestañas
await E(()=>{ A={lat:4.6,lon:-74.1,label:'Bogotá'}; B={lat:6.25,lon:-75.57,label:'Medellín'}; document.getElementById('orig').value='Bogotá'; document.getElementById('dest').value='Medellín'; });
await p.click('#go'); await p.waitForTimeout(1500);
ok('Pestañas: 5 secciones y solo una visible', await E(()=>document.querySelectorAll('#tabs [data-tab]').length===5 && [...document.querySelectorAll('.tabpane')].filter(p=>!p.hidden).length===1));
await p.click('#tabs [data-tab="peajes"]'); ok('Pestaña Peajes muestra la lista', await p.isVisible('#tl') && !(await p.isVisible('#routes')));
ok('Contador de peajes en la pestaña', await E(()=>!document.getElementById('tollBadge').hidden && +document.getElementById('tollBadge').textContent===ROUTES[SEL].hits.length));
await p.click('#tabs [data-tab="vehiculo"]'); ok('Pestaña Vehículo: vehículos, categoría y combustible', await p.isVisible('#vehs') && await p.isVisible('#cat') && await p.isVisible('#kmg'));
await p.click('#tabs [data-tab="ajustes"]'); ok('Pestaña Ajustes: todas las opciones', await p.isVisible('#autorr') && await p.isVisible('#explore') && await p.isVisible('#avoid') && await p.isVisible('#unv') && await p.isVisible('#diff') && await p.isVisible('#tol'));
await p.click('#tabs [data-tab="info"]'); ok('Pestaña Info: consejos, datos y fuentes', await p.isVisible('.tipsl') && await p.isVisible('#opentbl') && await p.isVisible('#file'));
await p.click('#go'); await p.waitForTimeout(1200); ok('Calcular vuelve a la pestaña Rutas', await E(()=>TAB==='rutas') && await p.isVisible('#routes'));
ok('La pestaña elegida se recuerda', await E(()=>localStorage.getItem('peajes_tab')==='rutas'));
// --- prioridad de fuentes
await E(()=>{ document.getElementById('diff').checked=false; document.getElementById('cat').value='cat_1'; });
ok('Oficial ANI: toma la tarifa más reciente (Amagá $25.900, no $20.600)', await E(()=>{ const p=priceOf(TOLLS.find(t=>t.name==='AMAGÁ'),'cat_1'); return p.v===25900 && p.e.official; }));
ok('Oficial ANI también para Cat. II', await E(()=>{ const p=priceOf(TOLLS.find(t=>t.name==='AMAGÁ'),'cat_2'); return p.v===36000 && p.e.official; }));
ok('Categorías especiales (IE) se ignoran', await E(()=>OFFICIAL[offKey('AMAGA')].cats[1].v===25900));
ok('Oficial INVÍAS reemplaza el estimado', await E(()=>{ const p=priceOf(TOLLS.find(t=>t.name==='Peaje Desconocido'),'cat_1'); return p.v===9100 && p.e.official && !p.est; }));
ok('Tarifa diferencial sigue aplicando sobre la oficial', await E(()=>{ document.getElementById('diff').checked=true; const v=priceOf(TOLLS.find(t=>t.name==='Tarapacá II'),'cat_1').v; document.getElementById('diff').checked=false; return v===700; }));
ok('Prensa más reciente que el dato oficial gana', await E(()=>{ const t={name:'Fusca',attrs:{}}; OFFICIAL[offKey('Fusca')]={cats:{1:{v:15200,desde:'2026-01-16',src:'ANI'}}}; return priceOf(t,'cat_1').v===16100; }));
ok('Info muestra estado de fuentes oficiales', (await p.textContent('#offinfo')).includes('ANI'));
// --- capas de mapa
await E(()=>{ scrollTo(0,0); setFollow(false); if(NAV) endNav(false); });
await p.click('#fabLayers'); ok('Menú de tipo de mapa', await p.isVisible('#basemenu'));
await p.click('#basemenu [data-b="satelite"]'); await p.waitForTimeout(400);
ok('Satélite: imágenes + vías + nombres', await E(()=>BASE==='satelite' && baseLayers[0]._url.includes('World_Imagery')));
await p.click('#fabLayers'); await p.click('#basemenu [data-b="oscuro"]'); await p.waitForTimeout(2500);
ok('Oscuro sin clave: mapa de calles con filtro oscuro (o su respaldo OSM oscuro)', await E(()=>BASE==='oscuro' && baseLayers[0].options.className==='tiles-dark' && !baseLayers.some(l=>/cartocdn/.test(l._url))), await E(()=>baseLayers.map(l=>l._url).join(' ')));
ok('Mapa oscuro marca la interfaz', await E(()=>document.body.classList.contains('darkmap')));
ok('Tipo de mapa se recuerda', await E(()=>localStorage.getItem('peajes_base')==='oscuro'));
await p.click('#fabLayers'); await p.click('#basemenu [data-b="claro"]');
// --- gestos
const c0=await E(()=>{ ME={lat:4.62,lon:-74.12}; FOLLOW=true; GESTURE=true; const c=map.getCenter(); updateCar(4.62,-74.12,null,10); if(FOLLOW&&!GESTURE) map.panTo([ME.lat,ME.lon]); return [c.lat,c.lng]; });
ok('Con dedos sobre el mapa, el GPS no lo desplaza', await p.evaluate((c)=>{ const n=map.getCenter(); GESTURE=false; FOLLOW=false; return Math.abs(n.lat-c[0])<1e-9 && Math.abs(n.lng-c[1])<1e-9; },c0));
ok('Girar con dos dedos en modo rumbo pasa a giro libre', await E(()=>{ HEADUP=true; const t1=new Touch({identifier:1,target:map.getContainer(),clientX:100,clientY:200}), t2=new Touch({identifier:2,target:map.getContainer(),clientX:200,clientY:300});
  map.getContainer().dispatchEvent(new TouchEvent('touchstart',{touches:[t1,t2],bubbles:true})); map.getContainer().dispatchEvent(new TouchEvent('touchend',{touches:[],bubbles:true})); return HEADUP===false && GESTURE===false; }));
ok('Un solo gestor de pellizco configurado por centro común (anti-temblor)', await E(()=>PINCHERS().length>=1 && typeof VEC._onZoom==='function'));
ok('Sin errores JS en todo el recorrido', errors.length===0, errors.join(' | '));
console.log(results.join('\n'));console.log(`\n${results.filter(x=>x.startsWith('PASS')).length}/${results.length} pruebas OK · OSRM:${osrmCalls} Valhalla:${valhallaCalls} Photon:${photonCalls} Nominatim:${nomiCalls}`);
await b.close();srv.close();})();

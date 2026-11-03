const {chromium}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');
const ROOT=process.argv[4]||require('path').resolve(__dirname,'../..'); const PORT=+process.argv[2]||8793; const BEAR=+process.argv[3]||0;
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html'});r.end(d);});}).listen(PORT);
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:400,height:850},hasTouch:true,isMobile:true});const p=await ctx.newPage();
const J=(r,o)=>r.fulfill({contentType:'application/json',body:JSON.stringify(o),headers:{'access-control-allow-origin':'*'}});
await p.route('**/*',r=>{const u=r.request().url(); if(u.includes('localhost'))return r.continue();
 if(u.includes('leaflet-rotate'))return r.fulfill({body:fs.readFileSync(require.resolve('leaflet-rotate/dist/leaflet-rotate.js')),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
 if(u.includes('project-osrm')){const dense=(arr)=>{const o=[];for(let k=1;k<arr.length;k++){for(let s=0;s<200;s++)o.push([arr[k-1][0]+(arr[k][0]-arr[k-1][0])*s/200,arr[k-1][1]+(arr[k][1]-arr[k-1][1])*s/200]);}o.push(arr[arr.length-1]);return o;};
   return J(r,{code:'Ok',routes:[{distance:6000,duration:600,geometry:{type:'LineString',coordinates:dense([[-75.50,5.05],[-75.48,5.07],[-75.46,5.06]])}}]});}
 if(u.includes('valhalla'))return J(r,{edges:[]}); return r.fulfill({status:404});});
await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(700);
await p.evaluate(()=>{document.getElementById('explore').checked=false;A={lat:5.05,lon:-75.50,label:'a'};B={lat:5.06,lon:-75.46,label:'b'};document.getElementById('orig').value='a';document.getElementById('dest').value='b';});
await p.click('#go');await p.waitForTimeout(800);await p.evaluate((bb)=>{scrollTo(0,0); map.setView([5.065,-75.485],14,{animate:false}); map.setBearing(bb);},BEAR);await p.waitForTimeout(300);
// durante la animación de zoom: ¿el vértice de la línea coincide con un marcador puesto en el mismo punto?
await p.evaluate(()=>{ map.setBearing(0); ME={lat:5.06,lon:-75.49}; startNav(); }); await p.waitForTimeout(600);
const sample=()=>p.evaluate(()=>{ const r=carMarker.getElement().getBoundingClientRect(), m=map.getContainer().getBoundingClientRect(); return [Math.round(r.left+r.width/2-m.left),Math.round(r.top+r.height/2-m.top)]; });
const start=await sample();
const cdp=await ctx.newCDPSession(p); const cx=200, cy=250; const out=[];
const tp=d=>[{x:cx-d,y:cy-d*0.3,id:1},{x:cx+d,y:cy+d*0.3,id:2}];
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:tp(40)});
for(let k=1;k<=20;k++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:tp(40+k*6)}); await p.waitForTimeout(30); out.push(await sample()); }
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await p.waitForTimeout(600);
const fin=await sample(); const dev=out.map(q=>Math.hypot(q[0]-start[0],q[1]-start[1])); const res={carroInicio:start, desvioMaxDurantePellizco_px:Math.round(Math.max(...dev)), carroFinal:fin, zoom:await p.evaluate(()=>map.getZoom())};
console.log('bearing',BEAR,JSON.stringify(res));
await b.close();srv.close();})();

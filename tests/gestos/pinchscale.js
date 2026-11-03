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
await p.evaluate(()=>{ window.__mk=L.marker([5.07,-75.48],{icon:L.divIcon({className:'',iconSize:[2,2],iconAnchor:[1,1],html:'<div id="probe" style="width:2px;height:2px"></div>'})}).addTo(map); });
const sample=()=>p.evaluate(()=>{ const pth=[...document.querySelectorAll('path')].find(x=>x.getAttribute('stroke')==='#2f6bff'); const pr=document.getElementById('probe').getBoundingClientRect(); const want={x:pr.left+1,y:pr.top+1};
    const L0=pth.getTotalLength(), ctm=pth.getScreenCTM(); let best=1e9; for(let i=0;i<=600;i++){ const q=pth.getPointAtLength(L0*i/600); const sx=q.x*ctm.a+q.y*ctm.c+ctm.e, sy=q.x*ctm.b+q.y*ctm.d+ctm.f; best=Math.min(best,Math.hypot(sx-want.x,sy-want.y)); } return +best.toFixed(1); });
const cdp=await ctx.newCDPSession(p); const cx=220, cy=300; const out=[];
const tp=d=>[{x:cx-d,y:cy-d*0.3,id:1},{x:cx+d,y:cy+d*0.3,id:2}];
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:tp(40)});
for(let k=1;k<=20;k++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:tp(40+k*6)}); await p.waitForTimeout(30); out.push(await p.evaluate(()=>{ const pth=[...document.querySelectorAll('path')].find(x=>x.getAttribute('stroke')==='#2f6bff'); const m=pth.getScreenCTM(); return +Math.hypot(m.a,m.b).toFixed(2); })); }
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await p.waitForTimeout(600);
const res={escalaMinima:Math.min(...out), escalaMaxima:Math.max(...out), zoom:await p.evaluate(()=>map.getZoom()), muestras:out.slice(0,12)};
console.log('bearing',BEAR,JSON.stringify(res));
await b.close();srv.close();})();

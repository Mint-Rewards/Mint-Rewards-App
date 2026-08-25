/**
 * Local box-drawing tool for P0.1a extents.
 *
 *   node scripts/geocode-spike/draw-extents.js
 *   -> http://localhost:8081
 *
 * Drag a rectangle around each area on satellite imagery; it saves straight to
 * scripts/geocode-spike/extents.json.
 *
 * WHY THE BASEMAP IS SATELLITE AND NOT OSM. Nominatim *is* OSM. If the extents
 * were traced from OSM's own suburb polygons, points sampled inside them would
 * resolve to that suburb almost by construction, the measured hit rate would
 * approach 100% regardless of real-world quality, and the spike would be
 * testing OSM against itself. The imagery here (Esri) is an independent source,
 * which is the whole point of drawing these by hand.
 *
 * The optional labels overlay is also Esri, not OSM, so using it for
 * orientation does not reintroduce that circularity.
 *
 * Runs a tiny server rather than shipping a file:// page so it can write
 * extents.json directly — a file:// page cannot, and cannot fetch its own
 * sibling JSON either.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadRegistry } = require("./loadRegistry");
const { TOWN_LEVEL_STRATA } = require("./strata");

const PORT = Number(process.env.PORT || 8081);
const EXTENTS = path.join(__dirname, "extents.json");

function buildTownList() {
  const { PAKISTAN_LOCATIONS, getTownsForCity, cityHasTowns } = loadRegistry();
  const groups = [];

  // Cities with town data, ordered by sampling priority so the areas that
  // actually gate the decision are drawn first.
  const order = Object.keys(TOWN_LEVEL_STRATA);
  for (const city of order) {
    const towns = getTownsForCity(city);
    if (!towns.length) continue;
    groups.push({
      city,
      stratum: TOWN_LEVEL_STRATA[city].stratum,
      pointsPerTown: TOWN_LEVEL_STRATA[city].pointsPerTown,
      keys: towns.map((t) => `${city}::${t}`),
    });
  }

  // Cities with no town data are sampled at city level: one box each.
  const cityOnly = Object.values(PAKISTAN_LOCATIONS.cities)
    .flat()
    .filter((c) => !cityHasTowns(c))
    .sort();
  groups.push({
    city: "(cities with no area data — one box each)",
    stratum: "city-only",
    pointsPerTown: 10,
    keys: cityOnly,
  });

  return groups;
}

const GROUPS = buildTownList();

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Draw extents</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body{margin:0;height:100%;font:13px/1.45 system-ui,-apple-system,sans-serif}
  #wrap{display:flex;height:100%}
  #side{width:320px;flex:none;display:flex;flex-direction:column;border-right:1px solid #d5dbe2;background:#fff}
  #map{flex:1}
  header{padding:10px 12px;border-bottom:1px solid #e3e8ee}
  h1{font-size:14px;margin:0 0 4px}
  .warn{background:#fff8e1;border:1px solid #f0dca0;border-radius:6px;padding:8px 10px;margin:8px 12px;font-size:12px;color:#5c4813}
  #search{margin:8px 12px;padding:7px 9px;width:calc(100% - 24px);box-sizing:border-box;border:1px solid #cbd3dc;border-radius:6px;font-size:13px}
  #list{flex:1;overflow:auto;padding:0 6px 12px}
  .grp{padding:10px 6px 4px;font-weight:600;color:#516070;font-size:11px;text-transform:uppercase;letter-spacing:.04em;position:sticky;top:0;background:#fff}
  .row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer}
  .row:hover{background:#f2f5f8}
  .row.active{background:#449EB2;color:#fff}
  .row.done .name::after{content:" ✓";color:#2e7d32;font-weight:700}
  .row.active.done .name::after{color:#dff5e1}
  .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .clr{opacity:.55;font-size:16px;line-height:1;padding:0 2px}
  .clr:hover{opacity:1}
  footer{padding:10px 12px;border-top:1px solid #e3e8ee;display:flex;gap:8px;align-items:center}
  button{font:inherit;padding:7px 11px;border-radius:6px;border:1px solid #cbd3dc;background:#fff;cursor:pointer}
  button.primary{background:#449EB2;border-color:#449EB2;color:#fff}
  #count{font-size:12px;color:#516070;margin-left:auto}
  #hint{position:absolute;z-index:1000;left:50%;transform:translateX(-50%);top:10px;background:rgba(20,28,38,.86);color:#fff;padding:7px 13px;border-radius:20px;pointer-events:none}
  label.tog{display:flex;gap:6px;align-items:center;font-size:12px;color:#516070;padding:0 12px 8px}
</style></head><body>
<div id="wrap">
  <div id="side">
    <header><h1>Draw area extents</h1>
      <div style="color:#67788a">Pick an area, then drag a box on the map.</div></header>
    <div class="warn"><b>Draw from the imagery.</b> Do not trace OSM outlines —
      Nominatim is built from OSM, so tracing it would test OSM against itself and
      report a hit rate near 100% regardless of real quality.</div>
    <div class="warn" style="background:#eef6fb;border-color:#bcd9ea;color:#234">
      <b>Trace the outline.</b> Most of these places are not rectangles. A loose
      box swallows the neighbouring area, and every point landing there is one
      the geocoder gets right and the score counts as a miss. Freehand fits the
      real footprint; use Box for the genuinely rectangular grids (Islamabad
      sectors). Add as many shapes as you need — points are split between them
      by area.</div>
    <label class="tog"><input type="checkbox" id="labels"> Show place labels (Esri, not OSM)</label>
    <div class="tog" style="gap:12px">
      <label><input type="radio" name="mode" value="free" checked> Freehand</label>
      <label><input type="radio" name="mode" value="box"> Box</label>
    </div>
    <input id="search" placeholder="Filter areas…">
    <div id="list"></div>
    <footer>
      <button id="undo">Undo shape</button>
      <button id="fit">Fit</button>
      <button class="primary" id="save">Save</button>
      <span id="count"></span>
    </footer>
  </div>
  <div id="map"><div id="hint">Select an area to begin</div></div>
</div>
<script>
const GROUPS = ${JSON.stringify(GROUPS)};
let extents = {};
let active = null;
const layers = {};

const map = L.map('map',{zoomControl:true}).setView([24.89,67.08],11);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {maxZoom:19, attribution:'Imagery © Esri'}).addTo(map);
const labelLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxZoom:19});
document.getElementById('labels').onchange = e => e.target.checked ? labelLayer.addTo(map) : map.removeLayer(labelLayer);

const hint = document.getElementById('hint');
const setHint = t => { hint.textContent = t; hint.style.display = t ? 'block' : 'none'; };

function boundsOf(b){ return L.latLngBounds([b.minLat,b.minLng],[b.maxLat,b.maxLng]); }
const shapesOf = key => extents[key] || [];
const isPoly = s => Array.isArray(s.polygon);
const mode = () => document.querySelector('input[name=mode]:checked').value;

function layerFor(shape, activeStyle){
  const style = { color: activeStyle?'#ffd54f':'#449EB2', weight: activeStyle?3:1.5,
                  fillOpacity: activeStyle?0.18:0.07 };
  return isPoly(shape) ? L.polygon(shape.polygon, style) : L.rectangle(boundsOf(shape), style);
}
function unionOf(key){
  const ss=shapesOf(key); if(!ss.length) return null;
  let u=null;
  ss.forEach(sh=>{ const b=layerFor(sh,false).getBounds(); u = u ? u.extend(b) : b; });
  return u;
}
function draw(key){
  (layers[key]||[]).forEach(l=>map.removeLayer(l));
  layers[key] = shapesOf(key).map((sh,i)=>
    layerFor(sh, key===active).addTo(map)
      .bindTooltip(key+' · '+(isPoly(sh)?'shape ':'box ')+(i+1),{sticky:true}));
}
function redraw(){
  Object.keys(layers).forEach(k=>(layers[k]||[]).forEach(l=>map.removeLayer(l)));
  Object.keys(layers).forEach(k=>delete layers[k]);
  Object.keys(extents).forEach(draw);
}

// Drag to draw. Leaflet dragging is suspended so the map does not pan out from
// under the shape being drawn.
let start=null, ghost=null, path=null;

function commit(shape){
  (extents[active] = extents[active] || []).push(shape);
  redraw(); render(); save(true);
  const n = shapesOf(active).length;
  setHint(active+' — '+n+(n===1?' shape':' shapes')+
    '. Draw again to add another, or pick the next area.');
}

map.getContainer().addEventListener('mousedown', e=>{
  if(!active || e.button!==0) return;
  start = map.mouseEventToLatLng(e);
  map.dragging.disable();
  if(mode()==='free'){
    path=[[start.lat,start.lng]];
    ghost=L.polyline(path,{color:'#ffd54f',weight:2,dashArray:'4,3'}).addTo(map);
  } else {
    ghost=L.rectangle(L.latLngBounds(start,start),
      {color:'#ffd54f',weight:2,dashArray:'4,3',fillOpacity:.12}).addTo(map);
  }
});

map.getContainer().addEventListener('mousemove', e=>{
  if(!start||!ghost) return;
  const ll = map.mouseEventToLatLng(e);
  if(mode()==='free'){
    // Decimate to ~6px: a raw mousemove trace stores hundreds of points that
    // add no shape information and bloat extents.json.
    const last = path[path.length-1];
    const a = map.latLngToContainerPoint(L.latLng(last[0],last[1]));
    const b = map.latLngToContainerPoint(ll);
    if(a.distanceTo(b) < 6) return;
    path.push([ll.lat,ll.lng]);
    ghost.setLatLngs(path);
  } else {
    ghost.setBounds(L.latLngBounds(start, ll));
  }
});

window.addEventListener('mouseup', e=>{
  if(!start) return;
  const end = map.mouseEventToLatLng(e);
  const wasFree = mode()==='free';
  const drawn = path;
  const origin = start;              // captured before reset — box mode needs it
  if(ghost){ map.removeLayer(ghost); ghost=null; }
  map.dragging.enable();
  start=null; path=null;

  if(wasFree){
    // Three points is the minimum for an area at all; below that it is a
    // stray click or a twitch, and saving it would create a degenerate shape
    // whose points all land in one spot.
    if(!drawn || drawn.length < 3){ setHint('Too short — drag to trace the outline'); return; }
    const round = drawn.map(p=>[+p[0].toFixed(6), +p[1].toFixed(6)]);
    commit({ polygon: round });
  } else {
    const b = L.latLngBounds(origin, end);
    if(Math.abs(b.getEast()-b.getWest())<0.0008 || Math.abs(b.getNorth()-b.getSouth())<0.0008){
      setHint('Box too small — drag a larger rectangle'); return;
    }
    commit({
      minLat:+b.getSouth().toFixed(6), maxLat:+b.getNorth().toFixed(6),
      minLng:+b.getWest().toFixed(6),  maxLng:+b.getEast().toFixed(6)
    });
  }
});

function render(){
  const q = document.getElementById('search').value.trim().toLowerCase();
  const list = document.getElementById('list'); list.innerHTML='';
  let done=0, total=0;
  for(const g of GROUPS){
    const keys = g.keys.filter(k=>!q||k.toLowerCase().includes(q));
    total += g.keys.length; done += g.keys.filter(k=>extents[k]).length;
    if(!keys.length) continue;
    const h=document.createElement('div'); h.className='grp';
    h.textContent = g.city+' — '+g.stratum+', '+g.pointsPerTown+' pts/area';
    list.appendChild(h);
    for(const k of keys){
      const row=document.createElement('div');
      row.className='row'+(k===active?' active':'')+(extents[k]?' done':'');
      const n=document.createElement('span'); n.className='name';
      const cnt = shapesOf(k).length;
      n.textContent = (k.includes('::') ? k.split('::')[1] : k) + (cnt>1 ? '  ('+cnt+')' : '');
      row.appendChild(n);
      if(cnt){
        const x=document.createElement('span'); x.className='clr'; x.textContent='×';
        x.title='Clear all shapes for this area';
        x.onclick=ev=>{ev.stopPropagation(); delete extents[k]; redraw(); render(); save(true);};
        row.appendChild(x);
      }
      row.onclick=()=>{ active=k; redraw(); render();
        const u=unionOf(k); if(u) map.fitBounds(u.pad(0.6));
        setHint(cnt ? 'Drag to ADD another shape to this area'
                    : (mode()==='free' ? 'Trace the outline of '+n.textContent
                                       : 'Drag a box around '+n.textContent)); };
      list.appendChild(row);
    }
  }
  document.getElementById('count').textContent = done+' / '+total+' drawn';
}

async function save(quiet){
  const r = await fetch('/extents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(extents)});
  if(!quiet) setHint(r.ok?'Saved to extents.json':'SAVE FAILED');
}
document.getElementById('save').onclick=()=>save(false);
document.getElementById('search').oninput=render;
document.getElementById('fit').onclick=()=>{ const u=active&&unionOf(active); if(u) map.fitBounds(u.pad(0.6)); };
document.getElementById('undo').onclick=()=>{
  if(!active||!shapesOf(active).length) return;
  extents[active].pop();
  if(!extents[active].length) delete extents[active];
  redraw(); render(); save(true);
  setHint('Removed last shape from '+active);
};

fetch('/extents').then(r=>r.json()).then(d=>{ extents=d||{}; redraw(); render(); setHint('Select an area to begin'); });
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(HTML);
  }
  if (req.method === "GET" && req.url === "/extents") {
    let body = {};
    if (fs.existsSync(EXTENTS)) {
      try {
        const raw = JSON.parse(fs.readFileSync(EXTENTS, "utf8"));
        // Drop the template's _README so it never round-trips into saved data.
        for (const [k, v] of Object.entries(raw)) {
          if (k.startsWith("_") || !v) continue;
          // An area may carry several boxes; a bare object is the old
          // single-box form and is normalised up so both files keep working.
          const list = Array.isArray(v) ? v : [v];
          const shapes = list.filter(
            (b) => b && (typeof b.minLat === "number" ||
                        (Array.isArray(b.polygon) && b.polygon.length >= 3)),
          );
          if (shapes.length) body[k] = shapes;
        }
      } catch { body = {}; }
    }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(body));
  }
  if (req.method === "POST" && req.url === "/extents") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    return req.on("end", () => {
      try {
        const parsed = JSON.parse(raw);
        fs.writeFileSync(EXTENTS, JSON.stringify(parsed, null, 2) + "\n");
        res.writeHead(200).end("ok");
        process.stdout.write(`  saved ${Object.keys(parsed).length} extent(s)\r`);
      } catch (e) {
        res.writeHead(400).end(String(e.message));
      }
    });
  }
  res.writeHead(404).end("not found");
});

server.listen(PORT, () => {
  const total = GROUPS.reduce((a, g) => a + g.keys.length, 0);
  console.log(`Draw extents:  http://localhost:${PORT}`);
  console.log(`Writes to:     ${EXTENTS}`);
  console.log(`${total} areas available; Karachi's 29 are the ones that gate the decision.`);
  console.log(`Ctrl-C when done, then: node scripts/geocode-spike/generate-points.js`);
});

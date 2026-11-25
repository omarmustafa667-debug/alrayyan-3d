import * as THREE from "./three.module.js";
import {OrbitControls} from "./OrbitControls.js";
import {GLTFLoader} from "./GLTFLoader.js";
import {RoomEnvironment} from "./RoomEnvironment.js";
{
const RES_URL = "r3_model.glb";
const TANK_URL = "r2_model.glb";
const $ = id => document.getElementById(id);
const showErr = m => { const l = $("load"); l.style.display = ""; l.textContent = "Could not load: " + m; };
addEventListener("error", e => showErr(e.message || "script error"));
addEventListener("unhandledrejection", e => showErr((e.reason && e.reason.message) || String(e.reason)));
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 6000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = Math.PI * .49;
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
scene.add(new THREE.HemisphereLight(0xe3edf4, 0xb39b78, 1.7));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.6); sun.position.set(-300, 400, 300); scene.add(sun);

const PORTRAIT = innerWidth < innerHeight, NARROW = innerWidth < 600;
const VIEWS = {
  res: {title:"Open reservoir at J016", sub:"Lined reservoir, 190 × 94.5 m floor · drag to orbit, pinch to zoom",
        cap:29565, capLab:"of 29,565 m³", lvLab:"water level, m QNHD",
        home: PORTRAIT ? [[230, 300, 300], [0, 40, -10]] : [[215, 175, 235], [0, 10, 0]], min:25, max:900,
        tags:[[NARROW ? "Headwall, DN1800" : "Inflow / outflow headwall (DN1800)", [0, 13.5, -48.5]],
              [NARROW ? "Ramp" : "Maintenance ramp", [48, 12.5, -51]],
              [NARROW ? "1V:4H lined slope" : "1V:4H HDPE-lined slopes", [-99, 12.5, 30]]]},
  tank: {title:"Tanks A + B, cutaway", sub:"Two buried RC tanks, 2 × 29,500 m³, park on top · drag to orbit, pinch to zoom",
        cap:59000, capLab:"of 59,000 m³", lvLab:"tank water, m QNHD",
        home: PORTRAIT ? [[-92, 30, 62], [-44, 20, -14]] : [[-118, 38, 70], [-40, 14, -12]], min:8, max:500,
        tags:[["Tank A", [-52, 18.2, -15]], ["Tank B", [52, 18.2, -15]],
              [NARROW ? "Sump pumps" : "Sump dewatering pumps to TKDR drain", [-52.6, 11.4, -1]],
              [NARROW ? "Park on 5 m cover" : "Public park on ~5 m soil cover", [-70, 23.5, -14]],
              [NARROW ? "Inlet culvert" : "Inlet box culvert from J039", [-15, 16.8, -29.5]]]},
};
let view = "res", D = null, M2 = null;
const groups = {res:null, tank:null}, tankWater = [];
let resWater = null;

/* tags */
let tagEls = [];
function buildTags(){
  $("tags").innerHTML = ""; tagEls = VIEWS[view].tags.map(([txt, p]) => {
    const d = document.createElement("div"); d.className = "tag"; d.textContent = txt; $("tags").appendChild(d);
    return {d, v: new THREE.Vector3(...p)};
  });
}
const pv = new THREE.Vector3();
function placeTags(){
  for (const t of tagEls){
    pv.copy(t.v).project(camera);
    const vis = pv.z < 1 && Math.abs(pv.x) < 1.05 && Math.abs(pv.y) < 1.05;
    t.d.style.display = vis ? "" : "none";
    t.d.style.transform = `translate(${(pv.x * .5 + .5) * innerWidth}px,${(-pv.y * .5 + .5) * innerHeight - 16}px) translate(-50%,-100%)`;
  }
}

/* data helpers */
const PHASES = {
  res:  [[0,"Before the storm",0],[11.2,"Filling",1],[14.9,"Peak storage",1],[16.5,"Draining by gravity",0],[60,"Empty, ready again",0]],
  tank: [[0,"Before the storm",0],[4.6,"Filling over the J039 weir",1],[28.5,"Full, holding",1],[36.4,"Dewatered to J016",0],[69.6,"Empty, ready again",0]],
};
function interp(T, V, t){
  if (t <= T[0]) return V[0];
  for (let i = 1; i < T.length; i++) if (t <= T[i]) { const f = (t - T[i-1]) / (T[i] - T[i-1]); return V[i-1] + f * (V[i] - V[i-1]); }
  return V[V.length - 1];
}
function drawSpark(){
  const s = $("spark"), W = s.clientWidth || 200, H = s.clientHeight || 38;
  if (!D) return;
  const path = arr => D.t_h.map((t, i) => `${(t / 72 * W).toFixed(1)},${(H - 2 - arr[i] / 60000 * (H - 4)).toFixed(1)}`).join(" ");
  s.innerHTML = `<polyline points="${path(D.tanks_m3)}" fill="none" stroke="#E69F00" stroke-width="2"/>` +
                `<polyline points="${path(D.res_m3)}" fill="none" stroke="#5E8FA3" stroke-width="2"/>` +
                `<line id="mk" x1="0" x2="0" y1="0" y2="${H}" stroke="#e0482a" stroke-width="1.5"/>`;
}
new ResizeObserver(drawSpark).observe($("spark"));

function setTime(t){
  if (!D) return;
  const resLv = interp(D.t_h, D.level, t), resV = interp(D.t_h, D.res_m3, t), tankV = interp(D.t_h, D.tanks_m3, t);
  const tankLv = 10.8 + tankV / 11800;
  const V = VIEWS[view], vol = view === "res" ? resV : tankV, lv = view === "res" ? resLv : tankLv;
  $("t").textContent = t.toFixed(1) + " h";
  $("lv").textContent = "+" + lv.toFixed(2);
  $("vol").textContent = Math.round(vol).toLocaleString("en-US") + " m³";
  $("pc").textContent = Math.round(100 * vol / V.cap) + " %";
  const P = PHASES[view]; let ph = P[0]; for (const p of P) if (t >= p[0]) ph = p;
  $("ph").textContent = ph[1]; $("ph").classList.toggle("storm", ph[2] === 1);
  const mk = document.getElementById("mk");
  if (mk){ const x = (t / 72 * ($("spark").clientWidth || 200)).toFixed(1); mk.setAttribute("x1", x); mk.setAttribute("x2", x); }
  if (resWater){ resWater.visible = resLv > D.invert + 0.006; resWater.position.y = resLv; }
  for (const w of tankWater){ const h = Math.max(tankLv - 10.8, 0.001); w.scale.y = h; w.position.y = 10.8 + h / 2; w.visible = tankV > 30; }
}

function resize(){
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < innerHeight ? 62 : 38; camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

function goHome(){
  const h = VIEWS[view].home; camera.position.set(...h[0]); controls.target.set(...h[1]);
  controls.minDistance = VIEWS[view].min; controls.maxDistance = VIEWS[view].max;
}

/* loading */
const loader = new GLTFLoader();
function bakeToBasic(root){
  root.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m && m.name && m.name.startsWith("BAKED") && m.map){
      m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = 8;
      o.material = new THREE.MeshBasicMaterial({map:m.map});
    }
  });
}
function load(url){
  $("load").style.display = "";
  return loader.loadAsync(url, p => { if (p.total) $("load").textContent = "Loading 3-D model… " + Math.round(100 * p.loaded / p.total) + " %"; })
    .finally(() => { $("load").style.display = "none"; });
}
const waterMat = new THREE.MeshPhysicalMaterial({color:0x4b7f8e, roughness:.07, transparent:true, opacity:.9, envMapIntensity:.6, clearcoat:.6, clearcoatRoughness:.1});
const tankMat = new THREE.MeshPhysicalMaterial({color:0x4f93a6, roughness:.05, transparent:true, opacity:.5, envMapIntensity:.8, clearcoat:.6, depthWrite:false});
async function ensure(v){
  if (groups[v]) return;
  if (v === "res"){
    const g = await load(RES_URL); bakeToBasic(g.scene); groups.res = g.scene; scene.add(g.scene);
    resWater = new THREE.Mesh(new THREE.PlaneGeometry(2 * D.bank.hx + .4, 2 * D.bank.hy + .4).rotateX(-Math.PI / 2), waterMat);
    g.scene.add(resWater);
  } else {
    const g = await load(TANK_URL); bakeToBasic(g.scene); groups.tank = g.scene; scene.add(g.scene);
    for (const tk of M2.tanks){
      const w = new THREE.Mesh(new THREE.BoxGeometry(tk.x1 - tk.x0 - .05, 1, M2.y1 - M2.y0 - .05), tankMat);
      w.position.set((tk.x0 + tk.x1) / 2, 11, -(M2.y0 + M2.y1) / 2); w.renderOrder = 2;
      g.scene.add(w); tankWater.push(w);
    }
  }
}
async function show(v){
  view = v;
  $("vRes").setAttribute("aria-pressed", String(v === "res")); $("vTank").setAttribute("aria-pressed", String(v === "tank"));
  await ensure(v);
  for (const k in groups) if (groups[k]) groups[k].visible = k === v;
  const V = VIEWS[v]; $("title").textContent = V.title; $("sub").textContent = V.sub; $("capLab").textContent = V.capLab; $("lvLab").textContent = V.lvLab;
  buildTags(); goHome(); setTime(+$("s").value);
}

/* playback: the whole 72 h storm in ~10 s */
let playing = false, last = performance.now();
function loop(ts){
  const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
  if (playing){
    let t = +$("s").value + dt * 7.2;
    if (t >= 72){ t = 72; playing = false; $("play").textContent = "▶"; }
    $("s").value = t; setTime(t);
  }
  controls.update(); renderer.render(scene, camera); placeTags();
  requestAnimationFrame(loop);
}
$("s").addEventListener("input", e => { playing = false; $("play").textContent = "▶"; setTime(+e.target.value); });
$("play").addEventListener("click", () => {
  if (!playing && +$("s").value >= 71.9) $("s").value = 0;
  playing = !playing; $("play").textContent = playing ? "❚❚" : "▶"; last = performance.now();
});
$("home").addEventListener("click", goHome);
$("lbl").addEventListener("click", e => { const off = document.body.classList.toggle("hide"); e.currentTarget.setAttribute("aria-pressed", String(!off)); });
$("vRes").addEventListener("click", () => show("res"));
$("vTank").addEventListener("click", () => show("tank"));

Promise.all([fetch("r3_levels.json").then(r => r.json()), fetch("r2_meta.json").then(r => r.json())])
  .then(([d, m]) => { D = d; M2 = m; drawSpark(); $("s").value = 15.2; return show("res"); })
  .catch(err => { $("load").style.display = ""; $("load").textContent = "Could not load the model (" + err.message + ")"; });
requestAnimationFrame(loop);
}

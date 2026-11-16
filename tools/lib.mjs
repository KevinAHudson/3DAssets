// Library tools, run with node from the library folder (after `npm install`):
//   node tools/lib.mjs export <builders.js> <out-folder>   save every object a builders file makes as .glb
//   node tools/lib.mjs inspect <file.glb> [more.glb ...]   check each loads, measure it, write a .png beside it
// A builders file is an ES module that imports from 'three' and exports
//   export const objects = { drone: () => buildDrone(), girl: () => buildGirl() };
// Each function returns a THREE.Object3D. Name the parts you may want to move (object.name = 'rotor_1').
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const LIB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(LIB, 'node_modules');
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

function serve(roots) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/page.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(`<!doctype html><html><head><script type="importmap">{"imports":{"three":"/nm/three/build/three.module.js","three/addons/":"/nm/three/examples/jsm/"}}</script></head><body style="margin:0;background:#dfe6ee"><canvas id="c" width="512" height="512"></canvas></body></html>`);
    }
    const [, key, ...rest] = url.split('/');
    const root = roots[key];
    const file = root && path.join(root, ...rest);
    if (!file || !file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function browser() {
  const { chromium } = require('playwright');
  return chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

async function exportAll(buildersFile, outDir) {
  const file = path.resolve(buildersFile);
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serve({ nm: NM, lib: LIB, user: path.dirname(file) });
  const b = await browser();
  const page = await b.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/page.html`);
  const made = await page.evaluate(async (name) => {
    const mod = await import('/user/' + name);
    const { exportObject } = await import('/lib/kit/library.js');
    if (!mod.objects) throw new Error('the builders file must export `objects`');
    const out = {};
    for (const [key, make] of Object.entries(mod.objects)) {
      const object = await make();
      object.name = object.name || key;
      const buf = await exportObject(object);
      let s = ''; const u = new Uint8Array(buf);
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      out[key] = btoa(s);
    }
    return out;
  }, path.basename(file));
  for (const [key, b64] of Object.entries(made)) {
    fs.writeFileSync(path.join(outDir, key + '.glb'), Buffer.from(b64, 'base64'));
    console.log('saved', path.join(outDir, key + '.glb'));
  }
  await b.close(); server.close();
}

async function inspect(files) {
  const b = await browser();
  const out = [];
  for (const f of files) {
    const file = path.resolve(f);
    const server = await serve({ nm: NM, lib: LIB, user: path.dirname(file) });
    const page = await b.newPage({ viewport: { width: 512, height: 512 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/page.html`);
    const info = await page.evaluate(async (name) => {
      const THREE = await import('three');
      const { loadObject } = await import('/lib/kit/library.js');
      const obj = await loadObject('/user/' + name);
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#dfe6ee'); scene.add(obj);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(2, 4, 3); scene.add(sun);
      const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const r = Math.max(size.x, size.y, size.z) || 1;
      const cam = new THREE.PerspectiveCamera(35, 1, r / 100, r * 100);
      cam.position.set(mid.x + r * 1.5, mid.y + r * 0.9, mid.z + r * 1.9); cam.lookAt(mid);
      const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
      renderer.render(scene, cam);
      const parts = []; let triangles = 0;
      obj.traverse((o) => { if (o.name && o !== obj) parts.push(o.name); if (o.isMesh) { const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
      return { size: [size.x, size.y, size.z].map((v) => +v.toFixed(3)), parts: [...new Set(parts)].slice(0, 60), triangles: Math.round(triangles) };
    }, path.basename(file));
    const png = file.replace(/\.glb$/, '.png');
    await page.locator('#c').screenshot({ path: png });
    out.push({ file: f, thumbnail: png, ...info });
    await page.close(); server.close();
  }
  await b.close();
  console.log(JSON.stringify(out));
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'export' && args.length === 2) await exportAll(args[0], args[1]);
else if (cmd === 'inspect' && args.length) await inspect(args);
else { console.error('usage: node tools/lib.mjs export <builders.js> <out-folder> | inspect <file.glb> ...'); process.exit(2); }

/* ============================================================
   ARPlan Pro — DXF Web Worker
   Corre en hilo separado: no bloquea la UI durante el parseo.
   Recibe: { type: 'PARSE', text: string }
   Envía:  { type: 'PROGRESS', pct: number }
           { type: 'RESULT',   data: ParsedDXF }
           { type: 'ERROR',    message: string }
============================================================ */

self.onmessage = function(event) {
  if (!event.data || event.data.type !== 'PARSE') return;

  try {
    const result = parseDXF(event.data.text);
    self.postMessage({ type: 'RESULT', data: result });
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err.message || 'Error desconocido' });
  }
};

/* ── Parser DXF completo ──────────────────────────────────── */
function parseDXF(text) {

  /* 1. Normalizar saltos de línea y construir lista de pares (code, value) */
  self.postMessage({ type: 'PROGRESS', pct: 5 });

  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const code = parseInt(raw[i].trim(), 10);
    const value = raw[i + 1].trim();
    if (!isNaN(code)) pairs.push([code, value]);
  }

  self.postMessage({ type: 'PROGRESS', pct: 15 });

  /* 2. Leer encabezado $INSUNITS para escala real */
  const units = readInsUnits(pairs);

  self.postMessage({ type: 'PROGRESS', pct: 20 });

  /* 3. Leer tabla de capas (sección TABLES → LAYER) */
  const layerColors = readLayerTable(pairs);

  self.postMessage({ type: 'PROGRESS', pct: 30 });

  /* 4. Leer bloques (sección BLOCKS) para INSERT */
  const blocks = readBlocks(pairs);

  self.postMessage({ type: 'PROGRESS', pct: 45 });

  /* 5. Procesar sección ENTITIES */
  const entities = readEntities(pairs, blocks);

  self.postMessage({ type: 'PROGRESS', pct: 90 });

  /* 6. Consolidar capas únicas */
  const layerSet = new Set();
  entities.segments.forEach(s => layerSet.add(s.layer));
  entities.circles.forEach(c => layerSet.add(c.layer));
  entities.arcs.forEach(a => layerSet.add(a.layer));
  entities.texts.forEach(t => layerSet.add(t.layer));
  entities.points.forEach(p => layerSet.add(p.layer));

  self.postMessage({ type: 'PROGRESS', pct: 100 });

  return {
    segments:    entities.segments,
    circles:     entities.circles,
    arcs:        entities.arcs,
    texts:       entities.texts,
    points:      entities.points,
    layers:      Array.from(layerSet),
    layerColors: layerColors,
    units:       units,
  };
}

/* ── Leer $INSUNITS del header ────────────────────────────── */
function readInsUnits(pairs) {
  /*
    DXF unit codes (código 70 después de $INSUNITS):
    0=sin unidades, 1=pulgadas, 2=pies, 4=mm, 5=cm, 6=metros
    Devuelve factor de conversión a metros.
  */
  const factors = { 0:1, 1:0.0254, 2:0.3048, 4:0.001, 5:0.01, 6:1 };
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i][0] === 9 && pairs[i][1] === '$INSUNITS') {
      const code70 = pairs[i + 1];
      if (code70 && code70[0] === 70) {
        const u = parseInt(code70[1], 10);
        return { code: u, factor: factors[u] ?? 1, label: unitLabel(u) };
      }
    }
  }
  return { code: 0, factor: 1, label: 'desconocido' };
}

function unitLabel(code) {
  const labels = { 0:'sin unidades', 1:'pulgadas', 2:'pies',
                   4:'mm', 5:'cm', 6:'metros' };
  return labels[code] || 'desconocido';
}

/* ── Leer tabla de capas ──────────────────────────────────── */
function readLayerTable(pairs) {
  /*
    En sección TABLES, cada entidad LAYER tiene:
      código 2  → nombre de capa
      código 62 → color ACI (AutoCAD Color Index, 1-255)
    Convertimos ACI a hex aproximado.
  */
  const colorMap = {};
  let inTables = false, inLayerTable = false;
  let curLayerName = null;

  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];

    if (code === 0 && value === 'SECTION') {
      const next = pairs[i + 1];
      if (next && next[0] === 2 && next[1] === 'TABLES') inTables = true;
      continue;
    }
    if (code === 0 && value === 'ENDSEC') { inTables = false; inLayerTable = false; continue; }
    if (!inTables) continue;

    if (code === 0 && value === 'TABLE') {
      const next = pairs[i + 1];
      if (next && next[0] === 2 && next[1] === 'LAYER') inLayerTable = true;
      continue;
    }
    if (code === 0 && value === 'ENDTAB') { inLayerTable = false; continue; }
    if (!inLayerTable) continue;

    if (code === 0 && value === 'LAYER') { curLayerName = null; continue; }
    if (curLayerName === null && code === 2) { curLayerName = value; continue; }
    if (curLayerName !== null && code === 62) {
      colorMap[curLayerName] = aciToHex(parseInt(value, 10));
      curLayerName = null;
    }
  }
  return colorMap;
}

/* AutoCAD Color Index → color hex aproximado (primeros 9 colores estándar) */
function aciToHex(aci) {
  const ACI = {
    1:'#ff0000', 2:'#ffff00', 3:'#00ff00', 4:'#00ffff',
    5:'#0000ff', 6:'#ff00ff', 7:'#ffffff', 8:'#808080', 9:'#c0c0c0',
  };
  if (ACI[aci]) return ACI[aci];
  /* Para índices > 9: generamos un color HSL distribuido */
  const hue = ((aci - 10) * 13.7) % 360;
  return hslToHex(hue, 70, 55);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

/* ── Leer bloques (para INSERT) ───────────────────────────── */
function readBlocks(pairs) {
  const blocks = {};
  let inBlocks = false;
  let curBlock = null;
  let i = 0;

  while (i < pairs.length) {
    const [code, value] = pairs[i];

    if (code === 0 && value === 'SECTION') {
      if (pairs[i+1]?.[0] === 2 && pairs[i+1]?.[1] === 'BLOCKS') inBlocks = true;
      i++; continue;
    }
    if (code === 0 && value === 'ENDSEC') { inBlocks = false; curBlock = null; i++; continue; }
    if (!inBlocks) { i++; continue; }

    if (code === 0 && value === 'BLOCK') {
      i++;
      let name = '*unnamed';
      while (i < pairs.length && pairs[i][0] !== 0) {
        if (pairs[i][0] === 2) name = pairs[i][1];
        i++;
      }
      curBlock = { name, segments:[], circles:[], arcs:[], texts:[], points:[] };
      blocks[name] = curBlock;
      continue;
    }
    if (code === 0 && value === 'ENDBLK') { curBlock = null; i++; continue; }

    if (curBlock) {
      const ent = tryReadEntity(pairs, i);
      if (ent) {
        appendEntity(curBlock, ent.entity);
        i = ent.nextIndex;
        continue;
      }
    }
    i++;
  }
  return blocks;
}

/* ── Leer entidades ───────────────────────────────────────── */
function readEntities(pairs, blocks) {
  const result = { segments:[], circles:[], arcs:[], texts:[], points:[] };
  let inEntities = false;
  let i = 0;

  /* Localizar sección ENTITIES */
  while (i < pairs.length) {
    if (pairs[i][0] === 0 && pairs[i][1] === 'SECTION') {
      if (pairs[i+1]?.[0] === 2 && pairs[i+1]?.[1] === 'ENTITIES') {
        inEntities = true; i += 2; break;
      }
    }
    i++;
  }
  /* Fallback: si no hay sección ENTITIES, escanear todo */
  if (!inEntities) i = 0;

  while (i < pairs.length) {
    if (pairs[i][0] === 0 && pairs[i][1] === 'ENDSEC') break;

    const ent = tryReadEntity(pairs, i);
    if (ent) {
      if (ent.entity.type === 'INSERT') {
        /* Expandir bloque en la posición del INSERT */
        expandInsert(result, blocks, ent.entity);
      } else {
        appendEntity(result, ent.entity);
      }
      i = ent.nextIndex;
    } else {
      i++;
    }
  }
  return result;
}

/* ── Intentar leer una entidad en la posición i ───────────── */
function tryReadEntity(pairs, i) {
  if (pairs[i][0] !== 0) return null;
  const type = pairs[i][1];
  const supported = ['LINE','LWPOLYLINE','POLYLINE','SPLINE',
                     'CIRCLE','ARC','TEXT','MTEXT','INSERT','POINT'];
  if (!supported.includes(type)) return null;

  i++;
  const props = {};
  props.type = type;
  props.layer = '0';

  /* Acumuladores para tipos con listas de coordenadas */
  const polyPoints = [];
  let px = null, py = null;
  let bulge = 0;

  while (i < pairs.length && pairs[i][0] !== 0) {
    const [code, value] = pairs[i];

    if (code === 8)  props.layer  = value;
    if (code === 10) px           = parseFloat(value);
    if (code === 20) {
      py = parseFloat(value);
      if (type === 'LWPOLYLINE' || type === 'SPLINE') {
        if (px !== null && isFinite(px) && isFinite(py)) {
          const pz = props._lz || 0;
          polyPoints.push({ x:px, y:py, z:pz, bulge });
          px = null; py = null; bulge = 0; props._lz = 0;
        }
      }
    }
    if (code === 30) {
      if (type === 'LWPOLYLINE' || type === 'SPLINE') props._lz = parseFloat(value);
      else props.z1 = parseFloat(value);
    }
    if (code === 11) props.x2     = parseFloat(value);
    if (code === 21) props.y2     = parseFloat(value);
    if (code === 31) props.z2     = parseFloat(value);
    if (code === 38) props.elev   = parseFloat(value); /* elevation */
    if (code === 40) props.r      = parseFloat(value);
    if (code === 50) props.startAngle = parseFloat(value);
    if (code === 51) props.endAngle   = parseFloat(value);
    if (code === 42) bulge            = parseFloat(value);
    if (code === 70) props.flags  = parseInt(value, 10);
    if (code === 1)  props.text   = value;
    if (code === 3)  props.text   = (props.text || '') + value;
    if (code === 41) props.scaleX = parseFloat(value);
    if (code === 42 && type === 'INSERT') props.scaleY = parseFloat(value);
    if (code === 50 && type === 'INSERT') props.rotation = parseFloat(value);
    if (code === 2 && (type === 'INSERT')) props.blockName = value;
    if (code === 40 && type === 'TEXT')  props.height = parseFloat(value);
    if (code === 40 && type === 'MTEXT') props.height = parseFloat(value);

    i++;
  }

  /* Asignar coordenadas base */
  if (px !== null && py !== null) {
    props.x1 = px; props.y1 = py;
  }

  /* Para POLYLINE/SPLINE: los VERTEX vienen después como entidades separadas */
  if (type === 'POLYLINE') {
    /* Leer VERTEX consecutivos */
    while (i < pairs.length && pairs[i][0] === 0 && pairs[i][1] === 'VERTEX') {
      i++;
      let vx = null, vy = null, vz = 0, vb = 0;
      while (i < pairs.length && pairs[i][0] !== 0) {
        if (pairs[i][0] === 10) vx = parseFloat(pairs[i][1]);
        if (pairs[i][0] === 20) { vy = parseFloat(pairs[i][1]); }
        if (pairs[i][0] === 30) vz = parseFloat(pairs[i][1]);
        if (pairs[i][0] === 42) vb = parseFloat(pairs[i][1]);
        i++;
      }
      if (vx !== null && vy !== null && isFinite(vx) && isFinite(vy)) {
        polyPoints.push({ x:vx, y:vy, z:vz, bulge:vb });
      }
    }
    /* Saltar SEQEND */
    if (i < pairs.length && pairs[i][0] === 0 && pairs[i][1] === 'SEQEND') {
      i++;
      while (i < pairs.length && pairs[i][0] !== 0) i++;
    }
  }

  props.polyPoints = polyPoints;
  return { entity: props, nextIndex: i };
}

/* ── Agregar entidad al resultado ─────────────────────────── */
function appendEntity(result, e) {
  const layer = e.layer || '0';

  if (e.type === 'LINE') {
    if (!isFinite(e.x1) || !isFinite(e.y1) || !isFinite(e.x2) || !isFinite(e.y2)) return;
    if (Math.abs(e.x1-e.x2) < 1e-10 && Math.abs(e.y1-e.y2) < 1e-10 && Math.abs((e.z1||0)-(e.z2||0)) < 1e-10) return;
    result.segments.push({ x1:e.x1, y1:e.y1, z1:e.z1||e.elev||0, x2:e.x2, y2:e.y2, z2:e.z2||e.elev||0, layer });
    return;
  }

  if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE' || e.type === 'SPLINE') {
    const pts = e.polyPoints;
    if (!pts || pts.length < 2) return;
    const closed = (e.flags & 1) === 1;
    if (closed) pts.push(pts[0]);
    const elev = e.elev || 0;
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j], b = pts[j+1];
      if (!isFinite(a.x)||!isFinite(a.y)||!isFinite(b.x)||!isFinite(b.y)) continue;
      if (Math.abs(a.bulge) > 1e-6) {
        const arcSegs = bulgeToSegments(a, b, a.bulge);
        arcSegs.forEach(s => result.segments.push({ ...s, z1:a.z||elev, z2:b.z||elev, layer }));
      } else {
        result.segments.push({ x1:a.x, y1:a.y, z1:a.z||elev, x2:b.x, y2:b.y, z2:b.z||elev, layer });
      }
    }
    return;
  }

  if (e.type === 'CIRCLE') {
    if (!isFinite(e.x1)||!isFinite(e.y1)||!e.r||e.r<=0) return;
    result.circles.push({ cx:e.x1, cy:e.y1, cz:e.z1||e.elev||0, r:e.r, layer });
    return;
  }

  if (e.type === 'ARC') {
    if (!isFinite(e.x1)||!isFinite(e.y1)||!e.r||e.r<=0) return;
    result.arcs.push({ cx:e.x1, cy:e.y1, cz:e.z1||e.elev||0, r:e.r,
      startAngle:e.startAngle||0, endAngle:e.endAngle||360, layer });
    return;
  }

  if (e.type === 'TEXT' || e.type === 'MTEXT') {
    if (!e.text || !isFinite(e.x1) || !isFinite(e.y1)) return;
    /* Limpiar códigos de formato MTEXT ({\\P}, {\\f...}) */
    const cleanText = e.text
      .replace(/\\P/g, ' ')
      .replace(/\{\\[^}]+\}/g, '')
      .replace(/\\/g, '')
      .trim();
    if (!cleanText) return;
    result.texts.push({ x:e.x1, y:e.y1, text:cleanText,
      height:e.height||2.5, layer });
    return;
  }

  if (e.type === 'POINT') {
    if (!isFinite(e.x1)||!isFinite(e.y1)) return;
    result.points.push({ x:e.x1, y:e.y1, layer });
    return;
  }
}

/* ── Expandir bloque INSERT ───────────────────────────────── */
function expandInsert(result, blocks, insert) {
  const block = blocks[insert.blockName];
  if (!block) return;

  const ox = insert.x1 || 0;
  const oy = insert.y1 || 0;
  const sx = insert.scaleX || 1;
  const sy = insert.scaleY || 1;
  const rot = ((insert.rotation || 0) * Math.PI) / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);

  function tx(x, y) {
    return ox + (x * sx * cosR - y * sy * sinR);
  }
  function ty(x, y) {
    return oy + (x * sx * sinR + y * sy * cosR);
  }

  block.segments.forEach(s => {
    result.segments.push({
      x1: tx(s.x1, s.y1), y1: ty(s.x1, s.y1),
      x2: tx(s.x2, s.y2), y2: ty(s.x2, s.y2),
      layer: s.layer
    });
  });
  block.circles.forEach(c => {
    result.circles.push({
      cx: tx(c.cx, c.cy), cy: ty(c.cx, c.cy),
      r: c.r * sx, layer: c.layer
    });
  });
  block.arcs.forEach(a => {
    result.arcs.push({
      cx: tx(a.cx, a.cy), cy: ty(a.cx, a.cy),
      r: a.r * sx,
      startAngle: a.startAngle + insert.rotation || 0,
      endAngle:   a.endAngle   + insert.rotation || 360,
      layer: a.layer
    });
  });
  block.texts.forEach(t => {
    result.texts.push({
      x: tx(t.x, t.y), y: ty(t.x, t.y),
      text: t.text, height: t.height * sx, layer: t.layer
    });
  });
}

/* ── Convertir bulge a segmentos de arco ──────────────────── */
function bulgeToSegments(p1, p2, bulge) {
  /* Fórmula estándar DXF bulge → arco */
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const d  = Math.sqrt(dx*dx + dy*dy);
  if (d < 1e-10) return [];

  const theta = 4 * Math.atan(Math.abs(bulge));
  const r = d / (2 * Math.sin(theta / 2));
  const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
  const dist  = Math.sqrt(r*r - (d/2)*(d/2));
  const sign  = bulge > 0 ? -1 : 1;
  const cx = midX + sign * dist * (-dy / d);
  const cy = midY + sign * dist * (dx  / d);

  const startA = Math.atan2(p1.y - cy, p1.x - cx);
  const endA   = Math.atan2(p2.y - cy, p2.x - cx);
  const N      = Math.max(8, Math.floor(theta / (Math.PI / 16)));
  const segs   = [];
  let prevX = p1.x, prevY = p1.y;

  for (let k = 1; k <= N; k++) {
    const t   = k / N;
    let   ang = startA + (bulge > 0 ? 1 : -1) * theta * t;
    const nx  = cx + r * Math.cos(ang);
    const ny  = cy + r * Math.sin(ang);
    segs.push({ x1:prevX, y1:prevY, x2:nx, y2:ny });
    prevX = nx; prevY = ny;
  }
  return segs;
}

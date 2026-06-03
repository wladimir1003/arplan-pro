# ARPlan Pro

Visor AR de planos arquitectónicos para obra, directamente en el navegador.
Sin instalación. Sin servidor. Funciona offline.

**URL pública:** `https://TU-USUARIO.github.io/arplan-pro`

---

## Funcionalidades

| Función | Android Chrome | iOS Safari | Desktop |
|---|---|---|---|
| Cargar GLB / GLTF | ✅ | ✅ | ✅ |
| Cargar DXF (AutoCAD) | ✅ | ✅ | ✅ |
| Visor 3D orbital | ✅ | ✅ | ✅ |
| Dibujo / lápiz / stylus | ✅ | ✅ (Apple Pencil) | ✅ |
| GPS + brújula | ✅ | ✅ | — |
| AR Superficie (WebXR) | ✅ Chrome 81+ | — | — |
| AR Quick Look (iOS) | — | ✅ Safari 12+ | — |
| Guardar offline (PWA) | ✅ | ✅ | ✅ |
| Exportar PNG / PDF / KML | ✅ | ✅ | ✅ |

---

## Publicar en GitHub Pages

### 1. Crear el repositorio

```bash
git clone https://github.com/TU-USUARIO/arplan-pro.git
cd arplan-pro
```

O crear nuevo:
```bash
mkdir arplan-pro && cd arplan-pro
git init
```

### 2. Copiar los archivos

```
arplan-pro/
├── index.html
├── manifest.json
├── sw.js
├── README.md
├── .gitattributes          ← para Git LFS
├── .github/
│   └── workflows/
│       └── deploy.yml
├── workers/
│   └── dxf-worker.js
└── icons/
    ├── icon.svg
    ├── icon-192.png
    ├── icon-512.png
    └── ...
```

### 3. Subir

```bash
git add .
git commit -m "ARPlan Pro v1.0"
git remote add origin https://github.com/TU-USUARIO/arplan-pro.git
git push -u origin main
```

### 4. Activar GitHub Pages

```
Repositorio → Settings → Pages
Source: GitHub Actions
```

La URL quedará disponible en ~30 segundos.

---

## Archivos GLB/DXF grandes (>100MB)

Opción A — Git LFS (gratis hasta 1GB/mes):
```bash
git lfs install
git lfs track "*.glb" "*.dxf" "*.gltf"
git add .gitattributes
git add models/mi-proyecto.glb
git push
```

Opción B — GitHub Releases (sin límite por archivo):
1. Ir a `Releases → New release`
2. Subir el archivo GLB como asset
3. Copiar la URL del asset y usarla directamente en la app

---

## Usar en obra sin internet

La app se instala como PWA:
- **Android:** Chrome → menú ⋮ → "Añadir a pantalla de inicio"
- **iOS:** Safari → compartir → "Añadir a pantalla de inicio"

Una vez instalada y con la caché descargada, funciona completamente offline.
El GPS y la brújula siguen funcionando sin internet.

---

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `P` | Lápiz |
| `H` | Resaltador |
| `L` | Línea |
| `R` | Rectángulo |
| `C` | Círculo |
| `T` | Texto |
| `M` | Medir distancia |
| `E` | Borrar trazos |
| `S` | Selección |
| `G` | Activar/desactivar grid |
| `F` | Zoom Extents |
| `+` / `-` | Zoom in/out |
| `Ctrl+Z` | Deshacer |
| `Ctrl+S` | Guardar |
| `Ctrl+O` | Abrir archivo |

---

## Requisitos técnicos

- HTTPS obligatorio en producción (GitHub Pages lo provee automáticamente)
- Android: Chrome 81+ con ARCore para AR Superficie
- iOS: Safari 12+ para AR Quick Look
- Brave: compatible con GPS, brújula y visor 3D (AR requiere Chrome Android)

---

## Licencia

MIT — libre para uso comercial y personal.

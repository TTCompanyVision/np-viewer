# Third-party components

NP Viewer bundles copies of the libraries below in `vendor/`. Each keeps its own license; the full texts are next to the files.
Changes are made by `scripts/prepare_vendor.py` at build time and are listed in the Notes column.

| Component | Version | License | Where | Notes |
|---|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | 0.187.0 | MIT | `vendor/three/` (`LICENSE`) | Imports rewritten to relative paths so they load in a Web Worker; `3DMLoader` has its EXR import stubbed; `ColladaParser` reads every `<p>` of `<polygons>`; `USDComposer` records whether `metersPerUnit` was set; `FBXLoader.mv.js` is a patched copy of `FBXLoader.js` (patch list in `index.html`, `#fbx-patch`) |
| [Draco decoder](https://github.com/google/draco) | from three 0.187.0 | Apache-2.0 | `vendor/three/examples/jsm/libs/draco/` (`LICENSE`) | Unmodified |
| [fflate](https://github.com/101arrowz/fflate) | from three 0.187.0 | MIT | `vendor/three/examples/jsm/libs/fflate.module.js` | Unmodified |
| [meshoptimizer decoder](https://github.com/zeux/meshoptimizer) | from three 0.187.0 | MIT | `vendor/three/examples/jsm/libs/meshopt_decoder.module.js` | Unmodified |
| [occt-import-js](https://github.com/kovacsv/occt-import-js) | 0.0.23 | LGPL-2.1 | `vendor/occt/` (`LICENSE.md`) | Unmodified; loaded as a separate file and can be replaced by any compatible build. Source: https://github.com/kovacsv/occt-import-js/tree/0.0.23 |
| [web-ifc](https://github.com/ThatOpen/engine_web-ifc) | 0.0.78 | MPL-2.0 | `vendor/web-ifc/` (`LICENSE.md`) | Unmodified; source: https://github.com/ThatOpen/engine_web-ifc |
| [rhino3dm](https://github.com/mcneel/rhino3dm) | 8.0.1 | MIT | `vendor/rhino3dm/` (`LICENSE`) | Unmodified |

occt-import-js is built on [Open CASCADE Technology](https://dev.opencascade.org/) (LGPL-2.1 with the OCCT exception).

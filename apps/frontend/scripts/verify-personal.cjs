// Comprobaciones sin navegador, cámara, base de datos ni envío de correos.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { createMemoryHistory, createRouter } = require("vue-router");
const jsQR = require("jsqr");
const backendRequire = require("node:module").createRequire(
  path.resolve(__dirname, "../../backend/package.json")
);
const QRCode = backendRequire("qrcode");
const pngRequire = require("node:module").createRequire(
  backendRequire.resolve("qrcode")
);
const { PNG } = pngRequire("pngjs");

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS
    }
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require, URL }, { filename: file });
  return exports;
}

async function main() {
  const { extraerTokenQr } = load("services/qrScan.ts");
  const token = "A".repeat(43);
  const url = `https://congreso.example/acceso/qr/${token}`;
  for (const value of [
    token,
    url,
    `/acceso/qr/${token}`,
    `https://congreso.example/#/acceso/qr/${token}`
  ])
    assert.equal(extraerTokenQr(value), token);
  for (const value of [
    "",
    "texto cualquiera",
    "A".repeat(42),
    `${url}/otro`,
    "https://ajeno.example/"
  ])
    assert.equal(extraerTokenQr(value), null);
  const png = PNG.sync.read(
    await QRCode.toBuffer(url, { width: 600, margin: 4 })
  );
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded?.data, url);
  assert.equal(extraerTokenQr(decoded.data), token);

  const routes = load("router/routes.ts").default;
  const router = createRouter({ history: createMemoryHistory(), routes });
  const admin = routes.find(route => route.path === "/admin");
  let protectedPaths = 0;
  for (const child of admin.children) {
    const paths = [
      `/admin/${child.path}`,
      ...(child.alias ? [child.alias].flat() : [])
    ];
    for (const routePath of paths) {
      const resolved = router.resolve(
        routePath.replace(/:\w+/g, "00000000-0000-4000-8000-000000000001")
      );
      assert.equal(resolved.meta.rolPersonal, "ADMINISTRADOR", routePath);
      protectedPaths++;
    }
  }
  for (const value of ["/validar", `/acceso/qr/${token}`])
    assert.equal(router.resolve(value).meta.rolPersonal, "VALIDADOR");
  for (const value of [
    "/",
    "/login",
    "/personal/acceso",
    "/personal/restablecer-contrasena",
    "/registro-externo",
    "/registro_nsu",
    "/agenda"
  ]) {
    const resolved = router.resolve(value);
    assert.ok(resolved.matched.length, value);
    assert.equal(resolved.meta.rolPersonal, undefined);
  }
  console.log(
    `Correcto: lectura de QR generado, extracción de tokens y ${protectedPaths} rutas/alias administrativos protegidos.`
  );
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

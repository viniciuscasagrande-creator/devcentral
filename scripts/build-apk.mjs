import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const ANDROID_MAIN = path.join(ROOT, "android", "app", "src", "main");
const RES_DIR = path.join(ANDROID_MAIN, "res");
const ASSETS_WWW_DIR = path.join(ANDROID_MAIN, "assets", "www");
const BUILD_DIR = path.join(ROOT, "android", "build-apk");

// Generate a crisp PNG icon from scratch using Node zlib (no external native deps needed)
function createPngIcon(size) {
  const width = size;
  const height = size;
  const rawData = Buffer.alloc(height * (1 + width * 4));

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawData[rowStart] = 0; // filter type 0
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const idx = rowStart + 1 + x * 4;

      // Dark neon background gradient (#19143d -> #0a1428)
      let r = Math.round(25 * (1 - ny) + 9 * ny);
      let g = Math.round(18 * (1 - nx) + 28 * nx);
      let b = Math.round(62 * (1 - ny) + 38 * ny);
      let a = 255;

      // Border glow
      const border = 0.045;
      if (
        nx < border ||
        nx > 1 - border ||
        ny < border ||
        ny > 1 - border
      ) {
        r = 110;
        g = 86;
        b = 207;
      }

      // Play triangle emblem in center
      // Outer triangle: x from 0.29 to 0.77, y centered at 0.5
      const dy = Math.abs(ny - 0.5);
      const maxDx = 0.77 - nx;
      if (nx >= 0.29 && nx <= 0.77 && dy <= maxDx * 0.62) {
        const edgeDist = Math.min(nx - 0.29, maxDx * 0.62 - dy);
        // Inner triangle fill
        const innerMaxDx = 0.61 - nx;
        const isInner =
          nx >= 0.41 && nx <= 0.61 && dy <= innerMaxDx * 0.58;
        if (edgeDist <= 0.065 || isInner) {
          // Cyan to Violet gradient (#38bdf8 -> #c084fc)
          const t = (nx + ny) * 0.5;
          r = Math.round(56 * (1 - t) + 192 * t);
          g = Math.round(189 * (1 - t) + 132 * t);
          b = Math.round(248 * (1 - t) + 252 * t);
        }
      }

      rawData[idx] = r;
      rawData[idx + 1] = g;
      rawData[idx + 2] = b;
      rawData[idx + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.endsWith(".apk") || entry.name.endsWith(".idsig")) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function addAssetFilesToZip(zipPath, assetsRoot, javaBinDir) {
  // Using jar uM to add assets/www/* without re-compressing resources.arsc
  const jarExe = path.join(javaBinDir, "jar.exe");
  execFileSync(jarExe, ["uf", zipPath, "-C", path.dirname(assetsRoot), "assets"], {
    stdio: "inherit",
  });
}

console.log("=== [DevCentral 3.0 Mobile] Preparando Ícones PWA & Android ===");
const icon192 = createPngIcon(192);
const icon512 = createPngIcon(512);
fs.mkdirSync(path.join(ROOT, "public"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "public", "icon-192.png"), icon192);
fs.writeFileSync(path.join(ROOT, "public", "icon-512.png"), icon512);

if (fs.existsSync(path.join(ROOT, "firebase-dist"))) {
  fs.writeFileSync(path.join(ROOT, "firebase-dist", "icon-192.png"), icon192);
  fs.writeFileSync(path.join(ROOT, "firebase-dist", "icon-512.png"), icon512);
  fs.copyFileSync(
    path.join(ROOT, "public", "manifest.json"),
    path.join(ROOT, "firebase-dist", "manifest.json")
  );
  fs.copyFileSync(
    path.join(ROOT, "public", "sw.js"),
    path.join(ROOT, "firebase-dist", "sw.js")
  );
}

const mipmaps = [
  { folder: "mipmap-mdpi", size: 48 },
  { folder: "mipmap-hdpi", size: 72 },
  { folder: "mipmap-xhdpi", size: 96 },
  { folder: "mipmap-xxhdpi", size: 144 },
  { folder: "mipmap-xxxhdpi", size: 192 },
];
for (const m of mipmaps) {
  const dir = path.join(RES_DIR, m.folder);
  fs.mkdirSync(dir, { recursive: true });
  const png = createPngIcon(m.size);
  fs.writeFileSync(path.join(dir, "ic_launcher.png"), png);
  fs.writeFileSync(path.join(dir, "ic_launcher_round.png"), png);
}

console.log("=== [DevCentral 3.0 Mobile] Sincronizando Bundle Offline Mobile ===");
if (fs.existsSync(ASSETS_WWW_DIR)) {
  fs.rmSync(ASSETS_WWW_DIR, { recursive: true, force: true });
}
copyDirRecursive(path.join(ROOT, "firebase-dist"), ASSETS_WWW_DIR);

// Locate Android SDK & Java Toolchain
const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\vinad\\AppData\\Local";
const sdkRoot = process.env.ANDROID_HOME || path.join(localAppData, "Android", "Sdk");
const buildToolsRoot = path.join(sdkRoot, "build-tools");
const platformsRoot = path.join(sdkRoot, "platforms");

const buildToolsVersion = fs.readdirSync(buildToolsRoot).sort().reverse()[0];
const platformVersion = fs.readdirSync(platformsRoot).sort().reverse()[0];

const buildToolsDir = path.join(buildToolsRoot, buildToolsVersion);
const androidJar = path.join(platformsRoot, platformVersion, "android.jar");

const jbrBin = "C:\\Program Files\\Android\\Android Studio\\jbr\\bin";
const javaBinDir = fs.existsSync(jbrBin) ? jbrBin : "";
const javacExe = javaBinDir ? path.join(javaBinDir, "javac.exe") : "javac";
const keytoolExe = javaBinDir ? path.join(javaBinDir, "keytool.exe") : "keytool";

const aapt2Exe = path.join(buildToolsDir, "aapt2.exe");
const d8Bat = path.join(buildToolsDir, "d8.bat");
const zipalignExe = path.join(buildToolsDir, "zipalign.exe");
const apksignerBat = path.join(buildToolsDir, "apksigner.bat");

console.log(`Toolchain detectada: SDK=${platformVersion}, BuildTools=${buildToolsVersion}`);

if (fs.existsSync(BUILD_DIR)) {
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
}
const compiledResZip = path.join(BUILD_DIR, "compiled_res.zip");
const unalignedApk = path.join(BUILD_DIR, "unaligned.apk");
const alignedApk = path.join(BUILD_DIR, "aligned.apk");
const genJavaDir = path.join(BUILD_DIR, "gen");
const objDir = path.join(BUILD_DIR, "obj");
const dexDir = path.join(BUILD_DIR, "dex");

fs.mkdirSync(genJavaDir, { recursive: true });
fs.mkdirSync(objDir, { recursive: true });
fs.mkdirSync(dexDir, { recursive: true });

console.log("1/6 Compilando recursos Android com AAPT2...");
execFileSync(
  aapt2Exe,
  ["compile", "--dir", RES_DIR, "-o", compiledResZip],
  { stdio: "inherit" }
);

console.log("2/6 Linkando recursos e Manifesto Android...");
execFileSync(
  aapt2Exe,
  [
    "link",
    "-I",
    androidJar,
    "--manifest",
    path.join(ANDROID_MAIN, "AndroidManifest.xml"),
    "--java",
    genJavaDir,
    "-o",
    unalignedApk,
    compiledResZip,
    "--auto-add-overlay",
  ],
  { stdio: "inherit" }
);

console.log("3/6 Compilando código Java (MainActivity + R.java)...");
const mainActivityJava = path.join(
  ANDROID_MAIN,
  "java",
  "com",
  "devcentral",
  "mobile",
  "MainActivity.java"
);
const rJava = path.join(genJavaDir, "com", "devcentral", "mobile", "R.java");

execFileSync(
  javacExe,
  [
    "--release",
    "11",
    "-encoding",
    "UTF-8",
    "-cp",
    androidJar,
    "-d",
    objDir,
    mainActivityJava,
    rJava,
  ],
  { stdio: "inherit" }
);

console.log("4/6 Convertendo bytecode Java para Dalvik DEX (D8)...");
const classFiles = [];
function collectClassFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectClassFiles(p);
    else if (p.endsWith(".class")) classFiles.push(p);
  }
}
collectClassFiles(objDir);

const envWithJava = {
  ...process.env,
  JAVA_HOME: javaBinDir ? path.dirname(javaBinDir) : process.env.JAVA_HOME,
  PATH: `${javaBinDir};${process.env.PATH || ""}`,
};

execFileSync(
  "cmd.exe",
  ["/c", d8Bat, "--lib", androidJar, "--min-api", "24", "--output", dexDir, ...classFiles],
  { stdio: "inherit", env: envWithJava }
);

// Add classes.dex UNCOMPRESSED (-0) so Android 11+ / 15 / 16 ART can mmap it directly, and add assets/www/*
const jarExe = javaBinDir ? path.join(javaBinDir, "jar.exe") : "jar";
execFileSync(jarExe, ["uf0", unalignedApk, "-C", dexDir, "classes.dex"], {
  stdio: "inherit",
});
addAssetFilesToZip(unalignedApk, path.join(ANDROID_MAIN, "assets"), javaBinDir);

console.log("5/6 Alinhando pacote APK com Zipalign...");
execFileSync(
  zipalignExe,
  ["-f", "-p", "4", unalignedApk, alignedApk],
  { stdio: "inherit" }
);

console.log("6/6 Assinando APK (V1 + V2 + V3) com Apksigner...");
const keystorePath = path.join(ROOT, "android", "devcentral-release.keystore");
if (!fs.existsSync(keystorePath)) {
  execFileSync(
    keytoolExe,
    [
      "-genkeypair",
      "-v",
      "-keystore",
      keystorePath,
      "-alias",
      "devcentral",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "10000",
      "-storepass",
      "devcentral123",
      "-keypass",
      "devcentral123",
      "-dname",
      "CN=DevCentral 3.0, OU=Engineering, O=DevCentral, L=Curitiba, ST=PR, C=BR",
    ],
    { stdio: "inherit" }
  );
}

const finalApkRoot = path.join(ROOT, "DevCentral-3.0-mobile.apk");
const finalApkPublic = path.join(ROOT, "public", "DevCentral-3.0-mobile.apk");
const finalApkFirebase = path.join(ROOT, "firebase-dist", "DevCentral-3.0-mobile.apk");

execFileSync(
  "cmd.exe",
  [
    "/c",
    apksignerBat,
    "sign",
    "--v1-signing-enabled",
    "true",
    "--v2-signing-enabled",
    "true",
    "--v3-signing-enabled",
    "true",
    "--ks",
    keystorePath,
    "--ks-key-alias",
    "devcentral",
    "--ks-pass",
    "pass:devcentral123",
    "--key-pass",
    "pass:devcentral123",
    "--out",
    finalApkRoot,
    alignedApk,
  ],
  { stdio: "inherit", env: envWithJava }
);

fs.copyFileSync(finalApkRoot, finalApkPublic);
if (fs.existsSync(path.join(ROOT, "firebase-dist"))) {
  fs.copyFileSync(finalApkRoot, finalApkFirebase);
}

const stats = fs.statSync(finalApkRoot);
const sizeKb = (stats.size / 1024).toFixed(1);
console.log(`\n✅ APK GERADO E ASSINADO COM SUCESSO!`);
console.log(`📱 Arquivo principal: ${finalApkRoot} (${sizeKb} KB)`);
console.log(`🌐 Cópia para download web: ${finalApkPublic}`);

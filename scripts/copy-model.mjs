import { cp, mkdir, copyFile } from "node:fs/promises";
await mkdir("public", { recursive: true });
for (const file of ["LICENSE", "NOTICE"]) {
  await copyFile(file, `public/${file}`);
}
await mkdir("public/model", { recursive: true });
await cp("node_modules/@spotify/basic-pitch/model", "public/model", {
  recursive: true,
});
await copyFile(
  "node_modules/@spotify/basic-pitch/LICENSE",
  "public/model/LICENSE",
);
await mkdir("public/wasm", { recursive: true });
await copyFile("LICENSE", "public/wasm/LICENSE");
await copyFile("public/THIRD_PARTY_NOTICES.txt", "public/wasm/NOTICE");
for (const file of [
  "tfjs-backend-wasm.wasm",
  "tfjs-backend-wasm-simd.wasm",
  "tfjs-backend-wasm-threaded-simd.wasm",
]) {
  await copyFile(
    `node_modules/@tensorflow/tfjs-backend-wasm/dist/${file}`,
    `public/wasm/${file}`,
  );
}
console.log("Copied model, WASM, and license notices locally.");

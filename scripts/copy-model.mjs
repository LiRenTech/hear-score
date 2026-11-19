import { cp, mkdir, copyFile } from "node:fs/promises";
await mkdir("public/model", { recursive: true });
await cp("node_modules/@spotify/basic-pitch/model", "public/model", {
  recursive: true,
});
await copyFile(
  "node_modules/@spotify/basic-pitch/LICENSE",
  "public/model/LICENSE",
);
await mkdir("public/wasm", { recursive: true });
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
console.log("Copied Basic Pitch model and TensorFlow WASM locally.");

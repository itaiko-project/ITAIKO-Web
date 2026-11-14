// Makes the phone variant of the drum model: same geometry, embedded textures capped at 1024 px.
// Usage: node scripts/glb-mobile.cjs public/iTaiko.webp.glb public/iTaiko.mobile.glb
// (sharp is a devDependency of the PWA asset generator; run through pnpm if it does not resolve.)
const fs = require("fs");
const sharp = require("sharp");
const [, , src, out, MAX = "1024"] = process.argv;

(async () => {
  const b = fs.readFileSync(src);
  const jsonLength = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLength));
  const bin = 20 + jsonLength + 8;
  const imageViews = new Set(json.images.map((im) => im.bufferView));
  const parts = [];
  let offset = 0;
  for (const [i, view] of json.bufferViews.entries()) {
    let data = b.slice(bin + (view.byteOffset || 0), bin + (view.byteOffset || 0) + view.byteLength);
    if (imageViews.has(i)) {
      const meta = await sharp(data).metadata();
      if (Math.max(meta.width, meta.height) > +MAX) data = await sharp(data).resize(+MAX, +MAX, { fit: "inside" }).webp({ quality: 82 }).toBuffer();
    }
    const pad = (4 - (data.length % 4)) % 4;
    view.byteOffset = offset;
    view.byteLength = data.length;
    parts.push(data, Buffer.alloc(pad));
    offset += data.length + pad;
  }
  json.buffers[0].byteLength = offset;
  let js = Buffer.from(JSON.stringify(json));
  if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + js.length + 8 + offset, 8);
  const chunk = (length, type) => { const c = Buffer.alloc(8); c.writeUInt32LE(length, 0); c.write(type, 4); return c; };
  fs.writeFileSync(out, Buffer.concat([header, chunk(js.length, "JSON"), js, chunk(offset, "BIN\0"), ...parts]));
  console.log(`${src} ${b.length} B → ${out} ${fs.statSync(out).size} B`);
})();

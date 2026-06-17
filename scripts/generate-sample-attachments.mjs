import { mkdirSync, writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { deflateSync, gzipSync } from "zlib";
import { execSync } from "child_process";
import { tmpdir } from "os";

const OUT = join(process.cwd(), "sample-attachments");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function createZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const compressed = deflateSync(data);
    const local = Buffer.alloc(30 + nameBuf.length + compressed.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    compressed.copy(local, 30 + nameBuf.length);
    locals.push(local);

    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc32(data), 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    nameBuf.copy(cd, 46);
    central.push(cd);
    offset += local.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuf, end]);
}

function createPng(width, height, fill) {
  const row = Buffer.alloc(1 + width * 3);
  const raw = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (1 + width * 3);
    raw[start] = 0;
    for (let x = 0; x < width; x++) {
      const i = start + 1 + x * 3;
      const t = (x + y) % 3;
      raw[i] = t === 0 ? fill[0] : fill[1];
      raw[i + 1] = t === 1 ? fill[1] : fill[2];
      raw[i + 2] = t === 2 ? fill[2] : fill[0];
    }
  }
  const compressed = deflateSync(raw);
  const makeChunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createJpeg(width, height) {
  const parts = [];
  const push = (b) => parts.push(b);
  push(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]));
  const sos = Buffer.alloc(8 + width * height * 3);
  sos[0] = 0xff;
  sos[1] = 0xda;
  sos.writeUInt16BE(8, 2);
  sos[4] = 3;
  sos[5] = 1;
  sos[6] = 0x22;
  sos[7] = 0x00;
  let p = 8;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      sos[p++] = (x * 7 + 40) & 255;
      sos[p++] = (y * 5 + 80) & 255;
      sos[p++] = (x + y) & 255;
    }
  }
  push(sos);
  push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

function createGif() {
  const w = 48;
  const h = 32;
  const pixels = Buffer.alloc(w * h);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 3) % 8;
  const img = deflateSync(Buffer.concat([Buffer.from([0]), pixels]));
  const out = [];
  const u16 = (n) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n, 0);
    return b;
  };
  out.push(Buffer.from("GIF89a"));
  out.push(u16(w));
  out.push(u16(h));
  out.push(Buffer.from([0xf0, 0, 0]));
  for (let i = 0; i < 8; i++) out.push(Buffer.from([i * 30, i * 20, 200 - i * 20]));
  out.push(Buffer.from([0x2c, 0, 0, 0, 0]));
  out.push(u16(w));
  out.push(u16(h));
  out.push(Buffer.from([0x00]));
  out.push(Buffer.from([img.length & 255]));
  let rem = img.length;
  let off = 0;
  while (rem > 0) {
    const n = Math.min(255, rem);
    out.push(Buffer.from([n]));
    out.push(img.subarray(off, off + n));
    off += n;
    rem -= n;
  }
  out.push(Buffer.from([0x00, 0x3b]));
  return Buffer.concat(out);
}

function createWav(seconds = 1, hz = 440) {
  const rate = 22050;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const v = Math.sin((2 * Math.PI * hz * i) / rate) * 0.35;
    data.writeInt16LE(Math.floor(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function createPdf(text) {
  const header = "%PDF-1.4\n";
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  const objs = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n",
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  const body = objs.join("");
  const start = Buffer.byteLength(header);
  let pos = start;
  const offsets = [];
  for (const o of objs) {
    offsets.push(pos);
    pos += Buffer.byteLength(o);
  }
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  const trailer = `trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF`;
  return Buffer.from(header + body + xref + trailer);
}

function createTarGz(entries) {
  const blocks = [];
  for (const { name, data } of entries) {
    const header = Buffer.alloc(512, 0);
    header.write(name, 0, Math.min(name.length, 100));
    header.write("0000644\0", 100, 8);
    header.write("0000000\0", 108, 8);
    header.write("0000000\0", 116, 8);
    const sizeOct = data.length.toString(8).padStart(11, "0");
    header.write(sizeOct + "\0", 124, 12);
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, "0");
    header.write(mtime + "\0", 136, 12);
    header.write("        ", 148, 8);
    header[156] = "0".charCodeAt(0);
    header.write("ustar\0", 257, 6);
    header.write("00", 263, 2);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
    blocks.push(header);
    blocks.push(data);
    const pad = 512 - (data.length % 512);
    if (pad < 512) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

function create7z(entries) {
  const sevenZip = [
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe",
  ].find(existsSync);
  if (!sevenZip) {
    return createZip(entries);
  }
  const tmp = mkdtempSync(join(tmpdir(), "tf-7z-"));
  const archive = join(tmpdir(), `tf-sample-${Date.now()}.7z`);
  try {
    for (const { name, data } of entries) {
      writeFileSync(join(tmp, name), data);
    }
    execSync(`"${sevenZip}" a -y "${archive}" "${join(tmp, "*")}"`, { stdio: "pipe" });
    return readFileSync(archive);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    try {
      rmSync(archive, { force: true });
    } catch {
      /* ignore */
    }
  }
}

function ooxmlDocx(text) {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  return createZip([
    { name: "[Content_Types].xml", data: Buffer.from(types) },
    { name: "_rels/.rels", data: Buffer.from(rels) },
    { name: "word/document.xml", data: Buffer.from(document) },
  ]);
}

function ooxmlXlsx() {
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Product</t></is></c><c r="B1" t="inlineStr"><is><t>Qty</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Widget</t></is></c><c r="B2"><v>12</v></c></row>
    <row r="3"><c r="A2" t="inlineStr"><is><t>Gadget</t></is></c><c r="B3"><v>7</v></c></row>
  </sheetData>
</worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sample" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  return createZip([
    { name: "[Content_Types].xml", data: Buffer.from(types) },
    { name: "_rels/.rels", data: Buffer.from(rootRels) },
    { name: "xl/workbook.xml", data: Buffer.from(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(wbRels) },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet) },
  ]);
}

function ooxmlPptx(title, body) {
  const slide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
  const pres = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
</p:presentation>`;
  const presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;
  return createZip([
    { name: "[Content_Types].xml", data: Buffer.from(types) },
    { name: "_rels/.rels", data: Buffer.from(rootRels) },
    { name: "ppt/presentation.xml", data: Buffer.from(pres) },
    { name: "ppt/_rels/presentation.xml.rels", data: Buffer.from(presRels) },
    { name: "ppt/slides/slide1.xml", data: Buffer.from(slide) },
  ]);
}

function wordHtmlDoc(title, body) {
  return Buffer.from(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`, "utf8");
}

function spreadsheetXml() {
  return Buffer.from(`<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Sample" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Table>
      <Row><Cell><Data ss:Type="String">Item</Data></Cell><Cell><Data ss:Type="String">Count</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Alpha</Data></Cell><Cell><Data ss:Type="Number">3</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Beta</Data></Cell><Cell><Data ss:Type="Number">9</Data></Cell></Row>
    </Table>
  </Worksheet>
</Workbook>`, "utf8");
}

// Valid small JPEG (visible in browsers) and 7z archive with readme.txt inside
const SAMPLE_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAoADgDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAUGBAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64"
);
const MINI_MP3 = Buffer.from(
  "/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
  "base64"
);
const MINI_MP4 = Buffer.from(
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAG1tZGF0AAACrgYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE1NSByMjkxNyAwMDAwMDAwIGQgbGF2YzAgMjEuNy4xMDAgbGliYXZjYXZjMS4yLjAgMjAxODA4MTIAAAADbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAABdwAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAACB0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAoAAAAFoAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAEAAABAAAAAAKobWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAARAAAVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAWVtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAEcc3RibAAAALhzdHNkAAAAAAAAAAEAAACobXA0YQAAAAAAAAABAAAAAAAAAAAAAQAQAAAAAFXEAAAAAAACZXNkcwAAAAADgICAIgABAASAgIAUQBUAAAAAA92/AAPd+wWAgIACEZAGgICAAQIAAAAgc3R0cwAAAAAAAAACAAAAAQAABAAAAAABAAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAAAXAAAAAQAAABRzdGNvAAAAAAAAAAEAAAAwAAAAYHVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY1OC4yMC4xMDA=",
  "base64"
);
const MINI_WEBM = Buffer.from(
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWVKpbGs7h++j0RKCFLGa3OV1rnoq1oWFNqUoWDkFJS4tLQAFZpWqnaauOsdq2GmfXuTo3OjvQv3qCGh01Z1vVUkOjsCADtO5pwL+d9QFhWElxUHBPhNI1iZKiaGKm5P1JfpsyiK0Pe5UI5t7P1P5KUZaDYpMl+Q41aL1lXfgNcREW7ZMPF22UJ/HrUEH7DkQkE1GV9TpOSyifSHMs6MS7S90c6ui/sevrp2PMfd8PmtBpOKp/fFAe+TL0c+NE1M/xQmyvL/Mv8E8fOew3VJ+Gjd3ZtaQn0twwM+I0kP4HjkHGrZbR4nycLhINR2k9efzzNWR2oo6O6rLjV4+Wg+KsI+ZXqL2BGKgxUM2pXZqTl1O8Z3oOEHJSMXYFdXzkC0kaXbZ8dFsCd7M8ARlWGqH2KusZKY8QjorWvjqFdWplJOVfEpPHxxe5Hx4BivlCNt2cryGsRFXRokRAvQE5OuxgJ1+Qehi1ciMs/sc//GEpmNWT9EsK/whMd/LvK//Hn5ZErUB95fZ4a+c7kjnPpzifq7vS0fKdjJS3N5uHDmxi2V+BKo4e69fdwH/9rmNIFi3m0yp9F7wAWTnPvdCPMsx7No7nLsKnTd44V7/76uXKnnzWFvt1bLU9n82TPKfZq12fJ6uQ3ze5Y6w2HWR8KHR0cBExhdWFYV0NBUwEAAAAU72uHx1VvbWV0YQBAAAAA",
  "base64"
);

mkdirSync(OUT, { recursive: true });

const files = {
  "01-image.png": createPng(64, 48, [99, 102, 241]),
  "01-image.jpg": SAMPLE_JPEG,
  "01-image.gif": createGif(),
  "01-image.webp": Buffer.from(
    "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=",
    "base64"
  ),
  "02-document.pdf": createPdf("TaskFlow sample PDF — attachment preview test."),
  "03-video.mp4": MINI_MP4,
  "03-video.webm": MINI_WEBM,
  "03-video.mov": MINI_MP4,
  "04-audio.wav": createWav(2, 440),
  "04-audio.mp3": MINI_MP3,
  "05-word.docx": ooxmlDocx("TaskFlow sample Word document for attachment testing."),
  "05-word.doc": wordHtmlDoc("Sample Word (.doc)", "Legacy Word-compatible HTML document for UI testing."),
  "06-spreadsheet.csv": Buffer.from("name,role,tasks\nAlice,Engineer,12\nBob,Designer,8\nCarol,PM,15\n", "utf8"),
  "06-spreadsheet.xlsx": ooxmlXlsx(),
  "06-spreadsheet.xls": spreadsheetXml(),
  "07-presentation.pptx": ooxmlPptx("TaskFlow Demo", "Sample slide for attachment preview testing."),
  "07-presentation.ppt": wordHtmlDoc("Sample Presentation", "Legacy presentation placeholder opened as HTML."),
  "08-archive.zip": createZip([
    { name: "readme.txt", data: Buffer.from("Files inside TaskFlow sample zip archive.\nLine 2: attachment test.\n", "utf8") },
    { name: "data.json", data: Buffer.from('{"app":"TaskFlow","version":1}\n', "utf8") },
  ]),
  "08-archive.tar.gz": createTarGz([
    {
      name: "readme.txt",
      data: Buffer.from(
        "TaskFlow sample tar.gz archive.\nThis file is inside the archive for attachment testing.\n",
        "utf8"
      ),
    },
    { name: "data.json", data: Buffer.from('{"app":"TaskFlow","inArchive":true}\n', "utf8") },
  ]),
  "08-archive.7z": create7z([
    { name: "readme.txt", data: Buffer.from("TaskFlow sample 7z archive.\n", "utf8") },
    { name: "notes.txt", data: Buffer.from("Second file inside 7z archive.\n", "utf8") },
  ]),
  "09-text.txt": Buffer.from("TaskFlow sample text attachment.\nUse this file to test plain-text uploads.\n", "utf8"),
  "09-text.md": Buffer.from("# Sample Markdown\n\n- Item one\n- Item two\n\n**Bold** preview text.\n", "utf8"),
  "09-text.json": Buffer.from(JSON.stringify({ app: "TaskFlow", sample: true, items: [1, 2, 3] }, null, 2), "utf8"),
  "09-text.xml": Buffer.from('<?xml version="1.0"?><note><to>Team</to><body>Sample XML attachment</body></note>\n', "utf8"),
  "09-text.yaml": Buffer.from("app: TaskFlow\nsample: true\ncount: 3\n", "utf8"),
  "09-text.yml": Buffer.from("app: TaskFlow\nenabled: true\n", "utf8"),
  "10-code.js": Buffer.from("export function greet(name) {\n  return `Hello, ${name}!`;\n}\n", "utf8"),
  "10-code.ts": Buffer.from("export type User = { id: string; name: string };\nexport const VERSION = 1;\n", "utf8"),
  "10-code.jsx": Buffer.from("export function Badge({ label }) {\n  return <span className=\"badge\">{label}</span>;\n}\n", "utf8"),
  "10-code.tsx": Buffer.from("export function Badge({ label }: { label: string }) {\n  return <span>{label}</span>;\n}\n", "utf8"),
  "10-code.py": Buffer.from("def total(items):\n    return sum(items)\n\nif __name__ == '__main__':\n    print(total([1, 2, 3]))\n", "utf8"),
  "10-code.java": Buffer.from("public class Sample {\n  public static void main(String[] args) {\n    System.out.println(\"TaskFlow sample\");\n  }\n}\n", "utf8"),
  "10-code.go": Buffer.from("package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"TaskFlow sample\")\n}\n", "utf8"),
  "10-code.rs": Buffer.from("fn main() {\n    println!(\"TaskFlow sample\");\n}\n", "utf8"),
  "10-code.css": Buffer.from(".sample { color: var(--accent); font-weight: 600; }\n", "utf8"),
  "10-code.html": Buffer.from("<!doctype html><html><body><h1>TaskFlow</h1><p>HTML sample attachment</p></body></html>\n", "utf8"),
  "10-code.sql": Buffer.from("SELECT id, name FROM users WHERE active = true ORDER BY name;\n", "utf8"),
  "11-other.xyz": Buffer.from("custom extension sample for unknown file type cards\n", "utf8"),
  "11-other.bin": Buffer.from([0, 1, 2, 3, 255, 254, 0, 16, 32, 64, 128]),
};

for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT, name), data);
  console.log(`${name}: ${data.length} bytes`);
}

console.log(`\nWrote ${Object.keys(files).length} files to ${OUT}`);

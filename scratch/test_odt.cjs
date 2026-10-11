const fs = require('fs');

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (~crc) >>> 0;
}

function buildZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const dataBuf = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    // Local Header
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4);         // version needed
    lh.writeUInt16LE(0, 6);          // flags
    lh.writeUInt16LE(0, 8);          // compression method (0 = store)
    lh.writeUInt16LE(0, 10);         // time
    lh.writeUInt16LE(0, 12);         // date
    lh.writeUInt32LE(crc, 14);       // crc32
    lh.writeUInt32LE(size, 18);      // compressed size
    lh.writeUInt32LE(size, 22);      // uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26); // name length
    lh.writeUInt16LE(0, 28);         // extra len
    nameBuf.copy(lh, 30);

    localHeaders.push(lh);
    localHeaders.push(dataBuf);

    // Central Header
    const ch = Buffer.alloc(46 + nameBuf.length);
    ch.writeUInt32LE(0x02014b50, 0); // signature
    ch.writeUInt16LE(20, 4);         // version made by
    ch.writeUInt16LE(20, 6);         // version needed
    ch.writeUInt16LE(0, 8);          // flags
    ch.writeUInt16LE(0, 10);         // compression method (0)
    ch.writeUInt16LE(0, 12);         // time
    ch.writeUInt16LE(0, 14);         // date
    ch.writeUInt32LE(crc, 16);       // crc32
    ch.writeUInt32LE(size, 20);      // compressed size
    ch.writeUInt32LE(size, 24);      // uncompressed size
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);         // extra len
    ch.writeUInt16LE(0, 32);         // comment len
    ch.writeUInt16LE(0, 34);         // disk start
    ch.writeUInt16LE(0, 36);         // internal attr
    ch.writeUInt32LE(0, 38);         // external attr
    ch.writeUInt32LE(offset, 42);    // relative offset of local header
    nameBuf.copy(ch, 46);

    centralHeaders.push(ch);
    offset += lh.length + dataBuf.length;
  }

  const centralOffset = offset;
  const centralBuf = Buffer.concat(centralHeaders);
  const centralSize = centralBuf.length;

  // End of Central Directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk num
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(files.length, 8); // total records on disk
  eocd.writeUInt16LE(files.length, 10); // total records
  eocd.writeUInt32LE(centralSize, 12); // size of central directory
  eocd.writeUInt32LE(centralOffset, 16); // offset of central directory
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...localHeaders, centralBuf, eocd]);
}

const testOdt = buildZip([
  { name: 'mimetype', data: 'application/vnd.oasis.opendocument.text' },
  { name: 'META-INF/manifest.xml', data: `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>` },
  { name: 'content.xml', data: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  office:version="1.2">
  <office:body>
    <office:text>
      <text:h text:outline-level="1">BIM BAM 4D Schedule</text:h>
      <text:p>Test export</text:p>
    </office:text>
  </office:body>
</office:document-content>` }
]);

fs.writeFileSync('C:/temp/test.odt', testOdt);
console.log('Successfully wrote C:/temp/test.odt, size:', testOdt.length);

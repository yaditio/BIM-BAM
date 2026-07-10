const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
let uploadDir = path.join(__dirname, 'uploads');
if (uploadDir.includes('app.asar') && !uploadDir.includes('app.asar.unpacked')) {
  uploadDir = uploadDir.replace('app.asar', 'app.asar.unpacked');
}
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Endpoint for IFC to XKT conversion
app.post('/api/convert', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const inputFilePath = req.file.path;
  const uniqueName = path.parse(req.file.filename).name;
  const outputFilePath = path.join(uploadDir, `${uniqueName}.xkt`);

  // Path to convert2xkt.js script
  let converterScript = path.join(__dirname, 'node_modules', '@xeokit', 'xeokit-convert', 'convert2xkt.js');
  // Support running inside Electron packaged ASAR archive by pointing to the unpacked location
  if (converterScript.includes('app.asar') && !converterScript.includes('app.asar.unpacked')) {
    converterScript = converterScript.replace('app.asar', 'app.asar.unpacked');
  }

  const command = `node "${converterScript}" -s "${inputFilePath}" -f ifc -o "${outputFilePath}" -l`;

  console.log(`[Server] Running command: ${command}`);

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    console.log('[Converter stdout]:', stdout);
    if (stderr) console.error('[Converter stderr]:', stderr);

    // Clean up input file immediately
    try {
      fs.unlinkSync(inputFilePath);
    } catch (e) {
      console.error('Error cleaning up input file:', e);
    }

    if (error) {
      console.error('Conversion failed:', error);
      return res.status(500).json({
        error: 'Conversion failed',
        details: error.message,
        stdout,
        stderr
      });
    }

    // Check if output file exists
    if (!fs.existsSync(outputFilePath)) {
      return res.status(500).json({ error: 'Conversion succeeded but output file was not found' });
    }

    // Set headers and send file
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(req.file.originalname)}.xkt"`);

    const fileStream = fs.createReadStream(outputFilePath);
    fileStream.pipe(res);

    fileStream.on('close', () => {
      // Clean up output file after streaming is finished
      try {
        fs.unlinkSync(outputFilePath);
        console.log('[Server] Cleaned up temporary files.');
      } catch (e) {
        console.error('Error cleaning up output file:', e);
      }
    });

    fileStream.on('error', (streamErr) => {
      console.error('Stream error:', streamErr);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Streaming failed' });
      }
    });
  });
});

// Ensure bcf_snapshots directory exists
const bcfSnapshotsDir = path.join(uploadDir, 'bcf_snapshots');
if (!fs.existsSync(bcfSnapshotsDir)) {
  fs.mkdirSync(bcfSnapshotsDir, { recursive: true });
}
app.use('/uploads/bcf_snapshots', express.static(bcfSnapshotsDir));

// Multer upload fields helper
const cpUpload = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'oldFile', maxCount: 1 },
  { name: 'newFile', maxCount: 1 },
  { name: 'fileA', maxCount: 1 },
  { name: 'fileB', maxCount: 1 }
]);

// Python command configuration
const pythonExec = `"C:\\Users\\tio\\.conda\\envs\\python310\\python.exe"`;
const toolsScript = path.join(__dirname, 'ifc_tools.py');

// 1. IFC Diff
app.post('/api/python/ifcdiff', cpUpload, (req, res) => {
  const files = req.files;
  if (!files || !files.oldFile || !files.newFile) {
    return res.status(400).json({ error: 'Both oldFile and newFile are required' });
  }

  const oldPath = files.oldFile[0].path;
  const newPath = files.newFile[0].path;

  const command = `${pythonExec} "${toolsScript}" diff "${oldPath}" "${newPath}"`;
  console.log(`[Server] Running: ${command}`);

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    // clean up files
    try { fs.unlinkSync(oldPath); } catch (e) { }
    try { fs.unlinkSync(newPath); } catch (e) { }

    if (error) {
      console.error('[Server] Diff failed:', error, stderr);
      return res.status(500).json({ error: 'IFC Diff failed', details: error.message, stderr });
    }

    try {
      const result = JSON.parse(stdout.trim());
      res.json(result);
    } catch (e) {
      console.error('[Server] Failed to parse diff stdout:', stdout);
      res.status(500).json({ error: 'Failed to parse diff output', stdout });
    }
  });
});

// 2. BCF Reader
app.post('/api/python/bcf-reader', cpUpload, (req, res) => {
  const files = req.files;
  const file = (files && files.file) ? files.file[0] : null;
  if (!file) {
    return res.status(400).json({ error: 'BCF file is required' });
  }

  const bcfPath = file.path;
  const command = `${pythonExec} "${toolsScript}" bcf-read "${bcfPath}" "${bcfSnapshotsDir}"`;
  console.log(`[Server] Running: ${command}`);

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    // clean up file
    try { fs.unlinkSync(bcfPath); } catch (e) { }

    if (error) {
      console.error('[Server] BCF read failed:', error, stderr);
      return res.status(500).json({ error: 'BCF read failed', details: error.message, stderr });
    }

    try {
      const result = JSON.parse(stdout.trim());
      res.json(result);
    } catch (e) {
      console.error('[Server] Failed to parse BCF stdout:', stdout);
      res.status(500).json({ error: 'Failed to parse BCF output', stdout });
    }
  });
});

// 3. IFC Clash
app.post('/api/python/ifcclash', cpUpload, (req, res) => {
  const files = req.files;
  const fileA = (files && files.fileA) ? files.fileA[0] : null;
  const fileB = (files && files.fileB) ? files.fileB[0] : null;
  const tolerance = req.body.tolerance || 0.0;

  if (!fileA) {
    return res.status(400).json({ error: 'At least fileA is required' });
  }

  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const outputBcfName = `clash_result-${uniqueSuffix}.bcf`;
  const outputBcfPath = path.join(uploadDir, outputBcfName);

  const fileAPath = fileA.path;
  let fileBPathArg = '';
  if (fileB) {
    fileBPathArg = `"${fileB.path}"`;
  }

  const command = `${pythonExec} "${toolsScript}" clash "${fileAPath}" ${fileBPathArg} --tolerance ${tolerance} --output "${outputBcfPath}"`;
  console.log(`[Server] Running: ${command}`);

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    // clean up uploaded input files
    try { fs.unlinkSync(fileAPath); } catch (e) { }
    if (fileB) {
      try { fs.unlinkSync(fileB.path); } catch (e) { }
    }

    if (error) {
      console.error('[Server] Clash failed:', error, stderr);
      try { fs.unlinkSync(outputBcfPath); } catch (e) { }
      return res.status(500).json({ error: 'Clash detection failed', details: error.message, stderr });
    }

    try {
      const result = JSON.parse(stdout.trim());
      result.downloadUrl = `/api/python/download?file=${outputBcfName}`;
      res.json(result);
    } catch (e) {
      console.error('[Server] Failed to parse clash stdout:', stdout);
      try { fs.unlinkSync(outputBcfPath); } catch (e) { }
      res.status(500).json({ error: 'Failed to parse clash output', stdout });
    }
  });
});

// 4. BCF Download Endpoint
app.get('/api/python/download', (req, res) => {
  const fileName = req.query.file;
  if (!fileName || fileName.includes('/') || fileName.includes('\\')) {
    return res.status(400).json({ error: 'Invalid file name' });
  }
  const filePath = path.join(uploadDir, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, fileName, (err) => {
    try {
      fs.unlinkSync(filePath);
      console.log(`[Server] Cleaned up clash result file: ${fileName}`);
    } catch (e) {
      console.error(`[Server] Failed to delete file ${fileName}:`, e);
    }
  });
});

// 5. IFC Convert
app.post('/api/python/ifcconvert', cpUpload, (req, res) => {
  const files = req.files;
  const file = (files && files.file) ? files.file[0] : null;
  const format = req.body.format || 'glb';

  if (!file) {
    return res.status(400).json({ error: 'IFC file is required' });
  }

  const validFormats = ['obj', 'dae', 'glb', 'stp', 'igs'];
  if (!validFormats.includes(format)) {
    try { fs.unlinkSync(file.path); } catch (e) { }
    return res.status(400).json({ error: `Invalid format. Must be one of: ${validFormats.join(', ')}` });
  }

  const inputFilePath = file.path;
  const uniqueName = path.parse(file.filename).name;
  const outputFilePath = path.join(uploadDir, `${uniqueName}.${format}`);
  const ifcConvertPath = path.join(__dirname, 'lib', 'ifcopenshell', 'IfcConvert.exe');

  const command = `"${ifcConvertPath}" "${inputFilePath}" "${outputFilePath}"`;
  console.log(`[Server] Running: ${command}`);

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    try { fs.unlinkSync(inputFilePath); } catch (e) { }

    if (error) {
      console.error('[Server] IfcConvert failed:', error, stderr);
      try { fs.unlinkSync(outputFilePath); } catch (e) { }
      return res.status(500).json({ error: 'IFC Conversion failed', details: error.message, stderr });
    }

    if (!fs.existsSync(outputFilePath)) {
      return res.status(500).json({ error: 'Conversion succeeded but output file was not found' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    const origBase = path.parse(file.originalname).name;
    res.setHeader('Content-Disposition', `attachment; filename="${origBase}.${format}"`);

    const fileStream = fs.createReadStream(outputFilePath);
    fileStream.pipe(res);

    fileStream.on('close', () => {
      try {
        fs.unlinkSync(outputFilePath);
      } catch (e) { }
    });

    fileStream.on('error', (streamErr) => {
      console.error('IfcConvert stream error:', streamErr);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Streaming failed' });
      }
    });
  });
});

// 6. RVT to IFC converter using Creoox Xeokit Data Engine API
app.post('/api/convert-rvt', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const clientId = req.body.clientId;
  const clientSecret = req.body.clientSecret;
  let apiUrl = req.body.apiUrl || 'https://jobs.xeo.vision';

  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'XDES Client ID and Client Secret are required' });
  }

  // Ensure apiUrl starts with http or https
  if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
    apiUrl = 'https://' + apiUrl;
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  try {
    // 1. Upload to tmpfiles.org to get a public URL for the engine to import from
    const uploadForm = new FormData();
    const fileBlob = new Blob([fs.readFileSync(filePath)], { type: 'application/octet-stream' });
    uploadForm.append('file', fileBlob, originalName);

    console.log(`[Server] Uploading ${originalName} to tmpfiles.org...`);
    const uploadRes = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: uploadForm
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Failed to upload to tmpfiles.org: ${uploadRes.status} ${errText}`);
    }

    const uploadJson = await uploadRes.json();
    if (!uploadJson.data || !uploadJson.data.url) {
      throw new Error('Upload succeeded but no URL returned from tmpfiles.org');
    }

    // Fetch the view page to parse the actual direct download link (with security timestamp hash)
    const viewUrl = uploadJson.data.url;
    console.log(`[Server] Fetching view page to parse direct link: ${viewUrl}`);
    const pageRes = await fetch(viewUrl);
    if (!pageRes.ok) {
      throw new Error(`Failed to fetch view page from tmpfiles.org: ${pageRes.status}`);
    }
    const html = await pageRes.text();
    let downloadMatch = html.match(/class="download"\s+href="([^"]+)"/);
    if (!downloadMatch) {
      downloadMatch = html.match(/href="([^"]+)"\s+class="download"/);
    }
    if (!downloadMatch) {
      downloadMatch = html.match(/href="([^"]*\/dl\/[^"]*)"/);
    }
    if (!downloadMatch) {
      throw new Error('Could not parse direct download URL from tmpfiles.org page');
    }
    const publicUrl = downloadMatch[1];
    console.log(`[Server] Public direct URL for RVT: ${publicUrl}`);

    // 2. Submit the conversion job to Xeokit Data Engine
    const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // webhook token as requested: "no need to fill XDES_EXTERNAL_WEBHOOK_SITE_TOKEN, just leave it as comment line so in the furure i can just remove the comment operator to use it"
    // const XDES_EXTERNAL_WEBHOOK_SITE_TOKEN = "your_webhook_site_token_here";

    const job = {
      tag: "rvt-xkt",
      // webhook: {
      //   url: `https://webhook.site/${XDES_EXTERNAL_WEBHOOK_SITE_TOKEN}`,
      //   eventTypes: ["job.started", "job.succeeded", "job.failed"]
      // },
      tasks: [
        {
          id: "import-file",
          operation: "import/url",
          fileType: "rvt",
          url: publicUrl
        },
        {
          id: "convert-step-1",
          operation: "convert/rvt/glb",
          input: "import-file",
          engine: {
            name: "xeoRvt",
            version: "0.2.0"
          }
        },
        {
          id: "convert-step-2",
          operation: "convert/glb/xkt",
          input: "convert-step-1",
          engine: {
            name: "xeokit-convert",
            version: "1.3.2",
            options: {
              includeMetadata: true
            }
          }
        },
        {
          id: "export-step-1",
          operation: "export/url",
          input: "convert-step-2"
        },
        {
          id: "export-step-2",
          operation: "export/url",
          input: "convert-step-1",
          archiveMultipleFiles: true
        }
      ]
    };

    console.log(`[Server] Submitting job to ${apiUrl}/api/jobs/async...`);
    const jobRes = await fetch(`${apiUrl}/api/jobs/async`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(job)
    });

    if (!jobRes.ok) {
      const errText = await jobRes.text();
      throw new Error(`Failed to submit job to Data Engine: ${jobRes.status} ${errText}`);
    }

    const jobState = await jobRes.json();
    const jobId = jobState.id;
    console.log(`[Server] Job submitted successfully. Job ID: ${jobId}`);

    // 3. Poll job status until complete
    const maxAttempts = 15;
    let completedState = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[Server] Polling job state (Attempt ${attempt}/${maxAttempts})...`);
      const statusRes = await fetch(`${apiUrl}/api/jobs/${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      });

      if (!statusRes.ok) {
        throw new Error(`Failed to get job status: ${statusRes.status}`);
      }

      const statusData = await statusRes.json();
      if (statusData.endedAt !== null) {
        completedState = statusData;
        break;
      }

      // Wait 4 seconds
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    if (!completedState) {
      throw new Error('Job did not complete within the timeout period.');
    }

    if (!completedState.success) {
      let taskErrorMsg = '';
      if (completedState.tasksWithContext) {
        const failedTask = completedState.tasksWithContext.find(t => t.context && t.context.error);
        if (failedTask) {
          const rawErr = failedTask.context.error;
          const detail = typeof rawErr === 'object' ? JSON.stringify(rawErr) : String(rawErr);
          taskErrorMsg = `Task "${failedTask.id}" failed: ${detail}`;
        } else {
          const unfinishedTask = completedState.tasksWithContext.find(t => !t.context || !t.context.endedAt);
          if (unfinishedTask) {
            taskErrorMsg = `Task "${unfinishedTask.id}" did not finish successfully.`;
          }
        }
      }
      const finalError = taskErrorMsg || completedState.error || 'Unknown error';
      throw new Error(`Job execution failed: ${finalError}. Full state: ${JSON.stringify(completedState)}`);
    }

    console.log('[Server] Job completed successfully. Task context files:');
    completedState.tasksWithContext.forEach(t => {
      console.log(`Task: ${t.id}`);
      if (t.context && t.context.files) {
        t.context.files.forEach(f => {
          console.log(`  - File: ${f.path}, size: ${f.fileSize}, type: ${f.fileType}, url: ${f.url}`);
        });
      }
    });

    // 4. Find the exported file URL
    if (!completedState.tasksWithContext) {
      throw new Error('No task context returned in job state.');
    }

    const exportTask = completedState.tasksWithContext.find(t => t.id === 'export-step-1');
    if (!exportTask || !exportTask.context || !exportTask.context.files || exportTask.context.files.length === 0) {
      throw new Error('No output files found in export-step-1 task.');
    }

    const xktFile = exportTask.context.files.find(f => f.fileType === 'xkt' || f.path.endsWith('.xkt'));
    if (!xktFile || !xktFile.url) {
      throw new Error('No .xkt output file found in export task.');
    }

    // Search for metadata JSON across all tasks (xeoRvt metadata comes from convert-step-1 / export-step-2)
    let metaFile = null;
    for (const t of completedState.tasksWithContext) {
      if (t.context && t.context.files) {
        const found = t.context.files.find(f =>
          (f.fileType === 'xeokit-metadata' || f.path.endsWith('.json')) && f.url
        );
        if (found) {
          metaFile = found;
          console.log(`[Server] Found metadata file in task '${t.id}': ${found.path} (type: ${found.fileType})`);
          break;
        }
      }
    }

    // 5. Download the converted XKT file and metadata in parallel
    console.log(`[Server] Downloading XKT from ${xktFile.url}`);
    const downloads = [
      fetch(xktFile.url).then(r => { if (!r.ok) throw new Error(`XKT download failed: ${r.status}`); return r.arrayBuffer(); })
    ];
    if (metaFile && metaFile.url) {
      console.log(`[Server] Downloading metadata from ${metaFile.url}`);
      downloads.push(
        fetch(metaFile.url).then(r => { if (!r.ok) throw new Error(`Metadata download failed: ${r.status}`); return r.json(); })
      );
    }

    const [xktBuffer, metadataJson] = await Promise.all(downloads);

    // Clean up local temp RVT file
    try { fs.unlinkSync(filePath); } catch (e) {}

    // Send both XKT (base64) and metadata as JSON
    console.log(`[Server] Sending XKT (${xktBuffer.byteLength} bytes) + metadata to client`);
    res.json({
      xkt: Buffer.from(xktBuffer).toString('base64'),
      metadata: metadataJson || null,
      filename: `${path.parse(originalName).name}.xkt`
    });

  } catch (error) {
    console.error('[Server] RVT conversion failed:', error);
    try { fs.unlinkSync(filePath); } catch (e) {}
    res.status(500).json({ error: 'RVT to XKT conversion failed', details: error.message });
  }
});

// Serve static frontend assets in production desktop mode if dist folder exists
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`[Server] Serving static files from: ${distPath}`);
}

app.listen(PORT, () => {
  console.log(`[Server] Express backend running at http://localhost:${PORT}`);
});

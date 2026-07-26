const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('./db.cjs');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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


// --- AI Agent Chat Endpoint ---
app.post('/api/ai/chat', async (req, res) => {
  const { provider, apiKey, messages, tools } = req.body;

  if (!apiKey && provider !== 'ollama') {
    return res.status(400).json({ error: 'API key is required' });
  }

  try {
    if (provider === 'gemini') {
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const contents = messages.map(msg => {
        const role = msg.role === 'assistant' ? 'model' : msg.role;
        
        if (msg.tool_calls) {
          return {
            role: 'model',
            parts: msg.tool_calls.map(tc => ({
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
              }
            }))
          };
        }
        
        if (msg.role === 'tool') {
          return {
            role: 'user',
            parts: [{
              functionResponse: {
                name: msg.name,
                response: { result: msg.content }
              }
            }]
          };
        }

        return {
          role,
          parts: [{ text: msg.content || '' }]
        };
      });

      const functionDeclarations = tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }));

      const config = {};
      if (functionDeclarations.length > 0) {
        config.tools = [{ functionDeclarations }];
      }

      console.log(`[Server] Requesting Gemini with ${contents.length} messages`);
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents,
        config
      });

      const candidate = response.candidates?.[0];
      const part = candidate?.content?.parts?.[0];

      if (part && part.functionCall) {
        return res.json({
          tool_calls: [{
            id: 'call_' + Date.now(),
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args)
            }
          }]
        });
      }

      return res.json({
        content: response.text || ''
      });

    } else if (provider === 'openai') {
      const { OpenAI } = require('openai');
      const openai = new OpenAI({ apiKey });

      const formattedMessages = messages.map(msg => {
        const formatted = { role: msg.role, content: msg.content };
        if (msg.tool_calls) formatted.tool_calls = msg.tool_calls;
        if (msg.tool_call_id) formatted.tool_call_id = msg.tool_call_id;
        if (msg.name) formatted.name = msg.name;
        return formatted;
      });

      const formattedTools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));

      console.log(`[Server] Requesting OpenAI with ${formattedMessages.length} messages`);
      const chatCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: formattedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined
      });

      const choice = chatCompletion.choices[0];
      return res.json({
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls || null
      });

    } else if (provider === 'anthropic') {
      const { Anthropic } = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey });

      let systemMessage = '';
      const formattedMessages = [];

      messages.forEach(msg => {
        if (msg.role === 'system') {
          systemMessage = msg.content;
          return;
        }

        if (msg.role === 'assistant' && msg.tool_calls) {
          formattedMessages.push({
            role: 'assistant',
            content: [
              ...(msg.content ? [{ type: 'text', text: msg.content }] : []),
              ...msg.tool_calls.map(tc => ({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: JSON.parse(tc.function.arguments)
              }))
            ]
          });
          return;
        }

        if (msg.role === 'tool') {
          formattedMessages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: msg.tool_call_id,
              content: msg.content
            }]
          });
          return;
        }

        formattedMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content || ''
        });
      });

      const formattedTools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters
      }));

      console.log(`[Server] Requesting Anthropic with ${formattedMessages.length} messages`);
      const response = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        system: systemMessage || undefined,
        messages: formattedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined
      });

      let textContent = '';
      const toolCalls = [];

      response.content.forEach(part => {
        if (part.type === 'text') {
          textContent += part.text;
        } else if (part.type === 'tool_use') {
          toolCalls.push({
            id: part.id,
            type: 'function',
            function: {
              name: part.name,
              arguments: JSON.stringify(part.input)
            }
          });
        }
      });

      return res.json({
        content: textContent,
        tool_calls: toolCalls.length > 0 ? toolCalls : null
      });

    } else if (provider === 'ollama') {
      const { default: ollama } = await import('ollama');
      
      const formattedMessages = messages.map(msg => {
        const formatted = { role: msg.role, content: msg.content || '' };
        if (msg.tool_calls) {
          formatted.tool_calls = msg.tool_calls.map(tc => ({
            function: {
              name: tc.function.name,
              arguments: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments
            }
          }));
        }
        if (msg.name) {
          formatted.name = msg.name;
        }
        return formatted;
      });

      const formattedTools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));

      console.log(`[Server] Requesting Ollama with model ${req.body.model} and ${formattedMessages.length} messages`);
      const response = await ollama.chat({
        model: req.body.model,
        messages: formattedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined
      });

      const message = response.message;
      let toolCalls = null;
      if (message.tool_calls && message.tool_calls.length > 0) {
        toolCalls = message.tool_calls.map((call, idx) => ({
          id: call.id || `call_ollama_${Date.now()}_${idx}`,
          type: 'function',
          function: {
            name: call.function.name,
            arguments: typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments)
          }
        }));
      } else {
        try {
          const contentText = message.content || '';
          const regex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi;
          let match;
          const extractedCalls = [];
          
          while ((match = regex.exec(contentText)) !== null) {
            try {
              const parsed = JSON.parse(match[1].trim());
              if (parsed.name && parsed.arguments) {
                extractedCalls.push({
                  id: `call_ollama_${Date.now()}_${extractedCalls.length}`,
                  type: 'function',
                  function: {
                    name: parsed.name,
                    arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments)
                  }
                });
              }
            } catch (e) {
              // Ignore invalid JSON chunks inside markdown
            }
          }

          // If no markdown blocks matched, try parsing the whole trimmed content
          if (extractedCalls.length === 0) {
            const contentTrimmed = contentText.trim();
            if (contentTrimmed.startsWith('{') && contentTrimmed.endsWith('}')) {
              const parsed = JSON.parse(contentTrimmed);
              if (parsed.name && parsed.arguments) {
                extractedCalls.push({
                  id: `call_ollama_${Date.now()}_0`,
                  type: 'function',
                  function: {
                    name: parsed.name,
                    arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments)
                  }
                });
              }
            }
          }

          if (extractedCalls.length > 0) {
            toolCalls = extractedCalls;
          }
        } catch (e) {
          // Ignore parse errors, treat as regular message content
        }
      }

      return res.json({
        content: toolCalls ? '' : (message.content || ''),
        tool_calls: toolCalls
      });

    } else {
      return res.status(400).json({ error: 'Unsupported provider: ' + provider });
    }
  } catch (err) {
    console.error('[Server] AI Chat failed:', err);
    res.status(500).json({ error: err.message || 'AI Chat failed' });
  }
});

// --- 5D BIM BOQ & AHSP Estimating Endpoints ---

// Helper to safely evaluate mathematical expressions for the Rule Engine
function evaluateExpression(expression, context) {
  // Allow variables in context, numbers, and basic math operators
  const allowedTokens = ['volume', 'area', 'surface_area', 'length', 'count', 'val', 'x', '\\d+', '\\.', '\\+', '\\-', '\\*', '\\/', '\\(', '\\)', '\\s+'];
  const cleanRegex = new RegExp(`^(${allowedTokens.join('|')})+$`, 'i');
  
  const sanitized = expression.trim();
  if (!cleanRegex.test(sanitized)) {
    console.warn(`[Rule Engine] Rejected unsafe/invalid expression: ${expression}`);
    return 0;
  }
  
  let evalStr = sanitized;
  const vars = {
    volume: context.volume || 0.0,
    area: context.area || 0.0,
    surface_area: context.surface_area || 0.0,
    length: context.length || 0.0,
    count: context.count || 1
  };
  
  for (const [key, val] of Object.entries(vars)) {
    const varRegex = new RegExp(`\\b${key}\\b`, 'gi');
    evalStr = evalStr.replace(varRegex, String(val));
  }
  
  try {
    const calc = new Function(`return (${evalStr});`);
    const result = calc();
    return isNaN(result) ? 0 : result;
  } catch (e) {
    console.error(`[Rule Engine] Error evaluating expression: ${expression} (evalStr: ${evalStr})`, e);
    return 0;
  }
}

// 1. Projects
app.get('/api/projects', (req, res) => {
  try {
    const projects = db.query("SELECT * FROM projects ORDER BY created_at DESC");
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const { id, name, description } = req.body;
    const projId = id || 'model-' + Date.now();
    db.run("INSERT INTO projects (id, name, description) VALUES (?, ?, ?)", [projId, name || projId, description || '']);
    res.json({ success: true, id: projId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 2. Project elements (bulk input and retrieval)
app.post('/api/projects/:id/elements', (req, res) => {
  const projectId = req.params.id;
  const { elements } = req.body;
  if (!elements || !Array.isArray(elements)) {
    return res.status(400).json({ error: 'Elements array required' });
  }
  try {
    // Ensure project exists
    const proj = db.get("SELECT id FROM projects WHERE id = ?", [projectId]);
    if (!proj) {
      db.run("INSERT INTO projects (id, name, description) VALUES (?, ?, ?)", [projectId, projectId, 'Uploaded Project']);
    }

    db.transaction(() => {
      // Clear existing elements for this project first
      db.run("DELETE FROM ifc_elements WHERE project_id = ?", [projectId]);
      
      const insert = db.db.prepare(`
        INSERT OR REPLACE INTO ifc_elements (id, project_id, global_id, ifc_type, name, storey, zone, material, volume, area, surface_area, length, count, properties)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const el of elements) {
        insert.run(
          el.id,
          projectId,
          el.globalId,
          el.ifcType,
          el.name || '',
          el.storey || '',
          el.zone || '',
          el.material || '',
          el.volume || 0.0,
          el.area || 0.0,
          el.surfaceArea || 0.0,
          el.length || 0.0,
          el.count || 1,
          JSON.stringify(el.properties || {})
        );
      }
    });
    res.json({ success: true, count: elements.length });
  } catch (e) {
    console.error('[Server] Bulk insert failed:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/projects/:id/elements', (req, res) => {
  try {
    const elements = db.query("SELECT * FROM ifc_elements WHERE project_id = ?", [req.params.id]);
    // Parse properties back into objects
    elements.forEach(el => {
      if (el.properties) {
        try { el.properties = JSON.parse(el.properties); } catch (e) { el.properties = {}; }
      }
    });
    res.json(elements);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Rules management
app.get('/api/rules', (req, res) => {
  try {
    const rules = db.query(`
      SELECT r.*, c.description as classification_desc, c.unit as classification_unit, a.code as analysis_code
      FROM rules r 
      JOIN classifications c ON r.classification_code = c.code 
      LEFT JOIN ahsp_analyses a ON r.classification_code = a.classification_code
      ORDER BY r.priority DESC
    `);
    res.json(rules);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/rules', (req, res) => {
  try {
    const { id, rule_name, ifc_type, material_filter, classification_code, quantity_expression, priority } = req.body;
    const ruleId = id || 'R-' + Date.now();
    db.run(`
      INSERT INTO rules (id, rule_name, ifc_type, material_filter, classification_code, quantity_expression, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        rule_name=excluded.rule_name,
        ifc_type=excluded.ifc_type,
        material_filter=excluded.material_filter,
        classification_code=excluded.classification_code,
        quantity_expression=excluded.quantity_expression,
        priority=excluded.priority
    `, [ruleId, rule_name, ifc_type, material_filter || null, classification_code, quantity_expression, priority || 10]);
    res.json({ success: true, id: ruleId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/rules/:id', (req, res) => {
  try {
    db.run("DELETE FROM rules WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4. Region Price adjustment & Regions
app.get('/api/regions', (req, res) => {
  try {
    const regions = db.query("SELECT * FROM regions");
    res.json(regions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/resource-prices', (req, res) => {
  try {
    const regionId = req.query.regionId || 'R-JKT';
    const prices = db.query(`
      SELECT p.id, r.id as resource_id, r.category, r.description, r.unit, COALESCE(p.price, 0) as price
      FROM resources r
      LEFT JOIN resource_prices p ON r.id = p.resource_id AND p.region_id = ?
    `, [regionId]);
    res.json(prices);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/resource-prices', (req, res) => {
  try {
    const { resource_id, region_id, price } = req.body;
    const priceId = `${region_id}-${resource_id}`;
    db.run(`
      INSERT INTO resource_prices (id, resource_id, region_id, price, effective_date)
      VALUES (?, ?, ?, ?, date('now'))
      ON CONFLICT(resource_id, region_id) DO UPDATE SET
        price=excluded.price,
        effective_date=date('now')
    `, [priceId, resource_id, region_id, price]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 5. AHSP analyses catalog
app.get('/api/ahsp', (req, res) => {
  try {
    const regionId = req.query.regionId || 'R-JKT';
    const analyses = db.query("SELECT * FROM ahsp_analyses");
    const result = [];
    for (const ana of analyses) {
      const details = db.query(`
        SELECT d.*, r.description, r.unit, r.category, COALESCE(p.price, 0) as price
        FROM ahsp_details d
        JOIN resources r ON d.resource_id = r.id
        LEFT JOIN resource_prices p ON r.id = p.resource_id AND p.region_id = ?
        WHERE d.ahsp_code = ?
      `, [regionId, ana.code]);
      result.push({
        ...ana,
        details
      });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Classifications list
app.get('/api/classifications', (req, res) => {
  try {
    const list = db.query("SELECT * FROM classifications");
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 6. Automatic BOQ Generator
app.post('/api/projects/:id/boq/generate', (req, res) => {
  const projectId = req.params.id;
  const { regionId } = req.body;
  if (!regionId) return res.status(400).json({ error: 'Region ID required' });

  try {
    // 1. Fetch elements, rules, classifications
    const elements = db.query("SELECT * FROM ifc_elements WHERE project_id = ?", [projectId]);
    const overrides = db.query(`
      SELECT o.* FROM quantity_overrides o 
      JOIN ifc_elements e ON o.element_id = e.id 
      WHERE e.project_id = ?
    `, [projectId]);
    
    const rules = db.query("SELECT * FROM rules ORDER BY priority DESC");
    const classifications = db.query("SELECT * FROM classifications");
    const ahspAnalyses = db.query("SELECT * FROM ahsp_analyses");

    const classOverrides = db.query("SELECT * FROM classification_overrides WHERE project_id = ?", [projectId]);
    const classOverrideMap = {};
    for (const co of classOverrides) {
      classOverrideMap[co.element_id] = co.classification_code;
    }

    // Map overrides for easy lookup: element_id -> quantity_name -> override_value
    const overrideMap = {};
    for (const o of overrides) {
      if (!overrideMap[o.element_id]) overrideMap[o.element_id] = {};
      overrideMap[o.element_id][o.quantity_name] = o.override_value;
    }

    // 2. Accumulate quantities per classification code
    const boqAccumulator = {};
    const boqElementMappings = {}; // class_code -> Set of element GlobalIds

    for (const el of elements) {
      let props = {};
      try { props = JSON.parse(el.properties || '{}'); } catch(e) {}
      
      const context = {
        volume: el.volume,
        area: el.area,
        surface_area: el.surface_area,
        length: el.length,
        count: el.count,
        ...props
      };

      if (overrideMap[el.id]) {
        for (const [qName, oVal] of Object.entries(overrideMap[el.id])) {
          context[qName] = oVal;
        }
      }

      const elTypeLower = (el.ifc_type_override || el.ifc_type).toLowerCase();
      const elMatLower = (el.material || '').toLowerCase();

      const overriddenCode = classOverrideMap[el.id];
      if (overriddenCode) {
        const classification = classifications.find(c => c.code === overriddenCode);
        const unit = (classification ? classification.unit : 'pcs').toLowerCase();
        
        let qty = 0;
        if (unit.includes('m³') || unit.includes('volume') || unit.includes('cub')) {
          qty = context.volume;
        } else if (unit.includes('m²') || unit.includes('area') || unit.includes('sq')) {
          qty = context.surface_area || context.area;
        } else if (unit.includes('kg') || unit.includes('ton')) {
          if (overriddenCode === 'A.4.1.2') {
            qty = context.volume * 100.0;
          } else {
            qty = context.count;
          }
        } else if (unit === 'm' || unit.includes('meter') || unit.includes('length')) {
          qty = context.length;
        } else {
          qty = context.count;
        }
        
        if (qty > 0) {
          boqAccumulator[overriddenCode] = (boqAccumulator[overriddenCode] || 0) + qty;
          if (!boqElementMappings[overriddenCode]) boqElementMappings[overriddenCode] = new Set();
          boqElementMappings[overriddenCode].add(el.global_id);
        }
      } else {
        const matchedRulesByCode = {};
        for (const rule of rules) {
          const ruleTypeLower = rule.ifc_type.toLowerCase();
          if (elTypeLower === ruleTypeLower || elTypeLower.startsWith(ruleTypeLower) || ruleTypeLower === 'all') {
            if (rule.material_filter && !elMatLower.includes(rule.material_filter.toLowerCase())) {
              continue;
            }
            
            const code = rule.classification_code;
            if (!matchedRulesByCode[code] || rule.priority > matchedRulesByCode[code].priority) {
              matchedRulesByCode[code] = rule;
            }
          }
        }

        for (const [code, rule] of Object.entries(matchedRulesByCode)) {
          const qty = evaluateExpression(rule.quantity_expression, context);
          if (qty > 0) {
            boqAccumulator[code] = (boqAccumulator[code] || 0) + qty;
            if (!boqElementMappings[code]) boqElementMappings[code] = new Set();
            boqElementMappings[code].add(el.global_id);
          }
        }
      }
    }

    // 3. Clear existing BOQ items
    db.run("DELETE FROM boq_items WHERE project_id = ?", [projectId]);

    // 4. Calculate unit prices using AHSP and resource prices, then save BOQ rows
    const generatedBOQ = [];
    
    db.transaction(() => {
      for (const [code, quantity] of Object.entries(boqAccumulator)) {
        const classification = classifications.find(c => c.code === code);
        if (!classification) continue;

        const ahsp = ahspAnalyses.find(a => a.classification_code === code);
        let unitPrice = 0.0;

        if (ahsp) {
          const details = db.query(`
            SELECT d.coefficient, d.waste_factor, COALESCE(p.price, 0) as price
            FROM ahsp_details d
            JOIN resources r ON d.resource_id = r.id
            LEFT JOIN resource_prices p ON r.id = p.resource_id AND p.region_id = ?
            WHERE d.ahsp_code = ?
          `, [regionId, ahsp.code]);

          let resourceCostSum = 0.0;
          for (const det of details) {
            resourceCostSum += det.coefficient * det.waste_factor * det.price;
          }
          unitPrice = resourceCostSum * (1.0 + (ahsp.overhead_factor || 0.10));
        } else {
          unitPrice = 500000.0; 
        }

        const boqItemId = `${projectId}-${code}`;
        const description = classification.description;
        const unit = classification.unit;
        const totalPrice = quantity * unitPrice;
        const sourceTitle = classification.source_title || 'General';

        db.run(`
          INSERT INTO boq_items (id, project_id, classification_code, description, quantity, unit, unit_price, total_price, source_title)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [boqItemId, projectId, code, description, quantity, unit, unitPrice, totalPrice, sourceTitle]);

        generatedBOQ.push({
          id: boqItemId,
          classification_code: code,
          category: classification.category,
          description,
          quantity,
          unit,
          unit_price: unitPrice,
          total_price: totalPrice,
          source_title: sourceTitle,
          elements: Array.from(boqElementMappings[code] || [])
        });
      }
    });

    res.json({ success: true, boq: generatedBOQ });

  } catch (e) {
    console.error('[Server] BOQ Generation error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET generated BOQ
app.get('/api/projects/:id/boq', (req, res) => {
  const projectId = req.params.id;
  try {
    const boqItems = db.query(`
      SELECT b.*, c.category
      FROM boq_items b
      JOIN classifications c ON b.classification_code = c.code
      WHERE b.project_id = ?
    `, [projectId]);

    const elements = db.query("SELECT * FROM ifc_elements WHERE project_id = ?", [projectId]);
    const rules = db.query("SELECT * FROM rules ORDER BY priority DESC");
    const overrides = db.query(`
      SELECT o.* FROM quantity_overrides o 
      JOIN ifc_elements e ON o.element_id = e.id 
      WHERE e.project_id = ?
    `, [projectId]);
    
    const overrideMap = {};
    for (const o of overrides) {
      if (!overrideMap[o.element_id]) overrideMap[o.element_id] = {};
      overrideMap[o.element_id][o.quantity_name] = o.override_value;
    }

    const classifications = db.query("SELECT * FROM classifications");
    const classOverrides = db.query("SELECT * FROM classification_overrides WHERE project_id = ?", [projectId]);
    const classOverrideMap = {};
    for (const co of classOverrides) {
      classOverrideMap[co.element_id] = co.classification_code;
    }

    const result = boqItems.map(item => {
      const code = item.classification_code;
      const matchedGuids = [];
      
      for (const el of elements) {
        let props = {};
        try { props = JSON.parse(el.properties || '{}'); } catch(e) {}
        
        const context = {
          volume: el.volume,
          area: el.area,
          surface_area: el.surface_area,
          length: el.length,
          count: el.count,
          ...props
        };
        if (overrideMap[el.id]) {
          for (const [qName, oVal] of Object.entries(overrideMap[el.id])) {
            context[qName] = oVal;
          }
        }
        
        const elTypeLower = (el.ifc_type_override || el.ifc_type).toLowerCase();
        const elMatLower = (el.material || '').toLowerCase();
        
        const overriddenCode = classOverrideMap[el.id];
        if (overriddenCode) {
          if (overriddenCode === code) {
            const classification = classifications.find(c => c.code === overriddenCode);
            const unit = (classification ? classification.unit : 'pcs').toLowerCase();
            
            let qty = 0;
            if (unit.includes('m³') || unit.includes('volume') || unit.includes('cub')) {
              qty = context.volume;
            } else if (unit.includes('m²') || unit.includes('area') || unit.includes('sq')) {
              qty = context.surface_area || context.area;
            } else if (unit.includes('kg') || unit.includes('ton')) {
              if (overriddenCode === 'A.4.1.2') {
                qty = context.volume * 100.0;
              } else {
                qty = context.count;
              }
            } else if (unit === 'm' || unit.includes('meter') || unit.includes('length')) {
              qty = context.length;
            } else {
              qty = context.count;
            }
            
            if (qty > 0) {
              matchedGuids.push(el.global_id);
            }
          }
        } else {
          let highestRule = null;
          for (const rule of rules) {
            const ruleTypeLower = rule.ifc_type.toLowerCase();
            if (elTypeLower === ruleTypeLower || elTypeLower.startsWith(ruleTypeLower) || ruleTypeLower === 'all') {
              if (rule.material_filter && !elMatLower.includes(rule.material_filter.toLowerCase())) {
                continue;
              }
              if (rule.classification_code === code) {
                if (!highestRule || rule.priority > highestRule.priority) {
                  highestRule = rule;
                }
              }
            }
          }

          if (highestRule) {
            const qty = evaluateExpression(highestRule.quantity_expression, context);
            if (qty > 0) {
              matchedGuids.push(el.global_id);
            }
          }
        }
      }

      return {
        ...item,
        elements: matchedGuids
      };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 7. Quantity overrides & audits
app.get('/api/projects/:id/overrides', (req, res) => {
  try {
    const overrides = db.query(`
      SELECT o.*, e.name as element_name, e.ifc_type, e.global_id
      FROM quantity_overrides o
      JOIN ifc_elements e ON o.element_id = e.id
      WHERE e.project_id = ?
    `, [req.params.id]);
    res.json(overrides);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/projects/:id/overrides', (req, res) => {
  try {
    const { element_id, quantity_name, override_value, reason, updated_by } = req.body;
    
    const el = db.get("SELECT * FROM ifc_elements WHERE id = ?", [element_id]);
    if (!el) return res.status(404).json({ error: 'Element not found' });
    
    const calculated_value = el[quantity_name] || 0.0;
    const overrideId = element_id + '-' + quantity_name;
    
    db.run(`
      INSERT INTO quantity_overrides (id, element_id, quantity_name, calculated_value, override_value, reason, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        override_value=excluded.override_value,
        reason=excluded.reason,
        updated_by=excluded.updated_by,
        updated_at=datetime('now')
    `, [overrideId, element_id, quantity_name, calculated_value, override_value, reason || '', updated_by || 'User']);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/projects/:id/overrides/:overrideId', (req, res) => {
  try {
    db.run("DELETE FROM quantity_overrides WHERE id = ?", [req.params.overrideId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Get Local Ollama Models ---
app.get('/api/ollama/models', async (req, res) => {
  try {
    const { default: ollama } = await import('ollama');
    const response = await ollama.list();
    res.json({ models: response.models || [] });
  } catch (err) {
    console.error('[Server] Failed to fetch Ollama models:', err);
    res.status(500).json({ error: 'Failed to fetch local Ollama models. Is Ollama running?' });
  }
});

// Export Rules
app.get('/api/rules/export', (req, res) => {
  try {
    const rules = db.query("SELECT * FROM rules");
    res.json(rules);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Import Rules
app.post('/api/rules/import', (req, res) => {
  const { rules } = req.body;
  if (!rules || !Array.isArray(rules)) {
    return res.status(400).json({ error: 'Rules array required' });
  }
  try {
    db.transaction(() => {
      for (const rule of rules) {
        db.run(`
          INSERT OR REPLACE INTO rules (id, rule_name, ifc_type, material_filter, classification_code, quantity_expression, priority)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          rule.id,
          rule.rule_name,
          rule.ifc_type,
          rule.material_filter || null,
          rule.classification_code,
          rule.quantity_expression,
          rule.priority || 10
        ]);
      }
    });
    res.json({ success: true, count: rules.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update AHSP breakdown detail coefficient and waste factor
app.post('/api/ahsp-details/update', (req, res) => {
  const { id, coefficient, waste_factor } = req.body;
  if (!id || coefficient === undefined || waste_factor === undefined) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  try {
    db.run("UPDATE ahsp_details SET coefficient = ?, waste_factor = ? WHERE id = ?", [coefficient, waste_factor, id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add new resource breakdown detail item
app.post('/api/ahsp-details/add', (req, res) => {
  const { ahsp_code, resource_id, coefficient, waste_factor } = req.body;
  if (!ahsp_code || !resource_id || coefficient === undefined) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  try {
    const detailId = `${ahsp_code}-${resource_id}`;
    db.run(`
      INSERT OR REPLACE INTO ahsp_details (id, ahsp_code, resource_id, coefficient, waste_factor)
      VALUES (?, ?, ?, ?, ?)
    `, [detailId, ahsp_code, resource_id, coefficient, waste_factor ?? 1.0]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete breakdown detail item
app.post('/api/ahsp-details/:id/delete', (req, res) => {
  try {
    db.run("DELETE FROM ahsp_details WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Export AHSP Library as CSV
app.get('/api/ahsp/export', (req, res) => {
  try {
    const query = `
      SELECT 
        a.code AS analysis_code,
        a.classification_code AS wbs_item,
        a.source_title AS source_catalog,
        a.description AS analysis_description,
        a.overhead_factor,
        d.resource_id,
        r.category AS resource_category,
        r.description AS resource_description,
        r.unit AS resource_unit,
        d.coefficient,
        COALESCE(p.price, 0) AS resource_price
      FROM ahsp_analyses a
      LEFT JOIN ahsp_details d ON a.code = d.ahsp_code
      LEFT JOIN resources r ON d.resource_id = r.id
      LEFT JOIN resource_prices p ON r.id = p.resource_id AND p.region_id = 'R-JKT'
    `;
    const rows = db.query(query);
    
    let csv = "Analysis Code,WBS Item,Source Catalog,Analysis Description,Overhead Factor,Resource ID,Resource Category,Resource Description,Resource Unit,Coefficient,Resource Price\n";
    
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes("\"") || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    rows.forEach(r => {
      csv += [
        escapeCsv(r.analysis_code),
        escapeCsv(r.wbs_item),
        escapeCsv(r.source_catalog),
        escapeCsv(r.analysis_description),
        r.overhead_factor ?? 0.10,
        escapeCsv(r.resource_id),
        escapeCsv(r.resource_category),
        escapeCsv(r.resource_description),
        escapeCsv(r.resource_unit),
        r.coefficient !== null && r.coefficient !== undefined ? r.coefficient : "",
        r.resource_price !== null && r.resource_price !== undefined ? r.resource_price : ""
      ].join(",") + "\n";
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ahsp_export.csv"');
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Import AHSP Library from CSV
app.post('/api/ahsp/import', (req, res) => {
  const { csvText } = req.body;
  if (!csvText) {
    return res.status(400).json({ error: 'csvText is required' });
  }
  
  try {
    // Log backup in Price Unit Analysis folder
    try {
      const dirPath = path.join(__dirname, 'Price Unit Analysis');
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      const filepath = path.join(dirPath, `imported_${Date.now()}.csv`);
      fs.writeFileSync(filepath, csvText, 'utf8');
    } catch (err) {
      console.error('[Server] Failed to write CSV import log file:', err);
    }

    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) {
      return res.status(400).json({ error: 'Empty or invalid CSV file' });
    }
    
    const parseCsvLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = parseCsvLine(lines[i]);
        if (row.length < 4) continue;
        
        const analysis_code = row[0];
        const wbs_item = row[1] || analysis_code;
        const source_catalog = row[2] || 'Imported';
        const analysis_description = row[3] || '';
        const overhead_factor = row[4] ? parseFloat(row[4]) : 0.10;
        
        const resource_id = row[5];
        const resource_category = row[6];
        const resource_description = row[7];
        const resource_unit = row[8];
        const coefficient = row[9] ? parseFloat(row[9]) : null;
        const resource_price = row[10] ? parseFloat(row[10]) : null;
        
        db.run(`
          INSERT OR REPLACE INTO classifications (code, description, unit, category, source_title)
          VALUES (?, ?, ?, ?, ?)
        `, [wbs_item, analysis_description, resource_unit || 'pcs', 'Imported', source_catalog]);
        
        db.run(`
          INSERT OR REPLACE INTO ahsp_analyses (code, classification_code, description, overhead_factor, source_title)
          VALUES (?, ?, ?, ?, ?)
        `, [analysis_code, wbs_item, analysis_description, isNaN(overhead_factor) ? 0.10 : overhead_factor, source_catalog]);
        
        if (resource_id) {
          db.run(`
            INSERT OR REPLACE INTO resources (id, category, description, unit)
            VALUES (?, ?, ?, ?)
          `, [resource_id, resource_category || 'Material', resource_description || '', resource_unit || '']);
          
          if (resource_price !== null && !isNaN(resource_price)) {
            const regions = ['R-JKT', 'R-BDG', 'R-SBY', 'R-PAP'];
            regions.forEach(reg => {
              const priceId = `${reg}-${resource_id}`;
              db.run(`
                INSERT OR REPLACE INTO resource_prices (id, resource_id, region_id, price, effective_date)
                VALUES (?, ?, ?, ?, date('now'))
              `, [priceId, resource_id, reg, resource_price]);
            });
          }
          
          if (coefficient !== null && !isNaN(coefficient)) {
            const detailId = `${analysis_code}-${resource_id}`;
            db.run(`
              INSERT OR REPLACE INTO ahsp_details (id, ahsp_code, resource_id, coefficient, waste_factor)
              VALUES (?, ?, ?, ?, 1.0)
            `, [detailId, analysis_code, resource_id, coefficient]);
          }
        }
      }
    });

    res.json({ success: true, message: `Successfully imported CSV rows.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reset & Reload Local AHSP Catalogs from local directory
app.post('/api/ahsp/reset', (req, res) => {
  try {
    db.transaction(() => {
      // 1. Clear database tables
      db.run("DELETE FROM classifications");
      db.run("DELETE FROM resources");
      db.run("DELETE FROM resource_prices");
      db.run("DELETE FROM ahsp_analyses");
      db.run("DELETE FROM ahsp_details");
      db.run("DELETE FROM rules");
      db.run("DELETE FROM classification_overrides");
      db.run("DELETE FROM quantity_overrides");
      db.run("DELETE FROM boq_items");
      db.run("DELETE FROM catalog_metadata");
      db.run("DELETE FROM validation_reports");
      
      console.log("[Reset] Database tables cleared.");

      // Helper: load a rules JSON file (array of rule objects) into the rules table
      const loadRulesFile = (rulesPath, defaultCategory) => {
        if (!fs.existsSync(rulesPath)) return 0;
        const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
        let count = 0;
        for (const rule of rules) {
          db.run("INSERT OR IGNORE INTO classifications (code, description, unit, category) VALUES (?, ?, 'pcs', ?)",
            [rule.classification_code, rule.rule_name, defaultCategory]);
          db.run(`INSERT OR REPLACE INTO rules
            (id, rule_name, ifc_type, material_filter, classification_code, quantity_expression, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [rule.id, rule.rule_name, rule.ifc_type, rule.material_filter || null,
             rule.classification_code, rule.quantity_expression, rule.priority || 10]);
          count++;
        }
        return count;
      };

      // Helper: read title from a metadata file (any path)
      const readTitle = (metaPath, fallback) => {
        if (!fs.existsSync(metaPath)) return fallback;
        try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')).title || fallback; } catch { return fallback; }
      };

      // Helper: find a file in a directory matching a pattern (case-insensitive)
      const findByPattern = (dir, pattern) => {
        if (!fs.existsSync(dir)) return null;
        const f = fs.readdirSync(dir).find(n => n.toLowerCase().includes(pattern.toLowerCase()));
        return f ? path.join(dir, f) : null;
      };

      // 2. Parse and load from local folder E:\Documents\Practice\xeokit\AHSP
      const ahspDir = "E:\\Documents\\Practice\\xeokit\\AHSP";
      if (!fs.existsSync(ahspDir)) {
        throw new Error(`AHSP directory not found: ${ahspDir}`);
      }

      const subdirs = fs.readdirSync(ahspDir).filter(name => {
        const fullPath = path.join(ahspDir, name);
        return fs.statSync(fullPath).isDirectory();
      });

      for (const subdirName of subdirs) {
        if (subdirName !== "AHSP BM" && subdirName !== "AHSP SNI") {
          continue;
        }
        const subDir = path.join(ahspDir, subdirName);
        
        // Find metadata title
        const metaPath = findByPattern(subDir, "metadata");
        let fallbackTitle = subdirName.replace("AHSP ", "Analisis Harga Satuan Pekerjaan ");
        if (subdirName === "AHSP") {
          fallbackTitle = "Normalized AHSP Bidang Cipta Karya Library";
        }
        const title = readTitle(metaPath, fallbackTitle);

        // Find main library file. Prefer files containing "ahsp_library"
        let libPath = findByPattern(subDir, "ahsp_library");
        if (!libPath) {
          // Fallback: look for json file containing "ahsp" but not metadata/resources/labor/etc.
          libPath = fs.readdirSync(subDir).find(n => {
            const nl = n.toLowerCase();
            return nl.includes("ahsp") && 
                   !nl.includes("metadata") && 
                   !nl.includes("resources") && 
                   !nl.includes("labor") && 
                   !nl.includes("equipment") && 
                   !nl.includes("materials") && 
                   !nl.includes("rules") && 
                   !nl.includes("validation");
          });
          if (libPath) {
            libPath = path.join(subDir, libPath);
          }
        }

        if (libPath && fs.existsSync(libPath)) {
          importUnifiedLibraryData(JSON.parse(fs.readFileSync(libPath, 'utf8')), title);
          console.log(`[Reset] Loaded library for catalog: ${title} (${path.basename(libPath)})`);
        }

        // Load standalone resources if present
        const resPath = findByPattern(subDir, "resources");
        if (resPath && fs.existsSync(resPath)) {
          const rawResources = JSON.parse(fs.readFileSync(resPath, 'utf8'));
          const regions = ['R-JKT', 'R-BDG', 'R-SBY', 'R-PAP'];
          const rateMapping = {
            'Labor':     { 'R-JKT': 120000, 'R-BDG': 108000, 'R-SBY': 114000, 'R-PAP': 216000 },
            'Material':  { 'R-JKT':  50000, 'R-BDG':  45000, 'R-SBY':  48000, 'R-PAP':  90000 },
            'Equipment': { 'R-JKT': 150000, 'R-BDG': 135000, 'R-SBY': 142000, 'R-PAP': 270000 }
          };
          for (const r of rawResources) {
            db.run("INSERT OR IGNORE INTO resources (id, category, description, unit) VALUES (?, ?, ?, ?)",
              [r.id, r.category || 'Material', r.name || r.description || '', r.unit || '']);
            const cat = r.category || 'Material';
            regions.forEach(reg => {
              const price = rateMapping[cat]?.[reg] ?? 50000;
              db.run("INSERT OR IGNORE INTO resource_prices (id, resource_id, region_id, price, effective_date) VALUES (?, ?, ?, ?, ?)",
                [`${reg}-${r.id}`, r.id, reg, price, '2026-07-26']);
            });
          }
          console.log(`[Reset] Loaded standalone resources for catalog: ${title} (${path.basename(resPath)})`);
        }

        // Load rules if present
        const rulesPath = findByPattern(subDir, "rules");
        if (rulesPath && fs.existsSync(rulesPath)) {
          const catName = subdirName.replace("AHSP ", "");
          const n = loadRulesFile(rulesPath, catName);
          console.log(`[Reset] Loaded ${n} rules for catalog: ${title} (${path.basename(rulesPath)})`);
        }
      }
    });

    res.json({ success: true, message: "Database reset and local catalog directories parsed successfully." });
  } catch (e) {
    console.error("[Reset] Error occurred during reset-reload operation:", e);
    res.status(500).json({ error: e.message });
  }
});

// Clear all AHSP/catalog data without reloading defaults
app.post('/api/ahsp/clear', (req, res) => {
  try {
    db.transaction(() => {
      db.run("DELETE FROM ahsp_details");
      db.run("DELETE FROM ahsp_analyses");
      db.run("DELETE FROM classifications");
      db.run("DELETE FROM resources");
      db.run("DELETE FROM resource_prices");
      db.run("DELETE FROM catalog_metadata");
      db.run("DELETE FROM validation_reports");
      db.run("DELETE FROM boq_items");
    });
    console.log("[Clear] Price Unit Analysis database cleared.");
    res.json({ success: true, message: "Price Unit Analysis database cleared." });
  } catch (e) {
    console.error("[Clear] Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Clear all mapping rules without touching catalog data
app.post('/api/rules/clear', (req, res) => {
  try {
    db.transaction(() => {
      db.run("DELETE FROM rules");
      db.run("DELETE FROM classification_overrides");
      db.run("DELETE FROM quantity_overrides");
      db.run("DELETE FROM boq_items");
    });
    console.log("[Clear] Mapping & Rules database cleared.");
    res.json({ success: true, message: "Mapping & Rules database cleared." });
  } catch (e) {
    console.error("[Clear] Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Import manual QTO overrides and classification resumes matching by global_id
app.post('/api/projects/:projectId/qto/import', (req, res) => {
  const { projectId } = req.params;
  const { qto } = req.body;
  if (!qto || !Array.isArray(qto)) {
    return res.status(400).json({ error: 'QTO array required' });
  }
  try {
    db.transaction(() => {
      const elements = db.query("SELECT id, global_id FROM ifc_elements WHERE project_id = ?", [projectId]);
      const guidToIdMap = {};
      elements.forEach(el => {
        guidToIdMap[el.global_id] = el.id;
      });

      for (const item of qto) {
        const elId = guidToIdMap[item.global_id];
        if (!elId) continue;

        if (item.overrides && typeof item.overrides === 'object') {
          for (const [qtyName, oVal] of Object.entries(item.overrides)) {
            const overrideId = elId + '-' + qtyName;
            db.run(`
              INSERT OR REPLACE INTO quantity_overrides (id, element_id, quantity_name, calculated_value, override_value, reason, updated_by)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [overrideId, elId, qtyName, 0.0, oVal, 'Imported override resume', 'JSON Import']);
          }
        }

        if (item.manual_classification) {
          db.run(`
            INSERT OR REPLACE INTO classification_overrides (project_id, element_id, classification_code)
            VALUES (?, ?, ?)
          `, [projectId, elId, item.manual_classification]);
        }
      }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper for resetting
function importUnifiedLibraryData(data, sourceTitle = 'General') {
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item.code) continue;
      db.run("INSERT OR REPLACE INTO classifications (code, description, unit, category, source_title) VALUES (?, ?, ?, ?, ?)",
        [item.code, item.description || '', item.unit || 'pcs', item.category || 'General', sourceTitle]);
      const analysisCode = item.code.startsWith('AHSP-') ? item.code : `AHSP-${item.code}`;
      db.run("INSERT OR REPLACE INTO ahsp_analyses (code, classification_code, description, overhead_factor, source_title) VALUES (?, ?, ?, 0.10, ?)",
        [analysisCode, item.code, item.description || '', sourceTitle]);
      if (item.details && Array.isArray(item.details)) {
        for (const d of item.details) {
          const resId = d.resource_id || d.resource;
          if (!resId) continue;
          db.run("INSERT OR IGNORE INTO resources (id, category, description, unit) VALUES (?, 'Material', ?, '')",
            [resId, `Placeholder resource ${resId}`]);
          const detailId = `${analysisCode}-${resId}`;
          db.run("INSERT OR REPLACE INTO ahsp_details (id, ahsp_code, resource_id, coefficient, waste_factor) VALUES (?, ?, ?, ?, ?)",
            [detailId, analysisCode, resId, d.coefficient || 0, d.waste_factor || 1.0]);
        }
      }
    }
    return;
  }
  if (data.classifications && Array.isArray(data.classifications)) {
    for (const c of data.classifications) {
      db.run("INSERT OR REPLACE INTO classifications (code, description, unit, category, source_title) VALUES (?, ?, ?, ?, ?)",
        [c.code, c.description, c.unit, c.category, sourceTitle]);
    }
  }
  if (data.resources && Array.isArray(data.resources)) {
    for (const r of data.resources) {
      db.run("INSERT OR REPLACE INTO resources (id, category, description, unit) VALUES (?, ?, ?, ?)",
        [r.id, r.category, r.description || r.name || '', r.unit || '']);
    }
  }
  if (data.resource_prices && Array.isArray(data.resource_prices)) {
    for (const rp of data.resource_prices) {
      // Safety guard: insert placeholder resource if missing
      db.run("INSERT OR IGNORE INTO resources (id, category, description, unit) VALUES (?, 'Material', ?, '')",
        [rp.resource_id, `Placeholder resource ${rp.resource_id}`]);
      db.run("INSERT OR REPLACE INTO resource_prices (id, resource_id, region_id, price, effective_date) VALUES (?, ?, ?, ?, ?)",
        [rp.id, rp.resource_id, rp.region_id, rp.price, rp.effective_date]);
    }
  }
  if (data.ahsp_analyses && Array.isArray(data.ahsp_analyses)) {
    for (const a of data.ahsp_analyses) {
      // Safety guard: insert placeholder classification if missing
      db.run("INSERT OR IGNORE INTO classifications (code, description, unit, category, source_title) VALUES (?, ?, 'pcs', 'General', ?)",
        [a.classification_code, `Placeholder classification ${a.classification_code}`, sourceTitle]);
      db.run("INSERT OR REPLACE INTO ahsp_analyses (code, classification_code, description, overhead_factor, source_title) VALUES (?, ?, ?, ?, ?)",
        [a.code, a.classification_code, a.description, a.overhead_factor, sourceTitle]);
    }
  }
  if (data.ahsp_details && Array.isArray(data.ahsp_details)) {
    for (const d of data.ahsp_details) {
      // Safety guards: insert placeholders
      db.run("INSERT OR IGNORE INTO resources (id, category, description, unit) VALUES (?, 'Material', ?, '')",
        [d.resource_id, `Placeholder resource ${d.resource_id}`]);
      db.run("INSERT OR IGNORE INTO ahsp_analyses (code, classification_code, description, overhead_factor, source_title) VALUES (?, ?, 'Placeholder Analysis', 0.10, ?)",
        [d.ahsp_code, d.ahsp_code, sourceTitle]);
      db.run("INSERT OR REPLACE INTO ahsp_details (id, ahsp_code, resource_id, coefficient, waste_factor) VALUES (?, ?, ?, ?, ?)",
        [d.id, d.ahsp_code, d.resource_id, d.coefficient, d.waste_factor]);
    }
  }
  // Synthesize analyses for classifications that have none (e.g. BM which has classifications but no ahsp_type data)
  if (data.classifications && Array.isArray(data.classifications) &&
      (!data.ahsp_analyses || data.ahsp_analyses.length === 0)) {
    for (const c of data.classifications) {
      db.run("INSERT OR IGNORE INTO ahsp_analyses (code, classification_code, description, overhead_factor, source_title) VALUES (?, ?, ?, 0.10, ?)",
        [c.code, c.code, c.description, sourceTitle]);
    }
  }
}

// Get classification overrides for a project
app.get('/api/projects/:projectId/classification-overrides', (req, res) => {
  try {
    const rows = db.query("SELECT * FROM classification_overrides WHERE project_id = ?", [req.params.projectId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Set manual classification override
app.post('/api/projects/:projectId/elements/:elementId/classification', (req, res) => {
  const { projectId, elementId } = req.params;
  const { classificationCode } = req.body;
  
  if (!classificationCode) {
    try {
      db.run("DELETE FROM classification_overrides WHERE project_id = ? AND element_id = ?", [projectId, elementId]);
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  try {
    db.run(`
      INSERT OR REPLACE INTO classification_overrides (project_id, element_id, classification_code)
      VALUES (?, ?, ?)
    `, [projectId, elementId, classificationCode]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear manual classification override
app.delete('/api/projects/:projectId/elements/:elementId/classification', (req, res) => {
  const { projectId, elementId } = req.params;
  try {
    db.run("DELETE FROM classification_overrides WHERE project_id = ? AND element_id = ?", [projectId, elementId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Set manual IFC type override/correction
app.post('/api/projects/:projectId/elements/:elementId/ifc-type-override', (req, res) => {
  const { projectId, elementId } = req.params;
  const { ifcTypeOverride } = req.body;
  try {
    db.run("UPDATE ifc_elements SET ifc_type_override = ? WHERE id = ? AND project_id = ?",
      [ifcTypeOverride || null, elementId, projectId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Equipment Templates ---
app.get('/api/equipment/export', (req, res) => {
  try {
    const rows = db.query("SELECT * FROM resources WHERE category = 'Equipment'");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/equipment/import', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
  try {
    db.transaction(() => {
      for (const item of items) {
        db.run("INSERT OR REPLACE INTO resources (id, category, description, unit) VALUES (?, 'Equipment', ?, ?)",
          [item.id, item.description || item.name || '', item.unit || '']);
      }
    });
    res.json({ success: true, count: items.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Labor Templates ---
app.get('/api/labor/export', (req, res) => {
  try {
    const rows = db.query("SELECT * FROM resources WHERE category = 'Labor'");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/labor/import', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
  try {
    db.transaction(() => {
      for (const item of items) {
        db.run("INSERT OR REPLACE INTO resources (id, category, description, unit) VALUES (?, 'Labor', ?, ?)",
          [item.id, item.description || item.name || '', item.unit || '']);
      }
    });
    res.json({ success: true, count: items.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Materials Templates ---
app.get('/api/materials/export', (req, res) => {
  try {
    const rows = db.query("SELECT * FROM resources WHERE category = 'Material'");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/materials/import', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
  try {
    db.transaction(() => {
      for (const item of items) {
        db.run("INSERT OR REPLACE INTO resources (id, category, description, unit) VALUES (?, 'Material', ?, ?)",
          [item.id, item.description || item.name || '', item.unit || '']);
      }
    });
    res.json({ success: true, count: items.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Resources Templates ---
app.get('/api/resources/export', (req, res) => {
  try {
    const rows = db.query("SELECT * FROM resources");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/resources/import', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
  try {
    db.transaction(() => {
      for (const item of items) {
        db.run("INSERT OR REPLACE INTO resources (id, category, description, unit) VALUES (?, ?, ?, ?)",
          [item.id, item.category || 'Material', item.description || item.name || '', item.unit || '']);
      }
    });
    res.json({ success: true, count: items.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Price Templates ---
app.get('/api/prices/export', (req, res) => {
  try {
    const rows = db.query("SELECT * FROM resource_prices");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/prices/import', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
  try {
    db.transaction(() => {
      for (const item of items) {
        // Ensure resource placeholder exists
        db.run("INSERT OR IGNORE INTO resources (id, category, description, unit) VALUES (?, 'Material', ?, '')",
          [item.resource_id, `Placeholder resource ${item.resource_id}`]);
        db.run("INSERT OR REPLACE INTO resource_prices (id, resource_id, region_id, price, effective_date) VALUES (?, ?, ?, ?, ?)",
          [item.id, item.resource_id, item.region_id, item.price, item.effective_date || '2026-07-25']);
      }
    });
    res.json({ success: true, count: items.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- AHSP Formulas (analyses & details) ---
app.get('/api/analyses/export', (req, res) => {
  try {
    const ahsp_analyses = db.query("SELECT * FROM ahsp_analyses");
    const ahsp_details = db.query("SELECT * FROM ahsp_details");
    res.json({ ahsp_analyses, ahsp_details });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/analyses/import', (req, res) => {
  const data = req.body;
  try {
    db.transaction(() => {
      if (data.ahsp_analyses && Array.isArray(data.ahsp_analyses)) {
        for (const a of data.ahsp_analyses) {
          // Ensure classification exists
          db.run("INSERT OR IGNORE INTO classifications (code, description, unit, category) VALUES (?, ?, 'pcs', 'General')",
            [a.classification_code, a.description || `Classification ${a.classification_code}`]);
          db.run("INSERT OR REPLACE INTO ahsp_analyses (code, classification_code, description, overhead_factor) VALUES (?, ?, ?, ?)",
            [a.code, a.classification_code, a.description, a.overhead_factor || 0.10]);
        }
      }
      if (data.ahsp_details && Array.isArray(data.ahsp_details)) {
        for (const d of data.ahsp_details) {
          db.run("INSERT OR IGNORE INTO resources (id, category, description, unit) VALUES (?, 'Material', ?, '')",
            [d.resource_id, `Placeholder resource ${d.resource_id}`]);
          db.run("INSERT OR IGNORE INTO ahsp_analyses (code, classification_code, description, overhead_factor) VALUES (?, ?, 'Placeholder Analysis', 0.10)",
            [d.ahsp_code, d.ahsp_code]);
          db.run("INSERT OR REPLACE INTO ahsp_details (id, ahsp_code, resource_id, coefficient, waste_factor) VALUES (?, ?, ?, ?, ?)",
            [d.id, d.ahsp_code, d.resource_id, d.coefficient, d.waste_factor || 1.0]);
        }
      }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Metadata Templates ---
app.get('/api/metadata/export', (req, res) => {
  try {
    const rows = db.query("SELECT * FROM catalog_metadata");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/metadata/import', (req, res) => {
  const items = req.body;
  const itemsArray = Array.isArray(items) ? items : [items];
  try {
    db.transaction(() => {
      for (const item of itemsArray) {
        db.run("INSERT OR REPLACE INTO catalog_metadata (id, name, version, region, author) VALUES (?, ?, ?, ?, ?)",
          [item.id || `meta-${Date.now()}`, item.name || 'Unnamed Catalog', item.version || '1.0', item.region || '', item.author || '']);
      }
    });
    res.json({ success: true, count: itemsArray.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Validation Report ---
app.get('/api/validation/export', (req, res) => {
  try {
    // Generate audit details
    const orphanDetails = db.query(`
      SELECT d.* FROM ahsp_details d 
      LEFT JOIN resources r ON d.resource_id = r.id 
      WHERE r.id IS NULL
    `);
    const orphanAnalyses = db.query(`
      SELECT d.* FROM ahsp_details d
      LEFT JOIN ahsp_analyses a ON d.ahsp_code = a.code
      WHERE a.code IS NULL
    `);
    const missingPrices = db.query(`
      SELECT r.id, r.description FROM resources r
      LEFT JOIN resource_prices p ON r.id = p.resource_id
      WHERE p.price IS NULL OR p.price = 0
    `);

    const audit = {
      orphan_details_count: orphanDetails.length,
      orphan_analyses_count: orphanAnalyses.length,
      missing_prices_count: missingPrices.length,
      timestamp: new Date().toISOString()
    };

    // Save report to DB
    const reportId = `report-${Date.now()}`;
    const reportName = `Validation Audit Log - ${new Date().toLocaleDateString()}`;
    const issuesCount = orphanDetails.length + orphanAnalyses.length + missingPrices.length;
    const details = JSON.stringify({ orphanDetails, orphanAnalyses, missingPrices }, null, 2);

    db.run("INSERT OR REPLACE INTO validation_reports (id, name, issues_count, details) VALUES (?, ?, ?, ?)",
      [reportId, reportName, issuesCount, details]);

    const reports = db.query("SELECT * FROM validation_reports");
    res.json({ reports, audit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/validation/import', (req, res) => {
  const data = req.body;
  const reportsArray = Array.isArray(data) ? data : (data.reports ? data.reports : [data]);
  try {
    db.transaction(() => {
      for (const r of reportsArray) {
        db.run("INSERT OR REPLACE INTO validation_reports (id, name, issues_count, details) VALUES (?, ?, ?, ?)",
          [r.id || `report-${Date.now()}`, r.name || 'Imported Validation Report', r.issues_count || 0, typeof r.details === 'string' ? r.details : JSON.stringify(r.details || {})]);
      }
    });
    res.json({ success: true, count: reportsArray.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Express backend running at http://localhost:${PORT}`);
});


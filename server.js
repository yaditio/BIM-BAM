import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
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
  const converterScript = path.join(__dirname, 'node_modules', '@xeokit', 'xeokit-convert', 'convert2xkt.js');

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

app.listen(PORT, () => {
  console.log(`[Server] Express backend running at http://localhost:${PORT}`);
});

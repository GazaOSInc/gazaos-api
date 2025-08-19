const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Metadata file
const META_FILE = path.join(__dirname, 'metadata.json');

// Initialize metadata file if doesn't exist
if (!fs.existsSync(META_FILE)) fs.writeFileSync(META_FILE, JSON.stringify([]));

// Helper to read metadata
const readMetadata = () => JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));

// Helper to write metadata
const writeMetadata = (data) => fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2));

// "/" endpoint: list uploaded files
app.get('/', (req, res) => {
    const files = readMetadata();
    let html = `<h1>Uploaded Files</h1><ul>`;
    files.forEach(file => {
        html += `<li>KB#${file.kb}: <strong>${file.name}</strong> (${file.originalFileName}) - ${file.description} [${file.tag}]</li>`;
    });
    html += `</ul><a href="/upload">Upload New File</a>`;
    res.send(html);
});

// "/upload" endpoint: auto-generate HTML form
app.get('/upload', (req, res) => {
    const html = `
    <h1>Upload File</h1>
    <form action="/upload" method="POST" enctype="multipart/form-data">
        <label>Select File: <input type="file" name="file" required></label><br><br>
        <label>File Name: <input type="text" name="name" required></label><br><br>
        <label>Description: <input type="text" name="description"></label><br><br>
        <label>Tag: <input type="text" name="tag"></label><br><br>
        <button type="submit">Upload</button>
    </form>
    <br>
    <a href="/">Back to List</a>
    `;
    res.send(html);
});

// Handle upload
app.post('/upload', upload.single('file'), (req, res) => {
    const { name, description, tag } = req.body;
    const originalFileName = req.file.originalname;
    const metadata = readMetadata();
    const kb = metadata.length > 0 ? metadata[metadata.length - 1].kb + 1 : 1;

    metadata.push({
        kb,
        name,
        description,
        tag,
        originalFileName,
        filePath: req.file.filename,
        uploadTime: new Date()
    });

    writeMetadata(metadata);

    res.send(`<p>File uploaded successfully as KB#${kb}!</p><a href="/">Back to List</a>`);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

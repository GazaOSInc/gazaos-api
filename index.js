// -------------------- Load environment variables --------------------
require('dotenv').config();

// -------------------- Imports --------------------
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const { MongoClient, ObjectId } = require('mongodb');
const http = require('http');
const { Server } = require('socket.io');

// -------------------- App and Config --------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cookieParser());

const UPLOAD_DIR = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const IMAGE_DIR = path.join(__dirname, process.env.IMAGE_DIR || 'images');
if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR);

app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/images', express.static(IMAGE_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

function getSessionId(req, res) {
  let sid = req.cookies['sid'];
  if (!sid) { sid = uuidv4(); res.cookie('sid', sid); }
  return sid;
}

// -------------------- Basic Auth for Upload --------------------
const UPLOAD_USER = process.env.UPLOAD_USER || 'admin';
const UPLOAD_PASS = process.env.UPLOAD_PASS || 'password123';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Upload Area"');
    return res.status(401).send('Authentication required.');
  }
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  if (username === UPLOAD_USER && password === UPLOAD_PASS) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Upload Area"');
  return res.status(401).send('Invalid credentials.');
}

// -------------------- MongoDB Setup --------------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://catalog:catalog2@cluster0.wrnofgi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const MONGO_DB = process.env.MONGO_DB || 'update_catalog';
let db, metaCollection, basketCollection;

MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then(async client => {
    db = client.db(MONGO_DB);
    metaCollection = db.collection('metadata');
    basketCollection = db.collection('baskets');
    console.log('Connected to MongoDB');

    // Restore baskets on server start
    const allBaskets = await basketCollection.find({}).toArray();
    for (const b of allBaskets) {
      serverBaskets[b.sid] = b.items || [];
    }
  })
  .catch(err => console.error('MongoDB connection error:', err));

// -------------------- In-memory basket cache --------------------
const serverBaskets = {};

// -------------------- Metadata helpers --------------------
async function readMetadata() {
  return metaCollection ? await metaCollection.find({}).toArray() : [];
}

async function addMetadata(entry) {
  if (metaCollection) await metaCollection.insertOne(entry);
}

const JSON_FILE = path.join(__dirname, 'metadata.json');
async function saveMetadataJSON(entry) {
  let data = [];
  if (fs.existsSync(JSON_FILE)) data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  data.push(entry);
  fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// -------------------- Escape RegExp --------------------
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// -------------------- Catalog Page --------------------
app.get('/', (req, res) => {
  const ua = req.headers['user-agent'];
  const isIE = ua.indexOf('MSIE') !== -1 || ua.indexOf('Trident') !== -1;
  getSessionId(req, res);

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Update Catalog</title>
<style>
body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;background:#f4f4f4;margin:0;padding:0;}
header{background:#0078d7;color:#fff;padding:10px 20px;font-size:22px;font-weight:bold;display:flex;justify-content:space-between;align-items:center;}
.container{padding:20px;overflow-x:auto;}
.top-links{margin-bottom:15px;}
a{text-decoration:none;color:#0078d7;}a:hover{text-decoration:underline;}
table{width:100%;border-collapse:collapse;background:#fff;font-size:14px;table-layout:fixed;}
th,td{padding:8px 12px;border:1px solid #ccc;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;position:relative;}
th{background:#f3f3f3;color:#333;font-weight:normal;cursor:pointer;user-select:none;}
tr:nth-child(even){background:#fafafa;}
tr:hover{background:#ddeeff;}
tr.selected{background:#cce5ff !important;}
.highlight{background-color:yellow;}
.pagination{margin-top:10px;text-align:center;}
.pagination button{padding:4px 8px;margin:0 2px;border:1px solid #ccc;background:#f3f3f3;cursor:pointer;border-radius:2px;}
.pagination button:hover, .pagination button:focus{background:#e0e0e0; outline:2px solid #0078d7;}
th .resizer{position:absolute;right:0;top:0;width:5px;height:100%;cursor:col-resize;user-select:none;}
th:focus{outline:2px solid #0078d7;}
#basketIcon{font-size:18px;margin-left:10px;cursor:pointer;}
#basketIcon span{background:red;color:white;border-radius:50%;padding:2px 6px;margin-left:5px;}
</style>
</head>
<body>
<header>
<span>Microsoft Update Catalog</span>
<span id="ieBasketHeader" style="${!isIE?'display:none':''}">🧺 Basket: <span id="basketCount">0</span> 
<button onclick="downloadBasketClient()" title="Download selected updates">⬇️</button>
<button onclick="viewBasket()" title="View basket contents">👁️</button>
</span>
</header>
<div class="container">
<div class="top-links"><a href="/upload">Upload New File</a></div>

<table id="fileTable" role="grid" aria-label="Update Catalog Table" tabindex="0">
<thead>
<tr role="row">
<th role="columnheader" tabindex="0" aria-sort="none">KB Number<div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">File Name<div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">Original File Name<div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">Description<div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">Tag<div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">Upload Date<div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">Download<div class="resizer"></div></th>
<script>
const ua = navigator.userAgent;
const isIE = ua.indexOf('MSIE') !== -1 || ua.indexOf('Trident/') !== -1;
if(isIE){
  document.write('<th role="columnheader" tabindex="0" aria-sort="none">Basket<div class="resizer"></div></th>');
}
</script>
</tr>
</thead>
<tbody></tbody>
</table>
<div class="pagination" id="pagination" role="navigation" aria-label="Pagination"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let currentPage=1, rowsPerPage=10;
let filters = {};
let selectedRows = new Set();

const table = document.getElementById('fileTable');
let startX, startWidth, resizerTh;
table.querySelectorAll('th .resizer').forEach(resizer=>{
  resizer.addEventListener('mousedown',function(e){
    resizerTh = e.target.parentElement;
    startX = e.pageX;
    startWidth = resizerTh.offsetWidth;
    document.addEventListener('mousemove',resizeColumn);
    document.addEventListener('mouseup',stopResize);
  });
});
function resizeColumn(e){ const width = startWidth + (e.pageX - startX); if(width>30) resizerTh.style.width = width + 'px'; }
function stopResize(){ document.removeEventListener('mousemove',resizeColumn); document.removeEventListener('mouseup',stopResize); }

// -------------------- Basket Functions --------------------
async function fetchServerBasket(){ return fetch('/api/basket').then(r=>r.json()); }
async function updateServerBasket(kb,add){ return fetch('/api/basket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kb,add})}); }

async function initHybridBasket(){
  let localBasket = localStorage.getItem('ieBasket'); 
  localBasket = localBasket?localBasket.split(",").map(Number):[];
  const serverBasket = await fetchServerBasket();
  const mergedBasket = Array.from(new Set([...localBasket,...serverBasket]));
  localStorage.setItem('ieBasket',mergedBasket.join(","));
  for(const kb of mergedBasket) await updateServerBasket(kb,true);
  mergedBasket.forEach(kb=>selectedRows.add(kb));
  updateBasketCount();
}

function toggleHybridBasket(kb,checkbox){
  if(checkbox.checked) selectedRows.add(kb); else selectedRows.delete(kb);
  let basket=localStorage.getItem('ieBasket'); basket=basket?basket.split(",").map(Number):[];
  if(checkbox.checked){ if(!basket.includes(kb)) basket.push(kb); updateServerBasket(kb,true);}
  else{ const idx=basket.indexOf(kb); if(idx!==-1) basket.splice(idx,1); updateServerBasket(kb,false);}
  localStorage.setItem('ieBasket',basket.join(","));
  updateBasketCount(); highlightRows();
  socket.emit('basketUpdate', Array.from(selectedRows)); // real-time
}

function updateBasketCount(){ 
  const basketCountElem = document.getElementById('basketCount');
  if (basketCountElem) basketCountElem.innerHTML = selectedRows.size;
  basketCountElem?.setAttribute('aria-label','Basket contains '+selectedRows.size+' items');
}

function highlightRows(){
  document.querySelectorAll('#fileTable tbody tr').forEach(tr=>{
    const cb = tr.querySelector('input[type="checkbox"]');
    const kb = parseInt(cb?.getAttribute('data-kb'));
    if(selectedRows.has(kb)){ tr.classList.add('selected'); cb.checked=true; tr.setAttribute('aria-selected','true'); }
    else{ tr.classList.remove('selected'); cb.checked=false; tr.setAttribute('aria-selected','false'); }
  });
}

function viewBasket(){
  if(selectedRows.size===0){alert('Basket empty'); return;}
  let msg = "Basket contains:\\n";
  selectedRows.forEach(kb=>{
    const link=document.getElementById('kbLink'+kb);
    if(link) msg+=link.textContent+"\\n";
  });
  alert(msg);
}

async function downloadBasketClient(){
  if(selectedRows.size===0){ alert('Basket empty'); return; }
  const zip = new JSZip();
  const promises = [];
  selectedRows.forEach(kb=>{
    const link=document.getElementById('kbLink'+kb);
    if(link){
      const url = link.href;
      promises.push(fetch(url).then(r=>r.blob()).then(blob=>zip.file(link.textContent,blob)));
    }
  });
  Promise.all(promises).then(()=>{
    zip.generateAsync({type:'blob'}).then(content=>{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(content);
      a.download='basket.zip';
      a.click();
    });
  });
}

// -------------------- Real-time Basket Updates --------------------
socket.on('basketUpdate', (basketArray) => {
  selectedRows = new Set(basketArray);
  localStorage.setItem('ieBasket', Array.from(selectedRows).join(","));
  highlightRows();
  updateBasketCount();
});

function highlightText(text){ 
  let result = text;
  for(const col in filters){ 
    const term = filters[col];
    if(term){ const re = new RegExp(escapeRegExp(term),'gi'); result = result.replace(re,m=>'<span class="highlight">'+m+'</span>'); }
  }
  return result;
}

async function fetchTable(){
  const params=new URLSearchParams({page:currentPage,limit:rowsPerPage});
  const res=await fetch('/api/list-update?'+params); 
  const data=await res.json();
  const tbody=document.querySelector('#fileTable tbody'); tbody.innerHTML='';
  data.data.forEach(f=>{
    const tr=document.createElement('tr'); tr.setAttribute('role','row');
    tr.innerHTML=\`
      <td role="gridcell">\${highlightText('KB#'+f.kb)}</td>
      <td role="gridcell">\${highlightText(f.name || '')}</td>
      <td role="gridcell">\${highlightText(f.originalFileName || '')}</td>
      <td role="gridcell">\${highlightText(f.description || '-')}</td>
      <td role="gridcell">\${highlightText(f.tag || '-')}</td>
      <td role="gridcell">\${new Date(f.uploadTime).toLocaleString()}</td>
      <td role="gridcell"><a id="kbLink\${f.kb}" href="/uploads/\${f.filePath}" download>\${f.name}</a></td>
      <td role="gridcell"><input type="checkbox" data-kb="\${f.kb}" onchange="toggleHybridBasket(\${f.kb},this)" tabindex="0" aria-label="Add KB\${f.kb} to basket"></td>
    \`;
    tbody.appendChild(tr);
  });
  highlightRows(); updateBasketCount();
}

function renderPagination(totalPages){
  const container=document.getElementById('pagination'); container.innerHTML='';
  for(let i=1;i<=totalPages;i++){
    const btn=document.createElement('button'); 
    btn.textContent=i; btn.tabIndex=0;
    btn.setAttribute('aria-label','Go to page '+i);
    if(i===currentPage) btn.setAttribute('aria-current','page');
    btn.onclick=()=>{currentPage=i; fetchTable();};
    btn.onkeydown=(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); currentPage=i; fetchTable(); } };
    if(i===currentPage) btn.style.fontWeight='bold';
    container.appendChild(btn);
  }
}

window.onload=function(){ initHybridBasket().then(()=>fetchTable()); };
</script>
</div></body></html>`;
  res.send(html);
});

// -------------------- Upload Page --------------------
app.get('/upload', authMiddleware, (req,res)=>{
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Upload File</title></head><body>
<form id="uploadForm" enctype="multipart/form-data">
<label>KB Number<input type="number" name="kb" required></label>
<label>File<input type="file" name="file" required></label>
<label>Description<input type="text" name="description"></label>
<label>Tag<input type="text" name="tag"></label>
<button type="submit">Upload</button></form>
<script>
document.getElementById('uploadForm').addEventListener('submit',function(e){
e.preventDefault();
const fd=new FormData(this);
fetch('/upload',{method:'POST',body:fd}).then(r=>r.text()).then(alert);
});
</script></body></html>`);
});

// -------------------- Upload POST with Deny List --------------------
app.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { kb, description, tag } = req.body;
    const file = req.file;
    if (!file) return res.status(400).send('No file uploaded');

    const denyExtensions = [
      '.jpg','.jpeg','.png','.gif','.webp','.bmp','.tiff','.ico',
      '.mp4','.mp3','.avi','.mkv','.mov','.wav','.flac',
      '.doc','.docx','.xls','.xlsx','.ppt','.pptx','.pdf','.txt',
      '.js','.ts','.py','.c','.cpp','.cs','.java','.rb','.sh','.bat','.ps1',
      '.json','.lock','.env','.yml','.yaml'
    ];

    const denyMimeTypes = [
      'image/jpeg','image/png','image/gif','image/webp','image/bmp','image/tiff','image/x-icon',
      'video/mp4','video/avi','video/x-matroska','video/quicktime',
      'audio/mpeg','audio/mp3','audio/wav','audio/flac',
      'application/pdf','application/msword','application/vnd.ms-excel',
      'application/vnd.ms-powerpoint','text/plain','application/json',
      'application/x-msdownload','application/javascript','text/x-python'
    ];

    const fileExt = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype;

    if (denyExtensions.includes(fileExt) || denyMimeTypes.includes(mimeType)) {
      fs.unlinkSync(file.path);
      return res.status(403).send('Upload denied: file type not allowed.');
    }

    const metadataEntry = {
      kb: parseInt(kb),
      name: file.originalname,
      originalFileName: file.originalname,
      description: description || '',
      tag: tag || '',
      filePath: file.filename,
      uploadTime: new Date()
    };

    await addMetadata(metadataEntry);
    await saveMetadataJSON(metadataEntry);

    res.send('File uploaded successfully.');
  } catch(err){ console.error(err); res.status(500).send('Upload error'); }
});

// -------------------- API: List Updates --------------------
app.get('/api/list-update', async (req,res)=>{
  const page=parseInt(req.query.page)||1;
  const limit=parseInt(req.query.limit)||10;
  const allData=await readMetadata();
  const totalPages=Math.ceil(allData.length/limit);
  const data=allData.slice((page-1)*limit,page*limit);
  res.json({data,totalPages});
});

// -------------------- API: Basket --------------------
app.get('/api/basket', async (req,res)=>{
  const sid = getSessionId(req,res);
  let items = serverBaskets[sid] || [];
  res.json(items);
});

app.post('/api/basket', async (req,res)=>{
  const sid = getSessionId(req,res);
  const { kb, add } = req.body;
  if (!serverBaskets[sid]) serverBaskets[sid] = [];
  if (add && !serverBaskets[sid].includes(kb)) serverBaskets[sid].push(kb);
  if (!add) serverBaskets[sid] = serverBaskets[sid].filter(k=>k!==kb);

  // Persist to MongoDB automatically
  if (basketCollection) {
    await basketCollection.updateOne(
      { sid },
      { $set: { items: serverBaskets[sid] } },
      { upsert: true }
    );
  }

  // Notify all sockets about updated basket for this session
  io.emit('basketUpdate', serverBaskets[sid]);

  res.json({basket: serverBaskets[sid]});
});

// -------------------- Socket.IO Connection --------------------
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('basketUpdate', (basketArray) => {
    // Broadcast to all other clients
    socket.broadcast.emit('basketUpdate', basketArray);
  });

  socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
});

// -------------------- Start Server --------------------
server.listen(PORT,()=>console.log(`Catalog server running on port ${PORT}`));

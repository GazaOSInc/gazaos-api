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
const { MongoClient } = require('mongodb');

// -------------------- App and Config --------------------
const app = express();
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

const serverBaskets = {};
function getSessionId(req, res) {
  let sid = req.cookies['sid'];
  if (!sid) { sid = uuidv4(); res.cookie('sid', sid); }
  if (!serverBaskets[sid]) serverBaskets[sid] = [];
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

  if (username === UPLOAD_USER && password === UPLOAD_PASS) {
    return next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Upload Area"');
    return res.status(401).send('Invalid credentials.');
  }
}

// -------------------- MongoDB Setup --------------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB = process.env.MONGO_DB || 'update_catalog';
let db, metaCollection;

MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then(client => {
    db = client.db(MONGO_DB);
    metaCollection = db.collection('metadata');
    console.log('Connected to MongoDB');
  })
  .catch(err => console.error('MongoDB connection error:', err));

async function readMetadata() {
  return await metaCollection.find({}).toArray();
}

async function addMetadata(entry) {
  await metaCollection.insertOne(entry);
}

// -------------------- JSON Backup --------------------
const JSON_FILE = path.join(__dirname, 'metadata.json');
async function saveMetadataJSON(entry) {
  let data = [];
  if (fs.existsSync(JSON_FILE)) {
    data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  }
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
header{background:#0078d7;color:#fff;padding:10px 20px;font-size:22px;font-weight:bold;}
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
#basketContainer{margin-top:10px;text-align:left;}
#basketContainer img{cursor:pointer;width:32px;height:32px;vertical-align:middle;}
#basketCount{font-weight:bold;color:#fff;margin-left:5px;}
.pagination{margin-top:10px;text-align:center;}
.pagination button{padding:4px 8px;margin:0 2px;border:1px solid #ccc;background:#f3f3f3;cursor:pointer;border-radius:2px;}
.pagination button:hover, .pagination button:focus{background:#e0e0e0; outline:2px solid #0078d7;}
#basketControls button{padding:4px 8px;margin-right:5px;border:1px solid #ccc;background:#f3f3f3;cursor:pointer;border-radius:2px;}
#basketControls button:hover, #basketControls button:focus{background:#e0e0e0;outline:2px solid #0078d7;}
input.filterInput{width:90%;padding:4px;margin:2px;border:1px solid #ccc;border-radius:2px;box-sizing:border-box;}
th .resizer{position:absolute;right:0;top:0;width:5px;height:100%;cursor:col-resize;user-select:none;}
th:focus{outline:2px solid #0078d7;}
</style>
</head>
<body>
<header>Microsoft Update Catalog</header>
<div class="container">
<div class="top-links"><a href="/upload">Upload New File</a></div>
<div id="basketContainer">
<img src="/images/decor_Basket.jpg" title="View Basket" onclick="viewBasket()" tabindex="0" aria-label="View Basket"/>
<span id="basketCount" aria-live="polite">0</span>
<button onclick="downloadBasket()" tabindex="0" aria-label="Download Basket">Download Basket</button>
</div>
<div id="basketControls" style="margin:10px 0;">
<button onclick="selectAllBasket()" tabindex="0" aria-label="Select All in Basket">Select All</button>
<button onclick="deselectAllBasket()" tabindex="0" aria-label="Deselect All in Basket">Deselect All</button>
</div>

<table id="fileTable" role="grid" aria-label="Update Catalog Table" tabindex="0">
<thead><tr role="row">
<th role="columnheader" tabindex="0" aria-sort="none">KB Number<br><input class="filterInput" data-col="kb" placeholder="Filter KB" aria-label="Filter KB"><div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">File Name<br><input class="filterInput" data-col="name" placeholder="Filter Name" aria-label="Filter Name"><div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">Original File Name<br><input class="filterInput" data-col="originalFileName" placeholder="Filter Original" aria-label="Filter Original"><div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">Description<br><input class="filterInput" data-col="description" placeholder="Filter Description" aria-label="Filter Description"><div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">Tag<br><input class="filterInput" data-col="tag" placeholder="Filter Tag" aria-label="Filter Tag"><div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">Upload Date<br><input class="filterInput" data-col="uploadTime" placeholder="Filter Date" aria-label="Filter Upload Date"><div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">Download<div class="resizer"></div></th>
<th role="columnheader" tabindex="0" aria-sort="none">Basket<div class="resizer"></div></th>
</tr></thead>
<tbody></tbody>
</table>
<div class="pagination" id="pagination" role="navigation" aria-label="Pagination"></div>

<script>
// -------------------- JS for Table, Basket, Keyboard & ARIA --------------------
const isIE=navigator.userAgent.indexOf("MSIE")!==-1||navigator.userAgent.indexOf("Trident")!==-1;
let currentPage=1, rowsPerPage=10;
let sortOrders=[]; 
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

async function fetchServerBasket(){ return fetch('/api/basket').then(r=>r.json()); }
async function updateServerBasket(kb,add){ return fetch('/api/basket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kb,add})}); }
async function initHybridBasket(){ 
  if(!isIE) return;
  let localBasket=localStorage.getItem('ieBasket'); localBasket = localBasket?localBasket.split(",").map(Number):[];
  const serverBasket = await fetchServerBasket();
  const mergedBasket = Array.from(new Set([...localBasket,...serverBasket]));
  localStorage.setItem('ieBasket',mergedBasket.join(","));
  for(const kb of mergedBasket) await updateServerBasket(kb,true);
  mergedBasket.forEach(kb=>selectedRows.add(kb));
}

function highlightText(text){ 
  let result = text;
  for(const col in filters){ 
    const term = filters[col];
    if(term){ const re = new RegExp(escapeRegExp(term),'gi'); result = result.replace(re,m=>'<span class="highlight">'+m+'</span>'); }
  }
  return result;
}

function toggleHybridBasket(kb,checkbox){
  if(checkbox.checked) selectedRows.add(kb); else selectedRows.delete(kb);
  if(isIE){
    let basket=localStorage.getItem('ieBasket'); basket=basket?basket.split(",").map(Number):[];
    if(checkbox.checked){ if(!basket.includes(kb)) basket.push(kb); updateServerBasket(kb,true);}
    else{ const idx=basket.indexOf(kb); if(idx!==-1) basket.splice(idx,1); updateServerBasket(kb,false);}
    localStorage.setItem('ieBasket',basket.join(","));}
  else { updateServerBasket(kb,checkbox.checked); }
  updateBasketCount();
  highlightRows();
}

async function updateBasketCount(){ 
  document.getElementById('basketCount').innerHTML = selectedRows.size; 
  document.getElementById('basketCount').setAttribute('aria-label','Basket contains '+selectedRows.size+' items');
}
function highlightRows(){
  document.querySelectorAll('#fileTable tbody tr').forEach(tr=>{
    const kb = parseInt(tr.querySelector('input[type="checkbox"]').getAttribute('data-kb'));
    if(selectedRows.has(kb)){ tr.classList.add('selected'); tr.querySelector('input[type="checkbox"]').checked=true; tr.setAttribute('aria-selected','true'); }
    else{ tr.classList.remove('selected'); tr.querySelector('input[type="checkbox"]').checked=false; tr.setAttribute('aria-selected','false'); }
  });
}

function viewBasket(){
  if(selectedRows.size===0){alert('Basket empty'); return;}
  let msg = "Basket contains:\\n";
  selectedRows.forEach(kb=>{ const link=document.getElementById('kbLink'+kb); if(link) msg+=link.textContent+"\\n"; });
  alert(msg);
}

function downloadBasket(){
  if(selectedRows.size===0){alert('Basket empty'); return;}
  selectedRows.forEach(kb=>{ const link=document.getElementById('kbLink'+kb); if(link) window.open(link.href,'_blank'); });
}

function selectAllBasket(){ document.querySelectorAll('#fileTable tbody input[type="checkbox"]').forEach(cb=>{ cb.checked=true; cb.onchange(); }); }
function deselectAllBasket(){ document.querySelectorAll('#fileTable tbody input[type="checkbox"]').forEach(cb=>{ cb.checked=false; cb.onchange(); }); }

async function fetchTable(){
  const params=new URLSearchParams({page:currentPage,limit:rowsPerPage});
  for(let i=0;i<sortOrders.length;i++){ params.append('sort'+i,sortOrders[i].col); params.append('dir'+i,sortOrders[i].dir); }
  for(const col in filters){ params.append('filter_'+col,filters[col]||''); }
  const res=await fetch('/api/list-update?'+params); 
  const data=await res.json();
  const tbody=document.querySelector('#fileTable tbody'); tbody.innerHTML='';
  data.data.forEach(f=>{
    const tr=document.createElement('tr'); tr.setAttribute('role','row');
    tr.innerHTML=\`
    <td role="gridcell">\${highlightText('KB#'+f.kb)}</td>
    <td role="gridcell">\${highlightText(f.name)}</td>
    <td role="gridcell">\${highlightText(f.originalFileName)}</td>
    <td role="gridcell">\${highlightText(f.description||'-')}</td>
    <td role="gridcell">\${highlightText(f.tag||'-')}</td>
    <td role="gridcell">\${new Date(f.uploadTime).toLocaleString()}</td>
    <td role="gridcell"><a id="kbLink\${f.kb}" href="/uploads/\${f.filePath}" download>Download</a></td>
    <td role="gridcell"><input type="checkbox" data-kb="\${f.kb}" onchange="toggleHybridBasket(\${f.kb},this)" tabindex="0" aria-label="Add KB\${f.kb} to basket"></td>\`;
    tbody.appendChild(tr);
  });
  highlightRows();
  updateBasketCount();
  renderPagination(data.totalPages);
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

function addSort(col){
  const existing = sortOrders.find(o=>o.col===col);
  if(existing){ existing.dir = existing.dir==='asc'?'desc':'asc'; }
  else{ sortOrders.push({col:col,dir:'asc'}); }
  document.querySelectorAll('th').forEach(th=>{
    const input = th.querySelector('input'); 
    if(input?.dataset.col===col){ th.setAttribute('aria-sort',existing?existing.dir:'asc'); } 
    else{ th.setAttribute('aria-sort','none'); }
  });
  fetchTable();
}

document.querySelectorAll('th').forEach(th=>{
  th.addEventListener('click',()=>{ const col = th.querySelector('input')?.dataset.col; if(col) addSort(col); });
  th.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); const col = th.querySelector('input')?.dataset.col; if(col) addSort(col); } });
});
document.querySelectorAll('.filterInput').forEach(input=>{
  input.addEventListener('input',()=>{ filters[input.dataset.col] = input.value; currentPage=1; fetchTable(); });
});

window.onload=function(){ initHybridBasket().then(()=>fetchTable()); };
</script>
</div></body></html>`;
  res.send(html);
});

// -------------------- Upload Page (with progress bar & AJAX) --------------------
app.get('/upload', authMiddleware, (req,res)=>{
  res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Upload File</title>
<style>
body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;padding:20px;background:#f4f4f4;}
form{background:#fff;padding:20px;border:1px solid #ccc;width:400px;margin:auto;border-radius:4px;position:relative;}
label{display:block;margin:10px 0 5px;}
input,button{width:100%;padding:8px;margin-bottom:10px;border:1px solid #ccc;border-radius:2px;}
button{background:#0078d7;color:#fff;border:none;cursor:pointer;}
button:hover{background:#005a9e;}
a{display:block;margin-top:10px;text-align:center;color:#0078d7;text-decoration:none;}
#progressContainer{margin-top:10px;background:#eee;border-radius:4px;overflow:hidden;display:none;}
#progressBar{height:20px;background:#0078d7;width:0%;text-align:center;color:#fff;line-height:20px;}
</style>
</head>
<body>
<h1 style="text-align:center;">Upload File</h1>
<form id="uploadForm" aria-label="Upload Form" action="/upload" method="post" enctype="multipart/form-data">
<label for="fileInput">Select File:</label>
<input type="file" id="fileInput" name="file" required aria-required="true">
<label for="nameInput">Name:</label>
<input type="text" id="nameInput" name="name" required aria-required="true">
<label for="descInput">Description:</label>
<input type="text" id="descInput" name="description">
<label for="tagInput">Tag:</label>
<input type="text" id="tagInput" name="tag">
<button type="submit">Upload</button>
<div id="progressContainer"><div id="progressBar">0%</div></div>
</form>
<a href="/">Back to Catalog</a>
<script>
const form = document.getElementById('uploadForm');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const file = document.getElementById('fileInput').files[0];
  if(!file) return alert('Select a file.');
  const formData = new FormData(form);
  progressContainer.style.display='block';
  const xhr = new XMLHttpRequest();
  xhr.open('POST','/upload');
  xhr.upload.onprogress = (event)=>{
    if(event.lengthComputable){
      const percent = Math.round((event.loaded/event.total)*100);
      progressBar.style.width = percent + '%';
      progressBar.textContent = percent + '%';
    }
  };
  xhr.onload = ()=>{ if(xhr.status===200){ alert('Upload success'); progressBar.style.width='0%'; progressBar.textContent='0%'; form.reset(); } else alert('Upload failed: '+xhr.responseText); };
  xhr.send(formData);
});
</script>
</body>
</html>`);
});

// -------------------- Upload POST --------------------
app.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const meta = await readMetadata();
    const kbNumber = meta.length ? Math.max(...meta.map(m=>m.kb))+1 : 100001;
    const newEntry = {
      kb: kbNumber,
      name: req.body.name,
      originalFileName: req.file.originalname,
      description: req.body.description||'',
      tag: req.body.tag||'',
      uploadTime: Date.now(),
      filePath: req.file.filename
    };
    await addMetadata(newEntry);       // MongoDB
    await saveMetadataJSON(newEntry);  // JSON backup
    res.send('Upload successful');
  } catch(err){ console.error(err); res.status(500).send('Upload failed'); }
});

// -------------------- List API --------------------
app.get('/api/list-update', async (req,res)=>{
  try{
    let meta = await readMetadata();
    Object.keys(req.query).forEach(k=>{
      if(k.startsWith('filter_') && req.query[k]){
        const col = k.replace('filter_','');
        const val = req.query[k].toLowerCase();
        meta = meta.filter(m=>String(m[col]||'').toLowerCase().includes(val));
      }
    });
    const sorts=[];
    for(let i=0;i<10;i++){
      if(req.query['sort'+i]) sorts.push({col:req.query['sort'+i], dir:req.query['dir'+i]||'asc'});
    }
    if(sorts.length>0){
      meta.sort((a,b)=>{
        for(const s of sorts){
          let valA=a[s.col], valB=b[s.col];
          if(typeof valA==='string') valA=valA.toLowerCase();
          if(typeof valB==='string') valB=valB.toLowerCase();
          if(valA<valB) return s.dir==='asc'?-1:1;
          if(valA>valB) return s.dir==='asc'?1:-1;
        }
        return 0;
      });
    }
    const page=parseInt(req.query.page)||1;
    const limit=parseInt(req.query.limit)||10;
    const totalPages=Math.ceil(meta.length/limit);
    const paged=meta.slice((page-1)*limit,page*limit);
    res.json({data:paged,totalPages});
  }catch(err){ console.error(err); res.status(500).send('Error fetching data'); }
});

// -------------------- Basket API --------------------
app.get('/api/basket',(req,res)=>{ const sid=getSessionId(req,res); res.json(serverBaskets[sid]); });
app.post('/api/basket',(req,res)=>{
  const sid=getSessionId(req,res); const {kb,add}=req.body;
  if(add){ if(!serverBaskets[sid].includes(kb)) serverBaskets[sid].push(kb); }
  else{ serverBaskets[sid]=serverBaskets[sid].filter(x=>x!==kb); }
  res.json(serverBaskets[sid]);
});

// -------------------- Start Server --------------------
app.listen(PORT,()=>console.log('Server running on port '+PORT));

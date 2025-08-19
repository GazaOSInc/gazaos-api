const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Ensure folders exist
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const IMAGE_DIR = path.join(__dirname, 'images');
if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR);

// Serve static files
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/images', express.static(IMAGE_DIR));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Metadata file
const META_FILE = path.join(__dirname, 'metadata.json');
if (!fs.existsSync(META_FILE)) fs.writeFileSync(META_FILE, JSON.stringify([]));
function readMetadata() { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')); }
function writeMetadata(data) { fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2)); }

// "/" endpoint: catalog page
app.get('/', (req, res) => {
  const files = readMetadata();
  const ua = req.headers['user-agent'];
  const isIE = ua.indexOf('MSIE') !== -1 || ua.indexOf('Trident') !== -1;

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Update Catalog</title>
  <style>
  body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;background:#f4f4f4;margin:0;padding:0;}
  header{background:#0078d7;color:#fff;padding:10px 20px;font-size:22px;font-weight:bold;}
  .container{padding:20px;}
  .top-links{margin-bottom:15px;}
  a{text-decoration:none;color:#0078d7;}a:hover{text-decoration:underline;}
  #searchBox{width:300px;padding:6px;margin-bottom:10px;border:1px solid #ccc;border-radius:2px;}
  table{width:100%;border-collapse:collapse;background:#fff;font-size:14px;}
  th,td{padding:8px 12px;border:1px solid #ccc;text-align:left;}
  th{background:#f3f3f3;color:#333;font-weight:normal;cursor:pointer;user-select:none;}
  tr:nth-child(even){background:#fafafa;}
  tr:hover{background:#ddeeff;}
  #basketContainer{margin-top:10px;text-align:left;}
  #basketContainer img{cursor:pointer;width:32px;height:32px;vertical-align:middle;}
  #basketCount{font-weight:bold;color:#fff;margin-left:5px;}
  .pagination{margin-top:10px;text-align:center;}
  .pagination button{padding:4px 8px;margin:0 2px;border:1px solid #ccc;background:#f3f3f3;cursor:pointer;border-radius:2px;}
  .pagination button:hover{background:#e0e0e0;}
  </style>
  <script>
  var sortDirections={};var currentPage=1;var rowsPerPage=10;
  function filterTable(){currentPage=1;renderTable();}
  function sortTable(n){
    var table=document.getElementById("fileTable");
    var rows=Array.prototype.slice.call(table.rows,1);
    var dir=sortDirections[n]==="asc"?"desc":"asc";
    sortDirections[n]=dir;
    rows.sort(function(a,b){
      var x=a.getElementsByTagName("TD")[n].textContent.toLowerCase();
      var y=b.getElementsByTagName("TD")[n].textContent.toLowerCase();
      var xNum=parseFloat(x.replace(/[^0-9]/g,""));
      var yNum=parseFloat(y.replace(/[^0-9]/g,""));
      if(!isNaN(xNum)&&!isNaN(yNum)){x=xNum;y=yNum;}
      if(dir=="asc") return x>y?1:x<y?-1:0; else return x<y?1:x>y?-1:0;
    });
    for(var i=0;i<rows.length;i++) table.appendChild(rows[i]);
  }
  function renderTable(){
    var table=document.getElementById("fileTable");
    var tr=table.getElementsByTagName("tr");
    var filter=document.getElementById("searchBox").value.toLowerCase();
    var rows=[];
    for(var i=1;i<tr.length;i++){
      var tds=tr[i].getElementsByTagName("td");var txtValue="";
      for(var j=0;j<tds.length-1;j++) txtValue+=tds[j].textContent.toLowerCase()+" ";
      if(txtValue.indexOf(filter)>-1) rows.push(tr[i]);
    }
    for(var i=1;i<tr.length;i++) tr[i].style.display="none";
    var start=(currentPage-1)*rowsPerPage; var end=start+rowsPerPage;
    for(var i=start;i<end&&i<rows.length;i++) rows[i].style.display="";
    renderPagination(rows.length);
    updateBasketCount();
  }
  function renderPagination(totalRows){
    var pageCount=Math.ceil(totalRows/rowsPerPage);
    var container=document.getElementById("pagination");container.innerHTML="";
    if(pageCount<=1) return;
    for(var i=1;i<=pageCount;i++){
      var btn=document.createElement("button");btn.innerHTML=i;
      btn.onclick=(function(n){return function(){currentPage=n;renderTable();};})(i);
      if(i===currentPage) btn.style.fontWeight="bold";container.appendChild(btn);
    }
  }
  function isIE(){var ua=navigator.userAgent;return ua.indexOf("MSIE")!==-1||ua.indexOf("Trident")!==-1;}
  function getBasket(){var b=localStorage.getItem("ieBasket");return b?b.split(","):[];}
  function setBasket(arr){localStorage.setItem("ieBasket",arr.join(",")); updateBasketCount();}
  function addToBasket(kb,checkbox){
    var basket=getBasket();
    if(checkbox.checked){ if(basket.indexOf(""+kb)===-1) basket.push(""+kb);}
    else { var idx=basket.indexOf(""+kb); if(idx!==-1) basket.splice(idx,1);}
    setBasket(basket);
  }
  function updateBasketCount(){
    var count=document.getElementById("basketCount");
    if(count) count.innerHTML=getBasket().length;
  }
  function viewBasket(){
    var basket=getBasket();
    if(!basket.length){alert("Basket empty");return;}
    var msg="Basket contains:\\n";
    for(var i=0;i<basket.length;i++){
      var link=document.getElementById("kbLink"+basket[i]);
      if(link) msg+=link.textContent+"\\n";
    }
    alert(msg);
  }
  function downloadBasket(){
    var basket=getBasket();
    if(!basket.length){alert("Basket empty");return;}
    for(var i=0;i<basket.length;i++){
      var link=document.getElementById("kbLink"+basket[i]);
      if(link) window.open(link.href,"_blank");
    }
  }
  window.onload=function(){renderTable();};
  </script>
  </head><body>
  <header>Microsoft Update Catalog</header>
  <div class="container">
  <div class="top-links"><a href="/upload">Upload New File</a></div>
  <input type="text" id="searchBox" onkeyup="filterTable()" placeholder="Search KB, Name, Description, Tag">`;

  if(isIE){
    html+=`<div id="basketContainer">
    <img src="/images/decor_Basket.jpg" title="View Basket" onclick="viewBasket()"/>
    <span id="basketCount">0</span>
    <button onclick="downloadBasket()">Download Basket</button>
    </div>`;
  }

  html+=`<table id="fileTable"><tr>
  <th onclick="sortTable(0)">KB Number &#x25B2;&#x25BC;</th>
  <th onclick="sortTable(1)">File Name &#x25B2;&#x25BC;</th>
  <th onclick="sortTable(2)">Original File Name &#x25B2;&#x25BC;</th>
  <th onclick="sortTable(3)">Description &#x25B2;&#x25BC;</th>
  <th onclick="sortTable(4)">Tag &#x25B2;&#x25BC;</th>
  <th onclick="sortTable(5)">Upload Date &#x25B2;&#x25BC;</th>
  <th>Download</th>${isIE?'<th>Basket</th>':''}</tr>`;

  for(let f of files){
    html+=`<tr>
    <td>KB#${f.kb}</td>
    <td>${f.name}</td>
    <td>${f.originalFileName}</td>
    <td>${f.description||'-'}</td>
    <td>${f.tag||'-'}</td>
    <td>${new Date(f.uploadTime).toLocaleString()}</td>
    <td><a id="kbLink${f.kb}" href="/uploads/${f.filePath}" download>Download</a></td>`;
    if(isIE){
      const checked='';
      html+=`<td><input type="checkbox" onchange="addToBasket(${f.kb},this)" ${checked}></td>`;
    }
    html+='</tr>';
  }

  html+=`</table><div class="pagination" id="pagination"></div></div></body></html>`;
  res.send(html);
});

// Upload endpoints
app.get('/upload', (req,res)=>{
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Upload File</title>
  <style>
  body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;padding:20px;background:#f4f4f4;}
  form{background:#fff;padding:20px;border:1px solid #ccc;width:400px;margin:auto;border-radius:4px;}
  label{display:block;margin:10px 0 5px;}
  input,button{width:100%;padding:8px;margin-bottom:10px;border:1px solid #ccc;border-radius:2px;}
  button{background:#0078d7;color:#fff;border:none;cursor:pointer;}
  button:hover{background:#005a9e;}
  a{display:block;margin-top:10px;text-align:center;color:#0078d7;}
  </style></head><body>
  <h1 style="text-align:center;">Upload File</h1>
  <form action="/upload" method="POST" enctype="multipart/form-data">
    <label>Select File:</label><input type="file" name="file" required>
    <label>File Name:</label><input type="text" name="name" required>
    <label>Description:</label><input type="text" name="description">
    <label>Tag:</label><input type="text" name="tag">
    <button type="submit">Upload</button>
  </form>
  <a href="/">Back to Update Catalog</a>
  </body></html>`);
});

app.post('/upload', upload.single('file'), (req,res)=>{
  const {name,description,tag} = req.body;
  const originalFileName = req.file.originalname;
  const metadata = readMetadata();
  const kb = metadata.length>0 ? metadata[metadata.length-1].kb+1 : 1;
  metadata.push({kb,name,description,tag,originalFileName,filePath:req.file.filename,uploadTime:new Date()});
  writeMetadata(metadata);
  res.send(`<p>File uploaded successfully as KB#${kb}!</p><a href="/">Back to Update Catalog</a>`);
});

// API endpoint
app.get('/api/list-update',(req,res)=>{
  const metadata = readMetadata();
  const page = parseInt(req.query.page,10)||1;
  const limit = parseInt(req.query.limit,10)||10;
  const total = metadata.length;
  const totalPages = Math.ceil(total/limit);
  const start=(page-1)*limit; const end=start+limit;
  res.json({page,limit,total,totalPages,data:metadata.slice(start,end)});
});

app.listen(PORT,()=>{console.log('Server running at http://localhost:'+PORT)});

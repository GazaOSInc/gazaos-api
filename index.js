const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Serve uploaded files statically
app.use('/uploads', express.static(UPLOAD_DIR));

// Multer setup
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Metadata file
const META_FILE = path.join(__dirname, 'metadata.json');
if (!fs.existsSync(META_FILE)) fs.writeFileSync(META_FILE, JSON.stringify([]));

// Helpers
function readMetadata() {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
}

function writeMetadata(data) {
    fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2));
}

// "/" endpoint: list files with search, sortable columns, pagination
app.get('/', function (req, res) {
    var files = readMetadata();
    var html = ''
        + '<!DOCTYPE html>'
        + '<html>'
        + '<head>'
        + '<meta charset="UTF-8">'
        + '<title>Update Catalog</title>'
        + '<style>'
        + 'body { font-family: Arial, sans-serif; background: #f3f3f3; padding: 20px; }'
        + 'h1 { text-align: center; }'
        + '.top-links { margin-bottom: 15px; text-align:center; }'
        + 'table { width: 100%; border-collapse: collapse; background: #fff; }'
        + 'th, td { padding: 10px; border: 1px solid #ccc; text-align: left; }'
        + 'th { background: #e1e1e1; cursor: pointer; }'
        + 'tr:hover { background: #f0f8ff; }'
        + 'a { text-decoration: none; color: #0066cc; }'
        + 'a:hover { text-decoration: underline; }'
        + '#searchBox { width: 300px; padding: 8px; margin-bottom: 10px; }'
        + '.pagination { margin-top: 10px; text-align: center; }'
        + '.pagination button { padding: 5px 10px; margin: 0 2px; }'
        + '</style>'
        + '<script type="text/javascript">'
        + 'var sortDirections = {};'
        + 'var currentPage = 1;'
        + 'var rowsPerPage = 10;'
        + 'function filterTable() {'
        + '  currentPage = 1;'
        + '  renderTable();'
        + '}'
        + 'function sortTable(n) {'
        + '  var table = document.getElementById("fileTable");'
        + '  var rows = Array.prototype.slice.call(table.rows, 1);'
        + '  var dir = sortDirections[n] === "asc" ? "desc" : "asc";'
        + '  sortDirections[n] = dir;'
        + '  rows.sort(function(a, b) {'
        + '    var x = a.getElementsByTagName("TD")[n].textContent.toLowerCase();'
        + '    var y = b.getElementsByTagName("TD")[n].textContent.toLowerCase();'
        + '    var xNum = parseFloat(x.replace(/[^0-9]/g,""));'
        + '    var yNum = parseFloat(y.replace(/[^0-9]/g,""));'
        + '    if (!isNaN(xNum) && !isNaN(yNum)) { x = xNum; y = yNum; }'
        + '    if (dir=="asc") return x>y?1:x<y?-1:0;'
        + '    else return x<y?1:x>y?-1:0;'
        + '  });'
        + '  for(var i=0;i<rows.length;i++) table.appendChild(rows[i]);'
        + '}'
        + 'function renderTable() {'
        + '  var table = document.getElementById("fileTable");'
        + '  var tr = table.getElementsByTagName("tr");'
        + '  var filter = document.getElementById("searchBox").value.toLowerCase();'
        + '  var rows = [];'
        + '  for (var i = 1; i < tr.length; i++) {'
        + '    var tds = tr[i].getElementsByTagName("td");'
        + '    var txtValue="";'
        + '    for(var j=0;j<tds.length-1;j++) txtValue+=tds[j].textContent.toLowerCase()+" ";'
        + '    if(txtValue.indexOf(filter)>-1) rows.push(tr[i]);'
        + '  }'
        + '  for(var i=1;i<tr.length;i++) tr[i].style.display="none";'
        + '  var start=(currentPage-1)*rowsPerPage;'
        + '  var end=start+rowsPerPage;'
        + '  for(var i=start;i<end && i<rows.length;i++) rows[i].style.display="";'
        + '  renderPagination(rows.length);'
        + '}'
        + 'function renderPagination(totalRows) {'
        + '  var pageCount=Math.ceil(totalRows/rowsPerPage);'
        + '  var container=document.getElementById("pagination");'
        + '  container.innerHTML="";'
        + '  if(pageCount<=1) return;'
        + '  for(var i=1;i<=pageCount;i++) {'
        + '    var btn=document.createElement("button");'
        + '    btn.innerHTML=i;'
        + '    btn.onclick=(function(n){return function(){currentPage=n; renderTable();};})(i);'
        + '    if(i===currentPage) btn.style.fontWeight="bold";'
        + '    container.appendChild(btn);'
        + '  }'
        + '}'
        + 'window.onload=function(){ renderTable(); };'
        + '</script>'
        + '</head>'
        + '<body>'
        + '<h1>Update Catalog</h1>'
        + '<div class="top-links"><a href="/upload">Upload New File</a></div>'
        + '<input type="text" id="searchBox" onkeyup="filterTable()" placeholder="Search KB, Name, Description, Tag">'
        + '<table id="fileTable">'
        + '<tr>'
        + '<th onclick="sortTable(0)">KB Number &#x25B2;&#x25BC;</th>'
        + '<th onclick="sortTable(1)">File Name &#x25B2;&#x25BC;</th>'
        + '<th onclick="sortTable(2)">Original File Name &#x25B2;&#x25BC;</th>'
        + '<th onclick="sortTable(3)">Description &#x25B2;&#x25BC;</th>'
        + '<th onclick="sortTable(4)">Tag &#x25B2;&#x25BC;</th>'
        + '<th onclick="sortTable(5)">Upload Date &#x25B2;&#x25BC;</th>'
        + '<th>Download</th>'
        + '</tr>';

    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        html += '<tr>'
            + '<td>KB#' + file.kb + '</td>'
            + '<td>' + file.name + '</td>'
            + '<td>' + file.originalFileName + '</td>'
            + '<td>' + (file.description || '-') + '</td>'
            + '<td>' + (file.tag || '-') + '</td>'
            + '<td>' + new Date(file.uploadTime).toLocaleString() + '</td>'
            + '<td><a href="/uploads/' + file.filePath + '" download>Download</a></td>'
            + '</tr>';
    }

    html += '</table>'
        + '<div class="pagination" id="pagination"></div>'
        + '</body></html>';
    res.send(html);
});

// "/upload" endpoint
app.get('/upload', function (req, res) {
    var html = ''
        + '<!DOCTYPE html>'
        + '<html>'
        + '<head>'
        + '<meta charset="UTF-8">'
        + '<title>Upload File</title>'
        + '<style>'
        + 'body { font-family: Arial, sans-serif; padding: 20px; background: #f3f3f3; }'
        + 'form { background: #fff; padding: 20px; border: 1px solid #ccc; width: 400px; margin: auto; }'
        + 'label { display: block; margin: 10px 0 5px; }'
        + 'input, button { width: 100%; padding: 8px; margin-bottom: 10px; }'
        + 'button { background: #0066cc; color: #fff; border: none; cursor: pointer; }'
        + 'button:hover { background: #004999; }'
        + 'a { display: block; margin-top: 10px; text-align: center; color: #0066cc; }'
        + '</style>'
        + '</head>'
        + '<body>'
        + '<h1 style="text-align:center;">Upload File</h1>'
        + '<form action="/upload" method="POST" enctype="multipart/form-data">'
        + '<label>Select File:</label>'
        + '<input type="file" name="file" required>'
        + '<label>File Name:</label>'
        + '<input type="text" name="name" required>'
        + '<label>Description:</label>'
        + '<input type="text" name="description">'
        + '<label>Tag:</label>'
        + '<input type="text" name="tag">'
        + '<button type="submit">Upload</button>'
        + '</form>'
        + '<a href="/">Back to Update Catalog</a>'
        + '</body>'
        + '</html>';
    res.send(html);
});

// Handle file upload
app.post('/upload', upload.single('file'), function (req, res) {
    var name = req.body.name;
    var description = req.body.description;
    var tag = req.body.tag;
    var originalFileName = req.file.originalname;

    var metadata = readMetadata();
    var kb = metadata.length > 0 ? metadata[metadata.length - 1].kb + 1 : 1;

    metadata.push({
        kb: kb,
        name: name,
        description: description,
        tag: tag,
        originalFileName: originalFileName,
        filePath: req.file.filename,
        uploadTime: new Date()
    });

    writeMetadata(metadata);

    res.send('<p>File uploaded successfully as KB#' + kb + '!</p><a href="/">Back to Update Catalog</a>');
});

// "/api/list-update" endpoint
app.get('/api/list-update', function (req, res) {
    var metadata = readMetadata();
    res.json(metadata);
});

app.listen(PORT, function () {
    console.log('Server running on http://localhost:' + PORT);
});

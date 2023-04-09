const express = require('express');
const labels = require('./common.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const open = require('opn');

const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

const port = 3001;
const default_tax = 0.1;


// DB connection
const db = new sqlite3.Database('./database.sqlite3', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the database.');
});

// Setup
// app.use(express.urlencoded({ extended: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use((req, res, next) => {
  res.locals.labels = labels;
  next();
});
app.use(express.static(path.join(__dirname, 'public')));


// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    project_name TEXT NOT NULL,
    invoice_date TEXT,
    estimate_date TEXT,
    is_completed INTEGER NOT NULL DEFAULT 0,
    is_canceled INTEGER NOT NULL DEFAULT 0,
    total_amount INTEGER NOT NULL DEFAULT 0,
    total_amount_with_tax INTEGER NOT NULL DEFAULT 0,
    tax REAL DEFAULT 0.1,
    notes TEXT,
    sama INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    unit_price REAL NOT NULL,
    hours REAL NOT NULL,
    quantity INTEGER NOT NULL,
    taxed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects (id)
  )`);
});

function formatDate(date) {
  if(date){
    const dateParts = String(date).split("-");
    return `${dateParts[0]}.${parseInt(dateParts[1], 10)}.${parseInt(dateParts[2], 10)}`;
  } else {
    return ''
  }
  
}

// Routes
app.get('/', (req, res) => {
  db.all("SELECT * FROM projects", [], (err, projects) => {
    if (err) {
      return console.error(err.message);
    }
  
    let prices = {
      grand_total: 0,
      grand_total_completed: 0,
      grand_total_invoiced: 0,
    }
    projects.forEach(project => {
      // console.log(project)
      if(!project.is_canceled){
        prices.grand_total += project.total_amount_with_tax;
        if(project.is_completed){
          prices.grand_total_completed += project.total_amount_with_tax;
        }
        if(project.invoice_date){
          prices.grand_total_invoiced += project.total_amount_with_tax;
        }
      }
    })
    
    // 合計金額を含むプロジェクトとプロジェクト全体の合計金額をレンダリング
    res.render("index", { projects: projects, default_tax:default_tax, prices: prices, formatDate: formatDate });
  });
});

app.get('/new', (req, res) => {
  // res.render('new');
  res.render('new', { project: null, default_tax:default_tax, items: null });
});

app.post('/new', (req, res) => {
  const { client_name, project_name, invoice_date, estimate_date, total_amount, total_amount_with_tax, tax, notes, sama, items } = req.body;

  db.run("INSERT INTO projects (client_name, project_name, invoice_date, estimate_date, total_amount, total_amount_with_tax, tax, notes, sama) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [client_name, project_name, invoice_date, estimate_date, total_amount, total_amount_with_tax, tax, notes, sama], function (err) {
    if (err) {
      return console.error(err.message);
    }

    const projectId = this.lastID;
    if(items){
      items.forEach(item => {
        const taxed = item.taxed ? 1 : 0;
        db.run("INSERT INTO items (project_id, item_name, unit_price, hours, quantity, taxed) VALUES (?, ?, ?, ?, ?, ?)", [projectId, item.item_name, item.unit_price, item.hours, item.quantity, taxed], function (err) {
          if (err) {
            return console.error(err.message);
          }
        });
      });
    }
    

    res.redirect('/');
  });
});


app.get('/edit/:id', (req, res) => {
  const projectId = req.params.id;
  db.get("SELECT * FROM projects WHERE id = ?", [req.params.id], (err, project) => {
    if (err) {
      throw err;
    }
  db.all('SELECT * FROM items WHERE project_id = ?', [projectId], (err, items) => {
    if (err) {
      throw err;
    }
    // console.log(items);
    res.render('edit', { project: project, default_tax:default_tax, items: items });
  });
});
});

app.post('/edit/:id', (req, res) => {
    const projectId = req.params.id;
    const { client_name, project_name, invoice_date, estimate_date, items, is_completed, is_canceled, total_amount, total_amount_with_tax, tax, notes, sama } = req.body;
    const completed = is_completed ? 1 : 0;
    const canceled = is_canceled ? 1 : 0;

    db.run('UPDATE projects SET client_name = ?, project_name = ?, invoice_date = ?, estimate_date = ?, is_completed = ?, is_canceled = ?, total_amount = ? , total_amount_with_tax = ? , tax = ? , notes = ?, sama = ? WHERE id = ?', [client_name, project_name, invoice_date, estimate_date, completed, canceled, total_amount, total_amount_with_tax, tax, notes, sama, projectId], (err) => {

    if (err) {
      throw err;
    }
    db.run('DELETE FROM items WHERE project_id = ?', [projectId], (err) => {
      if (err) {
        throw err;
      }
    
      const stmt = db.prepare('INSERT INTO items (project_id, item_name, unit_price, hours, quantity, taxed) VALUES (?, ?, ?, ?, ?, ?)');
      if (items) {
        // console.log(items);
        
        //itemsをsort_indexでソート
        items.sort(function(a, b) {
          if (parseInt(a.item_sort_index) < parseInt(b.item_sort_index)) return -1;
          if (parseInt(a.item_sort_index) > parseInt(b.item_sort_index)) return 1;
          return 0;
        });

        items.forEach(item => {
          
          const taxed = item.taxed ? 1 : 0;
          console.log(item)
          stmt.run(projectId, item.item_name, item.unit_price, item.hours, item.quantity, taxed);
        });
      }
      stmt.finalize();
      res.redirect('/');
    });
  });
});

app.post('/delete/:id', (req, res) => {
  const projectId = req.params.id;

  db.run('DELETE FROM items WHERE project_id = ?', [projectId], (err) => {
    if (err) {
    throw err;
    }
    db.run('DELETE FROM projects WHERE id = ?', [projectId], (err) => {
      if (err) {
        throw err;
      }
      res.redirect('/');
    });
  });
});


// 他のルーティングの後に追加
app.get('/clone/:id', (req, res) => {
  const projectId = req.params.id;
  
  // 指定されたプロジェクト ID のプロジェクトデータを取得
  db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
    if (err) {
      throw err;
    }

    // 新しいプロジェクトデータを作成
    const newProject = {
      client_name: project.client_name,
      project_name: project.project_name + ' (Clone)',
      invoice_date: null,
      estimate_date: null,
      is_completed: 0,
      is_canceled: 0,
      total_amount: project.total_amount,
      total_amount_with_tax: project.total_amount_with_tax,
      tax: project.tax,
      notes: project.notes
    };

    // 新しいプロジェクトデータをデータベースに保存
    db.run('INSERT INTO projects (client_name, project_name, invoice_date, estimate_date, is_completed, is_canceled, total_amount, total_amount_with_tax, tax, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [newProject.client_name, newProject.project_name, newProject.invoice_date, newProject.estimate_date, newProject.is_completed, newProject.is_canceled, newProject.total_amount, newProject.total_amount_with_tax, newProject.tax, newProject.notes], function(err) {
      if (err) {
        throw err;
      }

      // 新しいプロジェクト ID を取得
      const newProjectId = this.lastID;
      
      // 既存のプロジェクトのアイテムデータを取得
      db.all('SELECT * FROM items WHERE project_id = ?', [projectId], (err, items) => {
        if (err) {
          throw err;
        }

        // 新しいプロジェクト ID でアイテムデータをデータベースに保存
        const stmt = db.prepare('INSERT INTO items (project_id, item_name, unit_price, hours, quantity, taxed) VALUES (?, ?, ?, ?, ?, ?)');
        items.forEach(item => {
          stmt.run(newProjectId, item.item_name, item.unit_price, item.hours, item.quantity, item.taxed);
        });
        stmt.finalize();

        // プロジェクト一覧ページにリダイレクト
        res.redirect('/');
      });
    });
  });
});


app.get('/estimate-pdf/:id', (req, res) => {
  const projectId = req.params.id;
  
  db.get("SELECT * FROM projects WHERE id = ?", [projectId], async (err, project) => {
    if (err) {
      console.error(err.message);
      res.status(500).send("Error retrieving project from database.");
      return;
    }

    db.all("SELECT * FROM items WHERE project_id = ?", [projectId], async (err, items) => {
      if (err) {
        console.error(err.message);
        res.status(500).send("Error retrieving items from database.");
        return;
      }

      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      const renderedHtml = await ejs.renderFile('pdf/estimate.ejs', { project: project, items: items, labels: labels, formatDate: formatDate  });
      await page.setContent(renderedHtml);
      await page.waitForSelector('img', { timeout: 0 }); // すべての画像が読み込まれるのを待つ
      await page.emulateMediaType('screen');
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

      const encodedFileName = encodeURIComponent('見積書'+String(project.id).padStart(3, '0')+'_'+ project.client_name +'様.pdf');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);

      res.contentType('application/pdf');
      res.send(pdfBuffer);

      await browser.close();
    });
  });
  
});

app.get('/invoice-pdf/:id', (req, res) => {
  const projectId = req.params.id;
  
  db.get("SELECT * FROM projects WHERE id = ?", [projectId], async (err, project) => {
    if (err) {
      console.error(err.message);
      res.status(500).send("Error retrieving project from database.");
      return;
    }

    db.all("SELECT * FROM items WHERE project_id = ?", [projectId], async (err, items) => {
      if (err) {
        console.error(err.message);
        res.status(500).send("Error retrieving items from database.");
        return;
      }

      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      const renderedHtml = await ejs.renderFile('pdf/invoice.ejs', { project: project, items: items, labels: labels, formatDate: formatDate  });
      await page.setContent(renderedHtml);
      await page.waitForSelector('img', { timeout: 0 }); // すべての画像が読み込まれるのを待つ
      await page.emulateMediaType('screen');
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

      const encodedFileName = encodeURIComponent('請求書'+String(project.id).padStart(3, '0')+'_'+ project.client_name +'様.pdf');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);

      res.contentType('application/pdf');
      res.send(pdfBuffer);

      await browser.close();
    });
  });
  
});

let quit_timer;

io.on('connection', (socket) => {
  
  clearTimeout(quit_timer)
  
  socket.on('disconnect', () => {
    quit_timer = setTimeout(() => {
      process.exit(0); // ユーザーが切断されたら、プロセスを終了
      console.log('user disconnected');
    
    }, 5000);
  });

  
});

server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
  console.log('Connected to the database.');

  // ブラウザでlocalhostを開く
  open(`http://localhost:${port}`);
});
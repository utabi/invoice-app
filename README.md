# Invoice App / 請求書 App

Invoice App is a simple web application for creating, editing, and managing quotes and invoices for matters and clients. It works locally only.

Invoice Appは、案件やクライアントへの見積書・請求書を作成、編集、管理するためのシンプルなウェブアプリケーションです。ローカルでのみ動作します。

![top page](images/screenshot1.png "top page")

## Features

- Create, edit, and delete invoice projects
- Add, edit, and delete items
- Export invoices as PDF files
- Manage project status (completed, canceled)
- Change the order of items with drag & drop

## Installation

1. Clone the repository.

```
git clone https://github.com/yourusername/invoice-app.git
```

2. Install dependencies.

```
cd invoice-app
npm install
```

3. Run the application.

```
cd src
npm start
```

The application will be accessible at http://localhost:3000.

## Technologies

- Node.js
- Express
- SQLite
- EJS
- Puppeteer

## License

[MIT License](LICENSE)

![edit page](images/screenshot2.png "edit page")
![quotation](images/estimate-sample.jpg "quotation")
![invoice](images/invoice-sample.jpg "invoice")
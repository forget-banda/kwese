# Wese~Kwese

A school fees desk for one computer in the office. Receipts, invoices, debtors, daily cash, fund balances, and more than one currency (USD and ZiG in this sample) live in a SQLite file on that machine. Other computers on the same network open it in a browser.

This is the browser edition of the workflow described for Wese~Kwese 1.6.0: term or monthly billing, monthly instalments, proportional fund splits, receipt books, leaving records, end-of-year promotion, month-end close, and backups.

## Run it

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). The first launch loads sample books for Chiedza Primary in Harare so you can click through a live term.

| Username | Password | Can do |
| --- | --- | --- |
| admin | kwese1840 | Setup, users, fee reductions, reopen a month |
| bursar | bursar1840 | Invoices, receipts, reports, expenditure |
| teacher | teacher1840 | Register and class lists, no money |

## Start a real school

Stop the server, delete the `data` folder, and start again with an empty desk:

```bash
WESE_EMPTY=1 npm run dev
```

The first page asks for the school name and the first admin. After that, work down the getting-started list on Home: term, classes, fee categories, fee items, a fee structure, and a receipt book.

## Docker

The production desk listens on port 4000 inside the container. Compose publishes that only on the machine itself (`127.0.0.1:4000`), and nginx forwards the public name to it. The school books are the `kwese-data` volume, mounted at `/data`.

```bash
docker compose up -d --build
```

An empty office, with no sample pupils, is `WESE_EMPTY=1` on the `web` service.

## Tests

```bash
npm test
```

## Data

Books are stored in `data/wese.sqlite`. Backups land in `data/backups`. A daily copy is taken after 17:00 Africa/Harare time while the server is open. Admins can also back up, e-mail an AES-256 encrypted copy, and restore from the Backups page (type `RESTORE`).

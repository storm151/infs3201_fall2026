# Laundry Order Management System

A full-stack laundry order management application built with Node.js, Express, MongoDB, and Handlebars.

The application provides separate customer and staff experiences, MongoDB-backed sessions, order tracking, customer lookup, service listings, pickup-location image uploads, PDF invoices, and invoice email notifications.

## Features

### Customer
- Log in with an email address and password
- View customer details and personal orders
- Upload or replace a JPG pickup-location image (maximum 2 MB)
- View order IDs, dates, statuses, and totals

### Staff
- View all orders and customer names
- Search for a customer by phone number
- View a customer's pickup-location image
- Update order status according to the workflow:
  `Received -> Washing -> Ready -> Delivered`
- Generate a PDF invoice and send it by email when an order becomes `Ready`

### System
- MongoDB-backed authentication sessions with a 10-minute sliding expiry
- HTTP-only session cookie
- Protected staff-only and customer-only routes
- PDF invoice generation with `pdf-lib`
- SMTP email delivery with `nodemailer`
- Express Handlebars server-side views

## Tech Stack

- Node.js
- Express 5
- MongoDB Node.js Driver
- express-handlebars
- express-fileupload
- pdf-lib
- nodemailer
- dotenv

## Prerequisites

- Node.js 18 or newer
- npm
- A MongoDB database, local or hosted
- An SMTP account if invoice email delivery is needed

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/storm151/infs3201_fall2026.git
   cd infs3201_fall2026
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create the environment file:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell, copy the example instead:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Update `.env` with your MongoDB and SMTP settings.

5. Start the application:

   ```bash
   node app.js
   ```

6. Open `http://localhost:8000` in a browser.

The server port can be changed with the `PORT` environment variable.

## Environment Variables

| Variable | Required | Description | Example |
|---|---:|---|---|
| `MONGO_URI` | Yes | MongoDB connection string | `mongodb+srv://...` |
| `MONGO_DB_NAME` | Yes | MongoDB database name | `infs3201_fall2026` |
| `PORT` | No | HTTP server port; defaults to `8000` | `8000` |
| `MINIMUM_ORDER_CHARGE` | No | Minimum order subtotal in QAR | `25` |
| `FREE_DELIVERY_THRESHOLD` | No | Subtotal above which delivery is free | `50` |
| `DELIVERY_CHARGE` | No | Standard delivery charge in QAR | `10` |
| `SMTP_HOST` | For email | SMTP server host | `smtp.ethereal.email` |
| `SMTP_PORT` | For email | SMTP server port | `587` |
| `SMTP_SECURE` | No | Set `true` for implicit TLS (normally used on port 465) | `false` |
| `SMTP_USER` | For email | SMTP username | `your_smtp_user` |
| `SMTP_PASS` | For email | SMTP password | `your_smtp_password` |
| `SMTP_FROM` | For email | Sender address | `no-reply@laundry.com` |

The mail configuration also recognizes `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, and `EMAIL_FROM` as fallbacks.

## Database Requirements

The application expects an existing MongoDB database with these collections:

- `customers`
- `services`
- `orders`
- `staff_users`
- `sessions`

The application queries customer, service, and order relationships using MongoDB `_id` values (`ObjectId`) and stores session documents in `sessions`.

An optional migration script, `db_transform.js`, converts legacy string IDs to MongoDB `ObjectId` references and removes the deprecated ID fields. Back up the database before running it:

```bash
node db_transform.js
```

## Demo Accounts

Demo credentials are documented in [`users.md`](users.md). Use them only with the matching seeded database records.

| Role | Example |
|---|---|
| Staff/Admin | Accounts listed in `users.md` |
| Customer | Accounts listed in `users.md` |

## Application Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Home page |
| `/login` | Public | Login |
| `/logout` | Logged in | End the session |
| `/services` | Public | Service list |
| `/dashboard` | Logged in | Customer or staff dashboard |
| `/customer` | Staff | Customer search form |
| `/find-results` | Staff | Customer search results |
| `/orders` | Staff | All orders |
| `/update-status` | Staff | View/update an order status |
| `/upload-pickup-image` | Customer | Upload a pickup-location JPG |
| `/uploads/:filename` | Staff or the matching customer | Secure pickup-image access |

## Order and Invoice Behavior

For an order to move from `Received` to `Washing`, `Washing` to `Ready`, or `Ready` to `Delivered`, the staff must use the status-update page. A status cannot skip a step or move backwards.

When an order reaches `Ready`, the application:

1. Generates a PDF invoice under `invoices/`
2. Resolves customer, service, and pricing information from MongoDB
3. Applies the configured minimum-charge, delivery, and free-delivery rules
4. Emails the PDF to the customer's registered email address when SMTP is configured

## Project Structure

```text
.
|-- app.js              Express application and route definitions
|-- business.js         Authentication, order, invoice, email, and upload logic
|-- persistence.js      MongoDB data access layer
|-- db_transform.js     Optional legacy-ID migration script
|-- public/css/         Static styles
|-- views/              Handlebars templates
|-- uploads/            Customer pickup-location images
|-- invoices/           Generated PDF invoices
|-- evidence/           Supporting project evidence
|-- .env.example        Example environment configuration
|-- users.md            Demo account information
`-- db_conversion.md    Database conversion notes
```

## Testing

This repository does not currently include an automated test suite or an npm test script. Verify changes manually by:

1. Starting MongoDB and the application.
2. Logging in as a staff account and a customer account.
3. Searching for a customer and reviewing all orders.
4. Uploading a valid JPG and confirming access restrictions.
5. Updating an order through each allowed status step.
6. Confirming invoice generation and SMTP delivery when SMTP is configured.

## Security Notes

- Never commit `.env`; it is excluded by `.gitignore`.
- Use a dedicated database user with only the permissions required by the application.
- Demo passwords and any existing database credentials should be replaced before deploying.
- The repository is configured for MongoDB SRV DNS resolution through Google DNS in the data-access and migration modules.
- Pickup images are stored outside `public/` and are served only through an authorization route.

## License

This project declares the ISC license in [`package.json`](package.json). Add a `LICENSE` file if you want a standalone license text in the GitHub repository.

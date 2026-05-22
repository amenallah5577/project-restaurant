// email.js — Nodemailer email service
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // true for port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─── Email templates ──────────────────────────────────────────────────────────

const baseStyle = `
  font-family: 'Georgia', serif;
  background: #F5F0E8;
  color: #1A1714;
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 40px;
  line-height: 1.7;
`;

function reservationConfirmationEmail(res) {
  return `
    <div style="${baseStyle}">
      <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#C8A96E;margin-bottom:32px;">
        PROJECT RESTAURANT — RESERVATION CONFIRMED
      </p>
      <h1 style="font-size:28px;font-weight:300;margin-bottom:8px;">
        Thank you, ${res.first_name}.
      </h1>
      <p style="color:#8C8279;margin-bottom:32px;">
        We look forward to welcoming you.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:32px;">
        ${row('Date', formatDate(res.date))}
        ${row('Time', res.time)}
        ${row('Guests', res.guests)}
        ${row('Experience', res.experience)}
        ${res.notes ? row('Notes', res.notes) : ''}
        ${row('Reservation ID', `#${res.id.slice(0,8).toUpperCase()}`)}
      </table>
      <p style="font-size:13px;color:#8C8279;border-top:1px solid #EAE5DC;padding-top:24px;">
        To modify or cancel, reply to this email or call us at +81 3-1234-5678.<br>
        We ask that cancellations be made at least 48 hours in advance.
      </p>
      <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#C8A96E;margin-top:32px;">
        12 Ginza Chome, 5F · Tokyo 104-0061
      </p>
    </div>
  `;
}

function reservationAdminEmail(res) {
  return `
    <div style="${baseStyle}">
      <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#C8A96E;">
        NEW RESERVATION
      </p>
      <h2 style="font-weight:300;margin:12px 0 24px;">${res.first_name} ${res.last_name}</h2>
      <table style="width:100%;border-collapse:collapse;">
        ${row('Email', res.email)}
        ${row('Phone', res.phone || '—')}
        ${row('Date', formatDate(res.date))}
        ${row('Time', res.time)}
        ${row('Guests', res.guests)}
        ${row('Experience', res.experience)}
        ${row('Status', res.status)}
        ${res.notes ? row('Notes', res.notes) : ''}
        ${row('ID', res.id)}
      </table>
    </div>
  `;
}

function reservationStatusEmail(res) {
  const messages = {
    confirmed: `Your reservation on ${formatDate(res.date)} at ${res.time} has been confirmed. We can't wait to see you.`,
    cancelled:  `Your reservation on ${formatDate(res.date)} at ${res.time} has been cancelled. We hope to welcome you another time.`,
    completed:  `Thank you for dining with us. We hope to see you again soon.`,
  };
  return `
    <div style="${baseStyle}">
      <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#C8A96E;margin-bottom:32px;">
        PROJECT RESTAURANT — RESERVATION UPDATE
      </p>
      <h1 style="font-size:24px;font-weight:300;margin-bottom:16px;">
        ${res.first_name}, your reservation has been ${res.status}.
      </h1>
      <p style="color:#8C8279;">${messages[res.status] || ''}</p>
      <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#C8A96E;margin-top:40px;">
        12 Ginza Chome, 5F · Tokyo 104-0061
      </p>
    </div>
  `;
}

function row(label, value) {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #EAE5DC;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#8C8279;width:35%;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #EAE5DC;font-size:14px;">${value}</td>
    </tr>
  `;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

// ─── Send helpers ─────────────────────────────────────────────────────────────

async function sendReservationConfirmation(reservation) {
  if (!process.env.SMTP_USER) return console.log('📧 [MOCK] Confirmation email skipped (no SMTP config)');
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    replyTo: process.env.EMAIL_REPLY_TO,
    to: reservation.email,
    subject: `Reservation Confirmed — ${formatDate(reservation.date)} · Project Restaurant`,
    html: reservationConfirmationEmail(reservation),
  });
}

async function sendReservationAdminAlert(reservation) {
  if (!process.env.SMTP_USER) return console.log('📧 [MOCK] Admin alert email skipped (no SMTP config)');
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.RESTAURANT_EMAIL || process.env.SMTP_USER,
    subject: `New Reservation: ${reservation.first_name} ${reservation.last_name} · ${formatDate(reservation.date)}`,
    html: reservationAdminEmail(reservation),
  });
}

async function sendStatusUpdate(reservation) {
  if (!process.env.SMTP_USER) return console.log('📧 [MOCK] Status email skipped (no SMTP config)');
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    replyTo: process.env.EMAIL_REPLY_TO,
    to: reservation.email,
    subject: `Reservation ${reservation.status} — Project Restaurant`,
    html: reservationStatusEmail(reservation),
  });
}

module.exports = {
  sendReservationConfirmation,
  sendReservationAdminAlert,
  sendStatusUpdate,
};

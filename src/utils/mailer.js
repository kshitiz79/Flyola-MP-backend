// mailer.js
require('dotenv').config();
const nodemailer = require('nodemailer');

// For Gmail on port 587, secure should be false (TLS is used automatically)
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: Number(process.env.MAIL_PORT) === 465, // true for port 465 only; false for 587
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false, // useful if there are certificate issues, but use with caution in production
  },
});

const sendResetPasswordEmail = async (userEmail, resetLink) => {
  const from = `${process.env.MAIL_FROM_NAME} <${process.env.MAIL_FROM_ADDRESS}>`;
  const mailOptions = {
    from,
    to: userEmail,
    subject: 'Password Reset Request',
    text: `You requested to reset your password. Click the link below to reset it:\n\n${resetLink}\n\nIf you did not request this, please ignore this email.`,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = { sendResetPasswordEmail };

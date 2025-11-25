const nodemailer = require('nodemailer');

// Create reusable transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Send cancellation email
const sendCancellationEmail = async (bookingData) => {
  try {
    const {
      email,
      pnr,
      bookingNo,
      passengerName,
      departureCity,
      arrivalCity,
      departureDate,
      departureTime,
      flightNumber,
      totalFare,
      refundAmount,
      cancellationCharges,
      cancelledBy,
      cancellationReason,
      bookingType = 'flight' // 'flight' or 'helicopter'
    } = bookingData;

    const transporter = createTransporter();

    const vehicleType = bookingType === 'helicopter' ? 'Helicopter' : 'Flight';
    const vehicleIcon = bookingType === 'helicopter' ? '🚁' : '✈️';

    const mailOptions = {
      from: `Flyola ${process.env.EMAIL_USER}`,
      to: email,
      subject: `${vehicleIcon} Booking Cancellation - PNR: ${pnr}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border: 1px solid #ddd;
            }
            .booking-details {
              background: white;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid #eee;
            }
            .detail-row:last-child {
              border-bottom: none;
            }
            .label {
              font-weight: bold;
              color: #555;
            }
            .value {
              color: #333;
            }
            .refund-box {
              background: #e8f5e9;
              border-left: 4px solid #4caf50;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .charges-box {
              background: #fff3e0;
              border-left: 4px solid #ff9800;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              background: #333;
              color: white;
              padding: 20px;
              text-align: center;
              border-radius: 0 0 10px 10px;
              font-size: 12px;
            }
            .status-badge {
              display: inline-block;
              background: #f44336;
              color: white;
              padding: 5px 15px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: bold;
            }
            .amount-highlight {
              font-size: 24px;
              font-weight: bold;
              color: #4caf50;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${vehicleIcon} Booking Cancellation Confirmation</h1>
            <p style="margin: 10px 0 0 0;">Your booking has been cancelled</p>
          </div>
          
          <div class="content">
            <p>Dear ${passengerName},</p>
            
            <p>This email confirms that your ${vehicleType.toLowerCase()} booking has been <span class="status-badge">CANCELLED</span>.</p>
            
            <div class="booking-details">
              <h3 style="margin-top: 0; color: #667eea;">Booking Information</h3>
              
              <div class="detail-row">
                <span class="label">PNR Number:</span>
                <span class="value">${pnr}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Booking Number:</span>
                <span class="value">${bookingNo}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">${vehicleType} Number:</span>
                <span class="value">${flightNumber}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Route:</span>
                <span class="value">${departureCity} → ${arrivalCity}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Departure Date:</span>
                <span class="value">${departureDate}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Departure Time:</span>
                <span class="value">${departureTime}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Cancelled By:</span>
                <span class="value">${cancelledBy}</span>
              </div>
              
              ${cancellationReason ? `
              <div class="detail-row">
                <span class="label">Reason:</span>
                <span class="value">${cancellationReason}</span>
              </div>
              ` : ''}
            </div>
            
            <div class="refund-box">
              <h3 style="margin-top: 0; color: #4caf50;">💰 Refund Details</h3>
              <div class="detail-row">
                <span class="label">Original Fare:</span>
                <span class="value">₹${parseFloat(totalFare).toLocaleString('en-IN')}</span>
              </div>
              <div class="detail-row">
                <span class="label">Refund Amount:</span>
                <span class="amount-highlight">₹${parseFloat(refundAmount).toLocaleString('en-IN')}</span>
              </div>
            </div>
            
            ${cancellationCharges > 0 ? `
            <div class="charges-box">
              <h3 style="margin-top: 0; color: #ff9800;">⚠️ Cancellation Charges</h3>
              <div class="detail-row">
                <span class="label">Charges Applied:</span>
                <span class="value" style="font-weight: bold; color: #ff9800;">₹${parseFloat(cancellationCharges).toLocaleString('en-IN')}</span>
              </div>
            </div>
            ` : ''}
            
            ${refundAmount > 0 ? `
            <p style="background: #e3f2fd; padding: 15px; border-radius: 5px; border-left: 4px solid #2196f3;">
              <strong>📌 Note:</strong> Your refund of <strong>₹${parseFloat(refundAmount).toLocaleString('en-IN')}</strong> will be processed within 5-7 business days to your original payment method.
            </p>
            ` : `
            <p style="background: #ffebee; padding: 15px; border-radius: 5px; border-left: 4px solid #f44336;">
              <strong>⚠️ Note:</strong> As per our cancellation policy, no refund is applicable for this booking.
            </p>
            `}
            
            <p>If you have any questions or concerns, please contact our customer support team.</p>
            
            <p>Thank you for choosing Flyola.</p>
            
            <p style="margin-top: 30px;">
              Best regards,<br>
              <strong>Team Flyola</strong>
            </p>
          </div>
          
          <div class="footer">
            <p style="margin: 0;">© ${new Date().getFullYear()} Flyola. All rights reserved.</p>
            <p style="margin: 10px 0 0 0;">
              <a href="https://www.flyola.in" style="color: #64b5f6; text-decoration: none;">www.flyola.in</a>
            </p>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Cancellation email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending cancellation email:', error);
    return { success: false, error: error.message };
  }
};

// Send booking confirmation email (bonus feature)
const sendBookingConfirmationEmail = async (bookingData) => {
  try {
    const {
      email,
      pnr,
      bookingNo,
      passengerName,
      departureCity,
      arrivalCity,
      departureDate,
      departureTime,
      arrivalTime,
      flightNumber,
      totalFare,
      seatNumbers,
      bookingType = 'flight'
    } = bookingData;

    const transporter = createTransporter();

    const vehicleType = bookingType === 'helicopter' ? 'Helicopter' : 'Flight';
    const vehicleIcon = bookingType === 'helicopter' ? '🚁' : '✈️';

    const mailOptions = {
      from: `Flyola ${process.env.EMAIL_USER}`,
      to: email,
      subject: `${vehicleIcon} Booking Confirmed - PNR: ${pnr}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .success-badge {
              display: inline-block;
              background: #4caf50;
              color: white;
              padding: 5px 15px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${vehicleIcon} Booking Confirmed!</h1>
            <p>Your ${vehicleType.toLowerCase()} is booked</p>
          </div>
          <div style="padding: 30px; background: #f9f9f9; border: 1px solid #ddd;">
            <p>Dear ${passengerName},</p>
            <p>Your booking has been <span class="success-badge">CONFIRMED</span>.</p>
            <p><strong>PNR:</strong> ${pnr}</p>
            <p><strong>Route:</strong> ${departureCity} → ${arrivalCity}</p>
            <p><strong>Date:</strong> ${departureDate}</p>
            <p><strong>Time:</strong> ${departureTime} - ${arrivalTime}</p>
            <p><strong>Total Fare:</strong> ₹${parseFloat(totalFare).toLocaleString('en-IN')}</p>
            <p>Thank you for choosing Flyola!</p>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Confirmation email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending confirmation email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendCancellationEmail,
  sendBookingConfirmationEmail
};

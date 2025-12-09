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

// Send rental inquiry email
const sendRentalInquiry = async (req, res) => {
  try {
    const { name, phone, rentalType, aircraftType, route, travelDate, notes } = req.body;

    // Validate required fields
    if (!name || !phone || !rentalType || !aircraftType || !route || !travelDate) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Send to company email
      subject: `🚁 New Aircraft Rental Inquiry - ${aircraftType}`,
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
              background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
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
              background: #f9fafb;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .inquiry-details {
              background: white;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .detail-row {
              display: flex;
              padding: 12px 0;
              border-bottom: 1px solid #f3f4f6;
            }
            .detail-row:last-child {
              border-bottom: none;
            }
            .label {
              font-weight: bold;
              color: #6b7280;
              min-width: 150px;
            }
            .value {
              color: #111827;
              font-weight: 500;
            }
            .priority-badge {
              display: inline-block;
              background: #ef4444;
              color: white;
              padding: 5px 15px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: bold;
              margin-top: 10px;
            }
            .footer {
              background: #1f2937;
              color: white;
              padding: 20px;
              text-align: center;
              border-radius: 0 0 10px 10px;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🚁 New Rental Inquiry</h1>
            <p style="margin: 10px 0 0 0;">Aircraft Rental Quote Request</p>
          </div>
          
          <div class="content">
            <p><strong>A new rental inquiry has been received from the website.</strong></p>
            <span class="priority-badge">⚡ URGENT - Respond within 30 minutes</span>
            
            <div class="inquiry-details">
              <h3 style="margin-top: 0; color: #2563eb;">Customer Information</h3>
              
              <div class="detail-row">
                <span class="label">Name:</span>
                <span class="value">${name}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Phone:</span>
                <span class="value">${phone}</span>
              </div>
            </div>

            <div class="inquiry-details">
              <h3 style="margin-top: 0; color: #2563eb;">Rental Requirements</h3>
              
              <div class="detail-row">
                <span class="label">Rental Type:</span>
                <span class="value">${rentalType}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Aircraft Type:</span>
                <span class="value">${aircraftType}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Route:</span>
                <span class="value">${route}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Travel Date:</span>
                <span class="value">${travelDate}</span>
              </div>
              
              ${notes ? `
              <div class="detail-row">
                <span class="label">Additional Notes:</span>
                <span class="value">${notes}</span>
              </div>
              ` : ''}
            </div>
            
            <p style="background: #dbeafe; padding: 15px; border-radius: 5px; border-left: 4px solid #2563eb;">
              <strong>📞 Action Required:</strong> Please contact the customer within 30 minutes at <strong>${phone}</strong> to provide a quote.
            </p>
            
            <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
              Inquiry received on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </p>
          </div>
          
          <div class="footer">
            <p style="margin: 0;">© ${new Date().getFullYear()} Flyola. All rights reserved.</p>
            <p style="margin: 10px 0 0 0;">Automated Rental Inquiry System</p>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Rental inquiry email sent:', info.messageId);

    res.status(200).json({
      success: true,
      message: 'Rental inquiry sent successfully',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('❌ Error sending rental inquiry email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send rental inquiry',
      error: error.message
    });
  }
};

module.exports = {
  sendRentalInquiry
};

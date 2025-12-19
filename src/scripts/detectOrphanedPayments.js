// Load environment variables from the correct path
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const models = require('../model');
const { Op } = require('sequelize');

async function detectOrphanedPayments() {
  try {
    console.log('🔍 Detecting orphaned payments...\n');
    console.log('='.repeat(80));
    
    // Find successful flight payments without bookings (last 30 days)
    const orphanedFlightPayments = await models.Payment.findAll({
      where: {
        payment_status: 'SUCCESS',
        booking_id: null,
        created_at: {
          [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      },
      include: [
        { model: models.User, attributes: ['id', 'name', 'email', 'number'] }
      ],
      order: [['created_at', 'DESC']]
    });
    
    // Find successful helicopter payments without bookings (last 30 days)
    const orphanedHelicopterPayments = await models.HelicopterPayment.findAll({
      where: {
        payment_status: 'SUCCESS',
        helicopter_booking_id: null,
        created_at: {
          [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      },
      include: [
        { model: models.User, attributes: ['id', 'name', 'email', 'number'] }
      ],
      order: [['created_at', 'DESC']]
    });
    
    const totalOrphaned = orphanedFlightPayments.length + orphanedHelicopterPayments.length;
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Flight Payments: ${orphanedFlightPayments.length}`);
    console.log(`   Helicopter Payments: ${orphanedHelicopterPayments.length}`);
    console.log(`   Total Orphaned: ${totalOrphaned}\n`);
    
    if (totalOrphaned === 0) {
      console.log('✅ No orphaned payments found!');
      console.log('='.repeat(80));
      return;
    }
    
    let totalAmount = 0;
    
    // Report Flight Payments
    if (orphanedFlightPayments.length > 0) {
      console.log('\n✈️  FLIGHT PAYMENTS WITHOUT BOOKINGS:\n');
      console.log('='.repeat(80));
      
      orphanedFlightPayments.forEach((payment, index) => {
        const amount = parseFloat(payment.payment_amount);
        totalAmount += amount;
        
        console.log(`\n${index + 1}. Payment ID: ${payment.payment_id || 'N/A'}`);
        console.log(`   Transaction ID: ${payment.transaction_id}`);
        console.log(`   Amount: ₹${amount.toFixed(2)}`);
        console.log(`   User: ${payment.User?.name || 'Unknown'} (${payment.User?.email || 'N/A'})`);
        console.log(`   Phone: ${payment.User?.number || 'N/A'}`);
        console.log(`   Date: ${payment.created_at}`);
        console.log(`   Payment Mode: ${payment.payment_mode}`);
        console.log(`   Order ID: ${payment.order_id || 'N/A'}`);
      });
    }
    
    // Report Helicopter Payments
    if (orphanedHelicopterPayments.length > 0) {
      console.log('\n\n🚁 HELICOPTER PAYMENTS WITHOUT BOOKINGS:\n');
      console.log('='.repeat(80));
      
      orphanedHelicopterPayments.forEach((payment, index) => {
        const amount = parseFloat(payment.payment_amount);
        totalAmount += amount;
        
        console.log(`\n${index + 1}. Payment ID: ${payment.payment_id || 'N/A'}`);
        console.log(`   Transaction ID: ${payment.transaction_id}`);
        console.log(`   Amount: ₹${amount.toFixed(2)}`);
        console.log(`   User: ${payment.User?.name || 'Unknown'} (${payment.User?.email || 'N/A'})`);
        console.log(`   Phone: ${payment.User?.number || 'N/A'}`);
        console.log(`   Date: ${payment.created_at}`);
        console.log(`   Payment Mode: ${payment.payment_mode}`);
        console.log(`   Order ID: ${payment.order_id || 'N/A'}`);
      });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n💰 TOTAL ORPHANED AMOUNT: ₹${totalAmount.toFixed(2)}`);
    console.log(`\n⚠️  ACTION REQUIRED:`);
    console.log(`   - These payments need manual refund processing`);
    console.log(`   - Contact customers to verify booking status`);
    console.log(`   - Process refunds through Razorpay dashboard`);
    console.log(`   - Update payment records after refund\n`);
    console.log('='.repeat(80));
    
    // Generate CSV export
    console.log('\n📄 CSV Export (copy to spreadsheet):\n');
    console.log('Type,Payment ID,Transaction ID,Amount,User Name,Email,Phone,Date,Payment Mode,Order ID');
    
    orphanedFlightPayments.forEach(payment => {
      console.log(`Flight,${payment.payment_id || ''},${payment.transaction_id},${payment.payment_amount},${payment.User?.name || ''},${payment.User?.email || ''},${payment.User?.number || ''},${payment.created_at},${payment.payment_mode},${payment.order_id || ''}`);
    });
    
    orphanedHelicopterPayments.forEach(payment => {
      console.log(`Helicopter,${payment.payment_id || ''},${payment.transaction_id},${payment.payment_amount},${payment.User?.name || ''},${payment.User?.email || ''},${payment.User?.number || ''},${payment.created_at},${payment.payment_mode},${payment.order_id || ''}`);
    });
    
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Error detecting orphaned payments:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    process.exit(0);
  }
}

// Run the detection
detectOrphanedPayments();

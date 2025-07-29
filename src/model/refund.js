const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const Refund = sequelize.define('Refund', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true
  },
  booking_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: {
      model: 'bookings',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  original_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  refund_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  cancellation_charges: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  refund_status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED', 'NOT_APPLICABLE'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  refund_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  hours_before_departure: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  admin_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  requested_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  processed_by: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'refunds',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

Refund.associate = (models) => {
  Refund.belongsTo(models.Booking, { foreignKey: 'booking_id' });
  Refund.belongsTo(models.User, { foreignKey: 'user_id' });
  Refund.belongsTo(models.User, { as: 'ProcessedByUser', foreignKey: 'processed_by' });
};

module.exports = Refund;
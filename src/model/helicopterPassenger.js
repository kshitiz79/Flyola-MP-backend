const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const HelicopterPassenger = sequelize.define(
  'HelicopterPassenger',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    helicopter_bookingId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dob: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    age: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('Adult', 'Child', 'Infant'),
      defaultValue: 'Adult',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'helicopter_passengers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

HelicopterPassenger.associate = (models) => {
  HelicopterPassenger.belongsTo(models.HelicopterBooking, {
    foreignKey: 'helicopter_bookingId',
    targetKey: 'id',
    onDelete: 'CASCADE',
  });
};

module.exports = HelicopterPassenger;

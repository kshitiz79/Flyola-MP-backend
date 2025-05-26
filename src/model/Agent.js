
const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const Agent = sequelize.define(
  'Agent',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    agentId: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING(199),
      allowNull: false,
    },
    wallet_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    no_of_ticket_booked: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: null,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: null,
    },
  },
  {
    tableName: 'agents',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = Agent;

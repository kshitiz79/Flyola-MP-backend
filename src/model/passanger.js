const { DataTypes } = require("sequelize");
const sequelize = require("./../../db2");

const Passenger = sequelize.define(
  "Passenger",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    age: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    dob: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false, 
    },
    bookingId: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
    tableName: "passenger_details",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

Passenger.associate = (models) => {
  Passenger.belongsTo(models.Booking, { foreignKey: "bookingId" });
};

module.exports = Passenger;
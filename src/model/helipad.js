module.exports = (sequelize, DataTypes) => {
  const Helipad = sequelize.define('Helipad', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    helipad_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    helipad_code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    city: {
      type: DataTypes.STRING,
      allowNull: false
    },
    airport_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    airport_code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: '1=Active, 0=Inactive'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'airports', // Use airports table, not helipads
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Helipad;
};
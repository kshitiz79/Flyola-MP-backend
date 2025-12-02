module.exports = (sequelize, DataTypes) => {
  const Helipad = sequelize.define('Helipad', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    helipad_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    helipad_code: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: false
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
    tableName: 'helipads',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Helipad;
};
module.exports = (sequelize, DataTypes) => {
  const HelicopterSchedule = sequelize.define('HelicopterSchedule', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    helicopter_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'helicopters',
        key: 'id'
      }
    },
    departure_helipad_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'helipads',
        key: 'id'
      }
    },
    arrival_helipad_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'helipads',
        key: 'id'
      }
    },
    departure_time: {
      type: DataTypes.TIME,
      allowNull: false
    },
    arrival_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    via_stop_id: {
      type: DataTypes.JSON,
      defaultValue: []
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
    tableName: 'helicopter_schedules',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  HelicopterSchedule.associate = function(models) {
    HelicopterSchedule.belongsTo(models.Helicopter, {
      foreignKey: 'helicopter_id',
      as: 'Helicopter'
    });
    HelicopterSchedule.belongsTo(models.Helipad, {
      foreignKey: 'departure_helipad_id',
      as: 'DepartureLocation'
    });
    HelicopterSchedule.belongsTo(models.Helipad, {
      foreignKey: 'arrival_helipad_id',
      as: 'ArrivalLocation'
    });
  };

  return HelicopterSchedule;
};
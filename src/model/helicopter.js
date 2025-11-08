module.exports = (sequelize, DataTypes) => {
  const Helicopter = sequelize.define('Helicopter', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    helicopter_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    departure_day: {
      type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
      allowNull: false
    },
    start_helipad_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'airports',
        key: 'id'
      }
    },
    end_helipad_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'airports',
        key: 'id'
      }
    },
    helipad_stop_ids: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    seat_limit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 6
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
    tableName: 'helicopters',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Helicopter.associate = function(models) {
    Helicopter.belongsTo(models.Airport, {
      foreignKey: 'start_helipad_id',
      as: 'StartLocation'
    });
    Helicopter.belongsTo(models.Airport, {
      foreignKey: 'end_helipad_id',
      as: 'EndLocation'
    });
    Helicopter.hasMany(models.HelicopterSchedule, {
      foreignKey: 'helicopter_id',
      as: 'Schedules'
    });
  };

  return Helicopter;
};
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add refund columns to payments table
    await queryInterface.addColumn('payments', 'refund_id', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'user_id'
    });

    await queryInterface.addColumn('payments', 'refund_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      after: 'refund_id'
    });

    // Add refund columns to helicopter_payments table
    await queryInterface.addColumn('helicopter_payments', 'refund_id', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'user_id'
    });

    await queryInterface.addColumn('helicopter_payments', 'refund_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      after: 'refund_id'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove refund columns from payments table
    await queryInterface.removeColumn('payments', 'refund_amount');
    await queryInterface.removeColumn('payments', 'refund_id');

    // Remove refund columns from helicopter_payments table
    await queryInterface.removeColumn('helicopter_payments', 'refund_amount');
    await queryInterface.removeColumn('helicopter_payments', 'refund_id');
  }
};

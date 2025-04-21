// utils/validateIdsExist.js
module.exports = async function validateIdsExist(Model, ids) {
    const rows = await Model.findAll({ where: { id: ids } });
    if (rows.length !== ids.length) {
      const dbIds = rows.map((r) => r.id);
      const missing = ids.filter((id) => !dbIds.includes(id));
      throw new Error(`${Model.name} IDs not found: ${missing.join(', ')}`);
    }
  };
  
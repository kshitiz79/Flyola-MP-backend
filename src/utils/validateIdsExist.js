const validateIdsExist = async (Model, ids) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('No valid IDs provided for validation');
  }
  const validIds = ids.filter(id => Number.isInteger(id) && id > 0);
  if (validIds.length === 0) {
    throw new Error('No valid positive integer IDs provided');
  }
  const found = await Model.findAll({
    where: { id: validIds },
    attributes: ['id'],
  });
  const foundIds = found.map(item => item.id);
  const missingIds = validIds.filter(id => !foundIds.includes(id));
  if (missingIds.length > 0) {
    throw new Error(`Airport IDs not found: ${missingIds.join(', ')}`);
  }
};

module.exports = validateIdsExist;
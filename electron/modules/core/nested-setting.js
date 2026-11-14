function isObjectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergeNestedSettingValue(defaultValue, currentValue, field, value) {
  return {
    ...isObjectRecord(defaultValue),
    ...isObjectRecord(currentValue),
    [field]: value,
  };
}

module.exports = {
  mergeNestedSettingValue,
};

function mergeNestedSettingValue(currentValue, field, value) {
  const base =
    currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
      ? currentValue
      : {};

  return {
    ...base,
    [field]: value,
  };
}

module.exports = {
  mergeNestedSettingValue,
};

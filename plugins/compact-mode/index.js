// Shrinks the interface by lowering the root font size. Ascendara sizes its
// text, spacing and cards in rem, so they all scale together.
module.exports = {
  start(ascendara) {
    let removeStyle = null;

    const apply = settings => {
      if (removeStyle) removeStyle();
      const scale = Number(settings.scale) || 90;
      removeStyle = ascendara.addStyle(`html { font-size: ${scale}% !important; }`);
    };

    apply(ascendara.settings.all());
    ascendara.settings.onChange(apply);
  },
};

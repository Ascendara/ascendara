// @hutch cli=0.28.2 cottontail=0.7.3
// Pins the Electrobun toolchain. Build commands live in package.json
// (yarn start / yarn package) and scripts/build_support.py.
export default {
	// Dependencies stay on yarn; Hutch only runs the Electrobun toolchain.
	packageManager: "yarn",
	electrobun: {
		version: "2.0.5",
	},
};

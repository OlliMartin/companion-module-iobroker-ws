import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'
import jsdoc from 'eslint-plugin-jsdoc'
import tsdoc from 'eslint-plugin-tsdoc'

const companionRules = await generateEslintConfig({
	enableTypescript: true,
})

// Linter plugin to verify all public functions have proper (tsdoc-style, see below) documentation.
const requireJsDocConfiguration = {
	name: 'jsdoc-require-public',
	files: ['**/*.ts', '**/*.tsx'],
	plugins: {
		jsdoc,
	},
	languageOptions: {
		parserOptions: {
			project: './tsconfig.json',
			tsconfigRootDir: import.meta.dirname,
		},
	},
	rules: {
		'jsdoc/require-jsdoc': [
			'error',
			{
				publicOnly: {
					ancestorsOnly: true, // Checks exported/public modifiers
				},
				require: {
					FunctionDeclaration: true,
					MethodDefinition: true,
				},
				contexts: ['anyFunction'],
			},
		],
	},
}

// Verifies the structure of tsdoc comments themselves, i.e. compatibility with the tsdoc standard.
const verifyTsDocStructure = {
	name: 'tsdoc',
	plugins: {
		tsdoc,
	},
	rules: {
		'tsdoc/syntax': 'error',
	},
}

export default [...companionRules, requireJsDocConfiguration, verifyTsDocStructure]

import { StateInfo } from './types.js'

export const crossProduct = <A, B>(as: readonly A[], bs: readonly B[]): Array<readonly [A, B]> => {
	const result: Array<readonly [A, B]> = []
	for (const a of as) {
		for (const b of bs) {
			result.push([a, b] as const)
		}
	}
	return result
}

export function isValidIobObject(obj?: ioBroker.Object | null): obj is ioBroker.Object {
	return obj !== null && obj !== undefined
}

export const getStrByName = (stateValues: StateInfo[], name: string): string | null => {
	const matches = stateValues.filter((sv) => sv.definition.name === name)

	if (matches.length === 0) return null

	return typeof matches[0].value.val === 'string' ? matches[0].value.val : null
}

export const getNumByName = (stateValues: StateInfo[], name: string): number | null => {
	const matches = stateValues.filter((sv) => sv.definition.name === name)

	if (matches.length === 0) return null

	return typeof matches[0].value.val === 'number' ? matches[0].value.val : null
}

export const isValue = <VT>(vt: VT | undefined | null): vt is VT => {
	return !(vt === null || vt === undefined)
}

import { StateInfo } from './types.js'

/**
 * Validates that an ioBroker object is not null or undefined.
 * @param obj - The {@link ioBroker.Object} to test
 */
export function isValidIobObject(obj?: ioBroker.Object | null): obj is ioBroker.Object {
	return obj !== null && obj !== undefined
}

/**
 * Gets the value of the provided state name as string.
 * @param stateValues -  All state values detected by the type-detector including their currently cached ioBroker state
 * @param name - The name of the type-detector state to look up.
 * @remarks
 * This function returns null in case there is no state present or the type of the actual does not match string.
 */
export function getStrByName(stateValues: StateInfo[], name: string): string | null {
	const matches = stateValues.filter((sv) => sv.definition.name === name)

	if (matches.length === 0) return null

	return typeof matches[0].value.val === 'string' ? matches[0].value.val : null
}

/**
 * Gets the value of the provided state name as number.
 * @param stateValues -  All state values detected by the type-detector including their currently cached ioBroker state
 * @param name - The name of the type-detector state to look up.
 * @remarks
 * This function returns null in case there is no state present or the type of the actual does not match number.
 */
export function getNumByName(stateValues: StateInfo[], name: string): number | null {
	const matches = stateValues.filter((sv) => sv.definition.name === name)

	if (matches.length === 0) return null

	return typeof matches[0].value.val === 'number' ? matches[0].value.val : null
}

/**
 * Validates that any object is not null or undefined.
 * @param vt - The value type to test
 *
 *
 */
export function isValue<VT>(vt: VT | undefined | null): vt is VT {
	return !(vt === null || vt === undefined)
}

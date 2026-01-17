import { IioBrokerClient, StateInfo } from '../types.js'
import { Types } from '@iobroker/type-detector'
import { getNumByName, isValue } from '../utils.js'
import { combineRgb, splitRgb } from '@companion-module/base'

export const getColorDeviceAgnostic = (deviceId: string, type: Types, stateValues: StateInfo[]): number | null => {
	if (type === Types.rgb) {
		const red = getNumByName(stateValues, 'RED')
		const green = getNumByName(stateValues, 'GREEN')
		const blue = getNumByName(stateValues, 'BLUE')

		if (!isValue(red) || !isValue(green) || !isValue(blue)) return null

		return combineRgb(red, green, blue)
	}

	if (type === Types.hue) {
		return null
	}

	console.log(`[GET] Could not handle type=${type} for device ${deviceId}. This is very likely missing functionality.`)
	return null
}

export const setColorDeviceAgnostic = async (
	iobClient: IioBrokerClient,
	deviceId: string,
	type: Types,
	stateValues: StateInfo[],
	companionColor: number,
): Promise<void> => {
	if (type === Types.rgb) {
		const stateNames = new Set<string>(['RED', 'GREEN', 'BLUE'])
		const statesToFetch = stateValues.filter((sd) => stateNames.has(sd.definition.name))

		const stateMetaOpt = await Promise.all(statesToFetch.map(async (s) => iobClient.getObject(s.definition.id)))

		if (stateMetaOpt.filter((sm) => !sm || sm.common.type !== 'number' || sm.common.write !== true).length > 0) {
			console.log('Precondition not met. Exiting early.')
			return
		}

		const rgb = splitRgb(companionColor)

		const redId = statesToFetch.filter((s) => s.definition.name === 'RED')[0].definition.id
		const greenId = statesToFetch.filter((s) => s.definition.name === 'GREEN')[0].definition.id
		const blueId = statesToFetch.filter((s) => s.definition.name === 'BLUE')[0].definition.id
		await Promise.all([
			iobClient.setState(redId, rgb.r),
			iobClient.setState(greenId, rgb.g),
			iobClient.setState(blueId, rgb.b),
		])

		return
	}

	console.log(`[SET] Could not handle type=${type} for device ${deviceId}. This is very likely missing functionality.`)
}

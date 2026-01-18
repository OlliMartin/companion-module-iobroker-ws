import { IioBrokerClient, ILogger, StateInfo } from '../types.js'
import { Types } from '@iobroker/type-detector'
import { getNumByName, isValue } from '../utils.js'
import { combineRgb, splitRgb } from '@companion-module/base'
import { inject, injectable } from 'tsyringe'
import { DiTokens } from '../dependency-injection/tokens.js'

@injectable()
export class ColorHandler {
	/**
	 * Initializes a new instance of {@link ColorHandler}
	 * @param _logger - A logger
	 * @param _iobClient - An ioBroker websocket client to interact with the backend
	 */
	constructor(
		@inject(DiTokens.Logger) private readonly _logger: ILogger,
		@inject(DiTokens.IoBrokerClient) private readonly _iobClient: IioBrokerClient,
	) {}

	public getColorDeviceAgnostic = (deviceId: string, type: Types, stateValues: StateInfo[]): number | null => {
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

		this._logger.logWarning(
			`[GET] Could not handle type=${type} for device ${deviceId}. This is very likely missing functionality.`,
		)
		return null
	}

	public setColorDeviceAgnostic = async (
		deviceId: string,
		type: Types,
		stateValues: StateInfo[],
		companionColor: number,
	): Promise<void> => {
		if (type === Types.rgb) {
			const stateNames = new Set<string>(['RED', 'GREEN', 'BLUE'])
			const statesToFetch = stateValues.filter((sd) => stateNames.has(sd.definition.name))

			const stateMetaOpt = await Promise.all(statesToFetch.map(async (s) => this._iobClient.getObject(s.definition.id)))

			if (stateMetaOpt.filter((sm) => !sm || sm.common.type !== 'number' || sm.common.write !== true).length > 0) {
				this._logger.logWarning('Precondition not met: ioBroker state does not fulfill constraints. Exiting early.')
				return
			}

			const rgb = splitRgb(companionColor)

			const redId = statesToFetch.filter((s) => s.definition.name === 'RED')[0].definition.id
			const greenId = statesToFetch.filter((s) => s.definition.name === 'GREEN')[0].definition.id
			const blueId = statesToFetch.filter((s) => s.definition.name === 'BLUE')[0].definition.id
			await Promise.all([
				this._iobClient.setState(redId, rgb.r),
				this._iobClient.setState(greenId, rgb.g),
				this._iobClient.setState(blueId, rgb.b),
			])

			return
		}

		this._logger.logWarning(
			`[SET] Could not handle type=${type} for device ${deviceId}. This is very likely missing functionality.`,
		)
	}
}

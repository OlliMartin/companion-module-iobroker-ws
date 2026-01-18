import ChannelDetector, { DetectOptions, DetectorState, Types } from '@iobroker/type-detector'
import { inject, injectable } from 'tsyringe'
import { DiTokens } from './dependency-injection/tokens.js'
import { IEntityState, ILogger, StateInfo } from './types.js'
import debounceFn from 'debounce-fn'
import { DebouncedFunction } from 'debounce-fn'

const reuseCacheForMs: number = 15 * 1000

@injectable()
export class DeviceClassifier {
	private lastCalculationTimestamp: number | null = null
	private typeByDevice: Record<string, Types> | null = null
	private statesByDevice: Record<string, DetectorState[]> | null = null

	private readonly categorizeChannelsDebounced: DebouncedFunction<
		[],
		{
			typeByDevice: Record<string, Types>
			statesByDevice: Record<string, DetectorState[]>
		}
	>

	/**
	 * Initializes a new instance of {@link DeviceClassifier}
	 * @param _logger - A logger
	 * @param _entityState - The local (cached) ioBroker state (read-only)
	 */
	constructor(
		@inject(DiTokens.Logger) private readonly _logger: ILogger,
		@inject(DiTokens.State) private readonly _entityState: IEntityState,
	) {
		this.categorizeChannelsDebounced = debounceFn(this.categorizeChannelsCached.bind(this), {
			wait: 20,
			maxWait: 20,
			before: true,
		})
	}

	/**
	 * Retrieves the channel/device to type mapping over all detected devices.
	 */
	public getTypesByChannel(): Record<string, Types> {
		return this.categorizeChannelsDebounced().typeByDevice
	}

	/**
	 * Retrieves all mapped/detected states by device/channel identifier.
	 * @param deviceId - The device identifier, i.e. ioBroker tree path, to search for.
	 * @remarks
	 * The returned {@link DetectorState} allows to abstract over state-specifics by looking up the standardized state names,
	 * instead of the identifier in the specific ioBroker server.
	 */
	public getStatesByDevice(deviceId: string): DetectorState[] {
		const statesByDevice = this.categorizeChannelsDebounced().statesByDevice
		return Object.hasOwnProperty.call(statesByDevice, deviceId) ? statesByDevice[deviceId] : []
	}

	/**
	 * Retrieves the type of device for a given identifier, including metadata about the detected/expected states and their respective current value.
	 * @param deviceId - The device identifier, i.e. ioBroker tree path, to search for.
	 * @remarks
	 * This function returns type={@link Types.unknown} iff
	 * * The device could not be classified
	 * * No states are available for the device in the cache
	 */
	public getStateInfoByDevice(deviceId: string): { typeOfDevice: Types; stateValues: StateInfo[] } {
		const state = this._entityState.getStates()

		const typeOfDevice = this.getTypeByDevice(deviceId)
		const statesOfDevice = this.getStatesByDevice(deviceId)

		if (!typeOfDevice || statesOfDevice.length === 0) {
			return {
				typeOfDevice: Types.unknown,
				stateValues: [],
			}
		}

		const stateValues = statesOfDevice
			.map((stateDef) => ({ definition: stateDef, value: state.get(stateDef.id) }))
			.filter((tuple) => tuple.value !== undefined)
			.map((tuple) => ({ ...tuple, value: tuple.value! }))

		return { typeOfDevice, stateValues }
	}

	/**
	 * Forces recalculation of the detected types on the next invocation.
	 * @remarks
	 * This function is called after re-syncing the ioBroker object tree.
	 */
	public clear(): void {
		this.lastCalculationTimestamp = null
		this.typeByDevice = null
		this.statesByDevice = null
	}

	private getTypeByDevice(deviceId: string): Types | null {
		const typesByChannel = this.getTypesByChannel()
		return Object.hasOwnProperty.call(typesByChannel, deviceId) ? typesByChannel[deviceId] : null
	}

	private categorizeChannelsCached(): {
		typeByDevice: Record<string, Types>
		statesByDevice: Record<string, DetectorState[]>
	} {
		if (
			this.lastCalculationTimestamp &&
			Date.now() < this.lastCalculationTimestamp + reuseCacheForMs &&
			this.typeByDevice &&
			this.statesByDevice
		) {
			this._logger.logTrace(
				`Cache hit when getting device type categorization. Will reevaluate at ${new Date(this.lastCalculationTimestamp + reuseCacheForMs)}.`,
			)
			return { typeByDevice: this.typeByDevice, statesByDevice: this.statesByDevice }
		}

		if (this.lastCalculationTimestamp) {
			const expiredAt = new Date(this.lastCalculationTimestamp + reuseCacheForMs)
			this._logger.logDebug(`Cache expired at ${expiredAt}. Recalculating device type classification.`)
		}

		const iobObjects = this._entityState.getObjects()
		const startMs = Date.now()
		this._logger.logDebug(`Received ${iobObjects.length} ioBroker objects to classify.`)

		const detector = new ChannelDetector.default()
		const objectLookup: Record<string, ioBroker.Object> = iobObjects.reduce(
			(prev, curr) => ({ ...prev, [curr._id]: curr }),
			{},
		)

		const baseOptions: DetectOptions = {
			objects: objectLookup,
			id: '%%%TEMPLATE_VALUE%%%',
			detectOnlyChannel: true,
		}
		const replacementRegex = new RegExp('\\.([^.]*)$')
		const channelIds = [...new Set(iobObjects.map((o) => o._id).map((id) => id.replace(replacementRegex, '')))]

		const typeByDevice: Record<string, Types> = {}
		const statesByDevice: Record<string, DetectorState[]> = {}

		let usedIds: string[] = []
		for (const channelId of channelIds) {
			const options = {
				...baseOptions,
				id: channelId,
				usedIds: usedIds,
			}

			const detectionResult = detector.detect(options)
			if (!detectionResult || detectionResult.length === 0) {
				continue
			}

			typeByDevice[channelId] = detectionResult[0].type
			statesByDevice[channelId] = detectionResult[0].states

			usedIds = usedIds.concat(detectionResult[0].states.map((s) => s.id))
		}

		this._logger.logInfo(
			`Classified ${iobObjects.length} objects into ${Object.keys(typeByDevice).length} devices in ${Date.now() - startMs}ms`,
		)
		this.lastCalculationTimestamp = Date.now()
		this.typeByDevice = typeByDevice
		this.statesByDevice = statesByDevice

		return {
			typeByDevice,
			statesByDevice,
		}
	}
}

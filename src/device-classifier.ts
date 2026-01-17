import ChannelDetector, { DetectOptions, DetectorState, Types } from '@iobroker/type-detector'
import { inject, injectable } from 'tsyringe'
import { DiTokens } from './dependency-injection/tokens.js'
import { ILogger } from './types.js'

@injectable()
export class DeviceClassifier {
	private readonly _logger: ILogger

	private typeByDevice: Record<string, Types> | null = null
	private statesByDevice: Record<string, DetectorState[]> | null = null

	constructor(@inject(DiTokens.Logger) logger: ILogger) {
		this._logger = logger
	}

	public populateObjects(iobObjects: ioBroker.Object[]): void {
		const startMs = Date.now()
		this._logger.logDebug(`Received ${iobObjects.length} ioBroker objects to classify.`)

		const { typeByDevice, statesByDevice } = this.categorizeChannels(iobObjects)

		this.typeByDevice = typeByDevice
		this.statesByDevice = statesByDevice

		this._logger.logInfo(
			`Classified ${iobObjects.length} objects into ${Object.keys(typeByDevice).length} devices in ${Date.now() - startMs}ms`,
		)
	}

	public getTypesByChannel(): Record<string, Types> {
		if (!this.typeByDevice) {
			return {}
		}

		return this.typeByDevice
	}

	public getTypeByDevice(deviceId: string): Types | null {
		if (this.typeByDevice == null) {
			return null
		}

		return Object.hasOwnProperty.call(this.typeByDevice, deviceId) ? this.typeByDevice[deviceId] : null
	}

	public getStatesByDevice(deviceId: string): DetectorState[] {
		if (this.statesByDevice == null) {
			return []
		}

		return Object.hasOwnProperty.call(this.statesByDevice, deviceId) ? this.statesByDevice[deviceId] : []
	}

	private categorizeChannels(iobObjects: ioBroker.Object[]): {
		typeByDevice: Record<string, Types>
		statesByDevice: Record<string, DetectorState[]>
	} {
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

		return {
			typeByDevice,
			statesByDevice,
		}
	}
}

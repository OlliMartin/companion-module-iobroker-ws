import { CompanionActionDefinitions, CompanionFeedbackDefinitions } from '@companion-module/base'
import { Types } from '@iobroker/type-detector'
import { IDeviceHandler } from '../types.js'

export class LightHandler implements IDeviceHandler {
	getHandledTypes(): Types[] {
		return [Types.rgb]
	}
	getActionDefinitions(): CompanionActionDefinitions {
		throw new Error('Method not implemented.')
	}
	getFeedbackDefinitions(): CompanionFeedbackDefinitions {
		throw new Error('Method not implemented.')
	}
}

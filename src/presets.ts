import type { ModuleInstance } from './main.js'
import { CompanionPresetDefinitions, combineRgb } from '@companion-module/base'

/**
 * Populates the module's presets.
 * @param self - A reference to the module instance
 */
export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions = {}

	// Seems presets cannot store local variables currently.
	// This makes basically _everything_ a lot harder and is really unfortunate.
	// There is a github issue already:
	// https://github.com/bitfocus/companion/issues/3893
	if (self.config.developmentMode) {
		presets['light'] = {
			type: 'button',
			name: '[DBG] Light Test',
			category: 'Device Test: Lights',
			style: {
				text: '$(local:type): $(local:value)',
				size: 'auto',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 0, 0),
			},
			steps: [
				{
					name: 'Set Color',
					down: [
						{
							actionId: 'lightColor',
							options: {},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'ReadColorOfLight',
					options: {},
				},
			],
		}
	}

	self.setPresetDefinitions(presets)
}

import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	protocol: 'ws:' | 'wss:'
	host: string
	port: number
	ignoreNotAcknowledged: boolean
	additionalNamespaces: string
	loadAllAliases: boolean
	developmentMode: boolean
	traceLogs: boolean
}

/**
 * Gets the configuration of the module's configuration UI.
 */
export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'dropdown',
			id: 'protocol',
			label: 'Protocol',
			width: 8,
			choices: [
				{ id: 'ws', label: 'ws' },
				{ id: 'wss', label: 'WSS' },
			],
			default: 'wss',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Host',
			width: 8,
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 8444,
		},
		{
			type: 'checkbox',
			id: 'ignoreNotAcknowledged',
			label: 'Ignore non-acknowledged state changes',
			width: 4,
			default: true,
		},
		{
			type: 'checkbox',
			id: 'loadAllAliases',
			label: 'Load all Aliases',
			width: 4,
			default: true,
		},
		{
			type: 'textinput',
			id: 'additionalNamespaces',
			label: 'Additional Namespace (CSV)',
			width: 8,
			regex: '^[\\w\\d][\\w\\d\\.]+[\\w\\d]$',
		},
		{
			type: 'checkbox',
			id: 'developmentMode',
			label: 'Enable Development Mode',
			width: 4,
			default: false,
		},
		{
			type: 'checkbox',
			id: 'traceLogs',
			label: 'Enable Trace Logs',
			description: 'Warning: Enabling this setting will produce a lot of logs.',
			width: 4,
			default: false,
		},
	]
}

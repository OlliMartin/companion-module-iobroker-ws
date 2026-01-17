import { InstanceBase, LogLevel } from '@companion-module/base'
import type { ModuleConfig } from '../config.js'
import { ILogger } from '../types.js'
import { inject, injectable } from 'tsyringe'
import { DiTokens } from '../dependency-injection/tokens.js'

@injectable()
export class CompanionLogger implements ILogger {
	private module: InstanceBase<ModuleConfig>

	constructor(@inject(DiTokens.Module) module: InstanceBase<ModuleConfig>) {
		if (!module) {
			throw new Error('ArgumentNullError: module')
		}

		this.module = module
	}

	public log(level: LogLevel, message: string): void {
		this.module.log(level, message)
	}

	logTrace = (message: string): void => {
		// TODO: Config flag to enable trace logs?!
		this.log('debug', `[TRACE] ${message}`)
	}
	logDebug = (message: string): void => this.log('debug', message)
	logInfo = (message: string): void => this.log('info', message)
	logWarning = (message: string): void => this.log('warn', message)
	logError = (message: string): void => this.log('error', message)
}

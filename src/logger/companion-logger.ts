import { InstanceBase, LogLevel } from '@companion-module/base'
import type { ModuleConfig } from '../config.js'
import { ILogger } from '../types.js'
import { inject, injectable } from 'tsyringe'
import { DiTokens } from '../dependency-injection/tokens.js'

@injectable()
export class CompanionLogger implements ILogger {
	private traceEnabled: boolean = false

	/**
	 * Initializes a new instance of {@link CompanionLogger}
	 * @param _module - The instance of the module
	 * @param _configAccessor - A delegate to retrieve the modules configuration
	 */
	constructor(
		@inject(DiTokens.Module) private readonly _module: InstanceBase<ModuleConfig>,
		@inject(DiTokens.ModuleConfigurationAccessor) private readonly _configAccessor: () => ModuleConfig,
	) {
		this.traceEnabled = _configAccessor().traceLogs
	}

	/**
	 * Callback invoked on module configuration change.
	 * @remarks
	 * This is done for performance reasons; We do not want to invoke the configuration callback on each {@link logTrace} invocation.
	 */
	public configUpdated(): void {
		this.traceEnabled = this._configAccessor().traceLogs
	}

	/** {@inheritDoc ILogger.log} */
	public log(level: LogLevel, message: string): void {
		this._module.log(level, message)
	}

	/** {@inheritDoc ILogger.logTrace} */
	logTrace = (message: string): void => {
		if (!this.traceEnabled) {
			return
		}

		this.log('debug', `[TRACE] ${message}`)
	}
	/** {@inheritDoc ILogger.logDebug} */
	logDebug = (message: string): void => this.log('debug', message)
	/** {@inheritDoc ILogger.logInfo} */
	logInfo = (message: string): void => this.log('info', message)
	/** {@inheritDoc ILogger.logWarning} */
	logWarning = (message: string): void => this.log('warn', message)
	/** {@inheritDoc ILogger.logError} */
	logError = (message: string): void => this.log('error', message)
}

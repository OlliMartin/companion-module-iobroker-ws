import 'reflect-metadata'

import { InstanceBase, runEntrypoint, SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdatePresets } from './presets.js'

import { FeedbackType } from './feedback-type.js'

import { DeviceClassifier } from './device-classifier.js'
import { DependencyRegistry } from './dependency-injection/dependency-registry.js'
import { DependencyContainer } from 'tsyringe'
import { IoBrokerWsClient } from './io-broker/io-broker-ws-client.js'
import { IActionConfiguration, IFeedbackConfiguration, ILogger } from './types.js'
import { DiTokens } from './dependency-injection/tokens.js'

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()

	private readonly _diContainer: DependencyContainer

	private touchLastChangedFeedbacksTimeout: NodeJS.Timeout | null = null

	/**
	 * Initializes the ioBroker-ws instance. Called by the module base.
	 * @param internal - Unknown parameter.
	 */
	constructor(internal: unknown) {
		super(internal)

		this._diContainer = DependencyRegistry.CreateRegistry(this, this.getConfig.bind(this)).Build()
	}

	/**
	 * Request all feedbacks of the specified types to be checked for changes
	 * @param feedbackTypes - The feedback types to check
	 */
	public checkFeedbacks(...feedbackTypes: FeedbackType[]): void {
		super.checkFeedbacks(...feedbackTypes)
	}

	/**
	 * Wraps the base modules function by eliminating the spread operator, which seems to cause issues when used in callbacks.
	 * @param feedbackIds - The feedback IDs, not types, to verify model changes for.
	 */
	public checkFeedbacksByIdAsCb(feedbackIds: string[]): void {
		super.checkFeedbacksById(...feedbackIds)
	}

	/**
	 * Initializes the module, specifically:
	 * * Creating the websocket client
	 * * Connecting to ioBroker
	 * * Fetching all desired objects (by iob namespace)
	 * * Populating the companion configuration (Actions, Feedbacks, Presets, [...])
	 * * Creating a timer to periodically trigger feedback checks on 'timestamped' feedbacks
	 * * Subscribing to all feedbacks
	 * @param config - The current configuration of the module
	 */
	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		const wsClient = await this.getIobWsClient().connectAsync(this.updateStatus.bind(this))
		wsClient.setFeedbackCheckCb(this.checkFeedbacksByIdAsCb.bind(this))

		await wsClient.loadIobObjectsAsync()

		this.updateModuleConfigurations()

		this.touchLastChangedFeedbacksTimeout = setInterval(this.checkLastChangedFeedbacks.bind(this), 1_000)

		this.subscribeFeedbacks()
	}

	/**
	 * Disconnects the websocket client and disposes the DI container, clearing all timers if present.
	 */
	async destroy(): Promise<void> {
		try {
			await this.disconnectAsync()
			await this._diContainer.dispose()
		} catch (_e) {
			// Ignore
		}

		this.clearTimeouts()

		this.log('debug', `destroy ${this.id}`)
	}

	/**
	 * Invoked if the user updated the configuration in the companion UI.
	 *
	 * On invocation,
	 * * the websocket client will be disconnected
	 * * all volatile data, such as state and object caches, will be cleared
	 * * and all subscriptions will be re-evaluated.
	 * The 'restarting' of the clients is achieved by calling the init function of the module.
	 * @param config - The updated module configuration
	 */
	public async configUpdated(config: ModuleConfig): Promise<void> {
		this.log('debug', 'Received config update.')

		this.config = config
		this.getLogger().configUpdated()

		this.getDeviceClassifier().clear()
		await this.disconnectAsync()

		await this.init(config)
	}

	/**
	 * Periodically triggers re-evaluation of the feedbacks of types
	 * * {@link FeedbackType.ReadLastUpdated}
	 * @remarks
	 *
	 * For feedbacks of type {@link FeedbackType.ReadLastUpdated} only the timestamp is stored in the {@link IEntityState}.
	 * This means variables referencing the timestamp would not trigger a refresh of the ui, for example to build a button
	 * that tracks the duration since the last state chance.
	 *
	 * To work around this said feedback types are periodically checked.
	 */
	private checkLastChangedFeedbacks() {
		this.checkFeedbacks(FeedbackType.ReadLastUpdated)
	}

	/**
	 * Retrieves the current configuration of the module.
	 *
	 * @remarks
	 * This function is passed along as a factory to the dependency injection container,
	 * since we do not perform a configuration merge on update. This approach prevents dependent services
	 * having an outdated configuration version after the user triggered an update.
	 */
	getConfig(): ModuleConfig {
		return this.config
	}

	/**
	 * Returns the configuration for the module instance UI
	 */
	public getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	private clearTimeouts(): void {
		if (this.touchLastChangedFeedbacksTimeout) {
			clearInterval(this.touchLastChangedFeedbacksTimeout)
		}
	}

	private async disconnectAsync(): Promise<void> {
		const wsClient = this.getIobWsClient()
		if (!wsClient.isConnected()) {
			return
		}

		await wsClient.disconnectAsync(this.updateStatus.bind(this))
	}

	/**
	 * Triggers initial or incremental updates of the module's
	 * * Actions
	 * * Feedbacks
	 * * Presets
	 * * Variable Definitions
	 */
	private updateModuleConfigurations(): void {
		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()
	}

	private updateActions(): void {
		this.getActionConfiguration().updateActions(this.setActionDefinitions.bind(this))
	}

	private updateFeedbacks(): void {
		this.getFeedbackConfiguration().updateFeedbacks(this.setFeedbackDefinitions.bind(this))
	}

	private updatePresets(): void {
		UpdatePresets(this)
	}

	private updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	// DI ACCESSORS
	private getIobWsClient(): IoBrokerWsClient {
		return this._diContainer.resolve(IoBrokerWsClient)
	}

	private getLogger(): ILogger {
		return this._diContainer.resolve(DiTokens.Logger)
	}

	private getDeviceClassifier(): DeviceClassifier {
		return this._diContainer.resolve(DeviceClassifier)
	}

	private getActionConfiguration(): IActionConfiguration {
		return this._diContainer.resolve(DiTokens.ActionConfiguration)
	}

	private getFeedbackConfiguration(): IFeedbackConfiguration {
		return this._diContainer.resolve(DiTokens.FeedbackConfiguration)
	}
	// DI ACCESSORS
}

runEntrypoint(ModuleInstance, UpgradeScripts)

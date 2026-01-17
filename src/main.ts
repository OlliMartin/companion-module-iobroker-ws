import 'reflect-metadata'

import { InstanceBase, runEntrypoint, SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdatePresets } from './presets.js'

import { FeedbackId } from './feedback.js'

import { DeviceClassifier } from './device-classifier.js'
import { DependencyRegistry } from './dependency-injection/dependency-registry.js'
import { DependencyContainer } from 'tsyringe'
import { IoBrokerWsClient } from './io-broker/io-broker-ws-client.js'
import { IActionConfiguration, IFeedbackConfiguration } from './types.js'
import { DiTokens } from './dependency-injection/tokens.js'

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()

	private readonly _diContainer: DependencyContainer

	private touchLastChangedFeedbacksTimeout: NodeJS.Timeout | null = null

	constructor(internal: unknown) {
		super(internal)

		this._diContainer = DependencyRegistry.CreateRegistry(this, () => this.config).Build()
	}

	// TODO
	/* For the services resolved from DI, implement a wrapper methdo that type-checks the registration */
	private getIobWsClient(): IoBrokerWsClient {
		return this._diContainer.resolve(IoBrokerWsClient)
	}

	private getActionConfiguration(): IActionConfiguration {
		return this._diContainer.resolve(DiTokens.ActionConfiguration)
	}

	private getFeedbackConfiguration(): IFeedbackConfiguration {
		return this._diContainer.resolve(DiTokens.FeedbackConfiguration)
	}
	// DI STUFF END

	public checkFeedbacks(...feedbackTypes: FeedbackId[]): void {
		super.checkFeedbacks(...feedbackTypes)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		const wsClient = await this.getIobWsClient().connectAsync(this.updateStatus.bind(this))
		wsClient.getSubscribedIds()

		if (!wsClient.isConnected()) {
			return
		}

		const iobObjects = await wsClient.loadIobObjectsAsync()
		this._diContainer.resolve(DeviceClassifier).populateObjects(iobObjects)

		if (!!iobObjects && iobObjects.length > 0) {
			this.updateActions()
			this.updateFeedbacks()
		}

		this.updatePresets()
		this.updateVariableDefinitions()

		await this.configUpdated(this.config)

		this.touchLastChangedFeedbacksTimeout = setInterval(this.checkLastChangedFeedbacks.bind(this), 1_000)
	}

	// When module gets deleted
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

		await wsClient.disconnectAsync()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.log('debug', 'Received config update.')

		this.config = config

		await this.disconnectAsync()
		const wsClient = await this.getIobWsClient().connectAsync(this.updateStatus.bind(this))

		if (!wsClient.isConnected) {
			this.log('debug', 'Either client is null or connected false. Stopping config update.')
			return
		}

		this.log('debug', 'Subscribing feedbacks.')
		this.subscribeFeedbacks()
	}

	private checkLastChangedFeedbacks() {
		this.checkFeedbacks(FeedbackId.ReadLastUpdated)
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		this.getActionConfiguration().updateActions(this.setActionDefinitions.bind(this))
	}

	updateFeedbacks(): void {
		this.getFeedbackConfiguration().updateFeedbacks(this.setFeedbackDefinitions.bind(this))
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)

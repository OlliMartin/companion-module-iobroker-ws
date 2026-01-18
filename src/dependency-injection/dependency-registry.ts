import { container, DependencyContainer, registry } from 'tsyringe'
import { IoBrokerWsClient } from '../io-broker/io-broker-ws-client.js'
import { Lifecycle } from 'tsyringe'
import { InstanceBase } from '@companion-module/base'
import type { ModuleConfig } from '../config.js'
import { DiTokens } from './tokens.js'
import { CompanionLogger } from '../logger/companion-logger.js'
import { IoBrokerState } from '../states/io-broker-state.js'
import { IEntityState, IMutableState, IioBrokerClient } from '../types.js'
import { SubscriptionState } from '../states/subscription-state.js'
import { SubscriptionManager } from '../subscription-manager.js'
import { ActionConfiguration } from '../actions.js'
import { FeedbackConfiguration } from '../feedbacks.js'
import { DeviceHandlerRegistry } from '../device-handlers/device-handler-registry.js'
import { DeviceClassifier } from '../device-classifier.js'

@registry([
	{ token: DependencyRegistry, useClass: DependencyRegistry, options: { lifecycle: Lifecycle.Singleton } },

	// Utility
	{ token: DiTokens.Logger, useClass: CompanionLogger, options: { lifecycle: Lifecycle.Singleton } },

	// Websocket connection
	{ token: IoBrokerWsClient, useClass: IoBrokerWsClient, options: { lifecycle: Lifecycle.Singleton } },
	{ token: DiTokens.IoBrokerClient, useFactory: (di) => di.resolve(IoBrokerWsClient) as IioBrokerClient },

	// State Management
	{ token: IoBrokerState, useClass: IoBrokerState, options: { lifecycle: Lifecycle.Singleton } },
	{ token: DiTokens.State, useFactory: (di) => di.resolve(IoBrokerState) as IEntityState },
	{ token: DiTokens.MutableState, useFactory: (di) => di.resolve(IoBrokerState) as IMutableState },

	{ token: DiTokens.SubscriptionState, useClass: SubscriptionState, options: { lifecycle: Lifecycle.Singleton } },
	{ token: DiTokens.SubscriptionManager, useClass: SubscriptionManager, options: { lifecycle: Lifecycle.Singleton } },

	// Device Classification
	{ token: DeviceClassifier, useClass: DeviceClassifier, options: { lifecycle: Lifecycle.Singleton } },

	// Module Configuration
	{ token: DiTokens.ActionConfiguration, useClass: ActionConfiguration, options: { lifecycle: Lifecycle.Singleton } },
	{
		token: DiTokens.FeedbackConfiguration,
		useClass: FeedbackConfiguration,
		options: { lifecycle: Lifecycle.Singleton },
	},
	{ token: DeviceHandlerRegistry, useClass: DeviceHandlerRegistry },
])
export class DependencyRegistry {
	private static Container: DependencyContainer = container
	private readonly _childContainer: DependencyContainer

	private _isBuilt: boolean = false

	/**
	 * Initializes a new instance of the {@link DependencyRegistry}.
	 * @param childContainer - The base tsyringe container with module-agnostic dependencies already registered.
	 */
	constructor(childContainer: DependencyContainer) {
		this._childContainer = childContainer
	}

	/**
	 * Initializes the dependency injection container by registring the provided module instance and configuration callback.
	 * @param module - The instance of the starting/running companion module
	 * @param configFactory - A callback that returns the current module configuration
	 */
	public static CreateRegistry(
		module: InstanceBase<ModuleConfig>,
		configFactory: () => ModuleConfig,
	): DependencyRegistry {
		const childContainer = DependencyRegistry.Container.createChildContainer()

		childContainer.register(DiTokens.Module, { useValue: module })
		childContainer.register(DiTokens.ModuleConfigurationAccessor, { useValue: configFactory })

		return new DependencyRegistry(childContainer)
	}

	/**
	 * Builds the dependency injection container with the provided module and configuration instances and returns it.
	 * @remarks
	 * This function may only be called once on any given registry.
	 */
	public Build(): DependencyContainer {
		this.ThrowIffBuilt()
		return this._childContainer
	}

	private ThrowIffBuilt(): void {
		if (this._isBuilt) {
			throw new Error('Container has already been built')
		}
	}
}

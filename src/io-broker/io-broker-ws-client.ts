import { InstanceStatus } from '@companion-module/base'
import { Connection } from '@iobroker/socket-client-backend'
import { inject, injectable } from 'tsyringe'

import { ILogger, IMutableState, IioBrokerClient, ISubscriptionState } from '../types.js'
import { DiTokens } from '../dependency-injection/tokens.js'
import { ModuleConfig } from '../config.js'
import { isValidIobObject } from '../utils.js'

import { setTimeout as delay } from 'node:timers/promises'

@injectable()
export class IoBrokerWsClient implements IioBrokerClient {
	private client: Connection | null = null
	private connectPromise: Promise<boolean> | null = null
	private feedbackCheckCb: ((feedbackIds: string[]) => void) | null = null

	private subscribedEntityIds: string[] | null = null

	private connected: boolean = false

	/**
	 * Initializes a new instance of {@link IoBrokerWsClient}
	 * @param _logger - A logger
	 * @param _configAccessor - A delegate to retrieve the modules configuration
	 * @param _mutableState - The local (cached) ioBroker state (writeable)
	 * @param _subscriptionState - The subscription state used to track feedbacks
	 */
	public constructor(
		@inject(DiTokens.Logger) private readonly _logger: ILogger,
		@inject(DiTokens.ModuleConfigurationAccessor) private readonly _configAccessor: () => ModuleConfig,
		@inject(DiTokens.MutableState) private readonly _mutableState: IMutableState,
		@inject(DiTokens.SubscriptionState) private readonly _subscriptionState: ISubscriptionState,
	) {}

	/**
	 * Attempts to connect to the configure ioBroker websocket server.
	 * @param updateStatus - A delegate to update the companion module {@link InstanceStatus}
	 * @param forceReconnect - [Flag] If `true` is provided a potentially running connection process is not reused and a new websocket client is created
	 */
	public async connectAsync(
		updateStatus: (status: InstanceStatus, msg?: string) => void,
		forceReconnect?: boolean,
	): Promise<IoBrokerWsClient> {
		await this.tryConnectAsync(updateStatus, forceReconnect)
		return this
	}

	/**
	 * Gets a flag indicating whether the underlying websocket client is successfully connected to the ioBroker server.
	 */
	public isConnected(): boolean {
		return this.connected
	}

	private async tryConnectAsync(
		updateStatus: (status: InstanceStatus, msg?: string) => void,
		forceReconnect?: boolean,
	): Promise<boolean> {
		if (forceReconnect) {
			this.connectPromise = null
		}

		let badConnection = false
		const throwAfter = async (delayMs: number): Promise<boolean> => {
			await delay(delayMs)
			badConnection = true
			// eslint-disable-next-line @typescript-eslint/only-throw-error
			throw `Could not connect to host: '${this._configAccessor().host}' within ${delayMs / 1000} seconds.`
		}

		const connectInternal = async () => {
			const startMs = Date.now()

			const config = this._configAccessor()
			updateStatus(InstanceStatus.Connecting, `Trying to connect to host: '${config.host}'.`)

			this.client = new Connection({
				protocol: config.protocol,
				host: config.host,
				port: config.port,
				doNotLoadAllObjects: true,
				doNotLoadACL: true,
				onLog: (_) => null,
			})

			try {
				await this.client.startSocket()

				await Promise.race([throwAfter(2_000), this.client.waitForFirstConnection()])

				updateStatus(InstanceStatus.Ok, `Connected successfully in ${Date.now() - startMs}ms.`)
				this.connected = true

				// Config Updated Scenario
				if (this.subscribedEntityIds) {
					await this.subscribeStates(this.subscribedEntityIds)
				}

				return true
			} catch (err: unknown) {
				this.client = null

				const errorMsg = typeof err === 'string' ? err : JSON.stringify(err)

				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				badConnection
					? updateStatus(InstanceStatus.ConnectionFailure, errorMsg)
					: updateStatus(InstanceStatus.UnknownError, errorMsg)

				this.connected = false

				return false
			} finally {
				this.connectPromise = null

				this._logger.logInfo(
					`Connection attempt finished after ${Date.now() - startMs}ms. Connected: ${this.connected}`,
				)
			}
		}

		this.connectPromise ??= connectInternal()

		const result = await this.connectPromise
		this._logger.logInfo(`Connection successful: ${result}`)
		return result
	}

	/**
	 * Loads all ioBroker objects from the remote server and stores them in the {@link IMutableState}.
	 */
	public async loadIobObjectsAsync(): Promise<ioBroker.Object[]> {
		if (!this.ensureClient(this.client)) {
			return []
		}

		const loadAllStateDetails = (
			client: Connection,
			states: Record<string, ioBroker.State>,
		): ioBroker.GetObjectPromise<string>[] => {
			return Object.keys(states).map(async (stateId) => client.getObject(stateId))
		}

		const startMs = Date.now()
		const subscriptions = this.getObjectSubscriptions()

		const states = (await Promise.all(subscriptions.map(async (s) => this.client!.getStates(s)))).reduce(
			(prev, curr) => ({ ...prev, ...curr }),
			{},
		)

		const stateInfo = await Promise.all(loadAllStateDetails(this.client, states))

		const validObjects = stateInfo.filter(isValidIobObject)
		this._mutableState.setObjects(validObjects)

		this._logger.logDebug(
			`Retrieved ${validObjects.length} (${Object.keys(states).length}) states from ${subscriptions.length} subscriptions (namespaces) in ${Date.now() - startMs}ms.`,
		)

		return validObjects
	}

	private getObjectSubscriptions(): string[] {
		const config = this._configAccessor()
		const namespaces = config.additionalNamespaces
			.split(',')
			.map((i) => i.trim())
			.filter((i) => i.length > 0)
			.map((i) => `${i}.*`)

		if (config.loadAllAliases) {
			namespaces.push('alias.*')
		}

		// TODO: This code can lead to a user specifying namespace overlaps which would subscribe to the
		// same object multiple times.
		// Since the objects form a tree we can detect this and ignore sub-subscriptions.

		this._logger.logDebug(`Determined subscriptions: [${namespaces.join(', ')}].`)
		return namespaces
	}

	/**
	 * Configures the underlying websocket client to subscribe to all provided state identifiers.
	 * @param stateIds - The state identifiers (ioBroker fully-qualified ids) to subscribe to
	 * @remarks The {@link IoBrokerWsClient} will store a copy of the subscription ids locally to reference them later. See {@link getSubscribedIds}
	 */
	public async subscribeStates(stateIds: string[]): Promise<void> {
		if (!this.ensureClient(this.client)) {
			this._logger.logWarning('Tried to subscribe to states, but client is not set or connected.')
			return Promise.resolve()
		}

		this._logger.logInfo(`Subscribing to ${stateIds.length} states.`)
		this.subscribedEntityIds = stateIds

		await this.client.subscribeState(stateIds, false, this.onStateValueChange.bind(this))
	}

	private async onStateValueChange(id: string, obj: ioBroker.State | null | undefined): Promise<void> {
		const config = this._configAccessor()
		if (!obj || (config.ignoreNotAcknowledged && !obj.ack)) {
			return
		}

		this._logger.logTrace(`Received event for id ${id} -> Value: ${obj.val ?? 'N/A'}`)

		this._mutableState.getStates().set(id, obj)

		const feedbackIds = this._subscriptionState.getFeedbackInstanceIds(id)

		this.triggerFeedbackCheck(feedbackIds)
	}

	private triggerFeedbackCheck(feedbackIds: string[]): void {
		this._logger.logTrace(`Triggering feedback check for [${feedbackIds.join(', ')}]`)

		if (this.feedbackCheckCb) {
			this.feedbackCheckCb(feedbackIds)
		}
	}

	/**
	 * Unsubscribes the underlying websocket client from all states
	 */
	public unsubscribeAll(): void {
		if (!this.ensureClient(this.client)) {
			return
		}

		const toUnsubscribe = this.getSubscribedIds()
		this._logger.logDebug(`Unsubscribing from ${toUnsubscribe.length} iob entities.`)
		this.client.unsubscribeState(toUnsubscribe)
	}

	/**
	 * Retrieves a list of currently subscribed state identifiers (fully-qualified ioBroker ids)
	 */
	public getSubscribedIds(): string[] {
		return this.subscribedEntityIds ?? []
	}

	/**
	 * Sets the callback to trigger a feedback check by feedbackId
	 * @param cb - The callback to invoke. Usually provided by the module instance
	 * @remarks
	 * This function is required to break the dependency cycle where the module instance would resolve this ws client,
	 * but the ws client would have a dependency on the module if resolved via dependency injection.
	 * It's a bit of a hack... but good enough.
	 */
	public setFeedbackCheckCb(cb: (feedbackIds: string[]) => void): void {
		this.feedbackCheckCb = cb
	}

	private ensureClient(client: Connection | null): client is Connection {
		return client !== null && client.isConnected()
	}

	/**
	 * Disconnects the underlying websocket client and unsubscribes from all states.
	 * @param updateStatus - A delegate to update the companion module {@link InstanceStatus}
	 */
	public async disconnectAsync(updateStatus: (status: InstanceStatus, msg?: string) => void): Promise<void> {
		if (!this.client || !this.connected) {
			return
		}

		updateStatus(InstanceStatus.Disconnected)

		try {
			if (!!this.subscribedEntityIds && this.subscribedEntityIds.length > 0) {
				this._logger.logDebug(`Unsubscribing from ${this.subscribedEntityIds.length} iob entities.`)
				this.client.unsubscribeState(this.subscribedEntityIds)
			}
		} catch (_err) {
			// Ignored
		}

		this.client = null
		this.connected = false
	}

	/* 
		### IMPLEMENTATION OF IioBrokerClient ###
		To be consumed by IDeviceHandler instances (or the like). 
	*/
	/** {@inheritDoc IioBrokerClient.getObject} */
	public async getObject(iobId: string): Promise<ioBroker.Object | null> {
		if (!this.ensureClient(this.client)) {
			return null
		}

		const res = await this.client.getObject(iobId)
		if (typeof res === 'undefined') {
			return null
		}

		return res
	}

	/** {@inheritDoc IioBrokerClient.setState} */
	public async setState(iobId: string, val: ioBroker.StateValue): Promise<void> {
		if (!this.ensureClient(this.client)) {
			return
		}

		return this.client.setState(iobId, val)
	}

	/** {@inheritDoc IioBrokerClient.sendMessage} */
	public async sendMessage(instance: string, command: string, data?: unknown): Promise<void> {
		if (!this.ensureClient(this.client)) {
			return
		}

		const startMs = Date.now()
		this._logger.logDebug(`Invoking command ${instance}::${command}.`)
		await this.client.sendTo(instance, command, data)
		this._logger.logInfo(`Finished command ${instance}::${command} in ${Date.now() - startMs}ms.`)
	}

	/** {@inheritDoc IioBrokerClient.toggleState} */
	public async toggleState(iobId: string): Promise<void> {
		this._logger.logDebug(`Toggling state ${iobId}.`)

		if (!this.ensureClient(this.client)) {
			return
		}

		const isBoolState = (state: ioBroker.Object | null | undefined): boolean => {
			return !!state && state.common.type === 'boolean'
		}

		const oldState = await this.client.getObject(iobId)

		if (!isBoolState(oldState)) {
			return
		}

		const oldVal = await this.client.getState(iobId)

		if (!oldVal || (oldVal.val !== true && oldVal.val !== false)) {
			return
		}

		const newVal = !oldVal.val
		await this.client.setState(iobId, newVal)
	}
}

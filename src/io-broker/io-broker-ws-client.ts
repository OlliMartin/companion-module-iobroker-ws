import { InstanceStatus } from '@companion-module/base'
import { Connection } from '@iobroker/socket-client-backend'
import { inject, injectable } from 'tsyringe'

import { ILogger, IMutableState, IioBrokerClient, ISubscriptionState } from '../types.js'
import { DiTokens } from '../dependency-injection/tokens.js'
import { ModuleConfig } from '../config.js'
// import { setColorDeviceAgnostic } from '../type-handlers/color-handler.js'
import { isValidIobObject } from '../utils.js'
import { FeedbackType } from '../feedback-type.js'

import { setTimeout as delay } from 'node:timers/promises'

@injectable()
export class IoBrokerWsClient implements IioBrokerClient {
	private client: Connection | null = null
	private connectPromise: Promise<boolean> | null = null
	private feedbackCheckCb: ((...feedbackIds: FeedbackType[]) => void) | null = null

	private subscribedEntityIds: string[] | null = null

	private connected: boolean = false

	public constructor(
		@inject(DiTokens.Logger) private readonly _logger: ILogger,
		@inject(DiTokens.ModuleConfigurationAccessor) private readonly _configAccessor: () => ModuleConfig,
		@inject(DiTokens.MutableState) private readonly _mutableState: IMutableState,
		@inject(DiTokens.SubscriptionState) private readonly _subscriptionState: ISubscriptionState,
	) {}

	public async connectAsync(
		updateStatus: (status: InstanceStatus, msg?: string) => void,
		forceReconnect?: boolean,
	): Promise<IoBrokerWsClient> {
		await this.tryConnectAsync(updateStatus, forceReconnect)
		return this
	}

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

	public async setState(iobId: string, val: ioBroker.StateValue): Promise<void> {
		if (!this.ensureClient(this.client)) {
			return
		}

		return this.client.setState(iobId, val)
	}

	public async sendMessage(instance: string, command: string, data?: unknown): Promise<void> {
		if (!this.ensureClient(this.client)) {
			return
		}

		const startMs = Date.now()
		this._logger.logDebug(`Invoking command ${instance}::${command}.`)
		await this.client.sendTo(instance, command, data)
		this._logger.logInfo(`Finished command ${instance}::${command} in ${Date.now() - startMs}ms.`)
	}

	public async subscribeStates(stateIds: string[]): Promise<void> {
		if (!this.ensureClient(this.client)) {
			this._logger.logWarning('Tried to subscribe to states, but client is not set or connected.')
			return Promise.resolve()
		}

		this._logger.logInfo(`Subscribing to ${stateIds.length} states.`)
		this.subscribedEntityIds = stateIds

		await this.client.subscribeState(stateIds, false, this.onStateValueChange.bind(this))
	}

	async onStateValueChange(id: string, obj: ioBroker.State | null | undefined): Promise<void> {
		const config = this._configAccessor()
		if (!obj || (config.ignoreNotAcknowledged && !obj.ack)) {
			return
		}

		this._logger.logTrace(`Received event for id ${id} -> Value: ${obj.val ?? 'N/A'}`)

		this._mutableState.getStates().set(id, obj)

		const feedbackIds = this._subscriptionState.getFeedbackInstanceIds(id)

		this.triggerFeedbackCheck(...feedbackIds)
	}

	private triggerFeedbackCheck(...feedbackIds: string[]): void {
		this.feedbackCheckCb?.call(feedbackIds)
	}

	public unsubscribeAll(): void {
		if (!this.ensureClient(this.client)) {
			return
		}

		const toUnsubscribe = this.getSubscribedIds()
		this._logger.logDebug(`Unsubscribing from ${toUnsubscribe.length} iob entities.`)
		this.client.unsubscribeState(toUnsubscribe)
	}

	public getSubscribedIds(): string[] {
		return this.subscribedEntityIds ?? []
	}

	public setFeedbackCheckCb(cb: (...feedbackIds: FeedbackType[]) => void): void {
		this.feedbackCheckCb = cb
	}

	private ensureClient(client: Connection | null): client is Connection {
		return client !== null && client.isConnected()
	}

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
}

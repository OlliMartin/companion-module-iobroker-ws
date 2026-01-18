import { Types } from '@iobroker/type-detector'
import {
	CompanionActionDefinitions,
	CompanionFeedbackDefinitions,
	CompanionFeedbackInfo,
	LogLevel,
} from '@companion-module/base'
import { DetectorState } from '@iobroker/type-detector'
import { FeedbackType } from './feedback-type.js'

export type StateInfo = {
	definition: DetectorState
	value: ioBroker.State
}

export interface IDeviceHandler {
	/**
	 * Gets the name of the {@link IDeviceHandler}
	 * @remarks
	 * Used only for log messages.
	 */
	getName(): string

	/**
	 * Retrieves the handled ioBroker types of the {@link IDeviceHandler}
	 * @remarks
	 * The types are calculated utilizing the ioBroker type-detector package
	 */
	getHandledTypes(): Types[]

	/**
	 * Gets the {@link CompanionActionDefinitions} for the specific {@link IDeviceHandler}
	 */
	getActionDefinitions(): CompanionActionDefinitions

	/**
	 * Gets the {@link CompanionFeedbackDefinitions} for the specific {@link IDeviceHandler}
	 */
	getFeedbackDefinitions(): CompanionFeedbackDefinitions
}

export interface ILogger {
	/**
	 * Logs the specified message on the specified log level
	 * @param level - The log level to use
	 * @param message - The message to log
	 */
	log: (level: LogLevel, message: string) => void

	/**
	 * Logs a trace message
	 * @param message - The message to log
	 */
	logTrace: (message: string) => void

	/**
	 * Logs a debug message
	 * @param message - The message to log
	 */
	logDebug: (message: string) => void

	/**
	 * Logs an informational message
	 * @param message - The message to log
	 */
	logInfo: (message: string) => void

	/**
	 * Logs a warning message
	 * @param message - The message to log
	 */
	logWarning: (message: string) => void

	/**
	 * Logs an error message
	 * @param message - The message to log
	 */
	logError: (message: string) => void

	/**
	 * Callback to be invoked on module configuration change
	 */
	configUpdated(): void
}

export interface ISubscriptionState {
	/**
	 * Retrieves all feedback instance ids for the given ioBroker entity.
	 * @param entityId - The state or device entity id
	 * @remarks
	 * This is used by the ioBroker ws client to determine which feedbacks to update based on a state change
	 */
	getFeedbackInstanceIds(entityId: string): string[]

	/**
	 * Retrieves all subscribed entity ids. This can be states or mapped devices, i.e. complete state trees (in the case of complex devices)
	 * @remarks
	 * Used by the {@link ISubscriptionManager} to check if the {@link IoBrokerWsClient} subscriptions must be adjusted.
	 */
	getEntityIds(): string[]

	/**
	 * Gets all feedbacks for a given entity id.
	 * @param entityId - The state or device entity id
	 */
	get(entityId: string): Map<string, FeedbackType> | undefined

	/**
	 * Creates a new feedback map to track feedback subscriptions.
	 * @param entityId - The state or device entity id
	 * @param entries - The initial list of feedbacks.
	 */
	set(entityId: string, entries: Map<string, FeedbackType>): void
}

export interface ISubscriptionManager {
	/**
	 * Creates a callback function for feedback definitions that updates the feedback subscriptions on configuration change.
	 * @param callbackFn - The actual callback for the feedback to be wrapped
	 */
	makeFeedbackCallback<TIn extends CompanionFeedbackInfo, TOut>(
		callbackFn: (feedback: TIn) => TOut,
	): (feedback: TIn) => TOut

	/**
	 * Creates a callback function for feedback definitions that updates the feedback subscriptions on configuration change.
	 * @param callbackFn - The actual callback for the feedback to be wrapped
	 * @remarks
	 * This function is intended to be used by complex {@link IDeviceHandler}s.
	 * It will subscribe to all detected sub-states of the given entity.
	 *
	 * It is mandatory that the {@link CompanionFeedbackInfo} defines the referenced device exactly as `channel_id`.
	 */
	makeDeviceFeedbackCallback<TIn extends CompanionFeedbackInfo, TOut>(
		callbackFn: (feedback: TIn) => TOut,
	): (feedback: TIn) => TOut

	/**
	 * Registers the entity, feedbackId and feedbackType tuple in the {@link ISubscriptionState}.
	 * @param entityId - The state or device entity id
	 * @param feedbackId - The (companion managed) feedback id
	 * @param feedbackType - The type of the feedback. Refer to: {@link FeedbackType}
	 */
	subscribe(entityId: string, feedbackId: string, feedbackType: FeedbackType): void
}

export interface IEntityState {
	/**
	 * Retrieves all local ioBroker object metadata
	 * @remarks
	 * The data originates from the {@link IoBrokerWsClient} and is refreshed on load/configuration update
	 */
	getObjects(): ioBroker.Object[]

	/**
	 * Retrieves all loaded states that are currently subscribed to, i.e. used by feedbacks.
	 * @remarks
	 * The data originates from the {@link IoBrokerWsClient} and is refreshed on load/configuration update
	 */
	getStates(): Map<string, ioBroker.State>
}

export interface IMutableState extends IEntityState {
	/**
	 * Replaces all object metadata in the state
	 * @param objectDetails - The new (full list) of object metadata
	 */
	setObjects(objectDetails: ioBroker.Object[]): void

	/**
	 * Replaces all ioBroker state values
	 * @param states - The new (full list) of state values and respective metadata like timestamp
	 */
	setStates(states: Map<string, ioBroker.State>): void

	/**
	 * Clears both the cached objects and states.
	 */
	clear(): void
}

export interface IActionConfiguration {
	/**
	 * Collects all {@link CompanionActionDefinitions} from the registered {@link IDeviceHandler} instances.
	 * @param cb - The callback function to invoke after gathering the action definitions
	 * @remarks
	 * If the user enabled 'development mode' in the module configuration, the actions are appended with dev-tools,
	 * like simulating state updates through messaging.
	 *
	 * The approach/architecture to collect action definitions across different device types is detailed in the technical documentation.
	 * Please refer to the `README.md` in the root of the git repository.
	 */
	updateActions(cb: (actions: CompanionActionDefinitions) => void): void
}

export interface IFeedbackConfiguration {
	/**
	 * Collects all {@link CompanionFeedbackDefinitions} from the registered {@link IDeviceHandler} instances.
	 * @param cb - The callback function to invoke after gathering the feedback definitions
	 * @remarks
	 * The approach/architecture to collect feedback definitions across different device types is detailed in the technical documentation.
	 * Please refer to the `README.md` in the root of the git repository.
	 */
	updateFeedbacks(cb: (feedbacks: CompanionFeedbackDefinitions) => void): void
}

export interface IioBrokerClient {
	/**
	 * Retrieves the _current_ object metadata from the remote ioBroker server
	 * @param iobId - The fully qualified ioBroker object id
	 */
	getObject(iobId: string): Promise<ioBroker.Object | null>

	/**
	 * Sets the state of the given ioBroker state on the remote ioBroker server
	 * @param iobId - The fully qualified ioBroker object id
	 * @param val - The value to set
	 * @remarks
	 * All updates to states on the remote server are _not_ acknowledged.
	 */
	setState(iobId: string, val: ioBroker.StateValue): Promise<void>

	/**
	 * Sends a message to the given instance with the provided command and data.
	 * @param instance - The instance of the target adapter
	 * @param command - The command to send
	 * @param data - Optional. The json-serializable data to send
	 * @remarks
	 * Please ensure that any data passed to this function is json-serializable, otherwise the behaviour is undefined/not supported.
	 */
	sendMessage(instance: string, command: string, data?: unknown): Promise<void>

	/**
	 * Toggles a boolean state on ioBroker. I.e., sets it to `true` if the current value is `false` and vice-versa.
	 * @param iobId - The fully qualified ioBroker object id
	 * @remarks
	 * This function reads the current state from the remote ioBroker server and _does not_ rely on the cached state within the module.
	 *
	 * Additionally, it reads the metadata of the target object and verifies that
	 * * The object has type boolean
	 * * The object is writeable
	 *
	 * If any validation fails, no state update is triggered.
	 */
	toggleState(iobId: string): Promise<void>
}

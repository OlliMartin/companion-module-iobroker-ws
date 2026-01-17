import { Types } from '@iobroker/type-detector'
import {
	CompanionActionDefinitions,
	CompanionFeedbackDefinitions,
	CompanionFeedbackInfo,
	LogLevel,
} from '@companion-module/base'
import { DetectorState } from '@iobroker/type-detector'
import { FeedbackId } from './feedback.js'

export type StateInfo = {
	definition: DetectorState
	value: ioBroker.State
}

export interface IDeviceHandler {
	getHandledTypes(): Types[]

	getActionDefinitions(): CompanionActionDefinitions
	getFeedbackDefinitions(): CompanionFeedbackDefinitions
}

export interface ILogger {
	log: (level: LogLevel, message: string) => void

	logTrace: (message: string) => void
	logDebug: (message: string) => void
	logInfo: (message: string) => void
	logWarning: (message: string) => void
	logError: (message: string) => void
}

export interface ISubscriptionState {
	getFeedbackInstanceIds(entityId: string): string[]
	getEntityIds(): string[]
	get(entityId: string): Map<string, FeedbackId>
	set(entityId: string, entries: Map<string, FeedbackId>): void
	clear(): void
}

export interface ISubscriptionManager {
	makeFeedbackCallback<TIn extends CompanionFeedbackInfo, TOut>(
		callbackFn: (feedback: TIn) => TOut,
	): (feedback: TIn) => TOut

	makeDeviceFeedbackCallback<TIn extends CompanionFeedbackInfo, TOut>(
		callbackFn: (feedback: TIn) => TOut,
	): (feedback: TIn) => TOut

	subscribe(entityId: string, feedbackId: string, feedbackType: FeedbackId): void
}

export interface IEntityState {
	getObjects(): ioBroker.Object[]
	getStates(): Map<string, ioBroker.State>
}

export interface IMutableState extends IEntityState {
	setObjects(objectDetails: ioBroker.Object[]): void
	setStates(states: Map<string, ioBroker.State>): void

	clear(): void
}

export interface IActionConfiguration {
	updateActions(cb: (actions: CompanionActionDefinitions) => void): void
}

export interface IFeedbackConfiguration {
	updateFeedbacks(cb: (actions: CompanionFeedbackDefinitions) => void): void
}

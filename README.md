# companion-module-iobroker-ws

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE)

## Getting started

Executing a `yarn` command should perform all necessary steps to develop the module, if it does not then follow the steps below.

The module can be built once with `yarn build`. This should be enough to get the module to be loadable by companion.

While developing the module, by using `yarn dev` the compiler will be run in watch mode to recompile the files on change.

## Architecture

> The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and
> "OPTIONAL" in this document are to be interpreted as described in
> [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

This section gives an overview of the module architecture.

The main goal is to build an easily extensible framework, where handling different _ioBroker device types_ becomes trivial;
Essentially just writing a class that extends from [`IDeviceHandler`](./src/types.ts) and registering it in the [DI Container](https://github.com/microsoft/tsyringe).

The `IDeviceHandler` MUST provide sufficient information to register actions and feedbacks, as well as executing the callbacks.

> **IMPORTANT:** It is _crucial_ that the existing companion module file-layout rules are still followed and the code MUST be easy to review.
> That means, that the files `feedbacks.ts` and `actions.ts` remain in place and handle the registration logic.
> If they are delegating to the respective device handlers documentation MUST be added to provide a clear and concise description
> of what is happening, how it is achieved and why the development decision was taken. This document MAY be referenced in the code.

By requiring the `IDeviceHandler` to be able to execute callbacks, a reference to the `ioBroker.ws` websockets client is required.
The handlers themselves MUST NOT be responsible to keep track of the state; Their job is to provide information about
_which states should be subscribed to_. In contrast, it IS their responsibility to map values between the two ecosystems.

As an example, a `LightDeviceHandler` MUST be able to transform `RGB` color values into their respective Companion representation.

```mermaid
classDiagram

class IDeviceHandler {
<<interface>>
getHandledTypes() TypeDetector.Types[]
getActionDefinitions() CompanionActionDefinitions
getFeedbackDefinitions() CompanionFeedbackDefinitions
}

class DeviceClassifier {
getTypesByDevice() Record~string, TypeDetector.Types~
}

class SubscriptionState {
<<Singleton>>
get(entityId: string) Map~string, FeedbackType~
set(entityId, entries: Map~string, FeedbackType~)

    getEntityIds() string[]
    getFeedbackInstanceIds(entityId: string) string[]

}

class ActionConfiguration {
updateActions(setActionDefinitions: Action~CompanionActionDefinitions~)
}

class FeedbackConfiguration {
updateFeedbacks(setFeedbackDefinitions: Action~CompanionFeedbackDefinitions~)
}

class SubscriptionManager {
<<Singleton>>
subscribe(entityId: string, feedbackId: string, feedbackType: FeedbackType)

    makeFeedbackCallback(callbackFn: Func~TIn, TOut~)
    makeDeviceFeedbackCallback(callbackFn: Func~TIn, TOut~)

}

class IoBrokerState {
<<Singleton>>
getObjects() ioBroker.Object[]
getStates() Map<string, ioBroker.State>

    #setObjects(objectDetails: ioBroker.Object[])
    #setStates(states: Map<string, ioBroker.State>)

}

class IoBrokerWsClient {
<<Singleton>>

    - wsConnection: IoBrokerWS.Connection

    connectAsync() Promise~IoBrokerWsClient~
    disconnectAsync()

    subscribeStates(stateIds: string[])
    unsubscribeAll()

    getObject(iobId: string) ioBroker.Object
    setState(iobId: string, val: ioBroker.StateValue)
    sendMessage(instance: string, command: string, data?: unknown)

}

class MainModule {
<<Singleton>>
}

SubscriptionManager ..> SubscriptionState : Stores Subscriptions
SubscriptionManager ..> IoBrokerWsClient : Registers Subscriptions

IoBrokerWsClient ..> IoBrokerState : Updates<br/>(On Value Change)
IoBrokerWsClient ..> SubscriptionState : Reads Subscription Info<br/>(Get Feedback to Trigger)

ActionConfiguration ..> IDeviceHandler : Resolves Device Handlers<br/>Registers Actions
FeedbackConfiguration ..> IDeviceHandler : Resolves Device Handlers<br/>Registers Feedbacks

MainModule ..> IoBrokerWsClient : Starts
MainModule ..> ActionConfiguration : Invokes<br/>(Action Registration)
MainModule ..> FeedbackConfiguration : Invokes<br/>(Feedback Registration)

IDeviceHandler ..> SubscriptionManager : Triggers Feedback Subscription
IDeviceHandler ..> IoBrokerState : Gets current value<br/>(On Feedback Callback)
IDeviceHandler ..> DeviceClassifier : Gets Devices of Type<br/>(For Action/Feedback Generation)
```

**Note:** The above class diagram does not give _exact_ type names in favor of brevity. It indicates which type is meant
by the short form of the respective NPM package. If no "namespace" is given, `@companion-module/base` is assumed.

Based on the `IDeviceHandler` it MUST be possible to write unit/integration tests that allow verifying that device types are not
handled multiple times. A nice to have is being able to test the individual handlers by abstracting from the underlying runtime,
i.e. companion itself.

It MUST be possible to extend the `IDeviceHandler` to create Presets over the handled ioBroker types. This is desired,
because generally speaking presets SHOULD rely only on actions defined over said types.

At least for debugging/development purposes it MUST be possible to enable/disable specific type handlers through the
companion configuration. A mechanism SHOULD be implemented that uses the DI container to discover all available type handlers
and present them in a multi-select style list.

Furthermore `IDeviceHandler` instances MUST NOT generate actions/feedbacks/presets if there are no matching devices available
on ioBroker site. If this requirement proves to be confusing for the end-user, a configuration switch SHOULD be added,
which allows to hide actions etc. in case they have no targe devices.

https://github.com/sindresorhus/emittery/blob/69193ca096fdebeb73bc860a2dbd64d8781c4970/index.js#L167-L176

The above code executes the `emit` method without any await. The way this library is currently implemented, this is no problem. But for my project I derived a class from emittery where I made an override of `emit` to yield the control back to the event loop. I did this to make every emit truely async and prevent any event from being executed synchronously. This might be a good feature for emittery too, but that is beside the point here. Here is my implementation:

```TS
    override async emit<Name extends DatalessEventNames<EventData>>(eventName: Name): Promise<void>;
    override async emit<Name extends keyof EventData>(eventName: Name, eventData: EventData[Name]): Promise<void>;
    override async emit(eventName: unknown, eventData?: unknown): Promise<void> {
        log.info('emit', eventName);
    }
```

This lead to a lot of errors from this line, because the `canEmitMetaEvents` flag is already reset again: https://github.com/sindresorhus/emittery/blob/69193ca096fdebeb73bc860a2dbd64d8781c4970/index.js#L351

This issue could be solved by using the suggested code in this comment: https://github.com/sindresorhus/emittery/issues/97#issuecomment-1129591450

> Yup. Or we can have a special function that emits the meta events on a given emitter instance. Something like this.
> 
> ```ts
> async function emitMetaEvent(emitter, event, data) {
>   metaEventsAllowed = true
>   await emitter.emit(event, data)
>   metaEventsAllowed = false
> }
> ```
> 
> The only benefit of this function over the callback approach is, we will not end up creating too many anonymous functions.
> 
> ```ts
> if (!isMetaEvent(eventName)) {
>   emitMetaEvent(this, listenerAdded, {eventName, listener})
> }
> ```

